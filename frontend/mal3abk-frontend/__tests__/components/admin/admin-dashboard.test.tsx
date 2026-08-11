import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeProvider } from "next-themes";
import { AdminDashboard } from "@/components/dashboard/admin/admin-dashboard";
import * as api from "@/lib/api";
import * as languageProvider from "@/components/providers/language-provider";

vi.mock("@/lib/api", () => ({
  adminGetDashboardStats: vi.fn(),
  adminListUsers: vi.fn(),
  listCourts: vi.fn(),
  listBookings: vi.fn(),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: vi.fn(() => ({ user: { id: "admin1", role: "admin" } })),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function TestWrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="light">{children}</ThemeProvider>;
}

describe("AdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (languageProvider.useLanguage as any).mockReturnValue({
      language: "en",
    });

    (api.adminGetDashboardStats as any).mockResolvedValue({
      totalUsers: 120,
      totalCourts: 8,
      totalBookings: 120,
      grossRevenue: 777,
      confirmedAmount: 555,
      checkedInAmount: 777,
      completedAmount: 333,
      bookingCounts: {
        confirmed: 30,
        pending: 10,
        completed: 99,
        cancelled: 5,
        no_show: 1,
        checked_in: 41,
      },
      usersBreakdown: {
        players: 100,
        managers: 15,
        admins: 5,
      },
      todayBookings: 12,
    });

    (api.listBookings as any).mockResolvedValue({
      items: [],
      pages: 1,
    });
  });

  it("renders the checked-in KPI from checked_in attendance stats without double counting completed bookings", async () => {
    render(
      <TestWrapper>
        <AdminDashboard />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Checked-in players/i).length).toBeGreaterThan(0);
    });

    const checkedInLabel = screen.getAllByText(/Checked-in players/i)[0];
    const checkedInCard = checkedInLabel.parentElement as HTMLElement;

    expect(within(checkedInCard).getByText("41")).toBeInTheDocument();

    const revenueLabel = screen.getAllByText(/Played revenue/i)[0];
    const revenueCard = revenueLabel.parentElement as HTMLElement;

    expect(within(revenueCard).getByText("777 EGP")).toBeInTheDocument();
    await waitFor(() => {
      expect(api.adminGetDashboardStats).toHaveBeenCalledTimes(1);
    });
  });

  it("clamps admin booking pagination fetches to the API max limit", async () => {
    render(
      <TestWrapper>
        <AdminDashboard />
      </TestWrapper>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /View bookings/i }));

    await waitFor(() => {
      expect(api.listBookings).toHaveBeenCalledWith({ page: 1, limit: 200 });
    });
  });
});
