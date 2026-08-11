"use client"

import React, { useRef, useState } from "react"
import { Calendar, BarChart3, Zap, Trophy, Users, ArrowRight, ArrowLeft, ChevronLeft, ChevronRight, Layers } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"
import { LandingAnimatedContainer } from "@/components/landing/landing-animated-container"

const FeatureCard = React.memo(function FeatureCard({
  feature,
  index,
  isActive,
  language,
  direction,
}: { feature: any; index: number; isActive: boolean; language: string; direction: "ltr" | "rtl" }) {
  const Icon = feature.icon
  const [hovered, setHovered] = useState(false)
  const ArrowIcon = direction === "rtl" ? ArrowLeft : ArrowRight
  const arrowMotionClass = direction === "rtl" ? "group-hover:-translate-x-1" : "group-hover:translate-x-1"

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-3xl border-2 cursor-pointer transition-all duration-700 active:scale-[0.985]",
        isActive
          ? "border-primary/60 bg-linear-to-br from-primary/15 via-primary/8 to-transparent shadow-glow-sm scale-105 z-10"
          : hovered
            ? "border-primary/40 bg-card/90 shadow-lg scale-105"
            : "border-border/50 bg-card/60 backdrop-blur-xl hover:border-primary/40 hover:bg-card/90 hover:shadow-lg",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={() => setHovered(true)}
      onTouchEnd={() => setTimeout(() => setHovered(false), 150)}
      onTouchCancel={() => setHovered(false)}
    >
      <div
        className={cn(
          "absolute -end-24 -top-24 w-48 h-48 rounded-full bg-primary/8 transition-all duration-1000 opacity-50",
          hovered && "scale-150 opacity-100",
          "group-hover:scale-150 group-hover:opacity-100",
        )}
      />
      <div
        className={cn(
          "absolute -start-12 -bottom-12 w-32 h-32 rounded-full bg-info/5 transition-all duration-1000 opacity-0",
          hovered && "scale-125 opacity-100",
          "group-hover:scale-125 group-hover:opacity-100",
        )}
      />

      <div
        className={cn(
          "absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500",
          "bg-linear-to-r from-primary/20 via-transparent to-info/20 blur-md md:blur-xl",
        )}
      />

      <div className="relative p-8 lg:p-10">
        <div
          className={cn(
            "flex h-20 w-20 items-center justify-center rounded-3xl transition-all duration-700 relative",
            isActive
              ? "bg-linear-to-br from-primary to-primary/80 text-primary-foreground shadow-glow scale-110"
              : hovered
                ? "bg-linear-to-br from-primary to-primary/80 text-primary-foreground scale-110 rotate-6"
                : "bg-linear-to-br from-primary/15 to-primary/5 text-primary group-hover:bg-linear-to-br group-hover:from-primary group-hover:to-primary/80 group-hover:text-primary-foreground group-hover:scale-110 group-hover:rotate-6",
          )}
        >
          <Icon className="h-9 w-9 relative z-10 transition-transform duration-500 group-hover:scale-110" />
          <div className="absolute inset-0 rounded-3xl bg-primary/20 blur-md md:blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>

        <h3 className="mt-8 text-2xl font-extrabold text-foreground group-hover:text-primary transition-colors duration-300">
          {feature.title}
        </h3>
        <p className="mt-4 text-muted-foreground leading-relaxed text-base group-hover:text-foreground/90 transition-colors duration-300">
          {feature.description}
        </p>

        {isActive && (
          <div className="mt-6 flex items-center gap-2 text-primary text-sm font-bold group-hover:gap-3 transition-all duration-300">
            <span>{language === "ar" ? "اعرف المزيد" : "Learn more"}</span>
            <ArrowIcon className={cn("h-4 w-4 transition-transform", arrowMotionClass)} />
          </div>
        )}

        {!isActive && (
          <div
            className={cn(
              "mt-6 flex items-center gap-2 text-primary/60 text-sm font-medium transition-all duration-300",
              hovered ? "opacity-100" : "opacity-0",
              "group-hover:opacity-100",
            )}
          >
            <span>{language === "ar" ? "اعرف المزيد" : "Learn more"}</span>
            <ArrowIcon className={cn("h-4 w-4 transition-transform", arrowMotionClass)} />
          </div>
        )}
      </div>

      <div
        className={cn(
          "absolute bottom-0 start-0 end-0 h-1 bg-linear-to-r from-transparent via-primary/30 to-transparent transition-opacity duration-500 rounded-b-3xl",
          hovered ? "opacity-100" : "opacity-0",
          "group-hover:opacity-100",
        )}
      />
    </div>
  )
})

