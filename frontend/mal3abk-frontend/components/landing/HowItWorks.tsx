"use client"

import React, { useRef } from "react"
import { Search, Calendar, CreditCard, CheckCircle2, ChevronLeft, ChevronRight, Layers } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/providers/language-provider"
import { LandingAnimatedContainer } from "@/components/landing/landing-animated-container"

const HowItWorksStep = React.memo(function HowItWorksStep({
  step,
  index,
  language,
  isLast,
}: { step: any; index: number; language: string; isLast?: boolean }) {
  return (
    <div className="relative group h-full">
      {!isLast && (
        <div className="hidden lg:block absolute top-1/2 start-full w-full h-0.5 bg-linear-to-r from-primary/20 via-primary/40 to-transparent z-0 translate-x-4">
          <div className="absolute end-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary/40 animate-pulse" />
        </div>
      )}

      <div className="relative flex h-full flex-col rounded-3xl border-2 border-border/50 bg-card/60 p-8 backdrop-blur-xl transition-all duration-500 hover-lift hover:border-primary/50 hover:shadow-glow-sm group-hover:bg-card/80 active:scale-[0.985]">
        <div className="absolute -top-5 -start-5 h-14 w-14 rounded-2xl bg-linear-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center font-extrabold text-xl shadow-glow-sm group-hover:shadow-glow group-hover:scale-110 transition-all duration-500 z-10">
          <span className="relative z-10">{index + 1}</span>
          <div className="absolute inset-0 rounded-2xl bg-primary/20 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>

        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-primary/15 to-primary/5 text-primary mb-6 group-hover:bg-linear-to-br group-hover:from-primary group-hover:to-primary/80 group-hover:text-primary-foreground transition-all duration-500 group-hover:scale-110 group-hover:rotate-6 shadow-lg">
          <step.icon className="h-9 w-9 transition-transform duration-500 group-hover:scale-110" />
        </div>

        <h3 className="text-2xl font-extrabold text-foreground mb-4 group-hover:text-primary transition-colors duration-300">
          {step.title}
        </h3>
        <p className="flex-1 text-base leading-relaxed text-muted-foreground transition-colors duration-300 group-hover:text-foreground/80">
          {step.description}
        </p>

        <div className="absolute bottom-0 start-0 end-0 h-1 bg-linear-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-b-3xl" />
      </div>
    </div>
  )
})

const MobileStepsCarousel = React.memo(function MobileStepsCarousel({
  language,
  direction,
  steps,
}: {
  language: string
  direction: "ltr" | "rtl"
  steps: Array<{ icon: any; title: string; description: string }>
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
        {steps.map((step, index) => (
          <div key={index} className="snap-center shrink-0 w-[85%] sm:w-[70%]">
            <HowItWorksStep step={step} index={index} language={language} isLast={index === steps.length - 1} />
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

export default function HowItWorks() {
  const { language, direction } = useLanguage()

  const howItWorksSteps = [
    {
      icon: Search,
      title: language === "ar" ? "ابحث عن ملعب" : "Search for a Court",
      description:
        language === "ar"
          ? "استخدم محرك البحث المتقدم للعثور على أفضل الملاعب القريبة منك"
          : "Use our advanced search engine to find the best courts near you",
    },
    {
      icon: Calendar,
      title: language === "ar" ? "اختر الوقت" : "Choose Your Time",
      description:
        language === "ar"
          ? "حدد التاريخ والوقت المناسبين من الجدول الزمني المتاح"
          : "Select your preferred date and time from the available schedule",
    },
    {
      icon: CreditCard,
      title: language === "ar" ? "أكد الحجز بسهولة" : "Confirm with confidence",
      description:
        language === "ar"
          ? "اعرض السعر بوضوح وقدم خطوة تأكيد مريحة واحترافية"
          : "Keep pricing transparent and make confirmation feel secure and effortless",
    },
    {
      icon: CheckCircle2,
      title: language === "ar" ? "استمتع باللعب" : "Enjoy Playing",
      description:
        language === "ar"
          ? "احصل على تأكيد فوري واذهب للعب في الوقت المحدد"
          : "Get instant confirmation and go play at your scheduled time",
    },
  ]

  return (
    <section className="relative overflow-hidden pt-24 pb-32 sm:py-32">
      <div className="absolute inset-0 pattern-dots opacity-10" />
      <div className="container-responsive relative">
        <LandingAnimatedContainer animation="slide-up" className="text-center max-w-3xl mx-auto mb-16">
          <Badge className="mb-4 rounded-full px-4 py-2 bg-primary/10 text-primary border-primary/20">
            <Layers className="h-4 w-4 me-2" />
            {language === "ar" ? "كيف يعمل" : "How It Works"}
          </Badge>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-foreground text-balance">
            {language === "ar" ? "احجز في 4 خطوات بسيطة" : "Book in 4 Simple Steps"}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground text-pretty">
            {language === "ar"
              ? "عملية حجز سريعة وسهلة لتحصل على أفضل تجربة"
              : "Quick and easy booking process for the best experience"}
          </p>
        </LandingAnimatedContainer>

        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
          {howItWorksSteps.map((step, index) => (
            <LandingAnimatedContainer key={index} animation="scale-in" delay={index * 0.15} className="h-full">
              <HowItWorksStep
                step={step}
                index={index}
                language={language}
                isLast={index === howItWorksSteps.length - 1}
              />
            </LandingAnimatedContainer>
          ))}
        </div>
        <div className="md:hidden">
          <MobileStepsCarousel language={language} direction={direction} steps={howItWorksSteps} />
        </div>
      </div>
    </section>
  )
}
