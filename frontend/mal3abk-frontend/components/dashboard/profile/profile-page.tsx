"use client"

import { useEffect, useMemo, useRef, useState, useCallback } from "react"
import {
  AlertTriangle,
  BarChart3,
  Calendar,
  Camera,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Lock,
  Mail,
  MapPin,
  Phone,
  RotateCcw,
  Save,
  Shield,
  Star,
  Trash2,
  Upload,
  User,
} from "lucide-react"
import { format } from "date-fns"
import { ar, enUS } from "date-fns/locale"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"
import { changePassword, deleteAccount, updateProfile, uploadAvatar } from "@/lib/api"
import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"

import { AnimatedContainer } from "@/components/ui/animated-container"
import { PageHeader } from "@/components/ui/page-header"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ProgressIndicator } from "@/components/ui/progress-indicator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDialogDesc,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type ProfileData = {
  name: string
  email: string
  phone: string
}

type ProfileErrors = Partial<Record<keyof ProfileData, string>>
type ProfileTouched = Record<keyof ProfileData, boolean>

type PasswordForm = {
  current: string
  next: string
  confirm: string
}

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
}

function normalizePhoneInput(value: string) {
  return value.replace(/\D+/g, "")
}

function createEmptyProfileTouched(): ProfileTouched {
  return {
    name: false,
    email: false,
    phone: false,
  }
}

function passwordStrength(pw: string) {
  const len = pw.length
  const hasLower = /[a-z]/.test(pw)
  const hasUpper = /[A-Z]/.test(pw)
  const hasNum = /\d/.test(pw)

  const checks = [
    { ok: len >= 8, label: "8+ characters" },
    { ok: hasLower, label: "Lowercase" },
    { ok: hasUpper, label: "Uppercase" },
    { ok: hasNum, label: "Number" },
  ]

  const score = checks.reduce((acc, c) => acc + (c.ok ? 25 : 0), 0)
  const label =
    score >= 80 ? "Strong" : score >= 60 ? "Good" : score >= 40 ? "Fair" : score >= 20 ? "Weak" : "Very weak"

  const variant = score >= 80 ? "success" : score >= 60 ? "primary" : score >= 40 ? "warning" : "destructive"
  return { score, label, variant, checks, meetsRequirements: checks.every((check) => check.ok) }
}

