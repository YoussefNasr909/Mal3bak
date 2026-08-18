import type { Metadata } from "next"
import { CouponsPage } from "@/components/dashboard/coupons/coupons-page"

export const metadata: Metadata = {
  title: "Manager Coupons & Promo Codes",
}

export default function ManagerCouponsRoute() {
  return <CouponsPage role="manager" />
}
