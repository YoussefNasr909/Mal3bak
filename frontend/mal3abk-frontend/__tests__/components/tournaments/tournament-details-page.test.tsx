import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ThemeProvider } from "next-themes";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TournamentDetailsPage } from "@/components/dashboard/tournaments/tournament-details-page";
import { createEgyptDate } from "@/lib/date";
import * as api from "@/lib/api";
import * as authProvider from "@/components/providers/auth-provider";
import * as languageProvider from "@/components/providers/language-provider";

const mockToast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    getTournament: vi.fn(),
    listCourts: vi.fn(),
    publishTournament: vi.fn(),
    openTournamentRegistration: vi.fn(),
    closeTournamentRegistration: vi.fn(),
    cancelTournament: vi.fn(),
    completeTournament: vi.fn(),
    registerTournamentTeam: vi.fn(),
    joinTournamentWaitlist: vi.fn(),
    withdrawTournamentWaitlistEntry: vi.fn(),
    withdrawTournamentTeam: vi.fn(),
    approveTournamentTeam: vi.fn(),
    rejectTournamentTeam: vi.fn(),
    bulkReviewTournamentTeams: vi.fn(),
    generateTournamentBracket: vi.fn(),
    checkInTournamentMatchTeam: vi.fn(),
    scheduleTournamentMatch: vi.fn(),
    recordTournamentMatchResult: vi.fn(),
    promoteNextTournamentWaitlistEntry: vi.fn(),
    promoteTournamentWaitlistEntry: vi.fn(),
    updateTournament: vi.fn(),
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

vi.mock("sonner", () => ({
  toast: mockToast,
}));

function TestWrapper({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light">
      {children}
    </ThemeProvider>
  );
}

const baseCourt = {
  id: "court-1",
  name: "Ù…Ù„Ø¹Ø¨ Ø§Ù„Ù†ÙŠÙ„",
  nameEn: "Nile Court",
  city: "Cairo",
  cityEn: "Cairo",
  status: "active",
};

function makeTournament(overrides: Record<string, any> = {}) {
  return {
    id: "tournament-1",
    title: "Spring Cup",
    titleAr: "ÙƒØ£Ø³ Ø§Ù„Ø±Ø¨ÙŠØ¹",
    description: "City tournament",
    descriptionAr: "Ø¨Ø·ÙˆÙ„Ø© Ø§Ù„Ù…Ø¯ÙŠÙ†Ø©",
    managerId: "manager-1",
    managerName: "Manager One",
    status: "registration_open",
    maxTeams: 8,
    entryFee: 100,
    registrationOpenAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    registrationCloseAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    startDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
    rules: "Best of three sets",
    courts: [baseCourt],
    teams: [],
    matches: [],
    winner: null,
    waitlistEntries: [],
    activities: [],
    stats: {
      approvedTeams: 0,
      pendingTeams: 0,
      waitlistCount: 0,
      totalMatches: 0,
      completedMatches: 0,
    },
    ...overrides,
  };
}

