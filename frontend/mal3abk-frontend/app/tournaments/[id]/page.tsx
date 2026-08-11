import type { Metadata } from "next";

import { PublicTournamentPage } from "@/components/tournaments/public-tournament-page";
import { getPublicTournament } from "@/lib/api";

type PageProps = {
  params: Promise<{ id: string }>
}

async function loadTournament(id: string) {
  try {
    const data = await getPublicTournament(id)
    return data.tournament ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const tournament = await loadTournament(id)
  const title = tournament?.title || tournament?.titleAr || "Tournament"
  return {
    title: `${title} | Mal3bk`,
  }
}

export default async function Page({ params }: PageProps) {
  const { id } = await params;
  return <PublicTournamentPage tournamentId={id} />;
}
