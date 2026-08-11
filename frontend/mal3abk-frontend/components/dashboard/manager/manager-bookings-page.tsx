"use client"

import { useState, useMemo, useEffect, useCallback, useRef, startTransition, useTransition } from "react"
import { AnimatePresence } from "framer-motion"
import {
  Plus,
  Download,
  Ban,
  CheckCircle2,
  } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import {
  updateBooking as updateBookingApi,
  cancelBooking as cancelBookingApi,
  checkInBooking as checkInBookingApi,
} from "@/lib/api"
import { AnimatedContainer } from "@/components/ui/animated-container"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Booking } from "@/lib/types"
import { createEgyptDate } from "@/lib/date"

// Sub-components
import { useBookingsData, getBookingDisplayStatus } from "@/hooks/use-bookings-data"
import { BookingStatsCards } from "./bookings/booking-stats-cards"
import { BookingFilters } from "./bookings/booking-filters"
import { BookingTableView } from "./bookings/booking-table-view"
import { BookingListView } from "./bookings/booking-list-view"
import { BookingCalendarView } from "./bookings/booking-calendar-view"
import { csvEscape, format12h } from "./bookings/shared"
import { Suspense, lazy } from "react"

const BookingDetailsDialog = lazy(() => import("./bookings/booking-details-dialog").then(m => ({ default: m.BookingDetailsDialog })))
const NewBookingDialog = lazy(() => import("./bookings/new-booking-dialog").then(m => ({ default: m.NewBookingDialog })))

// ---- helpers ----
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    if (typeof window === "undefined") return
    const m = window.matchMedia(query)

    const onChange = () => setMatches(m.matches)
    onChange()

    if (m.addEventListener) m.addEventListener("change", onChange)
    else m.addListener(onChange)

    return () => {
      if (m.removeEventListener) m.removeEventListener("change", onChange)
      else m.removeListener(onChange)
    }
  }, [query])

  return matches
}

const asDay = (isoDate: string) => {
  const [y, m, d] = isoDate.split("-").map(Number)
  return createEgyptDate(y, m, d, 12, 0)
}