describe("TournamentDetailsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockToast.success.mockReset();
    mockToast.error.mockReset();

    (languageProvider.useLanguage as any).mockReturnValue({
      language: "en",
    });

    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "player-1", role: "player" },
    });

    (api.getTournament as any).mockResolvedValue({
      tournament: makeTournament(),
    });
    (api.listCourts as any).mockResolvedValue({
      items: [baseCourt],
      pagination: { page: 1, limit: 100, total: 1, pages: 1 },
    });

    (api.publishTournament as any).mockResolvedValue({});
    (api.registerTournamentTeam as any).mockResolvedValue({});
    (api.joinTournamentWaitlist as any).mockResolvedValue({});
    (api.scheduleTournamentMatch as any).mockResolvedValue({});
    (api.recordTournamentMatchResult as any).mockResolvedValue({});
    (api.promoteNextTournamentWaitlistEntry as any).mockResolvedValue({});
  });

  it("submits trimmed player registration details", async () => {
    render(
      <TestWrapper>
        <TournamentDetailsPage role="player" tournamentId="tournament-1" />
      </TestWrapper>,
    );

    const registerButton = await screen.findByRole("button", { name: /Register team/i });
    fireEvent.click(registerButton);

    const dialog = await screen.findByRole("dialog");
    const textboxes = within(dialog).getAllByRole("textbox");

    fireEvent.change(textboxes[0], { target: { value: "  Smashers  " } });
    fireEvent.change(textboxes[1], { target: { value: "  Sara Ali  " } });
    fireEvent.change(textboxes[2], { target: { value: " 01012345678 " } });
    fireEvent.change(textboxes[3], { target: { value: "  Ready to play  " } });

    const submitButton = within(dialog)
      .getAllByRole("button")
      .find((button) => /Register team/i.test(button.textContent || ""));
    fireEvent.click(submitButton as HTMLElement);

    await waitFor(() => {
      expect(api.registerTournamentTeam).toHaveBeenCalledWith("tournament-1", {
        teamName: "Smashers",
        partnerName: "Sara Ali",
        partnerPhone: "01012345678",
        notes: "Ready to play",
      });
    });
  });

  it("publishes draft tournaments for managers", async () => {
    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "manager-1", role: "manager" },
    });
    (api.getTournament as any).mockResolvedValue({
      tournament: makeTournament({
        status: "draft",
      }),
    });

    render(
      <TestWrapper>
        <TournamentDetailsPage role="manager" tournamentId="tournament-1" />
      </TestWrapper>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Publish/i }));

    await waitFor(() => {
      expect(api.publishTournament).toHaveBeenCalledWith("tournament-1");
    });
  });

  it("submits trimmed waitlist details when the tournament is full", async () => {
    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "player-3", role: "player" },
    });
    (api.getTournament as any).mockResolvedValue({
      tournament: makeTournament({
        status: "registration_open",
        maxTeams: 2,
        teams: [
          { id: "team-a", captainUserId: "player-1", teamName: "Team A", status: "approved" },
          { id: "team-b", captainUserId: "player-2", teamName: "Team B", status: "approved" },
        ],
        stats: {
          approvedTeams: 2,
          pendingTeams: 0,
          waitlistCount: 0,
          totalMatches: 0,
          completedMatches: 0,
        },
      }),
    });

    render(
      <TestWrapper>
        <TournamentDetailsPage role="player" tournamentId="tournament-1" />
      </TestWrapper>,
    );

    fireEvent.click(await screen.findByRole("button", { name: /Join waitlist/i }));

    const dialog = await screen.findByRole("dialog");
    const textboxes = within(dialog).getAllByRole("textbox");

    fireEvent.change(textboxes[0], { target: { value: "  Bench Squad  " } });
    fireEvent.change(textboxes[1], { target: { value: "  Mariam  " } });
    fireEvent.change(textboxes[2], { target: { value: " 01099990000 " } });
    fireEvent.change(textboxes[3], { target: { value: "  First in line  " } });

    const submitButton = within(dialog)
      .getAllByRole("button")
      .find((button) => /Join waitlist/i.test(button.textContent || ""));
    fireEvent.click(submitButton as HTMLElement);

    await waitFor(() => {
      expect(api.joinTournamentWaitlist).toHaveBeenCalledWith("tournament-1", {
        teamName: "Bench Squad",
        partnerName: "Mariam",
        partnerPhone: "01099990000",
        notes: "First in line",
      });
    });
  });

  it("lets managers promote the next waiting team with one action", async () => {
    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "manager-1", role: "manager" },
    });
    (api.getTournament as any).mockResolvedValue({
      tournament: makeTournament({
        status: "registration_closed",
        maxTeams: 2,
        teams: [
          { id: "team-a", captainUserId: "player-1", teamName: "Team A", status: "approved" },
        ],
        waitlistEntries: [
          {
            id: "wait-1",
            captainUserId: "player-3",
            captainName: "Player Three",
            teamName: "Bench Squad",
            partnerName: "Partner Three",
            status: "waiting",
            position: 1,
            createdAt: new Date().toISOString(),
          },
        ],
        stats: {
          approvedTeams: 1,
          pendingTeams: 0,
          waitlistCount: 1,
          totalMatches: 0,
          completedMatches: 0,
        },
      }),
    });

    render(
      <TestWrapper>
        <TournamentDetailsPage role="manager" tournamentId="tournament-1" />
      </TestWrapper>,
    );

    const waitlistTab = await screen.findByRole("tab", { name: /Waitlist/i });
    fireEvent.click(waitlistTab);
    if (waitlistTab.getAttribute("data-state") !== "active") {
      fireEvent.keyDown(waitlistTab, { key: "Enter", code: "Enter" });
    }

    fireEvent.click(await screen.findByRole("button", { name: /Promote next in line/i }));

    await waitFor(() => {
      expect(api.promoteNextTournamentWaitlistEntry).toHaveBeenCalledWith("tournament-1");
    });
  });

  it("schedules a match with Cairo-normalized datetimes", async () => {
    const match = {
      id: "match-1",
      roundNumber: 1,
      matchNumber: 1,
      teamAId: "team-a",
      teamAName: "Team A",
      teamBId: "team-b",
      teamBName: "Team B",
      winnerTeamId: null,
      courtId: null,
      courtName: null,
      startAt: null,
      endAt: null,
      status: "pending",
      scoreJson: null,
    };

    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "manager-1", role: "manager" },
    });
    (api.getTournament as any).mockResolvedValue({
      tournament: makeTournament({
        status: "registration_closed",
        stats: {
          approvedTeams: 2,
          totalMatches: 1,
          completedMatches: 0,
        },
        teams: [
          { id: "team-a", captainUserId: "player-1", teamName: "Team A", status: "approved" },
          { id: "team-b", captainUserId: "player-2", teamName: "Team B", status: "approved" },
        ],
        matches: [match],
      }),
    });

    render(
      <TestWrapper>
        <TournamentDetailsPage role="manager" tournamentId="tournament-1" />
      </TestWrapper>,
    );

    const matchesTab = await screen.findByRole("tab", { name: /Matches/i });
    fireEvent.click(matchesTab);
    if (matchesTab.getAttribute("data-state") !== "active") {
      fireEvent.keyDown(matchesTab, { key: "Enter", code: "Enter" });
    }
    await waitFor(() => {
      expect(matchesTab).toHaveAttribute("data-state", "active");
    });

    fireEvent.click(await screen.findByRole("button", { name: /Schedule/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByTitle("Select a court"), {
      target: { value: "court-1" },
    });

    const dateInputs = dialog.querySelectorAll('input[type="datetime-local"]');
    fireEvent.change(dateInputs[0], { target: { value: "2030-05-20T19:30" } });
    fireEvent.change(dateInputs[1], { target: { value: "2030-05-20T21:00" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Save schedule/i }));

    await waitFor(() => {
      expect(api.scheduleTournamentMatch).toHaveBeenCalledWith("tournament-1", "match-1", {
        courtId: "court-1",
        startAt: createEgyptDate(2030, 5, 20, 19, 30).toISOString(),
        endAt: createEgyptDate(2030, 5, 20, 21, 0).toISOString(),
      });
    });
  });

  it("records match results with parsed score arrays", async () => {
    const endedMatch = {
      id: "match-2",
      roundNumber: 1,
      matchNumber: 1,
      teamAId: "team-a",
      teamAName: "Team A",
      teamBId: "team-b",
      teamBName: "Team B",
      winnerTeamId: null,
      courtId: "court-1",
      courtName: "Nile Court",
      startAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      endAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: "scheduled",
      scoreJson: null,
    };

    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "manager-1", role: "manager" },
    });
    (api.getTournament as any).mockResolvedValue({
      tournament: makeTournament({
        status: "in_progress",
        stats: {
          approvedTeams: 2,
          totalMatches: 1,
          completedMatches: 0,
        },
        teams: [
          { id: "team-a", captainUserId: "player-1", teamName: "Team A", status: "approved" },
          { id: "team-b", captainUserId: "player-2", teamName: "Team B", status: "approved" },
        ],
        matches: [endedMatch],
      }),
    });

    render(
      <TestWrapper>
        <TournamentDetailsPage role="manager" tournamentId="tournament-1" />
      </TestWrapper>,
    );

    const matchesTab = await screen.findByRole("tab", { name: /Matches/i });
    fireEvent.click(matchesTab);
    if (matchesTab.getAttribute("data-state") !== "active") {
      fireEvent.keyDown(matchesTab, { key: "Enter", code: "Enter" });
    }
    await waitFor(() => {
      expect(matchesTab).toHaveAttribute("data-state", "active");
    });

    fireEvent.click(await screen.findByRole("button", { name: /Record result/i }));

    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Team A/i }));

    let scoreInputs = dialog.querySelectorAll('input[placeholder="6"], input[placeholder="4"]');
    fireEvent.change(scoreInputs[0], { target: { value: "6" } });
    fireEvent.change(scoreInputs[1], { target: { value: "3" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /Add set/i }));
    scoreInputs = dialog.querySelectorAll('input[placeholder="6"], input[placeholder="4"]');
    fireEvent.change(scoreInputs[2], { target: { value: "6" } });
    fireEvent.change(scoreInputs[3], { target: { value: "4" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Save result/i }));

    await waitFor(() => {
      expect(api.recordTournamentMatchResult).toHaveBeenCalledWith("tournament-1", "match-2", {
        winnerTeamId: "team-a",
        score: {
          resultType: "standard",
          teamA: [6, 6],
          teamB: [3, 4],
        },
      });
    });
  });

  it("shows the live competition board and stage-aware match filters for managers", async () => {
    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "manager-1", role: "manager" },
    });
    (api.getTournament as any).mockResolvedValue({
      tournament: makeTournament({
        status: "in_progress",
        maxTeams: 4,
        teams: [
          { id: "team-a", captainUserId: "player-1", teamName: "Team A", status: "approved" },
          { id: "team-b", captainUserId: "player-2", teamName: "Team B", status: "approved" },
          { id: "team-c", captainUserId: "player-3", teamName: "Team C", status: "approved" },
          { id: "team-d", captainUserId: "player-4", teamName: "Team D", status: "approved" },
        ],
        matches: [
          {
            id: "group-a-1",
            stage: "group",
            groupId: "A",
            roundNumber: 1,
            matchNumber: 1,
            teamAId: "team-a",
            teamAName: "Team A",
            teamBId: "team-b",
            teamBName: "Team B",
            winnerTeamId: null,
            winnerTeamName: null,
            courtId: "court-1",
            courtName: "Nile Court",
            startAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            status: "scheduled",
            scoreJson: null,
          },
          {
            id: "semi-1",
            stage: "knockout",
            roundNumber: 1,
            matchNumber: 1,
            teamAId: "team-a",
            teamAName: "Team A",
            teamBId: "team-c",
            teamBName: "Team C",
            winnerTeamId: "team-a",
            winnerTeamName: "Team A",
            courtId: "court-1",
            courtName: "Nile Court",
            startAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            status: "completed",
            scoreJson: {
              resultType: "standard",
              teamA: [6, 4],
              teamB: [3, 6],
            },
          },
          {
            id: "semi-2",
            stage: "knockout",
            roundNumber: 1,
            matchNumber: 2,
            teamAId: "team-b",
            teamAName: "Team B",
            teamBId: "team-d",
            teamBName: "Team D",
            winnerTeamId: null,
            winnerTeamName: null,
            courtId: "court-1",
            courtName: "Nile Court",
            startAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
            endAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
            status: "scheduled",
            scoreJson: null,
          },
          {
            id: "final-1",
            stage: "knockout",
            roundNumber: 2,
            matchNumber: 1,
            teamAId: "team-a",
            teamAName: "Team A",
            teamBId: "team-d",
            teamBName: "Team D",
            winnerTeamId: null,
            winnerTeamName: null,
            courtId: "court-1",
            courtName: "Nile Court",
            startAt: null,
            endAt: null,
            status: "pending",
            scoreJson: null,
          },
        ],
        stats: {
          approvedTeams: 4,
          pendingTeams: 0,
          waitlistCount: 0,
          totalMatches: 4,
          completedMatches: 1,
        },
      }),
    });

    render(
      <TestWrapper>
        <TournamentDetailsPage role="manager" tournamentId="tournament-1" />
      </TestWrapper>,
    );

    const bracketTab = await screen.findByRole("tab", { name: /Bracket/i });
    fireEvent.click(bracketTab);
    if (bracketTab.getAttribute("data-state") !== "active") {
      fireEvent.keyDown(bracketTab, { key: "Enter", code: "Enter" });
    }
    await waitFor(() => {
      expect(bracketTab).toHaveAttribute("data-state", "active");
    });

    expect((await screen.findAllByText(/Competition board/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Group A/i).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/Semi-finals/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /^Schedule$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Auto schedule/i })).toBeInTheDocument();

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
    expect(screen.getAllByText(/Winner: Team A/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Result: 6-3 \/ 4-6/i)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /Schedule/i }).length).toBeGreaterThan(0);
  });

  it("lets managers edit a completed match result", async () => {
    const completedMatch = {
      id: "match-3",
      stage: "group",
      groupId: "A",
      roundNumber: 1,
      matchNumber: 1,
      teamAId: "team-a",
      teamAName: "Team A",
      teamBId: "team-b",
      teamBName: "Team B",
      winnerTeamId: "team-a",
      winnerTeamName: "Team A",
      courtId: "court-1",
      courtName: "Nile Court",
      startAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      endAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      status: "completed",
      scoreJson: {
        resultType: "standard",
        teamA: [6, 4],
        teamB: [3, 6],
      },
    };

    const updatedTournament = makeTournament({
      status: "in_progress",
      stats: {
        approvedTeams: 2,
        totalMatches: 1,
        completedMatches: 1,
      },
      teams: [
        { id: "team-a", captainUserId: "player-1", teamName: "Team A", status: "approved", groupId: "A" },
        { id: "team-b", captainUserId: "player-2", teamName: "Team B", status: "approved", groupId: "A" },
      ],
      matches: [
        {
          ...completedMatch,
          winnerTeamId: "team-b",
          winnerTeamName: "Team B",
          scoreJson: {
            resultType: "standard",
            teamA: [4, 3],
            teamB: [6, 6],
          },
        },
      ],
    });

    (authProvider.useAuth as any).mockReturnValue({
      user: { id: "manager-1", role: "manager" },
    });
    (api.getTournament as any).mockResolvedValue({
      tournament: makeTournament({
        status: "in_progress",
        stats: {
          approvedTeams: 2,
          totalMatches: 1,
          completedMatches: 1,
        },
        teams: [
          { id: "team-a", captainUserId: "player-1", teamName: "Team A", status: "approved", groupId: "A" },
          { id: "team-b", captainUserId: "player-2", teamName: "Team B", status: "approved", groupId: "A" },
        ],
        matches: [completedMatch],
      }),
    });
    (api.recordTournamentMatchResult as any).mockResolvedValue({
      tournament: updatedTournament,
      match: updatedTournament.matches[0],
    });

    render(
      <TestWrapper>
        <TournamentDetailsPage role="manager" tournamentId="tournament-1" />
      </TestWrapper>,
    );

    const matchesTab = await screen.findByRole("tab", { name: /^Matches$/i });
    fireEvent.click(matchesTab);
    if (matchesTab.getAttribute("data-state") !== "active") {
      fireEvent.keyDown(matchesTab, { key: "Enter", code: "Enter" });
    }

    fireEvent.click(await screen.findByRole("button", { name: /Edit result/i }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Edit match result/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /Team B/i }));

    const scoreInputs = dialog.querySelectorAll('input[placeholder="6"], input[placeholder="4"]');
    fireEvent.change(scoreInputs[0], { target: { value: "4" } });
    fireEvent.change(scoreInputs[1], { target: { value: "6" } });
    fireEvent.change(scoreInputs[2], { target: { value: "3" } });
    fireEvent.change(scoreInputs[3], { target: { value: "6" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Save changes/i }));

    await waitFor(() => {
      expect(api.recordTournamentMatchResult).toHaveBeenCalledWith("tournament-1", "match-3", {
        winnerTeamId: "team-b",
        score: {
          resultType: "standard",
          teamA: [4, 3],
          teamB: [6, 6],
        },
      });
    });
  });
});

