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

  // Only auto-redirect if there is no explicit redirect parameter.
  // If ?redirect=... is present, the user was bounced from a protected route;
  // auto-redirecting back to it creates an infinite ping-pong loop.
  if (user && !resolvedSearchParams.redirect) {
    redirect(getDefaultDashboardPath(user.role))
  }

  return <LoginForm />
}
