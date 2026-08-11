import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeProvider } from "next-themes";
import { CourtClosuresManager } from "@/components/dashboard/manager/court-closures-manager";
import * as api from "@/lib/api";

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  listCourtClosures: vi.fn(),
  createCourtClosure: vi.fn(),
  updateCourtClosure: vi.fn(),
  deleteCourtClosure: vi.fn(),
  deleteAllCourtClosures: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

const mockCourt = {
  id: "court-1",
  name: "Main Court",
  nameEn: "Main Court",
} as any;

const manualClosure = {
  id: "closure-1",
  courtId: "court-1",
  startDate: "2099-04-10T10:00:00.000Z",
  endDate: "2099-04-10T12:00:00.000Z",
  reason: "Routine maintenance",
} as const;

const tournamentClosure = {
  id: "closure-2",
  courtId: "court-1",
  startDate: "2099-04-11T14:00:00.000Z",
  endDate: "2099-04-11T15:00:00.000Z",
  reason: "Tournament block",
  isTournamentReservation: true,
  tournamentRoundNumber: 1,
  tournamentMatchNumber: 2,
  tournamentTitle: "Spring Cup",
} as const;

function TestWrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="light">{children}</ThemeProvider>;
}

describe("CourtClosuresManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.success.mockReset();
    mockToast.error.mockReset();
  });

  it("renders protected tournament closures without edit or delete actions", async () => {
    (api.listCourtClosures as any).mockResolvedValue({
      items: [manualClosure, tournamentClosure],
    });

    render(
      <TestWrapper>
        <CourtClosuresManager court={mockCourt} language="en" showAllByDefault />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(api.listCourtClosures).toHaveBeenCalledWith("court-1");
    });

    expect(screen.getByText(/protected tournament reservations exist on this court/i)).toBeInTheDocument();
    expect(screen.getByText(/Managed in tournament/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Edit$/i })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /^Delete$/i })).toHaveLength(1);
  });

  it("creates a repeated full-day closure payload for the selected date range", async () => {
    (api.listCourtClosures as any).mockResolvedValue({ items: [] });
    (api.createCourtClosure as any).mockResolvedValue({
      count: 3,
      closures: [{ id: "daily-1" }, { id: "daily-2" }, { id: "daily-3" }],
    });

    render(
      <TestWrapper>
        <CourtClosuresManager court={mockCourt} language="en" showAllByDefault />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(api.listCourtClosures).toHaveBeenCalledWith("court-1");
    });

    fireEvent.click(screen.getByRole("button", { name: /Add closure/i }));
    fireEvent.click(screen.getByRole("button", { name: /Repeat daily/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Full-day closure/i }));

    fireEvent.change(screen.getByLabelText(/From date/i), {
      target: { value: "2026-04-10" },
    });
    fireEvent.change(screen.getByLabelText(/To date/i), {
      target: { value: "2026-04-12" },
    });
    fireEvent.change(screen.getByLabelText(/Reason/i), {
      target: { value: "Tournament prep" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Create daily closure/i }));

    await waitFor(() => {
      expect(api.createCourtClosure).toHaveBeenCalledWith("court-1", {
        mode: "daily",
        fullDay: true,
        rangeStartDate: "2026-04-10",
        rangeEndDate: "2026-04-12",
        reason: "Tournament prep",
      });
    });
  });

  it("deletes all manual closures while keeping protected reservations", async () => {
    (api.listCourtClosures as any).mockResolvedValue({
      items: [manualClosure, tournamentClosure],
    });
    (api.deleteAllCourtClosures as any).mockResolvedValue({
      deletedCount: 1,
      protectedTournamentCount: 1,
    });

    render(
      <TestWrapper>
        <CourtClosuresManager court={mockCourt} language="en" showAllByDefault />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(api.listCourtClosures).toHaveBeenCalledWith("court-1");
    });

    fireEvent.click(screen.getByRole("button", { name: /Delete all manual closures/i }));

    await waitFor(() => {
      expect(screen.getByText(/Manual closures to delete: 1/i)).toBeInTheDocument();
    });

    const confirmButtons = screen.getAllByRole("button", { name: /Delete all manual closures/i });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(api.deleteAllCourtClosures).toHaveBeenCalledWith("court-1");
    });
  });
});
