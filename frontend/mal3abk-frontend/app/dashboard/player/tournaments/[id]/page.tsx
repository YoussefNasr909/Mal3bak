import type { Metadata } from "next";
import { TournamentDetailsPage } from "@/components/dashboard/tournaments/tournament-details-page";
export const metadata: Metadata = { title: "Tournament | Mal3bk" };
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <TournamentDetailsPage role="player" tournamentId={id} />; }
