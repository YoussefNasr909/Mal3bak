"use client"

import { useMemo } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  ArrowDown,
  MapPin,
  Trophy,
  Target,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/components/providers/auth-provider"
import { useLanguage } from "@/components/providers/language-provider"
import { getBookingBrowseEntryHref, getDashboardHomeHref } from "@/lib/booking-entry"
import { LandingAnimatedContainer } from "@/components/landing/landing-animated-container"
import { cn } from "@/lib/utils"

function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-linear-to-b from-background via-background/96 to-background" />
      <div className="absolute -top-24 start-[12%] h-[340px] w-[340px] rounded-full bg-primary/12 blur-2xl" />
      <div className="absolute bottom-0 end-[8%] h-[300px] w-[300px] rounded-full bg-info/10 blur-2xl" />
      <div className="absolute top-1/3 end-1/4 h-[220px] w-[220px] rounded-full bg-success/8 blur-xl" />
      <div className="absolute inset-0 opacity-[0.03] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:72px_72px]" />
      <div className="absolute inset-x-0 top-0 h-40 bg-linear-to-b from-primary/[0.03] to-transparent" />
    </div>
  )
}

function MobileHeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute -top-24 start-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,var(--primary)_0%,transparent_60%)] opacity-30" />
      <div className="absolute top-10 end-6 h-48 w-48 rounded-full bg-[radial-gradient(circle_at_center,var(--info)_0%,transparent_60%)] opacity-20" />
      <div className="absolute top-1/3 start-4 h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,var(--success)_0%,transparent_60%)] opacity-20" />
      <div className="absolute bottom-0 inset-x-0 h-40 bg-linear-to-b from-transparent via-primary/5 to-transparent" />
    </div>
  )
}

function DesktopAccents({ language }: { language: "ar" | "en" }) {
  return (
    <div className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block">
      <div className="absolute start-[8%] top-24 flex items-center gap-2 rounded-2xl border border-primary/15 bg-card/75 px-4 py-3 backdrop-blur-sm shadow-smooth">
        <Target className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          {language === "ar" ? "حجز أسرع" : "Fast booking"}
        </span>
      </div>
      <div className="absolute end-[10%] top-36 flex items-center gap-2 rounded-2xl border border-info/15 bg-card/75 px-4 py-3 backdrop-blur-sm shadow-smooth">
        <Clock className="h-4 w-4 text-info" />
        <span className="text-sm font-semibold text-foreground">
          {language === "ar" ? "توافر لحظي" : "Live availability"}
        </span>
      </div>
    </div>
  )
}

type HeroVisualCardProps = {
  browseCourtsLabel: string
  bookNowLabel: string
  confirmationSpeedLabel: string
  direction: "rtl" | "ltr"
  heroBookHref: string
  heroCourtName: string
  heroImageAlt: string
  heroLocation: string
  language: "ar" | "en"
  liveAvailabilityLabel: string
}

function HeroVisualCard({
  browseCourtsLabel,
  bookNowLabel,
  confirmationSpeedLabel,
  direction,
  heroBookHref,
  heroCourtName,
  heroImageAlt,
  heroLocation,
  language,
  liveAvailabilityLabel,
}: HeroVisualCardProps) {
  const CtaChevronIcon = direction === "rtl" ? ChevronLeft : ChevronRight

  return (
    <LandingAnimatedContainer animation="none" className="w-full">
      <div className="group relative mx-auto w-full max-w-sm overflow-hidden rounded-[28px] border border-border/60 bg-card/75 p-3 shadow-smooth-lg backdrop-blur-xl transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_24px_80px_rgba(0,0,0,0.14)] lg:max-w-none">
        <div className="absolute inset-x-4 top-4 z-20 flex items-start justify-between gap-3 lg:inset-x-6 lg:top-6">
          <Badge className="rounded-full border-0 bg-white/16 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-md">
            <Clock className="me-1.5 h-3.5 w-3.5" />
            {liveAvailabilityLabel}
          </Badge>
          <div className="rounded-full border border-white/15 bg-black/20 px-3 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur-md">
            {browseCourtsLabel}
          </div>
        </div>

        <div className="relative aspect-[4/5] overflow-hidden rounded-[22px] border border-white/10 bg-slate-950 lg:aspect-[3/2] lg:rounded-[24px]">
          <Image
            src="/Hero.jpg"
            alt={heroImageAlt}
            fill
            priority
            unoptimized={true}
            fetchPriority="high"
            sizes="(max-width: 1023px) min(92vw, 28rem), (max-width: 1440px) 44vw, 600px"
            className="object-cover object-center transition-transform duration-700 group-hover:scale-[1.03]"
          />
          <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/28 to-black/10 lg:from-black/82 lg:via-black/40" />

          <div className="absolute inset-x-0 bottom-0 p-5 lg:p-7">
            <div className="rounded-[22px] border border-white/10 bg-black/24 p-4 lg:bg-black/12">
              <div className="flex items-start justify-between gap-3 lg:items-end lg:gap-4">
                <div className="min-w-0 lg:max-w-[60%]">
                  <p className="line-clamp-2 text-xl font-extrabold text-white drop-shadow-lg lg:text-3xl">
                    {heroCourtName}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-sm text-white/85 lg:text-white/90">
                    <MapPin className="h-4 w-4 shrink-0" />
                    <span className="lg:text-lg lg:font-medium">{heroLocation}</span>
                  </div>
                </div>

                <div className="rounded-2xl bg-white/12 p-3 text-white shadow-lg backdrop-blur-sm lg:hidden">
                  <Trophy className="h-5 w-5" />
                </div>

                <Button size="lg" className="hidden h-12 rounded-xl px-6 font-semibold shadow-glow lg:inline-flex" asChild>
                  <Link href={heroBookHref}>
                    {bookNowLabel}
                    <CtaChevronIcon className="ms-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 lg:max-w-[60%]">
                <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/90">
                  {confirmationSpeedLabel}
                </div>
                <div className="rounded-full border border-primary/30 bg-primary/20 px-3 py-1.5 text-[11px] font-semibold text-white">
                  {language === "ar" ? "احجز من الجوال بسهولة" : "Easy booking on mobile"}
                </div>
              </div>

              <Button
                size="sm"
                className="mt-4 h-12 sm:h-14 w-full rounded-2xl text-sm font-semibold shadow-glow transition-transform duration-300 active:scale-[0.98] lg:hidden"
                asChild
              >
                <Link href={heroBookHref} className="group flex items-center justify-center">
                  <span>{bookNowLabel}</span>
                  <CtaChevronIcon
                    className={cn(
                      "ms-2 h-4 w-4 transition-transform",
                      direction === "rtl" ? "group-hover:-translate-x-1" : "group-hover:translate-x-1",
                    )}
                  />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </LandingAnimatedContainer>
  )
}

