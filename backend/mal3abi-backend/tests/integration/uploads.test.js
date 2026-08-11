import { Writable } from "node:stream";
import request from "supertest";
import { app } from "../../src/app.js";
import cloudinary from "../../src/config/cloudinary.js";
import {
  ORIGIN,
  seedManagerWith24hCourt,
  seedPlayer,
} from "../helpers/integration-fixtures.js";

const tinyPng = Buffer.from(
  "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000D49444154789C636000000200018D0D0A2DB40000000049454E44AE426082",
  "hex",
);

const originalEnv = {
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
};

const originalUploadStream = cloudinary.uploader.upload_stream;

function enableCloudinaryMock(urls) {
  process.env.CLOUDINARY_CLOUD_NAME = "demo";
  process.env.CLOUDINARY_API_KEY = "demo-key";
  process.env.CLOUDINARY_API_SECRET = "demo-secret";

  let index = 0;
  cloudinary.uploader.upload_stream = (_options, callback) => new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
    final(done) {
      const safeIndex = Math.min(index, urls.length - 1);
      callback(null, { secure_url: urls[safeIndex] });
      index += 1;
      done();
    },
  });
}

afterEach(() => {
  process.env.CLOUDINARY_CLOUD_NAME = originalEnv.cloudName;
  process.env.CLOUDINARY_API_KEY = originalEnv.apiKey;
  process.env.CLOUDINARY_API_SECRET = originalEnv.apiSecret;
  cloudinary.uploader.upload_stream = originalUploadStream;
});

describe("Uploads flow", () => {
  it("allows an authenticated player to upload an avatar image", async () => {
    const player = await seedPlayer(app);
    enableCloudinaryMock(["https://cdn.example.com/avatar.webp"]);

    const res = await request(app)
      .post("/api/v1/uploads/avatar")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .attach("file", tinyPng, { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.url).toBe("https://cdn.example.com/avatar.webp");
  });

  it("rejects avatar uploads when the file content is not a real image", async () => {
    const player = await seedPlayer(app);
    process.env.CLOUDINARY_CLOUD_NAME = "demo";
    process.env.CLOUDINARY_API_KEY = "demo-key";
    process.env.CLOUDINARY_API_SECRET = "demo-secret";

    const res = await request(app)
      .post("/api/v1/uploads/avatar")
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .attach("file", Buffer.from("not a real image"), { filename: "avatar.png", contentType: "image/png" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/valid JPG, PNG, or WebP image/i);
  });

  it("allows a manager to upload multiple court images", async () => {
    const manager = await seedManagerWith24hCourt(app);
    enableCloudinaryMock([
      "https://cdn.example.com/courts/one.webp",
      "https://cdn.example.com/courts/two.webp",
    ]);

    const res = await request(app)
      .post("/api/v1/uploads/images")
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .attach("files", tinyPng, { filename: "court-1.png", contentType: "image/png" })
      .attach("files", tinyPng, { filename: "court-2.png", contentType: "image/png" });

    expect(res.status).toBe(201);
    expect(res.body.urls).toEqual([
      "https://cdn.example.com/courts/one.webp",
      "https://cdn.example.com/courts/two.webp",
    ]);
  });
});
