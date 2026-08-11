import type { Metadata } from "next"
import { ForgotPasswordContent } from "@/components/auth/forgot-password-content"

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your ملعبك password to regain access to your account",
  keywords: ["forgot password", "reset password", "password recovery"],
}

export default function ForgotPasswordPage() {
  return <ForgotPasswordContent />
}
