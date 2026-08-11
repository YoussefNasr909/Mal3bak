import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PlayerBookingsPage } from "@/components/dashboard/player/player-bookings-page";
import { BookingCalendar } from "@/components/dashboard/player/booking-calendar";
import * as api from "@/lib/api";
import * as authProvider from "@/components/providers/auth-provider";
import * as langProvider from "@/components/providers/language-provider";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";

vi.mock("@/lib/api", () => ({
  listBookings: vi.fn(),
  updateBookingStatus: vi.fn(),
  cancelBooking: vi.fn(),
  getBooking: vi.fn(),
  getBookedSlots: vi.fn(),
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

// Mock the qrcode module so it doesn't try to draw canvas in tests
vi.mock("qrcode", () => ({
  toDataURL: vi.fn().mockResolvedValue("data:image/png;base64,mock"),
}));

const mockBooking = {
  id: "booking-1",
  courtName: "Test Court",
  courtNameEn: "Test Court EN",
  courtCity: "القاهرة",
  courtCityEn: "Cairo",
  date: new Date(Date.now() + 86400000).toISOString().split('T')[0], // Tomorrow
  startTime: "18:00",
  endTime: "19:00",
  status: "confirmed",
  playerId: "user1",
  amount: 150,
  checkInCode: "ABCDEFGH",
};

describe("PlayerBookingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "user1", role: "player" },
      refreshUser: vi.fn().mockResolvedValue(undefined),
    });

    (langProvider.useLanguage as any).mockReturnValue({
      language: "en",
      direction: "ltr",
      t: (key: string) => key,
    });

    (api.listBookings as any).mockResolvedValue({ items: [mockBooking], pages: 1 });
    (api.getBookedSlots as any).mockResolvedValue([]);
    (api.getBooking as any).mockResolvedValue(mockBooking);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider attribute="class" defaultTheme="light">
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  );

  it("renders upcoming bookings", async () => {
    render(
      <TestWrapper>
        <PlayerBookingsPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Court EN")).toBeInTheDocument();
      // Should show the booking amount
      expect(screen.getByText("150")).toBeInTheDocument();
    });
  });

  it("allows canceling a booking", async () => {
    (api.cancelBooking as any).mockResolvedValue({ success: true });

    render(
      <TestWrapper>
        <PlayerBookingsPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Court EN")).toBeInTheDocument();
    });

    // The Cancel button is now rendered directly on the booking card
    const cancelBtn = screen.getAllByRole("button", { name: /cancel/i }).find(btn => !btn.hasAttribute("disabled")) || screen.getAllByRole("button", { name: /cancel/i })[0];
    fireEvent.click(cancelBtn);

    // Wait for confirmation dialog (it renders inside AlertDialog)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /confirm cancel/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /confirm cancel/i }));

    await waitFor(() => {
      expect(api.cancelBooking).toHaveBeenCalledWith("booking-1", expect.any(Object));
    });
  });

  it("shows a cleaner code dialog with booking details", async () => {
    render(
      <TestWrapper>
        <PlayerBookingsPage />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(screen.getByText("Test Court EN")).toBeInTheDocument();
    });

    fireEvent.click(screen.getAllByRole("button", { name: /code/i })[0]);

    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).getByText("Your check-in code")).toBeInTheDocument();
    expect(within(dialog).getByText("Test Court EN")).toBeInTheDocument();
    expect(within(dialog).getByText("ABCDEFGH")).toBeInTheDocument();
    expect(within(dialog).getByText("Date")).toBeInTheDocument();
    expect(within(dialog).getByText("Time")).toBeInTheDocument();
    expect(within(dialog).getByText("Court")).toBeInTheDocument();
    expect(within(dialog).getByText("Location")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: /copy code/i })).toBeInTheDocument();
  });

  it("shows opening-day overnight bookings on the real Cairo date in the calendar", () => {
    vi.useFakeTimers({ now: new Date("2026-05-20T12:00:00.000Z") });

    const overnightBooking = {
      ...mockBooking,
      id: "overnight-booking",
      courtName: "Night Court",
      courtNameEn: "Night Court EN",
      date: "2026-05-24",
      startTime: "01:00",
      endTime: "02:00",
      sessionOpenTime: "08:00",
      useOpeningDayForOvernightBookings: true,
    };

    render(
      <TestWrapper>
        <BookingCalendar bookings={[overnightBooking as any]} />
      </TestWrapper>
    );

    const realDayButton = screen
      .getAllByRole("button")
      .find((button) => button.textContent?.trim().startsWith("25"));

    expect(realDayButton).toBeTruthy();
    fireEvent.click(realDayButton as HTMLButtonElement);

    const bookingButton = screen.getByText("Night Court EN").closest("button");
    expect(bookingButton).toBeTruthy();
    fireEvent.click(bookingButton as HTMLButtonElement);

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText((text) => text.includes("Monday, May 25, 2026"))).toBeInTheDocument();
    expect(within(dialog).getByText((text) => text.includes("1:00 AM") && text.includes("2:00 AM"))).toBeInTheDocument();
    expect(within(dialog).queryByText(/2026-05-24/)).not.toBeInTheDocument();
  });
});
