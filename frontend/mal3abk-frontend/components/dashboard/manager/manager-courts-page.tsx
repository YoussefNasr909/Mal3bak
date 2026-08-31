"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { uploadImages } from "@/lib/api";
import {
  Plus,
  Search,
  MoreHorizontal,
  MapPin,
  Clock,
  Edit,
  Trash2,
  Eye,
  Building2,
  AlertCircle,
  X,
  Upload,
  Image,
  Info,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Save,
  Download,
  Filter,
  Radio,
  Crown,
  Shield,
  Sparkles,
  LayoutGrid,
  List,
  Copy,
  ArrowLeft,
  ArrowRight,
  RefreshCcw,
  BadgeCheck,
  Zap,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import NextImage from "next/image";
import { formatEgyptISODate, getAbsoluteBookingTimes } from "@/lib/date";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";

import { useLanguage } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { sportTypes, cities } from "@/lib/constants";
import { listCourts as listCourtsApi, listBookings as listBookingsApi, createCourt as createCourtApi, updateCourt as updateCourtApi, deleteCourt as deleteCourtApi } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { AnimatedContainer } from "@/components/ui/animated-container";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Court } from "@/lib/types";
import { formatOperatingHours, isPeakWindowValidForOperatingHours } from "@/lib/time";
import { CourtClosuresManager } from "@/components/dashboard/manager/court-closures-manager";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";

// ---------------------------------------------
// Types
// ---------------------------------------------
type Period = "today" | "7d" | "30d";
type ViewMode = "grid" | "list";
type SortBy =
  | "bookings_desc"
  | "rating_desc"
  | "occupancy_desc"
  | "name_asc"
  | "name_desc";
type CourtStatus = Court["status"];

type BookingLike = {
  id?: string;
  courtId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  status: "confirmed" | "completed" | "cancelled" | string;
  amount?: number;
  totalPrice?: number;
  useOpeningDayForOvernightBookings?: boolean;
  /** Stored snapshot of the court's openTime at booking creation time (from backend formatBooking) */
  sessionOpenTime?: string;
  /** Alias sometimes returned by the API */
  courtOpenTime?: string;
};

interface CourtFormData {
  // Arabic + English
  name: string;
  nameEn: string;

  sportType: string;

  description: string;
  descriptionEn: string;

  city: string;
  cityEn: string;

  address: string;
  addressEn: string;

  location: string; // link or coords (shared)

  peakPrice: number; // peak
  offPeakPrice: number; // off-peak
  peakStartTime: string;
  peakEndTime: string;

  openTime: string;
  closeTime: string;
  useOpeningDayForOvernightBookings: boolean;

  images: string[];
  coverImageIndex: number;


  status: "active" | "inactive" | "maintenance";
  // Payment settings (admin-only)
  allowOnlinePayment: boolean;
  paymentPolicy: "full" | "percentage" | "fixed";
  depositValue: number;
}

// ---------------------------------------------
// Utils
// ---------------------------------------------
function isoDate(d: Date) {
  return formatEgyptISODate(d);
}
function minutesFromHHMM(time: string) {
  const [h, m] = time.split(":").map((x) => Number(x));
  return (h || 0) * 60 + (m || 0);
}
function daysBetweenInclusive(from: Date, to: Date) {
  const a = new Date(from);
  a.setHours(0, 0, 0, 0);
  const b = new Date(to);
  b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}
function getRange(period: Period) {
  const now = new Date();
  const to = new Date(now);
  to.setHours(23, 59, 59, 999);
  const from = new Date(now);
  from.setHours(0, 0, 0, 0);

  if (period === "today") return { from, to };
  if (period === "7d") {
    from.setDate(from.getDate() - 6);
    return { from, to };
  }
  from.setDate(from.getDate() - 29);
  return { from, to };
}
function getUsageLabel(period: Period, language: string) {
  if (language === "ar") {
    if (period === "today") return "استخدام اليوم";
    if (period === "30d") return "استخدام 30 يوم";
    return "استخدام 7 أيام";
  }
  if (period === "today") return "Today's usage";
  if (period === "30d") return "30-day usage";
  return "7-day usage";
}
function inRangeISO(iso: string, from: Date, to: Date) {
  const d = new Date(iso);
  d.setHours(12, 0, 0, 0);
  return d >= from && d <= to;
}
function isActiveNow(booking: BookingLike, now: Date) {
  if (!booking?.date || !booking?.startTime || !booking?.endTime) return false;
  if (booking.status === "cancelled") return false;

  // Use the stored snapshot of the court's openTime if available;
  // fall back to a safe default only when the data is genuinely missing.
  const openTime =
    (booking as any).sessionOpenTime ||
    (booking as any).courtOpenTime ||
    "08:00";
  const useOpeningDay = booking.useOpeningDayForOvernightBookings === true;

  const { startMs, endMs } = getAbsoluteBookingTimes(
    booking.date,
    booking.startTime,
    booking.endTime,
    openTime,
    useOpeningDay,
  );

  const nowMs = now.getTime();
  return nowMs >= startMs && nowMs < endMs;
}

