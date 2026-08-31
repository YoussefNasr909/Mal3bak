"use client"

import Link from "next/link"
import { Instagram, Mail, Phone, MapPin, ExternalLink } from "lucide-react"
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

export default function Footer({ homeHref = "/" }: { homeHref?: string }) {
  const { language } = useLanguage()
  const isAr = language === "ar"
  const tr = (ar: string, en: string) => (isAr ? ar : en)

  return (
    <footer className="border-t border-border/50 bg-gradient-to-b from-card/75 to-background backdrop-blur-xl">
      <div className="container-responsive pt-16 pb-12 px-4 sm:px-6">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:grid-cols-4 lg:gap-12">
          {/* Column 1: Brand & Community */}
          <div className="space-y-4">
            <Link href={homeHref} className="inline-flex items-center gap-2 group">
              <HeaderLogo language={language as "ar" | "en"} className="h-10 w-[120px]" />
            </Link>

            <p className="text-sm leading-relaxed text-muted-foreground">
              {tr(
                "منصة حديثة لاكتشاف وحجز ملاعب كرة القدم والبادل والرياضات المختلفة في مصر، مع توافر لحظي وتجربة حجز ودفع موثوقة.",
                "A modern platform for discovering and reserving football, padel, and multi-sport courts in Egypt with live availability and reliable payments.",
              )}
            </p>

            <div className="pt-2 space-y-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground block">
                {tr("تابعنا على", "Follow Us")}
              </span>
              <div className="flex items-center gap-3">
                <Link
                  href="https://www.tiktok.com/@mal3bk.eg?_r=1&_t=ZS-94vmVUpLBYN"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-foreground shadow-sm transition-all duration-300 hover:scale-105 hover:border-primary hover:bg-primary hover:text-white dark:hover:text-slate-950"
                  aria-label="TikTok @mal3bk.eg"
                >
                  <TikTokIcon className="h-5 w-5" />
                </Link>
                <Link
                  href="https://www.instagram.com/mal3bk.eg?igsh=a3kzcHFpcWdvb2d6"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-foreground shadow-sm transition-all duration-300 hover:scale-105 hover:border-pink-500 hover:bg-gradient-to-tr hover:from-amber-500 hover:via-rose-500 hover:to-purple-600 hover:text-white"
                  aria-label="Instagram @mal3bk.eg"
                >
                  <Instagram className="h-5 w-5" />
                </Link>
              </div>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {tr("روابط سريعة", "Quick Links")}
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  href={homeHref}
                  className="text-muted-foreground hover:text-primary transition-colors duration-200"
                >
                  {tr("الرئيسية", "Home")}
                </Link>
              </li>
              <li>
                <Link
                  href="/dashboard/player/browse"
                  className="text-muted-foreground hover:text-primary transition-colors duration-200"
                >
                  {tr("تصفح الملاعب", "Browse Courts")}
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/login"
                  className="text-muted-foreground hover:text-primary transition-colors duration-200"
                >
                  {tr("تسجيل الدخول", "Sign In")}
                </Link>
              </li>
              <li>
                <Link
                  href="/auth/register"
                  className="text-muted-foreground hover:text-primary transition-colors duration-200"
                >
                  {tr("إنشاء حساب جديد", "Register")}
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Legal */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {tr("قانوني والسياسات", "Legal & Policies")}
            </h3>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  href="/policies#privacy"
                  className="text-muted-foreground hover:text-primary transition-colors duration-200 inline-flex items-center gap-1.5"
                >
                  <span>{tr("سياسة الخصوصية", "Privacy Policy")}</span>
                </Link>
              </li>
              <li>
                <Link
                  href="/policies#refund"
                  className="text-muted-foreground hover:text-primary transition-colors duration-200 inline-flex items-center gap-1.5"
                >
                  <span>{tr("سياسة الاسترجاع والإلغاء", "Refund Policy")}</span>
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Contact Us */}
          <div className="space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              {tr("اتصل بنا", "Contact Us")}
            </h3>
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>
                  {tr(
                    "رقم ٢١، شارع النصر، حي السادات، أول أسيوط، محافظة أسيوط، مصر.",
                    "21 Al-Nasr St., Al-Sadat District, Assiut, First Assiut, Egypt",
                  )}
                </span>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="h-4 w-4 text-primary shrink-0" />
                <a
                  href="mailto:mal3bkk@gmail.com"
                  className="hover:text-primary transition-colors duration-200"
                  dir="ltr"
                >
                  mal3bkk@gmail.com
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-primary shrink-0" />
                <a
                  href="tel:+201131734350"
                  className="hover:text-primary transition-colors duration-200 font-mono"
                  dir="ltr"
                >
                  +20 11 31734350
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Copyright Sub-bar */}
      <div className="border-t border-border/40 bg-background/30 py-6">
        <div className="container-responsive flex flex-col sm:flex-row items-center justify-between gap-4 px-4 sm:px-6 text-xs text-muted-foreground">
          <p className="text-center sm:text-start">
            {tr("© ٢٠٢٦ ملعبك. جميع الحقوق محفوظة.", "© 2026 Mal3bk. All rights reserved.")}
          </p>
          <div className="flex items-center gap-6">
            <Link href="/policies#privacy" className="hover:text-foreground transition-colors">
              {tr("الخصوصية", "Privacy")}
            </Link>
            <Link href="/policies#refund" className="hover:text-foreground transition-colors">
              {tr("الاسترجاع", "Refunds")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
