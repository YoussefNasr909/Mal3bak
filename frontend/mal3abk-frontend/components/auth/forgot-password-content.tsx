"use client"

import { useState, useEffect, useMemo } from "react"
import Link from "next/link"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle, Loader2, ShieldCheck } from "lucide-react"

import { AuthNavbar } from "@/components/auth/auth-navbar"
import { AnimatedContainer } from "@/components/ui/animated-container"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/components/providers/language-provider"
import { authForgotPassword } from "@/lib/api"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type ForgotPasswordResult = {
  email: string
}

export function ForgotPasswordContent() {
  const { language, direction, t } = useLanguage()
  const lang = language === "ar" ? "ar" : "en"
  const [isLoading, setIsLoading] = useState(false)
  const [isHydrated, setIsHydrated] = useState(false)
  const [result, setResult] = useState<ForgotPasswordResult | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  const ArrowIcon = direction === "rtl" ? ArrowRight : ArrowLeft

  const schema = useMemo(() => z.object({
    email: z.string().trim().email(lang === "ar" ? "البريد الإلكتروني غير صالح" : "Invalid email"),
  }), [lang])

  const form = useForm<{ email: string }>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
    mode: "onSubmit",
    reValidateMode: "onSubmit",
  })

  const normalizeEmail = (value: string) => value.trim().toLowerCase()
  const genericResetRequestError =
    lang === "ar"
      ? "تعذر إرسال طلب إعادة التعيين الآن. حاول مرة أخرى."
      : "We couldn't submit the reset request right now. Please try again."

  const onSubmit = async (data: { email: string }) => {
    setIsLoading(true)
    setSubmitError(null)
    try {
      const email = normalizeEmail(data.email)
      await authForgotPassword({ email })

      setResult({ email })
    } catch {
      setSubmitError(genericResetRequestError)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTryAnotherEmail = () => {
    if (result) {
      form.reset({ email: result.email })
    }
    setResult(null)
    setSubmitError(null)
  }

  const handleResend = async () => {
    if (!result?.email) {
      toast.error(lang === "ar" ? "لا يوجد بريد لإعادة الإرسال" : "No email available to resend")
      return
    }

    setIsLoading(true)
    try {
      await authForgotPassword({ email: result.email })
      setResult({ email: result.email })
      toast.success(lang === "ar" ? "تم إرسال الرابط مرة أخرى" : "Reset link sent again")
    } catch {
      toast.error(genericResetRequestError)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#F8F9FB] font-sans dark:bg-background">
      <AuthNavbar />
      <div className="h-20 shrink-0 md:h-24" />

      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-primary/5 to-transparent" />

      <main className="relative z-10 flex flex-1 flex-col px-4 pb-12 pt-4 sm:pb-16 md:px-8 lg:py-5 xl:py-6">
        <div className="mx-auto flex w-full max-w-[680px] flex-1 items-center">
          <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both">
            <section className="relative overflow-hidden rounded-[2.5rem] border border-border/60 bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] dark:border-white/[0.15] dark:bg-slate-950/80 dark:shadow-[0_0_40px_rgba(0,0,0,0.8)]">
              <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/35 to-transparent" />
              <div className="p-5 sm:p-8 md:p-10 lg:p-12">
                <div className="mb-8 flex items-center justify-between gap-4">
                  <Link
                    href="/auth/login"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/55 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    aria-label={lang === "ar" ? "العودة لتسجيل الدخول" : "Back to login"}
                  >
                    <ArrowIcon className="h-5 w-5" />
                  </Link>

                  <div className="flex items-center gap-2 rounded-full border border-primary/10 bg-primary/5 px-3 py-2 text-xs font-bold text-primary">
                    <ShieldCheck className="h-4 w-4" />
                    <span>{lang === "ar" ? "استعادة آمنة" : "Secure recovery"}</span>
                  </div>
                </div>

                <div className={cn("mb-8 space-y-3", lang === "ar" ? "text-right" : "text-left")}>
                  <h1 className="text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-[2.5rem]">
                    {lang === "ar" ? "استعادة كلمة المرور" : "Reset your password"}
                  </h1>
                  <p className="max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-base">
                    {lang === "ar"
                      ? "أدخل بريد حسابك وسنرسل لك رابطاً آمناً لتعيين كلمة مرور جديدة والعودة إلى ملعبك."
                      : "Enter your account email and we'll send a secure link to help you create a new password."}
                  </p>
                </div>

                <div
                  className={cn(
                    "pointer-events-none absolute inset-0 z-50 rounded-[2.5rem] bg-background/35 transition-opacity",
                    isLoading ? "opacity-100" : "opacity-0",
                  )}
                />

                {result ? (
                  <AnimatedContainer animation="none">
                    <div className="space-y-6">
                      <div className="rounded-[2rem] border border-primary/10 bg-primary/5 p-6 text-center sm:p-8">
                        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
                          <CheckCircle className="h-8 w-8" />
                        </div>
                        <h2 className="text-xl font-bold text-foreground">
                          {lang === "ar" ? "تحقق من بريدك الإلكتروني" : "Check your inbox"}
                        </h2>
                        <p className="mx-auto mt-2 max-w-md text-[15px] leading-7 text-muted-foreground">
                          {lang === "ar"
                            ? "إذا كان البريد مسجلاً لدينا، ستصلك رسالة تحتوي على رابط إعادة التعيين."
                            : "If this email is registered, a password reset message will arrive shortly."}
                        </p>
                        <p className="mt-3 break-all text-[15px] font-bold text-primary" dir="ltr">
                          {result.email}
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 rounded-2xl font-bold text-[14px] sm:h-14"
                          onClick={handleResend}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="me-2 h-4 w-4 animate-spin" />
                              {lang === "ar" ? "جارٍ الإرسال" : "Sending"}
                            </>
                          ) : lang === "ar" ? (
                            "إرسال الرابط مرة أخرى"
                          ) : (
                            "Resend link"
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-12 rounded-2xl font-bold text-[14px] sm:h-14"
                          onClick={handleTryAnotherEmail}
                        >
                          {lang === "ar" ? "استخدام بريد آخر" : "Use another email"}
                        </Button>
                      </div>

                      <Button
                        asChild
                        className="h-12 w-full rounded-2xl text-[15px] font-bold shadow-[0_12px_28px_rgba(13,71,161,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(13,71,161,0.3)] sm:h-14"
                      >
                        <Link href="/auth/login">{lang === "ar" ? "العودة لتسجيل الدخول" : "Back to login"}</Link>
                      </Button>
                    </div>
                  </AnimatedContainer>
                ) : (
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                    {submitError && (
                      <AnimatedContainer animation="none">
                        <div className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3.5 text-destructive">
                          <AlertCircle className="h-5 w-5 shrink-0" />
                          <span className="text-sm font-medium">{submitError}</span>
                        </div>
                      </AnimatedContainer>
                    )}

                    <AnimatedContainer animation="none">
                      <label
                        htmlFor="forgot-email"
                        className={cn(
                          "mb-2 block px-1 text-[13px] font-semibold text-foreground/80",
                          language === "ar" ? "text-right" : "text-left",
                        )}
                      >
                        {language === "ar" ? "البريد الإلكتروني" : "Email"}
                      </label>
                      <div
                        className={cn(
                          "group relative rounded-2xl border border-border/50 bg-background shadow-sm transition-all duration-300 hover:border-border focus-within:border-primary focus-within:bg-background focus-within:ring-[3px] focus-within:ring-primary/10 dark:border-white/[0.12] dark:bg-white/[0.02] dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04] dark:focus-within:bg-white/[0.05]",
                          form.formState.isSubmitted &&
                            form.formState.errors.email &&
                            "border-destructive focus-within:border-destructive focus-within:ring-destructive/10",
                        )}
                      >
                        <Input
                          id="forgot-email"
                          {...form.register("email")}
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          placeholder={t("auth.email")}
                          aria-invalid={form.formState.isSubmitted && !!form.formState.errors.email}
                          className={cn(
                            "h-12 rounded-2xl border-0 bg-transparent px-5 text-[15px] placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 sm:h-14",
                            language === "ar" ? "text-right" : "text-left",
                          )}
                          onFocus={() => { if (submitError) setSubmitError(null); }}
                        />
                      </div>
                      {form.formState.isSubmitted && form.formState.errors.email && (
                        <p className="mt-1.5 text-xs font-medium text-destructive ms-2">
                          {form.formState.errors.email.message}
                        </p>
                      )}
                    </AnimatedContainer>

                    <AnimatedContainer animation="none" delay={100}>
                      <Button
                        type={isHydrated ? "submit" : "button"}
                        className="mt-2 h-12 w-full rounded-2xl text-[15px] font-bold shadow-[0_12px_28px_rgba(13,71,161,0.22)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(13,71,161,0.3)] sm:h-14 sm:mt-4"
                        disabled={!isHydrated || isLoading}
                      >
                        {!isHydrated ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : isLoading ? (
                          <>
                            <Loader2 className="me-2 h-5 w-5 animate-spin" />
                            {lang === "ar" ? "جارٍ الإرسال..." : "Sending..."}
                          </>
                        ) : lang === "ar" ? (
                          "إرسال رابط إعادة التعيين"
                        ) : (
                          "Send reset link"
                        )}
                      </Button>
                    </AnimatedContainer>
                  </form>
                )}

                {!result && (
                  <div className="mt-7 text-center text-[15px] text-muted-foreground">
                    {lang === "ar" ? "تذكرت كلمة المرور؟ " : "Remember your password? "}
                    <Link href="/auth/login" className="font-bold text-primary transition-colors hover:text-primary/80">
                      {lang === "ar" ? "تسجيل الدخول" : "Sign in"}
                    </Link>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  )
}
