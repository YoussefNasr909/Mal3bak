import type { Metadata } from "next";
import { TournamentsPage } from "@/components/dashboard/tournaments/tournaments-page";
export const metadata: Metadata = { title: "Admin Tournaments | Mal3bk" };
export default function Page() { return <TournamentsPage role="admin" />; }