const MobileFeatureCarousel = React.memo(function MobileFeatureCarousel({
  language,
  direction,
  features,
}: {
  language: string
  direction: "ltr" | "rtl"
  features: Array<{ icon: any; title: string; description: string }>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const PrevIcon = direction === "rtl" ? ChevronRight : ChevronLeft
  const NextIcon = direction === "rtl" ? ChevronLeft : ChevronRight
  const scroll = (dir: "prev" | "next") => {
    const amount = 300
    const delta =
      dir === "prev"
        ? -amount * (direction === "rtl" ? -1 : 1)
        : amount * (direction === "rtl" ? -1 : 1)
    ref.current?.scrollBy({ left: delta, behavior: "smooth" })
  }
  return (
    <div className="relative">
      <div className="absolute left-0 top-0 bottom-0 w-8 bg-linear-to-r from-background to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-8 bg-linear-to-l from-background to-transparent pointer-events-none" />
      <div ref={ref} className="no-scrollbar flex gap-4 overflow-x-auto scroll-smooth snap-x snap-mandatory scroll-px-2 px-2 py-2">
        {features.map((feature, index) => (
          <div key={index} className="snap-center shrink-0 w-[85%] sm:w-[70%]">
            <FeatureCard feature={feature} index={index} isActive={false} language={language} direction={direction} />
          </div>
        ))}
      </div>
      <div className="absolute inset-y-0 start-2 flex items-center">
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
      <div className="absolute inset-y-0 end-2 flex items-center">
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

export default function Features() {
  const { language, direction } = useLanguage()
  const activeFeature = -1

  const features = [
    {
      icon: Calendar,
      title: language === "ar" ? "حجز ذكي فوري" : "Smart Instant Booking",
      description:
        language === "ar"
          ? "احجز المواعيد المتاحة خلال ثوانٍ عبر تجربة واضحة وسريعة مع تأكيد فوري."
          : "Reserve available slots in seconds through a clear, fast booking flow with instant confirmation.",
    },
    {
      icon: BarChart3,
      title: language === "ar" ? "تحليلات متقدمة" : "Advanced Analytics",
      description:
        language === "ar"
          ? "تابع الحجوزات والإشغال ومؤشرات الأداء من خلال لوحات معلومات عملية وواضحة."
          : "Track bookings, occupancy, and performance with practical dashboards built for daily operations.",
    },
    {
      icon: Zap,
      title: language === "ar" ? "إشعارات ذكية" : "Smart Notifications",
      description:
        language === "ar"
          ? "استلم التذكيرات والتحديثات المهمة فورًا حتى تبقى كل الحجوزات تحت السيطرة."
          : "Receive instant reminders and key updates so every booking stays on track.",
    },
    {
      icon: Trophy,
      title: language === "ar" ? "نظام المكافآت" : "Rewards System",
      description:
        language === "ar"
          ? "قدّم مزايا ولاء وعروضًا تشجع اللاعبين على العودة والحجز باستمرار."
          : "Create loyalty offers and reward programs that keep players coming back.",
    },
    {
      icon: Users,
      title: language === "ar" ? "إدارة الفرق" : "Team Management",
      description:
        language === "ar"
          ? "نسّق الفرق والحجوزات الجماعية وجداول التدريب من مكان واحد."
          : "Coordinate teams, group bookings, and training schedules from one place.",
    },
  ]

  return (
    <section className="py-28 relative bg-linear-to-b from-muted/30 via-background to-muted/20 overflow-hidden">
      <div className="absolute inset-0 pattern-dots opacity-20" />
      <div className="absolute inset-0 gradient-mesh opacity-0 sm:opacity-30" />
      <div className="container-responsive relative">
        <LandingAnimatedContainer animation="slide-up" className="text-center max-w-4xl mx-auto mb-20">
          <Badge className="mb-6 rounded-full px-5 py-2.5 bg-primary/10 text-primary border-primary/20 backdrop-blur-sm shadow-glow-sm">
            <Layers className="h-4 w-4 me-2" />
            {language === "ar" ? "المميزات" : "Features"}
          </Badge>
          <h2 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-foreground text-balance mb-6">
            {language === "ar" ? (
              <>
                حل متكامل <span className="text-gradient">للحجز والإدارة</span>
              </>
            ) : (
              <>
                A Complete Platform <span className="text-gradient">for Booking and Management</span>
              </>
            )}
          </h2>
          <p className="mt-6 text-xl text-muted-foreground text-pretty max-w-2xl mx-auto">
            {language === "ar"
              ? "كل ما يحتاجه اللاعبون ومديرو الملاعب لإدارة الحجوزات، متابعة الأداء، وتقديم تجربة أسرع وأكثر احترافية."
              : "Everything players and venue managers need to manage bookings, monitor performance, and deliver a more professional experience."}
          </p>
        </LandingAnimatedContainer>

        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <LandingAnimatedContainer key={index} animation="scale-in" delay={index * 0.15}>
              <FeatureCard feature={feature} index={index} isActive={index === activeFeature} language={language} direction={direction} />
            </LandingAnimatedContainer>
          ))}
        </div>
        <div className="md:hidden">
          <MobileFeatureCarousel language={language} direction={direction} features={features} />
        </div>
      </div>
    </section>
  )
}
