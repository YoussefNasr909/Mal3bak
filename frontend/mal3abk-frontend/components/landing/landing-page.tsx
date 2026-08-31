"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { ArrowLeft, ArrowRight, Instagram, Menu, X } from "lucide-react"

import { HeaderLogo } from "@/components/branding/header-logo"
import { useAuth } from "@/components/providers/auth-provider"
import { useLanguage } from "@/components/providers/language-provider"
import { Button } from "@/components/ui/button"
import { LazySection } from "@/components/ui/lazy-section"
import { NavbarPreferenceControls } from "@/components/ui/navbar-preference-controls"
import { cn } from "@/lib/utils"
import Hero from "./Hero"

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

const Features = dynamic(() => import("./Features"), {
  ssr: false,
  loading: () => <div className="h-96 bg-gradient-to-b from-background to-muted/20" />,
})
const HowItWorks = dynamic(() => import("./HowItWorks"), {
  ssr: false,
  loading: () => <div className="h-96 bg-gradient-to-b from-background to-muted/20" />,
})
const Courts = dynamic(() => import("./Courts"), {
  ssr: false,
  loading: () => <div className="h-96 bg-gradient-to-b from-background to-muted/20" />,
})
const Footer = dynamic(() => import("./Footer"), {
  ssr: false,
  loading: () => <div className="h-40 bg-gradient-to-b from-background to-muted/20" />,
})

