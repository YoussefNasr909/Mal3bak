import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CheckInPage } from "@/components/dashboard/manager/check-in-page";
import * as api from "@/lib/api";
import * as authProvider from "@/components/providers/auth-provider";
import * as langProvider from "@/components/providers/language-provider";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getEgyptTodayString } from "@/lib/date";

vi.mock("@/lib/api", () => ({
  listBookings: vi.fn(),
  verifyBookingCode: vi.fn(),
  checkInBooking: vi.fn(),
  checkOutBooking: vi.fn(),
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const mockBooking = {
  id: "booking-1",
  courtName: "Test Court",
  date: getEgyptTodayString(), // Today
  startTime: "10:00",
  endTime: "11:00",
  status: "confirmed",
  playerName: "John Doe",
  playerNameEn: "John Doe",
  checkInCode: "ABCDEFGH",
  canCheckInNow: true,
  windowState: "open",
  windowMsLeft: 300000,
  courtId: "court-1",
  notes: "Please call on arrival.",
};

describe("CheckInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "manager1", role: "manager" },
    });

    (langProvider.useLanguage as any).mockReturnValue({
      language: "en",
      direction: "ltr",
      t: (key: string) => key,
    });

    (api.listBookings as any).mockResolvedValue({ items: [mockBooking], pages: 1 });
  });

  const TestWrapper = ({ children }: { children: React.ReactNode }) => (
    <ThemeProvider attribute="class" defaultTheme="light">
      <TooltipProvider>{children}</TooltipProvider>
    </ThemeProvider>
  );

  const openTab = (name: RegExp) => {
    fireEvent.mouseDown(screen.getByRole("tab", { name }), {
      button: 0,
      ctrlKey: false,
    });
  };

  it("renders the verification input and today's bookings", async () => {
    render(
      <TestWrapper>
        <CheckInPage />
      </TestWrapper>
    );

    expect(
      screen.getByRole("combobox", { name: /pick from today's bookings/i }),
    ).toHaveClass("w-full");

    // Should render the today's booking
    // First we need to switch to the "bookings" tab
    openTab(/^bookings$/i);

    // Wait for the booking to be rendered in the tab
    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(/selectable:/i)).not.toBeInTheDocument();
  });

  it("shows booking day, time, court, and city in the admin missed picker", async () => {
    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "admin1", role: "admin" },
    });

    (api.listBookings as any).mockResolvedValue({
      items: [
        {
          ...mockBooking,
          id: "missed-booking-1",
          status: "no_show",
          date: "2026-05-24",
          startTime: "01:00",
          endTime: "02:00",
          playerName: "Late Player",
          playerNameEn: "Late Player",
          courtName: "Night Court",
          courtNameEn: "Night Court",
          courtCity: "Giza",
          courtCityEn: "Giza",
          checkInCode: "MISSED01",
          canCheckInNow: false,
          windowState: "expired",
        },
      ],
      pages: 1,
    });

    render(
      <TestWrapper>
        <CheckInPage mode="admin" />
      </TestWrapper>
    );

    await waitFor(() => {
      expect(api.listBookings).toHaveBeenCalledWith(
        expect.objectContaining({ status: "no_show", sortBy: "date", order: "desc" }),
      );
    });

    if (!HTMLElement.prototype.hasPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
        configurable: true,
        value: vi.fn(() => false),
      });
    }
    if (!HTMLElement.prototype.releasePointerCapture) {
      Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
        configurable: true,
        value: vi.fn(),
      });
    }
    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: vi.fn(),
      });
    }

    fireEvent.pointerDown(screen.getByRole("combobox", { name: /pick from missed bookings/i }), {
      button: 0,
      ctrlKey: false,
      pointerType: "mouse",
    });

    const options = await screen.findAllByRole("option");
    const missedOption = options.find((option) => within(option).queryByText("MISSED01"));

    expect(missedOption).toBeTruthy();
    expect(within(missedOption as HTMLElement).getByText("Late Player")).toBeInTheDocument();
    expect(within(missedOption as HTMLElement).getByText((text) => text.includes("Night Court"))).toBeInTheDocument();
    expect(within(missedOption as HTMLElement).getByText(/Giza/)).toBeInTheDocument();
    expect(within(missedOption as HTMLElement).getByText(/Sunday, May 24/)).toBeInTheDocument();
    expect(
      within(missedOption as HTMLElement).getByText((text) => text.includes("1:00 AM") && text.includes("2:00 AM")),
    ).toBeInTheDocument();
  });

  it("verifies a booking code successfully", async () => {
    (api.verifyBookingCode as any).mockResolvedValue({
      success: true,
      booking: mockBooking,
      message: "Success",
    });

    render(
      <TestWrapper>
        <CheckInPage />
      </TestWrapper>
    );

    const verifyInput = document.querySelector("input") as HTMLInputElement;
    fireEvent.change(verifyInput, { target: { value: "ABCDEFGH" } });

    const verifyButton = screen.getAllByRole("button", { name: /verify/i })[0];
    fireEvent.click(verifyButton);

    await waitFor(() => {
      expect(api.verifyBookingCode).toHaveBeenCalledWith("ABCDEFGH", "en");
    });
  });

  it("can perform a quick check-in from the list", async () => {
    (api.checkInBooking as any).mockResolvedValue({
      success: true,
      booking: { ...mockBooking, status: "completed" },
    });

    render(
      <TestWrapper>
        <CheckInPage />
      </TestWrapper>
    );

    openTab(/^bookings$/i);

    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole("button", { name: /details/i })[0]);

    const checkInButton = await screen.findByRole("button", { name: /check in/i });
    fireEvent.click(checkInButton);

    await waitFor(() => {
      expect(api.checkInBooking).toHaveBeenCalledWith("booking-1", "en");
    });
  });

  it("shows completed status for checked-out bookings", async () => {
    (api.listBookings as any).mockResolvedValue({
      items: [{ ...mockBooking, status: "completed", checkInVerified: true }],
      pages: 1,
    });

    render(
      <TestWrapper>
        <CheckInPage />
      </TestWrapper>
    );

    openTab(/^bookings$/i);

    // Wait for table to be visible
    const bookingsTable = await screen.findByRole("table");

    expect(bookingsTable).not.toBeNull();

    await waitFor(() => {
      expect(within(bookingsTable as HTMLTableElement).getByText("John Doe")).toBeInTheDocument();
    });

    const bookingRow = within(bookingsTable as HTMLTableElement).getByText("John Doe").closest("tr");
    expect(bookingRow).not.toBeNull();
    expect(within(bookingRow as HTMLTableRowElement).getByText(/completed/i)).toBeInTheDocument();
    expect(within(bookingRow as HTMLTableRowElement).getByText("—")).toBeInTheDocument();
    expect(within(bookingRow as HTMLTableRowElement).queryByRole("button", { name: /check out/i })).not.toBeInTheDocument();
  });
  it("shows booking notes in the verification result and quick panel", async () => {
    (api.verifyBookingCode as any).mockResolvedValue({
      success: true,
      booking: mockBooking,
      message: "Success",
    });

    render(
      <TestWrapper>
        <CheckInPage />
      </TestWrapper>
    );

    const verifyInput = document.querySelector("input") as HTMLInputElement;
    fireEvent.change(verifyInput, { target: { value: "ABCDEFGH" } });
    fireEvent.click(screen.getAllByRole("button", { name: /verify/i })[0]);

    expect((await screen.findAllByText("Please call on arrival.")).length).toBeGreaterThan(0);

    // In my new implementation, I don't have a "quick panel" button directly in verification result message area
    // but I have a "Quick Panel" button in the verification result card
    fireEvent.click(screen.getByRole("button", { name: /booking details/i }));
    expect((await screen.findAllByText("Please call on arrival.")).length).toBeGreaterThanOrEqual(2);
  });

  it("shows note previews directly in the bookings tab", async () => {
    render(
      <TestWrapper>
        <CheckInPage />
      </TestWrapper>
    );

    openTab(/^bookings$/i);

    // Wait for the booking to be rendered in the tab
    await waitFor(() => {
      expect(screen.getAllByText("John Doe").length).toBeGreaterThan(0);
    });

    // The note button is now a popover trigger with "Show player note" aria-label
    const noteButtons = await waitFor(() => {
      const buttons = screen.queryAllByRole("button", { name: /show player note/i });
      if (buttons.length === 0) throw new Error("No note buttons found");
      return buttons;
    });
    fireEvent.click(noteButtons[0]);
    expect((await screen.findAllByText("Please call on arrival.")).length).toBeGreaterThan(0);
  });
});
