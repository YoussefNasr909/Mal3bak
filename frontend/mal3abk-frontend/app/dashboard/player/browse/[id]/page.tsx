import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CourtDetailsPage } from "@/components/dashboard/player/court-details-page"
import { getPublicCourt } from "@/lib/api"

type PageProps = {
  params: Promise<{ id: string }>
}

async function loadCourt(id: string) {
  try {
    const data = await getPublicCourt(id)
    return data.court ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const court = await loadCourt(id)
  const title = court?.nameEn || court?.name || "Court Details"
  return {
    title: `${title} | Mal3bk`,
  }
}

export default async function CourtDetailPage({ params }: PageProps) {
  const { id } = await params
  const court = await loadCourt(id)

  if (!court) {
    notFound()
  }

  return <CourtDetailsPage court={court} />
}
