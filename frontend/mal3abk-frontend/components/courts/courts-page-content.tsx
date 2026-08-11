"use client"
import { useLanguage } from "@/components/providers/language-provider"
import { BrowseCourtsPage } from "@/components/dashboard/player/browse-courts-page"

export function CourtsPageContent() {
  const { language, direction } = useLanguage()

  return <BrowseCourtsPage />
}

