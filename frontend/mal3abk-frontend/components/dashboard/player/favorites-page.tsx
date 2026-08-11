"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Heart,
  MapPin,
  Clock,
  Trash2,
  Calendar,
  Sparkles,
  LayoutGrid,
  ListIcon,
  Bell,
  Share2,
  ArrowUpDown,
  Search,
  X,
  BadgePercent,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
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
} from "@/components/ui/alert-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"

import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { sportTypes } from "@/lib/constants"
import { getFavorites, toggleFavorite as toggleFavoriteApi } from "@/lib/api"
import { AnimatedContainer } from "@/components/ui/animated-container"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"
import NextImage from "next/image"

/* ------------------------------ local storage ------------------------------ */

const FAVORITES_KEY = "player_favorites_v1"
const NOTIFS_KEY = "player_favorites_notifs_v1"

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function saveJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {}
}

/* --------------------------------- types --------------------------------- */

import type { Court } from "@/lib/types"
type SortBy = "rating" | "price" | "name" | "savings"

function isOpenNow(openTime?: string, closeTime?: string) {
  if (!openTime || !closeTime) return false
  if (is24HourSchedule(openTime, closeTime)) return true
  const now = new Date()
  const [oh, om] = openTime.split(":").map(Number)
  const [ch, cm] = closeTime.split(":").map(Number)
  const open = new Date(now)
  open.setHours(oh || 0, om || 0, 0, 0)
  const close = new Date(now)
  close.setHours(ch || 0, cm || 0, 0, 0)
  return now >= open && now <= close
}

function calcSavings(court: Court) {
  const peak = court.peakPrice || 0
  const off = court.offPeakPrice || 0
  const d = peak - off
  return d > 0 ? d : 0
}

/* -------------------------------- component -------------------------------- */

import { formatOperatingHours, is24HourSchedule } from "@/lib/time"