function statusLabel(status: Court["status"], language: string) {
  if (status === "active") return language === "ar" ? "نشط" : "Active";
  if (status === "inactive") return language === "ar" ? "غير نشط" : "Inactive";
  return language === "ar" ? "صيانة" : "Maintenance";
}
function statusVariant(status: Court["status"]) {
  if (status === "active") return "success";
  if (status === "maintenance") return "warning";
  return "default";
}
function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}
function matchesSelectedCity(court: Court, selectedCityEn: string) {
  if (selectedCityEn === "all") return true;

  const normalizedSelected = String(selectedCityEn || "").trim().toLowerCase();
  const cityOption = cities.find(
    (city: any) => String(city.en || "").trim().toLowerCase() === normalizedSelected,
  );
  const acceptedValues = new Set(
    [normalizedSelected, String(cityOption?.ar || "").trim().toLowerCase()].filter(Boolean),
  );

  return [court.cityEn, court.city].some((value) =>
    acceptedValues.has(String(value || "").trim().toLowerCase()),
  );
}
function safeUUID() {
  // Browser safe
  const c: any = globalThis as any;
  if (c?.crypto?.randomUUID) return c.crypto.randomUUID();
  return `id_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}
function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia(query);
    const onChange = () => setMatches(!!m.matches);
    onChange();
    m.addEventListener?.("change", onChange);
    return () => m.removeEventListener?.("change", onChange);
  }, [query]);
  return matches;
}
const MotionCard = motion.create(Card);
async function filesToDataUrls(files: File[]) {
  const reads = files.map(
    (file) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || ""));
        r.onerror = () => reject(new Error("File read failed"));
        r.readAsDataURL(file);
      }),
  );
  return Promise.all(reads);
}

function fmtMoney(n: number) {
  const v = Number(n || 0);
  return v.toLocaleString();
}

function format12h(time: string, lang: string) {
  if (!time) return "";
  const [hh, mm] = time.split(":").map(Number);
  const ampm = hh >= 12 ? (lang === "ar" ? "م" : "PM") : (lang === "ar" ? "ص" : "AM");
  const h12 = hh % 12 || 12;
  return `\u200E${String(h12).padStart(2, "0")}:${String(mm).padStart(2, "0")} ${ampm}`;
}

function checkNextDay(time: string, openTime: string, closeTime: string) {
  if (!time || !openTime || !closeTime) return false;
  const tM = minutesFromHHMM(time);
  const oM = minutesFromHHMM(openTime);
  const cM = minutesFromHHMM(closeTime);
  if (cM < oM || cM === oM) return tM < oM;
  return false;
}

function getCourtCover(court: Court) {
  const imgs = (((court as any).images || []) as string[]) || [];
  return imgs[0] || "/placeholder.svg";
}
function getCourtImages(court: Court) {
  return ((((court as any).images || []) as string[]) || []).filter(Boolean);
}
function getCourtHours(court: Court) {
  const openTime =
    (court as any)?.openTime ||
    (court as any)?.schedule?.[0]?.openTime ||
    "08:00";

  const closeTime =
    (court as any)?.closeTime ||
    (court as any)?.schedule?.[0]?.closeTime ||
    "23:00";

  return { openTime, closeTime };
}

// ---------------------------------------------
// Small UI components
// ---------------------------------------------
function SoftDivider({ className }: { className?: string }) {
  return <div className={cn("h-px w-full bg-border/60", className)} />;
}

function MetricPill({
  label,
  value,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-muted/20 px-3 py-2">
      <div className="flex items-center gap-2">
        {icon}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground leading-none">{label}</p>
          <p className="font-semibold leading-snug">{value}</p>
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  hint,
  className,
}: {
  title: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/50 overflow-hidden", className)}>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{title}</p>
        <p className="text-3xl font-bold mt-1">{value}</p>
        {!!hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------
// Pagination (compact, modern)
// ---------------------------------------------
function Pagination({
  page,
  totalPages,
  onPageChange,
  rtl,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  rtl?: boolean;
}) {
  // 1. Declare hooks FIRST
  const pages = useMemo(() => {
    if (totalPages <= 1) return []; // Safe internal exit
    const set = new Set<number>();
    set.add(1);
    set.add(totalPages);
    set.add(page);
    set.add(page - 1);
    set.add(page + 1);
    const arr = Array.from(set)
      .filter((n) => n >= 1 && n <= totalPages)
      .sort((a, b) => a - b);

    const out: (number | "…")[] = [];
    for (let i = 0; i < arr.length; i++) {
      const cur = arr[i];
      const prev = arr[i - 1];
      if (i > 0 && cur - prev > 1) out.push("…");
      out.push(cur);
    }
    return out;
  }, [page, totalPages]);

  // 2. SAFE early return goes AFTER the hooks!
  if (totalPages <= 1) return null;

  const go = (p: number) => onPageChange(clamp(p, 1, totalPages));
  const labelPrev = rtl ? "السابق" : "Prev";
  const labelNext = rtl ? "التالي" : "Next";

  return (
    <div className="flex items-center justify-center gap-2 pt-4">
      <Button
        variant="outline"
        className="rounded-2xl bg-transparent"
        onClick={() => go(page - 1)}
        disabled={page <= 1}
      >
        {rtl ? (
          <ChevronRight className="h-4 w-4 me-1" />
        ) : (
          <ChevronLeft className="h-4 w-4 me-1" />
        )}
        {labelPrev}
      </Button>

      <div className="flex items-center gap-1.5">
        {pages.map((p, idx) =>
          p === "…" ? (
            <span key={`dots_${idx}`} className="px-2 text-muted-foreground">
              …
            </span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              className={cn(
                "rounded-2xl min-w-10",
                p !== page && "bg-transparent",
              )}
              onClick={() => go(p as number)}
            >
              {p}
            </Button>
          ),
        )}
      </div>

      <Button
        variant="outline"
        className="rounded-2xl bg-transparent"
        onClick={() => go(page + 1)}
        disabled={page >= totalPages}
      >
        {labelNext}
        {rtl ? (
          <ChevronLeft className="h-4 w-4 ms-1" />
        ) : (
          <ChevronRight className="h-4 w-4 ms-1" />
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------
// Main Page
// ---------------------------------------------
export function ManagerCourtsPage() {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const prefersReducedMotion = useReducedMotion();

  // Admin detection (adjust to your auth shape)
  const isAdmin = Boolean(
    (user as any)?.role === "admin" || (user as any)?.isAdmin,
  );

  // Local CRUD state
  const [courtsState, setCourtsState] = useState<Court[]>([]);
  const [bookingsState, setBookingsState] = useState<BookingLike[]>([]);

  const loadCourts = useCallback(async () => {
    try {
      const courtsRes = await listCourtsApi({ limit: 100 });
      setCourtsState((courtsRes.items || []) as Court[]);
    } catch (error) {
      console.error(error);
      setCourtsState([]);
      toast.error(language === "ar" ? "تعذر تحميل الملاعب" : "Failed to load courts");
    }
  }, [language]);

  useEffect(() => {
    const run = async () => {
      try {
        const courtsRes = await listCourtsApi({ limit: 100 });
        setCourtsState((courtsRes.items || []) as Court[]);
      } catch (error) {
        console.error(error);
        setCourtsState([]);
        toast.error(language === "ar" ? "تعذر تحميل الملاعب" : "Failed to load courts");
      }
    };
    run();
  }, [language]);

  // stable "now" (updates every 30s)
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const visibleCourts = useMemo(() => {
    if (isAdmin) return courtsState;
    return courtsState.filter((c: any) => c.managerId === user?.id);
  }, [courtsState, isAdmin, user?.id]);

  const visibleBookings = useMemo(() => {
    const ids = new Set(visibleCourts.map((c) => c.id));
    return bookingsState.filter((b) => ids.has(b.courtId));
  }, [visibleCourts, bookingsState]);

  // UI state
  const [period, setPeriod] = useState<Period>("7d");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("bookings_desc");
  const usageLabel = useMemo(() => getUsageLabel(period, language), [period, language]);

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 250);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterCityEn, setFilterCityEn] = useState<string>("all");
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);

  const loadPeriodBookings = useCallback(async () => {
    try {
      const { from, to } = getRange(period);
      const bookingParams = {
        limit: 200,
        dateFrom: formatEgyptISODate(from),
        dateTo: formatEgyptISODate(to),
        sortBy: "date" as const,
        order: "desc" as const,
      };

      const firstPage = await listBookingsApi({ page: 1, ...bookingParams });
      let allBookings = [...(firstPage.items || [])];
      const bookingPages = Math.max(1, Number(firstPage.pages || 1));

      for (let currentPage = 2; currentPage <= bookingPages; currentPage += 1) {
        const pageRes = await listBookingsApi({ page: currentPage, ...bookingParams });
        allBookings = allBookings.concat(pageRes.items || []);
      }

      setBookingsState(allBookings as BookingLike[]);
    } catch (error) {
      console.error(error);
      setBookingsState([]);
    }
  }, [period]);

  useEffect(() => {
    loadPeriodBookings();
  }, [loadPeriodBookings]);

  useAutoRefresh(async () => {
    await Promise.all([loadCourts(), loadPeriodBookings()]);
  });

  // dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [descLang, setDescLang] = useState<"primary" | "secondary">("primary");
  const [shakeNext, setShakeNext] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [closuresDialogOpen, setClosuresDialogOpen] = useState(false);

  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [closureCourt, setClosureCourt] = useState<Court | null>(null);

  // wizard
  const [currentStep, setCurrentStep] = useState(1);
  const totalSteps = 5;

  // Show/Hide English fields (default ON)

  const [formData, setFormData] = useState<CourtFormData>({
    name: "",
    nameEn: "",

    sportType: "",

    description: "",
    descriptionEn: "",

    city: "",
    cityEn: "",

    address: "",
    addressEn: "",

    location: "",

    peakPrice: 0,
    offPeakPrice: 0,
    peakStartTime: "18:00",
    peakEndTime: "06:00",

    openTime: "08:00",
    closeTime: "23:00",
    useOpeningDayForOvernightBookings: false,

    images: [],
    coverImageIndex: 0,

    status: "active",
    allowOnlinePayment: true,
    paymentPolicy: "full",
    depositValue: 0,
  });

  const hasPeakWindowConflict = useMemo(
    () =>
      Boolean(
        formData.openTime &&
          formData.closeTime &&
          formData.peakStartTime &&
          formData.peakEndTime &&
          !isPeakWindowValidForOperatingHours(
            formData.openTime,
            formData.closeTime,
            formData.peakStartTime,
            formData.peakEndTime,
          ),
      ),
    [
      formData.closeTime,
      formData.openTime,
      formData.peakEndTime,
      formData.peakStartTime,
    ],
  );

  const isOvernightFormHours = useMemo(
    () =>
      Boolean(
        formData.openTime &&
          formData.closeTime &&
          minutesFromHHMM(formData.closeTime) < minutesFromHHMM(formData.openTime),
      ),
    [formData.closeTime, formData.openTime],
  );

  // limits
  const courtsLimit = user?.subscription?.courtsLimit || 10;
  const canAddMore = isAdmin ? true : visibleCourts.length < courtsLimit;

  // ---------------------------------------------
  // Stats (bookings + period)
  // ---------------------------------------------
  const { from, to } = useMemo(() => getRange(period), [period]);
  const periodDays = useMemo(() => daysBetweenInclusive(from, to), [from, to]);

  const courtStatsMap = useMemo(() => {
    const map: Record<
      string,
      {
        bookings: number;
        cancelled: number;
        occupancyRate: number;
        activeNow: number;
        nextBooking?: BookingLike;
        rating: number;
        reviewCount: number;
      }
    > = {};

    // Simple occupancy model
    const slotsPerDay = 12;

    visibleCourts.forEach((court) => {
      const courtBookings = visibleBookings.filter(
        (b) => b.courtId === court.id && b.date && inRangeISO(b.date, from, to),
      );

      const bookings = courtBookings.length;
      const cancelled = courtBookings.filter(
        (b) => b.status === "cancelled",
      ).length;

      const activeNow = visibleBookings.filter(
        (b) => b.courtId === court.id && isActiveNow(b, now),
      ).length;

      const nextBooking = visibleBookings
        .filter(
          (b) => b.courtId === court.id && b.date && b.status !== "cancelled",
        )
        .map((b) => {
          // Use Cairo-aware absolute time so overnight bookings sort correctly
          // even when the JS local clock is ahead/behind Africa/Cairo.
          const openRef =
            (b as any).sessionOpenTime ||
            (b as any).courtOpenTime ||
            "08:00";
          const useOpeningDay = b.useOpeningDayForOvernightBookings === true;
          const { startMs } = getAbsoluteBookingTimes(
            b.date,
            b.startTime || "00:00",
            b.endTime || "01:00",
            openRef,
            useOpeningDay,
          );
          return { b, dt: startMs };
        })
        .filter((x) => x.dt >= now.getTime())
        .sort((a, b) => a.dt - b.dt)[0]?.b;

      const occ = Math.round(
        (bookings / Math.max(1, slotsPerDay * periodDays)) * 100,
      );

      map[court.id] = {
        bookings,
        cancelled,
        occupancyRate: Math.min(100, Math.max(0, occ)),
        activeNow,
        nextBooking,
        rating: (court as any).rating || 0,
        reviewCount: (court as any).reviewCount || 0,
      };
    });

    return map;
  }, [visibleCourts, visibleBookings, from, to, now, periodDays]);

  const totals = useMemo(() => {
    const courts = visibleCourts.length;
    const active = visibleCourts.filter((c) => c.status === "active").length;
    const maintenance = visibleCourts.filter(
      (c) => c.status === "maintenance",
    ).length;
    const bookings = visibleCourts.reduce(
      (sum, c) => sum + (courtStatsMap[c.id]?.bookings || 0),
      0,
    );
    const occupancyAvg =
      courts > 0
        ? Math.round(
            visibleCourts.reduce(
              (sum, c) => sum + (courtStatsMap[c.id]?.occupancyRate || 0),
              0,
            ) / courts,
          )
        : 0;

    return { courts, active, maintenance, bookings, occupancyAvg };
  }, [visibleCourts, courtStatsMap]);

  // ---------------------------------------------
  // Filtering + sorting
  // ---------------------------------------------
  const filteredCourts = useMemo(() => {
    let courts = [...visibleCourts];

    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      courts = courts.filter((court: any) => {
        const addr = (court.address || court.location || "").toLowerCase();
        const addrEn = (
          court.addressEn ||
          court.locationEn ||
          ""
        ).toLowerCase();
        return (
          String(court.name || "")
            .toLowerCase()
            .includes(q) ||
          String(court.nameEn || "")
            .toLowerCase()
            .includes(q) ||
          addr.includes(q) ||
          addrEn.includes(q)
        );
      });
    }

    if (filterStatus !== "all")
      courts = courts.filter((c) => c.status === filterStatus);
    if (filterCityEn !== "all")
      courts = courts.filter((c) => matchesSelectedCity(c, filterCityEn));

    const withStats = courts.map((c) => ({ c, s: courtStatsMap[c.id] }));
    withStats.sort((a, b) => {
      const sa = a.s || ({} as any);
      const sb = b.s || ({} as any);
      if (sortBy === "bookings_desc")
        return (sb.bookings || 0) - (sa.bookings || 0);
      if (sortBy === "rating_desc") return (sb.rating || 0) - (sa.rating || 0);
      if (sortBy === "occupancy_desc")
        return (sb.occupancyRate || 0) - (sa.occupancyRate || 0);
      if (sortBy === "name_asc")
        return String(a.c.name || "").localeCompare(String(b.c.name || ""));
      if (sortBy === "name_desc")
        return String(b.c.name || "").localeCompare(String(a.c.name || ""));
      return 0;
    });

    return withStats.map((x) => x.c);
  }, [
    visibleCourts,
    debouncedSearch,
    filterStatus,
    filterCityEn,
    sortBy,
    courtStatsMap,
  ]);

  // ---------------------------------------------
  // Pagination
  // ---------------------------------------------
  const isMobile = useMediaQuery("(max-width: 768px)");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);

  useEffect(() => {
    setPage(1);
  }, [
    debouncedSearch,
    filterStatus,
    filterCityEn,
    sortBy,
    period,
    viewMode,
    pageSize,
  ]);

  const totalPages = isMobile
    ? 1
    : Math.max(1, Math.ceil(filteredCourts.length / pageSize));
  const pagedCourts = useMemo(() => {
    if (isMobile) return filteredCourts;
    const start = (page - 1) * pageSize;
    return filteredCourts.slice(start, start + pageSize);
  }, [filteredCourts, page, isMobile, pageSize]);

  // ---------------------------------------------
  // Export CSV
  // ---------------------------------------------
  const exportCSV = (courts: Court[]) => {
    if (!courts.length) {
      toast.error(
        language === "ar" ? "لا توجد بيانات للتصدير" : "Nothing to export",
      );
      return;
    }

    const rows = courts.map((c: any) => {
      const s = courtStatsMap[c.id];
      return {
        id: c.id,
        name_ar: c.name,
        name_en: c.nameEn,
        status: c.status,
        city_ar: c.city,
        city_en: c.cityEn,
        sport: c.sportType,
        peakPrice: c.peakPrice,
        offPeakPrice: c.offPeakPrice,
        peakStartTime: (c as any).peakStartTime || "18:00",
        peakEndTime: (c as any).peakEndTime || "06:00",
        bookings: s?.bookings || 0,
        occupancy: s?.occupancyRate || 0,
        active_now: s?.activeNow || 0,
      };
    });

    const header = Object.keys(rows[0] || {}).join(",");
    const body = rows
      .map((r) =>
        Object.values(r)
          .map((v) => `"${String(v).replaceAll('"', '""')}"`)
          .join(","),
      )
      .join("\n");

    const csv = `${header}\n${body}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `courts_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(
      language === "ar" ? "تم تصدير الملف" : "Exported successfully",
    );
  };

  // ---------------------------------------------
  // CRUD helpers
  // ---------------------------------------------
  const resetForm = () => {
    setFormData({
      name: "",
      nameEn: "",

      sportType: "",

      description: "",
      descriptionEn: "",

      city: "",
      cityEn: "",

      address: "",
      addressEn: "",

      location: "",

      peakPrice: 0,
      offPeakPrice: 0,
      peakStartTime: "18:00",
      peakEndTime: "06:00",

      openTime: "08:00",
      closeTime: "23:00",
      useOpeningDayForOvernightBookings: false,

      images: [],
      coverImageIndex: 0,

      status: "active",
      allowOnlinePayment: true,
      paymentPolicy: "full",
      depositValue: 0,
    });
    setCurrentStep(1);
  };

  const validateStep = (step: number) => {
    if (step === 1) {
      if (
        !formData.name ||
        !formData.nameEn ||
        !formData.sportType ||
        !formData.description ||
        !formData.descriptionEn
      ) {
        toast.error(
          language === "ar"
            ? "أكمل البيانات الأساسية بالعربي والإنجليزي"
            : "Complete basic details in Arabic and English",
        );
        return false;
      }
    }

    if (step === 2) {
      if (
        !formData.cityEn ||
        !formData.city ||
        !formData.address ||
        !formData.addressEn ||
        !formData.location
      ) {
        toast.error(
          language === "ar"
            ? "أكمل بيانات الموقع بالعربي والإنجليزي"
            : "Complete location details in Arabic and English",
        );
        return false;
      }
    }

    if (step === 3) {
      if (formData.offPeakPrice <= 0 || formData.peakPrice <= 0) {
        toast.error(
          language === "ar"
            ? "الأسعار يجب أن تكون أكبر من 0"
            : "Prices must be > 0",
        );
        return false;
      }
      if (!formData.openTime || !formData.closeTime) {
        toast.error(
          language === "ar"
            ? "أدخل وقت الفتح والإغلاق"
            : "Enter open and close times",
        );
        return false;
      }
      if (!formData.peakStartTime || !formData.peakEndTime) {
        toast.error(
          language === "ar"
            ? "أدخل وقت بداية ونهاية الذروة"
            : "Enter peak start and end times",
        );
        return false;
      }
      if (hasPeakWindowConflict) {
        toast.error(
          language === "ar"
            ? "يجب أن تكون ساعات الذروة مختلفة وأن تتقاطع مع ساعات تشغيل الملعب"
            : "Peak hours must be different and overlap with the court operating hours",
        );
        return false;
      }
    }

    if (step === 4) {
      if (formData.images.length < 1) {
        toast.error(
          language === "ar"
            ? "أضف صورة واحدة على الأقل"
            : "Add at least one image",
        );
        return false;
      }
    }

    if (step === 5) {
      if (!formData.status) return false;
    }

    return true;
  };

  const isStepComplete = (step: number) => {
    if (step === 1)
      return !!(
        formData.name &&
        formData.nameEn &&
        formData.sportType &&
        formData.description &&
        formData.descriptionEn
      );

    if (step === 2)
      return !!(
        formData.cityEn &&
        formData.city &&
        formData.address &&
        formData.addressEn &&
        formData.location
      );
    if (step === 3)
  return (
    formData.offPeakPrice > 0 &&
    formData.peakPrice > 0 &&
    !!formData.peakStartTime &&
    !!formData.peakEndTime &&
    !!formData.openTime &&
    !!formData.closeTime &&
    !hasPeakWindowConflict
  );
    if (step === 4) return formData.images.length >= 1;
    if (step === 5) return !!formData.status;
    return true;
  };

  const toCourtFromForm = (base?: Court): Court => {
    const cover =
      formData.images[formData.coverImageIndex] ||
      formData.images[0] ||
      (base as any)?.images?.[0];
    const images = formData.images.length
      ? formData.images
      : (base as any)?.images || [];

    const cityMeta =
      cities.find((c: any) => c.en === formData.cityEn) ||
      cities.find((c: any) => c.ar === formData.city);
    const cityAr = formData.city || cityMeta?.ar || "";
    const cityEn = formData.cityEn || cityMeta?.en || "";

    // Reorder images so cover is at index 0 (if valid index provided)
    let finalImages = [...images];
    if (formData.coverImageIndex > 0 && formData.coverImageIndex < finalImages.length) {
      const [coverImg] = finalImages.splice(formData.coverImageIndex, 1);
      finalImages.unshift(coverImg);
    }

    const courtData: any = {
      name: formData.name,
      nameEn: formData.nameEn || formData.name,
      sportType: formData.sportType,
      description: formData.description,
      descriptionEn: formData.descriptionEn || formData.description,
      city: cityAr,
      cityEn: cityEn,
      address: formData.address,
      addressEn: formData.addressEn || formData.address,
      location: formData.location,
      locationEn: formData.location,
      peakPrice: Number(formData.peakPrice),
      offPeakPrice: Number(formData.offPeakPrice),
      peakStartTime: formData.peakStartTime,
      peakEndTime: formData.peakEndTime,
      openTime: formData.openTime,
      closeTime: formData.closeTime,
      useOpeningDayForOvernightBookings: Boolean(formData.useOpeningDayForOvernightBookings && isOvernightFormHours),
      images: finalImages.length ? finalImages : cover ? [cover] : [],
      status: formData.status,
      ...(isAdmin ? {
        allowOnlinePayment: formData.allowOnlinePayment,
        paymentPolicy: formData.paymentPolicy,
        depositValue: formData.depositValue,
      } : {}),
    };

    // ONLY include an ID if we are editing an existing court.
    // For new courts, the backend database will automatically generate the real ID.
    if (base?.id) {
      courtData.id = base.id;
    } else {
      delete courtData.id;
      delete courtData.managerId; // The backend assigns this securely via the Auth token
    }

    return courtData as Court;
  };

  const createCourt = async () => {
    const courtPayload = toCourtFromForm();
    try {
      const res: any = await createCourtApi(courtPayload as any);
      // Fallback: Use res.court if it exists, otherwise use res directly
      const newCourt = res.court || res;

      setCourtsState((prev) => [newCourt as Court, ...prev]);
      toast.success(language === "ar" ? "تم إضافة الملعب بنجاح" : "Court added successfully");
    } catch (error: any) {
      toast.error(error?.message || (language === "ar" ? "تعذر إضافة الملعب" : "Could not add court"));
    }
  };

  const updateCourt = async (id: string) => {
    try {
      const courtPayload = toCourtFromForm(selectedCourt || undefined);
      const res: any = await updateCourtApi(id, courtPayload as any);
      const updatedCourt = res.court || res;

      setCourtsState((prev) => prev.map((c) => (c.id === id ? (updatedCourt as Court) : c)));
      toast.success(language === "ar" ? "تم تحديث الملعب بنجاح" : "Court updated successfully");
    } catch (error: any) {
      toast.error(error?.message || (language === "ar" ? "تعذر تحديث الملعب" : "Could not update court"));
    }
  };

  const removeCourt = async (id: string) => {
    try {
      await deleteCourtApi(id);
      setCourtsState((prev) => prev.filter((c) => c.id !== id));
      toast.success(language === "ar" ? "تم حذف الملعب" : "Court deleted");
    } catch (error: any) {
      toast.error(error?.message || (language === "ar" ? "تعذر حذف الملعب" : "Could not delete court"));
    }
  };

  const patchCourt = (id: string, patch: Partial<Court>) => {
    setCourtsState((prev) =>
      prev.map((c: any) => (c.id === id ? ({ ...c, ...patch } as Court) : c)),
    );
    setSelectedCourt((prev) =>
      prev && prev.id === id ? ({ ...(prev as any), ...patch } as Court) : prev,
    );
  };

  // ---------------------------------------------
  // Images
  // ---------------------------------------------
