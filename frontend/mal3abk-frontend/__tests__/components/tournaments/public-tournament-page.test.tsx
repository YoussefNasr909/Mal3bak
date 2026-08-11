import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PublicTournamentPage } from "@/components/tournaments/public-tournament-page";
import * as api from "@/lib/api";
import * as authProvider from "@/components/providers/auth-provider";
import * as languageProvider from "@/components/providers/language-provider";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getPublicTournament: vi.fn(),
  };
});

vi.mock("@/components/providers/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/components/providers/language-provider", () => ({
  useLanguage: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      {children}
    </ThemeProvider>
  );
}

describe("PublicTournamentPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (languageProvider.useLanguage as any).mockReturnValue({
      language: "en",
    });

    (authProvider.useAuth as any).mockReturnValue({
      user: null,
    });

    (api.getPublicTournament as any).mockResolvedValue({
      tournament: {
        id: "tournament-1",
        title: "Spring Cup",
        titleAr: "كأس الربيع",
        description: "City event",
        descriptionAr: "بطولة المدينة",
        managerId: "manager-1",
        managerName: "Manager One",
        status: "registration_open",
        format: "single_elimination",
        teamSize: 2,
        maxTeams: 2,
        entryFee: 150,
        registrationOpenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        registrationCloseAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        rules: "Best of three sets",
        courts: [{ id: "court-1", name: "Nile Court", nameEn: "Nile Court", city: "Cairo", cityEn: "Cairo" }],
        teams: [
          { id: "team-a", teamName: "Approved A", status: "approved" },
          { id: "team-b", teamName: "Approved B", status: "approved" },
        ],
        matches: [],
        waitlistEntries: [],
        winner: null,
        activities: [{ id: "activity-1", title: "Bracket ready", description: "The bracket is now available." }],
        stats: {
          approvedTeams: 2,
          pendingTeams: 0,
          waitlistCount: 1,
          totalMatches: 0,
          completedMatches: 0,
        },
      },
    });
  });

  it("shows the public waitlist state and sign-in CTA", async () => {
    render(
      <TestWrapper>
        <PublicTournamentPage tournamentId="tournament-1" />
      </TestWrapper>,
    );

    expect(await screen.findByRole("heading", { name: /Spring Cup/i })).toBeInTheDocument();
    expect(screen.getByText(/Waitlist open/i)).toBeInTheDocument();
    expect(screen.getByText(/Approved A/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Approved B/i).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /Sign in to join the waitlist/i })).toHaveAttribute("href", "/auth/login");
    await waitFor(() => {
      expect(api.getPublicTournament).toHaveBeenCalledWith("tournament-1");
    });
  });

  it("highlights the next upcoming match when one is scheduled", async () => {
    (api.getPublicTournament as any).mockResolvedValue({
      tournament: {
        id: "tournament-2",
        title: "Summer Cup",
        titleAr: "كأس الصيف",
        description: "City event",
        descriptionAr: "بطولة المدينة",
        managerId: "manager-1",
        managerName: "Manager One",
        status: "registration_closed",
        format: "single_elimination",
        teamSize: 2,
        maxTeams: 2,
        entryFee: 150,
        registrationOpenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        registrationCloseAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        startDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
        rules: "Best of three sets",
        courts: [{ id: "court-1", name: "Nile Court", nameEn: "Nile Court", city: "Cairo", cityEn: "Cairo" }],
        teams: [
          { id: "team-a", teamName: "Approved A", status: "approved" },
          { id: "team-b", teamName: "Approved B", status: "approved" },
        ],
        matches: [
          {
            id: "match-1",
            roundNumber: 1,
            matchNumber: 1,
            status: "scheduled",
            startAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
            teamAName: "Approved A",
            teamBName: "Approved B",
            courtName: "Nile Court",
            courtNameEn: "Nile Court",
          },
        ],
        waitlistEntries: [],
        winner: null,
        activities: [],
        stats: {
          approvedTeams: 2,
          pendingTeams: 0,
          waitlistCount: 0,
          totalMatches: 1,
          completedMatches: 0,
        },
      },
    });

    render(
      <TestWrapper>
        <PublicTournamentPage tournamentId="tournament-2" />
      </TestWrapper>,
    );

    expect(await screen.findByText(/Next match/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Approved A/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Approved B/i).length).toBeGreaterThan(0);
  });

  it("separates bracket and matches views with stage-aware filters and live results", async () => {
    (api.getPublicTournament as any).mockResolvedValue({
      tournament: {
        id: "tournament-3",
        title: "Champions Cup",
        titleAr: "كأس الأبطال",
        description: "Live knockout weekend",
        descriptionAr: "بطولة مباشرة بنظام خروج المغلوب",
        managerId: "manager-1",
        managerName: "Manager One",
        status: "in_progress",
        format: "single_elimination",
        teamSize: 2,
        maxTeams: 4,
        entryFee: 200,
        registrationOpenAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        registrationCloseAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        startDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        endDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        rules: "Best of three sets",
        courts: [{ id: "court-1", name: "Nile Court", nameEn: "Nile Court", city: "Cairo", cityEn: "Cairo" }],
        teams: [
          { id: "team-a", teamName: "Falcons", status: "approved" },
          { id: "team-b", teamName: "Sharks", status: "approved" },
          { id: "team-c", teamName: "Waves", status: "approved" },
          { id: "team-d", teamName: "Lions", status: "approved" },
        ],
        matches: [
          {
            id: "group-a-1",
            stage: "group",
            groupId: "A",
            roundNumber: 1,
            matchNumber: 1,
            status: "scheduled",
            startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            teamAId: "team-a",
            teamAName: "Falcons",
            teamBId: "team-b",
            teamBName: "Sharks",
            courtName: "Nile Court",
            courtNameEn: "Nile Court",
            scoreJson: null,
            winnerTeamId: null,
            winnerTeamName: null,
          },
          {
            id: "semi-1",
            stage: "knockout",
            roundNumber: 1,
            matchNumber: 1,
            status: "completed",
            startAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            teamAId: "team-a",
            teamAName: "Falcons",
            teamBId: "team-c",
            teamBName: "Waves",
            courtName: "Nile Court",
            courtNameEn: "Nile Court",
            scoreJson: {
              resultType: "standard",
              teamA: [6, 4],
              teamB: [3, 6],
            },
            winnerTeamId: "team-a",
            winnerTeamName: "Falcons",
          },
          {
            id: "semi-2",
            stage: "knockout",
            roundNumber: 1,
            matchNumber: 2,
            status: "scheduled",
            startAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            teamAId: "team-b",
            teamAName: "Sharks",
            teamBId: "team-d",
            teamBName: "Lions",
            courtName: "Nile Court",
            courtNameEn: "Nile Court",
            scoreJson: null,
            winnerTeamId: null,
            winnerTeamName: null,
          },
          {
            id: "final-1",
            stage: "knockout",
            roundNumber: 2,
            matchNumber: 1,
            status: "scheduled",
            startAt: new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            teamAId: "team-a",
            teamAName: "Falcons",
            teamBId: "team-d",
            teamBName: "Lions",
            courtName: "Nile Court",
            courtNameEn: "Nile Court",
            scoreJson: null,
            winnerTeamId: null,
            winnerTeamName: null,
          },
        ],
        waitlistEntries: [],
        winner: null,
        activities: [],
        stats: {
          approvedTeams: 4,
          pendingTeams: 0,
          waitlistCount: 0,
          totalMatches: 4,
          completedMatches: 1,
        },
      },
    });

    render(
      <TestWrapper>
        <PublicTournamentPage tournamentId="tournament-3" />
      </TestWrapper>,
    );

    expect((await screen.findAllByText(/Competition board/i)).length).toBeGreaterThan(0);
    expect(screen.getByRole("tab", { name: /Bracket/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Matches$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Group A/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Semi-finals/i).length).toBeGreaterThan(0);

    const matchesTab = screen.getByRole("tab", { name: /^Matches$/i });
    fireEvent.click(matchesTab);
    if (matchesTab.getAttribute("data-state") !== "active") {
      fireEvent.keyDown(matchesTab, { key: "Enter", code: "Enter" });
    }

    await waitFor(() => {
      expect(matchesTab).toHaveAttribute("data-state", "active");
    });

    expect(await screen.findByRole("tab", { name: /All/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Group A/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Semi-finals$/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /^Final$/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Winner: Falcons/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6-4 \/ 3-6/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Schedule/i })).not.toBeInTheDocument();
  });
});
