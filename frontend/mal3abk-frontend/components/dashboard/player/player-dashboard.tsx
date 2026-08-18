  "use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  Activity,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock,
  Timer,
  CreditCard,
  Smartphone,
  Crown,
  Eye,
  EyeOff,
  Flame,
  Heart,
  MapPin,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Zap,
  Copy,
  Check,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { normalizeBookingStatus } from "@/hooks/use-bookings-data"
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
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { sportTypes } from "@/lib/constants"
import { CheckInCodeDialogContent } from "@/components/dashboard/player/check-in-code-dialog-content"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import { AnimatedContainer } from "@/components/ui/animated-container"
import { format } from "date-fns"
import { ar, enUS } from "date-fns/locale"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useIsMobile } from "@/components/ui/use-mobile"
import { PageTransition } from "@/components/ui/page-transition"
import { GridBackground, NoiseTexture, Spotlight } from "@/components/ui/floating-elements"
import { toast } from "sonner"
import { createEgyptDate, getAbsoluteBookingTimes } from "@/lib/date"
import { timeToMinutes, checkNextDay, format12h } from "@/lib/time"
import { PLAYER_BOOKING_CHANGE_WINDOW_MS } from "@/lib/booking-policy"
import {
  listBookings as listBookingsApi,
  updateBooking as updateBookingApi,
  cancelBooking as cancelBookingApi,
  getFavorites as getFavoritesApi,
} from "@/lib/api"
/* ----------------------------- Live Timer Badge ---------------------------- */