export function ProfilePage() {
  const { language, t } = useLanguage()
  const { user, updateUser, logout, refreshUser } = useAuth()
  const locale = language === "ar" ? ar : enUS
  const router = useRouter()

  const [activeTab, setActiveTab] = useState<"overview" | "profile" | "security">("overview")
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [optimisticAvatarUrl, setOptimisticAvatarUrl] = useState<string | null>(null)

  const [showPw, setShowPw] = useState({ current: false, next: false, confirm: false })
  const [passwords, setPasswords] = useState<PasswordForm>({ current: "", next: "", confirm: "" })

  const [profileData, setProfileData] = useState<ProfileData>({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
  })
  const [profileTouched, setProfileTouched] = useState<ProfileTouched>(createEmptyProfileTouched)
  const [profileServerErrors, setProfileServerErrors] = useState<ProfileErrors>({})

  const initialRef = useRef<ProfileData | null>({
    name: user?.name || "",
    email: user?.email || "",
    phone: user?.phone || "",
  })

  useEffect(() => {
    if (!user) return

    const nextProfile = {
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
    }

    setProfileData((current) => {
      const base = initialRef.current
      const isPristine = base ? JSON.stringify(current) === JSON.stringify(base) : true

      if (isPristine) {
        initialRef.current = nextProfile
        return nextProfile
      }

      return current
    })
  }, [user?.name, user?.email, user?.phone, user])

  const isDirty = useMemo(() => {
    const base = initialRef.current
    if (!base) return false
    return JSON.stringify(base) !== JSON.stringify(profileData)
  }, [profileData])

  const profileMessages = useMemo(
    () => ({
      fixHighlighted: language === "ar" ? "راجع الحقول المظللة ثم حاول مرة أخرى" : "Please review the highlighted fields and try again",
      nameRequired: language === "ar" ? "الاسم مطلوب" : "Name is required",
      nameShort: language === "ar" ? "الاسم يجب أن يكون حرفين على الأقل" : "Name must be at least 2 characters",
      emailRequired: language === "ar" ? "البريد الإلكتروني مطلوب" : "Email is required",
      emailInvalid: language === "ar" ? "البريد الإلكتروني غير صالح" : "Enter a valid email address",
      emailTaken: language === "ar" ? "هذا البريد الإلكتروني مستخدم بالفعل" : "This email address is already in use",
      phoneInvalid: language === "ar" ? "أدخل رقم هاتف صالحاً من 10 إلى 15 رقماً" : "Enter a valid phone number with 10 to 15 digits",
      phoneTaken: language === "ar" ? "رقم الهاتف مستخدم بالفعل" : "This phone number is already in use",
      nameHint: language === "ar" ? "استخدم الاسم الذي تريد ظهوره في حسابك." : "Use the name you want shown on your account.",
      emailHint: language === "ar" ? "سيُستخدم هذا البريد لتسجيل الدخول والتنبيهات." : "Used for sign-in and important notifications.",
      phoneHint: language === "ar" ? "اختياري. أدخل من 10 إلى 15 رقماً فقط." : "Optional. Enter 10 to 15 digits only.",
    }),
    [language]
  )

  const profileValidationErrors = useMemo<ProfileErrors>(() => {
    const nextErrors: ProfileErrors = {}
    const trimmedName = profileData.name.trim()
    const trimmedEmail = profileData.email.trim()
    const phoneDigits = normalizePhoneInput(profileData.phone)

    if (!trimmedName) {
      nextErrors.name = profileMessages.nameRequired
    } else if (trimmedName.length < 2) {
      nextErrors.name = profileMessages.nameShort
    }

    if (!trimmedEmail) {
      nextErrors.email = profileMessages.emailRequired
    } else if (!isValidEmail(trimmedEmail)) {
      nextErrors.email = profileMessages.emailInvalid
    }

    if (profileData.phone.trim() && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
      nextErrors.phone = profileMessages.phoneInvalid
    }

    return nextErrors
  }, [profileData, profileMessages])
  const hasProfileValidationErrors = Object.keys(profileValidationErrors).length > 0

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty) return
      e.preventDefault()
      e.returnValue = ""
    }

    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [isDirty])

  useEffect(() => {
    if (!user?.id) return

    const syncProfileCounters = () => {
      void refreshUser().catch(() => {})
    }

    syncProfileCounters()
    window.addEventListener("focus", syncProfileCounters)

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncProfileCounters()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("focus", syncProfileCounters)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [user?.id, refreshUser])

  const handleSave = useCallback(async () => {
    setProfileTouched({
      name: true,
      email: true,
      phone: true,
    })
    setProfileServerErrors({})

    if (hasProfileValidationErrors) {
      toast.error(profileMessages.fixHighlighted)
      setActiveTab("profile")
      return
    }

    setIsSaving(true)

    try {
      const result = await updateProfile({
        name: profileData.name.trim(),
        email: profileData.email.trim().toLowerCase(),
        phone: profileData.phone.trim() || null,
      })

      const nextProfile = {
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone ?? "",
      }

      updateUser({
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone ?? undefined,
      })

      setProfileData(nextProfile)
      initialRef.current = nextProfile
      setProfileTouched(createEmptyProfileTouched())
      setProfileServerErrors({})

      toast.success(language === "ar" ? "تم حفظ الملف الشخصي" : "Profile saved")
    } catch (error: any) {
      const message = String(error?.message || "")
      const nextServerErrors: ProfileErrors = {}

      if (message.includes("Email already in use")) {
        nextServerErrors.email = profileMessages.emailTaken
      }

      if (message.includes("Invalid phone number")) {
        nextServerErrors.phone = profileMessages.phoneInvalid
      } else if (message.includes("Phone number already in use")) {
        nextServerErrors.phone = profileMessages.phoneTaken
      }

      if (Object.keys(nextServerErrors).length > 0) {
        setProfileServerErrors(nextServerErrors)
        setActiveTab("profile")
        toast.error(profileMessages.fixHighlighted)
        return
      }

      toast.error(error?.message || (language === "ar" ? "تعذر حفظ الملف الشخصي" : "Failed to save profile"))
    } finally {
      setIsSaving(false)
    }
  }, [hasProfileValidationErrors, profileData, profileMessages, language, updateUser])
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac")
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod) return
      if (e.key.toLowerCase() !== "s") return
      if (!isDirty || isSaving) return

      e.preventDefault()
      void handleSave()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isDirty, isSaving, handleSave])

  const stats = useMemo(() => {
    const totalBookings = user?.stats?.totalBookings || 0
    const completedBookings = user?.stats?.completedBookings || 0
    const favoriteCourts = user?.stats?.favoriteCourts || 0
    const totalCourts = user?.stats?.totalCourts || 0
    const memberSince = user?.createdAt ? new Date(user.createdAt) : new Date()

    return { totalBookings, completedBookings, favoriteCourts, totalCourts, memberSince }
  }, [user])

  const formatDay = (date: Date) => format(date, "dd MMM yyyy", { locale })

  const roleBadge = useMemo(() => {
    const roles = {
      admin: { ar: "مدير النظام", en: "Admin", cls: "bg-purple-500/10 text-purple-600 border-purple-500/20" },
      manager: { ar: "مدير ملاعب", en: "Manager", cls: "bg-blue-500/10 text-blue-600 border-blue-500/20" },
      player: { ar: "لاعب", en: "Player", cls: "bg-primary/10 text-primary border-primary/20" },
    }

    const role = roles[(user?.role as keyof typeof roles) || "player"] ?? roles.player

    return (
      <Badge variant="outline" className={cn("rounded-full border px-3 py-1 text-xs font-medium", role.cls)}>
        {language === "ar" ? role.ar : role.en}
      </Badge>
    )
  }, [language, user?.role])

  const pw = useMemo(() => passwordStrength(passwords.next), [passwords.next])

  const setField = <K extends keyof ProfileData>(key: K, value: ProfileData[K]) => {
    setProfileData((prev) => ({ ...prev, [key]: value }))
    setProfileServerErrors((prev) => {
      if (!prev[key]) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  const touchProfileField = (key: keyof ProfileData) =>
    setProfileTouched((prev) => ({ ...prev, [key]: true }))

  const getProfileFieldError = useCallback(
    (key: keyof ProfileData) => {
      if (profileTouched[key] && profileValidationErrors[key]) {
        return profileValidationErrors[key]
      }
      return profileServerErrors[key]
    },
    [profileServerErrors, profileTouched, profileValidationErrors]
  )

  const inputClass =
    "h-11 rounded-xl border-border/60 bg-background shadow-none transition-colors placeholder:text-muted-foreground/70 focus-visible:ring-2 focus-visible:ring-primary/10 focus-visible:border-primary/30"

  const sectionCard = "rounded-2xl border border-border/60 bg-background shadow-sm"
  const subtlePanel = "rounded-2xl border border-border/60 bg-muted/30"

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploadingAvatar(true)
    const toastId = toast.loading(language === "ar" ? "جاري رفع الصورة..." : "Uploading avatar...")

    const objectUrl = URL.createObjectURL(file)
    setOptimisticAvatarUrl(objectUrl)

    try {
      const res = await uploadAvatar(file)
      await updateProfile({ avatar: res.url } as any)
      updateUser({ ...user, avatar: res.url } as any)
      setOptimisticAvatarUrl(null)

      toast.success(language === "ar" ? "تم تحديث الصورة بنجاح" : "Avatar updated successfully", { id: toastId })
    } catch (error: any) {
      setOptimisticAvatarUrl(null)
      toast.error(error?.message || (language === "ar" ? "فشل رفع الصورة" : "Upload failed"), { id: toastId })
    } finally {
      setIsUploadingAvatar(false)
      e.target.value = ""
    }
  }

  const handleDeleteAvatar = async () => {
    if (!user?.avatar) return

    setIsUploadingAvatar(true)
    const toastId = toast.loading(language === "ar" ? "جاري حذف الصورة..." : "Deleting photo...")

    try {
      await updateProfile({ avatar: null } as any)
      updateUser({ ...user, avatar: null } as any)
      toast.success(language === "ar" ? "تم حذف الصورة" : "Photo deleted", { id: toastId })
    } catch (error: any) {
      toast.error(error?.message || (language === "ar" ? "فشل حذف الصورة" : "Failed to delete photo"), { id: toastId })
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  const handleReset = () => {
    const base = initialRef.current
    if (!base) return

    setProfileData(base)
    setProfileTouched(createEmptyProfileTouched())
    setProfileServerErrors({})
    setPasswords({ current: "", next: "", confirm: "" })
    toast.message(language === "ar" ? "تمت إعادة التغييرات" : "Changes were reset")
  }

  const copyEmail = async () => {
    const value = profileData.email || user?.email || ""
    if (!value) return

    try {
      await navigator.clipboard.writeText(value)
      toast.success(language === "ar" ? "تم النسخ" : "Copied")
    } catch {
      toast.error(language === "ar" ? "تعذر النسخ" : "Couldn’t copy")
    }
  }



  return (
    <div
      dir={language === "ar" ? "rtl" : "ltr"}
      className={cn(
        "mx-auto max-w-6xl space-y-6 px-4 pb-24 sm:pb-8",
        isDirty && "pb-[calc(var(--mobile-bottom-nav-offset,0rem)+7rem)] sm:pb-28",
        language === "ar" && "font-arabic",
      )}
    >
      <AnimatedContainer animation="fade-up">
        <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-indigo-500/10 via-purple-500/5 to-background border border-border/50 p-6 md:p-8 mb-6">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-purple-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl md:text-3xl font-extrabold text-foreground">
                {language === "ar" ? "الملف الشخصي" : "Profile"}
              </h1>
              <p className="text-sm text-muted-foreground mt-2 font-medium">
                {language === "ar"
                  ? "واجهة أنظف وأكثر راحة لإدارة حسابك وبياناتك"
                  : "A cleaner, calmer place to manage your account and personal details"}
              </p>
            </div>
            
            <div className="hidden">
              {isDirty && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className="h-10 rounded-xl border-border/60 bg-background px-4 shadow-none"
                    >
                      <RotateCcw className="me-2 h-4 w-4" />
                      {language === "ar" ? "تراجع" : "Reset"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="rounded-2xl border-border/60" dir={language === "ar" ? "rtl" : "ltr"}>
                    <AlertDialogHeader className={cn(language === "ar" && "text-right")}>
                      <AlertDialogTitle>{language === "ar" ? "إعادة التغييرات؟" : "Reset changes?"}</AlertDialogTitle>
                      <AlertDialogDesc>
                        {language === "ar"
                          ? "سيتم فقدان جميع التغييرات غير المحفوظة."
                          : "You’ll lose any unsaved changes."}
                      </AlertDialogDesc>
                    </AlertDialogHeader>
                    <AlertDialogFooter className={cn("gap-2", language === "ar" && "sm:flex-row-reverse sm:justify-start")}>
                      <AlertDialogCancel className="rounded-xl">
                        {language === "ar" ? "إلغاء" : "Cancel"}
                      </AlertDialogCancel>
                      <AlertDialogAction className="rounded-xl" onClick={handleReset}>
                        {language === "ar" ? "إعادة" : "Reset"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              <Button onClick={handleSave} disabled={isSaving || !isDirty || hasProfileValidationErrors} className="h-10 rounded-xl px-5 shadow-none">
                <Save className="me-2 h-4 w-4" />
                {isSaving ? (language === "ar" ? "جاري الحفظ..." : "Saving...") : t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      </AnimatedContainer>

      {isDirty && (
        <div className="fixed inset-x-0 bottom-[calc(var(--mobile-bottom-nav-offset,0rem)+0.5rem)] z-40 px-3 sm:bottom-5 sm:px-4">
          <div
            className={cn(
              "mx-auto flex max-w-6xl items-center gap-2 rounded-2xl border border-border/60 bg-background/95 p-3 shadow-lg backdrop-blur-xl",
              "sm:w-fit sm:min-w-[520px] sm:gap-3 sm:px-4",
              language === "ar" && "flex-row-reverse",
            )}
          >
            <div className={cn("hidden flex-1 text-sm font-semibold text-muted-foreground sm:block", language === "ar" && "text-right")}>
              {language === "ar" ? "لديك تغييرات غير محفوظة" : "You have unsaved changes"}
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="h-11 flex-1 rounded-xl border-border/60 bg-background px-4 shadow-none sm:flex-none"
                  aria-label={language === "ar" ? "إعادة التغييرات" : "Reset changes"}
                >
                  <RotateCcw className="me-2 h-4 w-4" />
                  {language === "ar" ? "ØªØ±Ø§Ø¬Ø¹" : "Reset"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="rounded-2xl border-border/60" dir={language === "ar" ? "rtl" : "ltr"}>
                <AlertDialogHeader className={cn(language === "ar" && "text-right")}>
                  <AlertDialogTitle>{language === "ar" ? "إعادة التغييرات؟" : "Reset changes?"}</AlertDialogTitle>
                  <AlertDialogDesc>
                    {language === "ar" ? "سيتم فقدان التغييرات غير المحفوظة." : "You’ll lose any unsaved changes."}
                  </AlertDialogDesc>
                </AlertDialogHeader>
                <AlertDialogFooter className={cn("gap-2", language === "ar" && "sm:flex-row-reverse sm:justify-start")}>
                  <AlertDialogCancel className="rounded-xl">{language === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
                  <AlertDialogAction className="rounded-xl" onClick={handleReset}>
                    {language === "ar" ? "إعادة" : "Reset"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            <Button onClick={handleSave} disabled={isSaving || hasProfileValidationErrors} className="h-11 flex-1 rounded-xl px-4 shadow-none sm:flex-none">
              <Save className="me-2 h-4 w-4" />
              {isSaving ? "..." : language === "ar" ? "حفظ" : "Save"}
            </Button>
          </div>
        </div>
      )}

      <Tabs dir={language === "ar" ? "rtl" : "ltr"} value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="space-y-6">
        <AnimatedContainer animation="fade-up" delay={80}>
          <div className="flex justify-center sm:justify-start">
            <TabsList className="h-auto w-full max-w-[460px] rounded-2xl border border-border/60 bg-muted/40 p-1">
              {[
                { value: "overview", label: language === "ar" ? "نظرة عامة" : "Overview", icon: BarChart3 },
                { value: "profile", label: language === "ar" ? "البيانات" : "Profile", icon: User },
                { value: "security", label: language === "ar" ? "الأمان" : "Security", icon: Shield },
              ].map((tab) => {
                const Icon = tab.icon

                return (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className={cn(
                      "group flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors",
                      "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
                      "data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-xs sm:text-sm">{tab.label}</span>
                    {tab.value === "profile" && isDirty && (
                      <span className="ms-1 inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                    )}
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </div>
        </AnimatedContainer>

        <TabsContent value="overview" className="space-y-4">
          <AnimatedContainer animation="fade-up" delay={120}>
            <Card className={cn(sectionCard, "overflow-hidden")}>
              <CardContent className="p-5 sm:p-6">
                <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
                    <div className="relative shrink-0">
                      <div className="relative inline-block">
                        <Avatar
                          className={cn(
                            "h-28 w-28 rounded-3xl border-4 border-background bg-muted shadow-md transition-all sm:h-32 sm:w-32",
                            isUploadingAvatar && "opacity-70"
                          )}
                        >
                          <AvatarImage src={optimisticAvatarUrl || user?.avatar || "/placeholder.svg"} className="object-cover" />
                          <AvatarFallback className="rounded-3xl bg-primary/10 text-3xl font-bold text-primary">
                            {user?.name?.charAt(0) || "U"}
                          </AvatarFallback>
                        </Avatar>

                        {/* Professional Camera Button with Dropdown */}
                        <div className="absolute -bottom-1 -end-1">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                className="h-10 w-10 rounded-2xl border-2 border-background bg-primary shadow-lg transition-transform hover:scale-105 active:scale-95"
                                disabled={isUploadingAvatar}
                              >
                                <Camera className="h-5 w-5 text-primary-foreground" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 rounded-2xl border-border/50 p-2 shadow-xl backdrop-blur-md">
                              <label htmlFor="avatarUpload" className="cursor-pointer">
                                <DropdownMenuItem className="flex cursor-pointer items-center gap-2 rounded-xl py-2.5 text-sm font-medium focus:bg-primary/10 focus:text-primary">
                                  <Upload className="h-4 w-4" />
                                  {language === "ar" ? "تحميل صورة جديدة" : "Upload new photo"}
                                </DropdownMenuItem>
                              </label>

                              {user?.avatar && (
                                <>
                                  <DropdownMenuSeparator className="my-1 bg-border/50" />
                                  <DropdownMenuItem
                                    onClick={handleDeleteAvatar}
                                    className="flex cursor-pointer items-center gap-2 rounded-xl py-2.5 text-sm font-medium text-destructive focus:bg-destructive/10 focus:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    {language === "ar" ? "حذف الصورة الحالية" : "Remove photo"}
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>

                        {/* Hidden File Input */}
                        <input
                          type="file"
                          id="avatarUpload"
                          className="hidden"
                          accept="image/jpeg, image/png, image/webp"
                          onChange={handleAvatarChange}
                          disabled={isUploadingAvatar}
                        />

                        {/* Loading Spinner */}
                        {isUploadingAvatar && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-8 w-8 animate-spin rounded-full border-3 border-primary border-t-transparent" />
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{user?.name || "—"}</h2>
                        {roleBadge}
                        <Badge
                          variant="outline"
                          className="rounded-full border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-emerald-600"
                        >
                          <CheckCircle2 className="me-1 h-3.5 w-3.5" />
                          {language === "ar" ? "موثق" : "Verified"}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-2 text-sm text-muted-foreground">
                          <Mail className="h-4 w-4 text-primary" />
                          <span>{user?.email || "—"}</span>
                          <button
                            type="button"
                            onClick={copyEmail}
                            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-muted"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            {language === "ar" ? "نسخ" : "Copy"}
                          </button>
                        </div>

                        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-2 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4 text-primary" />
                          <span>
                            {language === "ar" ? "عضو منذ" : "Member since"} {formatDay(stats.memberSince)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </AnimatedContainer>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              {
                title: language === "ar" ? "إجمالي الحجوزات" : "Total Bookings",
                value: stats.totalBookings,
                icon: Calendar,
                description: language === "ar" ? "جميع الحجوزات التي قمت بها" : "All reservations on your account",
              },
              {
                title: language === "ar" ? "تم الحضور" : "Checked In",
                value: stats.completedBookings,
                icon: CheckCircle2,
                description: language === "ar" ? "الحجوزات التي تم حضورها" : "Bookings marked as checked in",
              },
              user?.role === "manager" || user?.role === "admin"
                ? {
                  title: language === "ar" ? "الملاعب المضافة" : "Your Courts",
                  value: stats.totalCourts,
                  icon: MapPin,
                  description: language === "ar" ? "عدد الملاعب التي تديرها" : "Courts managed by your account",
                }
                : {
                  title: language === "ar" ? "المفضلة" : "Favorites",
                  value: stats.favoriteCourts,
                  icon: Star,
                  description: language === "ar" ? "الملاعب المحفوظة كمفضلة" : "Courts you have marked as favorite",
                },
            ].map((s, idx) => {
              const Icon = s.icon

              return (
                <AnimatedContainer key={idx} animation="scale-in" delay={180 + idx * 40}>
                  <Card className={sectionCard}>
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-muted-foreground">{s.title}</p>
                          <p className="text-3xl font-semibold tracking-tight">{s.value}</p>
                          <p className="text-sm text-muted-foreground">{s.description}</p>
                        </div>

                        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/60 bg-muted/30">
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </AnimatedContainer>
              )
            })}
          </div>
        </TabsContent>

        <TabsContent value="profile" className="space-y-4">
          <AnimatedContainer animation="fade-up" delay={120}>
            <Card className={sectionCard}>

              <CardContent className="space-y-6">
                <div className={cn(subtlePanel, "p-4 sm:p-5")}>
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold">{language === "ar" ? "بيانات الحساب" : "Account details"}</div>
                      <div className="text-sm text-muted-foreground">
                        {language === "ar"
                          ? "هذه البيانات تظهر في حسابك وتُستخدم للتواصل"
                          : "These details appear on your account and are used for communication"}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <User className="h-4 w-4 text-primary" />
                        {language === "ar" ? "الاسم الكامل" : "Full name"}
                      </Label>
                      <Input
                        value={profileData.name}
                        onChange={(e) => setField("name", e.target.value)}
                        onBlur={() => touchProfileField("name")}
                        autoComplete="name"
                        aria-invalid={Boolean(getProfileFieldError("name"))}
                        className={cn(
                          inputClass,
                          getProfileFieldError("name") && "border-destructive/40 bg-destructive/[0.02] focus-visible:border-destructive/40 focus-visible:ring-destructive/10",
                          "text-start"
                        )}
                        placeholder={language === "ar" ? "أدخل الاسم الكامل" : "Enter your full name"}
                        dir={language === "ar" ? "rtl" : "ltr"}
                      />
                      <div
                        className={cn(
                          "text-xs",
                          getProfileFieldError("name") ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {getProfileFieldError("name") || profileMessages.nameHint}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Mail className="h-4 w-4 text-primary" />
                        {language === "ar" ? "البريد الإلكتروني" : "Email"}
                      </Label>
                      <Input
                        type="email"
                        value={profileData.email}
                        onChange={(e) => setField("email", e.target.value)}
                        onBlur={() => touchProfileField("email")}
                        autoComplete="email"
                        aria-invalid={Boolean(getProfileFieldError("email"))}
                        className={cn(
                          inputClass,
                          getProfileFieldError("email") && "border-destructive/40 bg-destructive/[0.02] focus-visible:border-destructive/40 focus-visible:ring-destructive/10",
                          "text-start"
                        )}
                        placeholder={language === "ar" ? "اسم@مثال.com" : "name@example.com"}
                        dir={language === "ar" ? "rtl" : "ltr"}
                      />
                      <div
                        className={cn(
                          "text-xs",
                          getProfileFieldError("email") ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {getProfileFieldError("email") || profileMessages.emailHint}
                      </div>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <Label className="flex items-center gap-2 text-sm font-medium">
                        <Phone className="h-4 w-4 text-primary" />
                        {language === "ar" ? "رقم الهاتف" : "Phone"}
                      </Label>
                      <Input
                        value={profileData.phone}
                        onChange={(e) => setField("phone", e.target.value)}
                        onBlur={() => touchProfileField("phone")}
                        autoComplete="tel"
                        inputMode="tel"
                        aria-invalid={Boolean(getProfileFieldError("phone"))}
                        className={cn(
                          inputClass,
                          getProfileFieldError("phone") && "border-destructive/40 bg-destructive/[0.02] focus-visible:border-destructive/40 focus-visible:ring-destructive/10",
                          "text-start"
                        )}
                        placeholder={language === "ar" ? "أدخل رقم الهاتف" : "Enter phone number"}
                        dir={language === "ar" ? "rtl" : "ltr"}
                      />
                      <div
                        className={cn(
                          "text-xs",
                          getProfileFieldError("phone") ? "text-destructive" : "text-muted-foreground"
                        )}
                      >
                        {getProfileFieldError("phone") || profileMessages.phoneHint}
                      </div>
                    </div>
                  </div>
                </div>


              </CardContent>
            </Card>
          </AnimatedContainer>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <AnimatedContainer animation="fade-up" delay={120}>
            <Card className={sectionCard}>
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">{language === "ar" ? "تغيير كلمة المرور" : "Change password"}</CardTitle>
                    <CardDescription>
                      {language === "ar"
                        ? "اختر كلمة مرور قوية لحماية حسابك بشكل أفضل"
                        : "Choose a strong password to better protect your account"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                <div className={cn(subtlePanel, "space-y-5 p-4 sm:p-5")}>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">
                      {language === "ar" ? "كلمة المرور الحالية" : "Current password"}
                    </Label>
                    <div className="relative">
                      <Input
                        type={showPw.current ? "text" : "password"}
                        value={passwords.current}
                        onChange={(e) => setPasswords((p) => ({ ...p, current: e.target.value }))}
                        className={cn(inputClass, "pe-12", "text-start")}
                        dir={language === "ar" ? "rtl" : "ltr"}
                        placeholder={language === "ar" ? "أدخل كلمة المرور الحالية" : "Enter current password"}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPw((s) => ({ ...s, current: !s.current }))}
                        className="absolute end-4 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                        title={
                          showPw.current
                            ? language === "ar"
                              ? "إخفاء"
                              : "Hide"
                            : language === "ar"
                              ? "إظهار"
                              : "Show"
                        }
                      >
                        {showPw.current ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {language === "ar" ? "كلمة المرور الجديدة" : "New password"}
                      </Label>
                      <div className="relative">
                        <Input
                          type={showPw.next ? "text" : "password"}
                          value={passwords.next}
                          onChange={(e) => setPasswords((p) => ({ ...p, next: e.target.value }))}
                          className={cn(inputClass, "pe-12", "text-start")}
                          dir={language === "ar" ? "rtl" : "ltr"}
                          placeholder={language === "ar" ? "أدخل كلمة مرور جديدة" : "Enter new password"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((s) => ({ ...s, next: !s.next }))}
                          className="absolute end-4 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                        >
                          {showPw.next ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">
                        {language === "ar" ? "تأكيد كلمة المرور" : "Confirm password"}
                      </Label>
                      <div className="relative">
                        <Input
                          type={showPw.confirm ? "text" : "password"}
                          value={passwords.confirm}
                          onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
                          className={cn(inputClass, "pe-12", "text-start")}
                          dir={language === "ar" ? "rtl" : "ltr"}
                          placeholder={language === "ar" ? "أعد إدخال كلمة المرور" : "Re-enter password"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
                          className="absolute end-4 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
                        >
                          {showPw.confirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/60 bg-muted/20 p-5">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="text-sm font-semibold">
                        {language === "ar" ? "قوة كلمة المرور" : "Password strength"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {language === "ar"
                          ? "اجعل كلمة المرور أكثر أمانًا باستخدام المعايير التالية"
                          : "Make your password safer by meeting the checks below"}
                      </div>
                    </div>

                    <Badge variant="outline" className="w-fit rounded-full border-border/60 bg-background px-3 py-1">
                      {pw.label}
                    </Badge>
                  </div>

                  <ProgressIndicator value={pw.score} variant={pw.variant as any} />

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    {pw.checks.map((c) => (
                      <div
                        key={c.label}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
                          c.ok
                            ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-600"
                            : "border-border/60 bg-background text-muted-foreground"
                        )}
                      >
                        <CheckCircle2 className={cn("h-4 w-4", c.ok ? "opacity-100" : "opacity-40")} />
                        {language === "ar"
                          ? c.label === "8+ characters"
                            ? "8+ أحرف"
                            : c.label === "Lowercase"
                              ? "حروف صغيرة"
                              : c.label === "Uppercase"
                                ? "حروف كبيرة"
                                : c.label === "Number"
                                  ? "رقم"
                                  : "رمز"
                          : c.label}
                      </div>
                    ))}
                  </div>

                  {passwords.confirm && passwords.next !== passwords.confirm && (
                    <div className="mt-4 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      {language === "ar" ? "كلمات المرور غير متطابقة" : "Passwords do not match"}
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    className="h-10 rounded-xl px-5 shadow-none"
                    disabled={
                      isChangingPassword ||
                      !passwords.current ||
                      !pw.meetsRequirements ||
                      !passwords.next ||
                      passwords.next !== passwords.confirm
                    }
                    onClick={async () => {
                      setIsChangingPassword(true)
                      try {
                        const result = await changePassword({ currentPassword: passwords.current, newPassword: passwords.next })
                        toast.success(
                          result?.signedOut
                            ? language === "ar"
                              ? "تم تحديث كلمة المرور. سجّل الدخول مرة أخرى."
                              : "Password updated. Please sign in again."
                            : language === "ar"
                              ? "تم تحديث كلمة المرور بنجاح"
                              : "Password updated successfully",
                        )
                        setPasswords({ current: "", next: "", confirm: "" })
                        if (result?.signedOut) {
                          await logout()
                        }
                      } catch (err: any) {
                        toast.error(err.message || (language === "ar" ? "فشل تحديث كلمة المرور" : "Failed to update password"))
                      } finally {
                        setIsChangingPassword(false)
                      }
                    }}
                  >
                    <Lock className="me-2 h-4 w-4" />
                    {isChangingPassword
                      ? language === "ar"
                        ? "جاري التحديث..."
                        : "Updating..."
                      : language === "ar"
                        ? "تحديث كلمة المرور"
                        : "Update password"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </AnimatedContainer>

          <AnimatedContainer animation="fade-up" delay={170}>
            <Card className="rounded-2xl border border-destructive/20 bg-destructive/[0.03] shadow-sm">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
                    <AlertTriangle className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-destructive">
                      {language === "ar" ? "منطقة الخطر (تعطيل الحساب)" : "Danger Zone (Deactivate Account)"}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {language === "ar"
                        ? "إجراءات لا يمكن التراجع عنها وستؤدي إلى إلغاء تفعيل الحساب."
                        : "Irreversible actions that will deactivate your account."}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="font-semibold">{language === "ar" ? "تعطيل الحساب نهائيًا" : "Deactivate Account"}</div>
                  <div className="max-w-2xl text-sm text-muted-foreground">
                    {language === "ar"
                      ? "سيتم إلغاء تفعيل الحساب وأرشفة بياناته، ولن تتمكن من تسجيل الدخول بعد ذلك."
                      : "Your account will be deactivated and archived, and you will no longer be able to sign in."}
                  </div>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="h-10 w-full rounded-xl gap-2 sm:w-auto">
                      <Trash2 className="h-4 w-4" />
                      {language === "ar" ? "تعطيل الحساب" : "Deactivate Account"}
                    </Button>
                  </AlertDialogTrigger>

                  <AlertDialogContent className="rounded-2xl border-border/60">
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {language === "ar"
                          ? "هل أنت متأكد من تعطيل حسابك؟"
                          : "Are you sure you want to deactivate your account?"}
                      </AlertDialogTitle>
                      <AlertDialogDesc>
                        {language === "ar"
                          ? "لا يمكن التراجع عن هذا الإجراء وسيتم أرشفة بياناتك فورًا."
                          : "This action cannot be undone. Your data will be archived immediately."}
                      </AlertDialogDesc>
                    </AlertDialogHeader>

                    <AlertDialogFooter>
                      <AlertDialogCancel className="rounded-xl">{language === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
                      <AlertDialogAction
                        className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        disabled={isDeleting}
                        onClick={async (e) => {
                          e.preventDefault()
                          setIsDeleting(true)

                          try {
                            await deleteAccount()
                            toast.success(language === "ar" ? "تم تعطيل حسابك" : "Account deactivated successfully")
                            await logout()
                          } catch (err: any) {
                            toast.error(err.message || (language === "ar" ? "تعذر تعطيل الحساب" : "Could not deactivate account"))
                          } finally {
                            setIsDeleting(false)
                          }
                        }}
                      >
                        {isDeleting ? "..." : language === "ar" ? "نعم، عطل" : "Yes, deactivate"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </AnimatedContainer>
        </TabsContent>
      </Tabs>
    </div>
  )
}
