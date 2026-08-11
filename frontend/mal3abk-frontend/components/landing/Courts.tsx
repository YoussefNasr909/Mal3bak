"use client"

import React, { useState, useEffect, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Building2, MapPin, Heart, Clock, ChevronRight, ChevronLeft, ArrowRight, ArrowLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useAuth } from "@/components/providers/auth-provider"
import { useLanguage } from "@/components/providers/language-provider"
import { sportTypes } from "@/lib/constants"
import { getBookingBrowseEntryHref, getBookingCourtEntryHref, getDashboardHomeHref } from "@/lib/booking-entry"
import { listTopBookedPublicCourts } from "@/lib/api"
import type { Court } from "@/lib/types"
import { cn } from "@/lib/utils"
import { LandingAnimatedContainer } from "@/components/landing/landing-animated-container"

const CourtCard = React.memo(function CourtCard({
  court,
  language,
  direction,
}: {
  court: any
  language: string
  direction: "ltr" | "rtl"
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const router = useRouter()
  const { user } = useAuth()
  const CtaIcon = direction === "rtl" ? ChevronLeft : ChevronRight
  const homeHref = getDashboardHomeHref(user?.role)
  const favoriteHref =
    user?.role === "player"
      ? `/dashboard/player/favorites?addFav=${court.id}`
      : user
        ? homeHref
        : `/auth/login?redirect=${encodeURIComponent(`/dashboard/player/favorites?addFav=${court.id}`)}`
  const bookingHref = getBookingCourtEntryHref(court.id)

  const getImageUrl = () => {
    if (court.images && court.images[0]) {
      return court.images[0]
    }
    const sportQueries: Record<string, string> = {
      padel: "professional padel court indoor blue glass walls",
      tennis: "professional tennis court clay outdoor",
      basketball: "modern basketball court indoor wooden floor",
      football: "football soccer field green grass stadium",
      volleyball: "volleyball court indoor professional",
      squash: "squash court indoor glass walls professional",
    }
    return `/placeholder.svg?height=400&width=600&query=${encodeURIComponent(sportQueries[court.sportType] || "sports court professional")}`
  }

  return (
    <Card
      className="group overflow-hidden rounded-3xl border-2 border-border/50 bg-card/90 shadow-smooth backdrop-blur-xl transition-all duration-500 hover-lift hover:border-primary/50 hover:shadow-smooth-lg active:scale-[0.99]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={() => setIsHovered(true)}
      onTouchEnd={() => setTimeout(() => setIsHovered(false), 150)}
      onTouchCancel={() => setIsHovered(false)}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={getImageUrl() || "/placeholder.svg"}
          alt={language === "ar" ? court.name : court.nameEn}
          fill
          className={cn(
            "object-cover transition-all duration-700",
            isLoaded ? "opacity-100" : "opacity-0",
            isHovered ? "scale-110" : "scale-100",
          )}
          onLoad={() => setIsLoaded(true)}
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        />
        {!isLoaded && <div className="absolute inset-0 bg-muted animate-pulse" />}
        <div className="absolute inset-0 bg-linear-to-t from-black/95 via-black/50 to-transparent" />

        <div
          className={cn(
            "absolute inset-0 bg-linear-to-tr from-primary/20 via-transparent to-info/20 transition-opacity duration-500",
            isHovered ? "opacity-100" : "opacity-0",
          )}
        />

        <Badge className="absolute top-4 start-4 bg-primary/95 text-primary-foreground border-0 backdrop-blur-md rounded-xl px-4 py-2 shadow-lg font-semibold hover:scale-105 transition-transform">
          {language === "ar" ? sportTypes[court.sportType]?.ar : sportTypes[court.sportType]?.en}
        </Badge>

        <button
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            router.push(favoriteHref)
          }}
          className="absolute top-4 end-4 h-12 w-12 rounded-xl bg-white/15 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-white/25 transition-all duration-300 hover:scale-110 hover:shadow-lg group"
          aria-label={language === "ar" ? "إضافة إلى المفضلة" : "Add to favorites"}
        >
          <Heart
            className={cn(
              "h-5 w-5 transition-all duration-300",
              isFavorite && "fill-red-500 text-red-500 scale-110",
              !isFavorite && "group-hover:scale-110",
            )}
          />
        </button>

        <div className="absolute bottom-0 inset-x-0 p-6">
          <h3 className="text-2xl font-bold text-white mb-3 drop-shadow-lg">
            {language === "ar" ? court.name : court.nameEn}
          </h3>
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <div className="flex items-center gap-2 text-white/90 text-sm font-medium">
              <MapPin className="h-4 w-4" />
              {language === "ar" ? court.city : court.cityEn}
            </div>
          </div>
        </div>
      </div>

      <CardContent className="p-5">
        <div className="flex flex-wrap gap-2 mb-4">
          {(language === "ar" ? court.amenities : court.amenitiesEn)?.slice(0, 3).map((amenity: string, i: number) => (
            <Badge key={i} variant="secondary" className="rounded-lg text-xs">
              {amenity}
            </Badge>
          ))}
          {(language === "ar" ? court.amenities : court.amenitiesEn)?.length > 3 && (
            <Badge variant="secondary" className="rounded-lg text-xs">
              +{(language === "ar" ? court.amenities : court.amenitiesEn).length - 3}
            </Badge>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span className="text-success">{language === "ar" ? "متاح" : "Available"}</span>
            </div>
          </div>
          <div className="text-end">
            <div className="text-2xl font-bold text-primary">
              {court.peakPrice ?? court.offPeakPrice}
              {court.peakPrice && (
                <span className="text-xs font-semibold text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-md ms-2 align-middle">
                  {language === "ar" ? "ذروة" : "Peak"}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{language === "ar" ? "ج.م / ساعة" : "EGP/hr"}</div>
          </div>
        </div>

        <Button
          className="w-full mt-5 rounded-xl shadow-glow-sm hover:shadow-glow transition-all duration-300 h-14 font-semibold text-base group/btn relative overflow-hidden"
          asChild
        >
          <Link href={bookingHref} className="relative z-10 flex items-center justify-center">
            <span className="relative z-10">{language === "ar" ? "احجز الآن" : "Book Now"}</span>
            <CtaIcon
              className={cn(
                "relative z-10 ms-2 h-4 w-4 transition-transform",
                direction === "rtl" ? "group-hover/btn:-translate-x-1" : "group-hover/btn:translate-x-1",
              )}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 z-0 bg-linear-to-r from-primary to-info opacity-0 transition-opacity duration-300 group-hover/btn:opacity-100"
            />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
})

const MobileCourtCarousel = React.memo(function MobileCourtCarousel({
  language,
  direction,
  courts,
}: {
  language: string
  direction: "ltr" | "rtl"
  courts: Court[]
}) {
  const ref = useRef<HTMLDivElement>(null)
  const PrevIcon = direction === "rtl" ? ChevronRight : ChevronLeft
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight
  const scroll = (dir: "prev" | "next") => {
    const amount = 320
    const delta =
      dir === "prev"
        ? -amount * (direction === "rtl" ? -1 : 1)
        : amount * (direction === "rtl" ? -1 : 1)
    ref.current?.scrollBy({ left: delta, behavior: "smooth" })
  }
  return (
    <div className="relative">
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-background to-transparent pointer-events-none z-10" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-background to-transparent pointer-events-none z-10" />
      <div
        ref={ref}
        className="no-scrollbar flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory scroll-px-2 px-2 py-2"
      >
        {courts.map((court) => (
          <div key={court.id} className="snap-center shrink-0 w-[85%] sm:w-[70%]">
            <CourtCard court={court} language={language} direction={direction} />
          </div>
        ))}
      </div>
      <div className="absolute inset-y-0 start-2 flex items-center z-10">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full border-border/60 bg-background/80 shadow-smooth backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.95]"
          onClick={() => scroll("prev")}
          aria-label={language === "ar" ? "السابق" : "Previous"}
        >
          <PrevIcon className="h-5 w-5" />
        </Button>
      </div>
      <div className="absolute inset-y-0 end-2 flex items-center z-10">
        <Button
          variant="outline"
          size="icon"
          className="rounded-full border-border/60 bg-background/80 shadow-smooth backdrop-blur-xl transition-all duration-300 hover:-translate-y-0.5 active:scale-[0.95]"
          onClick={() => scroll("next")}
          aria-label={language === "ar" ? "التالي" : "Next"}
        >
          <NextIcon className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
})

export default function Courts() {
  const { language, direction } = useLanguage()
  const [featuredCourts, setFeaturedCourts] = useState<Court[]>([])
  const ArrowIcon = direction === "rtl" ? ArrowLeft : ArrowRight
  const browseAllHref = getBookingBrowseEntryHref()

  useEffect(() => {
    let active = true

    const loadFeaturedCourts = async () => {
      try {
        const res = await listTopBookedPublicCourts({ limit: 3 })
        if (!active) return
        setFeaturedCourts(Array.isArray(res.items) ? (res.items as Court[]) : [])
      } catch (error) {
        console.error("Failed to load public courts", error)
        if (!active) return
        setFeaturedCourts([])
      }
    }

    loadFeaturedCourts()

    return () => {
      active = false
    }
  }, [])

  return (
    <section className="py-32 relative overflow-hidden border-y border-border/20">
      <div className="absolute inset-0 bg-linear-to-b from-transparent via-primary/3 to-transparent" />
      <div className="container-responsive relative">
        <LandingAnimatedContainer animation="slide-up" className="text-center max-w-3xl mx-auto mb-16">
          <Badge className="mb-4 rounded-full px-4 py-2 bg-primary/10 text-primary border-primary/20">
            <Building2 className="h-4 w-4 me-2" />
            {language === "ar" ? "الملاعب" : "Courts"}
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground text-balance">
            {language === "ar" ? "أشهر الملاعب والأكثر حجزاً" : "Most Famous & Booked Courts"}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            {language === "ar"
              ? "اكتشف أعلى 3 ملاعب من حيث عدد الحجوزات الفعلية"
              : "Discover the top 3 courts by real booking volume"}
          </p>
        </LandingAnimatedContainer>

        <div className="hidden md:block">
          {featuredCourts.length === 0 ? (
            <div className="rounded-3xl border border-border/50 bg-card/60 p-8 text-center text-muted-foreground">
              {language === "ar" ? "لا توجد ملاعب محجوزة بعد" : "No booked courts yet"}
            </div>
          ) : (
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {featuredCourts.map((court, index) => (
                <LandingAnimatedContainer key={court.id} animation="scale-in" delay={index * 0.1}>
                  <CourtCard court={court} language={language} direction={direction} />
                </LandingAnimatedContainer>
              ))}
            </div>
          )}
        </div>
        <div className="md:hidden">
          {featuredCourts.length === 0 ? (
            <div className="rounded-3xl border border-border/50 bg-card/60 p-8 text-center text-muted-foreground">
              {language === "ar" ? "لا توجد ملاعب محجوزة بعد" : "No booked courts yet"}
            </div>
          ) : (
            <MobileCourtCarousel language={language} direction={direction} courts={featuredCourts} />
          )}
        </div>

        <div className="text-center mt-16">
          <Button
            size="lg"
            variant="outline"
            className="rounded-2xl h-16 px-10 text-lg font-bold bg-transparent border-2 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all duration-300 hover:scale-105 hover:shadow-glow-sm"
            asChild
          >
            <Link href={browseAllHref} className="flex items-center">
              {language === "ar" ? "تصفح جميع الملاعب" : "Browse All Courts"}
              <ArrowIcon
                className={cn(
                  "ms-2 h-5 w-5 transition-transform",
                  direction === "rtl" ? "group-hover:-translate-x-1" : "group-hover:translate-x-1",
                )}
              />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
