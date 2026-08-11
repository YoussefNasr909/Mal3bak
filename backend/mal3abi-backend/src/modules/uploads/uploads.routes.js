import { Router } from "express";
import multer from "multer";
import streamifier from "streamifier";
import cloudinary, { ensureCloudinaryConfigured } from "../../config/cloudinary.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireRole } from "../../middleware/requireRole.js";
import {
  AVATAR_UPLOAD_RATE_LIMIT_CONFIG,
  IMAGE_UPLOAD_RATE_LIMIT_CONFIG,
  createRateLimiter,
} from "../../utils/rateLimit.js";
const router = Router();
const avatarUploadLimiter = createRateLimiter(AVATAR_UPLOAD_RATE_LIMIT_CONFIG);
const imageUploadLimiter = createRateLimiter(IMAGE_UPLOAD_RATE_LIMIT_CONFIG);

const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp"];

const imageFileFilter = (req, file, cb) => {
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only JPG, PNG, and WebP images are allowed."), false);
  }
};

const memoryStorage = multer.memoryStorage();

const uploadCourts = multer({
  storage: memoryStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
    files: 10,
  },
});

const uploadAvatar = multer({
  storage: memoryStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 1,
  },
});


function detectImageType(buffer) {
  if (!buffer || buffer.length < 12) return null;

  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (isJpeg) return "image/jpeg";

  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a;
  if (isPng) return "image/png";

  const isWebp =
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP";
  if (isWebp) return "image/webp";

  return null;
}

function assertValidUploadedImages(files) {
  for (const file of files || []) {
    const detectedMimeType = detectImageType(file.buffer);
    if (!detectedMimeType || !allowedMimeTypes.includes(detectedMimeType)) {
      const err = new Error("Uploaded file content must be a valid JPG, PNG, or WebP image.");
      err.status = 400;
      throw err;
    }
  }
}
function uploadBufferToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve(result);
    });

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}

function handleMulterError(err, res, maxSizeMb) {
  if (!err) return false;

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ message: `Each image must be ${maxSizeMb}MB or smaller.` });
      return true;
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      res.status(400).json({ message: "Too many files uploaded." });
      return true;
    }

    res.status(400).json({ message: err.message });
    return true;
  }

  res.status(400).json({ message: err.message || "Upload failed." });
  return true;
}

// POST /api/v1/uploads/images
router.post("/images", requireAuth, imageUploadLimiter, requireRole("admin", "manager"), (req, res) => {
  try {
    ensureCloudinaryConfigured();
  } catch (e) {
    const status = e.status || 503;
    return res.status(status).json({ message: e.message || "Upload service unavailable." });
  }

  uploadCourts.array("files", 10)(req, res, async (err) => {
    if (handleMulterError(err, res, 10)) return;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "No files uploaded." });
    }

    try {
      assertValidUploadedImages(req.files);
      const results = await Promise.all(
        req.files.map((file) =>
          uploadBufferToCloudinary(file.buffer, {
            folder: "mal3aby/courts",
            resource_type: "image",
            format: "webp",
            transformation: [
              { width: 1920, height: 1440, crop: "limit" },
              { quality: "auto" },
            ],
          })
        )
      );

      return res.status(201).json({
        urls: results.map((result) => result.secure_url),
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message || "Failed to upload images to Cloudinary.",
      });
    }
  });
});

// POST /api/v1/uploads/avatar
router.post("/avatar", requireAuth, avatarUploadLimiter, (req, res) => {
  try {
    ensureCloudinaryConfigured();
  } catch (e) {
    const status = e.status || 503;
    return res.status(status).json({ message: e.message || "Upload service unavailable." });
  }

  uploadAvatar.single("file")(req, res, async (err) => {
    if (handleMulterError(err, res, 5)) return;

    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded." });
    }

    try {
      assertValidUploadedImages([req.file]);
      const result = await uploadBufferToCloudinary(req.file.buffer, {
        folder: "mal3aby/avatars",
        resource_type: "image",
        format: "webp",
        transformation: [
          { width: 500, height: 500, crop: "fill", gravity: "face" },
          { quality: "auto" },
        ],
      });

      return res.status(201).json({
        url: result.secure_url,
      });
    } catch (error) {
      return res.status(error.status || 500).json({
        message: error.message || "Failed to upload avatar to Cloudinary.",
      });
    }
  });
});

export default router;
