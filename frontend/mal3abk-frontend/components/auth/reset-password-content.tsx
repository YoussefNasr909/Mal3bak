"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound, Loader2, Lock, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useLanguage } from "@/components/providers/language-provider"
import { toast } from "sonner"
import { AuthNavbar } from "@/components/auth/auth-navbar"
import { authResetPassword, ApiError } from "@/lib/api"
import { cn } from "@/lib/utils"
import {
  buildPasswordSchema,
  getPasswordRequirements,
  getPasswordStrength,
  getPasswordValidationMessages,
  passwordStrengthColors,
  passwordStrengthLabels,
} from "@/lib/password-validation"

function schemaFor(lang: "ar" | "en") {
  const msgs = getPasswordValidationMessages(lang)

  return z
    .object({
      newPassword: buildPasswordSchema(lang),
      confirmPassword: z.string(),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      message: msgs.confirmMismatch,
      path: ["confirmPassword"],
    })
}

type FormValues = {
  newPassword: string
  confirmPassword: string
}

export function ResetPasswordContent() {
  const { language, direction } = useLanguage()
  const lang = language === "ar" ? "ar" : "en"
  const router = useRouter()
  const searchParams = useSearchParams()
  const [hashParams, setHashParams] = useState<URLSearchParams>(() => {
    if (typeof window === "undefined") return new URLSearchParams()
    return new URLSearchParams(window.location.hash.replace(/^#/, ""))
  })

  useEffect(() => {
    const syncHashParams = () => {
      setHashParams(new URLSearchParams(window.location.hash.replace(/^#/, "")))
    }

    syncHashParams()
    window.addEventListener("hashchange", syncHashParams)
    return () => window.removeEventListener("hashchange", syncHashParams)
  }, [])

  const uid = hashParams.get("uid") || searchParams.get("uid") || ""
  const token = hashParams.get("token") || searchParams.get("token") || ""

  const ArrowIcon = direction === "rtl" ? ArrowRight : ArrowLeft
  const schema = useMemo(() => schemaFor(lang), [lang])

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  })

  const [loading, setLoading] = useState(false)
  const [show1, setShow1] = useState(false)
  const [show2, setShow2] = useState(false)
  const [password, setPassword] = useState("")

  const newPasswordField = form.register("newPassword")
  const confirmPasswordField = form.register("confirmPassword")

  const passwordStrength = getPasswordStrength(password)
  const passwordRequirements = useMemo(() => getPasswordRequirements(password, lang), [password, lang])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!uid || !token) {
      toast.error(lang === "ar" ? "الرابط غير صالح" : "Invalid link")
      return
    }

    const ok = await form.trigger()
    if (!ok) return

    const values = form.getValues()
    setLoading(true)
    try {
      await authResetPassword({ userId: uid, token, newPassword: values.newPassword })

      toast.success(lang === "ar" ? "تم تغيير كلمة المرور" : "Password updated", {
        description: lang === "ar" ? "يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة" : "You can now sign in with your new password",
      })

      router.push("/auth/login")
    } catch (err: any) {
      if (err instanceof ApiError) {
        toast.error(err.message)
      } else {
        toast.error(lang === "ar" ? "فشل تغيير كلمة المرور" : "Failed to reset password")
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <AuthNavbar />
      <main className="min-h-screen flex items-center justify-center bg-background px-4 pt-24">
        <Card className="w-full max-w-md border-border/50">
          <CardHeader>
            <div className="mb-4 flex items-center justify-between">
              <Link href="/auth/login" className="text-muted-foreground transition-colors hover:text-foreground">
                {direction === "rtl" ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
              </Link>
            </div>
            <CardTitle className="text-2xl">{lang === "ar" ? "تعيين كلمة مرور جديدة" : "Set a new password"}</CardTitle>
          </CardHeader>

          <CardContent>
            {!uid || !token ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {lang === "ar" ? "الرابط غير صالح أو منتهي." : "The link is invalid or has expired."}
                </p>
                <Button asChild className="w-full rounded-lg">
                  <Link href="/auth/forgot-password">{lang === "ar" ? "طلب رابط جديد" : "Request a new link"}</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="mb-2 text-sm text-muted-foreground">
                  {lang === "ar"
                    ? "استخدم نفس معايير كلمة المرور القوية الموجودة في التسجيل."
                    : "Use the same strong password rules as the registration form."}
                </p>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{lang === "ar" ? "كلمة المرور الجديدة" : "New password"}</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      {...newPasswordField}
                      type={show1 ? "text" : "password"}
                      dir={lang === "ar" ? "rtl" : "ltr"}
                      autoComplete="new-password"
                      placeholder={lang === "ar" ? "أدخل كلمة المرور الجديدة" : "Enter new password"}
                      className={`pe-12 ps-10 ${lang === "ar" ? "text-right" : "text-left"}`}
                      onChange={(e) => {
                        newPasswordField.onChange(e)
                        setPassword(e.target.value)
                      }}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute end-1 top-1/2 h-9 w-9 -translate-y-1/2"
                      onClick={() => setShow1((v) => !v)}
                      aria-label={
                        show1
                          ? lang === "ar"
                            ? "إخفاء كلمة المرور"
                            : "Hide password"
                          : lang === "ar"
                            ? "إظهار كلمة المرور"
                            : "Show password"
                      }
                    >
                      {show1 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>

                  {password && (
                    <div className="mt-3 space-y-2">
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className={cn(
                              "h-1.5 flex-1 rounded-full transition-all duration-300",
                              i < passwordStrength
                                ? passwordStrengthColors[Math.max(passwordStrength - 1, 0)]
                                : "bg-muted",
                            )}
                          />
                        ))}
                      </div>

                      <p className="text-xs text-muted-foreground">
                        {lang === "ar" ? "قوة كلمة المرور: " : "Password strength: "}
                        <span
                          className={cn(
                            "font-medium",
                            passwordStrength >= 4 ? "text-emerald-500" : "text-amber-500",
                          )}
                        >
                          {lang === "ar"
                            ? passwordStrengthLabels.ar[Math.max(passwordStrength - 1, 0)]
                            : passwordStrengthLabels.en[Math.max(passwordStrength - 1, 0)]}
                        </span>
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        {passwordRequirements.map((req, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs">
                            {req.met ? (
                              <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                            ) : (
                              <X className="h-3 w-3 shrink-0 text-muted-foreground" />
                            )}
                            <span className={req.met ? "text-foreground" : "text-muted-foreground"}>{req.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {form.formState.errors.newPassword && (
                    <p className="text-xs text-destructive">{form.formState.errors.newPassword.message}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{lang === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      {...confirmPasswordField}
                      type={show2 ? "text" : "password"}
                      dir={lang === "ar" ? "rtl" : "ltr"}
                      autoComplete="new-password"
                      placeholder={lang === "ar" ? "أعد إدخال كلمة المرور" : "Re-enter password"}
                      className={`pe-12 ps-10 ${lang === "ar" ? "text-right" : "text-left"}`}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute end-1 top-1/2 h-9 w-9 -translate-y-1/2"
                      onClick={() => setShow2((v) => !v)}
                      aria-label={
                        show2
                          ? lang === "ar"
                            ? "إخفاء كلمة المرور"
                            : "Hide password"
                          : lang === "ar"
                            ? "إظهار كلمة المرور"
                            : "Show password"
                      }
                    >
                      {show2 ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {form.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">{form.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full rounded-lg" disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="me-2 h-4 w-4 animate-spin" />
                      {lang === "ar" ? "جارٍ الحفظ..." : "Saving..."}
                    </>
                  ) : (
                    <>
                      <KeyRound className="me-2 h-4 w-4" />
                      {lang === "ar" ? "تحديث كلمة المرور" : "Update password"}
                    </>
                  )}
                </Button>
              </form>
            )}

            <div className="mt-6 text-center text-sm text-muted-foreground">
              <Link href="/auth/login" className="inline-flex items-center gap-2 font-medium text-primary hover:underline">
                <ArrowIcon className="h-4 w-4" />
                {lang === "ar" ? "العودة لتسجيل الدخول" : "Back to login"}
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  )
}