function CountdownBadge({ booking, language }: { booking: any; language: string }) {
  const [countdown, setCountdown] = useState("")
  const [isLive, setIsLive] = useState(false)
  const bookingEndTime = booking?.endTime || "23:59"
  const bookingOpenTime = booking?.sessionOpenTime || booking?.courtOpenTime || booking?.court?.openTime || "08:00"

  useEffect(() => {
    if (!booking) {
      setCountdown("")
      setIsLive(false)
      return
    }
    const tick = () => {
      const now = Date.now()
      const useOpeningDay = booking.useOpeningDayForOvernightBookings === true
      const { startMs, endMs } = getAbsoluteBookingTimes(booking.date, booking.startTime, bookingEndTime, bookingOpenTime, useOpeningDay)

      const diff = startMs - now
      if (now >= endMs) {
        setCountdown("")
        setIsLive(false)
        return
      }
      if (diff <= 0) {
        setCountdown(language === "ar" ? "الآن" : "Now")
        setIsLive(true)
        return
      }
      setIsLive(false)
      const hrs = Math.floor(diff / 3600000)
      const mins = Math.floor((diff % 3600000) / 60000)
      const secs = Math.floor((diff % 60000) / 1000)
      if (language === "ar") {
        const p: string[] = []
        if (hrs > 0) p.push(`${hrs} س`)
        if (mins > 0) p.push(`${mins} د`)
        p.push(`${secs} ث`)
        setCountdown(p.join(" "))
      } else {
        setCountdown(`${hrs}h ${mins}m ${secs}s`)
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [booking, booking.date, booking.startTime, bookingEndTime, bookingOpenTime, language])

  if (!countdown) return null
  return (
    <Badge
      variant="secondary"
      className={cn(
        "rounded-full border font-mono transition-colors",
        isLive
          ? "bg-emerald-500/12 border-emerald-500/25 text-emerald-700 dark:bg-emerald-500/15 dark:border-emerald-400/30 dark:text-emerald-300"
          : "bg-emerald-500/8 border-emerald-500/20 text-emerald-700 dark:bg-emerald-500/10 dark:border-emerald-400/25 dark:text-emerald-300",
      )}
    >
      <Clock className={cn("h-3.5 w-3.5 me-1.5", isLive && "animate-pulse")} />
      {countdown}
    </Badge>
  )
}

function hasAttendanceRecord(booking: {
  status?: string
  checkInVerified?: boolean
  checkedIn?: boolean
  checkedInAt?: string | Date | null
} | null | undefined) {
  return Boolean(
    booking?.status === "completed" ||
      booking?.checkInVerified === true ||
      booking?.checkedIn === true ||
      booking?.checkedInAt,
  )
}

function getBookingStatusMeta(
  booking:
    | {
        status?: string
        checkInVerified?: boolean
        checkedIn?: boolean
        checkedInAt?: string | Date | null
      }
    | null
    | undefined,
  language: string,
) {
  if (booking?.status === "no_show") {
    return {
      badgeClassName: "bg-destructive/80",
      label: language === "ar" ? "لم يحضر" : "Missed booking",
    }
  }

  if (booking?.status === "completed") {
    return {
      badgeClassName: "bg-info/80",
      label: language === "ar" ? "مكتمل" : "Completed",
    }
  }

  if (hasAttendanceRecord(booking)) {
    return {
      badgeClassName: "bg-success/80",
      label: language === "ar" ? "تم الحضور" : "Checked In",
    }
  }

  if (booking?.status === "cancelled") {
    return {
      badgeClassName: "bg-destructive/80",
      label: language === "ar" ? "ملغي" : "Cancelled",
    }
  }

  if (normalizeBookingStatus(booking?.status) === "confirmed") {
    return {
      badgeClassName: "bg-success/80",
      label: language === "ar" ? "مؤكد" : "Confirmed",
    }
  }

  return {
    badgeClassName: "bg-success/80",
    label: language === "ar" ? "مؤكد" : "Confirmed",
  }
}

/* ----------------------------- Small UI helpers ---------------------------- */

function SectionHeader({
  title,
  description,
  icon: Icon,
  action,
}: {
  title: string
  description?: string
  icon?: any
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon ? (
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
          ) : null}
          <h2 className="text-lg font-extrabold text-foreground truncate">{title}</h2>
        </div>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function SoftDivider() {
  return <div className="h-px w-full bg-linear-to-r from-transparent via-border/60 to-transparent" />
}





/* ----------------------------- KPI card ----------------------------- */

 

/* ----------------------------- Recommended court ----------------------------- */

function RecommendedCourtCard({ court, language }: { court: any; language: string }) {
  const [isLiked, setIsLiked] = useState(false)

  return (
    <Link href={`/dashboard/player/browse/${court.id}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted transition-all duration-700 border-2 border-border/50 group-hover:border-primary/45 shadow-lg group-hover:shadow-glow-sm hover-lift">
        <Image
          src={court.images[0] || `/placeholder.svg?height=300&width=400&query=sports court ${court.sportType || ""} professional`}
          alt={language === "ar" ? court.name : court.nameEn}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 300px"
          className="object-cover transition-transform duration-700 group-hover:scale-110"
        />

        <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/45 to-transparent" />
        <div className="absolute inset-0 bg-linear-to-tr from-primary/22 via-transparent to-info/18 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        <Badge className="absolute top-4 start-4 bg-primary/95 text-primary-foreground border-0 backdrop-blur-md shadow-lg font-semibold">
          {language === "ar" ? (sportTypes[court.sportType]?.ar || court.sportType) : (sportTypes[court.sportType]?.en || court.sportType)}
        </Badge>

        {court.rating >= 4.8 && (
          <Badge className="absolute top-4 start-24 bg-linear-to-r from-gold/95 to-gold/80 text-gold-foreground border-0 backdrop-blur-md shadow-lg font-semibold">
            <Crown className="h-3.5 w-3.5 me-1.5" />
            {language === "ar" ? "مميز" : "Premium"}
          </Badge>
        )}

        <button
          aria-label={language === "ar" ? "إضافة للمفضلة" : "Add to favorites"}
          className={cn(
            "absolute top-4 end-4 h-11 w-11 rounded-xl md:backdrop-blur-xl border border-white/20 flex items-center justify-center transition-all duration-300 hover:scale-110 hover:shadow-lg",
            isLiked ? "bg-red-500 text-white border-red-400" : "bg-white/15 text-white hover:bg-white/25",
          )}
          onClick={(e) => {
            e.preventDefault()
            setIsLiked((v) => !v)
          }}
        >
          <Heart className={cn("h-5 w-5 transition-all duration-300", isLiked && "fill-current scale-110")} />
        </button>

        <div className="absolute bottom-0 inset-x-0 p-5">
          <h4 className="font-extrabold text-white truncate text-xl drop-shadow-lg">
            {language === "ar" ? court.name : court.nameEn}
          </h4>

          <div className="mt-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-white/90 text-sm font-medium">
              <MapPin className="h-4 w-4" />
              {language === "ar" ? court.city : court.cityEn}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-2xl font-extrabold text-white drop-shadow-lg">
              {court.offPeakPrice}{" "}
              <span className="text-sm font-normal text-white/80">{language === "ar" ? "ج.م" : "EGP"}</span>
            </span>

            <Button size="sm" className="rounded-xl shadow-glow-sm hover:shadow-glow hover:scale-105 transition-all duration-300 font-semibold">
              {language === "ar" ? "احجز الآن" : "Book Now"}
            </Button>
          </div>
        </div>
      </div>
    </Link>
  )
}

/* ----------------------------- Booking Timer ----------------------------- */

function BookingTimer({ booking, language, hasAttendance }: { booking: any; language: string; hasAttendance: boolean }) {
  const [timeLeft, setTimeLeft] = useState<string>("");
  const [isLiveNow, setIsLiveNow] = useState(false);
  const [isMissed, setIsMissed] = useState(false);

  useEffect(() => {
    if (!booking.date || !booking.startTime) return;
    const bookingEndTime = booking.endTime || "23:59";
    const bookingOpenTime = booking.sessionOpenTime || booking.court?.openTime || booking.courtOpenTime || "08:00";
    
    const tick = () => {
      const now = Date.now();
      const useOpeningDay = booking.useOpeningDayForOvernightBookings === true;
      const { startMs, endMs } = getAbsoluteBookingTimes(booking.date, booking.startTime, bookingEndTime, bookingOpenTime, useOpeningDay);
      
      const diff = startMs - now;
      
      if (now > endMs) {
        setIsMissed(booking.status === "confirmed" && !hasAttendance);
        setTimeLeft("");
        setIsLiveNow(false);
        return;
      }
      setIsMissed(false);
      if (diff <= 0) {
        setTimeLeft(language === "ar" ? "الآن" : "Now");
        setIsLiveNow(true);
        return;
      }
      setIsLiveNow(false);
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      
      if (hrs >= 24) {
        const days = Math.floor(hrs / 24);
        setTimeLeft(language === "ar" ? `${days} يوم` : `${days}d`);
      } else if (language === "ar") {
        const p: string[] = [];
        if (hrs > 0) p.push(`${hrs} س`);
        if (mins > 0) p.push(`${mins} د`);
        p.push(`${secs} ث`);
        setTimeLeft(p.join(" "));
      } else {
        setTimeLeft(`${hrs}h ${mins}m ${secs}s`);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [booking.date, booking.startTime, booking.status, booking.endTime, booking.sessionOpenTime, booking.court?.openTime, booking.courtOpenTime, booking.useOpeningDayForOvernightBookings, hasAttendance, language]);

  if (!timeLeft || isMissed || hasAttendance) return null;

  return (
    <div className={cn(
      "shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 border transition-all duration-500",
      isLiveNow
        ? "bg-emerald-500/12 text-emerald-700 border-emerald-500/25 group-hover:bg-emerald-500/16 group-hover:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-400/30"
        : booking.status === "confirmed"
          ? "bg-emerald-500/8 text-emerald-700 border-emerald-500/18 group-hover:bg-emerald-500/12 group-hover:border-emerald-500/28 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-400/22"
          : "bg-muted/50 text-muted-foreground border-border/50"
    )}>
      <Clock className={cn("h-3.5 w-3.5", isLiveNow && "animate-pulse")} />
      <span className="text-xs font-black font-mono tracking-tight">{timeLeft}</span>
    </div>
  );
}

/* ----------------------------- Booking card ----------------------------- */

function UpcomingBookingCard({
  booking,
  language,
  onClick,
  imagePriority = false,
}: {
  booking: any
  language: string
  onClick?: () => void
  imagePriority?: boolean
}) {
  const courtName = language === "ar" ? (booking.courtName || "Unknown Court") : (booking.courtNameEn || booking.courtName || "Unknown Court");
  const imageUrl = booking.court?.images?.[0] || booking.courtImage || booking.images?.[0] || `/placeholder.svg?height=112&width=112&query=sports court`;
  const bookingEndTime = booking.endTime || "23:59";
  const bookingOpenTime = booking.sessionOpenTime || booking.court?.openTime || booking.courtOpenTime || "08:00";
  
  const [isMissed, setIsMissed] = useState(false);
  const [copied, setCopied] = useState(false);
  const hasAttendance = hasAttendanceRecord(booking)
  const isCompleted = booking.status === "completed"
  const isNoShow = booking.status === "no_show"
  
  useEffect(() => {
    if (!booking.date || !booking.startTime) return;
    const checkMissed = () => {
      const now = Date.now();
      const useOpeningDay = booking.useOpeningDayForOvernightBookings === true;
      const { endMs } = getAbsoluteBookingTimes(booking.date, booking.startTime, bookingEndTime, bookingOpenTime, useOpeningDay);
      
      if (now > endMs) {
        setIsMissed(booking.status === "confirmed" && !hasAttendance);
      } else {
        setIsMissed(false);
      }
    };
    checkMissed();
    const id = setInterval(checkMissed, 60000); // Check every minute instead of every second
    return () => clearInterval(id);
  }, [booking.date, booking.startTime, booking.status, bookingEndTime, bookingOpenTime, booking.useOpeningDayForOvernightBookings, hasAttendance]);

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (booking.checkInCode) {
      navigator.clipboard.writeText(booking.checkInCode);
      setCopied(true);
      toast.success(language === "ar" ? "تم نسخ الكود" : "Code copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Card 
      onClick={onClick}
      className="group overflow-hidden bg-card transition-all duration-300 hover:shadow-lg hover:border-primary/30 cursor-pointer rounded-2xl border border-border/50"
    >
      <div className="p-4 flex flex-col sm:flex-row gap-5 md:gap-6">
        {/* Left Side: Image & Status */}
        <div className="relative w-full sm:w-48 md:w-56 aspect-[16/9] sm:aspect-[4/3] shrink-0 overflow-hidden rounded-xl bg-muted border border-border/50">
          <Image
            src={imageUrl}
            alt={courtName}
            fill
            loading={imagePriority ? "eager" : "lazy"}
            fetchPriority={imagePriority ? "high" : undefined}
            sizes="(max-width: 640px) 100vw, (max-width: 768px) 192px, 224px"
            className="object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-80" />
          
          <div className="absolute bottom-2 start-2">
            {isCompleted ? (
              <Badge className="bg-info/90 text-white border-0 shadow-sm px-2 py-0.5 text-[10px] font-semibold">
                 <CheckCircle2 className="w-3 h-3 me-1.5" />
                 {language === "ar" ? "مكتمل" : "Completed"}
              </Badge>
            ) : hasAttendance ? (
              <Badge className="bg-success/90 text-white border-0 shadow-sm px-2 py-0.5 text-[10px] font-semibold">
                 <CheckCircle2 className="w-3 h-3 me-1.5" />
                 {language === "ar" ? "تم الحضور" : "In"}
              </Badge>
            ) : isNoShow || isMissed ? (
              <Badge variant="destructive" className="border-0 shadow-sm px-2 py-0.5 text-[10px] font-semibold">
                 {language === "ar" ? "لم يحضر" : "Missed booking"}
              </Badge>
            ) : booking.status === "confirmed" ? (
              <Badge className="bg-primary/90 text-white border-0 shadow-sm px-2 py-0.5 text-[10px] font-semibold">
                 {language === "ar" ? "مؤكد" : "Confirmed"}
              </Badge>
            ) : (
              <Badge variant="secondary" className="border-0 shadow-sm px-2 py-0.5 text-[10px] font-semibold">
                 {booking.status}
              </Badge>
            )}
          </div>
        </div>

        {/* Right Side: Details */}
        <div className="flex-1 flex flex-col justify-between min-w-0 py-0.5">
          <div>
            <div className="flex justify-between items-start gap-4">
              <div className="min-w-0">
                <h4 className="font-bold text-lg text-foreground truncate transition-colors group-hover:text-primary">
                  {courtName}
                </h4>
                <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  <span className="text-sm truncate">{booking.court?.city || booking.courtCity || (language === "ar" ? "موقع الملعب" : "Location")}</span>
                </div>
              </div>
              
              <BookingTimer booking={booking} language={language} hasAttendance={hasAttendance} />
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-foreground/80 font-medium">
              <div className="flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4 text-primary/70" />
                <span>
                  {new Date(booking.date + "T00:00:00").toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary/70" />
                <span className="font-mono tracking-tight mt-0.5">
                  {format12h(booking.startTime, language as "ar" | "en")} - {format12h(booking.endTime, language as "ar" | "en")}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border/50">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold text-foreground">{Number(booking.totalPrice ?? booking.amount ?? 0)}</span>
              <span className="text-xs font-medium text-muted-foreground">{language === "ar" ? "ج.م" : "EGP"}</span>
            </div>

            {booking.status === "confirmed" && !hasAttendance && (
               booking.checkInCode ? (
                 <div className="flex items-center gap-2 bg-primary/5 rounded-xl px-3 py-1.5 border border-primary/10 transition-colors hover:bg-primary/10" onClick={(e) => e.stopPropagation()}>
                   <span className="text-[10px] font-bold text-primary/70 uppercase tracking-widest">{language === "ar" ? "الكود" : "Code"}</span>
                   <span className="font-mono text-lg font-bold tracking-widest text-primary">{booking.checkInCode}</span>
                   <Button
                     size="icon"
                     variant="ghost"
                     className="h-7 w-7 rounded-lg text-primary hover:bg-primary/10 -me-1"
                     onClick={handleCopyCode}
                     title={language === "ar" ? "نسخ الكود" : "Copy Code"}
                   >
                     {copied ? <Check className="h-3.5 w-3.5 text-success animate-in zoom-in" /> : <Copy className="h-3.5 w-3.5" />}
                   </Button>
                 </div>
               ) : (
                 <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-600">
                   <CreditCard className="h-3.5 w-3.5" />
                   <span className="text-xs font-medium">
                     {language === "ar" ? "في انتظار الدفع" : "Pending Payment"}
                   </span>
                 </div>
               )
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}



/* ----------------------------- Extra: Achievements ----------------------------- */

function AchievementsCard({
  language,
  level,
  progress,
  streak,
  goalText,
}: {
  language: string
  level: number
  progress: number
  streak: number
  goalText: string
}) {
  return (
    <Card className="relative overflow-hidden border-2 border-border/50 bg-card/60 md:backdrop-blur-xl hover:border-primary/35 hover:shadow-lg transition-all duration-700">
      <div className="absolute -top-16 -start-16 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,var(--primary)_0%,transparent_60%)] opacity-20 pointer-events-none" />
      <div className="absolute -bottom-16 -end-16 h-64 w-64 rounded-full bg-[radial-gradient(circle_at_center,var(--warning)_0%,transparent_60%)] opacity-15 pointer-events-none" />

      <CardHeader className="pb-3">
        <SectionHeader
          title={language === "ar" ? "إنجازاتك" : "Your Achievements"}
          description={language === "ar" ? "مؤشرات تحفيزية لتقدمك" : "Motivating indicators for your progress"}
          icon={Trophy}
        />
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Flame className="h-4 w-4 text-warning" />
              {language === "ar" ? "سلسلة" : "Streak"}
            </div>
            <div className="mt-2 text-2xl font-extrabold text-foreground">{streak}d</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Target className="h-4 w-4 text-primary" />
              {language === "ar" ? "المستوى" : "Level"}
            </div>
            <div className="mt-2 text-2xl font-extrabold text-foreground">{level}</div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              {language === "ar" ? "الهدف" : "Goal"}
            </div>
            <div className="mt-2 text-sm font-bold text-foreground leading-tight">{goalText}</div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-foreground">{language === "ar" ? "التقدم للمستوى التالي" : "Progress to next level"}</span>
            <span className="text-muted-foreground font-semibold">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="mt-3 h-2.5" />
          <p className="mt-2 text-xs text-muted-foreground">
            {language === "ar" ? "استمر في اللعب لتحصل على مزايا أكثر." : "Keep playing to unlock more benefits."}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

/* ----------------------------- Main dashboard ----------------------------- */

export function PlayerDashboard() {
  const { language, direction } = useLanguage()
  const { user, refreshUser } = useAuth()
  const isMobile = useIsMobile()
  const safeRefreshUser = useCallback(async () => {
    if (typeof refreshUser !== "function") return null
    return refreshUser().catch(() => null)
  }, [refreshUser])

  const [bookings, setBookingsState] = useState<any[]>([])
  const [activeHoldBooking, setActiveHoldBooking] = useState<any | null>(null)
  const [favoriteCount, setFavoriteCount] = useState<number | null>(null)
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null)
  const [qrDialogOpen, setQrDialogOpen] = useState(false)
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false)
  const [upPage, setUpPage] = useState(0)
  const pageSize = 3
  const [upcomingTotalPages, setUpcomingTotalPages] = useState(1)

  const ArrowIcon = direction === "rtl" ? ArrowLeft : ArrowRight

  const loadPendingHoldsFromApi = useCallback(async () => {
    try {
      const res = await listBookingsApi({
        mine: true,
        status: "pending" as any,
        limit: 5,
      })
      const now = Date.now()
      const activeHold = (res.items || []).find(
        (b) => b.expiresAt && new Date(b.expiresAt).getTime() > now,
      )
      setActiveHoldBooking(activeHold || null)
    } catch {
      setActiveHoldBooking(null)
    }
  }, [])

  const loadBookingsFromApi = useCallback(async () => {
    try {
      const res = await listBookingsApi({
        mine: true,
        status: "confirmed",
        bucket: "upcoming",
        sortBy: "date",
        order: "asc",
        page: upPage + 1,
        limit: pageSize,
      })
      setBookingsState(Array.isArray(res.items) ? res.items : [])
      setUpcomingTotalPages(Math.max(1, Number(res.pages || 1)))
    } catch (e) {
      console.error(e)
      setBookingsState([])
      setUpcomingTotalPages(1)
    }
  }, [pageSize, upPage])

  const loadFavoritesFromApi = useCallback(async () => {
    try {
      const res = await getFavoritesApi()
      setFavoriteCount(Array.isArray(res.items) ? res.items.length : 0)
    } catch {
      setFavoriteCount(null)
    }
  }, [])

  const handleCancelBooking = async (bookingId: string) => {
    try {
      await cancelBookingApi(bookingId, { lang: language })
      await Promise.all([loadBookingsFromApi(), loadPendingHoldsFromApi(), safeRefreshUser()])
      toast.success(language === "ar" ? "تم إلغاء الحجز" : "Booking cancelled")
      setDetailsDialogOpen(false)
    } catch (error: any) {
      toast.error(error?.message || (language === "ar" ? "فشل إلغاء الحجز" : "Failed to cancel booking"))
    }
  }

  useEffect(() => {
    void Promise.all([
      loadBookingsFromApi(),
      loadPendingHoldsFromApi(),
      loadFavoritesFromApi(),
      safeRefreshUser(),
    ])
  }, [loadBookingsFromApi, loadPendingHoldsFromApi, loadFavoritesFromApi, safeRefreshUser])

  const upcomingBookings = bookings
  const totalPages = upcomingTotalPages
  const MathMax = Math.max
  const currentPage = MathMax(0, Math.min(upPage, totalPages - 1))
  const upcomingSlice = upcomingBookings
  const PrevIcon = ArrowLeft
  const NextIcon = ArrowRight
  const prevLabel = language === "ar" ? "السابق" : "Prev"
  const nextLabel = language === "ar" ? "التالي" : "Next"

  const fallbackCompletedBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.status === "completed" &&
          (b.checkInVerified === true || Boolean(b.checkedInAt)),
      ).length,
    [bookings],
  )

  const dashboardStats = useMemo(
    () => ({
      totalBookings: user?.stats?.totalBookings ?? bookings.length,
      completedBookings:
        user?.stats?.completedBookings ?? fallbackCompletedBookings,
      upcomingBookings: user?.stats?.upcomingBookings ?? upcomingBookings.length,
      favoriteCourts: favoriteCount ?? user?.stats?.favoriteCourts ?? 0,
    }),
    [bookings.length, fallbackCompletedBookings, favoriteCount, upcomingBookings.length, user?.stats],
  )

  const nextBooking = upcomingBookings[0]

  return (
    <PageTransition>
    <div className="space-y-8 sm:space-y-6">
      {/* Active Reservation Hold Alert Banner */}
      {activeHoldBooking && (
        <AnimatedContainer animation="slide-up" delay={0.02}>
          <Card className="border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-amber-500/10 shadow-lg shadow-amber-500/5 overflow-hidden">
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="h-11 w-11 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 animate-pulse">
                  <Timer className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm sm:text-base text-foreground truncate">
                      {language === "ar"
                        ? activeHoldBooking.courtName
                        : activeHoldBooking.courtNameEn || activeHoldBooking.courtName}
                    </span>
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-amber-700 dark:text-amber-300 bg-amber-500/10 text-xs font-mono"
                    >
                      {language === "ar" ? "حجز مؤقت بانتظار الدفع" : "Hold Awaiting Payment"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {language === "ar"
                      ? "الملعب محجوز حصرياً لك الآن، يرجى إتمام الدفع قبل انتهاء صلاحية النافذة."
                      : "The court is held exclusively for you. Complete payment before the window expires."}
                  </p>
                </div>
              </div>

              <Button
                asChild
                className="shrink-0 bg-amber-600 hover:bg-amber-700 text-white font-semibold gap-1.5 shadow-md w-full sm:w-auto"
              >
                <Link href={`/dashboard/player/bookings/${activeHoldBooking.id}/hold`}>
                  <CreditCard className="h-4 w-4" />
                  {language === "ar" ? "إتمام الدفع الآن" : "Complete Payment Now"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </AnimatedContainer>
      )}

      {/* Hero / Top header */}
      <AnimatedContainer animation="slide-up" delay={0.05}>
        <Card className="relative overflow-hidden border-2 border-border/50 bg-card/90 sm:bg-card/55 sm:backdrop-blur-xl
">
          <div className="absolute -top-24 -end-24 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,var(--primary)_0%,transparent_60%)] opacity-20 pointer-events-none" />
          <div className="absolute -bottom-24 -start-24 h-96 w-96 rounded-full bg-[radial-gradient(circle_at_center,var(--info)_0%,transparent_60%)] opacity-15 pointer-events-none" />
          <div className="absolute inset-0 opacity-[0.03] [background-image:radial-gradient(#fff_1px,transparent_1px)] [background-size:24px_24px]" />
          <GridBackground />
          <NoiseTexture />
          <Spotlight />

          <CardContent className="relative p-6 md:p-7">
            <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">


                <h1 className="mt-3 text-3xl font-extrabold text-foreground">
                  {language === "ar" ? `مرحباً، ${user?.name || "لاعب"}` : `Welcome, ${user?.name || "Player"}`}
                </h1>

                <p className="mt-1 text-sm text-muted-foreground">
                  {language === "ar" ? "نظرة سريعة على حجوزاتك وتقدمك." : "A quick view of your bookings and progress."}
                </p>

                {nextBooking ? (
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-full bg-background/40 border border-border/60">
                      <CalendarDays className="h-3.5 w-3.5 me-1.5 text-primary" />
                      {language === "ar" ? "أقرب حجز" : "Next booking"}
                    </Badge>
                    <Badge variant="secondary" className="rounded-full bg-background/40 border border-border/60">
                      <Clock className="h-3.5 w-3.5 me-1.5 text-muted-foreground" />
                      {new Date(nextBooking.date + "T00:00:00").toLocaleDateString(language === "ar" ? "ar-EG" : "en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                      {language === "ar" ? " • " : " • "}
                      {format12h(nextBooking.startTime, language as "ar" | "en")}
                    </Badge>
                    {nextBooking && (
                      <CountdownBadge booking={nextBooking} language={language} />
                    )}
                  </div>
                ) : null}
              </div>

                <Button className="rounded-2xl shadow-glow-sm hover:shadow-glow transition-all" asChild>
                  <Link href="/dashboard/player/browse">
                    {language === "ar" ? "احجز ملعب الآن" : "Book a court"}
                    <ArrowIcon className="ms-2 h-4 w-4" />
                  </Link>
                </Button>
            </div>

            <div className="mt-6">
              <SoftDivider />
            </div>

            <div className="mt-6 grid gap-3 grid-cols-2 md:grid-cols-4">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 transition-all hover:shadow-glow-sm hover:scale-[1.01]">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <CalendarDays className="h-4 w-4 text-primary" />
                  {language === "ar" ? "إجمالي الحجوزات" : "Total bookings"}
                </div>
                <p className="mt-2 text-xl font-extrabold text-foreground">{dashboardStats.totalBookings}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {language === "ar" ? "كل الوقت" : "All time"}
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 transition-all hover:shadow-glow-sm hover:scale-[1.01]">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  {language === "ar" ? "الحجوزات المكتملة" : "Completed bookings"}
                </div>
                <p className="mt-2 text-xl font-extrabold text-foreground">{dashboardStats.completedBookings}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {language === "ar" ? "كل الوقت" : "All time"}
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 transition-all hover:shadow-glow-sm hover:scale-[1.01]">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Calendar className="h-4 w-4 text-primary" />
                  {language === "ar" ? "الحجوزات القادمة" : "Upcoming bookings"}
                </div>
                <p className="mt-2 text-xl font-extrabold text-foreground">
                  {dashboardStats.upcomingBookings}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {language === "ar" ? "قبل تسجيل الحضور" : "Before check-in"}
                </p>
              </div>

              <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 transition-all hover:shadow-glow-sm hover:scale-[1.01]">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <Heart className="h-4 w-4 text-primary" />
                  {language === "ar" ? "المفضلة" : "Favorites"}
                </div>
                <p className="mt-2 text-xl font-extrabold text-foreground">{dashboardStats.favoriteCourts}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {language === "ar" ? "ملاعب محفوظة" : "Saved courts"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </AnimatedContainer>



        <AnimatedContainer animation="slide-up" delay={0.4}>
          <Card className="border-2 border-border/50 bg-card/90 sm:bg-card/55 sm:backdrop-blur-xl">
            <CardHeader>
              <SectionHeader
                title={language === "ar" ? "الحجوزات القادمة" : "Upcoming Bookings"}
                description={language === "ar" ? "حجوزاتك المقبلة" : "Your scheduled bookings"}
                icon={CalendarDays}

              />
            </CardHeader>
            <CardContent>
              {upcomingSlice.length > 0 ? (
                <>
                  <div className="space-y-3 sm:space-y-4">
                  {upcomingSlice.map((booking, idx) => (
                    <AnimatedContainer key={booking.id} animation="slide-up" delay={0.05 + idx * 0.05}>
                     <UpcomingBookingCard
                        booking={booking}
                        language={language}
                        onClick={() => {
                          setSelectedBooking(booking)
                          setDetailsDialogOpen(true)
                        }}
                        imagePriority={idx === 0}
                      />
                    </AnimatedContainer>
                  ))}
                </div>
                {totalPages > 1 && (
                  <div className="mt-8 flex items-center justify-center">
                    <div className="flex items-center gap-2 sm:gap-4 rounded-full bg-muted/30 p-1.5 border border-border/50 backdrop-blur-md shadow-sm">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full h-10 w-10 hover:bg-background hover:shadow-sm disabled:opacity-30 transition-all"
                        title={prevLabel}
                        aria-label={prevLabel}
                        onClick={() => setUpPage(Math.max(0, currentPage - 1))}
                        disabled={currentPage === 0}
                      >
                        <PrevIcon className="h-5 w-5 text-foreground rtl:rotate-180" />
                      </Button>
                      
                      <div className="text-sm font-extrabold text-foreground min-w-[4rem] text-center" dir="ltr">
                        {currentPage + 1} <span className="text-muted-foreground font-semibold">/ {totalPages}</span>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full h-10 w-10 hover:bg-background hover:shadow-sm disabled:opacity-30 transition-all"
                        title={nextLabel}
                        aria-label={nextLabel}
                        onClick={() => setUpPage(Math.min(totalPages - 1, currentPage + 1))}
                        disabled={currentPage >= totalPages - 1}
                      >
                        <NextIcon className="h-5 w-5 text-foreground rtl:rotate-180" />
                      </Button>
                    </div>
                  </div>
                )}
                </>
              ) : (
                <div className="text-center py-10">
                  <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                  <p className="text-muted-foreground">{language === "ar" ? "لا توجد حجوزات قادمة" : "No upcoming bookings"}</p>
                  <Button className="mt-4 rounded-2xl" asChild>
                    <Link href="/dashboard/player/browse">{language === "ar" ? "احجز الآن" : "Book Now"}</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </AnimatedContainer>



      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-sm rounded-[2rem] border-border/60 p-0 shadow-2xl">
          {selectedBooking ? (
            <CheckInCodeDialogContent
              booking={selectedBooking}
              language={language as "ar" | "en"}
              onClose={() => setQrDialogOpen(false)}
              onCopy={(code) => {
                navigator.clipboard.writeText(code)
                toast.success(language === "ar" ? "تم نسخ الكود" : "Code copied to clipboard")
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {/* --- DETAILS DIALOG --- */}
      {/* --- ENHANCED DETAILS DIALOG --- */}
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-[2rem] border-0 shadow-2xl">
          {/* Hidden title for screen reader accessibility */}
          <DialogTitle className="sr-only">{language === "ar" ? "تفاصيل الحجز" : "Booking Details"}</DialogTitle>
          
          {selectedBooking && (
            <>
              {/* Header Image Area */}
              <div className="relative h-48 w-full bg-muted">
                <Image
                  src={selectedBooking.court?.images?.[0] || selectedBooking.courtImage || selectedBooking.images?.[0] || `/placeholder.svg?height=300&width=600&query=sports court`}
                  alt="Court"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                
                <div className="absolute top-4 end-4">
                  <Badge 
                    className={cn(
                      "backdrop-blur-md border-white/20 shadow-lg text-white font-semibold px-3 py-1",
                      getBookingStatusMeta(selectedBooking, language).badgeClassName,
                    )}
                  >
                    {getBookingStatusMeta(selectedBooking, language).label}
                  </Badge>
                </div>

                <div className="absolute bottom-5 start-5 end-5">
                  <h3 className="text-2xl font-extrabold text-white drop-shadow-lg truncate">
                    {language === "ar" ? selectedBooking.courtName : (selectedBooking.courtNameEn || selectedBooking.courtName)}
                  </h3>
                  <div className="flex items-center gap-2 mt-1.5 text-white/90 text-sm font-medium">
                    <MapPin className="h-4 w-4 text-primary" />
                    {language === "ar" ? (selectedBooking.courtCity || "موقع الملعب") : (selectedBooking.courtCityEn || "Court Location")}
                  </div>
                </div>
              </div>

              {/* Content Area */}
              <div className="px-6 py-6 flex flex-col gap-4 bg-card">
                
                {/* Date & Time Row */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-border/50 bg-muted/10">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <CalendarDays className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">{language === "ar" ? "التاريخ" : "Date"}</p>
                      <p className="text-sm font-semibold whitespace-nowrap">{selectedBooking.date}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 border-s border-border/50 ps-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                      <Clock className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">{language === "ar" ? "الوقت" : "Time"}</p>
                      <p className="text-sm font-bold tracking-tight whitespace-nowrap font-mono" dir="ltr">
                        {format12h(selectedBooking.startTime, language as "ar" | "en")} - {format12h(selectedBooking.endTime, language as "ar" | "en")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Price Row */}
                <div className="flex items-center justify-between p-4 rounded-xl border border-border/50 bg-muted/10">
                  <div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-0.5">{language === "ar" ? "إجمالي المبلغ" : "Total Price"}</p>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-foreground">{Number(selectedBooking.totalPrice ?? selectedBooking.amount ?? 0)}</span>
                      <span className="text-xs font-medium text-muted-foreground">{language === "ar" ? "ج.م" : "EGP"}</span>
                    </div>
                  </div>
                  
                  <div className="text-end">
                    <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mb-1.5">{language === "ar" ? "الحالة" : "Status"}</p>
                    {selectedBooking.status === "completed" ? (
                      <Badge className="bg-info/90 text-white border-0 shadow-sm px-2 py-0.5 font-semibold">
                         <CheckCircle2 className="w-3.5 h-3.5 me-1.5" /> {language === "ar" ? "مكتمل" : "Completed"}
                      </Badge>
                    ) : selectedBooking.status === "no_show" ? (
                      <Badge variant="destructive" className="border-0 shadow-sm px-2 py-0.5 font-semibold">
                         <Clock className="w-3.5 h-3.5 me-1.5" /> {language === "ar" ? "لم يحضر" : "Missed"}
                      </Badge>
                    ) : hasAttendanceRecord(selectedBooking) ? (
                      <Badge className="bg-success/90 text-white border-0 shadow-sm px-2 py-0.5 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5 me-1.5" /> {language === "ar" ? "تم الحضور" : "Checked In"}
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="border-0 shadow-sm px-2 py-0.5 font-semibold">
                        <Clock className="w-3.5 h-3.5 me-1.5" /> {language === "ar" ? "مؤكد" : "Confirmed"}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Code Row */}
                {selectedBooking.checkInCode && !hasAttendanceRecord(selectedBooking) && selectedBooking.status === "confirmed" && (
                  <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <div>
                      <p className="text-[10px] text-primary/80 font-bold uppercase tracking-widest mb-1">{language === "ar" ? "كود الدخول" : "Entry Code"}</p>
                      <p className="font-mono text-2xl font-bold tracking-widest text-primary">{selectedBooking.checkInCode}</p>
                    </div>
                    <Button 
                      variant="outline"
                      className="rounded-lg shadow-sm bg-background border-primary/20 text-primary hover:bg-primary/10 transition-colors"
                      onClick={() => {
                        setDetailsDialogOpen(false);
                        setTimeout(() => setQrDialogOpen(true), 150);
                      }}
                    >
                      <Copy className="h-4 w-4 me-2" />
                      {language === "ar" ? "الكود" : "Code"}
                    </Button>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 pb-6 pt-2 bg-card space-y-2">
                {(() => {
                  const openTime = selectedBooking.sessionOpenTime || selectedBooking.courtOpenTime || "08:00";
                  const useOpeningDay = selectedBooking.useOpeningDayForOvernightBookings === true;
                  const { startMs } = getAbsoluteBookingTimes(selectedBooking.date, selectedBooking.startTime, selectedBooking.endTime || "23:59", openTime, useOpeningDay);

                  const cancelDeadline = new Date(startMs - PLAYER_BOOKING_CHANGE_WINDOW_MS);
                  const now = Date.now();
                  const canCancel = selectedBooking.status === "confirmed" && now < cancelDeadline.getTime();

                  return canCancel && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" className="w-full rounded-2xl h-12 text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20 font-bold transition-colors">
                          {language === "ar" ? "إلغاء الحجز" : "Cancel Booking"}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{language === "ar" ? "إلغاء الحجز" : "Cancel Booking"}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {language === "ar" ? "هل أنت متأكد من رغبتك في إلغاء هذا الحجز؟" : "Are you sure you want to cancel this booking?"}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel className="rounded-lg">{language === "ar" ? "تراجع" : "Go Back"}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleCancelBooking(selectedBooking.id)} className="rounded-lg bg-red-500 hover:bg-red-600">
                            {language === "ar" ? "تأكيد الإلغاء" : "Confirm Cancel"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  );
                })()}

                 <Button variant="outline" className="w-full rounded-2xl h-12 border-border/60 hover:bg-muted/50 font-bold" onClick={() => setDetailsDialogOpen(false)}>
                   {language === "ar" ? "إغلاق التفاصيل" : "Close Details"}
                 </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
    </PageTransition>
  )
}
