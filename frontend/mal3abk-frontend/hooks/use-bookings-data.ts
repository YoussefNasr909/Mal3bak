"use client"

import { useState, useMemo, useCallback, useEffect, useRef } from "react"
import useSWR from "swr"
import {
  listBookings as listBookingsApi,
  listCourts as listCourtsApi,
  managerGetDashboardStats,
  type ListBookingsResponse,
  type ListCourtsResponse,
} from "@/lib/api"
import type { Booking } from "@/lib/types"
import { createEgyptDate, addDaysToISODate, getAbsoluteBookingTimes } from "@/lib/date"

// ---- Cairo-safe date helpers ----
const asDay = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number)
  return createEgyptDate(y, m, d, 12, 0)
}

const BOOKINGS_REFRESH_INTERVAL_MS = 60_000
const STATS_REFRESH_INTERVAL_MS = 60_000

const toLocalISODate = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())

// ---- Booking status helpers ----
export const normalizeBookingStatus = (status: string | null | undefined) =>
  String(status || "confirmed").toLowerCase() === "pending" ? "confirmed" : String(status || "confirmed").toLowerCase()

export const isCheckedInBooking = (booking: Booking) =>
  Boolean(
    booking.checkInVerified ||
      booking.checkedIn ||
      booking.status === "completed" ||
      booking.checkedInAt,
  )

export const isNoShowBooking = (booking: Booking) =>
  normalizeBookingStatus(booking.status) === "no_show" ||
  (normalizeBookingStatus(booking.status) === "confirmed" &&
    !isCheckedInBooking(booking) &&
    booking.windowState === "late")

export const isWalkInBooking = (booking: Pick<Booking, "userEmail"> | null | undefined) =>
  String(booking?.userEmail || "").toLowerCase().endsWith("@walkin.local")

export const getBookingDisplayStatus = (booking: Booking) => {
  const rawStatus = normalizeBookingStatus(booking.status)
  if (rawStatus === "missed" || isNoShowBooking(booking)) return "no_show"
  return rawStatus
}

export const getStatusBadgeVariant = (status: string) => {
  const normalizedStatus = normalizeBookingStatus(status)
  if (normalizedStatus === "confirmed" || normalizedStatus === "checked_in") return "success"
  if (normalizedStatus === "completed") return "info"
  if (normalizedStatus === "cancelled" || normalizedStatus === "no_show") return "destructive"
  return "default"
}

// ---- SWR fetchers ----
async function fetchBookings(params: any): Promise<ListBookingsResponse> {
  const res = await listBookingsApi(params)
  const items: Booking[] = Array.isArray(res) ? res : (res?.items || [])

  // Fix string sorting ("01:00" vs "23:00") by re-sorting the paginated results 
  // using absolute Cairo milliseconds. This correctly places overnight tails.
  if (params.sortBy === "date" && items.length > 0) {
    const isDesc = params.order !== "asc"
    items.sort((a, b) => {
      // 1. Same date chronologically
      const aOpen = (a as any).sessionOpenTime || (a as any).court?.openTime || "08:00"
      const bOpen = (b as any).sessionOpenTime || (b as any).court?.openTime || "08:00"
      const aMode = a.useOpeningDayForOvernightBookings === true || (a as any).court?.useOpeningDayForOvernightBookings === true
      const bMode = b.useOpeningDayForOvernightBookings === true || (b as any).court?.useOpeningDayForOvernightBookings === true

      const aMs = getAbsoluteBookingTimes(a.date, a.startTime, a.endTime, aOpen, aMode).startMs
      const bMs = getAbsoluteBookingTimes(b.date, b.startTime, b.endTime, bOpen, bMode).startMs

      return isDesc ? bMs - aMs : aMs - bMs
    })
  }

  return {
    items,
    total: Number((res as any)?.total || 0),
    page: Number((res as any)?.page || 1),
    limit: Number((res as any)?.limit || 10),
    pages: Math.max(1, Number((res as any)?.pages || 1)),
    summary: (res as any)?.summary || undefined,
    customerSummary: (res as any)?.customerSummary || undefined,
  }
}

async function fetchCourts(): Promise<any[]> {
  const res = await listCourtsApi({ limit: 100, page: 1 })
  return Array.isArray(res) ? res : (res?.items || [])
}

async function fetchStats() {
  return managerGetDashboardStats()
}

// ---- Custom hook ----
export interface UseBookingsDataOptions {
  searchQuery: string
  selectedStatus: string
  selectedCustomerType: string
  selectedCourt: string
  selectedDateRange: string
  sortBy: string
  isCalendarView: boolean
  page: number
  pageSize: number
}

