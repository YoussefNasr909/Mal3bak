import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CourtDetailsPage } from "@/components/dashboard/player/court-details-page";
import * as api from "@/lib/api";
import * as authProvider from "@/components/providers/auth-provider";
import * as langProvider from "@/components/providers/language-provider";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/lib/api", () => ({
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

const mockCourt = {
  id: "court-1",
  name: "Test Court",
  nameEn: "Test Court EN",
  city: "القاهرة",
  cityEn: "Cairo",
  location: "Test Location",
  locationEn: "Test Location EN",
  description: "Test Description",
  descriptionEn: "Test Description EN",
  sportType: "padel",
  status: "active",
  offPeakPrice: 150,
  peakPrice: 250,
  peakStartTime: "20:00",
  peakEndTime: "02:00",
  openTime: "08:00",
  closeTime: "23:00",
  images: ["/test1.jpg"],
  rating: 4.8,
  reviewCount: 50,
  totalBookings: 1500,
  maxPlayers: 4,
};

describe("CourtDetailsPage", () => {
  beforeEach(() => {
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

    (api.getFavorites as any).mockResolvedValue({ items: [] });
    (api.getPublicCourtAvailability as any).mockResolvedValue({
      slots: [
        { start: "10:00", end: "11:00", available: true },
        { start: "11:00", end: "12:00", available: false },
      ],
    });
  });

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider attribute="class" defaultTheme="light">
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  );

  it("renders court details correctly", async () => {
    render(
      <TestWrapper>
        <CourtDetailsPage court={mockCourt as any} />
      </TestWrapper>
    );

    expect(screen.getAllByText("Test Court EN")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Test Location EN")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Padel")[0]).toBeInTheDocument();
    expect(screen.getAllByText("150")[0]).toBeInTheDocument(); // Starting price
  });

  it("shows the real peak pricing window from the court data", async () => {
    render(
      <TestWrapper>
        <CourtDetailsPage court={mockCourt as any} />
      </TestWrapper>
    );

    const peakPricingRow = screen.getByText(/peak pricing/i).closest("p") as HTMLElement;
    expect(peakPricingRow).toHaveTextContent("8:00 PM");
    expect(peakPricingRow).toHaveTextContent("2:00 AM");

    fireEvent.click(screen.getByRole("button", { name: /pricing/i }));

    const offPeakCard = screen.getByText(/^off-peak$/i).closest("div")?.parentElement as HTMLElement;
    const peakCard = screen.getByText(/^peak hours$/i).closest("div")?.parentElement as HTMLElement;

    expect(offPeakCard).toHaveTextContent("2:00 AM");
    expect(offPeakCard).toHaveTextContent("8:00 PM");
    expect(peakCard).toHaveTextContent("8:00 PM");
    expect(peakCard).toHaveTextContent("2:00 AM");
  });

  it("can open booking dialog", async () => {
    render(
      <TestWrapper>
        <CourtDetailsPage court={mockCourt as any} />
      </TestWrapper>
    );

    const bookButtons = screen.getAllByRole("button", { name: /book now/i });
    fireEvent.click(bookButtons[0]);

    // Dialog should be open
    await waitFor(() => {
      expect(screen.getAllByText(/bookings.selectDate|Select Date/i).length).toBeGreaterThan(0);
    });
  });

  it("keeps the booking dialog scrollable on short mobile viewports", async () => {
    render(
      <TestWrapper>
        <CourtDetailsPage court={mockCourt as any} />
      </TestWrapper>
    );

    fireEvent.click(screen.getAllByRole("button", { name: /book now/i })[0]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("h-[calc(100dvh-1rem)]", "overflow-hidden");

    const scrollBody = dialog.querySelector(".overflow-y-auto");
    expect(scrollBody).toHaveClass("min-h-0", "touch-pan-y", "scroll-pb-28", "[overflow-anchor:none]");

    await waitFor(() => {
      const slotsGrid = dialog.querySelector(".grid");
      expect(slotsGrid).toHaveClass("grid-cols-2", "min-[340px]:grid-cols-3", "[overflow-anchor:none]");
    });
  });

  it("allows selecting a time slot and confirming booking", async () => {
    (api.createBooking as any).mockResolvedValue({ success: true });

    render(
      <TestWrapper>
        <CourtDetailsPage court={mockCourt as any} />
      </TestWrapper>
    );

    const bookButtons = screen.getAllByRole("button", { name: /book now/i });
    fireEvent.click(bookButtons[0]);

    // Select the available time slot 10:00
    await waitFor(() => {
      expect(screen.getAllByText(/\u200E10:00 AM|10:00 AM/).length).toBeGreaterThan(0);
    });
    
    const timeSlot = screen.getAllByText(/\u200E10:00 AM|10:00 AM/)[0].closest("button");
    if (timeSlot) fireEvent.click(timeSlot);

    // Expected an element showing "Confirm" or similar
    const confirmButton = await screen.findByRole("button", { name: /bookings.confirmBooking/i });
    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.createBooking).toHaveBeenCalled();
    });
  });

  it("sends the trimmed player note with the booking", async () => {
    (api.createBooking as any).mockResolvedValue({ success: true });

    render(
      <TestWrapper>
        <CourtDetailsPage court={mockCourt as any} />
      </TestWrapper>
    );

    fireEvent.click(screen.getAllByRole("button", { name: /book now/i })[0]);

    await waitFor(() => {
      expect(screen.getAllByText(/\u200E10:00 AM|10:00 AM/).length).toBeGreaterThan(0);
    });

    const timeSlot = screen.getAllByText(/\u200E10:00 AM|10:00 AM/)[0].closest("button");
    if (timeSlot) fireEvent.click(timeSlot);

    fireEvent.change(screen.getByLabelText(/note to venue/i), {
      target: { value: "  Please keep the same side court.  " },
    });

    fireEvent.click(await screen.findByRole("button", { name: /bookings.confirmBooking/i }));

    await waitFor(() => {
      expect(api.createBooking).toHaveBeenCalledWith(
        expect.objectContaining({
          notes: "Please keep the same side court.",
        }),
      );
    });
  });
});
