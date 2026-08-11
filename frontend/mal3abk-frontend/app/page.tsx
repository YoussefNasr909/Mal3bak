import type { Metadata } from "next"
import { LandingPage } from "@/components/landing/landing-page"

const homepageTitle = "Mal3bk | Book Sports Courts in Egypt"
const homepageDescription =
  "Reserve football, padel, tennis, and multi-sport courts across Egypt with live availability, instant confirmation, and a seamless experience for players and venue managers."

export const metadata: Metadata = {
  title: {
    absolute: homepageTitle,
  },
  description: homepageDescription,
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: homepageTitle,
    description: homepageDescription,
    url: "https://mal3bk.com",
    siteName: "Mal3bk",
    images: [
      {
        url: "/mal3bk-logo-dark-header.webp",
        width: 1200,
        height: 630,
        alt: "Mal3bk sports court booking platform",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: homepageTitle,
    description: homepageDescription,
    images: ["/mal3bk-logo-dark-header.webp"],
  },
}

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Mal3bk",
  alternateName: "ملعبك",
  url: "https://mal3bk.com",
  description: homepageDescription,
  inLanguage: ["ar", "en"],
}

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      <LandingPage />
    </>
  )
}
