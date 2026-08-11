import type { MetadataRoute } from "next"

function baseUrl() {
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.PUBLIC_FRONTEND_URL ||
    process.env.FRONTEND_URL
  const url = String(envUrl || "").trim().replace(/\/+$/, "")
  return url || "https://mal3bk.com"
}

export default function robots(): MetadataRoute.Robots {
  const origin = baseUrl()

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/auth/"],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  }
}
