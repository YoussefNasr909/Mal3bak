"use client"

import React, { useEffect, useState, useCallback, useRef } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  Timer,
  ShieldCheck,
  AlertTriangle,
  CreditCard,
  Smartphone,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  ExternalLink,
  Tag,
  Sparkles,
  Info,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { useLanguage } from "@/components/providers/language-provider"
import { getBookingHoldStatus, cancelBooking } from "@/lib/api"
import { PaymobWalletCheckout } from "@/components/checkout/PaymobWalletCheckout"
import type { BookingHoldStatus } from "@/lib/types"
import { format12h } from "@/lib/time"
import { cn } from "@/lib/utils"

interface ReservationHoldPageProps {
  bookingId: string
  initialCheckoutUrl?: string | null
}

const TOTAL_HOLD_DURATION_SECONDS = 15 * 60 // 15 minutes = 900 seconds

export function ReservationHoldPage({
  bookingId,
  initialCheckoutUrl,
}: ReservationHoldPageProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const checkoutUrlFromQuery = searchParams.get("checkoutUrl") || initialCheckoutUrl

  const { language, direction } = useLanguage()
  const isAr = language === "ar"
  const tr = useCallback((ar: string, en: string) => (language === "ar" ? ar : en), [language])
  const BackArrow = isAr ? ArrowRight : ArrowLeft

  const [holdData, setHoldData] = useState<BookingHoldStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(TOTAL_HOLD_DURATION_SECONDS)
  const [isExpired, setIsExpired] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isPaid, setIsPaid] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<"card" | "wallet">("card")

  const serverExpiresAtRef = useRef<number | null>(null)

  // Fetch initial hold status
  const fetchHoldStatus = useCallback(
    async (isBackground = false) => {
      try {
        if (!isBackground) setLoading(true)
        const data = await getBookingHoldStatus(bookingId)
        setHoldData(data)

        if (data.isPaid || data.status === "confirmed") {
          setIsPaid(true)
          setIsVerifying(false)
          setIsExpired(false)
          setRemainingSeconds(0)
          return
        }

        if (data.status === "verifying" || data.isVerifying) {
          // Hold TTL elapsed but a payment is in flight — the server is protecting the slot in a
          // grace window. Show a "confirming" state instead of prematurely expiring the UI.
          setIsVerifying(true)
          setIsExpired(false)
          setRemainingSeconds(0)
          return
        }

        if (data.isExpired || data.status === "cancelled" || data.status === "expired") {
          setIsExpired(true)
          setIsVerifying(false)
          setRemainingSeconds(0)
          return
        }

        if (data.expiresAt) {
          const expMs = new Date(data.expiresAt).getTime()
          serverExpiresAtRef.current = expMs
          const diffSec = Math.max(0, Math.floor((expMs - Date.now()) / 1000))
          setRemainingSeconds(diffSec)
          setIsVerifying(false)
          if (diffSec <= 0) {
            // Timer elapsed but the server still holds the slot — let polling resolve the outcome.
            setIsVerifying(true)
          }
        } else if (data.remainingSeconds != null) {
          setRemainingSeconds(data.remainingSeconds)
          serverExpiresAtRef.current = Date.now() + data.remainingSeconds * 1000
          setIsVerifying(false)
          if (data.remainingSeconds <= 0) {
            setIsVerifying(true)
          }
        }
      } catch (err: any) {
        if (!isBackground) {
          toast.error(
            err?.message || (language === "ar" ? "فشل تحميل بيانات حجز الملعب" : "Failed to load booking hold status"),
          )
        }
      } finally {
        if (!isBackground) setLoading(false)
      }
    },
    [bookingId, language],
  )

  // If there's no checkoutUrl it means the session was interrupted (tab/browser closed, internet
  // dropped). Auto-cancel the pending booking once we know it's still pending, then redirect the
  // player back to the court page so they can start fresh.
  useEffect(() => {
    if (checkoutUrlFromQuery) return // Normal flow — they have a live checkout URL, do nothing
    if (!holdData) return           // Haven't loaded yet

    // Only auto-cancel active pending holds — don't touch already-paid/cancelled/expired ones
    if (holdData.status !== "pending" || holdData.isPaid || holdData.isExpired) return

    let cancelled = false

    const autoCancelInterrupted = async () => {
      try {
        await cancelBooking(bookingId, { lang: language })
        if (cancelled) return
        toast.info(
          language === "ar"
            ? "تم إلغاء الحجز تلقائياً لأن جلسة الدفع انقطعت. يمكنك الحجز مجدداً."
            : "Your reservation was cancelled because the payment session was interrupted. You can book again.",
          { duration: 6000 },
        )
        const courtId = holdData.courtId
        router.replace(courtId ? `/dashboard/player/browse/${courtId}` : "/dashboard/player/browse")
      } catch {
        if (!cancelled) {
          // If cancel fails (e.g. already cancelled), just redirect to browse
          const courtId = holdData.courtId
          router.replace(courtId ? `/dashboard/player/browse/${courtId}` : "/dashboard/player/browse")
        }
      }
    }

    autoCancelInterrupted()
    return () => { cancelled = true }
  }, [checkoutUrlFromQuery, holdData, bookingId, language, router])

  // Initial load
  useEffect(() => {
    fetchHoldStatus()
  }, [fetchHoldStatus])

  // 1-second countdown ticker
  useEffect(() => {
    if (isPaid || isExpired || isVerifying) return

    const interval = setInterval(() => {
      if (serverExpiresAtRef.current) {
        const diffSec = Math.max(
          0,
          Math.floor((serverExpiresAtRef.current - Date.now()) / 1000),
        )
        setRemainingSeconds(diffSec)
        if (diffSec <= 0) {
          // Do NOT declare expiry on the client. Enter a "verifying" state and let the server
          // decide — it protects the slot in a grace window while an in-flight payment settles.
          setIsVerifying(true)
          clearInterval(interval)
          fetchHoldStatus(true)
        }
      } else {
        setRemainingSeconds((prev) => {
          if (prev <= 1) {
            setIsVerifying(true)
            clearInterval(interval)
            fetchHoldStatus(true)
            return 0
          }
          return prev - 1
        })
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [isPaid, isExpired, isVerifying, fetchHoldStatus])

  // Periodic status polling (every 4 seconds) to detect successful Paymob callback
  useEffect(() => {
    if (isPaid || isExpired) return

    const pollInterval = setInterval(() => {
      fetchHoldStatus(true)
    }, 4000)

    return () => clearInterval(pollInterval)
  }, [isPaid, isExpired, fetchHoldStatus])

  // Handle Cancel
  const handleCancelHold = async () => {
    try {
      setIsCancelling(true)
      await cancelBooking(bookingId, { lang: language })
      toast.success(
        tr("تم إلغاء حجز الملعب المؤقت وإتاحته للجميع", "Reservation hold cancelled successfully"),
      )
      setIsExpired(true)
      setRemainingSeconds(0)
    } catch (err: any) {
      toast.error(err?.message || tr("فشل إلغاء الحجز", "Failed to cancel hold"))
    } finally {
      setIsCancelling(false)
    }
  }

  // Handle Pay Action — checkoutUrl is always present at this point (no-URL case is auto-cancelled above)
  const handleProceedToPayment = () => {
    if (checkoutUrlFromQuery) {
      window.location.href = checkoutUrlFromQuery
    }
  }

  // Formatting helpers
  const minutes = Math.floor(remainingSeconds / 60)
  const seconds = remainingSeconds % 60
  const formattedTime = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`

  const progressPercent = Math.min(
    100,
    Math.max(0, (remainingSeconds / TOTAL_HOLD_DURATION_SECONDS) * 100),
  )

  const isUrgent = remainingSeconds > 0 && remainingSeconds <= 120 // less than 2 min

  const courtName = isAr
    ? holdData?.courtName || tr("ملعب بادل", "Court")
    : holdData?.courtNameEn || holdData?.courtName || "Court"

  const courtLocation = isAr
    ? holdData?.courtLocation || tr("موقع الملعب", "Location")
    : holdData?.courtLocationEn || holdData?.courtLocation || "Location"

  if (loading && !holdData) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground font-medium">
          {tr("جاري التحقق من حالة حجز الملعب...", "Checking reservation hold status...")}
        </p>
      </div>
    )
  }

  // In-flight payment grace window: the hold timer elapsed but a payment is still settling with
  // Paymob. Never show an alarming "expired / money lost" screen here — the slot is protected.
  if (isVerifying && !isPaid && !isExpired) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center" dir={direction}>
        <div className="relative mb-5">
          <Loader2 className="h-14 w-14 animate-spin text-primary" />
          <ShieldCheck className="h-6 w-6 text-emerald-500 absolute inset-0 m-auto" />
        </div>
        <h2 className="text-xl font-bold mb-2">
          {tr("جارٍ تأكيد الدفع...", "Confirming your payment…")}
        </h2>
        <p className="text-muted-foreground max-w-md text-sm leading-relaxed">
          {tr(
            "انتهت المهلة المؤقتة، لكن لا تقلق — ملعبك محجوز بينما نتحقق من دفعتك مع بوابة الدفع. لا تغلق هذه الصفحة.",
            "The hold window elapsed, but don't worry — your slot is protected while we confirm your payment with the gateway. This can take a moment; please keep this page open.",
          )}
        </p>
      </div>
    )
  }

  return (
    <div className="container max-w-4xl mx-auto py-8 px-4 sm:px-6" dir={direction}>
      {/* Back Button / Navigation */}
      <div className="mb-6 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          asChild
          className="gap-2 text-muted-foreground hover:text-foreground"
        >
          <Link href="/dashboard/player/bookings">
            <BackArrow className="h-4 w-4" />
            {tr("العودة إلى حجوزاتي", "Back to My Bookings")}
          </Link>
        </Button>

        <Badge
          variant="outline"
          className={cn(
            "font-mono text-xs px-3 py-1 gap-1.5",
            isPaid
              ? "border-emerald-500/30 text-emerald-600 bg-emerald-500/10"
              : isExpired
                ? "border-destructive/30 text-destructive bg-destructive/10"
                : isUrgent
                  ? "border-amber-500/40 text-amber-600 bg-amber-500/10 animate-pulse"
                  : "border-primary/30 text-primary bg-primary/10",
          )}
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              isPaid
                ? "bg-emerald-500"
                : isExpired
                  ? "bg-destructive"
                  : isUrgent
                    ? "bg-amber-500"
                    : "bg-primary animate-ping",
            )}
          />
          {isPaid
            ? tr("تم تأكيد الدفع", "Paid & Confirmed")
            : isExpired
              ? tr("انتهت صلاحية الحجز", "Hold Expired")
              : tr("حجز مؤقت بانتظار الدفع", "Reserved - Awaiting Payment")}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT / TOP: Interactive Timer Card */}
        <div className="lg:col-span-6 space-y-6">
          <Card
            className={cn(
              "relative overflow-hidden border-2 transition-all duration-300 shadow-xl backdrop-blur",
              isPaid
                ? "border-emerald-500/30 bg-emerald-500/5 shadow-emerald-500/10"
                : isExpired
                  ? "border-destructive/30 bg-destructive/5 shadow-destructive/10"
                  : isUrgent
                    ? "border-amber-500/40 bg-amber-500/5 shadow-amber-500/10 ring-2 ring-amber-500/20"
                    : "border-primary/25 bg-card/90 shadow-primary/10",
            )}
          >
            {/* Background Glow Accents */}
            <div
              className={cn(
                "absolute -top-24 -right-24 h-48 w-48 rounded-full blur-3xl opacity-20 pointer-events-none",
                isPaid ? "bg-emerald-500" : isExpired ? "bg-destructive" : "bg-primary",
              )}
            />

            <CardHeader className="text-center pb-2">
              <CardTitle className="text-xl font-bold tracking-tight">
                {isPaid
                  ? tr("تم الدفع بنجاح!", "Payment Successful!")
                  : isExpired
                    ? tr("انتهت صلاحية نافذة الحجز", "Reservation Window Expired")
                    : tr("نافذة حجز الملعب المؤقتة", "Court Reservation Window")}
              </CardTitle>
              <CardDescription className="text-sm">
                {isPaid
                  ? tr("تم تأكيد حجزك رسمياً في النظام.", "Your court booking is officially confirmed.")
                  : isExpired
                    ? tr(
                        "تم تحرير الملعب وإتاحته لجميع المستخدمين الآخرين.",
                        "This court slot has been released back to the public.",
                      )
                    : tr(
                        "الملعب محجوز حصرياً لك الآن، يرجى إتمام الدفع قبل انتهاء الوقت.",
                        "The court is exclusively reserved for you. Complete payment before the timer expires.",
                      )}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex flex-col items-center justify-center pt-4 pb-8 space-y-6">
              {/* Circular Animated SVG Gauge */}
              <div className="relative flex items-center justify-center">
                <svg className="w-56 h-56 transform -rotate-90" viewBox="0 0 120 120">
                  {/* Background Circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className="text-muted/20"
                    strokeWidth="8"
                    stroke="currentColor"
                    fill="transparent"
                  />
                  {/* Animated Progress Circle */}
                  <circle
                    cx="60"
                    cy="60"
                    r="52"
                    className={cn(
                      "transition-all duration-1000 ease-linear",
                      isPaid
                        ? "text-emerald-500"
                        : isExpired
                          ? "text-destructive opacity-40"
                          : isUrgent
                            ? "text-amber-500 animate-pulse"
                            : "text-primary",
                    )}
                    strokeWidth="8"
                    strokeDasharray={326.72} // 2 * PI * 52
                    strokeDashoffset={
                      isPaid ? 0 : 326.72 * (1 - progressPercent / 100)
                    }
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                  />
                </svg>

                {/* Center Content */}
                <div className="absolute flex flex-col items-center justify-center text-center p-4">
                  {isPaid ? (
                    <>
                      <CheckCircle2 className="h-14 w-14 text-emerald-500 animate-bounce mb-2" />
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {tr("تم التأكيد", "CONFIRMED")}
                      </span>
                    </>
                  ) : isExpired ? (
                    <>
                      <XCircle className="h-14 w-14 text-destructive mb-2" />
                      <span className="text-xs font-semibold text-destructive">
                        {tr("انتهى الوقت", "EXPIRED")}
                      </span>
                    </>
                  ) : (
                    <>
                      <Timer
                        className={cn(
                          "h-6 w-6 mb-1",
                          isUrgent ? "text-amber-500 animate-spin" : "text-muted-foreground",
                        )}
                      />
                      <span
                        data-testid="countdown-timer-display"
                        className={cn(
                          "text-4xl font-extrabold font-mono tracking-tight",
                          isUrgent ? "text-amber-600 dark:text-amber-400 animate-pulse" : "text-foreground",
                        )}
                      >
                        {formattedTime}
                      </span>
                      <span className="text-[11px] text-muted-foreground font-medium mt-1">
                        {tr("متبقي للدفع", "Time Left to Pay")}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Status Notice / Banner */}
              {!isPaid && !isExpired && (
                <div
                  className={cn(
                    "w-full rounded-lg p-3 text-xs flex items-start gap-2.5 border",
                    isUrgent
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-800 dark:text-amber-300"
                      : "bg-muted/50 border-border/60 text-muted-foreground",
                  )}
                >
                  {isUrgent ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  )}
                  <p>
                    {isUrgent
                      ? tr(
                          "تنبيه: متبقي أقل من دقيقتين! إذا لم تكمل الدفع الآن، سيتم إلغاء الحجز تلقائياً.",
                          "Urgent: Less than 2 minutes remaining! Complete payment now to avoid slot cancellation.",
                        )
                      : tr(
                          "خلال هذه النافذة، لا يمكن لأي مستخدم آخر حجز هذا الوقت. ينتهي الحجز تلقائياً بعد نفاد الوقت.",
                          "During this hold window, no other user can book this slot. It expires automatically if unpaid.",
                        )}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="w-full space-y-3 pt-2">
                {isPaid ? (
                  <Button asChild className="w-full h-12 text-base font-semibold shadow-md gap-2">
                    <Link href="/dashboard/player/bookings">
                      <CheckCircle2 className="h-5 w-5" />
                      {tr("عرض تفاصيل الحجز ورمز QR", "View Booking & QR Code")}
                    </Link>
                  </Button>
                ) : isExpired ? (
                  <div className="space-y-2.5">
                    <Button
                      asChild
                      className="w-full h-12 text-base font-semibold shadow-md gap-2"
                    >
                      <Link href="/dashboard/player/browse">
                        <RefreshCw className="h-4 w-4" />
                        {tr("تصفح الملاعب المتاحة الآن", "Browse Available Courts")}
                      </Link>
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      className="w-full h-11"
                    >
                      <Link href="/dashboard/player/bookings">
                        {tr("سجل حجوزاتي", "My Bookings History")}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Payment Method Switcher Tabs */}
                    <Button
                      onClick={handleProceedToPayment}
                      className="w-full h-12 text-base font-bold shadow-lg shadow-primary/20 gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white"
                    >
                      <CreditCard className="h-5 w-5" />
                      {tr("متابعة الدفع عبر Paymob", "Proceed to Payment via Paymob")}
                      <ExternalLink className="h-4 w-4 ms-auto opacity-70" />
                    </Button>

                    <Button
                      onClick={handleCancelHold}
                      variant="ghost"
                      disabled={isCancelling}
                      className="w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    >
                      {isCancelling ? (
                        <Loader2 className="h-4 w-4 animate-spin me-2" />
                      ) : (
                        <XCircle className="h-4 w-4 me-2" />
                      )}
                      {tr("إلغاء الحجز المؤقت وإتاحة الملعب", "Cancel Reservation Hold")}
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* RIGHT / BOTTOM: Booking & Payment Breakdown Card */}
        <div className="lg:col-span-6 space-y-6">
          <Card className="border shadow-md">
            <CardHeader className="border-b bg-muted/20 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold">{courtName}</CardTitle>
                  <CardDescription className="flex items-center gap-1.5 mt-1">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    {courtLocation}
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="capitalize">
                  {holdData?.sportType || "Padel"}
                </Badge>
              </div>
            </CardHeader>

            <CardContent className="pt-5 space-y-5">
              {/* Date & Time Slot */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border bg-card p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <Calendar className="h-3.5 w-3.5 text-primary" />
                    {tr("التاريخ", "Date")}
                  </div>
                  <div className="text-sm font-semibold">{holdData?.date || "—"}</div>
                </div>

                <div className="rounded-lg border bg-card p-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    {tr("الوقت", "Time Slot")}
                  </div>
                  <div className="text-sm font-semibold">
                    {holdData?.startTime ? format12h(holdData.startTime) : "—"} -{" "}
                    {holdData?.endTime ? format12h(holdData.endTime) : "—"}
                  </div>
                </div>
              </div>

              {/* Pricing Breakdown */}
              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {tr("تفاصيل الرسوم", "Fee Breakdown")}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>{tr("السعر الإجمالي للملعب", "Total Court Fee")}</span>
                    <span className="font-semibold text-foreground">
                      {holdData?.totalPrice?.toFixed(2) || "0.00"} {tr("ج.م", "EGP")}
                    </span>
                  </div>

                  {holdData?.couponCode && (
                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                      <span className="flex items-center gap-1">
                        <Tag className="h-3.5 w-3.5" />
                        {tr("كوبون الخصم", "Coupon")} ({holdData.couponCode})
                      </span>
                      <span className="font-semibold">
                        -{holdData.discountValue?.toFixed(2)} {tr("ج.م", "EGP")}
                      </span>
                    </div>
                  )}

                  <div className="border-t pt-2.5 flex items-center justify-between font-bold text-base">
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="h-4 w-4 text-primary" />
                      <span>{tr("المبلغ المطلوب دفعه الآن", "Amount Due Now")}</span>
                    </div>
                    <span className="text-primary text-lg">
                      {holdData?.amount?.toFixed(2) || "0.00"} {tr("ج.م", "EGP")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Security & Protection Assurance */}
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3.5 flex items-start gap-3">
                <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-xs space-y-0.5 text-muted-foreground">
                  <div className="font-semibold text-foreground">
                    {tr("مدفوعات مؤمنة بـ Paymob", "Secured by Paymob")}
                  </div>
                  <p>
                    {tr(
                      "عملية الدفع مشفرة بالكامل. في حال عدم إتمام الحجز، لن يتم خصم أي مبالغ إضافية.",
                      "Transactions are encrypted. Your slot is held safely until payment is finalized.",
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
