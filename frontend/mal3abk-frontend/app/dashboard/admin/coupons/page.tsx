import type { Metadata } from "next"
import { CouponsPage } from "@/components/dashboard/coupons/coupons-page"

export const metadata: Metadata = {
  title: "Admin Coupons & Promo Codes",
}

export default function AdminCouponsRoute() {
  return <CouponsPage role="admin" />
}
