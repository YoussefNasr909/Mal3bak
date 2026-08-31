import { render, screen } from "@testing-library/react"
import { describe, it, expect, vi } from "vitest"
import { PoliciesPageClient } from "@/components/legal/policies-page"
import Footer from "@/components/landing/Footer"

vi.mock("@/components/branding/header-logo", () => ({
  HeaderLogo: () => <div data-testid="header-logo">Mal3bk Logo</div>,
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: () => ({ user: null }),
}))

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({
    language: "en",
    direction: "ltr",
    t: (key: string) => (key === "common.egp" ? "EGP" : key),
  }),
}))

describe("PoliciesPageClient", () => {
  it("renders privacy and refund policy sections with table of contents and contact links", () => {
    render(<PoliciesPageClient />)

    // Check headings
    expect(screen.getByRole("heading", { name: "Mal3bk Platform Policies" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Privacy Policy" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Refund & Cancellation Policy" })).toBeInTheDocument()

    // Check TOC
    expect(screen.getByText("Table of Contents")).toBeInTheDocument()

    // Check sections exist with IDs for anchor linking
    const privacySection = document.getElementById("privacy")
    const refundSection = document.getElementById("refund")
    expect(privacySection).toBeInTheDocument()
    expect(refundSection).toBeInTheDocument()
    expect(privacySection).toHaveClass("scroll-mt-28")
    expect(refundSection).toHaveClass("scroll-mt-28")
  })
})

describe("Footer", () => {
  it("renders 4 columns with brand, quick links, legal policies, and contact information", () => {
    render(<Footer homeHref="/" />)

    // Check columns
    expect(screen.getByText("Follow Us")).toBeInTheDocument()
    expect(screen.getByText("Quick Links")).toBeInTheDocument()
    expect(screen.getByText("Legal & Policies")).toBeInTheDocument()
    expect(screen.getByText("Contact Us")).toBeInTheDocument()

    // Check social media links
    const tiktokLink = screen.getByLabelText(/TikTok/i)
    const instagramLink = screen.getByLabelText(/Instagram/i)
    expect(tiktokLink).toHaveAttribute("href", "https://www.tiktok.com/@mal3bk.eg?_r=1&_t=ZS-94vmVUpLBYN")
    expect(instagramLink).toHaveAttribute("href", "https://www.instagram.com/mal3bk.eg?igsh=a3kzcHFpcWdvb2d6")

    // Check legal links
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/policies#privacy")
    expect(screen.getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/policies#refund")

    // Check contact info
    expect(screen.getByText("21 Al-Nasr St., Al-Sadat District, Assiut, First Assiut, Egypt")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "mal3bkk@gmail.com" })).toHaveAttribute("href", "mailto:mal3bkk@gmail.com")
    expect(screen.getByRole("link", { name: "+20 11 31734350" })).toHaveAttribute("href", "tel:+201131734350")
  })
})
