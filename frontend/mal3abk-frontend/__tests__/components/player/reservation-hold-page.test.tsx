import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReservationHoldPage } from "@/components/dashboard/player/reservation-hold-page";
import * as api from "@/lib/api";
import * as langProvider from "@/components/providers/language-provider";

vi.mock("@/lib/api", () => ({
  getBookingHoldStatus: vi.fn(),
  cancelBooking: vi.fn(),
  createPaymobCheckoutSession: vi.fn(),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
  useSearchParams: () => ({
    get: (key: string) => (key === "checkoutUrl" ? "https://accept.paymob.com/test-checkout" : null),
  }),
}));

describe("ReservationHoldPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (langProvider.useLanguage as any).mockReturnValue({
      language: "en",
      direction: "ltr",
      t: (key: string) => (key === "common.egp" ? "EGP" : key),
    });
  });

  it("renders loading state initially and then shows active countdown timer, court details, disclaimer, and payment button", async () => {
    (api.getBookingHoldStatus as any).mockResolvedValue({
      bookingId: "booking-123",
      status: "pending",
      isExpired: false,
      isPaid: false,
      paymentStatus: "pending",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      remainingSeconds: 600,
      courtId: "court-1",
      courtName: "Al Ahly Padel Court",
      courtNameEn: "Al Ahly Padel Court",
      sportType: "padel",
      courtLocation: "Nasr City, Cairo",
      date: "2026-08-20",
      startTime: "18:00",
      endTime: "19:00",
      duration: 60,
      totalPrice: 200,
      amount: 200,
      couponCode: null,
      clientSecret: "test_secret",
    });

    render(<ReservationHoldPage bookingId="booking-123" />);

    await waitFor(() => {
      expect(screen.getByText("Al Ahly Padel Court")).toBeInTheDocument();
    });

    // Check legal disclaimer and links
    expect(screen.getByText("Privacy Policy")).toBeInTheDocument();
    expect(screen.getByText("Refund Policy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/policies#privacy");
    expect(screen.getByRole("link", { name: "Refund Policy" })).toHaveAttribute("href", "/policies#refund");

    // Check action buttons and countdown
    expect(screen.getByText("Proceed to Payment via Paymob")).toBeInTheDocument();
    expect(screen.getByText("Cancel Reservation Hold")).toBeInTheDocument();
    expect(screen.getByTestId("countdown-timer-display")).toBeInTheDocument();
  });

  it("shows expired state when hold is expired", async () => {
    (api.getBookingHoldStatus as any).mockResolvedValue({
      bookingId: "booking-123",
      status: "expired",
      isExpired: true,
      isPaid: false,
      paymentStatus: "failed",
      expiresAt: new Date(Date.now() - 1000 * 60).toISOString(),
      remainingSeconds: 0,
      courtId: "court-1",
      courtName: "Al Ahly Padel Court",
      courtNameEn: "Al Ahly Padel Court",
      sportType: "padel",
      totalPrice: 200,
      amount: 200,
    });

    render(<ReservationHoldPage bookingId="booking-123" />);

    await waitFor(() => {
      expect(screen.getByText("Reservation Window Expired")).toBeInTheDocument();
    });

    expect(screen.getByText("Browse Available Courts")).toBeInTheDocument();
  });

  it("shows confirmed state when payment is completed", async () => {
    (api.getBookingHoldStatus as any).mockResolvedValue({
      bookingId: "booking-123",
      status: "confirmed",
      isExpired: false,
      isPaid: true,
      paymentStatus: "paid",
      expiresAt: null,
      remainingSeconds: 0,
      courtId: "court-1",
      courtName: "Al Ahly Padel Court",
      courtNameEn: "Al Ahly Padel Court",
      sportType: "padel",
      totalPrice: 200,
      amount: 200,
    });

    render(<ReservationHoldPage bookingId="booking-123" />);

    await waitFor(() => {
      expect(screen.getByText("Payment Successful!")).toBeInTheDocument();
    });

    expect(screen.getByText("View Booking & QR Code")).toBeInTheDocument();
  });

  it("allows player to cancel the reservation hold", async () => {
    (api.getBookingHoldStatus as any).mockResolvedValue({
      bookingId: "booking-123",
      status: "pending",
      isExpired: false,
      isPaid: false,
      paymentStatus: "pending",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      remainingSeconds: 600,
      courtId: "court-1",
      courtName: "Al Ahly Padel Court",
      courtNameEn: "Al Ahly Padel Court",
      sportType: "padel",
      totalPrice: 200,
      amount: 200,
    });
    (api.cancelBooking as any).mockResolvedValue({ success: true });

    render(<ReservationHoldPage bookingId="booking-123" />);

    await waitFor(() => {
      expect(screen.getByText("Cancel Reservation Hold")).toBeInTheDocument();
    });

    const cancelBtn = screen.getByText("Cancel Reservation Hold");
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(api.cancelBooking).toHaveBeenCalledWith("booking-123", { lang: "en" });
    });
  });
});
