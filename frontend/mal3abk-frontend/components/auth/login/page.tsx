import type { Metadata } from "next"
import { LoginForm } from "@/components/auth/login-form"

export const metadata: Metadata = {
  title: "Login",
  description:
    "Sign in to your Mal3bk account to manage reservations, explore courts, and continue your sports bookings.",
  keywords: ["login", "sign in", "sports booking", "Mal3bk", "ملعبك"],
}

export default function LoginPage() {
  return <LoginForm />
}
