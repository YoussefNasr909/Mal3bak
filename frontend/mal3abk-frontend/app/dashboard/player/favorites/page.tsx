import type { Metadata } from "next"
import { FavoritesPage } from "@/components/dashboard/player/favorites-page"

export const metadata: Metadata = {
  title: "Favorites",
}

export default function PlayerFavoritesPage() {
  return <FavoritesPage />
}
