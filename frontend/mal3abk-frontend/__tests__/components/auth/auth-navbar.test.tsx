/* eslint-disable @next/next/no-img-element */
import { fireEvent, render, screen } from "@testing-library/react"
import { ThemeProvider } from "next-themes"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthNavbar } from "@/components/auth/auth-navbar"

vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

vi.mock("next/image", () => ({
  default: ({
    alt,
    className,
    onError,
  }: {
    alt: string
    className?: string
    onError?: () => void

  }) => <img alt={alt} className={className} onError={onError} />,
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}))

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(),
}))

vi.mock("@/components/ui/navbar-preference-controls", () => ({
  NavbarPreferenceControls: ({ className }: { className?: string }) => (
    <div data-testid="navbar-preferences" className={className}>
      preferences
    </div>
  ),
}))

import * as authProvider from "@/components/providers/auth-provider"
import * as languageProvider from "@/components/providers/language-provider"

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      {children}
    </ThemeProvider>
  )
}

describe("AuthNavbar", () => {
  beforeEach(() => {
    ;(authProvider.useAuth as any).mockReturnValue({ user: null })
    ;(languageProvider.useLanguage as any).mockReturnValue({ language: "en" })
  })

  it("links the logo to home for guests", () => {
    render(
      <TestWrapper>
        <AuthNavbar />
      </TestWrapper>,
    )

    const homeLink = screen.getByRole("link", { name: /Mal3bk/ })
    expect(homeLink).toHaveAttribute("href", "/")
    expect(screen.getByTestId("navbar-preferences")).toBeInTheDocument()
  })

  it("falls back to the text mark when logo images fail", () => {
    render(
      <TestWrapper>
        <AuthNavbar />
      </TestWrapper>,
    )

    fireEvent.error(screen.getAllByAltText("Mal3bk")[0])

    expect(screen.getByText("Mal3bk")).toBeInTheDocument()
    expect(screen.getByText("Mal3bk").closest("a")).toHaveAttribute("href", "/")
  })
})

