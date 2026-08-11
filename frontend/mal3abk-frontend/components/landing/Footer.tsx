"use client"

import Link from "next/link"
import { Instagram } from "lucide-react"
import { HeaderLogo } from "@/components/branding/header-logo"
import { useLanguage } from "@/components/providers/language-provider"

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 256 256"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        d="M197.6 80.9c-16.9-9.1-30.5-23.4-38.4-40.9h-28.7v122.7c0 23.1-18.7 41.9-41.9 41.9S46.7 186 46.7 162.7c0-23.1 18.7-41.9 41.9-41.9c3.9 0 7.6.6 11.2 1.6v-29.6c-3.7-.5-7.4-.8-11.2-.8c-40.1 0-72.5 32.5-72.5 72.5s32.5 72.5 72.5 72.5c40.1 0 72.5-32.5 72.5-72.5V56.3c11.9 20.4 32.5 35.2 56.4 39v-14.4z"
      />
    </svg>
  )
}

export default function Footer({ homeHref }: { homeHref: string }) {
  const { language } = useLanguage()

  return (
    <footer className="border-t border-border/50 bg-linear-to-b from-card/75 to-background backdrop-blur-xl">
      <div className="container-responsive pt-16 pb-12">
        <div className="flex flex-col items-center gap-8 text-center">
          <div className="flex max-w-lg flex-col items-center">
            <Link href={homeHref} className="mb-6 flex items-center gap-3 group">
              <HeaderLogo language={language as "ar" | "en"} className="h-10 w-[120px]" />
            </Link>

            <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
              {language === "ar"
                ? "Mal3bk منصة حديثة لاكتشاف وحجز ملاعب كرة القدم والبادل والرياضات المختلفة في مصر، مع توافر لحظي وتجربة حجز موثوقة."
                : "Mal3bk is a modern platform for discovering and reserving football, padel, and multi-sport courts in Egypt with live availability and reliable instant confirmation."}
            </p>

            <div className="mt-8 flex gap-4">
              <Link
                href="https://www.tiktok.com/@mal3bk.eg?_r=1&_t=ZS-94vmVUpLBYN"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground shadow-sm transition-all duration-300 hover:scale-105 hover:border-primary hover:bg-primary hover:text-primary-foreground"
                aria-label="TikTok"
              >
                <TikTokIcon className="h-6 w-6" />
              </Link>
              <Link
                href="https://www.instagram.com/mal3bk.eg?igsh=a3kzcHFpcWdvb2d6"
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-muted-foreground shadow-sm transition-all duration-300 hover:scale-105 hover:border-primary hover:bg-primary hover:text-primary-foreground"
                aria-label="Instagram"
              >
                <Instagram className="h-6 w-6" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-border/30 bg-background/10 pb-6 pt-10">
        <div className="container-responsive flex flex-col items-center justify-center px-4">
          <p className="text-center text-sm font-medium text-muted-foreground opacity-70">
            {language === "ar" ? "© ٢٠٢٦ ملعبك. جميع الحقوق محفوظة." : "© 2026 Mal3bk. All rights reserved."}
          </p>
        </div>
      </div>
    </footer>
  )
}
