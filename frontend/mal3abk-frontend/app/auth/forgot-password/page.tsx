import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerSessionUser } from "@/lib/server-auth"
import { ForgotPasswordContent } from "@/components/auth/forgot-password-content"

export const metadata: Metadata = {
  title: "Forgot Password",
  description: "Reset your Mal3bk password to regain access to your account",
  keywords: ["forgot password", "reset password", "password recovery"],
}

export default async function ForgotPasswordPage() {
  const user = await getServerSessionUser()
  if (user) redirect(`/dashboard/${user.role}`)
  return <ForgotPasswordContent />
}
