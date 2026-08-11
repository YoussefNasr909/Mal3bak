import { render, screen } from "@testing-library/react"
import { Children, isValidElement } from "react"
import type { ReactElement, ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  validateConfig: vi.fn(),
  headers: vi.fn(),
  cookies: vi.fn(),
}))

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "mock-font-variable" }),
}))

vi.mock("next/headers", () => ({
  headers: mocks.headers,
  cookies: mocks.cookies,
}))

vi.mock("@/lib/config", () => ({
  validateConfig: mocks.validateConfig,
}))

vi.mock("@/components/providers/theme-provider", () => ({
  ThemeProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="theme-provider">{children}</div>
  ),
}))

vi.mock("@/components/providers/language-provider", () => ({
  LanguageProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="language-provider">{children}</div>
  ),
  useLanguage: () => ({ language: "en", direction: "ltr", setLanguage: vi.fn(), t: (k: string) => k }),
}))

vi.mock("@/components/providers/auth-provider", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
  useAuth: () => ({ user: null }),
}))

vi.mock("@/components/providers/client-side-features", () => ({
  ClientSideFeatures: () => <div data-testid="client-side-features">Client Features</div>,
}))

import manifest from "@/app/manifest"
import robots from "@/app/robots"
import sitemap from "@/app/sitemap"

const originalEnv = { ...process.env }

async function loadRootLayoutModule() {
  vi.resetModules()
  return import("@/app/layout")
}

function asElement(value: unknown) {
  return value as ReactElement<{ children?: ReactNode; [key: string]: unknown }>
}

describe("root layout and metadata routes", () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    mocks.validateConfig.mockReset()
    mocks.headers.mockReset()
    mocks.cookies.mockReset()
    mocks.headers.mockResolvedValue(new Headers([["x-nonce", "nonce-123"]]))
    mocks.cookies.mockResolvedValue({
      get: vi.fn(() => undefined),
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.restoreAllMocks()
  })

  it("renders the root layout tree with providers, metadata, and a preconnect link", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com"
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com/api/v1"

    const { default: RootLayout, metadata, viewport } = await loadRootLayoutModule()
    const tree = await RootLayout({ children: <div>Root Child</div> })

    expect(mocks.validateConfig).toHaveBeenCalledTimes(1)
    expect(metadata.metadataBase?.toString()).toBe("https://app.example.com/")
    expect(metadata.manifest).toBe("/manifest.webmanifest")
    expect(viewport.width).toBe("device-width")
    expect(viewport.themeColor).toHaveLength(2)
    expect(tree.type).toBe("html")
    expect(tree.props.lang).toBe("ar")
    expect(tree.props.dir).toBe("rtl")
    expect(tree.props["data-nonce"]).toBe("nonce-123")

    const [head, body] = Children.toArray(tree.props.children)
    expect(isValidElement(head)).toBe(true)
    expect(isValidElement(body)).toBe(true)

    const headChildren = isValidElement(head) ? Children.toArray(asElement(head).props.children) : []
    const preconnect = headChildren.find(
      (child) =>
        isValidElement(child) &&
        asElement(child).props.rel === "preconnect" &&
        asElement(child).props.href === "https://api.example.com",
    )

    expect(preconnect).toBeTruthy()

    if (isValidElement(body)) {
      render(asElement(body).props.children)
      expect(screen.getByTestId("theme-provider")).toBeInTheDocument()
      expect(screen.getByTestId("language-provider")).toBeInTheDocument()
      expect(screen.getByTestId("auth-provider")).toBeInTheDocument()
      expect(screen.getByText("Root Child")).toBeInTheDocument()
      expect(screen.getByTestId("client-side-features")).toBeInTheDocument()
    }
  })

  it("omits the preconnect link when the public API URL is relative", async () => {
    process.env.NEXT_PUBLIC_API_URL = "/api/v1"

    const { default: RootLayout } = await loadRootLayoutModule()
    const tree = await RootLayout({ children: <div>Root Child</div> })
    const [head] = Children.toArray(tree.props.children)
    const headChildren = isValidElement(head) ? Children.toArray(asElement(head).props.children) : []

    const preconnect = headChildren.find(
      (child) => isValidElement(child) && asElement(child).props.rel === "preconnect",
    )

    expect(preconnect).toBeFalsy()
  })

  it("bootstraps the root layout language from cookies when available", async () => {
    mocks.cookies.mockResolvedValue({
      get: vi.fn((name: string) =>
        name === "mal3bk_language" ? { value: "en" } : undefined,
      ),
    })

    const { default: RootLayout } = await loadRootLayoutModule()
    const tree = await RootLayout({ children: <div>Root Child</div> })

    expect(tree.props.lang).toBe("en")
    expect(tree.props.dir).toBe("ltr")
  })

  it("builds the web app manifest", () => {
    const result = manifest()

    expect(result.short_name).toBe("Mal3bk")
    expect(result.display).toBe("standalone")
    expect(result.icons).toHaveLength(2)
    expect(result.theme_color).toBe("#0d47a1")
  })

  it("builds robots.txt from the configured site URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://preview.example.com/"

    const result = robots()
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]

    expect(result.host).toBe("https://preview.example.com")
    expect(result.sitemap).toBe("https://preview.example.com/sitemap.xml")
    expect(rules[0]).toEqual({
      userAgent: "*",
      allow: "/",
      disallow: ["/dashboard/", "/auth/"],
    })
  })

  it("builds the sitemap from the configured site URL", async () => {
    process.env.PUBLIC_FRONTEND_URL = "https://preview.example.com/"

    const result = await sitemap()

    expect(result).toHaveLength(1)
    expect(result[0]?.url).toBe("https://preview.example.com/")
    expect(result[0]?.changeFrequency).toBe("weekly")
    expect(result[0]?.priority).toBe(1)
    expect(result[0]?.lastModified).toBeInstanceOf(Date)
  })
})
