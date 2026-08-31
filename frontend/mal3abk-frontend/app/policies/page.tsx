import type { Metadata } from "next"
import { PoliciesPageClient } from "@/components/legal/policies-page"

export const metadata: Metadata = {
  title: "Policies & Legal Terms | Mal3bk",
  description:
    "Review Mal3bk's Privacy Policy, Refund Policy, booking terms, and payment terms for sports court reservations across Egypt.",
  alternates: {
    canonical: "/policies",
  },
  openGraph: {
    title: "Policies & Legal Terms | Mal3bk",
    description:
      "Review Mal3bk's Privacy Policy, Refund Policy, booking terms, and payment terms for sports court reservations across Egypt.",
    url: "https://mal3bk.com/policies",
    siteName: "Mal3bk",
    type: "website",
  },
}

export default function PoliciesPage() {
  return <PoliciesPageClient />
}
