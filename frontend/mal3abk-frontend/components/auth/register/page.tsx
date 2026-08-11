import type { Metadata } from "next"
import { RegisterForm } from "@/components/auth/register-form"

export const metadata: Metadata = {
  title: "Register",
  description:
    "Create a new Mal3bk account to start booking sports courts and managing your sessions with ease.",
  keywords: [
    "register",
    "sign up",
    "create account",
    "sports booking",
    "Mal3bk",
  ],
}

export default function RegisterPage() {
  return <RegisterForm />
}
