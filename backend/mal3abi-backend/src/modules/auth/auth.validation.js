import { z } from "zod";
import { isValidPhoneDigits, normalizePhone } from "../../utils/phone.js";

// Must stay in sync with frontend lib/password-validation.ts
// Minimum: 8 chars, 1 uppercase, 1 lowercase, 1 digit
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .refine((p) => /[A-Z]/.test(p), {
    message: "Password must contain at least one uppercase letter",
  })
  .refine((p) => /[a-z]/.test(p), {
    message: "Password must contain at least one lowercase letter",
  })
  .refine((p) => /[0-9]/.test(p), {
    message: "Password must contain at least one number",
  });

const localDevAvatarHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export function isAllowedAvatarUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol === "https:") return true;

    return (
      process.env.NODE_ENV !== "production" &&
      parsed.protocol === "http:" &&
      localDevAvatarHosts.has(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export const avatarUrlSchema = z
  .string()
  .url("Avatar must be a valid URL")
  .refine((value) => isAllowedAvatarUrl(value), {
    message: "Avatar URL must use HTTPS (or localhost over HTTP in development)",
  });

const trimmedNameSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(2, "Name must be at least 2 characters"),
);

const normalizedEmailSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
  z.string().email("Invalid email address"),
);

const registerPhoneSchema = z
  .string()
  .transform((s) => normalizePhone(s))
  .refine((d) => isValidPhoneDigits(d), {
    message: "Invalid phone number (10-15 digits)",
  });

export const registerSchema = z
  .object({
    name: trimmedNameSchema,
    email: normalizedEmailSchema,
    phone: registerPhoneSchema,
    password: passwordSchema,
  })
  .strict();

export const loginSchema = z
  .object({
    email: normalizedEmailSchema,
    password: z.string().min(1),
    remember: z.boolean().optional(),
  })
  .strict();

export const updateProfileSchema = z
  .object({
    name: trimmedNameSchema.optional(),
    email: normalizedEmailSchema.optional(),
    phone: z.union([z.string(), z.null()]).optional(),
    avatar: avatarUrlSchema.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required",
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
  })
  .strict();

export const forgotPasswordSchema = z
  .object({
    email: normalizedEmailSchema,
  })
  .strict();

export const resetPasswordSchema = z
  .object({
    userId: z.string().uuid(),
    token: z.string().min(10),
    newPassword: passwordSchema,
  })
  .strict();

