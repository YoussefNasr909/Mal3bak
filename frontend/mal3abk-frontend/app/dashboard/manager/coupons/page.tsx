import type { Metadata } from "next"
import { redirect } from "next/navigation"

export const metadata: Metadata = {
  title: "Manager Coupons & Promo Codes",
}

export default function ManagerCouponsRoute() {
  // Temporary: Disable manager access to promo codes page
  redirect("/dashboard/manager")
}