export function FavoritesPage() {
  const { language, t } = useLanguage()
  const { user } = useAuth()
  const isAr = language === "ar"
  const router = useRouter()
  const searchParams = useSearchParams()
  const processedRef = useRef(false)

  const [favoriteCourts, setFavoriteCourts] = useState<Court[]>([])
  const [notifications, setNotifications] = useState<Record<string, boolean>>({})
  const [notificationsLoaded, setNotificationsLoaded] = useState(false)

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const [sortBy, setSortBy] = useState<SortBy>("rating")
  const [selectedSport, setSelectedSport] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")

  // load
  useEffect(() => {
    if (!user) {
      setFavoriteCourts([])
      return
    }
    let cancelled = false
    const fetchFavs = async () => {
      try {
        const res = await getFavorites()
        if (cancelled) return

        let currentFavs = (res.items || []) as Court[]
        const addFavId = searchParams?.get("addFav")

        // If there is an addFav ID and we haven't processed it yet
        if (addFavId && !processedRef.current) {
          processedRef.current = true
          const alreadyFav = currentFavs.some((c) => c.id === addFavId)

          if (alreadyFav) {
            toast.info(isAr ? "الملعب موجود بالفعل في المفضلة" : "Court is already in your favorites")
          } else {
            try {
              await toggleFavoriteApi(addFavId)
              toast.success(isAr ? "تمت الإضافة إلى المفضلة" : "Added to favorites")
              // Fetch again to grab the actual court details
              const updatedRes = await getFavorites()
              currentFavs = (updatedRes.items || []) as Court[]
            } catch (err: any) {
              toast.error(err?.message || (isAr ? "حدث خطأ" : "An error occurred"))
            }
          }
          // Remove the query param from the URL so it doesn't run again if they refresh
          router.replace("/dashboard/player/favorites", { scroll: false })
        }

        if (!cancelled) {
          setFavoriteCourts(currentFavs)
        }
      } catch (err) {
        console.error("Failed fetching favorites:", err)
      }
    }
    fetchFavs()
    return () => {
      cancelled = true
    }
  }, [user, searchParams, router, isAr])

  useEffect(() => {
    if (typeof window === "undefined") return
    setNotifications(safeJsonParse<Record<string, boolean>>(localStorage.getItem(NOTIFS_KEY), {}))
    setNotificationsLoaded(true)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined" || !notificationsLoaded) return
    saveJson(NOTIFS_KEY, notifications)
  }, [notifications, notificationsLoaded])

  const uniqueSports = useMemo(() => [...new Set(favoriteCourts.map((c) => c.sportType))], [favoriteCourts])

  useEffect(() => {
    if (selectedSport === "all") return
    if (!uniqueSports.includes(selectedSport)) {
      setSelectedSport("all")
    }
  }, [selectedSport, uniqueSports])

  const totalSavings = useMemo(() => favoriteCourts.reduce((acc, c) => acc + calcSavings(c), 0), [favoriteCourts])

  const avgRating = useMemo(() => {
    if (favoriteCourts.length === 0) return "0.0"
    const v = favoriteCourts.reduce((acc, c) => acc + (c.rating || 0), 0) / favoriteCourts.length
    return v.toFixed(1)
  }, [favoriteCourts])

  const removeFavorite = async (courtId: string) => {
    if (!user) return
    const prevCourts = [...favoriteCourts]
    
    // Optimistic UI update
    setFavoriteCourts((prev) => prev.filter((c) => c.id !== courtId))
    
    try {
      await toggleFavoriteApi(courtId)
      toast.success(isAr ? "تم إزالة الملعب من المفضلة" : "Removed from favorites")
    } catch (e: any) {
      // Revert if error occurs
      setFavoriteCourts(prevCourts)
      toast.error(e?.message || (isAr ? "حدث خطأ" : "An error occurred"))
    }
  }

  const toggleNotification = (courtId: string) => {
    setNotifications((prev) => {
      const next = { ...prev, [courtId]: !prev[courtId] }
      const enabled = next[courtId]
      toast.success(
        enabled
          ? isAr
            ? "سيتم إعلامك بالعروض الجديدة"
            : "You'll be notified of new offers"
          : isAr
            ? "تم إيقاف الإشعارات"
            : "Notifications disabled",
      )
      return next
    })
  }

  const handleShare = async (court: Court) => {
    const url = `${window.location.origin}/dashboard/player/browse/${court.id}`
    try {
      if (navigator.share) {
        await navigator.share({
          title: isAr ? court.name : court.nameEn,
          text: isAr ? "شوف الملعب ده" : "Check this court",
          url,
        })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success(isAr ? "تم نسخ الرابط" : "Link copied")
    } catch {
      toast.error(isAr ? "تعذر مشاركة الرابط" : "Couldn't share link")
    }
  }

  const openCourtDetails = (courtId: string) => {
    router.push(`/dashboard/player/browse/${courtId}`)
  }

  const normalizedQuery = useMemo(() => searchQuery.trim().toLowerCase(), [searchQuery])

  const filteredCourts = useMemo(() => {
    let filtered = favoriteCourts

    if (selectedSport !== "all") {
      filtered = filtered.filter((c) => c.sportType === selectedSport)
    }

    if (normalizedQuery) {
      filtered = filtered.filter((c) => {
        const name = (isAr ? c.name : c.nameEn) || ""
        const city = (isAr ? c.city : c.cityEn) || ""
        return name.toLowerCase().includes(normalizedQuery) || city.toLowerCase().includes(normalizedQuery)
      })
    }

    filtered = [...filtered].sort((a, b) => {
      if (sortBy === "rating") return (b.rating || 0) - (a.rating || 0)
      if (sortBy === "price") return (a.offPeakPrice || 0) - (b.offPeakPrice || 0)
      if (sortBy === "savings") return calcSavings(b) - calcSavings(a)
      if (sortBy === "name") {
        const nameA = isAr ? a.name : a.nameEn
        const nameB = isAr ? b.name : b.nameEn
        return (nameA || "").localeCompare(nameB || "")
      }
      return 0
    })

    return filtered
  }, [favoriteCourts, selectedSport, sortBy, normalizedQuery, isAr])

  const showingText = useMemo(() => {
    const total = favoriteCourts.length
    const shown = filteredCourts.length
    return isAr ? `عرض ${shown} من ${total} ملعب` : `Showing ${shown} of ${total} courts`
  }, [filteredCourts.length, favoriteCourts.length, isAr])

  return (
    <div className="space-y-6">
      {/* Hero */}
      <AnimatedContainer animation="fade-up">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-red-500/10 via-pink-500/5 to-background border border-border/50 p-6 md:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-pink-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/20">
                  <Heart className="h-5 w-5 text-red-500 fill-red-500" />
                </div>
                <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20">
                  {isAr ? "المفضلة" : "Favorites"}
                </Badge>
               
              </div>

              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{isAr ? "الملاعب المفضلة" : "Favorite Courts"}</h1>
              <p className="text-muted-foreground mt-1">
                {isAr ? "كل ملاعبك المفضلة في مكان واحد + إشعارات للعروض" : "All your favorite courts in one place + deal alerts"}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-6 px-4 py-3 rounded-2xl bg-background/80 backdrop-blur-sm border border-border/50">
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{favoriteCourts.length}</p>
                  <p className="text-xs text-muted-foreground">{isAr ? "ملعب" : "Courts"}</p>
                </div>

               
              </div>

            </div>
          </div>
        </div>
      </AnimatedContainer>

      {/* ✅ ONE BORDER CONTAINER: Filters + Results together */}
      <AnimatedContainer animation="fade-up" delay={90}>
        <Card className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
          <CardContent className="p-0">
            {/* Filters Header (same container) */}
            <div className="p-3 sm:p-4">
              <div className="flex flex-col gap-2 sm:gap-3">
                {/* Row 1 */}
                <div className="grid grid-cols-2 gap-2 lg:flex lg:gap-3">
                  {/* Search */}
                  <div className="relative col-span-2 flex-1 lg:col-span-1">
                    <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:start-4 sm:h-5 sm:w-5" />
                    <Input
                      placeholder={isAr ? "بحث (اسم / مدينة)..." : "Search (name / city)..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-10 rounded-xl border-border/60 bg-muted/30 ps-10 pe-9 text-sm sm:h-11 sm:ps-12 sm:pe-10"
                    />
                    {searchQuery && (
                      <button
                        aria-label={isAr ? "مسح البحث" : "Clear search"}
                        onClick={() => setSearchQuery("")}
                        className="absolute end-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-muted"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    )}
                  </div>

                  <Select value={selectedSport} onValueChange={setSelectedSport}>
                    <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-muted/30 px-3 text-xs sm:h-11 sm:text-sm lg:w-[220px] [&>span]:truncate">
                      <Sparkles className="me-2 h-4 w-4" />
                      <SelectValue placeholder={isAr ? "الرياضة" : "Sport"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "كل الرياضات" : "All sports"}</SelectItem>
                      {uniqueSports.map((sport) => (
                        <SelectItem key={sport} value={sport}>
                          {isAr ? sportTypes[sport]?.ar || sport : sportTypes[sport]?.en || sport}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Sort */}
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
                    <SelectTrigger className="h-10 w-full rounded-xl border-border/60 bg-muted/30 px-3 text-xs sm:h-11 sm:text-sm lg:w-[220px] [&>span]:truncate">
                      <ArrowUpDown className="me-2 h-4 w-4" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rating">{isAr ? "الأعلى تقييماً" : "Highest rating"}</SelectItem>
                      <SelectItem value="price">{isAr ? "الأقل سعراً" : "Lowest price"}</SelectItem>
                      <SelectItem value="savings">{isAr ? "أكبر توفير" : "Biggest savings"}</SelectItem>
                      <SelectItem value="name">{isAr ? "الاسم" : "Name"}</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* View + Discover */}
                  <div className="col-span-2 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 lg:flex lg:justify-end">
                    <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/30 p-1">
                      <Button
                        type="button"
                        variant={viewMode === "grid" ? "default" : "ghost"}
                        size="icon"
                        className="h-9 w-9 rounded-lg"
                        onClick={() => setViewMode("grid")}
                        aria-label={isAr ? "عرض شبكي" : "Grid view"}
                      >
                        <LayoutGrid className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={viewMode === "list" ? "default" : "ghost"}
                        size="icon"
                        className="h-9 w-9 rounded-lg"
                        onClick={() => setViewMode("list")}
                        aria-label={isAr ? "عرض قائمة" : "List view"}
                      >
                        <ListIcon className="h-4 w-4" />
                      </Button>
                    </div>

                    <Button asChild variant="outline" className="h-10 min-w-0 rounded-xl bg-transparent px-3 text-xs sm:h-11 sm:text-sm">
                      <Link href="/dashboard/player/browse">
                        <Sparkles className="me-1.5 h-4 w-4 shrink-0 sm:me-2" />
                        {isAr ? "اكتشف المزيد" : "Discover more"}
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Showing text */}
                <p className="text-sm text-muted-foreground">{showingText}</p>
              </div>
            </div>

            {/* Results Area (same border) */}
            <div className="border-t border-border/50 p-4">
              {filteredCourts.length === 0 ? (
                <EmptyState
                  icon={Heart}
                  title={isAr ? "لا توجد ملاعب مفضلة" : "No favorites yet"}
                  description={isAr ? "أضف ملاعب إلى المفضلة للوصول السريع إليها" : "Add courts to favorites for quick access"}
                  action={{
                    label: isAr ? "استكشف الملاعب" : "Explore Courts",
                    onClick: () => {
                      router.push("/dashboard/player/browse")
                    },
                  }}
                />
              ) : viewMode === "grid" ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredCourts.map((court, index) => {
                    const savings = calcSavings(court)
                    const openNow = isOpenNow(court.openTime, court.closeTime)

                    return (
                      <AnimatedContainer key={court.id} animation="fade-up" delay={80 + index * 25}>
                        <Card
                          className="group cursor-pointer overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm shadow-lg transition-all duration-500 hover:shadow-xl"
                          role="link"
                          tabIndex={0}
                          onClick={() => openCourtDetails(court.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              openCourtDetails(court.id)
                            }
                          }}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden">
                            <NextImage
                              src={court.images[0] || "/placeholder.svg?height=300&width=400&query=sports court"}
                              alt={isAr ? court.name : court.nameEn}
                              fill
                              sizes="(max-width: 640px) 100vw, 33vw"
                              className="object-cover transition-transform duration-700 group-hover:scale-110"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

                            <div className="absolute top-3 start-3 flex flex-col gap-2">
                              <Badge className="bg-primary/90 text-primary-foreground border-0 backdrop-blur-sm">
                                {isAr ? sportTypes[court.sportType]?.ar : sportTypes[court.sportType]?.en}
                              </Badge>

                              {openNow && (
                                <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/20">
                                  {isAr ? "مفتوح الآن" : "Open now"}
                                </Badge>
                              )}

                              {savings > 0 && (
                                <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                  <BadgePercent className="h-3.5 w-3.5 me-1" />
                                  {isAr ? `وفر ${savings} ج.م` : `Save ${savings} EGP`}
                                </Badge>
                              )}
                            </div>

                            <div className="absolute top-3 end-3 flex flex-col gap-2">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    aria-label={isAr ? "إزالة من المفضلة" : "Remove from favorites"}
                                    onClick={(event) => event.stopPropagation()}
                                    className="flex h-9 w-9 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg"
                                  >
                                    <Heart className="h-4 w-4 fill-current" />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>{isAr ? "إزالة من المفضلة" : "Remove from favorites"}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {isAr ? "هل أنت متأكد من إزالة هذا الملعب من المفضلة؟" : "Are you sure you want to remove this court from favorites?"}
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => removeFavorite(court.id)}>
                                      {isAr ? "إزالة" : "Remove"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>

                              <button
                                onClick={(event) => { event.stopPropagation(); toggleNotification(court.id) }}
                                className={cn(
                                  "flex h-9 w-9 items-center justify-center rounded-full transition-colors shadow-lg",
                                  notifications[court.id]
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-black/40 backdrop-blur-sm text-white hover:bg-black/60",
                                )}
                                aria-label={isAr ? "إشعارات" : "Notifications"}
                              >
                                <Bell className={cn("h-4 w-4", notifications[court.id] ? "fill-current" : "")} />
                              </button>

                              <button
                                aria-label={isAr ? "مشاركة" : "Share"}
                                onClick={(event) => { event.stopPropagation(); void handleShare(court) }}
                                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 backdrop-blur-sm text-white hover:bg-black/60 transition-colors shadow-lg"
                              >
                                <Share2 className="h-4 w-4" />
                              </button>
                            </div>

                            <div className="absolute bottom-3 start-3 end-3 flex items-end justify-between">
                              <div className="flex items-center gap-1 text-white/90 text-sm bg-black/40 backdrop-blur-sm rounded-full px-2.5 py-1">
                                <MapPin className="h-3.5 w-3.5" />
                                {isAr ? court.city : court.cityEn}
                              </div>
                            </div>
                          </div>

                          <CardContent className="p-5">
                            <h3 className="text-lg font-bold text-foreground line-clamp-1">
                              {isAr ? court.name : court.nameEn}
                            </h3>

                            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1.5" dir="ltr">
                                <Clock className="h-4 w-4" />
                                {formatOperatingHours(court.openTime || "09:00", court.closeTime || "21:00", isAr ? "ar" : "en")}
                              </span>
                            </div>

                            <div className="mt-4 flex items-center justify-between pt-4 border-t border-border/50">
                              <div>
                                <span className="text-2xl font-bold text-primary">{court.offPeakPrice}</span>
                                <span className="text-sm text-muted-foreground ms-1">{t("common.egp")}/hr</span>
                                {savings > 0 && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {isAr ? "سعر الذروة" : "Peak"}:{" "}
                                    <span className="line-through">{court.peakPrice}</span> {t("common.egp")}
                                  </p>
                                )}
                              </div>

                              <Button asChild size="sm" className="rounded-xl gap-1.5">
                                <Link href={`/dashboard/player/browse/${court.id}`} onClick={(event) => event.stopPropagation()}>
                                  <Calendar className="h-4 w-4" />
                                  {isAr ? "احجز" : "Book"}
                                </Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </AnimatedContainer>
                    )
                  })}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredCourts.map((court, index) => {
                    const savings = calcSavings(court)
                    const openNow = isOpenNow(court.openTime, court.closeTime)

                    return (
                      <AnimatedContainer key={court.id} animation="slide-up" delay={index * 20}>
                        <Card
                          className="group cursor-pointer overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all hover:shadow-xl"
                          role="link"
                          tabIndex={0}
                          onClick={() => openCourtDetails(court.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault()
                              openCourtDetails(court.id)
                            }
                          }}
                        >
                          <CardContent className="p-0">
                            <div className="flex flex-col md:flex-row">
                              <div className="relative w-full md:w-72 aspect-video md:aspect-auto overflow-hidden">
                                <NextImage
                                  src={court.images[0] || "/placeholder.svg?height=200&width=300&query=sports court"}
                                  alt={isAr ? court.name : court.nameEn}
                                  fill
                                  sizes="(max-width: 768px) 100vw, 20vw"
                                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                                />

                                <div className="absolute top-3 start-3 flex flex-col gap-2">
                                  <Badge className="bg-primary/90 text-primary-foreground border-0">
                                    {isAr ? sportTypes[court.sportType]?.ar : sportTypes[court.sportType]?.en}
                                  </Badge>

                                  {openNow && (
                                    <Badge variant="secondary" className="bg-green-500/20 text-green-700 dark:text-green-300 border border-green-500/20">
                                      {isAr ? "مفتوح الآن" : "Open now"}
                                    </Badge>
                                  )}

                                  {savings > 0 && (
                                    <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/20">
                                      <BadgePercent className="h-3.5 w-3.5 me-1" />
                                      {isAr ? `وفر ${savings} ج.م` : `Save ${savings} EGP`}
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <div className="flex-1 p-5 flex flex-col justify-between gap-4">
                                <div>
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0">
                                      <h3 className="text-xl font-bold text-foreground group-hover:text-primary transition-colors truncate">
                                        {isAr ? court.name : court.nameEn}
                                      </h3>
                                      <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                                        <MapPin className="h-4 w-4" />
                                        <span className="truncate">{isAr ? court.city : court.cityEn}</span>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        onClick={(event) => { event.stopPropagation(); toggleNotification(court.id) }}
                                        className={cn(
                                          "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                                          notifications[court.id] ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80",
                                        )}
                                        aria-label={isAr ? "إشعارات" : "Notifications"}
                                      >
                                        <Bell className={cn("h-4 w-4", notifications[court.id] ? "fill-current" : "")} />
                                      </button>

                                      <button
                                        aria-label={isAr ? "مشاركة" : "Share"}
                                        onClick={(event) => { event.stopPropagation(); void handleShare(court) }}
                                        className="h-9 w-9 rounded-full bg-muted hover:bg-muted/80 flex items-center justify-center transition-colors"
                                      >
                                        <Share2 className="h-4 w-4" />
                                      </button>

                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <button
                                            aria-label={isAr ? "إزالة من المفضلة" : "Remove"}
                                            onClick={(event) => event.stopPropagation()}
                                            className="h-9 w-9 rounded-full bg-red-500/10 text-red-500 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>{isAr ? "إزالة من المفضلة" : "Remove from favorites"}</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              {isAr ? "هل أنت متأكد من إزالة هذا الملعب من المفضلة؟" : "Are you sure you want to remove this court from favorites?"}
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => removeFavorite(court.id)}>
                                              {isAr ? "إزالة" : "Remove"}
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </div>

                                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1.5" dir="ltr">
                                      <Clock className="h-4 w-4" />
                                      {formatOperatingHours(court.openTime || "09:00", court.closeTime || "21:00", isAr ? "ar" : "en")}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                  <div className="flex flex-col">
                                    <div className="flex items-baseline gap-2">
                                      <span className="text-2xl font-bold text-primary">{court.offPeakPrice}</span>
                                      <span className="text-muted-foreground">
                                        {t("common.egp")} / {isAr ? "ساعة" : "hour"}
                                      </span>
                                    </div>
                                    {savings > 0 && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {isAr ? "سعر الذروة" : "Peak"}:{" "}
                                        <span className="line-through">{court.peakPrice}</span> {t("common.egp")}
                                      </p>
                                    )}
                                  </div>

                                  <Button asChild className="rounded-xl gap-2">
                                    <Link href={`/dashboard/player/browse/${court.id}`} onClick={(event) => event.stopPropagation()}>
                                      <Calendar className="h-4 w-4" />
                                      {isAr ? "احجز الآن" : "Book now"}
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </AnimatedContainer>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </AnimatedContainer>
    </div>
  )
}
