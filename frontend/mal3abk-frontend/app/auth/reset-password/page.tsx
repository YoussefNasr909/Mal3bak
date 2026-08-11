import type { Metadata } from "next"
import { Suspense } from "react"
import { redirect } from "next/navigation"
import { getServerSessionUser } from "@/lib/server-auth"
import { ResetPasswordContent } from "@/components/auth/reset-password-content"

export const metadata: Metadata = {
  title: "Reset Password",
  description: "Set a new Mal3bk password to securely restore access to your account.",
}

export default async function ResetPasswordPage() {
  const user = await getServerSessionUser()
  if (user) redirect(`/dashboard/${user.role}`)
  return (
    <Suspense fallback={null}>
      <ResetPasswordContent />
    </Suspense>
  )
}
