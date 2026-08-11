"use client"

import type React from "react"

import Link from "next/link"
import Image from "next/image"
import { useEffect, useMemo, useRef, useState, useCallback, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Search,
  MapPin,
  Star,
  Heart,
  Clock,
  Users,
  ChevronLeft,
  ChevronRight,
  X,
  Calendar,
  SlidersHorizontal,
  ArrowUpDown,
  Zap,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Wifi,
  Car,
  Coffee,
  Shield,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Calendar as CalendarPicker } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { sportTypes, cities } from "@/lib/constants"
import { listPublicCourts, getPublicCourtAvailability, createBooking, getFavorites, toggleFavorite as toggleFavoriteApi } from "@/lib/api"
import type { Court } from "@/lib/types"
import { timeToMinutes, minutesToTime, format12h, formatOperatingHours, checkNextDay, isPeakHour } from "@/lib/time"
import { getBookableStartDateForCourt, getBookingDateForCourtSlot, getCalendarDayDiffFromEgyptToday, getEgyptDateSequence } from "@/lib/date"
import { AnimatedContainer } from "@/components/ui/animated-container"
import { EmptyState } from "@/components/ui/empty-state"
import { BOOKING_NOTE_MAX_LENGTH, toBookingNotePayload } from "@/lib/booking-notes"
import { cn } from "@/lib/utils"

type SortKey = "recommended" | "price_low" | "price_high" | "bookings_high" | "newest"

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

const PRICE_RANGE_MIN = 0
const PRICE_RANGE_MAX = 500

/* --------------------------------- helpers --------------------------------- */
function translateUnavailableReason(reason: string | null | undefined, language: string) {
  if (!reason) return ""
  if (reason === "Already booked") return language === "ar" ? "هذا الموعد محجوز بالفعل" : "This slot is already booked"
  if (reason === "This time has already started or passed") return language === "ar" ? "هذا الموعد بدأ بالفعل أو انتهى" : "This time has already started or passed"
  return reason
}

function formatDateLabel(dateISO: string, language: string) {
  const diffDays = getCalendarDayDiffFromEgyptToday(dateISO)

  if (diffDays === 0) return language === "ar" ? "اليوم" : "Today"
  if (diffDays === 1) return language === "ar" ? "غداً" : "Tomorrow"

  try {
    const [year, month, day] = dateISO.split("-").map(Number)
    const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1, 12, 0, 0))
    return new Intl.DateTimeFormat(language === "ar" ? "ar-EG" : "en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "Africa/Cairo",
    }).format(date)
  } catch {
    return dateISO
  }
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(id)
  }, [value, delayMs])
  return debounced
}

