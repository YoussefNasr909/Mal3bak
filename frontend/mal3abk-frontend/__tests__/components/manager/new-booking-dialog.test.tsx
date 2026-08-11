import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ThemeProvider } from "next-themes";
import { NewBookingDialog } from "@/components/dashboard/manager/bookings/new-booking-dialog";
import * as api from "@/lib/api";

vi.mock("@/lib/api", () => ({
  createManualBooking: vi.fn(),
  lookupManualBookingCustomerByPhone: vi.fn(),
  getBookedSlots: vi.fn(),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: () => ({
    language: "en",
    t: (key: string) => (key === "common.cancel" ? "Cancel" : key),
  }),
}));

const managerCourt = {
  id: "court-1",
  name: "Court A",
  nameEn: "Court A",
  openTime: "06:00",
  closeTime: "23:00",
  offPeakPrice: 150,
  peakPrice: 200,
  peakStartTime: "20:00",
  peakEndTime: "23:00",
};

function TestWrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="light">{children}</ThemeProvider>;
}

describe("NewBookingDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.getBookedSlots as any).mockResolvedValue({ bookedSlots: [] });
    (api.lookupManualBookingCustomerByPhone as any).mockResolvedValue({ user: null });
  });

  it("keeps the manual booking dialog scrollable on short mobile viewports", async () => {
    render(
      <TestWrapper>
        <NewBookingDialog
          open
          onOpenChange={vi.fn()}
          managerCourts={[managerCourt]}
          todayISO="2026-05-29"
          onBookingCreated={vi.fn().mockResolvedValue(undefined)}
        />
      </TestWrapper>,
    );

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveClass("h-[calc(100dvh-1rem)]", "overflow-hidden");

    const scrollBody = dialog.querySelector(".overflow-y-auto");
    expect(scrollBody).toHaveClass("min-h-0", "touch-pan-y");

    await waitFor(() => {
      const slotsGrid = Array.from(dialog.querySelectorAll(".grid")).find((element) =>
        element.className.includes("min-[380px]:grid-cols-3"),
      );

      expect(slotsGrid).toHaveClass("grid-cols-2", "min-[380px]:grid-cols-3");
    });
  });
});
