import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getServerSessionUser } from "@/lib/server-auth"
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

export default async function RegisterPage() {
  const user = await getServerSessionUser()
  if (user) redirect(`/dashboard/${user.role}`)
  return <RegisterForm />
}