function todayISO() {
  // ✅ FIX: Force Cairo time to prevent midnight/timezone shifting bugs
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

/* ------------------------------ UI components ------------------------------ */

function StatPill({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: any }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border/60 bg-background/70 px-3 py-2">
      {Icon && (
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div>
        <div className="text-base font-extrabold leading-none">{value}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{label}</div>
      </div>
    </div>
  )
}

function CourtCard({
  court,
  language,
  t,
  isFav,
  onToggleFav,
  onBook,
  availableToday,
  imagePriority = false,
}: {
  court: Court
  language: string
  t: (k: string) => string
  isFav: boolean
  onToggleFav: () => void
  onBook: () => void
  availableToday: boolean
  imagePriority?: boolean
}) {
  const title = language === "ar" ? court.name : court.nameEn
  const cityName = language === "ar" ? court.city : court.cityEn
  const sportLabel = language === "ar" ? (sportTypes[court.sportType]?.ar || court.sportType) : (sportTypes[court.sportType]?.en || court.sportType)
  const img = court.images?.[0] || "/placeholder.svg?height=300&width=420&query=sports court premium"
  const offPeakPrice = court.offPeakPrice ?? 0
  const peakPrice = court.peakPrice ?? offPeakPrice
  const minPrice = Math.min(offPeakPrice, peakPrice)
  const maxPrice = Math.max(offPeakPrice, peakPrice)

  const amenities = (((court as any).amenities ?? []) as string[]).slice(0, 3)
  const showPeakRange = maxPrice > minPrice

  return (
    <Card className="group relative overflow-hidden border-2 border-border/50 bg-card/50 backdrop-blur-sm hover:border-primary/30 hover:shadow-xl transition-all duration-300 hover-lift">
      <button
        type="button"
        aria-label={language === "ar" ? "إضافة للمفضلة" : "Add to favorites"}
        onClick={onToggleFav}
        className={cn(
          "absolute top-3 end-3 z-20 flex h-10 w-10 items-center justify-center rounded-full backdrop-blur-md transition-all duration-200 hover:scale-110",
          isFav ? "bg-red-500 text-white" : "bg-black/30 text-white hover:bg-black/50",
        )}
      >
        <Heart className={cn("h-5 w-5", isFav && "fill-current")} />
      </button>

      <Link href={`/dashboard/player/browse/${court.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        <div className="relative aspect-[5/4] overflow-hidden">
          <Image
            src={img}
            alt={title}
            fill
            loading={imagePriority ? "eager" : "lazy"}
            fetchPriority={imagePriority ? "high" : undefined}
            className="object-cover transition-transform duration-700 group-hover:scale-110"
            sizes="(max-width: 768px) 85vw, (max-width: 1200px) 50vw, 33vw"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-tr from-primary/20 via-transparent to-transparent" />

          <div className="absolute top-3 start-3 flex flex-wrap items-center gap-2 pe-14">
            <Badge className="bg-primary/90 text-primary-foreground border-0 shadow-sm">{sportLabel}</Badge>
            
            {/* FOMO Badges */}

            



          </div>

          <div className="absolute bottom-3 start-3 end-3 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-white font-extrabold text-lg truncate drop-shadow">{title}</p>
              <p className="text-white/80 text-sm flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                <span className="truncate">{cityName}</span>
              </p>
            </div>
          </div>
        </div>

        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4 text-primary/60 shrink-0" />
            <span className="font-medium" dir="ltr">
              {formatOperatingHours(court.openTime || "09:00", court.closeTime || "21:00", language as "ar" | "en")}
            </span>
          </div>

          {amenities.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {amenities.map((a) => (
                <span key={a} className="text-[11px] font-medium text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-md">
                  {a}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Link>

      <CardContent className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0">
        <div className="flex items-center justify-between pt-4 border-t border-border/40">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold tracking-tight text-foreground">{minPrice}</span>
              <span className="text-sm font-semibold text-muted-foreground">{t("common.egp")}</span>
            </div>
            {showPeakRange ? (
              <span className="text-[11px] font-medium text-muted-foreground mt-0.5">
                {language === "ar" ? `حتى ${maxPrice} ${t("common.egp")} / ساعة` : `Up to ${maxPrice} ${t("common.egp")} / hr`}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-muted-foreground mt-0.5">
                {language === "ar" ? "لكل ساعة" : "/ hour"}
              </span>
            )}
          </div>

          <Button size="sm" className="rounded-xl font-semibold px-5 shadow-none hover:bg-primary/90" onClick={onBook}>
            {language === "ar" ? "احجز" : "Book"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function CourtCardSkeleton() {
  return (
    <Card className="overflow-hidden border-2 border-border/50 bg-card/50 backdrop-blur-sm">
      <div className="relative aspect-[5/4] overflow-hidden">
        <Skeleton className="h-full w-full rounded-none" />
        <div className="absolute top-3 start-3 flex items-center gap-2">
          <Skeleton className="h-6 w-20 rounded-full bg-background/70" />
          <Skeleton className="h-6 w-24 rounded-full bg-background/60" />
        </div>
      </div>

      <CardContent className="space-y-4 p-5">
        <div className="space-y-2">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>

        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </CardContent>

      <CardContent className="px-5 pb-5 pt-0">
        <div className="flex items-center justify-between border-t border-border/50 pt-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-14" />
          </div>
          <Skeleton className="h-10 w-24 rounded-xl" />
        </div>
      </CardContent>
    </Card>
  )
}

function MobileCourtsCarousel({
  courts,
  renderCard,
}: {
  courts: Court[]
  renderCard: (court: Court, index: number) => React.ReactNode
}) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ left: 0 })
    } else {
      el.scrollLeft = 0
    }
  }, [courts])

  if (courts.length === 0) return null

  return (
    <div className="relative md:hidden">
      <div
        ref={scrollerRef}
        className="flex gap-4 overflow-x-auto overflow-y-hidden items-stretch pb-4 pt-4 px-4 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {courts.map((c, i) => (
          <div key={c.id} className="snap-start shrink-0 w-[94%]">
            {renderCard(c, i)}
          </div>
        ))}
      </div>

      {/* Buttons removed. On mobile, swiping is the standard, clean interaction pattern. */}
    </div>
  )
}

/* ---------------------------------- Page ---------------------------------- */

export function BrowseCourtsPage() {
  const { language, t } = useLanguage()
  const { user, refreshUser } = useAuth()
  const router = useRouter()

  // favorites
  const [favorites, setFavorites] = useState<string[]>([])

  // filters
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedQuery = useDebouncedValue(searchQuery, 180)
  const [selectedCity, setSelectedCity] = useState<string>("all")
  const [selectedSport, setSelectedSport] = useState<string>("all")
  const [sortBy, setSortBy] = useState<SortKey>("recommended")

  // advanced filters (dialog)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_RANGE_MIN, PRICE_RANGE_MAX])
  const [amenities, setAmenities] = useState<string[]>([])
  const [onlyAvailable, setOnlyAvailable] = useState(false)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const favoriteCourtIdsParam = useMemo(() => {
    if (!favoritesOnly || favorites.length === 0) return ""
    return Array.from(new Set(favorites)).sort().join(",")
  }, [favoritesOnly, favorites])

  // pagination
  const [page, setPage] = useState(1)

  // booking dialog
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null)
  const [courtsState, setCourtsState] = useState<Court[]>([])
  const [courtsLoading, setCourtsLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState("")
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [selectedTime, setSelectedTime] = useState("")
  const [selectionResetNotice, setSelectionResetNotice] = useState("")
  const [bookingNote, setBookingNote] = useState("")
  const [durationHours, setDurationHours] = useState<1 | 2 | 3>(1)
  const [timeFilter, setTimeFilter] = useState<"all" | "morning" | "afternoon" | "evening">("all")
  const bookingScrollRef = useRef<HTMLDivElement | null>(null)
  const bookingOpenedAtRef = useRef(0)

  const amenityOptions = useMemo(
    () => [
      { id: "wifi", label: language === "ar" ? "واي فاي" : "WiFi", icon: Wifi },
      { id: "parking", label: language === "ar" ? "موقف سيارات" : "Parking", icon: Car },
      { id: "cafe", label: language === "ar" ? "كافتيريا" : "Cafeteria", icon: Coffee },
      { id: "lockers", label: language === "ar" ? "خزائن" : "Lockers", icon: Shield },
    ],
    [language],
  )

  /* ----------------------------- real favorites ----------------------------- */
  useEffect(() => {
    if (!user) return
    let cancelled = false
    const loadFavs = async () => {
      try {
        const res = await getFavorites()
        if (!cancelled && res.items) {
          setFavorites(res.items.map((c: any) => c.id))
        }
      } catch (e) {
        console.error("Failed to load favorites", e)
      }
    }
    loadFavs()
    return () => { cancelled = true }
  }, [user])

  /* ---------------------------- handlers ---------------------------- */
  const toggleFavorite = async (courtId: string) => {
    if (!user) {
      toast.error(language === "ar" ? "يجب تسجيل الدخول أولاً" : "You must log in first")
      return
    }

    // Optimistic UI update
    setFavorites((prev) => {
      return prev.includes(courtId) ? prev.filter((id) => id !== courtId) : [...prev, courtId]
    })

    try {
      const res = await toggleFavoriteApi(courtId)
      toast.success(
        res.favorited
          ? language === "ar" ? "تمت إضافة الملعب للمفضلة" : "Added to favorites"
          : language === "ar" ? "تم إزالة الملعب من المفضلة" : "Removed from favorites",
      )
    } catch (e: any) {
      // Revert optimistic update on failure
      setFavorites((prev) => {
        return prev.includes(courtId) ? prev.filter((id) => id !== courtId) : [...prev, courtId]
      })
      toast.error(e?.message || (language === "ar" ? "حدث خطأ" : "An error occurred"))
    }
  }

  const handleBookCourt = (court: Court) => {
    setSelectedCourt(court)
    setSelectedDate(getBookableStartDateForCourt(court))
    setSelectedTime("")
    setSelectionResetNotice("")
    setBookingDialogOpen(true)
  }


  const [serverTotalResults, setServerTotalResults] = useState(0)

  useEffect(() => {
    setPage(1)
  }, [
    debouncedQuery,
    selectedCity,
    selectedSport,
    sortBy,
    priceRange,
    amenities,
    onlyAvailable,
    favoritesOnly,
    favoriteCourtIdsParam,
    language,
  ])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      if (favoritesOnly && !favoriteCourtIdsParam) {
        if (!cancelled) {
          setCourtsState([])
          setServerTotalResults(0)
          setCourtsLoading(false)
        }
        return
      }

      if (!cancelled) {
        setCourtsLoading(true)
      }

      try {
        let sortField: string | undefined
        let sortOrder: "asc" | "desc" = "asc"
        
        if (sortBy === "price_low") {
          sortField = "offPeakPrice"
          sortOrder = "asc"
        } else if (sortBy === "price_high") {
          sortField = "offPeakPrice"
          sortOrder = "desc"
        } else if (sortBy === "bookings_high") {
          sortField = "totalBookings"
          sortOrder = "desc"
        } else if (sortBy === "newest") {
          sortField = "createdAt"
          sortOrder = "desc"
        }

        const params: any = {
          page: 1,
          limit: 100,
          date: todayISO(),
        }

        if (sortField) {
          params.sortBy = sortField
          params.sortOrder = sortOrder
        }

        if (priceRange[0] > PRICE_RANGE_MIN) params.minPrice = priceRange[0]
        if (priceRange[1] < PRICE_RANGE_MAX) params.maxPrice = priceRange[1]

        if (debouncedQuery) params.q = debouncedQuery
        if (selectedCity !== "all") params.city = selectedCity
        if (selectedSport !== "all") params.sportType = selectedSport
        if (onlyAvailable) params.onlyAvailable = true
        if (amenities.length > 0) params.amenities = amenities.join(",")
        
        if (favoritesOnly) {
          params.courtIds = favoriteCourtIdsParam
        }

        const res = await listPublicCourts(params)

        if (!cancelled) {
          setCourtsState(Array.isArray(res.items) ? (res.items as Court[]) : [])
          setServerTotalResults((res as any).pagination?.total || 0)
        }
      } catch (error) {
        console.error(error)
        if (!cancelled) {
          setCourtsState([])
          toast.error(language === "ar" ? "تعذر تحميل الملاعب" : "Failed to load courts")
        }
      } finally {
        if (!cancelled) {
          setCourtsLoading(false)
        }
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [
    debouncedQuery,
    selectedCity,
    selectedSport,
    sortBy,
    priceRange,
    amenities,
    onlyAvailable,
    favoritesOnly,
    favoriteCourtIdsParam,
    language
  ])

  const selectedCourtBookableStartDate = getBookableStartDateForCourt(selectedCourt)

  useEffect(() => {
    if (bookingDialogOpen && (!selectedDate || selectedDate < selectedCourtBookableStartDate)) {
      setSelectedDate(selectedCourtBookableStartDate)
      setSelectedTime("")
    }
  }, [bookingDialogOpen, selectedDate, selectedCourtBookableStartDate])

  /* ---------------------------- derived collections --------------------------- */
  const activeCourts = useMemo(() => courtsState, [courtsState])
  const totalCourts = serverTotalResults

  const filteredCourts = activeCourts

  /* ------------------------------- pagination -------------------------------- */
  const pageSize = 6
  // Implement client-side pagination because the API currently returns up to 100 results per page
  const totalPages = Math.max(1, Math.ceil(activeCourts.length / pageSize))
  const currentPage = clamp(page, 1, totalPages)
  const pageSlice = useMemo(
    () => activeCourts.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [activeCourts, currentPage, pageSize],
  )
  const courtsLoadingLabel = language === "ar" ? "\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0645\u0644\u0627\u0639\u0628..." : "Loading courts..."

  const pageRange = useMemo(() => {
    const maxButtons = 5
    if (totalPages <= maxButtons) return Array.from({ length: totalPages }, (_, i) => i + 1)

    const half = Math.floor(maxButtons / 2)
    const start = Math.max(1, currentPage - half)
    const end = Math.min(totalPages, start + maxButtons - 1)
    return Array.from({ length: end - start + 1 }, (_, i) => start + i)
  }, [totalPages, currentPage])

  /* ----------------------------- filter chips ----------------------------- */
  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; onRemove: () => void }> = []
    const q = debouncedQuery.trim()
    if (q) chips.push({ key: "q", label: `${language === "ar" ? "بحث" : "Search"}: ${q}`, onRemove: () => setSearchQuery("") })

    if (selectedCity !== "all") {
      const city = cities.find((c) => c.en === selectedCity)
      chips.push({
        key: "city",
        label: language === "ar" ? `المدينة: ${city?.ar ?? selectedCity}` : `City: ${selectedCity}`,
        onRemove: () => setSelectedCity("all"),
      })
    }

    if (selectedSport !== "all") {
      const s = sportTypes[selectedSport as keyof typeof sportTypes]
      chips.push({
        key: "sport",
        label: language === "ar" ? `الرياضة: ${s?.ar ?? selectedSport}` : `Sport: ${s?.en ?? selectedSport}`,
        onRemove: () => setSelectedSport("all"),
      })
    }

    if (priceRange[0] !== PRICE_RANGE_MIN || priceRange[1] !== PRICE_RANGE_MAX) {
      chips.push({
        key: "price",
        label: language === "ar" ? `السعر: ${priceRange[0]}-${priceRange[1]} ج.م` : `Price: ${priceRange[0]}-${priceRange[1]} EGP`,
        onRemove: () => setPriceRange([PRICE_RANGE_MIN, PRICE_RANGE_MAX]),
      })
    }

    if (onlyAvailable) chips.push({ key: "avail", label: language === "ar" ? "متاح اليوم" : "Available today", onRemove: () => setOnlyAvailable(false) })
    if (favoritesOnly) chips.push({ key: "favonly", label: language === "ar" ? "المفضلة فقط" : "Favorites only", onRemove: () => setFavoritesOnly(false) })

    if (amenities.length) {
      for (const a of amenities) {
        const opt = amenityOptions.find((x) => x.id === a)
        chips.push({
          key: `amenity_${a}`,
          label: opt?.label ?? a,
          onRemove: () => setAmenities((prev) => prev.filter((x) => x !== a)),
        })
      }
    }

    return chips
  }, [debouncedQuery, selectedCity, selectedSport, priceRange, onlyAvailable, favoritesOnly, amenities, amenityOptions, language])

  const clearAll = () => {
    setSearchQuery("")
    setSelectedCity("all")
    setSelectedSport("all")
    setSortBy("recommended")
    setPriceRange([PRICE_RANGE_MIN, PRICE_RANGE_MAX])
    setAmenities([])
    setOnlyAvailable(false)
    setFavoritesOnly(false)
  }

 

  const selectedEndTime = useMemo(() => {
    if (!selectedTime) return ""
    const start = timeToMinutes(selectedTime)
    const end = start + durationHours * 60
    return minutesToTime(end)
  }, [selectedTime, durationHours])

  const durationFitsCourtHours = useMemo(() => {
    if (!selectedCourt || !selectedTime) return true
    const openM = timeToMinutes(selectedCourt.openTime ?? "08:00")
    let closeM = timeToMinutes(selectedCourt.closeTime ?? "23:00")
    if (closeM < openM || closeM === openM) closeM += 1440

    let startM = timeToMinutes(selectedTime)
    // If selectedTime is "before" openM numerically but within the overnight window, shift it
    if (startM < openM && (startM + 1440) <= closeM) {
      startM += 1440
    }
    
    const endM = startM + durationHours * 60
    return endM <= closeM
  }, [selectedCourt, selectedTime, durationHours])

  const computeTotalPrice = (court: Court, startTime: string, durationH: number) => {
    const off = court.offPeakPrice ?? 0
    const peak = court.peakPrice ?? off
    const startM = timeToMinutes(startTime)
    let total = 0
    for (let i = 0; i < durationH; i++) {
      const t24 = minutesToTime(startM + i * 60)
      total += isPeakHour(t24, court.peakStartTime, court.peakEndTime) ? peak : off
    }
    return total
  }

  const totalPrice = useMemo(() => {
    if (!selectedCourt || !selectedTime) return 0
    return computeTotalPrice(selectedCourt, selectedTime, durationHours)
  }, [selectedCourt, selectedTime, durationHours])

  const priceBreakdown = useMemo(() => {
    if (!selectedCourt || !selectedTime) return []
    const off = selectedCourt.offPeakPrice ?? 0
    const peak = selectedCourt.peakPrice ?? off
    const startM = timeToMinutes(selectedTime)
    return Array.from({ length: durationHours }).map((_, i) => {
      const t24 = minutesToTime(startM + i * 60)
      const t12 = format12h(t24, language as "ar" | "en")
      const isPeak = isPeakHour(t24, selectedCourt.peakStartTime, selectedCourt.peakEndTime)
      return { time: t24, timeLabel: t12, isPeak, amount: isPeak ? peak : off }
    })
  }, [selectedCourt, selectedTime, durationHours, language])

  // ---- Real availability from backend ----
  const [apiSlots, setApiSlots] = useState<{date?: string, start: string, end: string, available: boolean, closureReason?: string | null, unavailableReason?: string | null}[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [, startTimeTransition] = useTransition()

  useEffect(() => {
    if (!selectedCourt || !selectedDate) {
      setApiSlots([])
      return
    }
    let cancelled = false
    setLoadingSlots(true)
    getPublicCourtAvailability(selectedCourt.id, { date: selectedDate, slotMinutes: durationHours * 60 })
      .then((res: any) => {
        if (!cancelled) setApiSlots(res.slots || [])
      })
      .catch(() => {
        if (!cancelled) setApiSlots([])
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false)
      })
    return () => { cancelled = true }
  }, [selectedCourt, selectedDate, durationHours])

  const selectionAvailability = useMemo(() => {
    if (!selectedCourt || !selectedDate || !selectedTime) return { ok: false, message: "" }
    const slot = apiSlots.find((s) => s.start === selectedTime)
    if (slot?.available) {
      return { ok: true, message: language === "ar" ? "الموعد متاح ✅ سيتم تأكيد الحجز مع كود دخول" : "Slot available ✅ Booking will be confirmed with an entry code" }
    }
    const reason = translateUnavailableReason(slot?.unavailableReason || slot?.closureReason, language)
    return { ok: false, message: reason || (language === "ar" ? "هذا الموعد غير متاح" : "This slot is not available") }
  }, [selectedCourt, selectedDate, selectedTime, apiSlots, language])



  const filteredTimeSlots = useMemo(() => {
    if (!selectedDate) return []
    return apiSlots.filter((slot) => {
      const hh = Number.parseInt(slot.start, 10)
      const bucket = hh < 12 ? "morning" : hh < 16 ? "afternoon" : "evening"
      if (timeFilter === "all") return true
      return bucket === timeFilter
    })
  }, [apiSlots, timeFilter, selectedDate])

  // keep selected time valid when date/duration changes
  useEffect(() => {
    if (!selectedCourt || !selectedDate || !selectedTime) return
    const slot = apiSlots.find((s) => s.start === selectedTime)
    if (!slot?.available) {
      const timeLabel = format12h(selectedTime, language as "ar" | "en")
      const reason = translateUnavailableReason(slot?.unavailableReason || slot?.closureReason, language)
      const message = language === "ar"
        ? `\u062A\u0645\u062A \u0625\u0632\u0627\u0644\u0629 \u0645\u0648\u0639\u062F ${timeLabel} \u0644\u0623\u0646\u0647 \u0644\u0645 \u064A\u0639\u062F \u0645\u062A\u0627\u062D\u0627\u064B \u0644\u0644\u0645\u062F\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629${reason ? `: ${reason}` : "."}`
        : `${timeLabel} was cleared because it is no longer available for the selected duration${reason ? `: ${reason}` : "."}`

      setSelectedTime("")
      setSelectionResetNotice(message)
      toast.info(message)
    }
  }, [selectedDate, selectedTime, apiSlots, selectedCourt, language])

  useEffect(() => {
    if (selectedTime) {
      setSelectionResetNotice("")
    }
  }, [selectedTime])

  useEffect(() => {
    if (!bookingDialogOpen) {
      setSelectionResetNotice("")
      setBookingNote("")
    }
  }, [bookingDialogOpen])

  const resetBookingDialogScroll = useCallback(() => {
    const body = bookingScrollRef.current
    if (!body) return
    body.scrollTop = 0
    body.scrollLeft = 0
  }, [])

  useEffect(() => {
    if (!bookingDialogOpen) {
      bookingOpenedAtRef.current = 0
      return
    }

    bookingOpenedAtRef.current = Date.now()
    resetBookingDialogScroll()

    const frame = window.requestAnimationFrame(resetBookingDialogScroll)
    const timer = window.setTimeout(resetBookingDialogScroll, 250)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [bookingDialogOpen, resetBookingDialogScroll])

  useEffect(() => {
    if (!bookingDialogOpen || loadingSlots || !bookingOpenedAtRef.current) return
    if (Date.now() - bookingOpenedAtRef.current > 2500) return

    const timer = window.setTimeout(resetBookingDialogScroll, 80)
    return () => window.clearTimeout(timer)
  }, [apiSlots.length, bookingDialogOpen, loadingSlots, resetBookingDialogScroll])

  const canConfirm = Boolean(selectedCourt && selectedDate && selectedTime && selectionAvailability.ok && durationFitsCourtHours)
  const quickDates = useMemo(() => getEgyptDateSequence(2, selectedCourtBookableStartDate), [selectedCourtBookableStartDate])
  const handleConfirmBooking = async () => {
    if (!selectedCourt) return
    if (!selectedDate || !selectedTime) {
      toast.error(language === "ar" ? "يرجى اختيار التاريخ والوقت" : "Please select date and time")
      return
    }

    if (!selectionAvailability.ok) {
      toast.error(selectionAvailability.message || (language === "ar" ? "الموعد غير متاح" : "Slot not available"))
      return
    }

    if (!user?.id) {
      toast.error(language === "ar" ? "يرجى تسجيل الدخول" : "Please log in")
      router.push("/auth/login")
      return
    }

    if (isSubmitting) return; // ✅ Prevent double clicks
    setIsSubmitting(true);    // ✅ Set loading state

    try {
      const selectedSlot = apiSlots.find((slot) => slot.start === selectedTime)
      const bookingDate = selectedSlot?.date || getBookingDateForCourtSlot(selectedDate, selectedTime, selectedCourt)
      const res = await createBooking({
        courtId: selectedCourt.id,
        date: bookingDate,
        startTime: selectedTime,
        endTime: selectedEndTime,
        notes: toBookingNotePayload(bookingNote),
      })

      toast.success(
        language === "ar"
          ? `تم تأكيد الحجز ✅ الكود: ${res.code}`
          : `Booking confirmed ✅ Code: ${res.code}`,
      )

      await refreshUser().catch(() => null)
      setBookingDialogOpen(false)
      router.push(`/dashboard/player/bookings?qr=${res.booking.id}`)
    } catch (error: any) {
      toast.error(error?.message || (language === "ar" ? "تعذر إنشاء الحجز" : "Could not create booking"))
    } finally {
      setIsSubmitting(false); // ✅ Reset loading state
    }
  }

  /* --------------------------------- render --------------------------------- */

  return (
    <div className="space-y-6">
      {/* Hero */}
      <AnimatedContainer animation="fade-up">
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-primary/10 via-blue-500/5 to-background border border-border/50 p-6 md:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">
                  {language === "ar" ? "استعرض الملاعب" : "Browse Courts"}
                </h1>
                <p className="text-sm text-muted-foreground mt-2 font-medium">
                  {language === "ar"
                    ? "اختيار ملعب + وقت. سيُؤكد الحجز مباشرة مع كود دخول من 8 رموز."
                    : "Pick a court + time. Booking is confirmed instantly with an 8-character check-in code."}
                </p>
              </div>

              <div className="mt-4 md:mt-0 w-full md:w-auto flex justify-start md:justify-end">
                <div className="flex items-center bg-background/80 backdrop-blur-sm border border-border/50 rounded-2xl p-2 gap-2 w-full sm:w-auto">
                  <StatPill label={language === "ar" ? "ملاعب" : "Courts"} value={totalCourts} />
                  <StatPill label={language === "ar" ? "مفضلة" : "Favorites"} value={favorites.length} />
                  
                  <div className="ms-auto sm:ms-2 border-s border-border/50 ps-3 pe-1 py-0.5">
                    <Link
                      href="/dashboard/player/favorites"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white transition-colors"
                      title={language === "ar" ? "المفضلة" : "Favorites"}
                    >
                      <Heart className="h-5 w-5" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </AnimatedContainer>

      <AnimatedContainer animation="fade-up" delay={40}>
        <Card className="md:hidden border-2 border-border/50 bg-card rounded-[2rem] overflow-hidden mb-6 shadow-sm">
          {/* Mobile Filter section inside card */}
          <div className="p-4 bg-muted/10 border-b border-border/40">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={language === "ar" ? "بحث عن ملاعب..." : "Search courts..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-12 ps-11 rounded-2xl bg-background border-border/60 shadow-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute end-2 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <Button className="h-12 rounded-2xl gap-2 shadow-sm px-4" variant="outline" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal className="h-4 w-4" />
                {language === "ar" ? "فلاتر" : "Filters"}
                {activeChips.length > 0 && (
                  <Badge className="ms-1 bg-primary/10 text-primary border-primary/20">{activeChips.length}</Badge>
                )}
              </Button>
            </div>

            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <Select value={selectedCity} onValueChange={setSelectedCity}>
                <SelectTrigger className="h-9 min-w-[130px] rounded-full bg-background border-border/60 shadow-sm text-xs font-medium">
                  <MapPin className="me-1.5 h-3.5 w-3.5 text-primary" />
                  <SelectValue placeholder={t("courts.city")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {cities.map((city) => (
                    <SelectItem key={city.en} value={city.en}>
                      {language === "ar" ? city.ar : city.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedSport} onValueChange={setSelectedSport}>
                <SelectTrigger className="h-9 min-w-[130px] rounded-full bg-background border-border/60 shadow-sm text-xs font-medium">
                  <Zap className="me-1.5 h-3.5 w-3.5 text-primary" />
                  <SelectValue placeholder={t("courts.sportType")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}</SelectItem>
                  {Object.entries(sportTypes).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {language === "ar" ? value.ar : value.en}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="h-9 min-w-[140px] rounded-full bg-background border-border/60 shadow-sm text-xs font-medium">
                  <ArrowUpDown className="me-1.5 h-3.5 w-3.5 text-primary" />
                  <SelectValue placeholder={language === "ar" ? "ترتيب" : "Sort"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recommended">{language === "ar" ? "موصى به" : "Recommended"}</SelectItem>
                  <SelectItem value="price_low">{language === "ar" ? "الأقل سعراً" : "Lowest price"}</SelectItem>
                  <SelectItem value="price_high">{language === "ar" ? "الأعلى سعراً" : "Highest price"}</SelectItem>
                  <SelectItem value="bookings_high">{language === "ar" ? "الأكثر حجزاً" : "Most booked"}</SelectItem>
                  <SelectItem value="newest">{language === "ar" ? "الأحدث" : "Newest"}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="mt-3 text-xs text-muted-foreground font-medium px-1">
              {language === "ar"
                ? `عرض ${pageSlice.length} من ${totalCourts} ملعب`
                : `Showing ${pageSlice.length} of ${totalCourts} courts`}
            </p>
          </div>

          {/* Mobile results inside card */}
          <div className="bg-card">
            {courtsLoading ? (
              <div className="space-y-4 py-4 px-4" aria-busy="true" aria-live="polite">
                <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                  <Spinner className="h-4 w-4" />
                  <span>{courtsLoadingLabel}</span>
                </div>

                <div className="flex gap-4 overflow-hidden pb-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="w-[94%] shrink-0">
                      <CourtCardSkeleton />
                    </div>
                  ))}
                </div>
              </div>
            ) : pageSlice.length === 0 ? (
              <div className="px-4 py-4">
                <EmptyState
                  icon={Search}
                  title={language === "ar" ? "لم يتم العثور على ملاعب" : "No courts found"}
                  description={language === "ar" ? "جرب تغيير البحث أو الفلاتر" : "Try adjusting search or filters"}
                  action={{ label: language === "ar" ? "مسح الفلاتر" : "Clear filters", onClick: clearAll }}
                />
              </div>
            ) : (
              <div>
                <MobileCourtsCarousel
                  courts={pageSlice}
                  renderCard={(court, i) => (
                    <CourtCard
                      court={court}
                      language={language}
                      t={t}
                      isFav={favorites.includes(court.id)}
                      onToggleFav={() => toggleFavorite(court.id)}
                      onBook={() => handleBookCourt(court)}
                      availableToday={Boolean((court as any).availability?.hasAvailability)}
                      imagePriority={i === 0 && currentPage === 1}
                    />
                  )}
                />
                {totalPages > 1 && (
                  <div className="flex items-center justify-between gap-3 border-t border-border/50 px-4 pb-4 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="h-10 rounded-xl px-4"
                    >
                      <ChevronLeft className="me-1.5 h-4 w-4 rtl:rotate-180" />
                      {language === "ar" ? "السابق" : "Previous"}
                    </Button>

                    <div className="rounded-full bg-muted/50 px-3 py-1 text-xs font-bold text-muted-foreground" dir="ltr">
                      {currentPage} / {totalPages}
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="h-10 rounded-xl px-4"
                    >
                      {language === "ar" ? "التالي" : "Next"}
                      <ChevronRight className="ms-1.5 h-4 w-4 rtl:rotate-180" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      </AnimatedContainer>

      {/* Desktop: ONE BORDER container (filters + courts + pagination all together) */}
      <AnimatedContainer animation="fade-up" delay={60}>
        <Card className="hidden md:block border-2 border-border/50 bg-card/50 backdrop-blur-sm rounded-3xl">
          <CardContent className="p-0">
            {/* Filters row */}
            <div className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder={language === "ar" ? "ابحث عن ملعب أو مدينة..." : "Search courts or cities..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-12 ps-12 pe-10 bg-muted/30 border-border/60 rounded-xl text-base transition focus:bg-background focus:ring-2 focus:ring-primary/20"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="absolute end-3 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition"
                        aria-label={language === "ar" ? "مسح البحث" : "Clear search"}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <Select value={selectedCity} onValueChange={setSelectedCity}>
                    <SelectTrigger className="h-12 w-[180px] rounded-xl bg-muted/30 border-border/60 hover:bg-muted/50 transition">
                      <MapPin className="me-2 h-4 w-4 text-primary" />
                      <SelectValue placeholder={t("courts.city")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("common.all")}</SelectItem>
                      {cities.map((city) => (
                        <SelectItem key={city.en} value={city.en}>
                          {language === "ar" ? city.ar : city.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={selectedSport} onValueChange={setSelectedSport}>
                    <SelectTrigger className="h-12 w-[180px] rounded-xl bg-muted/30 border-border/60 hover:bg-muted/50 transition">
                      <Zap className="me-2 h-4 w-4 text-primary" />
                      <SelectValue placeholder={t("courts.sportType")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("common.all")}</SelectItem>
                      {Object.entries(sportTypes).map(([key, value]) => (
                        <SelectItem key={key} value={key}>
                          {language === "ar" ? value.ar : value.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                    <SelectTrigger className="h-12 w-[190px] rounded-xl bg-muted/30 border-border/60 hover:bg-muted/50 transition">
                      <ArrowUpDown className="me-2 h-4 w-4 text-primary" />
                      <SelectValue placeholder={language === "ar" ? "ترتيب" : "Sort"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">{language === "ar" ? "موصى به" : "Recommended"}</SelectItem>
                      <SelectItem value="price_low">{language === "ar" ? "الأقل سعراً" : "Lowest price"}</SelectItem>
                      <SelectItem value="price_high">{language === "ar" ? "الأعلى سعراً" : "Highest price"}</SelectItem>
                      <SelectItem value="bookings_high">{language === "ar" ? "الأكثر حجزاً" : "Most booked"}</SelectItem>
                      <SelectItem value="newest">{language === "ar" ? "الأحدث" : "Newest"}</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button variant="outline" className="h-12 rounded-xl gap-2" onClick={() => setFiltersOpen(true)}>
                    <SlidersHorizontal className="h-4 w-4" />
                    {language === "ar" ? "فلاتر" : "Filters"}
                    {activeChips.length > 0 && (
                      <Badge className="ms-2 bg-primary/10 text-primary border-primary/20">{activeChips.length}</Badge>
                    )}
                  </Button>
                </div>

                {activeChips.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {activeChips.slice(0, 12).map((chip) => (
                      <button
                        key={chip.key}
                        onClick={chip.onRemove}
                        className="group inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-sm text-foreground hover:bg-accent/50 transition"
                      >
                        <span className="truncate max-w-[240px]">{chip.label}</span>
                        <X className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                      </button>
                    ))}
                    <Button variant="ghost" className="h-9 px-3 rounded-xl text-primary hover:text-primary" onClick={clearAll}>
                      {language === "ar" ? "مسح الكل" : "Clear all"}
                    </Button>
                  </div>
                )}

                <p className="text-sm text-muted-foreground">
                  {language === "ar"
                    ? `عرض ${pageSlice.length} من ${filteredCourts.length} ملعب`
                    : `Showing ${pageSlice.length} of ${filteredCourts.length} courts`}
                </p>
              </div>
            </div>

            {/* Courts area */}
            <div className="border-t border-border/50 p-4">
              {courtsLoading ? (
                <div className="space-y-4" aria-busy="true" aria-live="polite">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner className="h-4 w-4" />
                    <span>{courtsLoadingLabel}</span>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {Array.from({ length: pageSize }).map((_, i) => (
                      <CourtCardSkeleton key={i} />
                    ))}
                  </div>
                </div>
              ) : pageSlice.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title={language === "ar" ? "لم يتم العثور على ملاعب" : "No courts found"}
                  description={language === "ar" ? "جرب تغيير البحث أو الفلاتر" : "Try adjusting search or filters"}
                  action={{ label: language === "ar" ? "مسح الفلاتر" : "Clear filters", onClick: clearAll }}
                />
              ) : (
                <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {pageSlice.map((court, i) => (
                    <AnimatedContainer key={court.id} animation="fade-up" delay={60 + i * 20}>
                      <CourtCard
                        court={court}
                        language={language}
                        t={t}
                        isFav={favorites.includes(court.id)}
                      onToggleFav={() => toggleFavorite(court.id)}
                      onBook={() => handleBookCourt(court)}
                      availableToday={Boolean((court as any).availability?.hasAvailability)}
                      imagePriority={i === 0 && currentPage === 1}
                    />
                  </AnimatedContainer>
                  ))}
                </div>
              )}
            </div>

            {/* Desktop Pagination */}
            {totalPages > 1 && (
              <div className="border-t border-border/50 p-4 sm:px-6 flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="rounded-xl h-10 px-4 border-border/60 hover:bg-muted/50 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 me-2 rtl:rotate-180" />
                  {language === "ar" ? "السابق" : "Previous"}
                </Button>

                <div className="flex items-center gap-1.5">
                  {pageRange.map((pageNum, i) =>
                    pageNum === -1 ? (
                      <span key={`ellipsis-${i}`} className="text-muted-foreground font-medium px-2">
                        ...
                      </span>
                    ) : (
                      <Button
                        key={pageNum}
                        variant={pageNum === currentPage ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(pageNum)}
                        className={cn(
                          "rounded-xl h-10 w-10 p-0 text-sm font-semibold transition-colors shadow-none",
                          pageNum !== currentPage && "border-transparent bg-transparent hover:bg-muted/60 text-muted-foreground"
                        )}
                      >
                        {pageNum}
                      </Button>
                    )
                  )}
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-xl h-10 px-4 border-border/60 hover:bg-muted/50 transition-colors"
                >
                  {language === "ar" ? "التالي" : "Next"}
                  <ChevronRight className="h-4 w-4 ms-2 rtl:rotate-180" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </AnimatedContainer>

      {/* Filters dialog */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="w-[95vw] sm:max-w-xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
            <DialogTitle className="text-xl font-extrabold">{language === "ar" ? "الفلاتر" : "Filters"}</DialogTitle>
            <DialogDescription className="sr-only">{language === "ar" ? "تخصيص البحث عن الملاعب" : "Customize your court search filters"}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            <div className="space-y-3">
              <Label className="text-sm font-medium">{language === "ar" ? "نطاق السعر" : "Price range"}</Label>
              <Slider
                value={priceRange}
                onValueChange={(v) => setPriceRange(v as [number, number])}
                max={PRICE_RANGE_MAX}
                min={PRICE_RANGE_MIN}
                step={10}
              />
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {priceRange[0]} {language === "ar" ? "ج.م" : "EGP"}
                </span>
                <span>
                  {priceRange[1]} {language === "ar" ? "ج.م" : "EGP"}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">{language === "ar" ? "المرافق" : "Amenities"}</Label>
              <div className="grid grid-cols-2 gap-2">
                {amenityOptions.map((a) => (
                  <Button
                    key={a.id}
                    variant={amenities.includes(a.id) ? "default" : "outline"}
                    size="sm"
                    className="rounded-xl justify-start gap-2"
                    onClick={() =>
                      setAmenities((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id]))
                    }
                  >
                    <a.icon className="h-4 w-4" />
                    {a.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">{language === "ar" ? "خيارات" : "Options"}</Label>

              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={onlyAvailable} onCheckedChange={(c) => setOnlyAvailable(Boolean(c))} />
                <span className="text-sm">{language === "ar" ? "متاح اليوم فقط" : "Available today only"}</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={favoritesOnly} onCheckedChange={(c) => setFavoritesOnly(Boolean(c))} />
                <span className="text-sm">{language === "ar" ? "المفضلة فقط" : "Favorites only"}</span>
              </label>
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-4 gap-2 border-t border-border/50 shrink-0">
            <Button variant="outline" className="rounded-xl flex-1" onClick={clearAll}>
              {language === "ar" ? "مسح الكل" : "Clear all"}
            </Button>
            <Button className="rounded-xl flex-1" onClick={() => setFiltersOpen(false)}>
              {language === "ar" ? "تطبيق" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Dialog (Enhanced — matches court-details page) */}
      <Dialog open={bookingDialogOpen} onOpenChange={setBookingDialogOpen}>
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            resetBookingDialogScroll()
          }}
          className="flex h-[calc(100dvh-1rem)] max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:h-auto sm:max-h-[90vh] sm:max-w-xl"
        >
          <DialogHeader className="shrink-0 border-b border-border/60 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
            <DialogTitle className="text-xl font-extrabold">{language === "ar" ? "حجز ملعب" : "Book Court"}</DialogTitle>
            <DialogDescription className="sr-only">
              {language === "ar"
                ? "اختر تاريخ ووقت الحجز لهذا الملعب"
                : "Choose a booking date and time for this court"}
            </DialogDescription>
          </DialogHeader>

          {selectedCourt && (
            <div
              ref={bookingScrollRef}
              className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 pb-24 scroll-pb-28 touch-pan-y [overflow-anchor:none] sm:px-5 sm:pb-6"
            >

              {/* Court info strip */}
              <div className="flex items-center gap-3">
                <div className="relative h-12 w-12 overflow-hidden rounded-xl shrink-0">
                  <Image
                    src={selectedCourt.images?.[0] || "/placeholder.svg?height=48&width=48&query=court"}
                    alt={language === "ar" ? selectedCourt.name : selectedCourt.nameEn}
                    fill
                    className="object-cover"
                    sizes="48px"
                  />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate text-sm">{language === "ar" ? selectedCourt.name : selectedCourt.nameEn}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {language === "ar" ? selectedCourt.city : selectedCourt.cityEn} &bull; {formatOperatingHours(selectedCourt.openTime, selectedCourt.closeTime, language as "ar" | "en")}
                  </p>
                </div>
                <Badge className="ms-auto shrink-0 bg-primary/10 text-primary border-0 text-xs">
                  {language === "ar" ? (sportTypes[selectedCourt.sportType]?.ar || selectedCourt.sportType) : (sportTypes[selectedCourt.sportType]?.en || selectedCourt.sportType)}
                </Badge>
              </div>

              <div className="h-px bg-border/50" />

              {/* Select Date — single calendar popover */}
              <div className="space-y-2">
                <Label
                  htmlFor="browse-booking-date-trigger"
                  className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
                >
                  {language === "ar" ? "اختر التاريخ" : "Select Date"}
                </Label>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <button
                      id="browse-booking-date-trigger"
                      type="button"
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors text-start"
                    >
                      <Calendar className="h-4 w-4 text-primary shrink-0" />
                      <span className="flex-1 text-sm font-medium">
                        {selectedDate
                          ? new Date(selectedDate + 'T12:00:00').toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
                          : (language === "ar" ? "اختر تاريخاً..." : "Pick a date...")}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl shadow-xl border border-border/60" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={selectedDate ? new Date(selectedDate + 'T12:00:00') : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const y = date.getFullYear()
                          const m = String(date.getMonth() + 1).padStart(2, '0')
                          const d = String(date.getDate()).padStart(2, '0')
                          setSelectedDate(`${y}-${m}-${d}`)
                          setDatePickerOpen(false)
                        }
                      }}
                      disabled={(date) => {
                        const minDate = selectedCourtBookableStartDate ? new Date(selectedCourtBookableStartDate + 'T12:00:00') : new Date();
                        minDate.setHours(0, 0, 0, 0);
                        return date < minDate;
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Duration */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {language === "ar" ? "المدة" : "Duration"}
                </p>
                <div className="flex p-1 bg-muted/30 rounded-2xl border border-border/40">
                  {[1, 2, 3].map((h) => (
                    <button
                      key={h}
                      type="button"
                      className={cn(
                        "flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-150",
                        durationHours === h
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => setDurationHours(h as 1 | 2 | 3)}
                    >
                      {language === "ar" ? `${h} ساعة` : `${h}h`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Slots */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {language === "ar" ? "وقت البداية" : "Start Time"}
                </p>

                {!selectedDate ? (
                  <div className="rounded-2xl border border-border/40 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                    {language === "ar" ? "اختر تاريخاً أولاً" : "Pick a date first"}
                  </div>
                ) : loadingSlots ? (
                  <div className="rounded-2xl border border-border/40 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {language === "ar" ? "جاري تحميل الأوقات..." : "Loading times..."}
                    </span>
                  </div>
                ) : filteredTimeSlots.length === 0 ? (
                  <div className="rounded-2xl border border-border/40 bg-muted/20 p-4 text-center text-xs text-muted-foreground">
                    {language === "ar" ? "لا توجد أوقات متاحة" : "No available time slots"}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {apiSlots.some((s) => s.closureReason) && (
                      <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs flex items-center gap-2 text-amber-700 dark:text-amber-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <p>{language === "ar" ? "بعض الأوقات مغلقة" : "Some slots are closed"} — <strong>{apiSlots.find(s => s.closureReason)?.closureReason}</strong></p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 [overflow-anchor:none] min-[340px]:grid-cols-3">
                      {filteredTimeSlots.map((slot: any) => {
                        const peak = isPeakHour(slot.start, selectedCourt?.peakStartTime, selectedCourt?.peakEndTime)
                        const isSelected = selectedTime === slot.start
                        const unavailableLabel = translateUnavailableReason(slot.unavailableReason || slot.closureReason, language)
                        return (
                          <button
                            key={slot.start}
                            type="button"
                            disabled={!slot.available}
                            aria-disabled={!slot.available}
                            title={unavailableLabel || undefined}
                            onClick={() => {
                              if (!slot.available) {
                                toast.error(translateUnavailableReason(slot.unavailableReason || slot.closureReason, language) || (language === "ar" ? "هذا الموعد غير متاح" : "This slot is not available"))
                                return
                              }
                              startTimeTransition(() => {
                                setSelectionResetNotice("")
                                setSelectedTime(slot.start)
                              })
                            }}
                            className={cn(
                              "relative flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-sm font-bold tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-100",
                              isSelected
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : slot.available
                                  ? "border-border/60 bg-background text-foreground hover:border-primary/50 hover:bg-primary/5 dark:border-white/15 dark:bg-white/[0.03]"
                                  : "border-border/60 bg-muted/40 text-muted-foreground line-through decoration-2 dark:border-white/15 dark:bg-white/[0.04] dark:text-white/55"
                            )}
                          >
                            <span dir="ltr">{format12h(slot.start, language as "ar" | "en")}</span>
                            {peak && <Zap className="h-3 w-3 shrink-0 text-amber-400" />}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {selectionResetNotice && !selectedTime && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">{selectionResetNotice}</p>
                )}
              </div>

              {/* Note to venue */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="browse-booking-note" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {language === "ar" ? "ملاحظة للملعب" : "Note to Venue"}
                  </Label>
                  <span className="text-xs text-muted-foreground">{bookingNote.length}/{BOOKING_NOTE_MAX_LENGTH}</span>
                </div>
                <Textarea
                  id="browse-booking-note"
                  rows={2}
                  maxLength={BOOKING_NOTE_MAX_LENGTH}
                  value={bookingNote}
                  onChange={(event) => setBookingNote(event.target.value)}
                  className="rounded-2xl resize-none bg-muted/20 border-border/50 text-sm placeholder:text-muted-foreground/50"
                  placeholder={language === "ar" ? "ملاحظة اختيارية للمدير..." : "Optional note for the venue manager..."}
                />
              </div>

              {/* Price summary */}
              {selectedTime && (
                <div className="rounded-2xl bg-primary/5 border border-primary/20 px-4 py-3 flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    <span>{language === "ar" ? "من" : "From"} </span>
                    <span className="font-bold text-foreground" dir="ltr">{format12h(selectedTime, language as "ar" | "en")}</span>
                    <span> {language === "ar" ? "حتى" : "to"} </span>
                    <span className="font-bold text-foreground" dir="ltr">{format12h(selectedEndTime, language as "ar" | "en")}</span>
                  </div>
                  <span className="text-xl font-extrabold text-primary">{totalPrice} <span className="text-xs font-semibold">{t("common.egp")}</span></span>
                </div>
              )}

            </div>
          )}

          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 bg-background px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[0_-10px_24px_rgba(15,23,42,0.08)] dark:shadow-[0_-12px_28px_rgba(0,0,0,0.42)] sm:gap-3 sm:px-6 sm:pb-6 sm:pt-4 sm:space-x-0">
            <Button variant="ghost" className="rounded-2xl flex-1 h-14 sm:h-12 text-muted-foreground hover:text-foreground" onClick={() => setBookingDialogOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button className="rounded-2xl flex-1 h-14 sm:h-12 gap-2 text-base font-bold shadow-lg shadow-primary/20" onClick={handleConfirmBooking} disabled={!canConfirm || isSubmitting}>
              {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              {isSubmitting
                ? (language === "ar" ? "جاري الحجز..." : "Booking...")
                : (language === "ar" ? "تأكيد الحجز" : "Confirm Booking")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
