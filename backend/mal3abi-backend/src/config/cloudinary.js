import { v2 as cloudinary } from "cloudinary";

const REQUIRED_KEYS = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];

let configured = false;

/**
 * Configures the Cloudinary SDK on first use. Call from upload handlers only.
 * Avoids crashing the whole API at import time when Cloudinary is not needed (local dev, migrations).
 */
export function ensureCloudinaryConfigured() {
  if (configured) return;

  const missing = REQUIRED_KEYS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    const err = new Error(
      `Image uploads are not configured. Set ${missing.join(", ")} (Cloudinary).`,
    );
    err.status = 503;
    throw err;
  }

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  configured = true;
}

export default cloudinary;
