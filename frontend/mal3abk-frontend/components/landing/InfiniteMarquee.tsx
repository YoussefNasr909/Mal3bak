"use client"

import { useLanguage } from "@/components/providers/language-provider"
import { CheckCircle2, Shield, Zap, Clock, Trophy, MapPin, Users, HeadphonesIcon } from "lucide-react"

export function InfiniteMarquee() {
  const { language, direction } = useLanguage()

  const items = language === "ar" ? [
    { text: "تأكيد فوري", icon: Zap },
    { text: "تحديث لحظي للمواعيد", icon: Clock },
    { text: "٥٨+ ملعب متاح", icon: MapPin },
    { text: "دعم فني ٢٤/٧", icon: HeadphonesIcon },
    { text: "تجربة حجز احترافية", icon: Trophy },
    { text: "دفع آمن", icon: Shield },
    { text: "آلاف اللاعبين", icon: Users },
    { text: "سهولة الاستخدام", icon: CheckCircle2 },
  ] : [
    { text: "Instant Confirmation", icon: Zap },
    { text: "Live Availability", icon: Clock },
    { text: "58+ Courts Available", icon: MapPin },
    { text: "24/7 Support", icon: HeadphonesIcon },
    { text: "Premium Experience", icon: Trophy },
    { text: "Secure Payments", icon: Shield },
    { text: "Thousands of Players", icon: Users },
    { text: "Easy to Use", icon: CheckCircle2 },
  ]

  // We duplicate the items 3 times to ensure a seamless infinite scroll
  // The CSS will translate by exactly 33.33% (one full set of items)
  const marqueeItems = [...items, ...items, ...items]

  return (
    <div className="relative flex overflow-hidden bg-primary/[0.03] py-5 border-y border-border/30 my-8 lg:my-16" dir={direction}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee {
          0% { transform: translateX(0%); }
          100% { transform: translateX(-33.3333%); }
        }
        @keyframes marquee-rtl {
          0% { transform: translateX(0%); }
          100% { transform: translateX(33.3333%); }
        }
        .animate-marquee {
          animation: marquee 25s linear infinite;
        }
        .rtl .animate-marquee {
          animation: marquee-rtl 25s linear infinite;
        }
      `}} />
      
      <div className="animate-marquee flex whitespace-nowrap min-w-full shrink-0 items-center justify-around gap-8 sm:gap-12 w-max hover:[animation-play-state:paused]">
        {marqueeItems.map((item, i) => {
          const Icon = item.icon
          return (
            <div key={i} className="flex items-center gap-3 px-4 transition-transform hover:scale-105 cursor-default">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm md:text-base font-semibold text-foreground/80 tracking-tight">{item.text}</span>
            </div>
          )
        })}
      </div>
      
      {/* Gradient masks for smooth fade on edges */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 sm:w-32 bg-linear-to-r from-background to-transparent z-10" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 sm:w-32 bg-linear-to-l from-background to-transparent z-10" />
    </div>
  )
}
