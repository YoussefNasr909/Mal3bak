import React from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useLanguage: vi.fn(),
  useParams: vi.fn(),
  useRouter: vi.fn(),
  useAuth: vi.fn(),
  notFound: vi.fn(),
  getPublicCourt: vi.fn(),
  getPublicTournament: vi.fn(),
}))

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}))

vi.mock("next/navigation", () => ({
  useParams: mocks.useParams,
  useRouter: mocks.useRouter,
  notFound: mocks.notFound,
}))

vi.mock("@/lib/api", () => ({
  getPublicCourt: mocks.getPublicCourt,
  getPublicTournament: mocks.getPublicTournament,
}))

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: mocks.useLanguage,
}))

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: mocks.useAuth,
}))

vi.mock("@/components/auth/auth-navbar", () => ({
  AuthNavbar: () => <nav data-testid="auth-navbar">Auth Navbar</nav>,
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: {
    children: React.ReactNode
    asChild?: boolean
    [key: string]: unknown
  }) => {
    if (asChild) return <>{children}</>
    return <button {...props}>{children}</button>
  },
}))

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div data-testid="card">{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}))

vi.mock("@/components/ui/floating-elements", () => ({
  GridBackground: () => <div data-testid="grid-background" />,
  NoiseTexture: () => <div data-testid="noise-texture" />,
  Spotlight: () => <div data-testid="spotlight" />,
}))

vi.mock("@/components/ui/animated-container", () => ({
  AnimatedContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="animated-container">{children}</div>
  ),
}))

vi.mock("@/components/dashboard/player/court-details-page", () => ({
  CourtDetailsPage: ({ court }: { court: { name?: string; nameEn?: string } }) => (
    <div data-testid="court-details-page">{court.nameEn || court.name}</div>
  ),
}))

vi.mock("@/components/tournaments/public-tournament-page", () => ({
  PublicTournamentPage: ({ tournamentId }: { tournamentId: string }) => (
    <div data-testid="public-tournament-page">{tournamentId}</div>
  ),
}))

import WelcomePage from "@/app/auth/welcome/page"
import ErrorPage from "@/app/error"
import RootLoadingPage from "@/app/loading"
import DashboardLoadingPage from "@/app/dashboard/loading"
import NotFoundPage from "@/app/not-found"
import CourtDetailPage, { generateMetadata } from "@/app/dashboard/player/browse/[id]/page"
import TournamentPage, { generateMetadata as generateTournamentMetadata } from "@/app/tournaments/[id]/page"

const originalEnv = { ...process.env }

function setNodeEnv(value: "development" | "production" | "test") {
  ;(process.env as Record<string, string | undefined>).NODE_ENV = value
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <div data-testid="error-boundary">{this.state.error.message}</div>
    }

    return this.props.children
  }
}

describe("special app pages", () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    sessionStorage.clear()
    document.documentElement.lang = "en"
    document.title = ""
    mocks.useLanguage.mockReturnValue({ language: "en", direction: "ltr" })
    mocks.useRouter.mockReturnValue({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() })
    mocks.useAuth.mockReturnValue({ user: null, isLoading: false })
    mocks.useParams.mockReturnValue({ id: "court-1" })
    mocks.notFound.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND")
    })
    mocks.getPublicCourt.mockReset()
    mocks.getPublicTournament.mockReset()
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    document.documentElement.lang = ""
    vi.restoreAllMocks()
  })

  it("renders the welcome page from recent registration data and copies the email", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    })

    sessionStorage.setItem(
      "mal3bk_recent_registration",
      JSON.stringify({
        name: "Omar",
        email: "omar@example.com",
        role: "manager",
      }),
    )

    render(<WelcomePage />)

    await waitFor(() => {
      expect(screen.getByText("Welcome")).toBeInTheDocument()
    })

    expect(screen.getByTestId("auth-navbar")).toBeInTheDocument()
    expect(screen.getByText("omar@example.com")).toBeInTheDocument()
    expect(screen.getByText("Manager")).toBeInTheDocument()
    expect(document.title).toBe("Welcome | Mal3bk")

    fireEvent.click(screen.getByRole("button", { name: /copy/i }))

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("omar@example.com")
      expect(screen.getByRole("button", { name: /copied!/i })).toBeInTheDocument()
    })
  })

  it("redirects authenticated users away from the welcome page", async () => {
    const replace = vi.fn()
    mocks.useRouter.mockReturnValue({ replace, push: vi.fn(), refresh: vi.fn() })
    mocks.useAuth.mockReturnValue({
      user: { id: "user-1", role: "manager" },
      isLoading: false,
    })

    render(<WelcomePage />)

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith("/dashboard/manager")
    })
  })

  it("renders the custom 404 page and lets the user go back", () => {
    const backSpy = vi.spyOn(window.history, "back").mockImplementation(() => {})

    render(<NotFoundPage />)

    expect(screen.getByText("404")).toBeInTheDocument()
    expect(screen.getByText("Page not found")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/")

    fireEvent.click(screen.getByRole("button", { name: /go back/i }))

    expect(backSpy).toHaveBeenCalledTimes(1)
  })

  it("renders the global error page, shows the dev error message, and retries", async () => {
    setNodeEnv("development")
    const reset = vi.fn()

    render(<ErrorPage error={new Error("Boom")} reset={reset} />)

    expect(await screen.findByText("Something went wrong")).toBeInTheDocument()
    expect(screen.getByText("Boom")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: /try again/i }))

    expect(reset).toHaveBeenCalledTimes(1)
  })

  it("renders both loading screens with their animated spinners/skeletons", () => {
    const rootRender = render(<RootLoadingPage />)
    expect(rootRender.container.querySelector('[class~="animate-spin"], [class~="motion-safe:animate-spin"]')).toBeTruthy()

    const dashboardRender = render(<DashboardLoadingPage />)
    expect(dashboardRender.container.querySelector('.animate-pulse, [class~="animate-pulse"]')).toBeTruthy()
  })

  it("loads the dynamic court page and generates metadata from the fetched court", async () => {
    mocks.getPublicCourt.mockResolvedValue({
      court: {
        id: "court-1",
        name: "Padel Court",
        nameEn: "Elite Court",
      },
    })

    const metadata = await generateMetadata({ params: Promise.resolve({ id: "court-1" }) })
    const page = await CourtDetailPage({ params: Promise.resolve({ id: "court-1" }) })
    render(page)

    await waitFor(() => {
      expect(screen.getByTestId("court-details-page")).toHaveTextContent("Elite Court")
    })

    expect(mocks.getPublicCourt).toHaveBeenCalledWith("court-1")
    expect(metadata.title).toBe("Elite Court | Mal3bk")
  })

  it("routes missing courts to not-found", async () => {
    mocks.getPublicCourt.mockResolvedValue({})

    await expect(CourtDetailPage({ params: Promise.resolve({ id: "court-1" }) })).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mocks.notFound).toHaveBeenCalled()
  })

  it("generates tournament metadata from the fetched tournament", async () => {
    mocks.getPublicTournament.mockResolvedValue({
      tournament: {
        id: "tournament-1",
        title: "Spring Cup",
      },
    })

    const metadata = await generateTournamentMetadata({ params: Promise.resolve({ id: "tournament-1" }) })
    const page = await TournamentPage({ params: Promise.resolve({ id: "tournament-1" }) })
    render(page)

    expect(mocks.getPublicTournament).toHaveBeenCalledWith("tournament-1")
    expect(metadata.title).toBe("Spring Cup | Mal3bk")
    expect(screen.getByTestId("public-tournament-page")).toHaveTextContent("tournament-1")
  })
})
