import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { BrowseCourtsPage } from "@/components/dashboard/player/browse-courts-page";
import * as api from "@/lib/api";
import * as authProvider from "@/components/providers/auth-provider";
import * as langProvider from "@/components/providers/language-provider";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";

// Mock the modules
vi.mock("@/lib/api", () => ({
  listPublicCourts: vi.fn(),
  getPublicCourtAvailability: vi.fn(),
  createBooking: vi.fn(),
  getFavorites: vi.fn(),
  toggleFavorite: vi.fn(),
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(),
}));

// Provide a router router mock
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const mockCourt = {
  id: "court-1",
  name: "Test Court",
  nameEn: "Test Court EN",
  city: "القاهرة",
  cityEn: "Cairo",
  sportType: "football",
  status: "active",
  offPeakPrice: 150,
  peakPrice: 150,
  images: ["/test.jpg"],
  rating: 4.5,
  reviewCount: 10,
  maxPlayers: 10,
};

describe("BrowseCourtsPage", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();

    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "user1", role: "player" },
      refreshUser: vi.fn().mockResolvedValue(null),
    });

    (langProvider.useLanguage as any).mockReturnValue({
      language: "en",
      direction: "ltr",
      t: (key: string) => key,
    });

    (api.listPublicCourts as any).mockResolvedValue({ items: [mockCourt] });
    (api.getFavorites as any).mockResolvedValue({ items: [] });
    (api.getPublicCourtAvailability as any).mockResolvedValue({
      slots: [{ start: "10:00", end: "11:00", available: true }],
    });
  });

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider attribute="class" defaultTheme="light">
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  );

  it("renders courts successfully", async () => {
    render(
      <TestWrapper>
        <BrowseCourtsPage />
      </TestWrapper>
    );

    // Wait for the court to be displayed
    await waitFor(() => {
      expect(screen.getAllByText("Test Court EN").length).toBeGreaterThan(0);
    });

    // Verify it displayed the city
    expect(screen.getAllByText("Cairo").length).toBeGreaterThan(0);
  });

  it("filters courts by search query", async () => {
    render(
      <TestWrapper>
        <BrowseCourtsPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Test Court EN").length).toBeGreaterThan(0);
    });

    const searchInputs = screen.getAllByPlaceholderText(/search/i);
    const searchInput = searchInputs[0];
    
    // Type a query that doesn't match
    fireEvent.change(searchInput, { target: { value: "Nonexistent" } });

    await waitFor(() => {
      // Search is server-driven; verify query param is sent after debounce.
      expect(api.listPublicCourts).toHaveBeenCalledWith(
        expect.objectContaining({ q: "Nonexistent" })
      );
    }, { timeout: 5000 });

    // Type a query that matches
    const updatedSearchInput = screen.getAllByPlaceholderText(/search/i)[0];
    fireEvent.change(updatedSearchInput, { target: { value: "Test Court" } });

    await waitFor(() => {
      expect(api.listPublicCourts).toHaveBeenCalledWith(
        expect.objectContaining({ q: "Test Court" })
      );
    }, { timeout: 5000 });
  });

  it("toggles favorite status when heart icon is clicked", async () => {
    (api.toggleFavorite as any).mockResolvedValue({ favorited: true });

    render(
      <TestWrapper>
        <BrowseCourtsPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Test Court EN").length).toBeGreaterThan(0);
    });

    const favButtons = screen.getAllByRole("button", { name: /add to favorites/i });
    fireEvent.click(favButtons[0]);

    await waitFor(() => {
      expect(api.toggleFavorite).toHaveBeenCalledWith("court-1");
    });
  });

  it("includes the player note when confirming a browse booking", async () => {
    (api.createBooking as any).mockResolvedValue({
      code: "ABCDEFGH",
      booking: { id: "booking-1" },
    });

    render(
      <TestWrapper>
        <BrowseCourtsPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Test Court EN").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^book$/i })[0]);

    await waitFor(() => {
      expect(screen.getByText(/\u200E10:00 AM|10:00 AM/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/\u200E10:00 AM|10:00 AM/).closest("button") as HTMLElement);

    fireEvent.change(screen.getByLabelText(/note to venue/i), {
      target: { value: "  Please call when the slot is ready.  " },
    });

    fireEvent.click(screen.getByRole("button", { name: /confirm booking/i }));

    await waitFor(() => {
      expect(api.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: "Please call when the slot is ready.",
        }),
      );
    });
  });

  it("keeps the browse booking dialog scrollable on short mobile viewports", async () => {
    render(
      <TestWrapper>
        <BrowseCourtsPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getAllByText("Test Court EN").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /^book$/i })[0]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("h-[calc(100dvh-1rem)]", "overflow-hidden");

    const scrollBody = dialog.querySelector(".overflow-y-auto");
    expect(scrollBody).toHaveClass("min-h-0", "touch-pan-y", "scroll-pb-28", "[overflow-anchor:none]");

    await waitFor(() => {
      const slotsGrid = dialog.querySelector(".grid");
      expect(slotsGrid).toHaveClass("grid-cols-2", "min-[340px]:grid-cols-3", "[overflow-anchor:none]");
    });
  });
});
