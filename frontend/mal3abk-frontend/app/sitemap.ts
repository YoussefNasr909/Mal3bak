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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = baseUrl()

  const urls: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: new Date(), changeFrequency: "weekly", priority: 1.0 },
  ]

  return urls
}
