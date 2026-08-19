"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import {
  Tag,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Trash2,
  Percent,
  Coins,
  Calendar,
  Building2,
  Users,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Loader2,
  RefreshCw,
  Edit2,
  Eye,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import {
  listCoupons,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  listCourts,
} from "@/lib/api"
import type { Coupon, Court } from "@/lib/types"
import { cn } from "@/lib/utils"

interface CouponsPageProps {
  role: "admin" | "manager"
}

export function CouponsPage({ role }: CouponsPageProps) {
  const { language, t } = useLanguage()
  const { user } = useAuth()
  const isAr = language === "ar"

  const tr = useCallback((ar: string, en: string) => (isAr ? ar : en), [isAr])

  // Data states
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [courts, setCourts] = useState<Court[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all")
  const [typeFilter, setTypeFilter] = useState<"all" | "percentage" | "fixed">("all")
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<string>("all")

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedCoupon, setSelectedCoupon] = useState<Coupon | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Form states
  const [formData, setFormData] = useState<{
    code: string
    description: string
    discountType: "percentage" | "fixed"
    discountValue: string
    minBookingAmount: string
    maxDiscountCap: string
    maxUses: string
    maxUsesPerUser: string
    expiresAt: string
    courtId: string
    isActive: boolean
  }>({
    code: "",
    description: "",
    discountType: "percentage",
    discountValue: "20",
    minBookingAmount: "",
    maxDiscountCap: "",
    maxUses: "",
    maxUsesPerUser: "1",
    expiresAt: "",
    courtId: "",
    isActive: true,
  })

  // Load initial data
  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [couponsRes, courtsRes] = await Promise.all([
        listCoupons({ limit: 100 }),
        listCourts({ limit: 100 }).catch(() => ({ items: [] })),
      ])
      setCoupons(couponsRes.items || [])
      setCourts(courtsRes.items || [])
    } catch (error: any) {
      toast.error(error?.message || tr("فشل تحميل بيانات الكوبونات", "Failed to load coupons"))
    } finally {
      setIsLoading(false)
    }
  }, [tr])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Filtered coupons
  const filteredCoupons = useMemo(() => {
    return coupons.filter((c) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const matchesCode = c.code.toLowerCase().includes(q)
        const matchesDesc = (c.description || "").toLowerCase().includes(q)
        const matchesCourt = (c.court?.name || c.court?.nameEn || "").toLowerCase().includes(q)
        if (!matchesCode && !matchesDesc && !matchesCourt) return false
      }

      // Status
      if (statusFilter === "active" && !c.isActive) return false
      if (statusFilter === "inactive" && c.isActive) return false

      // Type
      if (typeFilter !== "all" && c.discountType !== typeFilter) return false

      // Court
      if (selectedCourtFilter === "global" && c.courtId !== null) return false
      if (selectedCourtFilter !== "all" && selectedCourtFilter !== "global" && c.courtId !== selectedCourtFilter) return false

      return true
    })
  }, [coupons, searchQuery, statusFilter, typeFilter, selectedCourtFilter])

  // Stats calculation
  const stats = useMemo(() => {
    const totalCoupons = coupons.length
    const activeCoupons = coupons.filter((c) => c.isActive).length
    const totalRedemptions = coupons.reduce((acc, c) => acc + (c.usedCount || 0), 0)
    const totalGlobal = coupons.filter((c) => !c.courtId).length

    return { totalCoupons, activeCoupons, totalRedemptions, totalGlobal }
  }, [coupons])

  // Code generator helper
  const handleGenerateCode = () => {
    const prefixes = ["PROMO", "SAVE", "WIN", "MAL3ABK", "SUMMER", "VIP"]
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)]
    const randomNum = Math.floor(10 + Math.random() * 90)
    setFormData((prev) => ({ ...prev, code: `${prefix}${randomNum}` }))
  }

  // Copy code to clipboard
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    toast.success(tr(`تم نسخ الكود: ${code}`, `Copied code: ${code}`))
    setTimeout(() => setCopiedCode(null), 2000)
  }

  // Open create modal
  const handleOpenCreate = () => {
    setFormData({
      code: "",
      description: "",
      discountType: "percentage",
      discountValue: "20",
      minBookingAmount: "",
      maxDiscountCap: "",
      maxUses: "",
      maxUsesPerUser: "1",
      expiresAt: "",
      courtId: role === "manager" && courts.length === 1 ? courts[0].id : "",
      isActive: true,
    })
    setIsCreateOpen(true)
  }

  // Open edit modal
  const handleOpenEdit = (coupon: Coupon) => {
    setSelectedCoupon(coupon)
    setFormData({
      code: coupon.code,
      description: coupon.description || "",
      discountType: coupon.discountType,
      discountValue: String(coupon.discountValue),
      minBookingAmount: coupon.minBookingAmount ? String(coupon.minBookingAmount) : "",
      maxDiscountCap: coupon.maxDiscountCap ? String(coupon.maxDiscountCap) : "",
      maxUses: coupon.maxUses ? String(coupon.maxUses) : "",
      maxUsesPerUser: coupon.maxUsesPerUser ? String(coupon.maxUsesPerUser) : "1",
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt).toISOString().split("T")[0] : "",
      courtId: coupon.courtId || "",
      isActive: coupon.isActive,
    })
    setIsEditOpen(true)
  }

  // Submit Create
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.code.trim()) {
      toast.error(tr("يرجى إدخال كود الكوبون", "Please enter coupon code"))
      return
    }

    const val = Number(formData.discountValue)
    if (!val || val <= 0) {
      toast.error(tr("قيمة الخصم غير صحيحة", "Invalid discount value"))
      return
    }

    if (formData.discountType === "percentage" && val > 100) {
      toast.error(tr("لا يمكن أن يتجاوز الخصم 100%", "Percentage discount cannot exceed 100%"))
      return
    }

    setIsSubmitting(true)
    try {
      const payload: any = {
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim() || undefined,
        discountType: formData.discountType,
        discountValue: val,
        minBookingAmount: formData.minBookingAmount ? Number(formData.minBookingAmount) : null,
        maxDiscountCap: formData.maxDiscountCap ? Number(formData.maxDiscountCap) : null,
        maxUses: formData.maxUses ? Number(formData.maxUses) : null,
        maxUsesPerUser: formData.maxUsesPerUser ? Number(formData.maxUsesPerUser) : 1,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
        courtId: formData.courtId || null,
        isActive: formData.isActive,
      }

      const res = await createCoupon(payload)
      toast.success(tr("تم إنشاء كود الخصم بنجاح", "Coupon created successfully"))
      setCoupons((prev) => [res.coupon, ...prev])
      setIsCreateOpen(false)
    } catch (error: any) {
      toast.error(error?.message || tr("فشل إنشاء الكوبون", "Failed to create coupon"))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Submit Edit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedCoupon) return

    const val = Number(formData.discountValue)
    if (!val || val <= 0) {
      toast.error(tr("قيمة الخصم غير صحيحة", "Invalid discount value"))
      return
    }

    setIsSubmitting(true)
    try {
      const payload: any = {
        description: formData.description.trim() || undefined,
        discountType: formData.discountType,
        discountValue: val,
        minBookingAmount: formData.minBookingAmount ? Number(formData.minBookingAmount) : null,
        maxDiscountCap: formData.maxDiscountCap ? Number(formData.maxDiscountCap) : null,
        maxUses: formData.maxUses ? Number(formData.maxUses) : null,
        maxUsesPerUser: formData.maxUsesPerUser ? Number(formData.maxUsesPerUser) : 1,
        expiresAt: formData.expiresAt ? new Date(formData.expiresAt).toISOString() : null,
        courtId: formData.courtId || null,
        isActive: formData.isActive,
      }

      const res = await updateCoupon(selectedCoupon.id, payload)
      toast.success(tr("تم تحديث الكوبون بنجاح", "Coupon updated successfully"))
      setCoupons((prev) => prev.map((c) => (c.id === selectedCoupon.id ? res.coupon : c)))
      setIsEditOpen(false)
    } catch (error: any) {
      toast.error(error?.message || tr("فشل تحديث الكوبون", "Failed to update coupon"))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Toggle active status
  const handleToggleStatus = async (coupon: Coupon) => {
    try {
      const res = await updateCoupon(coupon.id, { isActive: !coupon.isActive })
      setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? res.coupon : c)))
      toast.success(
        res.coupon.isActive
          ? tr("تم تفعيل الكوبون", "Coupon activated")
          : tr("تم إيقاف الكوبون", "Coupon deactivated")
      )
    } catch (error: any) {
      toast.error(error?.message || tr("فشل تغيير حالة الكوبون", "Failed to update coupon status"))
    }
  }

  // Delete Coupon
  const handleDeleteConfirm = async () => {
    if (!selectedCoupon) return
    setIsSubmitting(true)
    try {
      await deleteCoupon(selectedCoupon.id)
      toast.success(tr("تم حذف الكوبون بنجاح", "Coupon deleted successfully"))
      setCoupons((prev) => prev.filter((c) => c.id !== selectedCoupon.id))
      setIsDeleteOpen(false)
    } catch (error: any) {
      toast.error(error?.message || tr("فشل حذف الكوبون", "Failed to delete coupon"))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2.5">
            <Tag className="h-7 w-7 text-primary shrink-0" />
            {tr("أكواد الخصم والكوبونات", "Promotional Codes & Coupons")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {role === "admin"
              ? tr(
                  "إنشاء وإدارة حملات الخصم العامة والخاصة بالملاعب لزيادة الحجوزات والمبيعات.",
                  "Create and manage platform-wide and venue-specific discount campaigns to boost bookings."
                )
              : tr(
                  "إنشاء وإدارة أكواد الخصم الحصرية لملاعبك لجذب اللاعبين وزيادة الإشغال.",
                  "Create and manage exclusive promo codes for your courts to attract players and maximize occupancy."
                )}
          </p>
        </div>

        <Button
          onClick={handleOpenCreate}
          className="gap-2 rounded-2xl bg-gradient-to-r from-primary to-emerald-600 hover:from-primary/90 hover:to-emerald-600/90 text-white shadow-md shadow-primary/20 transition-all hover:scale-[1.02] active:scale-95"
        >
          <Plus className="h-4 w-4" />
          {tr("إنشاء كود خصم جديد", "Create New Promo Code")}
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-3xl border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl shadow-xs">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Tag className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{tr("إجمالي الكوبونات", "Total Coupons")}</p>
              <h3 className="text-2xl font-extrabold tracking-tight mt-0.5">{stats.totalCoupons}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl shadow-xs">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{tr("الكوبونات النشطة", "Active Coupons")}</p>
              <h3 className="text-2xl font-extrabold tracking-tight mt-0.5 text-emerald-500">{stats.activeCoupons}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl shadow-xs">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <TrendingUp className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">{tr("مرات الاستخدام", "Total Uses")}</p>
              <h3 className="text-2xl font-extrabold tracking-tight mt-0.5 text-blue-500">{stats.totalRedemptions}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border/60 bg-gradient-to-br from-card/80 to-card/40 backdrop-blur-xl shadow-xs">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Building2 className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">
                {role === "admin" ? tr("كوبونات عامة للمنصة", "Platform-Wide Codes") : tr("ملاعب مستفيدة", "Covered Courts")}
              </p>
              <h3 className="text-2xl font-extrabold tracking-tight mt-0.5 text-amber-500">
                {role === "admin" ? stats.totalGlobal : courts.length}
              </h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters Bar */}
      <Card className="rounded-3xl border-border/60 bg-card/60 backdrop-blur-xl">
        <CardContent className="p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={tr("بحث بالكود، الوصف، أو اسم الملعب...", "Search by code, description, or court...")}
              className="ps-10 rounded-2xl bg-muted/20 border-border/60 text-sm h-10"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="h-10 rounded-2xl border-border/60 bg-muted/20 text-xs min-w-[120px]">
                <SelectValue placeholder={tr("الحالة", "Status")} />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all">{tr("جميع الحالات", "All Statuses")}</SelectItem>
                <SelectItem value="active">{tr("النشطة فقط", "Active Only")}</SelectItem>
                <SelectItem value="inactive">{tr("المتوقفة فقط", "Inactive Only")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Type Filter */}
            <Select value={typeFilter} onValueChange={(v: any) => setTypeFilter(v)}>
              <SelectTrigger className="h-10 rounded-2xl border-border/60 bg-muted/20 text-xs min-w-[130px]">
                <SelectValue placeholder={tr("نوع الخصم", "Discount Type")} />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all">{tr("جميع الأنواع", "All Types")}</SelectItem>
                <SelectItem value="percentage">{tr("نسبة مئوية %", "Percentage %")}</SelectItem>
                <SelectItem value="fixed">{tr("مبلغ ثابت (ج.م)", "Fixed Amount")}</SelectItem>
              </SelectContent>
            </Select>

            {/* Court Filter (Admin only) */}
            {role === "admin" && (
              <Select value={selectedCourtFilter} onValueChange={setSelectedCourtFilter}>
                <SelectTrigger className="h-10 rounded-2xl border-border/60 bg-muted/20 text-xs min-w-[150px]">
                  <SelectValue placeholder={tr("نطاق الملعب", "Court Scope")} />
                </SelectTrigger>
                <SelectContent className="rounded-2xl max-h-60">
                  <SelectItem value="all">{tr("جميع النطاقات", "All Scopes")}</SelectItem>
                  <SelectItem value="global">{tr("عام لجميع الملاعب", "Platform-Wide (Global)")}</SelectItem>
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={court.id}>
                      {isAr ? court.name : court.nameEn || court.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button
              variant="outline"
              size="icon"
              onClick={fetchData}
              disabled={isLoading}
              className="h-10 w-10 rounded-2xl border-border/60"
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Coupons List */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">
            {tr("جاري تحميل الكوبونات...", "Loading coupons...")}
          </p>
        </div>
      ) : filteredCoupons.length === 0 ? (
        <Card className="rounded-3xl border-dashed border-2 border-border/60 bg-card/30">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="h-16 w-16 rounded-3xl bg-primary/10 text-primary flex items-center justify-center mb-4">
              <Tag className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-bold">
              {searchQuery || statusFilter !== "all" || typeFilter !== "all"
                ? tr("لم يتم العثور على نتائج", "No coupons match your filter")
                : tr("لا توجد أكواد خصم حالياً", "No coupons found")}
            </h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-md">
              {searchQuery
                ? tr("جرّب تغيير كلمات البحث أو إعادة تعيين الفلاتر.", "Try adjusting your search terms or filters.")
                : tr(
                    "ابدأ الآن بإنشاء أول كود خصم لتقديم عروض مميزة للاعبين.",
                    "Get started by creating your first promo code to offer attractive discounts."
                  )}
            </p>
            <Button onClick={handleOpenCreate} className="mt-5 rounded-2xl gap-2">
              <Plus className="h-4 w-4" />
              {tr("إنشاء كود خصم", "Create Promo Code")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCoupons.map((coupon) => {
            const isExpired = coupon.expiresAt && new Date(coupon.expiresAt) < new Date()
            const isMaxedOut = coupon.maxUses != null && coupon.usedCount >= coupon.maxUses
            const courtName = coupon.court ? (isAr ? coupon.court.name : coupon.court.nameEn || coupon.court.name) : null

            return (
              <Card
                key={coupon.id}
                className={cn(
                  "rounded-3xl border-border/60 bg-gradient-to-br from-card/90 to-card/50 backdrop-blur-xl transition-all duration-200 hover:shadow-lg hover:border-primary/40 relative overflow-hidden group",
                  !coupon.isActive && "opacity-60 bg-muted/20"
                )}
              >
                {/* Top Accent Strip */}
                <div
                  className={cn(
                    "h-1.5 w-full",
                    coupon.isActive
                      ? coupon.discountType === "percentage"
                        ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                        : "bg-gradient-to-r from-primary to-blue-500"
                      : "bg-muted"
                  )}
                />

                <CardContent className="p-5 space-y-4">
                  {/* Card Header & Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyCode(coupon.code)}
                          className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/20 text-primary font-mono font-extrabold text-base tracking-wider transition-colors group/btn cursor-pointer"
                          title={tr("اضغط للنسخ", "Click to copy")}
                        >
                          <span>{coupon.code}</span>
                          {copiedCode === coupon.code ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 opacity-60 group-hover/btn:opacity-100" />
                          )}
                        </button>

                        <Badge
                          variant={coupon.isActive ? "default" : "secondary"}
                          className={cn(
                            "rounded-lg text-[10px] font-bold uppercase",
                            coupon.isActive ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" : ""
                          )}
                        >
                          {coupon.isActive ? tr("نشط", "Active") : tr("متوقف", "Inactive")}
                        </Badge>
                      </div>

                      {coupon.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 pt-0.5">
                          {coupon.description}
                        </p>
                      )}
                    </div>

                    {/* Discount Pill */}
                    <div className="text-end shrink-0">
                      <div className="text-xl font-black tracking-tight text-foreground flex items-center justify-end gap-1">
                        {coupon.discountType === "percentage" ? (
                          <>
                            <span>{coupon.discountValue}%</span>
                            <span className="text-xs font-semibold text-muted-foreground uppercase">{tr("خصم", "OFF")}</span>
                          </>
                        ) : (
                          <>
                            <span>{coupon.discountValue}</span>
                            <span className="text-xs font-semibold text-muted-foreground">{t("common.egp") ?? "EGP"}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Conditions & Scope */}
                  <div className="space-y-2 text-xs pt-2 border-t border-border/40">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-primary/70" />
                        {tr("النطاق", "Scope")}:
                      </span>
                      <span className="font-semibold text-foreground truncate max-w-[180px]">
                        {courtName ? courtName : tr("عام (جميع الملاعب)", "Platform-Wide (All Courts)")}
                      </span>
                    </div>

                    {coupon.minBookingAmount && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Coins className="h-3.5 w-3.5 text-amber-500/70" />
                          {tr("الحد الأدنى للحجز", "Min Spend")}:
                        </span>
                        <span className="font-semibold text-foreground">
                          {coupon.minBookingAmount} {t("common.egp") ?? "EGP"}
                        </span>
                      </div>
                    )}

                    {coupon.maxDiscountCap && coupon.discountType === "percentage" && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Percent className="h-3.5 w-3.5 text-blue-500/70" />
                          {tr("الحد الأقصى للخصم", "Max Discount Cap")}:
                        </span>
                        <span className="font-semibold text-foreground">
                          {coupon.maxDiscountCap} {t("common.egp") ?? "EGP"}
                        </span>
                      </div>
                    )}

                    {coupon.expiresAt && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-rose-500/70" />
                          {tr("ينتهي في", "Expires")}:
                        </span>
                        <span className={cn("font-semibold", isExpired ? "text-destructive font-bold" : "text-foreground")}>
                          {new Date(coupon.expiresAt).toLocaleDateString(isAr ? "ar-EG" : "en-US")}
                          {isExpired && ` (${tr("منتهي", "Expired")})`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Usage Progress Bar */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground font-medium">
                      <span>{tr("مرات الاستخدام", "Redemptions")}</span>
                      <span className="font-bold text-foreground">
                        {coupon.usedCount}
                        {coupon.maxUses ? ` / ${coupon.maxUses}` : ` (${tr("غير محدود", "Unlimited")})`}
                      </span>
                    </div>
                    {coupon.maxUses && (
                      <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-300",
                            isMaxedOut ? "bg-destructive" : "bg-primary"
                          )}
                          style={{
                            width: `${Math.min(100, (coupon.usedCount / coupon.maxUses) * 100)}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-border/50">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={coupon.isActive}
                        onCheckedChange={() => handleToggleStatus(coupon)}
                        aria-label="Toggle active status"
                      />
                      <span className="text-xs text-muted-foreground font-medium">
                        {coupon.isActive ? tr("مفعل", "Active") : tr("موقوف", "Paused")}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(coupon)}
                        className="h-8 w-8 rounded-xl hover:bg-primary/10 hover:text-primary"
                        title={tr("تعديل", "Edit")}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedCoupon(coupon)
                          setIsDeleteOpen(true)
                        }}
                        className="h-8 w-8 rounded-xl hover:bg-destructive/10 hover:text-destructive"
                        title={tr("حذف", "Delete")}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog
        open={isCreateOpen || isEditOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateOpen(false)
            setIsEditOpen(false)
          }
        }}
      >
        <DialogContent className="rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold">
              <Tag className="h-5 w-5 text-primary" />
              {isCreateOpen
                ? tr("إنشاء كود خصم جديد", "Create New Promo Code")
                : tr("تعديل كود الخصم", "Edit Promo Code")}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {tr(
                "قم بملء بيانات الخصم والشروط وسيتم تطبيقها تلقائياً عند الدفع.",
                "Fill in discount parameters and conditions to apply automatically at checkout."
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={isCreateOpen ? handleCreateSubmit : handleEditSubmit} className="space-y-4 py-2">
            {/* Code & Generate Helper */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="coupon-code" className="text-xs font-bold">
                  {tr("كود الخصم *", "Promo Code *")}
                </Label>
                {isCreateOpen && (
                  <button
                    type="button"
                    onClick={handleGenerateCode}
                    className="text-xs text-primary hover:underline flex items-center gap-1 font-medium cursor-pointer"
                  >
                    <Sparkles className="h-3 w-3" />
                    {tr("توليد كود عشوائي", "Generate Random")}
                  </button>
                )}
              </div>
              <Input
                id="coupon-code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. SUMMER25"
                disabled={isEditOpen}
                className="rounded-2xl uppercase font-mono font-bold tracking-wider text-base"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label htmlFor="coupon-desc" className="text-xs font-bold">
                {tr("الوصف (اختياري)", "Description (Optional)")}
              </Label>
              <Input
                id="coupon-desc"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={tr("مثال: خصم الصيف 20% على ملاعب البادل", "e.g. Summer 20% discount on padel courts")}
                className="rounded-2xl text-sm"
              />
            </div>

            {/* Discount Type & Value */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold">{tr("نوع الخصم *", "Discount Type *")}</Label>
                <Select
                  value={formData.discountType}
                  onValueChange={(v: "percentage" | "fixed") => setFormData({ ...formData, discountType: v })}
                >
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl">
                    <SelectItem value="percentage">{tr("نسبة مئوية (%)", "Percentage (%)")}</SelectItem>
                    <SelectItem value="fixed">{tr("مبلغ ثابت (ج.م)", "Fixed Amount (EGP)")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="discount-val" className="text-xs font-bold">
                  {formData.discountType === "percentage"
                    ? tr("نسبة الخصم (%) *", "Discount Rate (%) *")
                    : tr("قيمة الخصم (ج.م) *", "Discount Amount (EGP) *")}
                </Label>
                <Input
                  id="discount-val"
                  type="number"
                  step="any"
                  min="1"
                  max={formData.discountType === "percentage" ? "100" : undefined}
                  value={formData.discountValue}
                  onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                  className="rounded-2xl font-bold"
                  required
                />
              </div>
            </div>

            {/* Percentage Cap & Min Spend */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-spend" className="text-xs font-bold">
                  {tr("الحد الأدنى للحجز (ج.م)", "Min Booking Spend (EGP)")}
                </Label>
                <Input
                  id="min-spend"
                  type="number"
                  min="0"
                  value={formData.minBookingAmount}
                  onChange={(e) => setFormData({ ...formData, minBookingAmount: e.target.value })}
                  placeholder="e.g. 200"
                  className="rounded-2xl text-sm"
                />
              </div>

              {formData.discountType === "percentage" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="max-cap" className="text-xs font-bold">
                    {tr("الحد الأقصى للخصم (ج.م)", "Max Discount Cap (EGP)")}
                  </Label>
                  <Input
                    id="max-cap"
                    type="number"
                    min="1"
                    value={formData.maxDiscountCap}
                    onChange={(e) => setFormData({ ...formData, maxDiscountCap: e.target.value })}
                    placeholder="e.g. 150"
                    className="rounded-2xl text-sm"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="max-per-user" className="text-xs font-bold">
                    {tr("أقصى استخدام لكل لاعب", "Max Uses Per User")}
                  </Label>
                  <Input
                    id="max-per-user"
                    type="number"
                    min="1"
                    value={formData.maxUsesPerUser}
                    onChange={(e) => setFormData({ ...formData, maxUsesPerUser: e.target.value })}
                    className="rounded-2xl text-sm"
                  />
                </div>
              )}
            </div>

            {/* Total Usage Limit & Expiry Date */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="max-uses" className="text-xs font-bold">
                  {tr("العدد الكلي للاستخدامات", "Total Redemptions Cap")}
                </Label>
                <Input
                  id="max-uses"
                  type="number"
                  min="1"
                  value={formData.maxUses}
                  onChange={(e) => setFormData({ ...formData, maxUses: e.target.value })}
                  placeholder={tr("فارغ = غير محدود", "Empty = Unlimited")}
                  className="rounded-2xl text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="expiry-date" className="text-xs font-bold">
                  {tr("تاريخ انتهاء الصلاحية", "Expiry Date")}
                </Label>
                <Input
                  id="expiry-date"
                  type="date"
                  value={formData.expiresAt}
                  onChange={(e) => setFormData({ ...formData, expiresAt: e.target.value })}
                  className="rounded-2xl text-sm"
                />
              </div>
            </div>

            {/* Venue / Court Selector */}
            <div className="space-y-1.5">
              <Label className="text-xs font-bold">{tr("نطاق الملعب المخصص", "Designated Court Scope")}</Label>
              <Select
                value={formData.courtId || "global"}
                onValueChange={(v) => setFormData({ ...formData, courtId: v === "global" ? "" : v })}
              >
                <SelectTrigger className="rounded-2xl">
                  <SelectValue placeholder={tr("اختر الملعب...", "Select court...")} />
                </SelectTrigger>
                <SelectContent className="rounded-2xl max-h-60">
                  {role === "admin" && (
                    <SelectItem value="global">{tr("🌐 عام (صالح لجميع الملاعب على المنصة)", "🌐 Global (Platform-Wide)")}</SelectItem>
                  )}
                  {courts.map((court) => (
                    <SelectItem key={court.id} value={court.id}>
                      {isAr ? court.name : court.nameEn || court.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-muted/20 border border-border/50">
              <div>
                <p className="text-xs font-bold">{tr("تفعيل الكوبون فوراً", "Activate Coupon Immediately")}</p>
                <p className="text-[11px] text-muted-foreground">
                  {tr("سيكون الكود متاحاً للاعبين عند الحجز", "The code will be usable by players at checkout")}
                </p>
              </div>
              <Switch
                checked={formData.isActive}
                onCheckedChange={(v) => setFormData({ ...formData, isActive: v })}
              />
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsCreateOpen(false)
                  setIsEditOpen(false)
                }}
                className="rounded-2xl"
              >
                {t("common.cancel") ?? tr("إلغاء", "Cancel")}
              </Button>
              <Button type="submit" disabled={isSubmitting} className="rounded-2xl gap-2">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {isCreateOpen ? tr("إنشاء الكوبون", "Create Coupon") : tr("حفظ التعديلات", "Save Changes")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Alert */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              {tr("تأكيد حذف كود الخصم", "Confirm Coupon Deletion")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {tr(
                `هل أنت متأكد من رغبتك في حذف الكوبون "${selectedCoupon?.code}"؟ لن يتمكن اللاعبون من استخدامه بعد الآن.`,
                `Are you sure you want to delete coupon "${selectedCoupon?.code}"? Players will no longer be able to redeem it.`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-2xl">{t("common.cancel") ?? tr("إلغاء", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isSubmitting}
              className="rounded-2xl bg-destructive hover:bg-destructive/90 text-white"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {tr("حذف الكوبون", "Delete Coupon")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
