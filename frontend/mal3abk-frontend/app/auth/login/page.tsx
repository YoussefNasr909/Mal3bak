import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { LoginForm } from "@/components/auth/login-form"
import { getDefaultDashboardPath, sanitizeInternalRedirect } from "@/lib/auth-routing"
import { getServerSessionUser } from "@/lib/server-auth"

export const metadata: Metadata = {
  title: "Login",
  description:
    "Sign in to your Mal3bk account to manage reservations, explore courts, and continue your sports bookings.",
  keywords: ["login", "sign in", "sports booking", "Mal3bk", "ملعبك"],
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ redirect?: string }> | { redirect?: string }
}) {
  const resolvedSearchParams =
    searchParams && typeof (searchParams as Promise<{ redirect?: string }>).then === "function"
      ? await (searchParams as Promise<{ redirect?: string }>)
      : ((searchParams as { redirect?: string } | undefined) ?? {})

  const user = await getServerSessionUser()

  if (user) {
    redirect(sanitizeInternalRedirect(resolvedSearchParams.redirect, user.role, getDefaultDashboardPath(user.role)))
  }

  return <LoginForm />
}
