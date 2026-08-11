import nodemailer from "nodemailer";

let cachedTransporter = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          }
        : undefined,
  });

  return cachedTransporter;
}

export function isEmailDeliveryConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.MAIL_FROM
  );
}

export async function sendPasswordResetEmail({ to, name, resetUrl, expiresAt }) {
  const transporter = getTransporter();

  const displayName = name?.trim() || "there";
  const expiresText = expiresAt instanceof Date ? expiresAt.toISOString() : String(expiresAt);

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: "Mal3aby password reset",
    text: [
      `Hello ${displayName},`,
      "",
      "We received a request to reset your password.",
      `Use this link to continue: ${resetUrl}`,
      `This link expires at: ${expiresText}`,
      "",
      "If you did not request this, you can ignore this email.",
    ].join("\n"),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <p>Hello ${displayName},</p>
        <p>We received a request to reset your password.</p>
        <p>
          <a href="${resetUrl}" style="display:inline-block;padding:10px 16px;background:#111827;color:#ffffff;text-decoration:none;border-radius:6px;">
            Reset password
          </a>
        </p>
        <p>If the button does not work, copy this URL:</p>
        <p><a href="${resetUrl}">${resetUrl}</a></p>
        <p>This link expires at: <strong>${expiresText}</strong></p>
        <p>If you did not request this, you can ignore this email.</p>
      </div>
    `,
  });
}