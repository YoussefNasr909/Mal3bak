"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Copy,
  Home,
  LogIn,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react"
import { AuthNavbar } from "@/components/auth/auth-navbar"
import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AnimatedContainer } from "@/components/ui/animated-container"
import { getDefaultDashboardPath } from "@/lib/auth-routing"

type RecentRegistration = {
  name?: string
  email?: string
  role?: "admin" | "manager" | "player"
}

function RoleBadge({ role, lang }: { role?: RecentRegistration["role"]; lang: "ar" | "en" }) {
  if (!role) return null

  const map = {
    admin: { ar: "مشرف", en: "Admin", icon: ShieldCheck },
    manager: { ar: "مدير", en: "Manager", icon: BadgeCheck },
    player: { ar: "لاعب", en: "Player", icon: UserRound },
  } as const

  const item = map[role]
  const Icon = item.icon

  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-semibold">
      <Icon className="h-4 w-4 text-primary" />
      {lang === "ar" ? item.ar : item.en}
    </span>
  )
}

export default function WelcomePage() {
  const { language, direction } = useLanguage()
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const lang = language === "ar" ? "ar" : "en"

  const [mounted, setMounted] = useState(false)
  const [info, setInfo] = useState<RecentRegistration | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setMounted(true)
    document.title = "Welcome | Mal3bk"
    try {
      const raw = sessionStorage.getItem("mal3bk_recent_registration")
      if (raw) setInfo(JSON.parse(raw))
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!isLoading && user) {
      router.replace(getDefaultDashboardPath(user.role))
    }
  }, [isLoading, router, user])

  const t = useMemo(() => {
    const tr = (arText: string, enText: string) => (lang === "ar" ? arText : enText)
    return {
      tr,
      back: tr("رجوع", "Back"),
      title: tr("مرحباً بك", "Welcome"),
      subtitle: tr("تم إنشاء حسابك بنجاح", "Your account has been created successfully"),
      signIn: tr("تسجيل الدخول", "Sign in"),
      home: tr("الرئيسية", "Home"),
      emailLabel: tr("البريد المسجل", "Registered email"),
      copy: tr("نسخ", "Copy"),
      copied: tr("تم!", "Copied!"),
      next: tr("الخطوة التالية", "Next step"),
      next1: tr("سجّل الدخول وابدأ الاستخدام", "Sign in and start using the app"),
      next2: tr("استكشف الملاعب والخدمات", "Explore courts and features"),
    }
  }, [lang])

  const name = mounted && info?.name ? info.name : ""
  const email = mounted ? info?.email : undefined
  const role = mounted ? info?.role : undefined

  if (!isLoading && user) {
    return null
  }

  async function copyEmailToClipboard() {
    if (!email) return
    try {
      await navigator.clipboard.writeText(email)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 900)
    } catch {
      // ignore
    }
  }

  return (
    <>
      <AuthNavbar />

      <main className="relative min-h-screen bg-background px-4 pt-24">
        {/* subtle background */}
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-primary/12 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-muted/20 blur-3xl" />
        </div>

        <div className="mx-auto w-full max-w-2xl py-8">
          <div className="animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both">
            <Card className="border-border/60 bg-card/70 backdrop-blur">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="icon" className="rounded-2xl" asChild>
                    <Link href="/auth/login" aria-label={t.back}>
                      {direction === "rtl" ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
                    </Link>
                  </Button>

                  <div className="flex items-center gap-2">
                    <RoleBadge role={role} lang={lang} />
                    <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-muted/40 px-3 py-1 text-xs font-semibold">
                      <Sparkles className="h-4 w-4 text-primary" />
                      {t.tr("جاهز", "Ready")}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <CardTitle className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    <span className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-6 w-6 text-primary" />
                      {t.title}
                      {name ? <span className="text-primary">{lang === "ar" ? `، ${name}` : `, ${name}`}</span> : null}
                    </span>
                  </CardTitle>
                  <CardDescription className="text-sm sm:text-base">{t.subtitle}</CardDescription>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Email row (compact) */}
                {email ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="text-primary">
                        <Mail className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">{t.emailLabel}</div>
                        <div className="truncate text-sm font-semibold">{email}</div>
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="rounded-xl"
                      onClick={copyEmailToClipboard}
                    >
                      <Copy className="me-2 h-4 w-4" />
                      {copied ? t.copied : t.copy}
                    </Button>
                  </div>
                ) : null}

                {/* Actions */}
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button asChild className="h-11 flex-1 rounded-2xl">
                    <Link href="/auth/login">
                      <LogIn className="me-2 h-5 w-5" />
                      {t.signIn}
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 flex-1 rounded-2xl">
                    <Link href="/">
                      <Home className="me-2 h-5 w-5" />
                      {t.home}
                    </Link>
                  </Button>
                </div>

                {/* Next step (short) */}
                <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
                  <div className="mb-2 text-sm font-bold">{t.next}</div>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      </span>
                      <span>{t.next1}</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-primary/15">
                        <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      </span>
                      <span>{t.next2}</span>
                    </li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </>
  )
}