export function useBookingsData(options: UseBookingsDataOptions) {
  const { searchQuery, selectedStatus, selectedCustomerType, selectedCourt, selectedDateRange, sortBy, isCalendarView, page, pageSize } = options

  const [todayISO, setTodayISO] = useState(toLocalISODate)
  useEffect(() => {
    const interval = setInterval(() => setTodayISO(toLocalISODate()), 60_000)
    return () => clearInterval(interval)
  }, [])
  const todayDay = useMemo(() => asDay(todayISO), [todayISO])

  // Build API params (stable serialization for SWR key)
  const apiParams = useMemo(() => {
    const params: any = {
      page: isCalendarView ? 1 : page,
      limit: isCalendarView ? 200 : pageSize,
      includeSummary: true,
    }

    if (searchQuery.trim()) params.q = searchQuery.trim()
    if (selectedCourt !== "all") params.courtId = selectedCourt

    if (selectedDateRange !== "all") {
      switch (selectedDateRange) {
        case "today":
          params.date = todayISO
          break
        case "tomorrow":
          params.date = addDaysToISODate(todayISO, 1)
          break
        case "this_week":
          params.dateFrom = todayISO
          params.dateTo = addDaysToISODate(todayISO, 7)
          break
        case "this_month":
          params.dateFrom = todayISO
          params.dateTo = addDaysToISODate(todayISO, 30)
          break
        case "past":
          params.bucket = "past"
          break
      }
    }

    if (selectedStatus === "checked_in") {
      params.attendance = "checked_in"
    } else if (selectedStatus !== "all") {
      params.status = selectedStatus
    }

    if (selectedCustomerType !== "all") {
      params.customerType = selectedCustomerType
    }

    switch (sortBy) {
      case "date_desc":
        params.sortBy = "date"; params.order = "desc"; break
      case "date_asc":
        params.sortBy = "date"; params.order = "asc"; break
      case "price_desc":
        params.sortBy = "amount"; params.order = "desc"; break
      case "price_asc":
        params.sortBy = "amount"; params.order = "asc"; break
      case "player_asc":
        params.sortBy = "player"; params.order = "asc"; break
      default:
        params.sortBy = "date"; params.order = "desc"
    }

    return params
  }, [isCalendarView, page, pageSize, searchQuery, selectedCourt, selectedCustomerType, selectedDateRange, selectedStatus, sortBy, todayISO])

  // SWR keys (stable JSON serialization)
  const bookingsKey = useMemo(() => ["bookings", JSON.stringify(apiParams)], [apiParams])

  // Bookings with SWR (stale-while-revalidate)
  const {
    data: bookingsData,
    isLoading: bookingsLoading,
    isValidating: bookingsValidating,
    mutate: mutateBookings,
  } = useSWR(
    bookingsKey,
    () => fetchBookings(apiParams),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: BOOKINGS_REFRESH_INTERVAL_MS,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      keepPreviousData: true, // ✅ Show stale data while revalidating for smooth UX
      dedupingInterval: 2000,
    }
  )

  // Courts with SWR (rarely changes, long dedup)
  const {
    data: courtsData,
    mutate: mutateCourts,
  } = useSWR(
    "manager-courts",
    fetchCourts,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      dedupingInterval: 60000, // 1 minute dedup — courts rarely change
    }
  )

  // Stats with SWR
  const {
    data: statsData,
    isValidating: statsValidating,
    mutate: mutateStats,
  } = useSWR(
    "manager-dashboard-stats",
    fetchStats,
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: STATS_REFRESH_INTERVAL_MS,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      dedupingInterval: 10000,
    }
  )

  // Derived data
  const bookings: Booking[] = bookingsData?.items || []
  const courts: any[] = courtsData || []
  const summaryData = bookingsData?.summary || null
  const customerSummaryData = bookingsData?.customerSummary || null
  const totalItems = bookingsData?.total || 0
  const totalPages = bookingsData?.pages || 1

  // Refresh all data (after mutations like check-in, cancel, create booking)
  const refreshAll = useCallback(async () => {
    await Promise.all([
      mutateBookings(),
      mutateCourts(),
      mutateStats(),
    ])
  }, [mutateBookings, mutateCourts, mutateStats])

  return {
    bookings,
    courts,
    statsData: statsData || null,
    summaryData,
    customerSummaryData,
    totalItems,
    totalPages,
    isLoading: bookingsLoading,
    isRefreshing: bookingsValidating || statsValidating,
    todayISO,
    todayDay,
    refreshAll,
    mutateBookings,
  }
}
