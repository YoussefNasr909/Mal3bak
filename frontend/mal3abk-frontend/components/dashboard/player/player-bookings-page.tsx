"use client";

import type React from "react";
import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Calendar,
  Clock,
  Ticket,
  History,
  MapPin,
  ChevronRight,
  X,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Timer,
  CalendarDays,
  ListIcon,
  Copy,
  Eye,
  QrCode,
  Zap,
  Loader2,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { PaymentReceiptModal } from "@/components/dashboard/player/payment-receipt-modal";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useLanguage } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { AnimatedContainer } from "@/components/ui/animated-container";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { useIsMobile } from "@/components/ui/use-mobile";

import { Suspense, lazy } from "react";
const CheckInCodeDialogContent = lazy(() => import("@/components/dashboard/player/check-in-code-dialog-content").then(m => ({ default: m.CheckInCodeDialogContent })));
const BookingCalendar = lazy(() => import("@/components/dashboard/player/booking-calendar").then(m => ({ default: m.BookingCalendar })));


import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

import type { Booking } from "@/lib/types";
import {
  parseISODateLocal,
  getAbsoluteBookingTimes,
} from "@/lib/date";
import {
  timeToMinutes,
  minutesToTime,
  checkNextDay,
  format12h,
} from "@/lib/time";
import {
  PLAYER_BOOKING_CHANGE_WINDOW_HOURS,
  PLAYER_BOOKING_CHANGE_WINDOW_MS,
} from "@/lib/booking-policy";
import {
  listBookings as listBookingsApi,
  updateBookingStatus as updateBookingStatusApi,
  cancelBooking as cancelBookingApi,
  getBooking as getBookingApi,
  createPaymobCheckoutSession,
} from "@/lib/api";

/* ---------------------------------- utils --------------------------------- */

const EGYPT_TIME_ZONE = "Africa/Cairo";

function getRealBookingDate(booking: BookingWithCode) {
  const openTime = booking.sessionOpenTime || booking.courtOpenTime || "08:00";
  const endRef = booking.endTime || minutesToTime(timeToMinutes(booking.startTime || "00:00") + 60);
  const { start } = getAbsoluteBookingTimes(
    booking.date,
    booking.startTime || "00:00",
    endRef,
    openTime,
    booking.useOpeningDayForOvernightBookings === true,
  );
  return start;
}

type BookingWithCode = Booking & {
  createdAt?: string;
  courtCity?: string;
  courtCityEn?: string;
};

function bookingDurationMinutes(b: BookingWithCode) {
  const s = timeToMinutes(b.startTime || "00:00");
  let e = timeToMinutes(b.endTime || "00:00");
  if (e <= s) e += 1440;
  return e - s;
}

function hasAttendanceRecord(booking: Partial<BookingWithCode> | null | undefined) {
  return Boolean(
    booking?.status === "completed" ||
      booking?.checkInVerified === true ||
      booking?.checkedIn === true ||
      booking?.checkedInAt,
  );
}

function BookingCountdown({
  date,
  startTime,
  endTime,
  courtOpenTime,
  language,
  useOpeningDay,
}: {
  date: string;
  startTime: string;
  endTime?: string;
  courtOpenTime?: string;
  language: "ar" | "en";
  useOpeningDay?: boolean;
}) {
  const [label, setLabel] = useState("");
  const [isLive, setIsLive] = useState(false);

  useEffect(() => {
    if (!date || !startTime) return;

    const tick = () => {
      const resolvedOpenTime = courtOpenTime || "08:00";
      const resolvedEndTime =
        endTime || minutesToTime(timeToMinutes(startTime) + 60);
      const { startMs, endMs } = getAbsoluteBookingTimes(
        date,
        startTime,
        resolvedEndTime,
        resolvedOpenTime,
        useOpeningDay,
      );
      const now = Date.now();

      if (now >= endMs) {
        setLabel("");
        setIsLive(false);
        return;
      }

      if (now >= startMs) {
        setLabel(language === "ar" ? "الآن" : "Now");
        setIsLive(true);
        return;
      }

      const diff = startMs - now;
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setIsLive(false);
      setLabel(
        language === "ar"
          ? [
              hours > 0 ? `${hours} س` : "",
              minutes > 0 ? `${minutes} د` : "",
              `${seconds} ث`,
            ]
              .filter(Boolean)
              .join(" ")
          : `${hours}h ${minutes}m ${seconds}s`,
      );
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [courtOpenTime, date, endTime, language, startTime, useOpeningDay]);

  if (!label) return null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm",
        isLive
          ? "border-emerald-500/25 bg-emerald-500/12 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:text-emerald-300",
      )}
    >
      <Clock className={cn("h-3.5 w-3.5", isLive && "animate-pulse")} />
      <span className="font-mono font-bold">{label}</span>
      {!isLive && (
        <span className="opacity-80">
          {language === "ar" ? "متبقي" : "left"}
        </span>
      )}
    </div>
  );
}

function getBookingChangeWindowText(language: string) {
  return language === "ar"
    ? `الإلغاء متاح حتى ${PLAYER_BOOKING_CHANGE_WINDOW_HOURS} ساعات قبل موعد الحجز.`
    : `Cancel is available until ${PLAYER_BOOKING_CHANGE_WINDOW_HOURS} hours before the booking starts.`;
}

/* ---------------------------------- page ---------------------------------- */

