import { ZodError } from "zod";

export function errorHandler(err, req, res, next) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      message: "Validation error",
      // Zod v3/v4 compatibility
      errors: err.issues || err.errors,
    });
  }

  // Prisma errors (unique constraints, not found, foreign keys ...)
  if (err && typeof err === "object" && typeof err.code === "string") {
    if (err.code === "P2002") {
      // Unique constraint failed
      const target = err?.meta?.target;
      const field = Array.isArray(target) ? target.join(",") : target;
      return res.status(409).json({
        message: field ? `Duplicate value for ${field}` : "Duplicate value",
      });
    }

    // ✅ NEW: Foreign key constraint failed
    if (err.code === "P2003") {
      const field_name = err?.meta?.field_name || "related record";
      return res.status(400).json({ 
        message: `Invalid reference: the provided ${field_name} does not exist.` 
      });
    }

    if (err.code === "P2025") {
      return res.status(404).json({ message: "Not found" });
    }
  }

  // CORS callback errors land here (no status set by default)
  if (typeof err?.message === "string" && err.message.startsWith("CORS blocked")) {
    return res.status(403).json({ message: err.message });
  }

  const status = err.status || err.statusCode || 500;
  const isProd = process.env.NODE_ENV === "production";

  // In production, never expose internal error details for 5xx errors.
  const message =
    status >= 500 && err?.expose !== true
      ? "Internal server error"
      : err.message || "Server error";

  return res.status(status).json({ message });
}
