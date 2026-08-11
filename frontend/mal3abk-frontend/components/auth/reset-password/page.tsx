import type { Metadata } from "next"
import { ResetPasswordContent } from "@/components/auth/reset-password-content"

export const metadata: Metadata = {
  title: "Reset Password",
}

export default function ResetPasswordPage() {
  return <ResetPasswordContent />
}