export default function Hero() {
  const { language, direction } = useLanguage()
  const { user } = useAuth()
  const ArrowIcon = direction === "rtl" ? ArrowLeft : ArrowRight
  const {
    primaryCtaHref,
    heroBookHref,
    heroCourtName,
    heroLocation,
    titleStart,
    titleHighlight,
    liveAvailabilityLabel,
    confirmationSpeedLabel,
    browseCourtsLabel,
    bookNowLabel,
    heroImageAlt
  } = useMemo(() => {
    const homeHref = getDashboardHomeHref(user?.role)
    const browseHref = user?.role === "player" ? "/dashboard/player/browse" : homeHref
    return {
      primaryCtaHref: user ? browseHref : "/auth/register",
      heroBookHref: getBookingBrowseEntryHref(),
      heroCourtName: language === "ar" ? "ملعب ملعبك بادل" : "Mal3bk Padel Court",
      heroLocation: language === "ar" ? "القاهرة" : "Cairo",
      titleStart: language === "ar" ? "احجز الملاعب الرياضية" : "Book sports courts",
      titleHighlight: language === "ar" ? "بثقة" : "with confidence",
      liveAvailabilityLabel: language === "ar" ? "مواعيد محدثة الآن" : "Updated live now",
      confirmationSpeedLabel: language === "ar" ? "تأكيد سريع خلال دقيقة" : "Quick confirmation in minutes",
      browseCourtsLabel: language === "ar" ? "ملاعب جاهزة للحجز" : "Courts ready to book",
      bookNowLabel: language === "ar" ? "احجز الآن" : "Book Now",
      heroImageAlt: language === "ar" ? "ملعب بادل من منصة ملعبك" : "Mal3bk padel court"
    }
  }, [language, user])

  return (
    <section className="relative flex min-h-[90vh] items-center overflow-hidden border-b border-border/20 pt-24">
      <div className="md:hidden">
        <MobileHeroBackground />
      </div>
      <div className="hidden lg:block">
        <HeroBackground />
        <DesktopAccents language={language as "ar" | "en"} />
      </div>

      <div className="container-responsive relative z-10 pt-20 pb-32 lg:pb-20">
        <div className="grid items-center gap-14 lg:grid-cols-2 xl:gap-16">
          <div className="text-center lg:text-start">
            <LandingAnimatedContainer animation="slide-up" delay={0}>
              <Badge className="mb-5 rounded-full border-primary/20 bg-primary/10 px-4 py-2 text-primary shadow-sm">
                <Sparkles className="me-2 h-4 w-4" />
                {language === "ar"
                  ? "تجربة احترافية للحجز والإدارة"
                  : "Professional booking and management"}
              </Badge>
            </LandingAnimatedContainer>

            <LandingAnimatedContainer animation="slide-up" delay={80}>
              <h1 className="text-balance text-[2.2rem] font-extrabold leading-[1.15] tracking-tight text-foreground sm:text-4xl lg:text-5xl xl:text-6xl">
                <span>{titleStart}</span>{" "}
                <span
                  className={cn(
                    "inline-block bg-clip-text text-transparent",
                    language === "ar" 
                      ? "bg-linear-to-l from-primary via-blue-500 to-cyan-400"
                      : "bg-linear-to-r from-primary via-blue-500 to-cyan-400"
                  )}
                  style={{ WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  {titleHighlight}
                </span>
              </h1>
            </LandingAnimatedContainer>

            <LandingAnimatedContainer animation="slide-up" delay={160}>
              <p className="mx-auto mt-6 max-w-2xl text-base font-medium leading-relaxed text-muted-foreground sm:text-lg lg:mx-0">
                {language === "ar"
                  ? "اكتشف ملاعب كرة القدم والبادل والرياضات المختلفة في مصر، وابدأ الحجز من منصة واحدة مع توافر محدث لحظيًا وتأكيد فوري وتجربة سلسة للاعبين ومديري الملاعب."
                  : "Discover football, padel, tennis, and multi-sport venues across Egypt with live availability, instant confirmation, and a seamless experience for players and venue managers."}
              </p>
            </LandingAnimatedContainer>

            <LandingAnimatedContainer animation="slide-up" delay={240}>
              <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row lg:justify-start">
                <Button
                  size="default"
                  className="group relative h-12 overflow-hidden rounded-2xl px-8 text-base font-bold shadow-glow transition-all duration-300 hover:-translate-y-0.5 hover:shadow-glow-sm active:scale-[0.98]"
                  asChild
                >
                  <Link href={primaryCtaHref} className="relative flex items-center justify-center overflow-hidden">
                    <span className="absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                      <span className="animate-shimmer absolute inset-0" />
                    </span>
                    <span className="relative z-10">
                      {language === "ar" ? "ابدأ اللعب الآن" : "Start Playing Now"}
                    </span>
                    <ArrowIcon
                      className={cn(
                        "relative z-10 ms-2 h-5 w-5 transition-transform",
                        direction === "rtl" ? "group-hover:-translate-x-1" : "group-hover:translate-x-1",
                      )}
                    />
                  </Link>
                </Button>

                <Button
                  variant="outline"
                  className="group h-12 rounded-2xl border-2 bg-card/60 px-8 text-base font-semibold backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 hover:bg-card/80 active:scale-[0.98]"
                  asChild
                >
                  <Link href="#how-it-works" className="flex items-center">
                    <CirclePlay className="me-2 h-5 w-5 transition-transform group-hover:scale-110" />
                    {language === "ar" ? "شاهد كيف يعمل" : "See How It Works"}
                  </Link>
                </Button>
              </div>
            </LandingAnimatedContainer>

            <LandingAnimatedContainer animation="slide-up" delay={320}>
              <div className="mt-10 grid w-full grid-cols-2 gap-3 text-[11px] sm:flex sm:flex-wrap sm:items-center sm:justify-center sm:gap-6 sm:text-sm lg:justify-start">
                <div className="flex min-w-0 items-center justify-center gap-2 rounded-full border border-primary/10 bg-card/65 px-2.5 py-2 shadow-sm backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5 sm:px-3 sm:justify-start">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  </div>
                  <span className="min-w-0 font-medium leading-none text-foreground">
                    {language === "ar" ? "حجز فوري" : "Instant booking"}
                  </span>
                </div>

                <div className="flex min-w-0 items-center justify-center gap-2 rounded-full border border-info/10 bg-card/65 px-2.5 py-2 shadow-sm backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5 sm:px-3 sm:justify-start">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10">
                    <Clock className="h-4 w-4 text-info" />
                  </div>
                  <span className="min-w-0 font-medium leading-none text-foreground">
                    {language === "ar" ? "توافر لحظي" : "Real-time availability"}
                  </span>
                </div>
              </div>
            </LandingAnimatedContainer>
          </div>

          <HeroVisualCard
            browseCourtsLabel={browseCourtsLabel}
            bookNowLabel={bookNowLabel}
            confirmationSpeedLabel={confirmationSpeedLabel}
            direction={direction}
            heroBookHref={heroBookHref}
            heroCourtName={heroCourtName}
            heroImageAlt={heroImageAlt}
            heroLocation={heroLocation}
            language={language as "ar" | "en"}
            liveAvailabilityLabel={liveAvailabilityLabel}
          />
        </div>
      </div>

      <div className="absolute bottom-8 sm:bottom-10 left-1/2 z-10 -translate-x-1/2 flex flex-col items-center gap-1 animate-bounce-subtle">
        <span
          className={cn("text-xs font-medium tracking-wider text-muted-foreground", language !== "ar" && "uppercase")}
        >
          {language === "ar" ? "اكتشف أكثر" : "Scroll"}
        </span>
        <div className="flex flex-col items-center gap-1">
          <ArrowDown className="h-5 w-5 sm:h-6 sm:w-6 text-primary animate-bounce-subtle" />
          <div className="h-8 w-0.5 rounded-full bg-linear-to-b from-primary/50 to-transparent" />
        </div>
      </div>
    </section>
  )
}