/** ---------- Component ---------- */
export function ManagerBookingsPage() {
  const { language, t } = useLanguage()
  const { user } = useAuth()

  const isMobile = useMediaQuery("(max-width: 767px)")
  const [isViewPending, startViewTransition] = useTransition()

  // ---- Filters state ----
  const [searchInput, setSearchInput] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selectedStatus, setSelectedStatus] = useState("all")
  const [selectedCustomerType, setSelectedCustomerType] = useState("all")
  const [selectedCourt, setSelectedCourt] = useState("all")
  const [selectedDateRange, setSelectedDateRange] = useState("all")
  const [sortBy, setSortBy] = useState("date_desc")
  const [viewMode, setViewMode] = useState<"list" | "calendar" | "table">("table")

  const [selectedBookings, setSelectedBookings] = useState<Set<string>>(new Set())

  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)

  const [actionDialogOpen, setActionDialogOpen] = useState(false)
  const [actionType, setActionType] = useState<string>("")

  const [page, setPage] = useState(1)
  const pageSize = 10

  const [newBookingOpen, setNewBookingOpen] = useState(false)

  // ---- Search debounce (300ms) ----
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
  }, [])

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [])

  // Default to cards on mobile
  useEffect(() => {
    if (isMobile) setViewMode("list")
  }, [isMobile])

  // ---- Data fetching with SWR ----
  const isCalendarView = viewMode === "calendar"

  const {
    bookings,
    courts,
    statsData,
    summaryData,
    customerSummaryData,
    totalItems,
    totalPages,
    isLoading,
    todayISO,
    refreshAll,
  } = useBookingsData({
    searchQuery: debouncedSearch,
    selectedStatus,
    selectedCustomerType,
    selectedCourt,
    selectedDateRange,
    sortBy,
    isCalendarView,
    page,
    pageSize,
  })

  // ---- Derived data ----
  const courtsById = useMemo(() => {
    const m = new Map<string, (typeof courts)[number]>()
    for (const c of courts) m.set(c.id, c)
    return m
  }, [courts])

  const managerCourts = useMemo(() => {
    const managerId = user?.id
    if (!managerId) return []
    return courts.filter((c) => c.managerId === managerId)
  }, [user?.id, courts])

  const statusCounts = useMemo(() => {
    if (summaryData) {
      return {
        confirmed: Number(summaryData.confirmed || 0),
        checked_in: Number(summaryData.checked_in || 0),
        pending: Number(summaryData.pending || 0),
        completed: Number(summaryData.completed || 0),
        cancelled: Number(summaryData.cancelled || 0),
        no_show: Number(summaryData.no_show || 0),
      }
    }
    return { confirmed: 0, checked_in: 0, pending: 0, completed: 0, cancelled: 0, no_show: 0 }
  }, [summaryData])

  const customerCounts = useMemo(() => {
    if (customerSummaryData) {
      return {
        total: Number(customerSummaryData.total || 0),
        guest: Number(customerSummaryData.guest || 0),
        registered: Number(customerSummaryData.registered || 0),
      }
    }

    return { total: 0, guest: 0, registered: 0 }
  }, [customerSummaryData])

  const stats = useMemo(() => {
    if (!statsData) return { total: 0, confirmed: 0, checkedIn: 0, cancelled: 0, pending: 0, noShow: 0, todayBookings: 0, upcomingBookings: 0 }

    return {
      total: statsData.totalBookings,
      confirmed: statsData.bookingCounts.confirmed,
      checkedIn: statsData.bookingCounts.checked_in || 0,
      cancelled: statsData.bookingCounts.cancelled,
      pending: statsData.bookingCounts.pending,
      noShow: statsData.bookingCounts.no_show,
      todayBookings: statsData.todayBookings,
      upcomingBookings: user?.stats?.upcomingBookings || 0,
    }
  }, [statsData, user?.stats])

  // ---- Callbacks ----
  const getPlayerInfo = useCallback(
    (booking: Booking) => {
      const name =
        language === "ar"
          ? booking.playerName || booking.userName || "—"
          : (booking as Booking & { playerNameEn?: string }).playerNameEn ||
            booking.playerName ||
            booking.userName ||
            "—"

      return {
        id: booking.userId || booking.playerId,
        name,
        phone: booking.userPhone || "N/A",
        email: booking.userEmail || "N/A",
        avatar: (booking as any).userAvatar || (booking as any).playerAvatar || (booking as any).avatar || (booking as any).user?.avatar || undefined,
      }
    },
    [language]
  )

  const getCourtInfo = useCallback(
    (booking: Booking) => {
      const court = courtsById.get(booking.courtId)
      return {
        name: language === "ar" ? booking.courtName || court?.name || "—" : booking.courtNameEn || court?.nameEn || "—",
        address: language === "ar" ? court?.address || "—" : court?.addressEn || "—",
        city: language === "ar" ? court?.city || "—" : court?.cityEn || "—",
        sportType: court?.sportType || booking.sportType || "",
        openTime: (booking as any).sessionOpenTime || court?.openTime || (booking as any).courtOpenTime,
        closeTime: (booking as any).sessionCloseTime || court?.closeTime || (booking as any).courtCloseTime,
      }
    },
    [language, courtsById]
  )

  const getStatusLabel = useCallback(
    (status: string) => {
      const labels: Record<string, { ar: string; en: string }> = {
        checked_in: { ar: "تم تسجيل الحضور", en: "Checked In" },
        pending: { ar: "مؤكد", en: "Confirmed" },
        confirmed: { ar: "مؤكد", en: "Confirmed" },
        cancelled: { ar: "ملغي", en: "Cancelled" },
        completed: { ar: "مكتمل", en: "Completed" },
        no_show: { ar: "لم يحضر", en: "Missed booking" },
      }
      return labels[status]?.[language] || status
    },
    [language]
  )

  const formatDate = useCallback(
    (date: string | Date) => {
      const dateObj = typeof date === "string" ? asDay(date) : date
      return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(dateObj)
    },
    [language]
  )

  // ---- Reset page on filter change ----
  useEffect(() => {
    setPage(1)
    setSelectedBookings(new Set())
  }, [debouncedSearch, selectedStatus, selectedCustomerType, selectedCourt, selectedDateRange, sortBy, viewMode])

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, totalPages)))
    setSelectedBookings(new Set())
  }, [totalPages])

  // ---- Dialog detail helpers ----
  const selectedBookingPlayer = useMemo(() => (selectedBooking ? getPlayerInfo(selectedBooking) : null), [selectedBooking, getPlayerInfo])
  const selectedBookingCourt = useMemo(() => (selectedBooking ? getCourtInfo(selectedBooking) : null), [selectedBooking, getCourtInfo])

  const handleViewDetails = useCallback((booking: Booking) => {
    startTransition(() => {
      setSelectedBooking(booking)
      setDetailsDialogOpen(true)
    })
  }, [])

  const handleBookingAction = useCallback((booking: Booking, action: string) => {
    startTransition(() => {
      setSelectedBooking(booking)
      setActionType(action)
      setActionDialogOpen(true)
    })
  }, [])

  const confirmAction = useCallback(async () => {
    if (!selectedBooking) return

    try {
      if (actionType === "check-in") {
        await checkInBookingApi(selectedBooking.id)
        toast.success(language === "ar" ? "تم تسجيل الحضور" : "Check-in successful")
      } else if (actionType === "cancel") {
        await cancelBookingApi(selectedBooking.id, { lang: language })
        toast.success(language === "ar" ? "تم إلغاء الحجز" : "Booking cancelled")
      } else if (actionType === "no-show") {
        await updateBookingApi(selectedBooking.id, { status: "no_show" })
        toast.success(language === "ar" ? "تم تسجيل عدم الحضور" : "Marked as missed booking")
      } else if (actionType === "approve") {
        await updateBookingApi(selectedBooking.id, { status: "confirmed" })
        toast.success(language === "ar" ? "تمت الموافقة" : "Approved")
      } else {
        toast.success(language === "ar" ? "تم تنفيذ الإجراء" : "Action completed")
      }
      await refreshAll()
    } catch (error: any) {
      toast.error(error?.message || (language === "ar" ? "تعذر تنفيذ الإجراء" : "Could not complete action"))
    }

    setActionDialogOpen(false)
    setSelectedBooking(null)
    setActionType("")
  }, [actionType, selectedBooking, language, refreshAll])

  // ---- Filter controls ----
  const clearFilters = useCallback(() => {
    startTransition(() => {
      setSearchInput("")
      setDebouncedSearch("")
      setSelectedStatus("all")
      setSelectedCustomerType("all")
      setSelectedCourt("all")
      setSelectedDateRange("all")
      setSortBy("date_desc")
    })
    toast.success(language === "ar" ? "تمت إعادة الضبط" : "Filters reset")
  }, [language])

  // ---- Bulk actions ----
  const totalSelected = selectedBookings.size
  const allSelected = bookings.length > 0 && selectedBookings.size === bookings.length

  const handleBulkAction = useCallback(
    async (action: string) => {
      if (selectedBookings.size === 0) {
        toast.error(language === "ar" ? "يرجى اختيار حجوزات" : "Please select bookings")
        return
      }

      if (action === "export") {
        const selected = bookings.filter((b) => selectedBookings.has(b.id))
        const csv = [
          [
            language === "ar" ? "اللاعب" : "Player",
            language === "ar" ? "الملعب" : "Court",
            language === "ar" ? "التاريخ" : "Date",
            language === "ar" ? "الوقت" : "Time",
            language === "ar" ? "المبلغ" : "Amount",
            language === "ar" ? "الحالة" : "Status",
          ].map(csvEscape).join(","),
          ...selected.map((b) =>
            [
              language === "ar" ? b.playerName || b.userName : b.playerNameEn || b.userName,
              language === "ar" ? b.courtName : b.courtNameEn,
              formatDate(b.date),
              `${b.startTime} - ${b.endTime}`,
              Number(b.totalPrice ?? b.amount ?? 0).toString(),
              getStatusLabel(getBookingDisplayStatus(b)),
            ]
              .map(csvEscape)
              .join(",")
          ),
        ].join("\n")

        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `bookings-selected-${todayISO}.csv`
        a.click()
        window.URL.revokeObjectURL(url)

        toast.success(language === "ar" ? "تم تصدير المحدد" : "Selected exported")
        setSelectedBookings(new Set())
        return
      }

      const ids = Array.from(selectedBookings)

      let results: PromiseSettledResult<unknown>[]

      if (action === "approve") {
        results = await Promise.allSettled(
          ids.map((id) => updateBookingApi(id, { status: "confirmed" }))
        )
      } else if (action === "cancel") {
        results = await Promise.allSettled(
          ids.map((id) => cancelBookingApi(id, { lang: language }))
        )
      } else if (action === "no-show") {
        results = await Promise.allSettled(
          ids.map((id) => updateBookingApi(id, { status: "no_show" }))
        )
      } else {
        // Unknown action — nothing to do
        setSelectedBookings(new Set())
        return
      }

      const successCount = results.filter((r) => r.status === "fulfilled").length
      const failCount = results.filter((r) => r.status === "rejected").length

      await refreshAll()

      if (successCount > 0) {
        toast.success(
          language === "ar"
            ? `تم تطبيق الإجراء على ${successCount} حجز`
            : `Action applied to ${successCount} booking(s)`
        )
      }
      if (failCount > 0) {
        toast.error(
          language === "ar"
            ? `فشل تطبيق الإجراء على ${failCount} حجز`
            : `Failed to apply action to ${failCount} booking(s)`
        )
      }

      setSelectedBookings(new Set())
    },
    [selectedBookings, bookings, language, formatDate, getStatusLabel, todayISO, refreshAll]
  )

  return (
    <div className="space-y-4 pb-20 md:pb-0">
      <BookingStatsCards
        stats={stats}
        language={language}
        isLoading={isLoading}
        headerTitle={language === "ar" ? "إدارة الحجوزات" : "Bookings"}
        description={language === "ar" ? "متابعة الحجوزات على ملاعبك" : "Track bookings on your courts"}
        actions={
          <Button
            size="sm"
            className="h-10 min-w-0 gap-2 rounded-xl px-3"
            onClick={() => startTransition(() => setNewBookingOpen(true))}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">{language === "ar" ? "حجز جديد" : "New booking"}</span>
          </Button>
        }
      />

      <Card className="overflow-hidden rounded-3xl border-border/60 shadow-sm">
        <BookingFilters
          embedded
          language={language}
          searchQuery={searchInput}
          onSearchChange={handleSearchChange}
          viewMode={viewMode}
          onViewModeChange={(mode) => startViewTransition(() => setViewMode(mode))}
          selectedCourt={selectedCourt}
          onCourtChange={(v) => startTransition(() => setSelectedCourt(v))}
          selectedDateRange={selectedDateRange}
          onDateRangeChange={(v) => startTransition(() => setSelectedDateRange(v))}
          sortBy={sortBy}
          onSortByChange={(v) => startTransition(() => setSortBy(v))}
          selectedStatus={selectedStatus}
          onStatusChange={(v) => startTransition(() => setSelectedStatus(v))}
          selectedCustomerType={selectedCustomerType}
          onCustomerTypeChange={(v) => startTransition(() => setSelectedCustomerType(v))}
          onClearFilters={clearFilters}
          managerCourts={managerCourts}
          statusCounts={statusCounts}
          customerCounts={customerCounts}
        />

        <AnimatePresence>
          {selectedBookings.size > 0 && (
            <>
              <div className="hidden border-b border-border/50 bg-primary/5 px-4 py-3 md:block md:px-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="bg-primary/10 border-primary/35 text-primary rounded-xl">
                          {totalSelected} {language === "ar" ? "محدد" : "selected"}
                        </Badge>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground transition"
                          onClick={() => setSelectedBookings(new Set())}
                        >
                          {language === "ar" ? "إلغاء التحديد" : "Clear selection"}
                        </button>
                        <Badge variant="outline" className="rounded-xl bg-background/50 border-border/60">
                          {language === "ar" ? (allSelected ? "الكل محدد" : "تحديد جزئي") : allSelected ? "All selected" : "Partial selection"}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" className="rounded-2xl" onClick={() => handleBulkAction("approve")}>
                          <CheckCircle2 className="me-2 h-4 w-4" />
                          {language === "ar" ? "موافقة" : "Approve"}
                        </Button>
                        <Button variant="outline" size="sm" className="rounded-2xl" onClick={() => handleBulkAction("cancel")}>
                          <Ban className="me-2 h-4 w-4" />
                          {language === "ar" ? "إلغاء" : "Cancel"}
                        </Button>
                        <Button variant="outline" size="sm" className="rounded-2xl" onClick={() => handleBulkAction("export")}>
                          <Download className="me-2 h-4 w-4" />
                          {language === "ar" ? "تصدير المحدد" : "Export selected"}
                        </Button>
                      </div>
                    </div>
              </div>

              <div className="md:hidden fixed bottom-3 left-3 right-3 z-30">
              <Card className="rounded-2xl border-primary/30 bg-card shadow-lg">
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="bg-primary/10 border-primary/35 text-primary rounded-xl">
                        {totalSelected}
                      </Badge>
                      <span className="text-xs text-muted-foreground truncate">
                        {language === "ar" ? "حجوزات محددة" : "Selected bookings"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-2xl" onClick={() => handleBulkAction("export")}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-2xl" onClick={() => handleBulkAction("cancel")}>
                        <Ban className="h-4 w-4" />
                      </Button>
                      <Button size="icon" className="h-9 w-9 rounded-2xl" onClick={() => handleBulkAction("approve")}>
                        <CheckCircle2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="mt-2 w-full text-center text-[11px] text-muted-foreground hover:text-foreground transition"
                    onClick={() => setSelectedBookings(new Set())}
                  >
                    {language === "ar" ? "إلغاء التحديد" : "Clear selection"}
                  </button>
                </CardContent>
              </Card>
              </div>
            </>
          )}
        </AnimatePresence>

        <div className="border-t border-border/50">
          <CardContent className={cn(viewMode === "table" ? "p-0" : "p-4 sm:p-5")}>
            <AnimatePresence mode="wait">
              {viewMode === "table" && (
                <BookingTableView
                  bookings={bookings}
                  language={language}
                  todayISO={todayISO}
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  getPlayerInfo={getPlayerInfo}
                  getCourtInfo={getCourtInfo}
                  getStatusLabel={getStatusLabel}
                  formatDate={formatDate}
                  onViewDetails={handleViewDetails}
                  onBookingAction={handleBookingAction}
                  sortBy={sortBy}
                  onSortByChange={(v) => startTransition(() => setSortBy(v))}
                  t={t}
                />
              )}

              {viewMode === "list" && (
                <BookingListView
                  bookings={bookings}
                  language={language}
                  todayISO={todayISO}
                  page={page}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  getPlayerInfo={getPlayerInfo}
                  getCourtInfo={getCourtInfo}
                  getStatusLabel={getStatusLabel}
                  formatDate={formatDate}
                  onViewDetails={handleViewDetails}
                  onBookingAction={handleBookingAction}
                  t={t}
                />
              )}

              {viewMode === "calendar" && (
                <BookingCalendarView
                  bookings={bookings}
                  language={language}
                  sortBy={sortBy}
                  getPlayerInfo={getPlayerInfo}
                  getCourtInfo={getCourtInfo}
                  getStatusLabel={getStatusLabel}
                  formatDate={formatDate}
                  onViewDetails={handleViewDetails}
                  t={t}
                />
              )}
            </AnimatePresence>
          </CardContent>
        </div>
      </Card>

      <Suspense fallback={null}>
        <BookingDetailsDialog
          open={detailsDialogOpen}
          onOpenChange={setDetailsDialogOpen}
          booking={selectedBooking}
          playerInfo={selectedBookingPlayer}
          courtInfo={selectedBookingCourt}
          language={language}
          getStatusLabel={getStatusLabel}
          formatDate={formatDate}
          onCheckIn={(booking) => handleBookingAction(booking, "check-in")}
          t={t}
        />
      </Suspense>

      {/* Action Confirmation Dialog */}
      <Dialog open={actionDialogOpen} onOpenChange={setActionDialogOpen}>
        <DialogContent dir={language === "ar" ? "rtl" : "ltr"} className="rounded-2xl w-[calc(100vw-2rem)] sm:w-auto">
          <DialogHeader>
            <DialogTitle className={cn(language === "ar" && "text-right")}>
              {actionType === "check-in" && (language === "ar" ? "تأكيد تسجيل الحضور" : "Confirm Check-in")}
              {actionType === "cancel" && (language === "ar" ? "تأكيد الإلغاء" : "Confirm Cancellation")}
              {actionType === "no-show" && (language === "ar" ? "تسجيل عدم الحضور" : "Mark missed booking")}
              {actionType === "approve" && (language === "ar" ? "تأكيد الموافقة" : "Confirm Approval")}
            </DialogTitle>
            <DialogDescription className={cn(language === "ar" && "text-right")}>
              {language === "ar" ? "هل أنت متأكد من تنفيذ هذا الإجراء؟" : "Are you sure you want to perform this action?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className={cn("gap-2", language === "ar" && "sm:flex-row-reverse sm:justify-start")}>
            <Button variant="outline" className="rounded-2xl" onClick={() => setActionDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="rounded-2xl" onClick={confirmAction}>
              {language === "ar" ? "تأكيد" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Booking Dialog */}
      <NewBookingDialog
        open={newBookingOpen}
        onOpenChange={setNewBookingOpen}
        managerCourts={managerCourts}
        todayISO={todayISO}
        onBookingCreated={refreshAll}
      />

      {/* Spacer for mobile sticky bulk bar */}
      {selectedBookings.size > 0 ? <div className="md:hidden h-24" /> : null}
    </div>
  )
}
