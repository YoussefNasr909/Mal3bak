import { fileURLToPath } from "node:url"
import { dirname as pathDirname } from "node:path"

const projectRoot = pathDirname(fileURLToPath(new URL(".", import.meta.url)))

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    optimizePackageImports: ["lucide-react", "date-fns", "date-fns-jalali"],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    formats: ["image/webp", "image/avif"],
    deviceSizes: [320, 640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 7,
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'none'; sandbox;",
    localPatterns: [
      // Allow query strings on any local image paths
      { pathname: "/**" },
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        pathname: "/**",
      },
    ],
  },
  compress: true,
  async headers() {
    const isDev = process.env.NODE_ENV !== "production"
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "geolocation=(), microphone=(), camera=()" },
    ]
    // Avoid HSTS on local HTTP — it can force HTTPS for localhost in the browser.
    if (!isDev) {
      securityHeaders.push({
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload",
      })
    }
    const dynamicPageHeaders = [
      { key: "Cache-Control", value: "private, no-store, no-cache, max-age=0, must-revalidate" },
    ]
    return [
      {
        source: "/auth/:path*",
        headers: dynamicPageHeaders,
      },
      {
        source: "/dashboard/:path*",
        headers: dynamicPageHeaders,
      },
      {
        source: "/book/:path*",
        headers: dynamicPageHeaders,
      },
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ]
  },
  async rewrites() {
    const isDev = process.env.NODE_ENV !== "production"
    if (isDev) {
      return [
        {
          source: "/api/v1/:path*",
          destination: "http://localhost:4000/api/v1/:path*",
        },
      ]
    }
    // Production: if you serve the app through Next without Nginx proxying /api/v1, set
    // BACKEND_PROXY_TARGET=http://127.0.0.1:4000 (same host as the API). Leave unset when
    // the reverse proxy forwards /api/v1 to Express (recommended with NEXT_PUBLIC_API_URL=/api/v1).
    const proxyTarget = (process.env.BACKEND_PROXY_TARGET || "").trim().replace(/\/+$/, "")
    if (!proxyTarget) return []
    return [
      {
        source: "/api/v1/:path*",
        destination: `${proxyTarget}/api/v1/:path*`,
      },
    ]
  },
  turbopack: {
    root: projectRoot,
  },
}

export default nextConfig
