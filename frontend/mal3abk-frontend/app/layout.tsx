import type React from "react"
import type { Metadata, Viewport } from "next"
import localFont from "next/font/local"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { LanguageProvider, type Language } from "@/components/providers/language-provider"
import { AuthProvider } from "@/components/providers/auth-provider"
import { cookies, headers } from "next/headers"
import { validateConfig } from "@/lib/config"
import { ClientSideFeatures } from "@/components/providers/client-side-features"
import NextTopLoader from "nextjs-toploader"
import "./globals.css"

const _geist = localFont({
  src: "./fonts/geist-vf.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
})

const _ibmPlexArabic = localFont({
  src: [
    { path: "./fonts/ibm-plex-sans-arabic-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/ibm-plex-sans-arabic-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-ibm-arabic",
  display: "swap",
  preload: false,
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://mal3bk.com"
const apiPreconnectHref = (() => {
  const candidate = process.env.NEXT_PUBLIC_API_URL || ""
  return /^https?:\/\//i.test(candidate) ? new URL(candidate).origin : null
})()
const defaultTitle = "Mal3bk | ملعبك - احجز الملاعب الرياضية بسهولة في مصر"
const defaultDescription =
  "Mal3bk | ملعبك: احجز ملاعب كرة القدم والبادل والتنس في مصر بتوافر لحظي وتأكيد فوري. Book football, padel, and tennis courts across Egypt with live availability and instant confirmation."
const socialImage = "/mal3bk-logo-dark-header.webp"

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  title: defaultTitle,
  description: defaultDescription,
  generator: "Next.js",
  applicationName: "Mal3bk",
  category: "sports",
  keywords: [
    "sports court booking",
    "book football court egypt",
    "padel court booking egypt",
    "football",
    "padel",
    "tennis",
    "sports courts egypt",
    "ملاعب",
    "حجز ملاعب",
    "حجز ملعب",
    "حجز بادل",
    "ملعبك",
    "mal3bk",
  ],
  authors: [{ name: "Mal3bk Team" }],
  creator: "Mal3bk",
  publisher: "Mal3bk",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    title: defaultTitle,
    description: defaultDescription,
    url: siteUrl,
    siteName: "Mal3bk",
    images: [
      {
        url: socialImage,
        width: 1200,
        height: 630,
        alt: "Mal3bk sports court booking platform",
      },
    ],
    locale: "ar_EG",
    alternateLocale: ["en_US"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: defaultDescription,
    images: [socialImage],
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
    ],
    shortcut: "/favicon.ico",
    apple: [{ url: "/apple-icon.png", sizes: "192x192", type: "image/png" }],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0d47a1" },
    { media: "(prefers-color-scheme: dark)", color: "#151c27" },
  ],
  width: "device-width",
  initialScale: 1,
}

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Mal3bk",
  "alternateName": "ملعبك",
  "url": siteUrl,
  "logo": `${siteUrl}/icon.png`,
  "image": `${siteUrl}${socialImage}`,
  "description": defaultDescription,
  "sameAs": [
    "https://www.instagram.com/mal3bk.eg",
    "https://www.tiktok.com/@mal3bk.eg"
  ]
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  validateConfig()
  const headersList = await headers()
  const cookieStore = await cookies()
  const nonce = headersList.get("x-nonce") || undefined
  const cookieLanguage = cookieStore.get("mal3bk_language")?.value
  const initialLanguage: Language = cookieLanguage === "en" || cookieLanguage === "ar" ? cookieLanguage : "ar"
  const initialDirection = initialLanguage === "ar" ? "rtl" : "ltr"

  return (
    <html lang={initialLanguage} dir={initialDirection} suppressHydrationWarning className="h-full" data-nonce={nonce}>
      <head>
        {/* DNS prefetch for external resources */}
        <link rel="dns-prefetch" href="//res.cloudinary.com" />

        {/* Only preconnect when the API URL is absolute, and only to its origin */}
        {apiPreconnectHref ? <link rel="preconnect" href={apiPreconnectHref} crossOrigin="anonymous" /> : null}

        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body
        className={`${_geist.variable} ${_ibmPlexArabic.variable} font-sans antialiased min-h-dvh overflow-x-clip`}
      >
        <NextTopLoader color="#2563eb" showSpinner={false} shadow="0 0 10px #2563eb,0 0 5px #2563eb" />
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <LanguageProvider initialLanguage={initialLanguage}>
            <AuthProvider>
              {children}
              <ClientSideFeatures />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