export function LandingPage() {
  const { language, direction } = useLanguage()
  const { user } = useAuth()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      const next = window.scrollY > 24
      setScrolled((prev) => (prev === next ? prev : next))
    }

    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const effectiveRole = user?.role || null

  const homeHref =
    effectiveRole === "admin"
      ? "/dashboard/admin"
      : effectiveRole === "manager"
        ? "/dashboard/manager"
        : effectiveRole === "player"
          ? "/dashboard/player"
          : "/"

  const browseHref =
    effectiveRole === "player" ? "/dashboard/player/browse" : homeHref

  const ArrowIcon = direction === "rtl" ? ArrowLeft : ArrowRight

  const navLinks = [
    { label: language === "ar" ? "كيف يعمل" : "How It Works", href: "#how-it-works" },
    { label: language === "ar" ? "المميزات" : "Features", href: "#features" },
    { label: language === "ar" ? "الملاعب" : "Courts", href: "#courts" },
  ]

  const loginAction = {
    href: "/auth/login",
    label: language === "ar" ? "تسجيل الدخول" : "Sign In",
  }

  const registerAction = {
    href: effectiveRole ? browseHref : "/auth/register",
    label: language === "ar" ? "احجز ملعبك" : "Reserve a Court",
  }

  const scrollToSection = (href: string) => {
    const element = document.querySelector(href)
    if (!element) return

    const top = element.getBoundingClientRect().top + window.scrollY - 108
    window.scrollTo({ top, behavior: "smooth" })
    setIsMenuOpen(false)
  }

  return (
    <div
      className={cn("min-h-screen bg-background", direction === "rtl" ? "rtl" : "ltr")}
      dir={direction}
      suppressHydrationWarning
    >
      <header
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-300",
          scrolled
            ? "py-3"
            : "border-b border-border/40 bg-background/90 backdrop-blur-xl supports-[backdrop-filter]:bg-background/82 dark:border-white/10 dark:bg-slate-950/78",
        )}
      >
        <nav className="container-responsive">
          <div className="relative">
            <div
              className={cn(
                "flex h-16 items-center justify-between gap-3 px-4 sm:px-5 lg:px-6 transition-all duration-300",
                scrolled
                  ? "rounded-2xl border border-border/80 bg-background/92 shadow-smooth-lg backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/78 dark:shadow-[0_18px_48px_rgba(2,6,23,0.55)]"
                  : "rounded-none border border-transparent bg-transparent shadow-none",
              )}
            >
              <Link href={homeHref} className="flex min-w-0 items-center">
                <HeaderLogo
                  language={language as "ar" | "en"}
                  priority
                  className="h-10 w-[126px] sm:h-11 sm:w-[142px] lg:h-12 lg:w-[156px]"
                />
              </Link>

              <div
                className={cn(
                  "hidden md:flex items-center rounded-full border border-border/50 bg-background/76 p-1 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all duration-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-[0_16px_30px_rgba(2,6,23,0.3)]",
                  scrolled && "border-border/60 bg-background/82 dark:bg-slate-950/74",
                )}
              >
                {navLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className={cn(
                      "rounded-full px-4 py-2.5 text-sm font-semibold text-muted-foreground transition-all duration-200 hover:bg-background/88 hover:text-foreground dark:text-slate-300 dark:hover:bg-white/[0.06] dark:hover:text-white",
                    )}
                    onClick={(event) => {
                      event.preventDefault()
                      scrollToSection(link.href)
                    }}
                  >
                    {link.label}
                  </a>
                ))}
              </div>

              <div
                className={cn(
                  "hidden md:flex items-center rounded-full border border-border/50 bg-background/76 p-1.5 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all duration-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-[0_16px_30px_rgba(2,6,23,0.3)]",
                  scrolled && "border-border/60 bg-background/82 dark:bg-slate-950/74",
                )}
              >
                <NavbarPreferenceControls
                  className="border-0 bg-transparent p-0 shadow-none backdrop-blur-0 dark:bg-transparent dark:shadow-none"
                />

                <div className="mx-1.5 h-7 w-px bg-border/40 dark:bg-white/[0.14]" />

                <Button
                  variant="ghost"
                  className={cn(
                    "h-10 rounded-full px-4 text-sm font-semibold text-foreground transition-all duration-300 hover:bg-background/88 hover:text-primary dark:text-slate-100 dark:hover:bg-white/[0.06] dark:hover:text-white",
                  )}
                  asChild
                >
                  <Link href={loginAction.href}>{loginAction.label}</Link>
                </Button>

                <Button
                  className="ms-1 h-10 rounded-full px-4.5 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-primary/95 dark:bg-primary dark:text-primary-foreground dark:shadow-[0_10px_26px_rgba(59,130,246,0.32)] dark:hover:bg-[#5aa2ff] dark:hover:text-white dark:hover:shadow-[0_14px_32px_rgba(59,130,246,0.42)]"
                  asChild
                >
                  <Link href={registerAction.href} className="group flex items-center gap-2">
                    {registerAction.label}
                    <ArrowIcon
                      className={cn(
                        "h-4 w-4 transition-transform duration-200",
                        direction === "rtl" ? "group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5",
                      )}
                    />
                  </Link>
                </Button>
              </div>

              <div
                className={cn(
                  "flex items-center rounded-full border p-1 md:hidden",
                  scrolled
                    ? "border-border/35 bg-background/72 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/68 dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-[0_14px_28px_rgba(0,0,0,0.26)]"
                    : "border-border/45 bg-background/82 shadow-md backdrop-blur-2xl dark:border-white/[0.08] dark:bg-slate-950/78",
                )}
              >
                <NavbarPreferenceControls
                  compact
                  className="border-0 bg-transparent p-0 shadow-none backdrop-blur-0 dark:bg-transparent dark:shadow-none"
                />

                <div className="mx-0.5 h-5 w-px bg-border/20 dark:bg-white/[0.08]" />

                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-10 sm:size-11 rounded-full text-foreground transition-all duration-300 hover:bg-primary/10 hover:text-primary",
                    isMenuOpen && "bg-primary/10 text-primary",
                  )}
                  onClick={() => setIsMenuOpen((open) => !open)}
                  aria-label={
                    isMenuOpen
                      ? language === "ar"
                        ? "إغلاق القائمة"
                        : "Close menu"
                      : language === "ar"
                        ? "فتح القائمة"
                        : "Open menu"
                  }
                  aria-expanded={isMenuOpen}
                >
                  {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </Button>
              </div>
            </div>

            {isMenuOpen ? (
              <div
                className={cn(
                  "absolute inset-x-0 md:hidden animate-slide-down overflow-hidden bg-background/96 backdrop-blur-2xl",
                  scrolled
                    ? "top-[calc(100%+0.6rem)] rounded-2xl border border-border/80 shadow-smooth-lg dark:border-white/10 dark:bg-slate-950/92"
                    : "top-full rounded-b-3xl border-x border-b border-border/50 shadow-sm dark:border-white/10 dark:bg-slate-950/92",
                )}
              >
                <div className="flex flex-col gap-1 px-3 py-3">
                  {navLinks.map((link) => (
                    <button
                      key={link.href}
                      type="button"
                      className={cn(
                        "rounded-xl px-3 py-3 text-start text-sm font-medium transition-colors duration-200",
                        "text-foreground hover:bg-muted/70 dark:text-slate-100 dark:hover:bg-white/[0.06] dark:hover:text-white",
                      )}
                      onClick={() => scrollToSection(link.href)}
                    >
                      {link.label}
                    </button>
                  ))}
                </div>

                <div className="border-t border-border/50 px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-border/70 bg-background/92 px-2 py-2 shadow-smooth dark:border-white/10 dark:bg-white/[0.04]">
                    <Button
                      variant="ghost"
                      className="h-10 rounded-full px-4 text-sm font-semibold text-foreground transition-all duration-200 hover:-translate-y-0.5 hover:bg-muted hover:text-primary hover:shadow-sm dark:text-slate-100 dark:hover:bg-white/[0.07] dark:hover:text-white"
                      asChild
                    >
                      <Link href={loginAction.href}>{loginAction.label}</Link>
                    </Button>

                    <Button
                      className="ms-auto h-11 rounded-full px-5 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-glow-sm hover:bg-primary/95 dark:bg-primary dark:text-primary-foreground dark:shadow-[0_10px_26px_rgba(59,130,246,0.32)] dark:hover:bg-[#5aa2ff] dark:hover:text-white dark:hover:shadow-[0_14px_32px_rgba(59,130,246,0.42)]"
                      asChild
                    >
                      <Link href={registerAction.href} className="group flex items-center gap-2">
                        {registerAction.label}
                        <ArrowIcon
                          className={cn(
                            "h-4 w-4 transition-transform duration-200",
                            direction === "rtl" ? "group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5",
                          )}
                        />
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Mobile Drawer Social Links */}
                <div className="border-t border-border/50 pt-3 pb-3 px-4 mt-auto">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {language === "ar" ? "تابعنا على" : "Follow Us"}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <Link
                        href="https://www.tiktok.com/@mal3bk.eg?_r=1&_t=ZS-94vmVUpLBYN"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-foreground transition-all duration-200 hover:scale-105 hover:border-primary hover:bg-primary hover:text-white dark:hover:text-slate-950"
                        aria-label="TikTok @mal3bk.eg"
                      >
                        <TikTokIcon className="h-4 w-4" />
                      </Link>
                      <Link
                        href="https://www.instagram.com/mal3bk.eg?igsh=a3kzcHFpcWdvb2d6"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/80 bg-muted/60 text-foreground transition-all duration-200 hover:scale-105 hover:border-pink-500 hover:bg-gradient-to-tr hover:from-amber-500 hover:via-rose-500 hover:to-purple-600 hover:text-white"
                        aria-label="Instagram @mal3bk.eg"
                      >
                        <Instagram className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </nav>
      </header>

      <main>
        <Hero />

        <section id="how-it-works" className="scroll-mt-28">
          <LazySection minHeight="760px">
            <HowItWorks />
          </LazySection>
        </section>
        <section id="features" className="scroll-mt-28">
          <LazySection minHeight="980px">
            <Features />
          </LazySection>
        </section>
        <section id="courts" className="scroll-mt-28">
          <LazySection minHeight="1200px">
            <Courts />
          </LazySection>
        </section>
        <LazySection minHeight="260px">
          <Footer homeHref={homeHref} />
        </LazySection>
      </main>
    </div>
  )
}
