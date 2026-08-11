import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ScrollToTop } from "@/components/ui/scroll-to-top"

const mocks = vi.hoisted(() => ({
  pathname: "/dashboard/manager",
  language: "en" as "ar" | "en",
}))

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}))

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({ language: mocks.language }),
}))

describe("ScrollToTop WhatsApp support button", () => {
  afterEach(() => {
    mocks.pathname = "/dashboard/manager"
    mocks.language = "en"
    delete document.documentElement.dataset.mobileBottomNav
    vi.restoreAllMocks()
  })

  it("uses the shared mobile bottom offset and opens WhatsApp", () => {
    render(<ScrollToTop />)

    const link = screen.getByRole("link", { name: "Contact us on WhatsApp" })
    expect(link).toHaveAttribute("href", expect.stringContaining("https://wa.me/201131734350"))
    expect(link.parentElement).toHaveClass("bottom-[calc(var(--mobile-bottom-nav-offset,1.5rem)+0.5rem)]")
  })

  it("follows the dashboard bottom nav visibility state", async () => {
    render(<ScrollToTop />)
    const buttonShell = screen.getByRole("link", { name: "Contact us on WhatsApp" }).parentElement

    document.documentElement.dataset.mobileBottomNav = "hidden"

    await waitFor(() => {
      expect(buttonShell).toHaveClass("translate-y-[150%]")
    })

    document.documentElement.dataset.mobileBottomNav = "visible"

    await waitFor(() => {
      expect(buttonShell).toHaveClass("translate-y-0")
    })
  })

  it("hides on downward scroll outside dashboard pages and reappears on route change", async () => {
    mocks.pathname = "/courts"
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0)
      return 1
    })

    Object.defineProperty(window, "scrollY", { configurable: true, writable: true, value: 0 })
    const { rerender } = render(<ScrollToTop />)
    const buttonShell = screen.getByRole("link", { name: "Contact us on WhatsApp" }).parentElement

    window.scrollY = 220
    fireEvent.scroll(window)

    await waitFor(() => {
      expect(buttonShell).toHaveClass("translate-y-[150%]")
    })

    mocks.pathname = "/book"
    rerender(<ScrollToTop />)

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Contact us on WhatsApp" }).parentElement).toHaveClass("translate-y-0")
    })
  })

  it("does not render on auth pages", () => {
    mocks.pathname = "/auth/login"

    render(<ScrollToTop />)

    expect(screen.queryByRole("link", { name: "Contact us on WhatsApp" })).not.toBeInTheDocument()
  })

  it("moves out of the way while a dialog is open", async () => {
    render(
      <>
        <ScrollToTop />
        <div role="dialog" data-state="open" />
      </>,
    )

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Contact us on WhatsApp" }).parentElement).toHaveClass(
        "translate-y-[150%]",
      )
    })
  })
})
