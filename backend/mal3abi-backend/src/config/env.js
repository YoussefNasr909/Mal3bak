import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

function isValidUrlList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .every((item) => {
      try {
        new URL(item);
        return true;
      } catch {
        return false;
      }
    });
}

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.string().default("4000"),
  FRONTEND_URL: z
    .string()
    .min(1)
    .refine(isValidUrlList, "FRONTEND_URL must contain one or more valid URLs")
    .default("http://localhost:3000"),
  PUBLIC_FRONTEND_URL: z.string().url().optional(),
  CORS_ORIGIN: z
    .string()
    .min(1)
    .refine(isValidUrlList, "CORS_ORIGIN must contain one or more valid URLs")
    .optional(),
  CORS_ORIGINS: z
    .string()
    .min(1)
    .refine(isValidUrlList, "CORS_ORIGINS must contain one or more valid URLs")
    .optional(),
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(10),
  JWT_REFRESH_SECRET: z.string().min(10),
  JWT_EXPIRES_IN: z.string().default("1h"),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().optional(),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().optional(),
  WEB_PUSH_CONTACT_EMAIL: z.string().email().optional(),
  RATE_LIMIT_SKIP_IPS: z.string().optional(),
  TZ: z.string().default("Africa/Cairo"),
}).superRefine((value, ctx) => {
  const pushKeys = [
    value.WEB_PUSH_VAPID_PUBLIC_KEY,
    value.WEB_PUSH_VAPID_PRIVATE_KEY,
    value.WEB_PUSH_CONTACT_EMAIL,
  ].filter(Boolean);

  if (pushKeys.length > 0 && pushKeys.length < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, and WEB_PUSH_CONTACT_EMAIL must all be set together",
      path: ["WEB_PUSH_VAPID_PUBLIC_KEY"],
    });
  }
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error("❌ Invalid environment variables:", _env.error.format());
  process.exit(1);
}

export const env = _env.data;
