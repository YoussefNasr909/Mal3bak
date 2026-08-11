"use client"

import Link from "next/link"
import { ArrowLeft, ArrowRight, CalendarRange, Home, LayoutDashboard, ShieldAlert, UserRoundCheck } from "lucide-react"
import { AuthNavbar } from "@/components/auth/auth-navbar"
import { useLanguage } from "@/components/providers/language-provider"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { GridBackground, NoiseTexture, Spotlight } from "@/components/ui/floating-elements"
import { getDashboardHomeHref, type BookingEntryRole } from "@/lib/booking-entry"
import { cn } from "@/lib/utils"

type AccessMode = "browse" | "court"
type RestrictedRole = Exclude<BookingEntryRole, "player" | null | undefined>

const roleLabelMap = {
  admin: { ar: "مدير النظام", en: "Admin" },
  manager: { ar: "مدير الملعب", en: "Manager" },
} satisfies Record<RestrictedRole, { ar: string; en: string }>

interface PlayerBookingAccessPageProps {
  mode: AccessMode
  role: RestrictedRole
}

export function PlayerBookingAccessPage({ mode, role }: PlayerBookingAccessPageProps) {
  const { language, direction } = useLanguage()
  const isArabic = language === "ar"
  const ArrowIcon = direction === "rtl" ? ArrowLeft : ArrowRight
  const roleLabel = roleLabelMap[role][isArabic ? "ar" : "en"]
  const dashboardHref = getDashboardHomeHref(role)

  const eyebrow = isArabic ? "الدخول للحجز مخصص للاعبين" : "Player-only booking access"
  const title =
    mode === "court"
      ? isArabic
        ? "هذه الصفحة مخصصة لحسابات اللاعبين فقط"
        : "This booking page is available to player accounts only"
      : isArabic
        ? "الحجز متاح من حساب اللاعب فقط"
        : "Court booking is available from player accounts only"
  const description =
    role === "admin"
      ? isArabic
        ? "أنت مسجل الدخول كمدير نظام. يمكن لهذا الحساب إدارة المنصة، لكن حجز المواعيد داخل الملاعب يتم فقط من حساب لاعب."
        : "You are signed in as an admin. This account can manage the platform, but court reservations are only completed from a player account."
      : isArabic
        ? "أنت مسجل الدخول كمدير ملعب. يمكن لهذا الحساب إدارة الملاعب والحجوزات، لكن حجز موعد كلاعب يتم فقط من حساب لاعب."
        : "You are signed in as a manager. This account can manage venues and bookings, but reserving a slot as a player is only available from a player account."
  const helper =
    isArabic
      ? "إذا كنت تريد الحجز لنفسك، سجّل الدخول بحساب لاعب ثم افتح صفحة الحجز مرة أخرى."
      : "If you want to reserve a slot for yourself, sign in with a player account and open the booking flow again."

  return (
    <div className={cn("min-h-screen bg-background", direction === "rtl" ? "rtl" : "ltr")} dir={direction}>
      <AuthNavbar />

      <div className="relative overflow-hidden">
        <GridBackground />
        <NoiseTexture />
        <Spotlight />
        <div className="absolute -top-20 start-[10%] h-64 w-64 rounded-full bg-primary/12 blur-3xl" />
        <div className="absolute top-32 end-[8%] h-56 w-56 rounded-full bg-info/12 blur-3xl" />
        <div className="absolute bottom-0 start-1/3 h-40 w-40 rounded-full bg-success/10 blur-3xl" />
      </div>

      <main className="container-responsive relative py-24 sm:py-28">
        <div className="mx-auto max-w-5xl">
          <Card className="overflow-hidden rounded-[32px] border-2 border-border/60 bg-card/78 shadow-[0_28px_90px_rgba(15,23,42,0.12)] backdrop-blur-2xl">
            <div className="border-b border-border/60 bg-linear-to-r from-primary/12 via-background/40 to-info/12 px-6 py-5 sm:px-8">
              <div className="flex flex-wrap items-center gap-2.5">
                <Badge className="rounded-full border-primary/20 bg-primary/10 px-3.5 py-1.5 text-primary">
                  <CalendarRange className="me-1.5 h-4 w-4" />
                  {eyebrow}
                </Badge>
                <Badge variant="secondary" className="rounded-full px-3.5 py-1.5">
                  {isArabic ? "الحساب الحالي" : "Current account"}: {roleLabel}
                </Badge>
                <Badge className="rounded-full border-success/25 bg-success/12 px-3.5 py-1.5 text-success">
                  {isArabic ? "المسموح بالحجز" : "Can book"}: {isArabic ? "لاعب" : "Player"}
                </Badge>
              </div>
            </div>

            <CardContent className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:gap-10 lg:p-10">
              <section className="space-y-6">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-[22px] bg-amber-500/12 text-amber-600 shadow-inner shadow-amber-500/10">
                  <ShieldAlert className="h-8 w-8" />
                </div>

                <div className="space-y-4">
                  <h1 className="max-w-2xl text-balance text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl lg:text-[2.75rem]">
                    {title}
                  </h1>
                  <p className="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">{description}</p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl border border-border/60 bg-background/75 p-5 shadow-sm">
                    <p className="text-sm font-semibold text-muted-foreground">{isArabic ? "دورك الحالي" : "Signed in as"}</p>
                    <p className="mt-2 text-xl font-bold text-foreground">{roleLabel}</p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">
                      {role === "admin"
                        ? isArabic
                          ? "إدارة المستخدمين والمنصة بالكامل."
                          : "Platform-wide management and oversight."
                        : isArabic
                          ? "إدارة الملاعب والعمليات اليومية."
                          : "Venue operations and court management."}
                    </p>
                  </div>

                  <div className="rounded-3xl border border-success/20 bg-success/[0.08] p-5 shadow-sm">
                    <p className="text-sm font-semibold text-success">{isArabic ? "لإتمام الحجز" : "To complete a booking"}</p>
                    <p className="mt-2 text-xl font-bold text-foreground">{isArabic ? "استخدم حساب لاعب" : "Use a player account"}</p>
                    <p className="mt-2 text-sm leading-7 text-muted-foreground">{helper}</p>
                  </div>
                </div>
              </section>

              <aside className="flex h-full flex-col justify-between rounded-[28px] border border-border/60 bg-background/72 p-5 shadow-sm sm:p-6">
                <div className="space-y-5">
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1.5 text-sm font-semibold text-primary">
                    <UserRoundCheck className="h-4 w-4" />
                    {isArabic ? "الإجراء المقترح" : "Recommended next step"}
                  </div>

                  <div className="space-y-3">
                    <h2 className="text-xl font-bold text-foreground">
                      {isArabic ? "ارجع إلى لوحة التحكم أو الصفحة الرئيسية" : "Return to your dashboard or the home page"}
                    </h2>
                    <p className="text-sm leading-7 text-muted-foreground">
                      {isArabic
                        ? "حافظنا على وصولك الحالي بدون شاشة خطأ. من هنا يمكنك الرجوع للوحة التحكم الخاصة بك أو العودة للرئيسية."
                        : "We kept your current session intact and replaced the browser error with a clean handoff. From here you can return to your dashboard or go back home."}
                    </p>
                  </div>
                </div>

                <div className="mt-8 flex flex-col gap-3">
                  <Button asChild className="h-12 rounded-2xl text-sm font-bold shadow-glow-sm">
                    <Link href={dashboardHref}>
                      <LayoutDashboard className="h-4 w-4" />
                      {isArabic ? "الذهاب إلى لوحة التحكم" : "Go to my dashboard"}
                      <ArrowIcon className="h-4 w-4" />
                    </Link>
                  </Button>

                  <Button asChild variant="outline" className="h-12 rounded-2xl bg-transparent text-sm font-semibold">
                    <Link href="/">
                      <Home className="h-4 w-4" />
                      {isArabic ? "العودة إلى الرئيسية" : "Back to home"}
                    </Link>
                  </Button>
                </div>
              </aside>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