const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    if (files.length + formData.images.length > 10) {
      toast.error(
        language === "ar"
          ? "الحد الأقصى 10 صور للملعب"
          : "Maximum 10 images allowed per court"
      );
      e.target.value = ""; // Reset the input
      return; // Stop the upload process
    }

    const toastId = toast.loading(
      language === "ar" ? "جاري رفع الصور..." : "Uploading images..."
    );

    try {
      const arr = Array.from(files);
      const res = await uploadImages(arr);

      setFormData((p) => ({
        ...p,
        images: [...p.images, ...res.urls],
        coverImageIndex: p.images.length === 0 ? 0 : p.coverImageIndex,
      }));

      toast.success(
        language === "ar" ? "تم رفع الصور بنجاح" : "Images uploaded successfully",
        { id: toastId }
      );
    } catch (error: any) {
      toast.error(
        error.message || (language === "ar" ? "فشل رفع الصور" : "Upload failed"),
        { id: toastId }
      );
    } finally {
      e.target.value = "";
    }
  };

  const removeImage = (index: number) => {
    const images = formData.images.filter((_, i) => i !== index);
    const cover = Math.max(
      0,
      Math.min(formData.coverImageIndex, images.length - 1),
    );
    setFormData({ ...formData, images, coverImageIndex: cover });
  };

  const moveImage = (index: number, dir: "left" | "right") => {
    const images = [...formData.images];
    const swapWith = dir === "left" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= images.length) return;
    [images[index], images[swapWith]] = [images[swapWith], images[index]];

    let cover = formData.coverImageIndex;
    if (cover === index) cover = swapWith;
    else if (cover === swapWith) cover = index;

    setFormData({ ...formData, images, coverImageIndex: cover });
  };

  // ---------------------------------------------
  // Dialog actions
  // ---------------------------------------------
  const openView = (court: Court) => {
    setSelectedCourt(court);
    setViewDialogOpen(true);
  };
  const openClosures = (court: Court) => {
    setClosureCourt(court);
    setClosuresDialogOpen(true);
  };
  const openEdit = (court: Court) => {
    setSelectedCourt(court);
    setFormData({
      name: (court as any).name || "",
      nameEn: (court as any).nameEn || "",

      sportType: (court as any).sportType || "",

      description: (court as any).description || "",
      descriptionEn: (court as any).descriptionEn || "",

      city: (court as any).city || "",
      cityEn: (court as any).cityEn || "",

      address: (court as any).address || "",
      addressEn: (court as any).addressEn || "",

      location: (court as any).location || "",

      peakPrice: Number((court as any).peakPrice || 0),
      offPeakPrice: Number((court as any).offPeakPrice || 0),
      peakStartTime: (court as any).peakStartTime || "18:00",
      peakEndTime: (court as any).peakEndTime || "06:00",

      openTime: (court as any).openTime || (court as any).schedule?.[0]?.openTime || "08:00",
      closeTime: (court as any).closeTime || (court as any).schedule?.[0]?.closeTime || "23:00",
      useOpeningDayForOvernightBookings: Boolean((court as any).useOpeningDayForOvernightBookings),

      images: (court as any).images || [],
      coverImageIndex: 0,

      status: (court as any).status || "active",
      allowOnlinePayment: (court as any).allowOnlinePayment !== false,
      paymentPolicy: (court as any).paymentPolicy ?? "full",
      depositValue: Number((court as any).depositValue ?? 0),
    });

    setCurrentStep(1);
    setEditDialogOpen(true);
  };

  const triggerShake = () => {
    setShakeNext(true);
    setTimeout(() => setShakeNext(false), 600);
  };

  const handleCreateNextOrSave = () => {
    if (!isStepComplete(currentStep)) { triggerShake(); return; }
    if (!validateStep(currentStep)) { triggerShake(); return; }
    if (currentStep < totalSteps) return setCurrentStep((s) => s + 1);
    createCourt();
    setCreateDialogOpen(false);
    resetForm();
  };

  const handleEditNextOrSave = () => {
    if (!selectedCourt) return;
    if (!isStepComplete(currentStep)) { triggerShake(); return; }
    if (!validateStep(currentStep)) { triggerShake(); return; }
    if (currentStep < totalSteps) return setCurrentStep((s) => s + 1);
    updateCourt(selectedCourt.id);
    setEditDialogOpen(false);
    setCurrentStep(1);
    setSelectedCourt(null);
  };

  const handleDeleteCourt = () => {
    if (!selectedCourt) return;
    removeCourt(selectedCourt.id);
    setDeleteDialogOpen(false);
    setSelectedCourt(null);
    setViewDialogOpen(false);
  };

  const copyText = async (txt: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      toast.success(language === "ar" ? "تم النسخ" : "Copied");
    } catch {
      toast.error(language === "ar" ? "فشل النسخ" : "Copy failed");
    }
  };

  // ---------------------------------------------
  // Mobile slider
  // ---------------------------------------------
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [sliderIndex, setSliderIndex] = useState(0);

  const scrollSlider = (dir: "prev" | "next") => {
    const el = sliderRef.current;
    if (!el) return;
    const step = Math.round(el.clientWidth * 0.9);
    el.scrollBy({ left: dir === "next" ? step : -step, behavior: "smooth" });
  };

  const scrollTicking = useRef(false);

  const onSliderScroll = useCallback(() => {
    if (scrollTicking.current) return;
    scrollTicking.current = true;
    
    window.requestAnimationFrame(() => {
      const el = sliderRef.current;
      if (el) {
        const children = Array.from(el.children) as HTMLElement[];
        if (children.length) {
          const center = el.scrollLeft + el.clientWidth / 2;
          let bestIdx = 0;
          let bestDist = Infinity;
          children.forEach((child, idx) => {
            const childCenter = child.offsetLeft + child.clientWidth / 2;
            const dist = Math.abs(childCenter - center);
            if (dist < bestDist) {
              bestDist = dist;
              bestIdx = idx;
            }
          });
          setSliderIndex(bestIdx);
        }
      }
      scrollTicking.current = false;
    });
  }, []);

  useEffect(() => {
    const el = sliderRef.current;
    if (!el) return;
    const handler = () => onSliderScroll();
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  }, [onSliderScroll]);

  // ---------------------------------------------
  // Render: wizard steps (super clean)
  // ---------------------------------------------
  const WizardTop = ({
    title,
    subtitle,
  }: {
    title: string;
    subtitle: string;
  }) => {
    const pct = Math.round((currentStep / totalSteps) * 100);
    return (
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
            <p className="text-lg font-semibold">{title}</p>
          </div>
          <Badge variant="outline" className="rounded-2xl">
            {currentStep}/{totalSteps}
          </Badge>
        </div>
        <Progress value={pct} className="h-2 rounded-full" />
      </div>
    );
  };
  const StepNav = () => {
    const items = [
      language === "ar" ? "أساسي" : "Basic",
      language === "ar" ? "الموقع" : "Location",
      language === "ar" ? "السعر" : "Pricing",
      language === "ar" ? "الصور" : "Images",
      language === "ar" ? "الحالة" : "Status",
    ];
    return (
      <div
        className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-none"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((label, idx) => {
          const step = idx + 1;
          const active = currentStep === step;
          const done = step < currentStep;
          const visited = step <= currentStep;
          const warn = visited && !active && !isStepComplete(step);
          return (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (step > currentStep && !validateStep(currentStep)) return;
                setCurrentStep(step);
              }}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-1.5 rounded-2xl border px-2.5 py-1.5 text-xs font-medium transition-all",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : done
                    ? warn
                      ? "border-destructive/30 bg-destructive/5 text-destructive/70"
                      : "border-primary/20 bg-primary/5 text-primary/60"
                    : "border-border/60 text-muted-foreground bg-background/55",
              )}
            >
              {warn && (
                <span className="absolute -top-1 -end-1 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
              )}
              <span
                className={cn(
                  "h-5 w-5 grid shrink-0 place-items-center rounded-md border text-[10px] font-bold",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : done
                      ? warn
                        ? "bg-destructive/20 border-destructive/40 text-destructive"
                        : "bg-primary/20 border-primary/30 text-primary"
                      : "border-border/60",
                )}
              >
                {done ? (warn ? "!" : "✓") : step}
              </span>
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{label.slice(0, 3)}</span>
            </button>
          );
        })}
      </div>
    );
  };
  const PreviewPane = () => {
    const cover =
      formData.images[formData.coverImageIndex] ||
      formData.images[0] ||
      "/placeholder.svg";
    const isAr = language === "ar";

    const primaryName = isAr ? formData.name : formData.nameEn;
    const secondaryName = isAr ? formData.nameEn : formData.name;

    const primaryCity = isAr
      ? formData.city || formData.cityEn
      : formData.cityEn || formData.city;
    const secondaryCity = isAr ? formData.cityEn || "" : formData.city || "";

    const primaryAddr = isAr ? formData.address : formData.addressEn;
    const secondaryAddr = isAr ? formData.addressEn : formData.address;

    const sportLabel = isAr
      ? (sportTypes as any)[formData.sportType]?.ar || ""
      : (sportTypes as any)[formData.sportType]?.en || "";

    return (
      <Card className="rounded-2xl border-border/60 bg-background/60 backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {isAr ? "معاينة" : "Preview"}
          </CardTitle>
          <CardDescription className="text-sm">
            {isAr ? "تحديث مباشر أثناء الإدخال" : "Live as you type"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="relative aspect-[16/9] rounded-xl overflow-hidden border border-border/60 bg-muted">
            <NextImage
              src={cover}
              alt="cover"
              fill
              sizes="(max-width: 640px) 100vw, 50vw"
              className="object-cover"
            />
          </div>

          <div className="space-y-1">
            <p className="font-semibold truncate">
              {primaryName || (isAr ? "اسم الملعب" : "Court name")}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {secondaryName || ""}
            </p>

            <p className="text-xs text-muted-foreground truncate">
              {primaryAddr || (isAr ? "العنوان" : "Address")} •{" "}
              {primaryCity || (isAr ? "مدينة" : "City")}
            </p>

            {(secondaryAddr || secondaryCity) && (
              <p className="text-xs text-muted-foreground truncate">
                {(secondaryAddr || "").trim()}{" "}
                {secondaryAddr && secondaryCity ? "•" : ""}{" "}
                {(secondaryCity || "").trim()}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-2xl">
              {sportLabel || (isAr ? "رياضة" : "Sport")}
            </Badge>

            <div className="flex items-center gap-1.5 text-[11px] font-bold text-muted-foreground whitespace-nowrap">
              <Clock className="h-3 w-3" />
              <span>{format12h(formData.openTime, language)}</span>
              <span className="opacity-50">-</span>
              <span className="flex items-center gap-1">
                {format12h(formData.closeTime, language)}
              </span>
            </div>

            <StatusBadge variant={statusVariant(formData.status as any)} dot>
              {statusLabel(formData.status as any, language)}
            </StatusBadge>
          </div>

          <div className="mt-2 flex items-baseline gap-2">
            <p className="text-2xl font-bold tabular-nums">
              {fmtMoney(formData.offPeakPrice || 0)} -{" "}
              {fmtMoney(formData.peakPrice || 0)}
            </p>
            <p className="text-sm font-medium text-muted-foreground">
              {isAr ? "ج.م / ساعة" : "EGP / hr"}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderFormStep = () => {
    const isAr = language === "ar";

    const NameArabic = (
      <div className="grid gap-2">
        <Label htmlFor="name_ar">
          {isAr ? "اسم الملعب (عربي) *" : "Court Name (Arabic) *"}
        </Label>
        <Input
          id="name_ar"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="rounded-2xl"
        />
      </div>
    );


    const NameEnglish = (
      <div className="grid gap-2">
        <Label htmlFor="name_en">
          {isAr ? "اسم الملعب (English) *" : "Court Name (English) *"}
        </Label>
        <Input
          id="name_en"
          value={formData.nameEn}
          onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
          className="rounded-2xl"
        />
      </div>
    );

    const DescField = (
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <Label>
            {isAr ? "الوصف *" : "Description *"}
          </Label>
          {/* AR / EN tab switcher */}
          <div className="inline-flex rounded-xl border border-border/60 bg-muted/40 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setDescLang("primary")}
              className={cn(
                "rounded-lg px-2.5 py-1 font-medium transition-all",
                descLang === "primary"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isAr ? "عربي" : "EN"}
            </button>
            <button
              type="button"
              onClick={() => setDescLang("secondary")}
              className={cn(
                "rounded-lg px-2.5 py-1 font-medium transition-all",
                descLang === "secondary"
                  ? "bg-background shadow text-foreground"
                  : "text-muted-foreground hover:text-foreground",
                (!isAr ? formData.descriptionEn : formData.description)
                  ? "" : "text-muted-foreground/50"
              )}
            >
              {isAr ? "EN" : "عربي"}
            </button>
          </div>
        </div>
        {descLang === "primary" ? (
          <Textarea
            key="desc-primary"
            id="desc_primary"
            value={isAr ? formData.description : formData.descriptionEn}
            onChange={(e) =>
              isAr
                ? setFormData({ ...formData, description: e.target.value })
                : setFormData({ ...formData, descriptionEn: e.target.value })
            }
            className="rounded-2xl min-h-[100px]"
            placeholder={isAr ? "وصف الملعب بالعربية..." : "Describe the court in English..."}
          />
        ) : (
          <Textarea
            key="desc-secondary"
            id="desc_secondary"
            value={isAr ? formData.descriptionEn : formData.description}
            onChange={(e) =>
              isAr
                ? setFormData({ ...formData, descriptionEn: e.target.value })
                : setFormData({ ...formData, description: e.target.value })
            }
            className="rounded-2xl min-h-[100px]"
            placeholder={isAr ? "Describe the court in English..." : "وصف الملعب بالعربية..."}
          />
        )}
        {/* Completion indicators */}
        <div className="flex gap-3 text-[11px]">
          <span className={cn("flex items-center gap-1", formData.description ? "text-primary" : "text-muted-foreground/60")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", formData.description ? "bg-primary" : "bg-muted-foreground/40")} />
            {isAr ? "عربي" : "Arabic"}
          </span>
          <span className={cn("flex items-center gap-1", formData.descriptionEn ? "text-primary" : "text-muted-foreground/60")}>
            <span className={cn("h-1.5 w-1.5 rounded-full", formData.descriptionEn ? "bg-primary" : "bg-muted-foreground/40")} />
            English
          </span>
        </div>
      </div>
    );

    const AddressArabic = (
      <div className="grid gap-2">
        <Label htmlFor="address_ar">
          {isAr ? "العنوان التفصيلي (عربي) *" : "Detailed Address (Arabic) *"}
        </Label>
        <Input
          id="address_ar"
          value={formData.address}
          onChange={(e) =>
            setFormData({ ...formData, address: e.target.value })
          }
          className="rounded-2xl"
        />
      </div>
    );

    const AddressEnglish = (
      <div className="grid gap-2">
        <Label htmlFor="address_en">
          {isAr
            ? "العنوان التفصيلي (English) *"
            : "Detailed Address (English) *"}
        </Label>
        <Input
          id="address_en"
          value={formData.addressEn}
          onChange={(e) =>
            setFormData({ ...formData, addressEn: e.target.value })
          }
          className="rounded-2xl"
        />
      </div>
    );

    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            {/* Names */}
            <div className="grid md:grid-cols-2 gap-4">
              {isAr ? NameArabic : NameEnglish}
              {isAr ? NameEnglish : NameArabic}
            </div>

            {/* Sport + Size */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{isAr ? "نوع الرياضة *" : "Sport Type *"}</Label>
                <Select
                  value={formData.sportType}
                  onValueChange={(value) =>
                    setFormData({ ...formData, sportType: value })
                  }
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue
                      placeholder={isAr ? "اختر نوع الرياضة" : "Select sport"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(sportTypes).map(([key, value]) => (
                      <SelectItem key={key} value={key}>
                        {isAr ? (value as any).ar : (value as any).en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>


            </div>

            {/* Description with tab switcher */}
            {DescField}
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            {/* City + Location */}
            <div className="grid md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>{isAr ? "المدينة *" : "City *"}</Label>
                <Select
                  value={formData.cityEn}
                  onValueChange={(value) => {
                    const city = cities.find((c: any) => c.en === value);
                    setFormData((p) => ({
                      ...p,
                      city: city?.ar || city?.en || value,
                      cityEn: city?.en || value,
                    }));
                  }}
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue
                      placeholder={isAr ? "اختر المدينة" : "Select city"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((city: any, index: number) => (
                      <SelectItem key={index} value={city.en}>
                        {isAr ? city.ar : city.en}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* show both values (auto) */}
                <p className="text-xs text-muted-foreground mt-1">
                  {isAr
                    ? `English: ${formData.cityEn || "-"}`
                    : `Arabic: ${formData.city || "-"}`}
                </p>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="location">
                  {isAr
                    ? "الموقع (رابط/إحداثيات) *"
                    : "Location (link/coords) *"}
                </Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) =>
                    setFormData({ ...formData, location: e.target.value })
                  }
                  className="rounded-2xl"
                  placeholder={
                    isAr
                      ? "مثال: رابط Google Maps"
                      : "Example: Google Maps link"
                  }
                />
              </div>
            </div>

            {/* Addresses */}
            <div className="grid md:grid-cols-2 gap-4">
              {isAr ? AddressArabic : AddressEnglish}
              {isAr ? AddressEnglish : AddressArabic}
            </div>

            <Alert className="border-border/60 bg-muted/20">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                {isAr
                  ? "ضع رابط خرائط Google أو إحداثيات مثل: 30.0444, 31.2357"
                  : "Use a Google Maps link or coordinates like: 30.0444, 31.2357"}
              </AlertDescription>
            </Alert>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            {/* Prices row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="off_peak" className="text-xs">
                  {isAr ? "سعر غير الذروة *" : "Off-peak price *"}
                </Label>
                <div className="relative">
                  <Input
                    id="off_peak"
                    type="number"
                    inputMode="numeric"
                    value={formData.offPeakPrice || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, offPeakPrice: Number(e.target.value) || 0 })
                    }
                    className="rounded-2xl pe-12"
                    placeholder="300"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                    {isAr ? "ج.م" : "EGP"}
                  </span>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="peak_price" className="text-xs">
                  {isAr ? "سعر الذروة *" : "Peak price *"}
                </Label>
                <div className="relative">
                  <Input
                    id="peak_price"
                    type="number"
                    inputMode="numeric"
                    value={formData.peakPrice || ""}
                    onChange={(e) =>
                      setFormData({ ...formData, peakPrice: Number(e.target.value) || 0 })
                    }
                    className="rounded-2xl pe-12"
                    placeholder="450"
                  />
                  <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-muted-foreground">
                    {isAr ? "ج.م" : "EGP"}
                  </span>
                </div>
              </div>
            </div>

            {/* Open / Close row */}
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {isAr ? "ساعات التشغيل" : "Operating hours"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{isAr ? "الافتتاح *" : "Open *"}</Label>
                  <TimePicker
                    value={formData.openTime}
                    onChange={(val) => setFormData({ ...formData, openTime: val })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{isAr ? "الإغلاق *" : "Close *"}</Label>
                  <TimePicker
                    value={formData.closeTime}
                    onChange={(val) => setFormData({ ...formData, closeTime: val })}
                  />
                </div>
              </div>
            </div>

            {/* Peak window row */}
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                {isAr ? "ساعات الذروة" : "Peak hours"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs">{isAr ? "البداية *" : "From *"}</Label>
                  <TimePicker
                    value={formData.peakStartTime}
                    onChange={(val) => setFormData({ ...formData, peakStartTime: val })}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs">{isAr ? "النهاية *" : "To *"}</Label>
                  <TimePicker
                    value={formData.peakEndTime}
                    onChange={(val) => setFormData({ ...formData, peakEndTime: val })}
                  />
                </div>
              </div>
            </div>

            <p className="text-sm leading-6 text-muted-foreground">
              {isAr
                ? "\u0625\u0630\u0627 \u0643\u0627\u0646 \u0648\u0642\u062a \u0627\u0644\u0627\u0641\u062a\u062a\u0627\u062d \u064a\u0633\u0627\u0648\u064a \u0648\u0642\u062a \u0627\u0644\u0625\u063a\u0644\u0627\u0642 \u0641\u0633\u064a\u062a\u0645 \u0627\u0639\u062a\u0628\u0627\u0631 \u0627\u0644\u0645\u0644\u0639\u0628 \u0645\u0641\u062a\u0648\u062d\u064b\u0627 24 \u0633\u0627\u0639\u0629. \u0648\u064a\u0645\u0643\u0646 \u0644\u0633\u0627\u0639\u0627\u062a \u0627\u0644\u0630\u0631\u0648\u0629 \u0623\u0646 \u062a\u0645\u062a\u062f \u0628\u0639\u062f \u0645\u0646\u062a\u0635\u0641 \u0627\u0644\u0644\u064a\u0644."
                : "If open time equals close time, the court will be treated as open 24 hours. Peak hours can also cross midnight."}
            </p>

            <label className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-primary"
                checked={Boolean(formData.useOpeningDayForOvernightBookings && isOvernightFormHours)}
                disabled={!isOvernightFormHours}
                onChange={(event) =>
                  setFormData({
                    ...formData,
                    useOpeningDayForOvernightBookings: event.target.checked,
                  })
                }
              />
              <span className="space-y-1">
                <span className="block text-sm font-bold">
                  {isAr ? "\u0631\u0628\u0637 \u0633\u0627\u0639\u0627\u062a \u0628\u0639\u062f \u0645\u0646\u062a\u0635\u0641 \u0627\u0644\u0644\u064a\u0644 \u0628\u0627\u0644\u064a\u0648\u0645 \u0627\u0644\u0633\u0627\u0628\u0642" : "Group late-night slots with the previous day"}
                </span>
                <span className="block text-xs leading-5 text-muted-foreground">
                  {isAr
                    ? "\u0644\u0644\u0645\u0644\u0627\u0639\u0628 \u0627\u0644\u0644\u064a\u0644\u064a\u0629 \u0641\u0642\u0637\u060c \u0645\u062b\u0644 08:00 \u0625\u0644\u0649 03:00. \u0627\u0644\u062d\u062c\u0648\u0632\u0627\u062a \u0628\u0639\u062f \u0645\u0646\u062a\u0635\u0641 \u0627\u0644\u0644\u064a\u0644 \u062a\u064f\u062d\u0633\u0628 \u0636\u0645\u0646 \u0627\u0644\u064a\u0648\u0645 \u0627\u0644\u0630\u064a \u0628\u062f\u0623 \u0641\u064a\u0647 \u0627\u0644\u0645\u0644\u0639\u0628 \u0644\u0644\u062a\u0642\u0627\u0631\u064a\u0631 \u0648\u0627\u0644\u0625\u064a\u0631\u0627\u062f\u0627\u062a\u060c \u0648\u064a\u0638\u0647\u0631 \u0644\u0644\u0627\u0639\u0628 \u0627\u0644\u062a\u0627\u0631\u064a\u062e \u0627\u0644\u062d\u0642\u064a\u0642\u064a. \u0644\u0627 \u062a\u0646\u0637\u0628\u0642 \u0639\u0644\u0649 \u0645\u0644\u0627\u0639\u0628 24 \u0633\u0627\u0639\u0629."
                    : "For overnight courts only, like 08:00 AM to 03:00 AM. Slots after midnight count toward the day the court opened for reports and revenue; players still see the real calendar date. 24-hour courts are not affected."}
                </span>
              </span>
            </label>

            {formData.openTime === formData.closeTime &&
              formData.openTime !== "" && (
                <div className="flex items-center gap-2 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-2 text-primary">
                  <Zap className="h-4 w-4" />
                  <span className="text-sm font-bold">
                    {isAr ? "الملعب مفتوح ٢٤ ساعة" : "Court is open 24 hours"}
                  </span>
                </div>
              )}

            {hasPeakWindowConflict && (
              <div className="flex items-center gap-2 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {isAr
                    ? "يجب أن تكون ساعات الذروة مختلفة وأن تتقاطع مع ساعات تشغيل الملعب."
                    : "Peak hours must be different and overlap with the court operating hours."}
                </span>
              </div>
            )}

            <div className="flex items-start gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3">
              <span className="inline-flex min-h-8 min-w-10 items-center justify-center rounded-xl border border-border/60 bg-background px-2 text-xs font-black text-foreground">
                {isAr ? "ج.م" : "EGP"}
              </span>
              <p className="text-sm leading-6 text-muted-foreground">
                {isAr
                  ? "الأسعار بالساعة. اضبط سعر الذروة وغير الذروة حسب ساعات تشغيل الملعب."
                  : "Prices are per hour. Set off-peak and peak prices based on the court operating hours."}
              </p>
            </div>

          </div>
        );

case 4:
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="grid gap-1">
          <Label>{isAr ? "صور الملعب *" : "Court images *"}</Label>
          <p className="text-xs text-muted-foreground">
            {isAr
              ? "أضف صورة واحدة على الأقل واختر صورة الغلاف"
              : "Add at least one image and pick a cover"}
          </p>
        </div>

        <div>
          <input
            id="court_images_upload"
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />
          <Button
            variant="outline"
            className="rounded-2xl bg-transparent"
            asChild
          >
            <label htmlFor="court_images_upload" className="cursor-pointer">
              <Upload className="me-2 h-4 w-4" />
              {isAr ? "رفع صور" : "Upload"}
            </label>
          </Button>
        </div>
      </div>

      {formData.images.length === 0 ? (
        <EmptyState
          icon={Image}
          title={isAr ? "لا توجد صور بعد" : "No images yet"}
          description={
            isAr
              ? "ارفع صورًا لعرض الملعب بشكل أفضل"
              : "Upload images to showcase the court"
          }
        />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <AnimatePresence mode="popLayout">
            {formData.images.map((img, idx) => {
              const isCover = idx === formData.coverImageIndex;
              return (
                <motion.div
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={`${img}-${idx}`}
                  className="rounded-2xl border border-border/60 bg-background/60 p-2"
                >
                  <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-border/60 bg-muted group/img">
                    <NextImage
                      src={img}
                      alt={`img-${idx}`}
                      fill
                      sizes="(max-width: 768px) 50vw, 33vw"
                      className="object-cover transition-transform duration-500 group-hover/img:scale-110"
                    />

                    {/* Cover badge */}
                    <div className="absolute top-2 start-2 flex flex-col gap-2">
                      {isCover && (
                        <Badge className="rounded-2xl bg-primary text-primary-foreground shadow-lg border-none px-3 py-1">
                          <Sparkles className="h-3 w-3 me-1.5" />
                          {isAr ? "غلاف" : "Cover"}
                        </Badge>
                      )}
                    </div>

                    {/* Top-right delete (glassmorphism hover) */}
                    <div className="absolute top-2 end-2 flex gap-1.5 translate-y-[-10px] opacity-0 group-hover/img:translate-y-0 group-hover/img:opacity-100 transition-all duration-300">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 rounded-xl bg-white/20 backdrop-blur-md border-white/30 text-white hover:bg-white/40"
                        onClick={() => removeImage(idx)}
                        title={isAr ? "حذف" : "Remove"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Bottom overlay: set-cover + reorder (glassmorphism hover) */}
                    <div className="absolute inset-x-2 bottom-2 p-1.5 rounded-xl bg-black/30 backdrop-blur-md border border-white/10 flex items-center justify-between opacity-0 group-hover/img:opacity-100 transition-opacity duration-300">
                      {!isCover && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-[10px] font-bold text-white hover:bg-white/20 rounded-lg px-2"
                          onClick={() => {
                            const newImages = [...formData.images];
                            const coverImg = newImages.splice(idx, 1)[0];
                            newImages.unshift(coverImg);
                            setFormData({ ...formData, images: newImages, coverImageIndex: 0 });
                          }}
                        >
                          {isAr ? "تعيين غلاف" : "Set cover"}
                        </Button>
                      )}
                      <div className={cn("flex items-center gap-1", isCover && "w-full justify-center")}>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-white hover:bg-white/20 rounded-lg"
                          onClick={() => moveImage(idx, "left")}
                          disabled={idx === 0}
                        >
                          <ChevronLeft className={cn("h-4 w-4", isAr && "rotate-180")} />
                        </Button>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-white hover:bg-white/20 rounded-lg"
                          onClick={() => moveImage(idx, "right")}
                          disabled={idx === formData.images.length - 1}
                        >
                          <ChevronRight className={cn("h-4 w-4", isAr && "rotate-180")} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Mobile fallback row (touch devices) */}
                  <div className="mt-2 flex items-center justify-between gap-2 md:hidden">
                    {isCover ? (
                      <span className="inline-flex flex-1 items-center justify-center gap-1.5 h-9 rounded-2xl px-3 text-xs font-bold bg-primary/10 text-primary border border-primary/25 select-none">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        {isAr ? "الغلاف الحالي" : "Cover"}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-2xl flex-1 text-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"
                        onClick={() => {
                          const newImages = [...formData.images];
                          const coverImg = newImages.splice(idx, 1)[0];
                          newImages.unshift(coverImg);
                          setFormData({ ...formData, images: newImages, coverImageIndex: 0 });
                        }}
                      >
                        {isAr ? "تعيين غلاف" : "Set cover"}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 rounded-2xl bg-transparent text-destructive hover:bg-destructive/10"
                      onClick={() => removeImage(idx)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );

case 5:
  return (
    <div className="space-y-6">
      <div className="grid gap-2">
        <Label>{isAr ? "الحالة *" : "Status *"}</Label>
        <Select
          value={formData.status}
          onValueChange={(value) =>
            setFormData({ ...formData, status: value as any })
          }
        >
          <SelectTrigger className="rounded-2xl">
            <SelectValue placeholder={isAr ? "اختر الحالة" : "Select status"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{isAr ? "نشط" : "Active"}</SelectItem>
            <SelectItem value="inactive">{isAr ? "غير نشط" : "Inactive"}</SelectItem>
            <SelectItem value="maintenance">{isAr ? "صيانة" : "Maintenance"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Alert className="border-border/60 bg-muted/20">
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm">
          {isAr
            ? "يمكنك تغيير الحالة لاحقًا من صفحة الملعب."
            : "You can change status later from the court page."}
        </AlertDescription>
      </Alert>
    </div>
  );
      default:
        return null;
    }
  };

  // ---------------------------------------------
  // Court Card (modern + animated hover)
  // ---------------------------------------------
  const CourtCard = ({ court, imagePriority = false }: { court: Court; imagePriority?: boolean }) => {
    const stats = courtStatsMap[court.id];
    const imgs = getCourtImages(court);
    const cover = imgs[0] || "/placeholder.svg";
    const { openTime, closeTime } = getCourtHours(court);

    return (
      <MotionCard
        layout={!isMobile}
        whileHover={isMobile || prefersReducedMotion ? undefined : { y: -4 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        className={cn(
          "group overflow-hidden border-border/50 cursor-pointer hover:shadow-lg hover:shadow-primary/5 flex flex-col h-full",
        )}
        onClick={(e) => {
          if (e.defaultPrevented) return;
          openView(court);
        }}
      >
        <div className="relative aspect-[16/9] bg-muted overflow-hidden shrink-0">
          <NextImage
            src={cover}
            alt={language === "ar" ? (court as any).name : (court as any).nameEn}
            fill
            loading={imagePriority ? "eager" : "lazy"}
            fetchPriority={imagePriority ? "high" : undefined}
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
<div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
<div className="absolute inset-0 bg-black/10" />

          <div className="absolute start-3 top-3 flex flex-wrap gap-2">
            <StatusBadge
              variant={statusVariant(court.status as any)}
              dot
              pulse={court.status === "active"}
            >
              {statusLabel(court.status as any, language)}
            </StatusBadge>

            {(court as any).isVerified && (
              <Badge
                variant="outline"
                className="bg-gold/20 border-gold/50 text-gold rounded-2xl"
              >
                <Shield className="h-3 w-3 me-1" />
                {language === "ar" ? "موثق" : "Verified"}
              </Badge>
            )}

            {(court as any).isFeatured && (
              <Badge
                variant="outline"
                className="bg-primary/15 border-primary/30 text-primary rounded-2xl"
              >
                <Crown className="h-3 w-3 me-1" />
                {language === "ar" ? "مميز" : "Featured"}
              </Badge>
            )}
          </div>

          <div className="absolute end-3 top-3 z-20">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
  <Button
    variant="secondary"
    size="icon"
    className="h-9 w-9 rounded-2xl bg-background/80 backdrop-blur-sm"
    aria-label={language === "ar" ? "إجراءات الملعب" : "Court actions"}
    title={language === "ar" ? "إجراءات الملعب" : "Court actions"}
    onPointerDown={(e) => {
      e.stopPropagation()
    }}
    onClick={(e) => {
      e.stopPropagation()
    }}
  >
    <MoreHorizontal className="h-4 w-4" />
  </Button>
</DropdownMenuTrigger>

              <DropdownMenuContent
  align="end"
  className="w-56 rounded-2xl"
  onPointerDown={(e) => {
    e.stopPropagation()
  }}
  onClick={(e) => {
    e.stopPropagation()
  }}
>
  <DropdownMenuLabel className="truncate">
    {language === "ar" ? (court as any).name : (court as any).nameEn}
  </DropdownMenuLabel>

  <DropdownMenuSeparator />

  <DropdownMenuItem
    onSelect={(e) => {
      e.preventDefault()
      // stop the card click
      ;(e as any).stopPropagation?.()
      openView(court)
    }}
  >
    <Eye className="h-4 w-4 me-2" />
    {t("common.view")}
  </DropdownMenuItem>

  <DropdownMenuItem
    onSelect={(e) => {
      e.preventDefault()
      ;(e as any).stopPropagation?.()
      openEdit(court)
    }}
  >
    <Edit className="h-4 w-4 me-2" />
    {t("common.edit")}
  </DropdownMenuItem>

  <DropdownMenuItem
    onSelect={(e) => {
      e.preventDefault()
      ;(e as any).stopPropagation?.()
      openClosures(court)
    }}
  >
    <CalendarDays className="h-4 w-4 me-2" />
    {language === "ar" ? "إغلاقات الملعب" : "Court closures"}
  </DropdownMenuItem>

  <DropdownMenuSeparator />

  <DropdownMenuItem
    onSelect={(e) => {
      e.preventDefault()
      ;(e as any).stopPropagation?.()
      copyText(court.id)
    }}
  >
    <Copy className="h-4 w-4 me-2" />
    {language === "ar" ? "نسخ المعرف" : "Copy ID"}
  </DropdownMenuItem>

  <DropdownMenuSeparator />

  <DropdownMenuItem
    className="text-destructive focus:text-destructive"
    onSelect={(e) => {
      e.preventDefault()
      ;(e as any).stopPropagation?.()
      setSelectedCourt(court)
      setDeleteDialogOpen(true)
    }}
  >
    <Trash2 className="h-4 w-4 me-2" />
    {t("common.delete")}
  </DropdownMenuItem>
</DropdownMenuContent>

            </DropdownMenu>
          </div>

          <div className="absolute bottom-3 start-3 end-3">
            <h3 className="font-semibold text-white text-lg truncate">
              {language === "ar" ? (court as any).name : (court as any).nameEn}
            </h3>

            <div className="mt-1 flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-sm text-white/80 min-w-0">
                <MapPin className="h-3.5 w-3.5" />
                <span className="truncate">
                  {language === "ar"
                    ? (court as any).address
                    : (court as any).addressEn}
                </span>
              </div>

              <div className="shrink-0">
                {stats?.activeNow ? (
                  <Badge
                    variant="outline"
                    className="bg-success/15 text-success border-success/25 rounded-2xl"
                  >
                    <Radio className="h-3 w-3 me-1 animate-pulse" />
                    {language === "ar" ? "مشغول الآن" : "Occupied"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-muted/40 rounded-2xl">
                    {language === "ar" ? "متاح" : "Available"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <CardContent className="p-4 flex flex-col flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge variant="primary">
              {language === "ar"
                ? (sportTypes as any)[(court as any).sportType]?.ar
                : (sportTypes as any)[(court as any).sportType]?.en}
            </StatusBadge>

            <div className="flex flex-col gap-0.5 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                {formatOperatingHours(openTime, closeTime, language)}
              </div>

            </div>

            {stats?.nextBooking && (
              <Badge variant="outline" className="rounded-2xl bg-muted/30">
                <CalendarDays className="h-3.5 w-3.5 me-1" />
                {language === "ar" ? "التالي" : "Next"}:{" "}
                <span dir="ltr" className="ms-1">{stats.nextBooking.date} {format12h(stats.nextBooking.startTime, language)}</span>
              </Badge>
            )}
          </div>

          <SoftDivider className="mt-auto mb-4 pt-4" />

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl border border-border/50 bg-muted/20 p-3 text-center">
              <p className="text-lg font-bold">{stats?.bookings || 0}</p>
              <p className="text-xs text-muted-foreground">
                {language === "ar" ? "حجوزات" : "Bookings"}
              </p>
            </div>

            <div className="rounded-2xl border border-border/50 bg-muted/20 p-3 text-center">
              <p className="text-lg font-bold">{stats?.occupancyRate || 0}%</p>
              <p className="text-xs leading-tight text-muted-foreground">
                {usageLabel}
              </p>
            </div>
          </div>
        </CardContent>
      </MotionCard>
    );
  };

  // ---------------------------------------------
  // View Dialog (HUGE enhancement)
  // ---------------------------------------------
  // ---------------------------------------------
// View Dialog (MODERN / CLEAN / REAL PRODUCT)
// ---------------------------------------------
const CourtViewDialog = () => {
  // 1. Move the hooks UP here, BEFORE any early returns!
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const c = selectedCourt as any;

  if (!c) return null;

  const isAr = language === "ar"
  const stats = courtStatsMap[c.id]

  const imgs = getCourtImages(c)
  const cover = imgs[0] || "/placeholder.svg"
  const { openTime, closeTime } = getCourtHours(c)

  const primaryName = isAr ? c.name : c.nameEn
  const secondaryName = isAr ? c.nameEn : c.name

  const primaryCity = isAr ? (c.city || c.cityEn) : (c.cityEn || c.city)
  const secondaryCity = isAr ? (c.cityEn || "") : (c.city || "")

  const primaryAddress = isAr ? (c.address || c.addressEn) : (c.addressEn || c.address)
  const secondaryAddress = isAr ? (c.addressEn || "") : (c.address || "")

  const sportLabel = isAr ? (sportTypes as any)[c.sportType]?.ar : (sportTypes as any)[c.sportType]?.en


  const dayPrice = Number(c.offPeakPrice || 0)
  const nightPrice = Number(c.peakPrice || 0)

  const InfoRow = ({
    icon,
    label,
    value,
    secondary,
    action,
  }: {
    icon?: React.ReactNode
    label: string
    value: React.ReactNode
    secondary?: React.ReactNode
    action?: React.ReactNode
  }) => (
    <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 bg-background/60 p-4">
      <div className="flex items-start gap-3 min-w-0">
        {icon ? (
          <div className="mt-0.5 h-9 w-9 rounded-2xl border border-border/60 bg-muted/30 grid place-items-center shrink-0">
            {icon}
          </div>
        ) : null}

        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="font-semibold leading-snug break-words">{value}</p>
          {!!secondary && <p className="text-xs text-muted-foreground mt-1 break-words">{secondary}</p>}
        </div>
      </div>

      {!!action && <div className="shrink-0">{action}</div>}
    </div>
  )

  const SectionTitle = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="space-y-1">
      <p className="text-sm font-semibold">{title}</p>
      {!!subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  )


const openLightbox = (idx: number) => {
  setLightboxIndex(idx)
  setLightboxOpen(true)
}

const closeLightbox = () => setLightboxOpen(false)

const lightboxImages = (imgs?.length ? imgs : [cover]) as string[]


  return (
    <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
      <DialogContent
        dir={language === "ar" ? "rtl" : "ltr"}
        className={cn(
          "p-0 overflow-hidden rounded-3xl",
          "w-[96vw] sm:max-w-6xl",
          "max-h-[92vh] sm:max-h-[90vh]",
          "[&>button]:hidden", // ✅ removes default close X (so only our nice one stays)
          language === "ar" && "font-arabic"
        )}
      >
        {/* Accessible title (kept) */}
        <DialogHeader className="sr-only">
          <DialogTitle>{primaryName || (isAr ? "عرض الملعب" : "Court details")}</DialogTitle>
          <DialogDescription>{isAr ? "تفاصيل الملعب" : "Court details"}</DialogDescription>
        </DialogHeader>

        {/* HERO */}
        <div className="relative h-[220px] sm:h-[280px] bg-muted overflow-hidden">
          {/* image */}
          <motion.div
            initial={prefersReducedMotion ? false : { scale: 1.03, opacity: 0.85 }}
            animate={prefersReducedMotion ? undefined : { scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 160, damping: 22 }}
            className="absolute inset-0"
          >
            <NextImage src={cover} alt="cover" fill sizes="100vw" className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />
          </motion.div>

          {/* overlay layout */}
          <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-6">
            {/* top: status + actions */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={statusVariant(c.status)} dot pulse={c.status === "active"}>
                  {statusLabel(c.status, language)}
                </StatusBadge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-2xl bg-white/15 text-white border-white/20 backdrop-blur-md hover:bg-white/25"
                  onClick={() => {
                    setViewDialogOpen(false)
                    openEdit(c as Court)
                  }}
                >
                  <Edit className="h-4 w-4 me-2" />
                  {isAr ? "تعديل" : "Edit"}
                </Button>



                {/* ✅ the only close button */}
                <Button
                  size="icon"
                  variant="outline"
                  className="rounded-2xl bg-white/15 text-white border-white/20 backdrop-blur-md hover:bg-white/25 h-9 w-9"
                  onClick={() => setViewDialogOpen(false)}
                  title={isAr ? "إغلاق" : "Close"}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* bottom: title + chips */}
            <div className="space-y-3">
              <div className="min-w-0">
                <h2
                  className={cn(
                    "text-white font-extrabold tracking-tight truncate",
                    "text-3xl sm:text-5xl",
                    "drop-shadow-[0_10px_24px_rgba(0,0,0,0.65)]",
                  )}
                >
                  {primaryName || (isAr ? "اسم الملعب" : "Court name")}
                </h2>

                {!!secondaryName && (
                  <p className="mt-1 text-white/80 text-sm sm:text-base truncate drop-shadow-[0_2px_10px_rgba(0,0,0,0.55)]">
                    {secondaryName}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge className="rounded-2xl bg-white/15 text-white border border-white/20 backdrop-blur-md">
                  {sportLabel || (isAr ? "رياضة" : "Sport")}
                </Badge>



                <Badge className="rounded-2xl bg-white/15 text-white border border-white/20 backdrop-blur-md">
                  <Clock className="h-4 w-4 me-2" />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                    <span className="font-bold">{formatOperatingHours(openTime, closeTime, language)}</span>
                  </div>
                </Badge>

                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-2xl bg-white/15 text-white border border-white/20 backdrop-blur-md hover:bg-white/25"
                  asChild
                >
                  <a href={String(c.location || "#")} target="_blank" rel="noreferrer">
                    <MapPin className="h-4 w-4 me-2" />
                    {isAr ? "فتح الخريطة" : "Open map"}
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto max-h-[calc(92vh-220px)] sm:max-h-[calc(90vh-280px)]">
          <Tabs dir={language === "ar" ? "rtl" : "ltr"} defaultValue="overview" className="space-y-5">
            <TabsList className="grid grid-cols-3 rounded-2xl bg-muted/30 p-1">
              <TabsTrigger value="overview" className="rounded-xl">
                {isAr ? "التفاصيل" : "Details"}
              </TabsTrigger>
              <TabsTrigger value="media" className="rounded-xl">
                {isAr ? "الصور" : "Images"}
              </TabsTrigger>
              <TabsTrigger value="performance" className="rounded-xl">
                {isAr ? "الأداء" : "Performance"}
              </TabsTrigger>
            </TabsList>

            {/* DETAILS TAB (only the fields you want) */}
            <TabsContent value="overview" className="space-y-5">
              <div className="grid lg:grid-cols-[1fr,360px] gap-4">
                {/* Left column */}
                <div className="space-y-4">
                  <SectionTitle
                    title={isAr ? "معلومات الملعب" : "Court info"}
                    subtitle={isAr ? "كل البيانات بالعربي والإنجليزي" : "Arabic + English values"}
                  />

                  <InfoRow
                    icon={<Building2 className="h-4 w-4 text-muted-foreground" />}
                    label={isAr ? "اسم الملعب" : "Court name"}
                    value={primaryName || "-"}
                    secondary={secondaryName || ""}
                  />

                  <InfoRow
                    icon={<BadgeCheck className="h-4 w-4 text-muted-foreground" />}
                    label={isAr ? "نوع الرياضة" : "Sport type"}
                    value={sportLabel || "-"}
                  />

                  {/* Overnight mode indicator — only shown for overnight courts */}
                  {(() => {
                    const oM = openTime ? openTime.split(":").map(Number) : null;
                    const cM = closeTime ? closeTime.split(":").map(Number) : null;
                    const isOvernight =
                      oM && cM && (cM[0] * 60 + cM[1]) < (oM[0] * 60 + oM[1]);
                    if (!isOvernight) return null;
                    const modeOn = Boolean(c.useOpeningDayForOvernightBookings);
                    return (
                      <InfoRow
                        icon={<Zap className={`h-4 w-4 ${modeOn ? "text-amber-500" : "text-muted-foreground"}`} />}
                        label={isAr ? "وضع اليوم الافتتاحي" : "Opening Day Mode"}
                        value={
                          modeOn
                            ? (isAr ? "مفعّل ✓" : "Enabled ✓")
                            : (isAr ? "معطّل" : "Disabled")
                        }
                        secondary={
                          modeOn
                            ? (isAr
                              ? "الحجوزات بعد منتصف الليل تنتمي ليوم الافتتاح في التقارير"
                              : "After-midnight slots count toward the opening day in reports")
                            : (isAr
                              ? "الحجوزات بعد منتصف الليل تُحسب في تاريخ التقويم الفعلي"
                              : "After-midnight slots use their real calendar date")
                        }
                      />
                    );
                  })()}

                  <InfoRow
                    icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
                    label={isAr ? "المدينة" : "City"}
                    value={primaryCity || "-"}
                    secondary={secondaryCity || ""}
                  />

                  <InfoRow
                    icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
                    label={isAr ? "العنوان التفصيلي" : "Detailed address"}
                    value={primaryAddress || "-"}
                    secondary={secondaryAddress || ""}
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-2xl"
                        asChild
                      >
                        <a href={String(c.location || "#")} target="_blank" rel="noreferrer">
                          {isAr ? "خريطة" : "Map"}
                        </a>
                      </Button>
                    }
                  />

                  <InfoRow
                    icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
                    label={isAr ? "الموقع (رابط/إحداثيات)" : "Location (link/coords)"}
                    value={String(c.location || "-")}
                    action={
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-2xl"
                        onClick={() => copyText(String(c.location || ""))}
                        disabled={!c.location}
                      >
                        <Copy className="h-4 w-4 me-2" />
                        {isAr ? "نسخ" : "Copy"}
                      </Button>
                    }
                  />

                  <div className="rounded-2xl border border-border/50 bg-background/60 p-4 space-y-3">
                    <SectionTitle title={isAr ? "الوصف" : "Description"} />
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-border/50 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">{isAr ? "عربي" : "Arabic"}</p>
                        <p className="mt-2 text-sm leading-relaxed break-words">{String(c.description || "-")}</p>
                      </div>
                      <div className="rounded-2xl border border-border/50 bg-muted/20 p-3">
                        <p className="text-xs text-muted-foreground">{isAr ? "English" : "English"}</p>
                        <p className="mt-2 text-sm leading-relaxed break-words">{String(c.descriptionEn || "-")}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right column (pricing + status) */}
                <div className="space-y-4">
                  <SectionTitle title={isAr ? "السعر والحالة" : "Pricing & status"} />

                  <Card className="border-border/50 rounded-3xl overflow-hidden">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">{isAr ? "الأسعار" : "Prices"}</CardTitle>
                      <CardDescription className="text-sm">
                        {isAr ? "سعر الساعة" : "Hourly pricing"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                          <p className="text-xs text-muted-foreground">{isAr ? "سعر 6ص–6م" : "6AM–6PM price"}</p>
                          <p className="mt-1 text-xl font-extrabold">
                            {fmtMoney(dayPrice)} <span className="text-xs text-muted-foreground">{t("common.egp")}</span>
                          </p>
                        </div>
                        <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                          <p className="text-xs text-muted-foreground">{isAr ? "سعر 6م–6ص" : "6PM–6AM price"}</p>
                          <p className="mt-1 text-xl font-extrabold">
                            {fmtMoney(nightPrice)} <span className="text-xs text-muted-foreground">{t("common.egp")}</span>
                          </p>
                        </div>
                      </div>

                      <SoftDivider />

                      <div className="flex items-center justify-between rounded-2xl border border-border/50 bg-muted/20 p-4">
                        <div>
                          <p className="text-xs text-muted-foreground">{isAr ? "الحالة" : "Status"}</p>
                          <p className="mt-1 font-semibold">{statusLabel(c.status, language)}</p>
                        </div>
                        <StatusBadge variant={statusVariant(c.status)} dot>
                          {statusLabel(c.status, language)}
                        </StatusBadge>
                      </div>
                    </CardContent>
                  </Card>

                  <Button
                    variant="outline"
                    className="w-full rounded-2xl"
                    onClick={() => exportCSV([c as Court])}
                  >
                    <Download className="h-4 w-4 me-2" />
                    {isAr ? "تصدير CSV" : "Export CSV"}
                  </Button>

                  <Button
                    variant="destructive"
                    className="w-full rounded-2xl"
                    onClick={() => {
                      setSelectedCourt(c as Court)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 me-2" />
                    {isAr ? "حذف" : "Delete"}
                  </Button>
                </div>
              </div>

            </TabsContent>

            {/* IMAGES TAB */}
            <TabsContent value="media" className="space-y-4">
              <div className="flex items-center justify-between">
                <SectionTitle title={isAr ? "صور الملعب" : "Court images"} subtitle={isAr ? "اضغط لنسخ رابط الصورة" : "Click to copy image URL"} />
                <Badge variant="outline" className="rounded-2xl">
                  {isAr ? "عدد الصور" : "Total"}: {imgs.length || 1}
                </Badge>
              </div>

             <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
  {(imgs.length ? imgs : [cover]).slice(0, 20).map((im: string, idx: number) => (
    <button
      key={idx}
      type="button"
      className="group relative overflow-hidden rounded-2xl border border-border/50 bg-muted aspect-[4/3]"
      onClick={() => openLightbox(idx)}
      title={isAr ? "اضغط لعرض الصورة" : "Click to preview"}
    >
      <NextImage
        src={im}
        alt={`img_${idx}`}
        fill
        sizes="(max-width: 768px) 100vw, 25vw"
        className="object-cover transition-transform duration-500 group-hover:scale-110"
      />

      {/* subtle hover overlay */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-black/25" />

      {/* small icon */}
      <div className="absolute bottom-2 start-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <Badge variant="outline" className="rounded-2xl bg-black/30 text-white border-white/20">
          <Eye className="h-3 w-3 me-1" />
          {isAr ? "عرض" : "View"}
        </Badge>
      </div>
    </button>
  ))}
</div>

            </TabsContent>

            {/* PERFORMANCE TAB (optional) */}
            <TabsContent value="performance" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <KpiCard title={isAr ? "الحجوزات" : "Bookings"} value={stats?.bookings || 0} />
                <KpiCard title={usageLabel} value={`${stats?.occupancyRate || 0}%`} />
                <KpiCard title={isAr ? "نشط الآن" : "Active now"} value={stats?.activeNow || 0} />
              </div>

              {stats?.nextBooking && (
                <Alert className="border-border/60 bg-muted/20">
                  <CalendarDays className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    {isAr ? "الحجز التالي" : "Next booking"}:{" "}
                    <span className="font-semibold" dir="ltr">
                      {stats.nextBooking.date} • {format12h(stats.nextBooking.startTime, language)} - {format12h(stats.nextBooking.endTime, language)}
                    </span>
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
          {/* Image Lightbox */}
{/* Image Lightbox (modern) */}
<Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
  <DialogContent className="max-w-6xl rounded-3xl p-0 overflow-hidden bg-transparent border-0 shadow-none [&>button]:hidden">
    <DialogHeader className="sr-only">
      <DialogTitle>{isAr ? "عرض الصورة" : "Image preview"}</DialogTitle>
      <DialogDescription>{isAr ? "معاينة صورة الملعب" : "Court image preview"}</DialogDescription>
    </DialogHeader>

    {/* Backdrop */}
    <div className="relative w-full h-[82vh] sm:h-[86vh] rounded-3xl overflow-hidden">
      {/* blurred dark overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />

      {/* Top bar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-white backdrop-blur-md">
          <Eye className="h-4 w-4" />
          <span className="text-sm font-medium">
            {isAr ? "صورة الملعب" : "Court image"}
          </span>
          <span className="text-xs text-white/70">
            • {lightboxIndex + 1}/{lightboxImages.length}
          </span>
        </div>

        <Button
          size="icon"
          variant="outline"
          className="h-10 w-10 rounded-2xl bg-white/10 text-white border-white/15 hover:bg-white/20 backdrop-blur-md"
          onClick={() => setLightboxOpen(false)}
          title={isAr ? "إغلاق" : "Close"}
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Image stage */}
      <div className="relative z-10 h-full w-full flex items-center justify-center px-4 sm:px-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={lightboxImages[lightboxIndex]}
          alt={`preview_${lightboxIndex}`}
          className="max-h-[72vh] sm:max-h-[78vh] w-auto max-w-full object-contain rounded-2xl shadow-2xl"
        />
      </div>

      {/* Navigation arrows (modern glass) */}
      <div className="absolute inset-y-0 left-0 right-0 z-20 flex items-center justify-between px-3 sm:px-5 pointer-events-none">
        <Button
          size="icon"
          variant="outline"
          className="pointer-events-auto h-11 w-11 rounded-2xl bg-white/10 text-white border-white/15 hover:bg-white/20 backdrop-blur-md disabled:opacity-30"
          onClick={() => setLightboxIndex((i) => Math.max(0, i - 1))}
          disabled={lightboxIndex <= 0}
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <Button
          size="icon"
          variant="outline"
          className="pointer-events-auto h-11 w-11 rounded-2xl bg-white/10 text-white border-white/15 hover:bg-white/20 backdrop-blur-md disabled:opacity-30"
          onClick={() => setLightboxIndex((i) => Math.min(lightboxImages.length - 1, i + 1))}
          disabled={lightboxIndex >= lightboxImages.length - 1}
        >
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between gap-2">
        <div className="rounded-2xl border border-white/15 bg-white/10 px-3 py-2 text-white backdrop-blur-md text-sm">
          {lightboxIndex + 1} / {lightboxImages.length}
        </div>

        {/* dots */}
        <div className="hidden sm:flex items-center gap-1.5 rounded-2xl border border-white/15 bg-white/10 px-3 py-2 backdrop-blur-md">
          {lightboxImages.slice(0, 8).map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setLightboxIndex(i)}
              className={cn(
                "h-2 w-2 rounded-full transition",
                i === lightboxIndex ? "bg-white" : "bg-white/30 hover:bg-white/60"
              )}
              aria-label={`img_${i}`}
            />
          ))}
          {lightboxImages.length > 8 && <span className="text-white/60 text-xs px-1">…</span>}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="rounded-2xl bg-white/10 text-white border-white/15 hover:bg-white/20 backdrop-blur-md"
            onClick={() => copyText(lightboxImages[lightboxIndex])}
          >
            <Copy className="h-4 w-4 me-2" />
            {isAr ? "نسخ الرابط" : "Copy URL"}
          </Button>
        </div>
      </div>
    </div>
  </DialogContent>
</Dialog>


        </div>
      </DialogContent>
    </Dialog>
  )
}


  // ---------------------------------------------
  // Page
  // ---------------------------------------------
  const hasNoCourts = filteredCourts.length === 0;

  return (
    <div className="space-y-6" dir={language === "ar" ? "rtl" : "ltr"}>
      <Card className="relative overflow-hidden rounded-[1.75rem] border-border/60 bg-card shadow-sm">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        <CardContent className="p-5 sm:p-6 relative">
          <PageHeader
            title={
              isAdmin
                ? language === "ar"
                  ? "إدارة الملاعب (Admin)"
                  : "Courts Admin"
                : t("dashboard.myCourts")
            }
            description={
              language === "ar"
                ? "لوحة إدارة حديثة — تحليلات، فلاتر سريعة، وتحكم فوري"
                : "Modern court management — analytics, fast filters, and instant control"
            }
            breadcrumbs={[
              { label: t("dashboard.title"), href: "/dashboard/manager" },
              {
                label: isAdmin
                  ? language === "ar"
                    ? "الملاعب"
                    : "Courts"
                  : t("dashboard.myCourts"),
              },
            ]}
            actions={
              <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                <Select
                  value={period}
                  onValueChange={(v) => setPeriod(v as Period)}
                >
                  <SelectTrigger className="h-11 w-full rounded-2xl border-border/60 bg-background shadow-sm sm:h-10 sm:w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">
                      {language === "ar" ? "اليوم" : "Today"}
                    </SelectItem>
                    <SelectItem value="7d">
                      {language === "ar" ? "آخر 7 أيام" : "Last 7 days"}
                    </SelectItem>
                    <SelectItem value="30d">
                      {language === "ar" ? "آخر 30 يوم" : "Last 30 days"}
                    </SelectItem>
                  </SelectContent>
                </Select>

                <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                  <Button
                    variant="outline"
                    className="h-11 min-w-0 rounded-2xl bg-transparent px-3 text-sm sm:h-10 sm:flex-none sm:px-4"
                    onClick={() => exportCSV(filteredCourts)}
                    disabled={!filteredCourts.length}
                  >
                    <Download className="h-4 w-4 me-2" />
                    <span className="truncate">
                      {language === "ar" ? "تصدير" : "Export"}
                    </span>
                  </Button>

                  <Dialog
                    open={createDialogOpen}
                    onOpenChange={(open) => {
                      setCreateDialogOpen(open);
                      if (!open) resetForm();
                    }}
                  >
                    <DialogTrigger asChild>
                      <Button
                        className="h-11 min-w-0 rounded-2xl px-3 text-sm shadow-glow sm:h-10 sm:flex-none sm:px-4"
                        disabled={!canAddMore}
                      >
                        <Plus className="h-4 w-4 me-2" />
                        <span className="truncate">
                          {t("courts.addCourt")}
                        </span>
                      </Button>
                    </DialogTrigger>

                    <DialogContent className="sm:max-w-3xl rounded-3xl p-0 max-h-[92vh] flex flex-col gap-0 overflow-hidden">
                      {/* Sticky header */}
                      <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border/40">
                        <DialogHeader className="mb-4">
                          <DialogTitle>{t("courts.addCourt")}</DialogTitle>
                          <DialogDescription>
                            {language === "ar"
                              ? "أدخل بيانات الملعب خطوة بخطوة"
                              : "Enter court details step-by-step"}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-3">
                          <WizardTop
                            title={
                              currentStep === 1
                                ? language === "ar" ? "المعلومات الأساسية" : "Basic info"
                                : currentStep === 2
                                  ? language === "ar" ? "الموقع" : "Location"
                                  : currentStep === 3
                                    ? language === "ar" ? "الأسعار" : "Pricing"
                                    : currentStep === 4
                                      ? language === "ar" ? "الصور" : "Images"
                                      : language === "ar" ? "الحالة" : "Status"
                            }
                            subtitle={
                              language === "ar" ? "إنشاء ملعب جديد" : "Create a new court"
                            }
                          />
                          <StepNav />
                        </div>
                      </div>

                      {/* Scrollable body */}
                      <div className="flex-1 overflow-y-auto px-6 py-4">
                        <div className="grid gap-6 sm:grid-cols-3">
                          <div className="sm:col-span-2 space-y-6">
                            {renderFormStep()}
                          </div>
                          {!isMobile ? (
                            <div className="hidden sm:block sm:col-span-1">
                              <PreviewPane />
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {/* Sticky footer */}
                      <DialogFooter className="shrink-0 gap-2 border-t border-border/40 px-6 py-4">
                        {currentStep > 1 && (
                          <Button
                            variant="outline"
                            className="rounded-2xl bg-transparent"
                            onClick={() => setCurrentStep((s) => s - 1)}
                          >
                            <ChevronLeft className="me-2 h-4 w-4 rtl:rotate-180" />
                            {language === "ar" ? "السابق" : "Back"}
                          </Button>
                        )}
                        <div className="flex-1" />
                        <Button
                          className={cn(
                            "rounded-2xl transition-all",
                            shakeNext && "animate-[shake_0.5s_ease-in-out]"
                          )}
                          onClick={handleCreateNextOrSave}
                        >
                          {currentStep < totalSteps ? (
                            <>
                              {language === "ar" ? "التالي" : "Next"}
                              <ChevronRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                            </>
                          ) : (
                            <>
                              <Save className="me-2 h-4 w-4" />
                              {t("common.save")}
                            </>
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            }
          />
        </CardContent>
      </Card>

      {!isAdmin && visibleCourts.length >= courtsLimit && (
        <Alert className="border-warning/50 bg-warning/5">
          <AlertCircle className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning">
            {language === "ar"
              ? `لقد وصلت إلى حد الملاعب (${courtsLimit}) في خطتك. يمكنك الترقية للحصول على المزيد.`
              : `You have reached the court limit (${courtsLimit}) in your plan. Upgrade to add more.`}
          </AlertDescription>
        </Alert>
      )}

      {/* KPI row */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <AnimatedContainer animation="fade-up" delay={40}>
          <KpiCard
            title={language === "ar" ? "الملاعب" : "Courts"}
            value={totals.courts}
            className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent"
          />
        </AnimatedContainer>

        <AnimatedContainer animation="fade-up" delay={70}>
          <KpiCard
            title={language === "ar" ? "نشط" : "Active"}
            value={totals.active}
            className="bg-gradient-to-br from-success/10 via-success/5 to-transparent"
          />
        </AnimatedContainer>

        <AnimatedContainer animation="fade-up" delay={100}>
          <KpiCard
            title={language === "ar" ? "صيانة" : "Maintenance"}
            value={totals.maintenance}
            className="bg-gradient-to-br from-warning/10 via-warning/5 to-transparent"
          />
        </AnimatedContainer>

        <AnimatedContainer animation="fade-up" delay={130}>
          <KpiCard
            title={language === "ar" ? "الحجوزات" : "Bookings"}
            value={totals.bookings}
            className="bg-gradient-to-br from-muted/40 to-transparent"
          />
        </AnimatedContainer>

      </div>

      {/* Unified Filters and Courts Card */}
      <Card className="border-border/50 overflow-hidden flex flex-col">
        {/* Filters Area */}
        <div className="p-4 sm:p-5 border-b border-border/40 bg-background/50">
          <div className="flex flex-col gap-4">
            {/* Top row: Search & Main Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1 min-w-0">
                <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t("common.search")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-11 rounded-2xl ps-10 bg-background"
                />
              </div>

              <div className="flex gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="h-11 rounded-2xl flex-1 sm:w-[140px] bg-background">
                    <Filter className="me-2 h-4 w-4 opacity-70" />
                    <SelectValue placeholder={language === "ar" ? "الحالة" : "Status"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{language === "ar" ? "الكل" : "All"}</SelectItem>
                    <SelectItem value="active">{language === "ar" ? "نشط" : "Active"}</SelectItem>
                    <SelectItem value="inactive">{language === "ar" ? "غير نشط" : "Inactive"}</SelectItem>
                    <SelectItem value="maintenance">{language === "ar" ? "صيانة" : "Maintenance"}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                  <SelectTrigger className="h-11 rounded-2xl flex-1 sm:w-[160px] bg-background">
                    <SelectValue placeholder={language === "ar" ? "ترتيب" : "Sort"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bookings_desc">{language === "ar" ? "الحجوزات الأعلى" : "Bookings (high)"}</SelectItem>
                    <SelectItem value="rating_desc">{language === "ar" ? "الأعلى تقييماً" : "Rating (high)"}</SelectItem>
                    <SelectItem value="occupancy_desc">{language === "ar" ? "الأعلى استخداماً" : "Usage (high)"}</SelectItem>
                    <SelectItem value="name_asc">{language === "ar" ? "الاسم (أ-ي)" : "Name (A-Z)"}</SelectItem>
                    <SelectItem value="name_desc">{language === "ar" ? "الاسم (ي-أ)" : "Name (Z-A)"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Bottom row: Actions & Stats */}
            <div className="flex items-center justify-between gap-3 overflow-x-auto pb-1 -mb-1 scrollbar-hide">
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-xl bg-transparent shrink-0"
                  onClick={() => setAdvancedFiltersOpen(true)}
                  title={language === "ar" ? "فلاتر إضافية" : "Advanced filters"}
                >
                  <Filter className="h-4 w-4" />
                </Button>

                <div className="w-[1px] h-6 bg-border/60 mx-1" />

                <Button
                  variant="outline"
                  size="icon"
                  className={cn("h-10 w-10 rounded-xl bg-transparent shrink-0", viewMode === "list" && "bg-primary/10 border-primary text-primary")}
                  onClick={() => setViewMode("list")}
                  title={language === "ar" ? "قائمة" : "List"}
                >
                  <List className="h-4 w-4" />
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  className={cn("h-10 w-10 rounded-xl bg-transparent shrink-0", viewMode === "grid" && "bg-primary/10 border-primary text-primary")}
                  onClick={() => setViewMode("grid")}
                  title={language === "ar" ? "شبكة" : "Grid"}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>

                <div className="w-[1px] h-6 bg-border/60 mx-1" />

                <Button
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 rounded-xl bg-transparent shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    setSearchQuery("");
                    setFilterStatus("all");
                    setFilterCityEn("all");
                    toast.success(language === "ar" ? "تمت إعادة الضبط" : "Reset");
                  }}
                  title={language === "ar" ? "إعادة" : "Reset"}
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </div>

              <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                <span className="font-semibold text-foreground px-1 py-0.5 rounded-md bg-muted/50 me-1">
                  {filteredCourts.length}
                </span>
                {language === "ar" ? "نتائج" : "Results"}
              </div>
            </div>
          </div>
        </div>

        {/* Courts Area */}
        <div className="p-4 sm:p-5 bg-muted/5">
          {hasNoCourts ? (
            <EmptyState
              icon={Building2}
              title={language === "ar" ? "لا توجد ملاعب" : "No courts found"}
              description={
                language === "ar"
                  ? "جرّب تغيير الفلاتر أو أضف ملعب جديد"
                  : "Try adjusting filters or add a new court"
              }
              action={
                canAddMore
                  ? {
                      label: t("courts.addCourt"),
                      onClick: () => setCreateDialogOpen(true),
                    }
                  : undefined
              }
            />
          ) : (
            <div className="space-y-6">
              <AnimatePresence mode="popLayout">
              {viewMode === "grid" ? (
                <motion.div
                  key="grid"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                >
                  {isMobile ? (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-1">
                        <p className="text-sm font-medium text-muted-foreground">
                          {language === "ar" ? "اسحب للتنقل بين الملاعب" : "Swipe through courts"}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full bg-transparent border-border/50 hover:bg-muted"
                            onClick={() => scrollSlider(language === "ar" ? "next" : "prev")}
                          >
                            {language === "ar" ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full bg-transparent border-border/50 hover:bg-muted"
                            onClick={() => scrollSlider(language === "ar" ? "prev" : "next")}
                          >
                            {language === "ar" ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      <div
                        ref={sliderRef}
                        className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory scroll-smooth [-webkit-overflow-scrolling:touch]"
                      >
                        {pagedCourts.map((court, index) => (
                          <div
                            key={`slider-${court.id}`}
                            className="snap-center shrink-0 w-[88vw] max-w-[400px]"
                          >
                            <CourtCard court={court} imagePriority={index === 0} />
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-center gap-1.5 pb-2">
                        {pagedCourts.map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "h-1.5 rounded-full transition-all",
                              i === sliderIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30",
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                      {pagedCourts.map((court, index) => (
                        <CourtCard key={`grid-${court.id}`} court={court} imagePriority={index === 0} />
                      ))}
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                  animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
                  exit={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.2 }}
                  className="space-y-3"
                >
                  {pagedCourts.map((court) => {
                    const s = courtStatsMap[court.id];
                    return (
                      <button
                        key={`list-${court.id}`}
                        type="button"
                        className={cn(
                          "w-full text-left group flex items-center justify-between p-3 sm:p-4 rounded-2xl",
                          "border border-border/50 bg-background/70 hover:bg-muted/30 transition-all hover:shadow-sm",
                        )}
                        onClick={() => openView(court)}
                      >
                        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                          <div className="relative h-12 w-20 sm:h-14 sm:w-24 rounded-xl overflow-hidden border border-border/50 bg-muted shrink-0">
                            <NextImage
                              src={getCourtCover(court)}
                              alt="cover"
                              fill
                              className="object-cover"
                            />
                          </div>

                          <div className="min-w-0">
                            <p className="font-semibold text-sm sm:text-base truncate">
                              {language === "ar" ? (court as any).name : (court as any).nameEn}
                            </p>
                            <p className="text-[11px] sm:text-xs text-muted-foreground truncate mt-0.5">
                              {language === "ar" ? (court as any).city : (court as any).cityEn} •{" "}
                              {language === "ar"
                                ? (sportTypes as any)[(court as any).sportType]?.ar
                                : (sportTypes as any)[(court as any).sportType]?.en}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                          <Badge
                            variant="outline"
                            className="rounded-xl bg-muted/30 border-border/50 hidden lg:inline-flex"
                          >
                            {language === "ar" ? "حجوزات" : "Bookings"}: {s?.bookings || 0}
                          </Badge>
                          <StatusBadge
                            variant={statusVariant((court as any).status)}
                            dot
                            pulse={(court as any).status === "active"}
                          >
                            {statusLabel((court as any).status, language)}
                          </StatusBadge>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pt-2">
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                rtl={language === "ar"}
              />
            </div>
          </div>
          )}
        </div>
      </Card>

      {/* Edit dialog */}
      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setCurrentStep(1);
            setSelectedCourt(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-3xl rounded-3xl p-0 max-h-[92vh] flex flex-col gap-0 overflow-hidden">
          {/* Sticky header */}
          <div className="shrink-0 px-6 pt-6 pb-4 border-b border-border/40">
            <DialogHeader className="mb-4">
              <DialogTitle>
                {language === "ar" ? "تعديل الملعب" : "Edit Court"}
              </DialogTitle>
              <DialogDescription>
                {language === "ar"
                  ? "قم بتعديل بيانات الملعب"
                  : "Update court information"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <WizardTop
                title={
                  currentStep === 1
                    ? language === "ar" ? "المعلومات الأساسية" : "Basic info"
                    : currentStep === 2
                      ? language === "ar" ? "الموقع" : "Location"
                      : currentStep === 3
                        ? language === "ar" ? "الأسعار" : "Pricing"
                        : currentStep === 4
                          ? language === "ar" ? "الصور" : "Images"
                          : language === "ar" ? "الحالة" : "Status"
                }
                subtitle={
                  language === "ar" ? "تعديل بيانات الملعب" : "Edit court details"
                }
              />
              <StepNav />
            </div>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="grid gap-6 sm:grid-cols-3">
              <div className="sm:col-span-2 space-y-6">{renderFormStep()}</div>
              {!isMobile ? (
                <div className="hidden sm:block sm:col-span-1">
                  <PreviewPane />
                </div>
              ) : null}
            </div>
          </div>

          {/* Sticky footer */}
          <DialogFooter className="shrink-0 gap-2 border-t border-border/40 px-6 py-4">
            {currentStep > 1 && (
              <Button
                variant="outline"
                className="rounded-2xl bg-transparent"
                onClick={() => setCurrentStep((s) => s - 1)}
              >
                <ChevronLeft className="me-2 h-4 w-4 rtl:rotate-180" />
                {language === "ar" ? "السابق" : "Back"}
              </Button>
            )}
            <div className="flex-1" />
            <Button
              className={cn(
                "rounded-2xl transition-all",
                shakeNext && "animate-[shake_0.5s_ease-in-out]"
              )}
              onClick={handleEditNextOrSave}
            >
              {currentStep < totalSteps ? (
                <>
                  {language === "ar" ? "التالي" : "Next"}
                  <ChevronRight className="ms-2 h-4 w-4 rtl:rotate-180" />
                </>
              ) : (
                <>
                  <Save className="me-2 h-4 w-4" />
                  {t("common.save")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-[28px] border-border/60 p-0 overflow-hidden sm:max-w-lg">
          <div className="border-b border-border/50 bg-gradient-to-br from-destructive/10 via-background to-background px-6 py-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                <Trash2 className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <DialogTitle className="text-xl">
                  {language === "ar" ? "تأكيد حذف الملعب" : "Delete court"}
                </DialogTitle>
                <DialogDescription className="text-sm leading-6">
                  {language === "ar"
                    ? "سيتم حذف هذا الملعب من لوحة الإدارة، ولا يمكن التراجع عن هذا الإجراء لاحقاً."
                    : "This will permanently remove the court from the manager dashboard and cannot be undone later."}
                </DialogDescription>
              </div>
            </div>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="rounded-3xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {language === "ar" ? "الملعب المحدد" : "Selected court"}
              </p>
              <div className="mt-3 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-base font-semibold">
                    {language === "ar"
                      ? selectedCourt?.name || "-"
                      : selectedCourt?.nameEn || selectedCourt?.name || "-"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {language === "ar"
                      ? selectedCourt?.city || selectedCourt?.cityEn || ""
                      : selectedCourt?.cityEn || selectedCourt?.city || ""}
                  </p>
                </div>
                {selectedCourt ? (
                  <StatusBadge variant={statusVariant(selectedCourt.status)} dot>
                    {statusLabel(selectedCourt.status, language)}
                  </StatusBadge>
                ) : null}
              </div>
            </div>

            <Alert className="rounded-2xl border-destructive/20 bg-destructive/5 text-left">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-sm leading-6">
                {language === "ar"
                  ? "إذا كنت لا تريد حذف الملعب بالكامل، استخدم حالة الصيانة أو إدارة الإغلاقات بدلاً من ذلك."
                  : "If you only want to block future play, use maintenance status or court closures instead of deleting the court."}
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter className="border-t border-border/50 bg-muted/10 px-6 py-4 gap-2">
            <Button
              variant="outline"
              className="rounded-2xl bg-transparent"
              onClick={() => setDeleteDialogOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              className="rounded-2xl"
              onClick={handleDeleteCourt}
            >
              <Trash2 className="me-2 h-4 w-4" />
              {language === "ar" ? "نعم، احذف الملعب" : "Yes, delete court"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={closuresDialogOpen}
        onOpenChange={(open) => {
          setClosuresDialogOpen(open);
          if (!open) setClosureCourt(null);
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-hidden rounded-[32px] p-0 sm:max-w-5xl">
          <div className="border-b border-border/50 bg-gradient-to-br from-primary/10 via-background to-background px-6 py-5">
            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-xl">
                {language === "ar" ? "إدارة إغلاقات الملعب" : "Manage court closures"}
              </DialogTitle>
              <DialogDescription className="leading-6">
                {closureCourt
                  ? language === "ar"
                    ? `يمكنك إغلاق ${closureCourt.name} لفترات محددة بدون فتح صفحة التفاصيل.`
                    : `Manage scheduled closures for ${closureCourt.nameEn || closureCourt.name} without opening the court details view.`
                  : language === "ar"
                    ? "اختر ملعباً لإدارة الإغلاقات"
                    : "Choose a court to manage closures."}
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="max-h-[calc(92vh-110px)] overflow-y-auto p-6">
            <CourtClosuresManager court={closureCourt} language={language} showAllByDefault />
          </div>
        </DialogContent>
      </Dialog>

      {/* View dialog (enhanced) */}
      <CourtViewDialog />
    </div>
  );
}