export function PlayerBookingsPage() {
  const { language, t, direction } = useLanguage();
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const isMobile = useIsMobile();


  // ✅ store-driven state
  const [bookings, setBookingsState] = useState<BookingWithCode[]>([]);
  const [allBookings, setAllBookings] = useState<BookingWithCode[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingQrId, setPendingQrId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // UI state
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTab, setSelectedTab] = useState<"upcoming" | "past">(
    "upcoming",
  );
  const [sortBy, setSortBy] = useState<
    "date" | "date_desc" | "price" | "price_desc"
  >("date");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "confirmed" | "completed" | "cancelled" | "no_show" | "paid"
  >("all");
  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");

  // dialogs
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [receiptBooking, setReceiptBooking] = useState<BookingWithCode | null>(null);

  const [selectedBooking, setSelectedBooking] =
    useState<BookingWithCode | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = isMobile ? 3 : 6;
  const [totalPages, setTotalPages] = useState(1);
  const isCalendarView = viewMode === "calendar";

  const bookingLoadErrorMessage =
    language === "ar"
      ? "تعذر تحميل الحجوزات الآن. حاول مرة أخرى."
      : "Could not load bookings right now. Please try again.";

  const loadBookingsFromApi = useCallback(async () => {
    try {
      setLoadError(null);
      const params: any = {
        mine: true,
        limit: isCalendarView ? 200 : pageSize,
        page: isCalendarView ? 1 : currentPage,
        bucket: selectedTab === "upcoming" ? "upcoming" : "history",
      };

      if (debouncedSearch.trim()) params.q = debouncedSearch.trim();
      if (statusFilter === "paid") {
        params.paymentStatus = "paid";
      } else if (statusFilter !== "all") {
        params.status = statusFilter;
      }

      // Sort mapping
      if (sortBy === "date") {
        params.sortBy = "date";
        params.order = selectedTab === "upcoming" ? "asc" : "desc";
      } else if (sortBy === "date_desc") {
        params.sortBy = "date";
        params.order = "desc";
      } else if (sortBy === "price") {
        params.sortBy = "amount";
        params.order = "asc";
      } else if (sortBy === "price_desc") {
        params.sortBy = "amount";
        params.order = "desc";
      }

      let res = await listBookingsApi(params);
      let items = (res.items || []) as BookingWithCode[];

      if (isCalendarView) {
        const allItems = [...items];
        const totalPagesForCalendar = Math.max(1, Number(res.pages || 1));
        if (totalPagesForCalendar > 1) {
          const pageRequests = Array.from({ length: totalPagesForCalendar - 1 }, (_, index) =>
            listBookingsApi({ ...params, page: index + 2 }),
          )
          const pageResponses = await Promise.all(pageRequests)
          for (const nextRes of pageResponses) {
            allItems.push(...((nextRes.items || []) as BookingWithCode[]))
          }
        }
        items = allItems;
      }

      setBookingsState(items);
      setTotalPages(isCalendarView ? 1 : Math.max(1, Number(res.pages || 1)));
    } catch (error) {
      console.error(error);
      setLoadError(bookingLoadErrorMessage);
      toast.error(bookingLoadErrorMessage);
    }
  }, [
    currentPage,
    isCalendarView,
    pageSize,
    debouncedSearch,
    selectedTab,
    sortBy,
    statusFilter,
    bookingLoadErrorMessage,
  ]);


  const loadAllBookingsForStats = useCallback(async () => {
    try {
      const params: any = {
        mine: true,
        limit: 200,
        page: 1,
        sortBy: "date",
        order: "desc",
      };

      const firstRes = await listBookingsApi(params);
      const merged = [...((firstRes.items || []) as BookingWithCode[])];
      const totalPagesForStats = Math.max(1, Number(firstRes.pages || 1));

      if (totalPagesForStats > 1) {
        const pageRequests = Array.from(
          { length: totalPagesForStats - 1 },
          (_, index) => listBookingsApi({ ...params, page: index + 2 }),
        );
        const responses = await Promise.all(pageRequests);
        for (const nextRes of responses) {
          merged.push(...((nextRes.items || []) as BookingWithCode[]));
        }
      }

      const deduped = Array.from(new Map(merged.map((booking) => [booking.id, booking])).values());
      setAllBookings(deduped);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const clearQrQuery = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      if (!url.searchParams.has("qr")) return;
      url.searchParams.delete("qr");
      window.history.replaceState({}, "", url.toString());
    } catch {}
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedTab, sortBy, statusFilter, isMobile, viewMode]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, Math.max(1, totalPages)));
  }, [totalPages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadBookingsFromApi();
  }, [loadBookingsFromApi]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    loadAllBookingsForStats();
  }, [loadAllBookingsForStats]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const url = new URL(window.location.href);
      setPendingQrId(url.searchParams.get("qr"));
    } catch {
      setPendingQrId(null);
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const openQR = useCallback(
    (b: BookingWithCode) => {
      if (!b.checkInCode) {
        toast.error(
          language === "ar"
            ? "لا يوجد كود للحجز بعد"
            : "This booking has no code yet",
        );
        return;
      }
      setSelectedBooking(b);
      setDetailsOpen(false);
      setQrDialogOpen(true);
    },
    [language],
  );
  useEffect(() => {
    if (!pendingQrId) return;

    const bookingFromLoadedData = allBookings.find((booking) => booking.id === pendingQrId);
    if (bookingFromLoadedData) {
      openQR(bookingFromLoadedData);
      clearQrQuery();
      setPendingQrId(null);
      return;
    }

    let isCancelled = false;

    const fetchBookingForQr = async () => {
      try {
        const result = await getBookingApi(pendingQrId);
        if (isCancelled || !result?.booking) return;
        const booking = result.booking as BookingWithCode;
        setAllBookings((prev) => {
          const next = new Map(prev.map((item) => [item.id, item]));
          next.set(booking.id, booking);
          return Array.from(next.values());
        });
        openQR(booking);
      } catch (error) {
        console.error(error);
        toast.error(
          language === "ar"
            ? "تعذر فتح رمز الحجز الآن"
            : "Could not open the booking QR code right now",
        );
      } finally {
        if (!isCancelled) {
          clearQrQuery();
          setPendingQrId(null);
        }
      }
    };

    fetchBookingForQr();

    return () => {
      isCancelled = true;
    };
  }, [allBookings, clearQrQuery, language, openQR, pendingQrId]);

  const playerBookings = useMemo(() => {
    const pid = user?.id;
    return bookings.filter(
      (b) => (b as any).playerId === pid || (b as any).userId === pid,
    );
  }, [bookings, user?.id]);

  const allPlayerBookings = useMemo(() => {
    const pid = user?.id;
    const source = allBookings.length ? allBookings : bookings;
    return source.filter(
      (b) => (b as any).playerId === pid || (b as any).userId === pid,
    );
  }, [allBookings, bookings, user?.id]);

  const counts = useMemo(() => {
    const totalBookings = allPlayerBookings.length;
    const upcomingCount = allPlayerBookings.filter((b) => {
      const openTime = b.sessionOpenTime || b.courtOpenTime || "08:00";
      const { endMs } = getAbsoluteBookingTimes(
        b.date,
        b.startTime || "00:00",
        b.endTime || "23:59",
        openTime,
        b.useOpeningDayForOvernightBookings === true,
      );
      return endMs > nowMs && b.status === "confirmed";
    }).length;

    const totalHours = allPlayerBookings.reduce(
      (acc, b) => acc + bookingDurationMinutes(b) / 60,
      0,
    );

    return {
      upcomingCount,
      pastCount: Math.max(0, totalBookings - upcomingCount),
      totalHours: Math.round(totalHours * 10) / 10,
      totalBookings,
    };
  }, [allPlayerBookings, nowMs]);

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
      timeZone: EGYPT_TIME_ZONE,
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(date);
  };

  const normalizedQuery = useMemo(
    () => searchQuery.trim().toLowerCase(),
    [searchQuery],
  );

  const filteredBookings = bookings;
  const sortedBookings = filteredBookings;
  const paginatedBookings = filteredBookings;

  const pageNumbers = useMemo(() => {
    const maxNumbers = 5;
    const start = Math.max(
      1,
      Math.min(currentPage - 2, Math.max(1, totalPages - maxNumbers + 1)),
    );
    const end = Math.min(totalPages, start + maxNumbers - 1);
    const arr: number[] = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return { arr, start, end };
  }, [currentPage, totalPages]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(language === "ar" ? "تم النسخ" : "Copied");
    } catch {
      toast.error(language === "ar" ? "فشل النسخ" : "Copy failed");
    }
  };

  const getStatusConfig = (status: string, booking?: any) => {
    // For confirmed bookings, check if checked in or missed
    if (status === "confirmed" && booking) {
      if (hasAttendanceRecord(booking)) {
        return {
          icon: CheckCircle2,
          color: "text-green-600",
          bg: "bg-green-500/10",
          label: { ar: "تم الحضور", en: "Checked In" },
        };
      }

      const openTime = booking.sessionOpenTime || booking.courtOpenTime || "08:00";
      const { endMs } = getAbsoluteBookingTimes(
        booking.date,
        booking.startTime || "00:00",
        booking.endTime || "23:59",
        openTime,
        booking.useOpeningDayForOvernightBookings === true,
      );

      if (nowMs > endMs) {
        return {
          icon: AlertCircle,
          color: "text-red-600",
          bg: "bg-red-500/10",
          label: { ar: "لم يحضر", en: "Missed booking" },
        };
      }
      return null;
    }
    const configs: Record<
      string,
      {
        icon: React.ElementType;
        color: string;
        bg: string;
        label: { ar: string; en: string };
      }
    > = {
      completed: {
        icon: CheckCircle2,
        color: "text-blue-600",
        bg: "bg-blue-500/10",
        label: { ar: "مكتمل", en: "Completed" },
      },
      cancelled: {
        icon: XCircle,
        color: "text-red-600",
        bg: "bg-red-500/10",
        label: { ar: "ملغي", en: "Cancelled" },
      },
      no_show: {
        icon: AlertCircle,
        color: "text-red-600",
        bg: "bg-red-500/10",
        label: { ar: "لم يحضر", en: "Missed booking" },
      },
    };
    return configs[status] || null;
  };

  const openDetails = (b: BookingWithCode) => {
    setSelectedBooking(b);
    setDetailsOpen(true);
  };

  const handleCancelBooking = async (bookingId: string) => {
    try {
      const res = await cancelBookingApi(bookingId, { lang: language }) as any;
      await Promise.all([
        loadBookingsFromApi(),
        loadAllBookingsForStats(),
        refreshUser().catch(() => null),
      ]);
      if (res?.message) {
        if (res.refundIssued) {
          toast.success(res.message, { duration: 6000 });
        } else {
          toast.info(res.message, { duration: 5000 });
        }
      } else {
        toast.success(language === "ar" ? "تم إلغاء الحجز" : "Booking cancelled");
      }
      setDetailsOpen(false);
    } catch (error: any) {
      toast.error(
        error?.message ||
          (language === "ar" ? "فشل إلغاء الحجز" : "Failed to cancel booking"),
      );
    }
  };

  const [isPayingPaymob, setIsPayingPaymob] = useState(false);

  const handlePaymobPayForBooking = async (bookingId: string) => {
    if (isPayingPaymob) return;
    setIsPayingPaymob(false); // Reset immediately to allow retry
    setIsPayingPaymob(true);

    try {
      const sessionData = await createPaymobCheckoutSession({
        bookingId,
      });

      if (!sessionData?.checkoutUrl) {
        throw new Error("No checkout URL received from server");
      }

      toast.loading(language === "ar" ? "جاري التحويل لصفحة باي موب..." : "Redirecting to Paymob...");
      window.location.href = sessionData.checkoutUrl;
    } catch (e: any) {
      console.error("Payment initiation error:", e);
      
      let errorMessage = language === "ar"
        ? "فشل بدء عملية الدفع عبر باي موب"
        : "Paymob payment initiation failed";

      // Provide more specific error messages
      if (e?.status === 401) {
        errorMessage = language === "ar"
          ? "انتهت صلاحية جلستك. يرجى تسجيل الدخول مجددا"
          : "Session expired. Please log in again";
      } else if (e?.status === 403) {
        errorMessage = language === "ar"
          ? "ليس لديك صلاحية لهذه العملية"
          : "You don't have permission for this action";
      } else if (e?.status === 404) {
        errorMessage = language === "ar"
          ? "الحجز غير موجود"
          : "Booking not found";
      } else if (e?.name === "NetworkError") {
        errorMessage = language === "ar"
          ? "خطأ في الاتصال. تأكد من اتصالك بالإنترنت"
          : "Connection error. Check your internet connection";
      } else if (e?.message) {
        errorMessage = e.message;
      }

      toast.error(errorMessage);
      setIsPayingPaymob(false);
    }
  };

  // Auto-refresh bookings when user returns from payment (visibility change)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleVisibilityChange = () => {
      // Refresh bookings when user returns to the page
      if (document.visibilityState === "visible") {
        loadBookingsFromApi();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [loadBookingsFromApi]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <AnimatedContainer animation="fade-up">
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-primary/10 via-blue-500/5 to-background border border-border/50 p-6 md:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">
                  {t("dashboard.myBookings")}
                </h1>
                <p className="text-sm text-muted-foreground mt-2 font-medium">
                    {language === "ar"
                      ? "إدارة حجوزاتك بسهولة. ستحصل على كود من 8 رموز لتأكيد حضورك في الملعب."
                      : "Manage your bookings easily. Present your 8-character check-in code at the venue."}
                  </p>
              </div>

              <div className="mt-4 md:mt-0 w-full md:w-auto flex justify-start md:justify-end">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 px-4 py-3 rounded-2xl bg-background/80 backdrop-blur-sm border border-border/50 w-full sm:w-auto flex-1">
                  <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3">
                    <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-primary/10">
                      <CalendarDays className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    </div>
                    <div className="text-center sm:text-start">
                      <p className="text-lg sm:text-2xl font-bold text-primary leading-tight">
                        {counts.upcomingCount}
                      </p>
                      <p className="text-[11px] sm:text-xs text-muted-foreground">
                        {language === "ar" ? "قادمة" : "Upcoming"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3 border-x border-border px-2 sm:px-4">
                    <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-muted">
                      <History className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                    </div>
                    <div className="text-center sm:text-start">
                      <p className="text-lg sm:text-2xl font-bold text-muted-foreground leading-tight">
                        {counts.pastCount}
                      </p>
                      <p className="text-[11px] sm:text-xs text-muted-foreground">
                        {language === "ar" ? "السجل" : "History"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-center sm:justify-start gap-2 sm:gap-3">
                    <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-lg bg-amber-500/10">
                      <Clock className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600" />
                    </div>
                    <div className="text-center sm:text-start">
                      <p className="text-lg sm:text-2xl font-bold text-foreground leading-tight">
                        {counts.totalHours}
                      </p>
                      <p className="text-[11px] sm:text-xs text-muted-foreground">
                        {language === "ar" ? "ساعات" : "Hours"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedContainer>

      {/* Filters and Controls */}
      <Card className="mb-6 overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
        <CardContent className="p-3 sm:p-5">
            <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row">
              <div className="flex w-full flex-1 flex-col gap-2 sm:gap-3 lg:w-auto">
                <div className="relative flex-1">
                  <Search className="absolute inset-s-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:inset-s-4 sm:h-5 sm:w-5" />
                  <Input
                    placeholder={
                      language === "ar"
                        ? "ابحث (اسم الملعب / الكود / التاريخ)..."
                        : "Search (court / code / date)..."
                    }
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-10 rounded-xl border-border/60 bg-muted/30 ps-10 text-sm font-medium sm:h-11 sm:ps-11"
                  />
                  {searchQuery && (
                    <button
                      aria-label={
                        language === "ar" ? "مسح البحث" : "Clear search"
                      }
                      onClick={() => setSearchQuery("")}
                      className="absolute inset-e-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full hover:bg-muted/80 text-muted-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid w-full grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 sm:flex sm:w-auto sm:gap-3">

                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as any)}
                >
                  <SelectTrigger className="h-10 min-w-0 rounded-xl border-border/60 bg-muted/30 px-3 text-xs sm:h-11 sm:w-[180px] sm:text-sm [&>span]:truncate">
                    <SelectValue
                      placeholder={language === "ar" ? "الحالة" : "Status"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {language === "ar" ? "الكل" : "All"}
                    </SelectItem>
                    <SelectItem value="confirmed">
                      {language === "ar" ? "مؤكد" : "Confirmed"}
                    </SelectItem>
                    <SelectItem value="completed">
                      {language === "ar" ? "مكتمل" : "Completed"}
                    </SelectItem>
                    <SelectItem value="cancelled">
                      {language === "ar" ? "ملغي" : "Cancelled"}
                    </SelectItem>
                    <SelectItem value="no_show">
                      {language === "ar" ? "لم يحضر" : "Missed booking"}
                    </SelectItem>
                    <SelectItem value="paid">
                      {language === "ar" ? "مدفوع أونلاين" : "Paid Online"}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={sortBy}
                  onValueChange={(v) => setSortBy(v as any)}
                >
                  <SelectTrigger className="h-10 min-w-0 rounded-xl border-border/60 bg-muted/30 px-3 text-xs sm:h-11 sm:w-[180px] sm:text-sm [&>span]:truncate">
                    <SelectValue
                      placeholder={language === "ar" ? "ترتيب" : "Sort"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="date">
                      {language === "ar" ? "الأقرب أولاً" : "Nearest first"}
                    </SelectItem>
                    <SelectItem value="date_desc">
                      {language === "ar" ? "الأبعد أولاً" : "Farthest first"}
                    </SelectItem>
                    <SelectItem value="price">
                      {language === "ar" ? "الأقل سعراً" : "Lowest price"}
                    </SelectItem>
                    <SelectItem value="price_desc">
                      {language === "ar" ? "الأعلى سعراً" : "Highest price"}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex h-10 shrink-0 items-center rounded-xl border border-border/60 bg-muted/30 p-1 sm:hidden">
                  <Button
                    type="button"
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setViewMode("list")}
                    aria-label={language === "ar" ? "Ø¹Ø±Ø¶ Ø§Ù„Ù‚Ø§Ø¦Ù…Ø©" : "List view"}
                  >
                    <ListIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "calendar" ? "default" : "ghost"}
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setViewMode("calendar")}
                    aria-label={language === "ar" ? "Ø¹Ø±Ø¶ Ø§Ù„ØªÙ‚ÙˆÙŠÙ…" : "Calendar view"}
                  >
                    <Calendar className="h-4 w-4" />
                  </Button>
                </div>
                </div>
              </div>

              <div className="flex w-full items-center gap-2 lg:w-auto">
                <div className="hidden h-11 shrink-0 items-center rounded-xl border border-border/60 bg-muted/30 p-1 sm:flex">
                  <Button
                    type="button"
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    onClick={() => setViewMode("list")}
                    aria-label={language === "ar" ? "عرض القائمة" : "List view"}
                  >
                    <ListIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={viewMode === "calendar" ? "default" : "ghost"}
                    size="icon"
                    className="h-9 w-9 rounded-lg"
                    onClick={() => setViewMode("calendar")}
                    aria-label={language === "ar" ? "عرض التقويم" : "Calendar view"}
                  >
                    <Calendar className="h-4 w-4" />
                  </Button>
                </div>
                
                <Tabs
                  value={selectedTab}
                  onValueChange={(v) => setSelectedTab(v as any)}
                  className="flex-1 sm:flex-initial"
                >
                  <TabsList className="h-10 w-full rounded-xl p-1 sm:h-11">
                  <TabsTrigger
                    value="upcoming"
                    className="rounded-lg gap-1.5 px-3 text-xs sm:gap-2 sm:px-4 sm:text-sm"
                  >
                    <Ticket className="h-4 w-4" />
                    {language === "ar" ? "قادمة" : "Upcoming"}
                    {counts.upcomingCount > 0 && (
                      <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                        {counts.upcomingCount}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="past" className="rounded-lg gap-1.5 px-3 text-xs sm:gap-2 sm:px-4 sm:text-sm">
                    <History className="h-4 w-4" />
                    {language === "ar" ? "السجل" : "History"}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              </div>
            </div>
          </CardContent>

        {/* List View Inside the Same Card */}
        {viewMode === "list" && (
          <div className="border-t border-border/50 bg-card/40 p-4 sm:p-5">
            <div className="space-y-4 pb-4">
              {loadError && sortedBookings.length > 0 && (
              <div className="flex flex-col gap-3 border border-border/50 bg-destructive/5 px-4 py-4 rounded-2xl text-sm text-destructive sm:flex-row sm:items-center sm:justify-between">
                <p className="font-semibold">{loadError}</p>
                <Button variant="outline" size="sm" onClick={() => void loadBookingsFromApi()} className="bg-background rounded-xl">
                  {language === "ar" ? "إعادة المحاولة" : "Retry"}
                </Button>
              </div>
            )}
            {sortedBookings.length === 0 ? (
              <AnimatedContainer animation="fade-up" delay={120}>
                <EmptyState
                  icon={loadError ? AlertCircle : selectedTab === "upcoming" ? Calendar : History}
                  title={loadError ? (language === "ar" ? "تعذر تحميل الحجوزات" : "Could not load bookings") : (language === "ar" ? "لا توجد حجوزات" : "No bookings")}
                  description={
                    loadError
                      ? loadError
                      : language === "ar"
                        ? "ابدأ بحجز ملعب الآن واستمتع باللعب"
                        : "Start by booking a court now and enjoy playing"
                  }
                  action={loadError ? { label: language === "ar" ? "إعادة المحاولة" : "Retry", onClick: () => void loadBookingsFromApi() } : {
                    label:
                      language === "ar" ? "استكشف الملاعب" : "Explore courts",
                    href: "/dashboard/player/browse",
                  }}
                />
              </AnimatedContainer>
            ) : (
              paginatedBookings.map((booking, index) => {
                const dateObj = getRealBookingDate(booking);
                const statusConfig = getStatusConfig(booking.status, booking);
                const StatusIcon = statusConfig?.icon || CheckCircle2;

                const bookingIsDidNotAttend = booking.status === "no_show";

                const openRef =
                  (booking as any).sessionOpenTime ||
                  booking.courtOpenTime ||
                  "08:00";
                const endRef =
                  booking.endTime ||
                  minutesToTime(timeToMinutes(booking.startTime || "00:00") + 60);
                const { startMs: listBookingStartMs } = getAbsoluteBookingTimes(
                  booking.date,
                  booking.startTime || "00:00",
                  endRef,
                  openRef,
                  booking.useOpeningDayForOvernightBookings === true,
                );
                const canCancelListItem =
                  booking.status === "confirmed" &&
                  Date.now() < listBookingStartMs - PLAYER_BOOKING_CHANGE_WINDOW_MS;
                return (
                  <div
                    key={booking.id}
                    className="group cursor-pointer rounded-[1.25rem] border border-border/50 bg-card overflow-hidden shadow-sm transition-all duration-300 hover:shadow-md hover:border-primary/40 hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-4"
                    style={{ animationDuration: "400ms", animationFillMode: "both" }}
                    onClick={() => openDetails(booking)}
                  >
                    <div className="flex flex-col md:flex-row relative">
                        <div className="hidden md:flex md:w-32 p-5 flex-col items-center justify-center gap-2 bg-muted/30 border-e border-border/50">
                          <div className="text-center">
                            <p className="text-3xl font-bold text-primary">
                              {new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
                                timeZone: EGYPT_TIME_ZONE,
                                day: "numeric",
                              }).format(dateObj)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Intl.DateTimeFormat(
                                language === "ar" ? "ar-EG" : "en-US",
                                { timeZone: EGYPT_TIME_ZONE, month: "short" },
                              ).format(dateObj)}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {new Intl.DateTimeFormat(
                                language === "ar" ? "ar-EG" : "en-US",
                                { timeZone: EGYPT_TIME_ZONE, weekday: "short" },
                              ).format(dateObj)}
                            </p>
                          </div>
                        </div>

                        <div className="flex-1 p-4 sm:p-5">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2 sm:gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <h3 className="text-base sm:text-lg font-bold text-foreground truncate">
                                  {language === "ar"
                                    ? booking.courtName
                                    : booking.courtNameEn}
                                </h3>

                                {statusConfig && (
                                  <Badge
                                    className={`${statusConfig.bg} ${statusConfig.color} border-0 shrink-0`}
                                  >
                                    <StatusIcon className="h-3.5 w-3.5 me-1" />
                                    {language === "ar"
                                      ? statusConfig.label.ar
                                      : statusConfig.label.en}
                                  </Badge>
                                )}

                                {booking.status === "confirmed" &&
                                  booking.checkInCode &&
                                  !bookingIsDidNotAttend && (
                                    <Badge
                                      variant="secondary"
                                      className="rounded-xl font-mono tracking-widest shrink-0"
                                    >
                                      {language === "ar" ? "كود:" : "Code:"}{" "}
                                      {booking.checkInCode}
                                    </Badge>
                                  )}
                              </div>

                              <div className="flex flex-wrap gap-3 text-xs sm:text-sm text-muted-foreground">
                                <span className="flex items-center gap-1.5" dir="ltr">
                                  <Clock className="h-4 w-4" />
                                  {format12h(booking.startTime, language)} -{" "}
                                  {format12h(booking.endTime, language)}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <CalendarDays className="h-4 w-4" />
                                  {new Intl.DateTimeFormat(
                                    language === "ar" ? "ar-EG" : "en-US",
                                    {
                                      timeZone: EGYPT_TIME_ZONE,
                                      weekday: "short",
                                      month: "short",
                                      day: "numeric",
                                    },
                                  ).format(dateObj)}
                                </span>
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="h-4 w-4" />
                                  {language === "ar" ? booking.courtCity || "—" : booking.courtCityEn || booking.courtCity || "—"}
                                </span>
                              </div>

                              <div className="mt-3 flex flex-wrap items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg sm:text-xl font-bold text-foreground">
                                    {Number(booking.totalPrice ?? booking.amount ?? 0).toLocaleString()}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t("common.egp")}
                                  </span>
                                </div>

                                {booking.status === "confirmed" &&
                                  !bookingIsDidNotAttend && (
                                    <BookingCountdown
                                      date={booking.date}
                                      startTime={booking.startTime || "00:00"}
                                      endTime={booking.endTime}
                                      courtOpenTime={
                                        booking.sessionOpenTime ||
                                        booking.courtOpenTime
                                      }
                                      language={language}
                                      useOpeningDay={booking.useOpeningDayForOvernightBookings === true}
                                    />
                                  )}
                              </div>

                            </div>

                            <div className="flex flex-wrap items-center justify-end gap-2 w-full sm:w-auto mt-2 sm:mt-0 pt-3 sm:pt-0 border-t border-border/40 sm:border-0">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl gap-1.5 flex-1 sm:flex-none border-border/60 hover:bg-muted font-semibold shadow-sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openDetails(booking);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                                {language === "ar" ? "تفاصيل" : "Details"}
                              </Button>

                              {booking.status === "confirmed" &&
                                booking.checkInCode && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    className="rounded-xl gap-1.5 flex-1 sm:flex-none bg-primary/10 text-primary hover:bg-primary/20 border-0 font-semibold shadow-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openQR(booking);
                                    }}
                                  >
                                    <Ticket className="h-4 w-4" />
                                    {language === "ar" ? "الكود" : "Code"}
                                  </Button>
                                )}

                              {booking.paymentStatus === "paid" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-xl gap-1.5 flex-1 sm:flex-none border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-semibold shadow-sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setReceiptBooking(booking);
                                    setReceiptModalOpen(true);
                                  }}
                                >
                                  <Receipt className="h-4 w-4 text-emerald-500" />
                                  {language === "ar" ? "الإيصال" : "Receipt"}
                                </Button>
                              )}
                              {canCancelListItem && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="rounded-xl gap-1.5 flex-1 sm:flex-none border-red-500/20 text-red-500 hover:text-red-600 hover:bg-red-500/10 font-semibold shadow-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <X className="h-4 w-4" />
                                      {language === "ar" ? "إلغاء" : "Cancel"}
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>
                                        {language === "ar"
                                          ? "إلغاء الحجز"
                                          : "Cancel Booking"}
                                      </AlertDialogTitle>
                                      <AlertDialogDescription className="space-y-2 text-start">
                                        <span>
                                          {language === "ar"
                                            ? "هل أنت متأكد من رغبتك في إلغاء هذا الحجز؟"
                                            : "Are you sure you want to cancel this booking?"}
                                        </span>
                                        {booking.paymentStatus === "paid" && (
                                          <span className="block mt-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                                            <strong className="block font-bold mb-1">
                                              {language === "ar" ? "ℹ️ سياسة الاسترداد (24 ساعة):" : "ℹ️ 24h Auto-Refund Policy:"}
                                            </strong>
                                            <span className="block text-[11px] leading-relaxed opacity-90">
                                              {language === "ar"
                                                ? "الإلغاء قبل أكثر من 24 ساعة من المباراة يسترد المبلغ تلقائياً إلى بطاقتك البنكية. الإلغاء قبل أقل من 24 ساعة غير قابل للاسترداد وفقاً لسياسة الملعب."
                                                : "Cancellations > 24h before match start receive an automatic refund to your card. Cancellations within 24h are non-refundable per venue policy."}
                                            </span>
                                          </span>
                                        )}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel className="rounded-lg">
                                        {t("common.cancel")}
                                      </AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() =>
                                          handleCancelBooking(booking.id)
                                        }
                                        className="rounded-lg bg-red-500 hover:bg-red-600"
                                      >
                                        {language === "ar"
                                          ? "تأكيد الإلغاء"
                                          : "Confirm Cancel"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              {(booking.status === "completed" ||
                                booking.status === "cancelled") && (
                                <Button
                                  asChild
                                  variant="outline"
                                  size="sm"
                                  className="col-span-2 sm:col-span-1 rounded-full gap-1.5 bg-transparent w-full sm:w-auto"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Link href="/dashboard/player/browse">
                                    {language === "ar"
                                      ? "احجز مجدداً"
                                      : "Book Again"}
                                  </Link>
                                </Button>
                              )}
                            </div>
                          </div>

                          {canCancelListItem && (
                            <div className="mt-4 flex justify-end border-t border-border/40 pt-3">
                              <p className="max-w-md text-xs text-muted-foreground text-right">
                                {getBookingChangeWindowText(language)}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
              })
            )}
          </div>

            {/* Pagination */}
            {sortedBookings.length > 0 && (
              <AnimatedContainer animation="fade-up" delay={140}>
                <Pagination className="mt-2 px-4">
                  <PaginationContent>
                    {direction !== "rtl" ? (
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(Math.max(1, currentPage - 1));
                          }}
                        />
                      </PaginationItem>
                    ) : (
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(
                              Math.min(totalPages, currentPage + 1),
                            );
                          }}
                        />
                      </PaginationItem>
                    )}

                    {pageNumbers.start > 1 && (
                      <>
                        <PaginationItem>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(1);
                            }}
                          >
                            1
                          </PaginationLink>
                        </PaginationItem>
                        {pageNumbers.start > 2 && (
                          <PaginationItem>
                            <PaginationEllipsis />
                          </PaginationItem>
                        )}
                      </>
                    )}

                    {pageNumbers.arr.map((n) => (
                      <PaginationItem key={n}>
                        <PaginationLink
                          href="#"
                          isActive={n === currentPage}
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(n);
                          }}
                        >
                          {n}
                        </PaginationLink>
                      </PaginationItem>
                    ))}

                    {pageNumbers.end < totalPages && (
                      <>
                        <PaginationItem>
                          <PaginationEllipsis />
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage(totalPages);
                            }}
                          >
                            {totalPages}
                          </PaginationLink>
                        </PaginationItem>
                      </>
                    )}

                    {direction !== "rtl" ? (
                      <PaginationItem>
                        <PaginationNext
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(
                              Math.min(totalPages, currentPage + 1),
                            );
                          }}
                        />
                      </PaginationItem>
                    ) : (
                      <PaginationItem>
                        <PaginationPrevious
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            setCurrentPage(Math.max(1, currentPage - 1));
                          }}
                        />
                      </PaginationItem>
                    )}
                  </PaginationContent>
                </Pagination>
              </AnimatedContainer>
            )}
          </div>
        )}
      </Card>

      {/* Calendar View (Rendered separately below filters card) */}
      {viewMode === "calendar" && (
        <AnimatedContainer animation="slide-up" delay={120}>
          <Card className="border-border/50 rounded-[2rem] overflow-hidden mb-6">
            <CardContent className="p-2 sm:p-6">
              <Suspense fallback={<div className="flex h-[400px] items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>}>
                <BookingCalendar
                  bookings={playerBookings as any}
                  allowPayment={false}
                />
              </Suspense>
            </CardContent>
          </Card>
        </AnimatedContainer>
      )}

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col rounded-2xl p-0">
          <DialogHeader className="px-6 pt-6 pb-4 shrink-0 border-b border-border/50">
            <DialogTitle>
              {language === "ar" ? "تفاصيل الحجز" : "Booking Details"}
            </DialogTitle>
            <DialogDescription>
              {language === "ar"
                ? "إدارة الحجز، الدفع، والكود."
                : "Manage booking, payment, and code."}
            </DialogDescription>
          </DialogHeader>

          {selectedBooking && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {(() => {
                const cfg = getStatusConfig(
                  selectedBooking.status,
                  selectedBooking,
                );
                const Icon = cfg?.icon || CheckCircle2;
                const d = getRealBookingDate(selectedBooking);

                const openRef =
                  (selectedBooking as any).sessionOpenTime ||
                  selectedBooking.courtOpenTime ||
                  "08:00";
                const endRef =
                  selectedBooking.endTime ||
                  minutesToTime(
                    timeToMinutes(selectedBooking.startTime || "00:00") + 60,
                  );
                const { startMs: bookingStartMs } = getAbsoluteBookingTimes(
                  selectedBooking.date,
                  selectedBooking.startTime || "00:00",
                  endRef,
                  openRef,
                  selectedBooking.useOpeningDayForOvernightBookings === true,
                );
                const canChange =
                  selectedBooking.status === "confirmed" &&
                  Date.now() < bookingStartMs - PLAYER_BOOKING_CHANGE_WINDOW_MS;
                const canQR =
                  selectedBooking.status === "confirmed" &&
                  Boolean(selectedBooking.checkInCode);

                return (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-extrabold truncate">
                            {language === "ar"
                              ? selectedBooking.courtName
                              : selectedBooking.courtNameEn}
                          </p>
                          <p className="text-sm text-muted-foreground mt-1">
                            {formatDate(d)} • {language === "ar" ? selectedBooking.courtCity : selectedBooking.courtCityEn}
                          </p>
                          <p className="text-sm text-primary mt-1" dir="ltr">
                            {format12h(selectedBooking.startTime, language)} -{" "}
                            {format12h(selectedBooking.endTime, language)}
                          </p>
                        </div>

                        {cfg && (
                          <Badge
                            className={`${cfg.bg} ${cfg.color} border-0 shrink-0`}
                          >
                            <Icon className="h-3.5 w-3.5 me-1" />
                            {language === "ar" ? cfg.label.ar : cfg.label.en}
                          </Badge>
                        )}
                      </div>

                      <div className="mt-3 flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">
                          {language === "ar" ? "السعر الكامل" : "Full price"}
                        </span>
                        <span className="font-extrabold">
                          {Number(selectedBooking.totalPrice ?? selectedBooking.amount ?? 0).toLocaleString()}{" "}
                          {t("common.egp")}
                        </span>
                      </div>
                    </div>

                    {selectedBooking.notes?.trim() ? (
                      <div className="rounded-2xl border border-border/60 bg-background p-4">
                        <p className="text-sm font-semibold">
                          {language === "ar"
                            ? "ملاحظتك للملعب"
                            : "Your note to the venue"}
                        </p>
                        <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                          {selectedBooking.notes.trim()}
                        </p>
                      </div>
                    ) : null}

                    <div className="rounded-2xl border border-border/60 bg-background p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold">
                            {language === "ar"
                              ? "كود تسجيل الحضور"
                              : "Check-in Code"}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {language === "ar"
                              ? "يظهر بعد الدفع"
                              : "Appears after payment"}
                          </p>
                        </div>

                        {selectedBooking.checkInCode ? (
                          <div className="flex flex-col items-end">
                            <Badge
                              variant="secondary"
                              className="rounded-xl font-mono tracking-widest text-lg py-1 px-3 bg-primary/10 text-primary border-primary/20"
                            >
                              {selectedBooking.checkInCode}
                            </Badge>
                            <button
                              onClick={() => copyToClipboard(selectedBooking.checkInCode!)}
                              className="text-[10px] font-bold text-primary mt-1 hover:underline"
                            >
                              {language === "ar" ? "نسخ الكود" : "Copy Code"}
                            </button>
                          </div>
                        ) : (
                          <Badge variant="secondary" className="rounded-xl">
                            ------
                          </Badge>
                        )}
                      </div>
                    </div>
                    {selectedBooking.paymentStatus === "paid" && (() => {
                      const total = Number(selectedBooking.totalPrice ?? selectedBooking.amount ?? 0);
                      const paidPayment = selectedBooking.payments?.find((payment) => payment.status === "paid")
                        || (selectedBooking.latestPayment?.status === "paid" ? selectedBooking.latestPayment : null);
                      const paidOnlineAmount = Number(paidPayment?.amount ?? selectedBooking.amount ?? total);
                      const remainingAtVenue = Math.max(0, Math.round((total - paidOnlineAmount) * 100) / 100);
                      const isDeposit = paidOnlineAmount < total;
                      return (
                        <div className="space-y-2 w-full">
                          <div className={`w-full rounded-xl py-3 flex flex-col items-center justify-center gap-1 font-semibold border ${isDeposit ? "bg-amber-500/10 border-amber-500/20 text-amber-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"}`}>
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="h-5 w-5" />
                              {isDeposit
                                ? (language === "ar" ? "تم دفع العربون" : "Deposited")
                                : (language === "ar" ? "تم الدفع أونلاين" : "Paid Online")}
                            </div>
                            {isDeposit && (
                              <p className="text-xs font-normal opacity-80 text-center">
                                {language === "ar"
                                  ? `تم دفع ${paidOnlineAmount} ج.م أونلاين، والمتبقي ${remainingAtVenue} ج.م في الملعب`
                                  : `Paid ${paidOnlineAmount} EGP online; ${remainingAtVenue} EGP remains at the venue`}
                              </p>
                            )}
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            className="w-full rounded-xl gap-2 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 font-bold py-2.5 shadow-sm"
                            onClick={() => {
                              setReceiptBooking(selectedBooking);
                              setReceiptModalOpen(true);
                            }}
                          >
                            <Receipt className="h-4 w-4 text-emerald-500" />
                            {language === "ar" ? "عرض وتحميل إيصال الدفع" : "View & Download Payment Receipt"}
                          </Button>
                        </div>
                      );
                    })()}

                    {selectedBooking.paymentStatus !== "paid" &&
                      selectedBooking.status !== "cancelled" &&
                      (selectedBooking as any).court?.allowOnlinePayment !== false && (
                        <Button
                          className="w-full rounded-xl gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white hover:from-emerald-600 hover:to-teal-700 shadow-md shadow-emerald-500/20 py-3 font-semibold"
                          onClick={() => handlePaymobPayForBooking(selectedBooking.id)}
                          disabled={isPayingPaymob}
                        >
                          {isPayingPaymob ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Zap className="h-4 w-4" />
                          )}
                          {(() => {
                            const policy = (selectedBooking as any).court?.paymentPolicy
                            const depositVal = Number((selectedBooking as any).court?.depositValue ?? 0)
                            const total = Number(selectedBooking.totalPrice ?? selectedBooking.amount ?? 0)
                            if (policy === "percentage" && depositVal > 0) {
                              const due = Math.round(((total * depositVal) / 100) * 100) / 100
                              return language === "ar"
                                ? `ادفع عربون ${depositVal}% (${due} ج.م)`
                                : `Pay ${depositVal}% Deposit (${due} EGP)`
                            }
                            if (policy === "fixed" && depositVal > 0) {
                              const due = Math.min(total, depositVal)
                              return language === "ar"
                                ? `ادفع عربون ${due} ج.م`
                                : `Pay Deposit (${due} EGP)`
                            }
                            return language === "ar" ? "ادفع أونلاين بـ Paymob" : "Pay Online with Paymob"
                          })()}
                        </Button>
                      )}


                    {canChange && (
                      <div className="grid grid-cols-1 gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="outline"
                            className="rounded-xl bg-transparent text-red-500 hover:text-red-600 hover:bg-red-500/10"
                          >
                            <X className="me-2 h-4 w-4" />
                            {language === "ar" ? "إلغاء" : "Cancel"}
                          </Button>
                        </AlertDialogTrigger>

                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {language === "ar"
                                ? "إلغاء الحجز"
                                : "Cancel Booking"}
                            </AlertDialogTitle>
                            <AlertDialogDescription className="space-y-2 text-start">
                              <span>
                                {language === "ar"
                                  ? "هل أنت متأكد من رغبتك في إلغاء هذا الحجز؟"
                                  : "Are you sure you want to cancel this booking?"}
                              </span>
                              {selectedBooking.paymentStatus === "paid" && (
                                <span className="block mt-2 rounded-xl bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-700 dark:text-amber-300">
                                  <strong className="block font-bold mb-1">
                                    {language === "ar" ? "ℹ️ سياسة الاسترداد (24 ساعة):" : "ℹ️ 24h Auto-Refund Policy:"}
                                  </strong>
                                  <span className="block text-[11px] leading-relaxed opacity-90">
                                    {language === "ar"
                                      ? "الإلغاء قبل أكثر من 24 ساعة من المباراة يسترد المبلغ تلقائياً إلى بطاقتك البنكية. الإلغاء قبل أقل من 24 ساعة غير قابل للاسترداد وفقاً لسياسة الملعب."
                                      : "Cancellations > 24h before match start receive an automatic refund to your card. Cancellations within 24h are non-refundable per venue policy."}
                                  </span>
                                </span>
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-lg">
                              {t("common.cancel")}
                            </AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() =>
                                handleCancelBooking(selectedBooking.id)
                              }
                              className="rounded-lg bg-red-500 hover:bg-red-600"
                            >
                              {language === "ar"
                                ? "تأكيد الإلغاء"
                                : "Confirm Cancel"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      </div>
                    )}
                    {canChange && (
                      <p className="text-xs text-muted-foreground">
                        {getBookingChangeWindowText(language)}
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Check-in Code Dialog */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm rounded-[2rem] border-border/60 p-0 shadow-2xl">
          {selectedBooking ? (
            <CheckInCodeDialogContent
              booking={selectedBooking}
              language={language}
              onClose={() => setQrDialogOpen(false)}
              onCopy={copyToClipboard}
            />
          ) : null}
          <div className="hidden">
            <DialogHeader className="space-y-0">
              <DialogTitle className="text-base font-black tracking-tight text-primary uppercase">
                {language === "ar" ? "رمز الحضور" : "Check-in Code"}
              </DialogTitle>
            </DialogHeader>
          </div>

          {false && selectedBooking && (
            <div className="p-5 space-y-5">
              <div className="flex flex-col items-center gap-4">
                <div className="relative group w-full">
                  <div className="absolute -inset-1 bg-gradient-to-r from-primary/20 to-blue-500/10 rounded-[1.2rem] blur-sm opacity-25"></div>
                  <div className="relative flex flex-col items-center justify-center gap-1 rounded-[1rem] bg-background border-2 border-primary/10 p-5 shadow-lg overflow-hidden">
                    <span className="text-[7px] font-black tracking-[0.2em] text-primary/40 uppercase">
                      {language === "ar" ? "كود الدخول" : "ENTRY CODE"}
                    </span>
                    <span className="font-mono text-3xl tracking-[0.15em] font-black text-primary">
                      {selectedBooking?.checkInCode || "--------"}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 w-full">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-10 rounded-xl border-border/60 bg-background font-bold text-xs active:scale-[0.98] transition-all"
                    onClick={() =>
                      selectedBooking?.checkInCode &&
                      copyToClipboard(selectedBooking.checkInCode)
                    }
                    disabled={!selectedBooking?.checkInCode}
                  >
                    <Copy className="me-2 h-3.5 w-3.5" />
                    {language === "ar" ? "نسخ الرمز" : "Copy Code"}
                  </Button>

                  <Button
                    variant="default"
                    className="w-full h-10 rounded-xl font-bold text-xs shadow-md shadow-primary/10 active:scale-[0.98] transition-all"
                    onClick={() => setQrDialogOpen(false)}
                  >
                    {language === "ar" ? "إغلاق" : "Close"}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl bg-muted/20 border border-border/40 p-3 flex items-center gap-2">
                <Ticket className="h-3.5 w-3.5 text-primary shrink-0" />
                <p className="text-[9px] font-medium text-muted-foreground leading-tight">
                  {language === "ar"
                    ? "قدّم الرمز للمدير لتأكيد حضورك."
                    : "Show this code to the manager to confirm check-in."}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Receipt Modal */}
      <PaymentReceiptModal
        booking={receiptBooking || selectedBooking}
        open={receiptModalOpen}
        onOpenChange={(open) => {
          setReceiptModalOpen(open);
          if (!open) setReceiptBooking(null);
        }}
      />

    </div>
  );
}
