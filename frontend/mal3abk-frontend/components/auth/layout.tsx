import type { Metadata } from "next"
import type React from "react"

export const metadata: Metadata = {
  title: {
    default: "Account | Mal3bk",
    template: "%s | Mal3bk",
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
