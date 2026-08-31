import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ThemeProvider } from "next-themes";
import { TournamentsPage } from "@/components/dashboard/tournaments/tournaments-page";
import * as api from "@/lib/api";
import * as authProvider from "@/components/providers/auth-provider";
import * as languageProvider from "@/components/providers/language-provider";

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  listTournaments: vi.fn(),
  listCourts: vi.fn(),
  createTournament: vi.fn(),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(),
}));

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock("sonner", () => ({
  toast: mockToast,
}));

const emptyTournamentList = {
  items: [],
  total: 0,
  page: 1,
  limit: 12,
  pages: 1,
};

const activeCourt = {
  id: "court-1",
  name: "Court A",
  nameEn: "Court A",
  city: "Cairo",
  cityEn: "Cairo",
  status: "active",
} as any;

function TestWrapper({ children }: { children: ReactNode }) {
  return <ThemeProvider attribute="class" defaultTheme="light">{children}</ThemeProvider>;
}

function fillRequiredTournamentDates(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/Registration opens/i), { target: { value: "2030-05-01T09:00" } });
  fireEvent.change(within(dialog).getByLabelText(/Registration closes/i), { target: { value: "2030-05-05T18:00" } });
  fireEvent.change(within(dialog).getByLabelText(/Tournament starts/i), { target: { value: "2030-05-10T10:00" } });
  fireEvent.change(within(dialog).getByLabelText(/Tournament ends/i), { target: { value: "2030-05-12T22:00" } });
}

describe("TournamentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.success.mockReset();
    mockToast.error.mockReset();

    (languageProvider.useLanguage as any).mockReturnValue({
      language: "en",
    });

    (authProvider.useAuth as any).mockReturnValue({
      user: null,
    });

    (api.listTournaments as any).mockResolvedValue(emptyTournamentList);
    (api.listCourts as any).mockResolvedValue({
      items: [activeCourt],
      pagination: { page: 1, limit: 100, total: 1, pages: 1 },
    });
  });

  it("reloads player tournaments when the mine-only toggle changes", async () => {
    render(
      <TestWrapper>
        <TournamentsPage role="player" />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(api.listTournaments).toHaveBeenCalledWith({
        q: undefined,
        status: undefined,
        mine: false,
        page: 1,
        limit: 12,
        sortBy: "startDate",
        order: "asc",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /My tournaments/i }));

    await waitFor(() => {
      expect(api.listTournaments).toHaveBeenLastCalledWith({
        q: undefined,
        status: undefined,
        mine: true,
        page: 1,
        limit: 12,
        sortBy: "startDate",
        order: "asc",
      });
    });
  });

  it("shows a validation error when a manager tries to create a tournament without selecting a court", async () => {
    render(
      <TestWrapper>
        <TournamentsPage role="manager" />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(api.listCourts).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Create tournament/i }));
    const dialog = await screen.findByRole("dialog");
    const titleInput = within(dialog).getByLabelText(/Tournament title/i);

    fireEvent.change(titleInput, { target: { value: "Spring Cup" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));
    fillRequiredTournamentDates(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Select at least one court");
    });
    expect(api.createTournament).not.toHaveBeenCalled();
    expect(within(dialog).queryByRole("button", { name: /Create tournament/i })).not.toBeInTheDocument();
  });

  it("submits the normalized payload when a manager creates a tournament", async () => {
    (api.createTournament as any).mockResolvedValue({
      tournament: { id: "tournament-1" },
    });

    render(
      <TestWrapper>
        <TournamentsPage role="manager" />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(api.listCourts).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Create tournament/i }));
    const dialog = await screen.findByRole("dialog");
    const titleInput = within(dialog).getByLabelText(/Tournament title/i);

    fireEvent.change(titleInput, { target: { value: "Spring Cup" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));
    fillRequiredTournamentDates(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));
    fireEvent.click(within(dialog).getByText("Court A"));
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));
    fireEvent.click(within(dialog).getByRole("button", { name: /Create tournament/i }));

    await waitFor(() => {
      expect(api.createTournament).toHaveBeenCalledWith({
        title: "Spring Cup",
        titleAr: null,
        description: null,
        descriptionAr: undefined,
        maxTeams: 8,
        teamsPerGroup: 4,
        entryFee: null,
        registrationOpenAt: expect.any(String),
        registrationCloseAt: expect.any(String),
        startDate: expect.any(String),
        endDate: expect.any(String),
        rules: null,
        courtIds: ["court-1"],
      });
    });
  });

  it("renders tournament card counts from summary stats when list payload is slimmed down", async () => {
    (api.listTournaments as any).mockResolvedValue({
      items: [
        {
          id: "tournament-1",
          title: "Spring Cup",
          titleAr: null,
          description: null,
          descriptionAr: undefined,
          managerId: "manager-1",
          managerName: "Demo Manager",
          status: "registration_open",
          format: "single_elimination",
          teamSize: 2,
          maxTeams: 4,
          entryFee: 250,
          registrationOpenAt: new Date(Date.now() - 60_000).toISOString(),
          registrationCloseAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          startDate: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
          endDate: null,
          rules: null,
          coverImage: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          courts: [],
          teams: [],
          matches: [],
          waitlistEntries: [],
          stats: {
            totalTeams: 4,
            approvedTeams: 3,
            pendingTeams: 1,
            waitlistCount: 0,
            totalMatches: 0,
            completedMatches: 0,
            activeRegistrations: 4,
          },
          winner: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 12,
      pages: 1,
    });

    render(
      <TestWrapper>
        <TournamentsPage role="manager" />
      </TestWrapper>,
    );

    expect(await screen.findByText("Spring Cup")).toBeInTheDocument();
    const pageText = document.body.textContent ?? "";
    expect(pageText).toMatch(/Spring Cup/i);
    expect(pageText).toMatch(/4/i);
    expect(pageText).toMatch(/registrations?/i);
    expect(screen.getByText(/Waitlist open/i)).toBeInTheDocument();
  });

  it("blocks moving past the basics step without a title", async () => {
    render(
      <TestWrapper>
        <TournamentsPage role="manager" />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(api.listCourts).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Create tournament/i }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));

    expect(mockToast.error).toHaveBeenCalledWith("Enter a tournament title");
    expect(within(dialog).getByText(/Basics/i)).toBeInTheDocument();
  });

  it("explains byes in the 24-team World Cup preset", async () => {
    render(
      <TestWrapper>
        <TournamentsPage role="manager" />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(api.listCourts).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /Create tournament/i }));
    const dialog = await screen.findByRole("dialog");
    const [titleInput] = within(dialog).getAllByRole("textbox");
    fireEvent.change(titleInput, { target: { value: "World Cup" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Next/i }));

    expect(within(dialog).getByText(/12 qualifiers · 4 top seeds receive byes/i)).toBeInTheDocument();
  });
});
