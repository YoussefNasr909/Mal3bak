"use client"

import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "framer-motion"
import {
  ArrowUpDown,
  CalendarClock,
  Copy,
  Crown,
  Download,
  Eye,
  EyeOff,
  Filter,
  Hash,
  KeyRound,
  LayoutGrid,
  List,
  Loader2,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  RefreshCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  XCircle,
} from "lucide-react"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm, useWatch } from "react-hook-form"
import { cn } from "@/lib/utils"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { useLanguage } from "@/components/providers/language-provider"
import { useAuth } from "@/components/providers/auth-provider"
import { useIsMobile } from "@/components/ui/use-mobile"
import { toast } from "sonner"

import {
  adminCreatePasswordResetLink,
  adminCreateUser,
  adminDeleteUser,
  adminGetUser,
  adminGetUserCounts,
  adminListUsers,
  adminUpdateUser,
  adminUpdateUserStatus,
  type AdminUser,
  type AdminListUsersResponse,
  type AuthRole,
  ApiError,
} from "@/lib/api"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Checkbox } from "@/components/ui/checkbox"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { PageHeader } from "@/components/ui/page-header"
import { StatusBadge } from "@/components/ui/status-badge"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader } from "@/components/ui/table"

type Role = AuthRole
type StatusFilter = "all" | "active" | "inactive"
type SortKey = "newest" | "oldest" | "name_asc" | "name_desc"
type Density = "comfortable" | "compact"
type ViewMode = "table" | "cards"

type Stats = {
  total: number
  active: number
  inactive: number
  byRole: { admin: number; manager: number; player: number }
}
type UserStatusChangeTarget =
  | { scope: "single"; user: AdminUser; nextActive: boolean }
  | { scope: "bulk"; users: AdminUser[]; nextActive: boolean }

/* ------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------ */

function initialsOf(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

function formatDateIntl(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric" }).format(date)
}

function formatDateTimeIntl(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function roleLabel(role: Role, lang: "ar" | "en") {
  const map: Record<Role, { ar: string; en: string }> = {
    admin: { ar: "مدير النظام", en: "Admin" },
    manager: { ar: "مدير ملعب", en: "Manager" },
    player: { ar: "لاعب", en: "Player" },
  }
  return map[role][lang]
}

function statusLabel(isActive: boolean, lang: "ar" | "en") {
  return isActive ? (lang === "ar" ? "نشط" : "Active") : lang === "ar" ? "غير نشط" : "Inactive"
}

function csvEscape(value: unknown) {
  const s = String(value ?? "")
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function copyToClipboard(text: string, okMsg: string, errMsg: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(okMsg)
  } catch {
    toast.error(errMsg)
  }
}

function isEditableTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null
  if (!node) return false
  const tag = node.tagName?.toLowerCase()
  return tag === "input" || tag === "textarea" || node.isContentEditable
}

function isInteractiveTarget(el: EventTarget | null) {
  const node = el as HTMLElement | null
  if (!node) return false
  if (isEditableTarget(node)) return true
  return Boolean(
    node.closest(
      'button, a, [role="button"], [role="menuitem"], [data-user-card-action], [data-radix-collection-item]',
    ),
  )
}


function isWalkInGuest(user: Pick<AdminUser, "email"> | null | undefined) {
  return String(user?.email || "").toLowerCase().endsWith("@walkin.local")
}
function makeStrongPassword(len = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_+=?"
  const arr = new Uint32Array(len)
  crypto.getRandomValues(arr)
  return Array.from(arr)
    .map((n) => alphabet[n % alphabet.length])
    .join("")
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

function buildPagination(current: number, total: number) {
  // Compact paginator: [1] ... [c-1] [c] [c+1] ... [total]
  const pages = new Set<number>([1, total, current, current - 1, current + 1].filter((n) => n >= 1 && n <= total))
  const sorted = Array.from(pages).sort((a, b) => a - b)

  const out: Array<number | "ellipsis"> = []
  for (let i = 0; i < sorted.length; i++) {
    const n = sorted[i]
    const prev = sorted[i - 1]
    if (i > 0 && prev !== undefined && n - prev > 1) out.push("ellipsis")
    out.push(n)
  }
  return out
}

/* ------------------------------------------------------------------
 * UI atoms (enterprise look)
 * ------------------------------------------------------------------ */


function RoleBadge({ role, lang }: { role: Role; lang: "ar" | "en" }) {
  const cls =
    role === "admin"
      ? "bg-primary/10 text-primary border-primary/20"
      : role === "manager"
        ? "bg-sky-500/10 text-sky-600 border-sky-500/20"
        : "bg-amber-500/10 text-amber-600 border-amber-500/20"

  const Icon = role === "admin" ? Crown : role === "manager" ? Shield : Users

  return (
    <Badge
      variant="outline"
      className={cn("rounded-2xl border px-2.5 py-1 text-[11px] font-extrabold inline-flex items-center gap-1.5", cls)}
    >
      <Icon className="h-3.5 w-3.5" />
      {roleLabel(role, lang)}
    </Badge>
  )
}

function ActiveBadge({ isActive, lang }: { isActive: boolean; lang: "ar" | "en" }) {
  return (
    <StatusBadge
      variant={isActive ? "success" : "warning"}
      dot
      pulse={isActive}
      className="rounded-2xl px-2.5 py-1 text-[11px] font-extrabold"
    >
      {statusLabel(isActive, lang)}
    </StatusBadge>
  )
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: any
  label: string
  value: string
  tone?: "default" | "primary" | "sky" | "amber" | "success"
}) {
  const iconTone =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "sky"
        ? "bg-sky-500/10 text-sky-600"
        : tone === "amber"
          ? "bg-amber-500/10 text-amber-600"
          : tone === "success"
            ? "bg-emerald-500/10 text-emerald-600"
            : "bg-muted text-muted-foreground"

  return (
    <Card className="group rounded-3xl border-border/60 bg-card/50 transition-all hover:bg-card hover:shadow-md hover:-translate-y-[2px] hover:border-primary/25 ring-1 ring-transparent hover:ring-primary/20" style={{ transform: "translateZ(0)" }}>
      <CardContent className="p-4 sm:p-5 flex items-center gap-4">
        <div
          className={cn(
            "h-11 w-11 sm:h-12 sm:w-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105",
            iconTone,
          )}
        >
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </div>
        <div className="min-w-0">
          <div className="text-xl sm:text-2xl font-black leading-none">{value}</div>
          <div className="mt-1 text-sm font-semibold text-muted-foreground truncate">{label}</div>
        </div>
      </CardContent>
    </Card>
  )
}


function HighlightedText({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return <>{text}</>
  const before = text.slice(0, idx)
  const match = text.slice(idx, idx + q.length)
  const after = text.slice(idx + q.length)
  return (
    <>
      {before}
      <span className="rounded bg-primary/15 px-1 font-extrabold text-primary">{match}</span>
      {after}
    </>
  )
}

/* ------------------------------------------------------------------
 * Form (Create/Edit)
 * ------------------------------------------------------------------ */

const roleEnum = z.enum(["admin", "manager", "player"])

const createSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Invalid email"),
  phone: z.string().optional(),
  role: roleEnum,
  isActive: z.boolean(),
  password: z.string().min(8, "Min 8 characters"),
})

const editSchema = createSchema.extend({
  password: z.string().optional(),
})

type CreateFormValues = z.infer<typeof createSchema>
type EditFormValues = z.infer<typeof editSchema>

function normalizeFormValues(values: Partial<CreateFormValues | EditFormValues>) {
  const phone = (values.phone ?? "").trim()

  return {
    ...values,
    phone: phone ? phone : undefined,
  }
}

function UserFormSheet({
  open,
  onOpenChange,
  mode,
  initial,
  onSubmit,
  loading,
  lang,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  mode: "create" | "edit"
  initial?: AdminUser | null
  onSubmit: (values: CreateFormValues | EditFormValues) => Promise<void>
  loading: boolean
  lang: "ar" | "en"
}) {
  const isCreate = mode === "create"
  const schema = isCreate ? createSchema : editSchema

  const form = useForm<CreateFormValues | EditFormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: isCreate
      ? {
          name: "",
          email: "",
          phone: "",
          role: "player",
          isActive: true,
          password: "",
        }
      : {
          name: initial?.name ?? "",
          email: initial?.email ?? "",
          phone: (initial?.phone as any) ?? "",
          role: (initial?.role as any) ?? "player",
          isActive: !!initial?.isActive,
          password: "",
        },
  })

  const role = useWatch({ control: form.control, name: "role" })
  const name = useWatch({ control: form.control, name: "name" })
  const email = useWatch({ control: form.control, name: "email" })
  const phone = useWatch({ control: form.control, name: "phone" })
  const isActive = useWatch({ control: form.control, name: "isActive" })
  const password = useWatch({ control: form.control, name: "password" })
  const [showPassword, setShowPassword] = useState(false)

  // Reset when opening/initial changes
  useEffect(() => {
    if (!open) return
    setShowPassword(false)

    if (isCreate) {
      form.reset({
        name: "",
        email: "",
        phone: "",
        role: "player",
        isActive: true,
        password: "",
      })
      return
    }

    form.reset({
      name: initial?.name ?? "",
      email: initial?.email ?? "",
      phone: (initial?.phone as any) ?? "",
      role: (initial?.role as any) ?? "player",
      isActive: !!initial?.isActive,
      password: "",
    })
  }, [
    open, 
    isCreate, 
    form,
    initial?.id,
    initial?.name,
    initial?.email,
    initial?.phone,
    initial?.role,
    initial?.isActive
  ])

  const title =
    isCreate ? (lang === "ar" ? "إضافة مستخدم" : "Create user") : lang === "ar" ? "تعديل المستخدم" : "Edit user"
  const subtitle =
    isCreate
      ? lang === "ar"
        ? "أنشئ مستخدمًا جديدًا وحدد الدور والحالة."
        : "Create a new user and choose role/status."
      : lang === "ar"
        ? "حدّث بيانات المستخدم بطريقة احترافية."
        : "Update user details in a clean layout."

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0">
        <div className="h-full flex flex-col">
          <div className="p-5 border-b border-border/60 bg-linear-to-br from-primary/10 via-primary/3 to-transparent">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {isCreate ? <UserPlus className="h-5 w-5 text-primary" /> : <Pencil className="h-5 w-5 text-primary" />}
                {title}
              </SheetTitle>
              <SheetDescription>{subtitle}</SheetDescription>
            </SheetHeader>
          </div>

          <form
            className="p-5 overflow-auto space-y-4"
            onSubmit={form.handleSubmit(async (values) => {
              await onSubmit(values)
            })}
          >
            <div className="rounded-3xl border border-border/60 bg-linear-to-br from-primary/8 via-primary/3 to-transparent p-4">
              <div className="flex items-start gap-3">
                <Avatar className="h-12 w-12 rounded-2xl border border-primary/15">
                  <AvatarFallback className="rounded-2xl bg-primary/10 text-primary font-black">
                    {form.getValues().name?.trim() ? initialsOf(form.getValues().name) : "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="font-black truncate">
                    {isCreate ? (lang === "ar" ? "بيانات المستخدم" : "User info") : lang === "ar" ? "تحديث البيانات" : "Update info"}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {lang === "ar" ? "املأ البيانات الأساسية وحدد الدور والحالة" : "Fill the basics and choose role/status"}
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              {/* Name */}
              <div className="grid gap-2">
                <label className="text-sm font-bold">{lang === "ar" ? "الاسم" : "Name"}</label>
                <Input
                  value={(name as string) || ""}
                  onChange={(e) => form.setValue("name", e.target.value, { shouldValidate: true })}
                  placeholder={lang === "ar" ? "الاسم الكامل" : "Full name"}
                  className={cn(
                    "rounded-2xl h-11",
                    lang === "ar" ? "text-right" : "text-left",
                    form.formState.errors.name && "border-destructive",
                  )}
                  dir={lang === "ar" ? "rtl" : "ltr"}
                />
                {form.formState.errors.name?.message && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.name.message)}</p>
                )}
              </div>

              {/* Email */}
              <div className="grid gap-2">
                <label className="text-sm font-bold">{lang === "ar" ? "البريد الإلكتروني" : "Email"}</label>
                <Input
                  type="email"
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  value={(email as string) || ""}
                  onChange={(e) => form.setValue("email", e.target.value, { shouldValidate: true })}
                  placeholder={lang === "ar" ? "اسم@مثال.com" : "email@example.com"}
                  className={cn(
                    "rounded-2xl h-11",
                    lang === "ar" ? "text-right" : "text-left",
                    form.formState.errors.email && "border-destructive",
                  )}
                />
                {form.formState.errors.email?.message && (
                  <p className="text-xs text-destructive">{String(form.formState.errors.email.message)}</p>
                )}
              </div>

              {/* Phone */}
              <div className="grid gap-2">
                <label className="text-sm font-bold">{lang === "ar" ? "الهاتف" : "Phone"}</label>
                <Input
                  dir={lang === "ar" ? "rtl" : "ltr"}
                  value={(phone as string) || ""}
                  onChange={(e) => form.setValue("phone", e.target.value, { shouldValidate: true })}
                  placeholder={lang === "ar" ? "٠١٠ ٠٠٠٠ ٠٠٠٠" : "+20 123 456 7890"}
                  className={cn("rounded-2xl h-11", lang === "ar" ? "text-right" : "text-left")}
                />
              </div>

              {/* Role + status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <label className="text-sm font-bold">{lang === "ar" ? "الدور" : "Role"}</label>
                  <Select value={role as any} onValueChange={(v: any) => form.setValue("role", v, { shouldValidate: true })}>
                    <SelectTrigger className="rounded-2xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{roleLabel("admin", lang)}</SelectItem>
                      <SelectItem value="manager">{roleLabel("manager", lang)}</SelectItem>
                      <SelectItem value="player">{roleLabel("player", lang)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-bold">{lang === "ar" ? "الحالة" : "Status"}</label>
                  <Select
                    value={(isActive ? "active" : "inactive") as any}
                    onValueChange={(v) => form.setValue("isActive", v === "active", { shouldValidate: true })}
                  >
                    <SelectTrigger className="rounded-2xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">{lang === "ar" ? "نشط" : "Active"}</SelectItem>
                      <SelectItem value="inactive">{lang === "ar" ? "غير نشط" : "Inactive"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Password (create only) */}
              {isCreate ? (
                <div className="grid gap-2">
                  <label className="text-sm font-bold">{lang === "ar" ? "كلمة المرور" : "Password"}</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showPassword ? "text" : "password"}
                        dir={lang === "ar" ? "rtl" : "ltr"}
                        value={(password as string) || ""}
                        onChange={(e) => form.setValue("password", e.target.value, { shouldValidate: true })}
                        placeholder={lang === "ar" ? "كلمة مرور قوية" : "Strong password"}
                        className={cn(
                          "rounded-2xl h-11 pe-10",
                          lang === "ar" ? "text-right" : "text-left",
                          form.formState.errors.password && "border-destructive",
                        )}
                      />
                      <button
                        type="button"
                        className="absolute end-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword((s) => !s)}
                        aria-label={
                          showPassword
                            ? lang === "ar"
                              ? "إخفاء كلمة المرور"
                              : "Hide password"
                            : lang === "ar"
                              ? "إظهار كلمة المرور"
                              : "Show password"
                        }
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl bg-transparent h-11 flex-1"
                        onClick={() => form.setValue("password", makeStrongPassword(12), { shouldValidate: true })}
                      >
                        <Sparkles className="me-2 h-4 w-4" />
                        {lang === "ar" ? "توليد" : "Generate"}
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-2xl bg-transparent h-11"
                        onClick={() =>
                          copyToClipboard(
                            String(form.getValues().password || ""),
                            lang === "ar" ? "تم نسخ كلمة المرور" : "Password copied",
                            lang === "ar" ? "فشل النسخ" : "Copy failed",
                          )
                        }
                        disabled={!form.getValues().password}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {form.formState.errors.password?.message && (
                    <p className="text-xs text-destructive">{String(form.formState.errors.password.message)}</p>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {lang === "ar"
                      ? "ملاحظة: يمكنك أيضًا إرسال رابط إعادة تعيين لاحقًا من صفحة المستخدم."
                      : "Tip: you can also send a reset link later from the user actions."}
                  </p>
                </div>
              ) : null}
              </div>

            <div className="pb-6" />
            <SheetFooter className="pt-2">
              <div className="w-full flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-2xl bg-transparent"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button type="submit" className="rounded-2xl" disabled={loading}>
                  {loading ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
                  {isCreate ? (lang === "ar" ? "إضافة" : "Create") : lang === "ar" ? "حفظ" : "Save"}
                </Button>
              </div>
            </SheetFooter>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}

/* ------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------ */

export function UsersManagement() {
  const { language } = useLanguage()
  const { user: currentUser } = useAuth()
  const isMobile = useIsMobile()
  const reduceMotion = useReducedMotion()

  const lang = (language === "ar" ? "ar" : "en") as "ar" | "en"
  const locale = lang === "ar" ? "ar-EG" : "en-US"
  const dir = lang === "ar" ? "rtl" : "ltr"
  const nf = useMemo(() => new Intl.NumberFormat(locale), [locale])

  // Persisted UI prefs
  const densityKey = "admin_users_density"
  const viewKey = "admin_users_view"
  const limitKey = "admin_users_limit"

  // Data
  const [result, setResult] = useState<AdminListUsersResponse | null>(null)
  const users = useMemo(() => result?.items ?? [], [result?.items])
  const [loading, setLoading] = useState(false)
  const [statsLoading, setStatsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Stats
  const [stats, setStats] = useState<Stats>({
    total: 0,
    active: 0,
    inactive: 0,
    byRole: { admin: 0, manager: 0, player: 0 },
  })

  // Filters
  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearch = useDebouncedValue(searchQuery, 400)
  const [selectedRole, setSelectedRole] = useState<Role | "all">("all")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [showWalkInGuests, setShowWalkInGuests] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("newest")

  // Selection + pagination
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(10)

  // View/UX preferences
  const [density, setDensity] = useState<Density>("comfortable")
  const [viewMode, setViewMode] = useState<ViewMode>("table")

  // Panels
  const [detailsUser, setDetailsUser] = useState<AdminUser | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<"create" | "edit">("create")
  const [formInitial, setFormInitial] = useState<AdminUser | null>(null)
  const [formSaving, setFormSaving] = useState(false)

  // Confirm dialogs
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [statusChangeTarget, setStatusChangeTarget] = useState<UserStatusChangeTarget | null>(null)
  const [isUpdatingUserStatus, setIsUpdatingUserStatus] = useState(false)

  // Reset password dialog
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [resetLink, setResetLink] = useState<{ url: string; expiresAt: string } | null>(null)
  const [resetLoading, setResetLoading] = useState(false)

  const searchRef = useRef<HTMLInputElement | null>(null)

  // Load prefs once
  useEffect(() => {
    try {
      const d = localStorage.getItem(densityKey)
      if (d === "compact" || d === "comfortable") setDensity(d)
      const v = localStorage.getItem(viewKey)
      if (v === "table" || v === "cards") setViewMode(v)
      const l = localStorage.getItem(limitKey)
      if (l && !Number.isNaN(Number(l))) setLimit(Math.max(10, Math.min(100, Number(l))))
    } catch {
      // ignore
    }
  }, [])

  // Persist prefs
  useEffect(() => {
    try {
      localStorage.setItem(densityKey, density)
    } catch {}
  }, [density])
  useEffect(() => {
    try {
      localStorage.setItem(viewKey, viewMode)
    } catch {}
  }, [viewMode])
  useEffect(() => {
    try {
      localStorage.setItem(limitKey, String(limit))
    } catch {}
  }, [limit])

  // Keyboard shortcut: "/" or Ctrl+K focuses search
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditableTarget(e.target)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && !isEditableTarget(e.target)) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // Reset selection on slice changes
  useEffect(() => {
    setSelectedIds([])
  }, [debouncedSearch, selectedRole, statusFilter, showWalkInGuests, sortKey, page, limit])

  const sortParams = useMemo(() => {
    switch (sortKey) {
      case "oldest":
        return { sortBy: "createdAt" as const, order: "asc" as const }
      case "name_asc":
        return { sortBy: "name" as const, order: "asc" as const }
      case "name_desc":
        return { sortBy: "name" as const, order: "desc" as const }
      case "newest":
      default:
        return { sortBy: "createdAt" as const, order: "desc" as const }
    }
  }, [sortKey])

  const canActOnUser = useCallback(
    (u: AdminUser) => {
      // Guardrail: prevent destructive actions on self from UI (backend should also block)
      if (currentUser?.id && u.id === currentUser.id) return false
      return true
    },
    [currentUser?.id],
  )

  const loadUsers = useCallback(async () => {
    if (!currentUser || currentUser.role !== "admin") return

    setLoading(true)
    setError(null)
    try {
      const isActive = statusFilter === "all" ? undefined : statusFilter === "active" ? true : false

      const res = await adminListUsers({
        q: debouncedSearch || undefined,
        role: selectedRole === "all" ? undefined : selectedRole,
        isActive,
        page,
        limit,
        excludeWalkIns: !showWalkInGuests,
        ...sortParams,
      })

      setResult(res)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : lang === "ar" ? "حدث خطأ" : "Something went wrong"
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [currentUser, debouncedSearch, selectedRole, statusFilter, page, limit, sortParams, showWalkInGuests, lang])

  const loadStats = useCallback(async () => {
    if (!currentUser || currentUser.role !== "admin") return
    setStatsLoading(true)
    try {
      const role = selectedRole === "all" ? undefined : selectedRole
      const q = debouncedSearch || undefined

      const counts = await adminGetUserCounts({
        q,
        role,
        excludeWalkIns: !showWalkInGuests,
      })

      setStats(counts)
    } catch {
      // Stats are "nice to have" — don't block the page.
    } finally {
      setStatsLoading(false)
    }
  }, [currentUser, selectedRole, debouncedSearch, showWalkInGuests])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const refresh = async () => {
    await Promise.all([loadUsers(), loadStats()])
  }

  useAutoRefresh(refresh)

  const openDetails = async (u: AdminUser) => {
    setDetailsUser(u)
    setDetailsOpen(true)

    try {
      const fresh = await adminGetUser(u.id)
      setDetailsUser(fresh.user)
    } catch {
      // ignore, keep row data
    }
  }

  const openCreate = () => {
    setFormMode("create")
    setFormInitial(null)
    setFormOpen(true)
  }

  const openEdit = async (u: AdminUser) => {
    setFormMode("edit")
    setFormInitial(u)
    setFormOpen(true)

    try {
      const fresh = await adminGetUser(u.id)
      setFormInitial(fresh.user)
    } catch {
      // ignore
    }
  }

  const createUser = async (values: CreateFormValues | EditFormValues) => {
    const payload = normalizeFormValues(values) as CreateFormValues
    setFormSaving(true)
    try {
      const res = await adminCreateUser({
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        password: payload.password,
        role: payload.role,
        isActive: payload.isActive,
      })
      toast.success(lang === "ar" ? "تم إنشاء المستخدم" : "User created")
      setFormOpen(false)

      if (debouncedSearch) setSearchQuery("")
      setPage(1)

      await Promise.all([loadUsers(), loadStats()])
      openDetails(res.user)
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : lang === "ar" ? "فشل إنشاء المستخدم" : "Create failed")
    } finally {
      setFormSaving(false)
    }
  }

  const updateUser = async (values: CreateFormValues | EditFormValues) => {
    if (!formInitial) return
    const payload = normalizeFormValues(values) as EditFormValues

    setFormSaving(true)
    try {
      const res = await adminUpdateUser(formInitial.id, {
        name: payload.name,
        email: payload.email,
        phone: payload.phone,
        role: payload.role,
        isActive: payload.isActive,
      })
      toast.success(lang === "ar" ? "تم تحديث المستخدم" : "User updated")
      setFormOpen(false)

      if (detailsUser?.id === res.user.id) setDetailsUser(res.user)
      await Promise.all([loadUsers(), loadStats()])
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : lang === "ar" ? "فشل التحديث" : "Update failed")
    } finally {
      setFormSaving(false)
    }
  }

  const applySingleUserStatusChange = useCallback(async (u: AdminUser, nextActive: boolean) => {
    setResult((prev) =>
      prev ? { ...prev, items: prev.items.map((x) => (x.id === u.id ? { ...x, isActive: nextActive } : x)) } : prev,
    )

    try {
      const res = await adminUpdateUserStatus(u.id, nextActive)
      toast.success(nextActive ? (lang === "ar" ? "تم التفعيل" : "Activated") : lang === "ar" ? "تم التعطيل" : "Deactivated")
      if (detailsUser?.id === res.user.id) setDetailsUser(res.user)
      await loadStats()
    } catch (e) {
      setResult((prev) =>
        prev ? { ...prev, items: prev.items.map((x) => (x.id === u.id ? { ...x, isActive: u.isActive } : x)) } : prev,
      )
      toast.error(e instanceof ApiError ? e.message : lang === "ar" ? "فشل تغيير الحالة" : "Status update failed")
    }
  }, [detailsUser?.id, lang, loadStats])

  const deleteUser = async (u: AdminUser) => {
    try {
      await adminDeleteUser(u.id)
      toast.success(lang === "ar" ? "تم الحذف" : "Deleted")
      setDeleteTarget(null)
      setDetailsOpen(false)
      setDetailsUser(null)

      const isLastOnPage = users.length === 1 && page > 1
      if (isLastOnPage) setPage((p) => p - 1)

      await Promise.all([loadUsers(), loadStats()])
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : lang === "ar" ? "فشل الحذف" : "Delete failed")
    }
  }

  const applyBulkUserStatusChange = useCallback(async (targets: AdminUser[], nextActive: boolean) => {
    if (!targets.length) return

    const toastId = toast.loading(lang === "ar" ? "جارِ التنفيذ..." : "Working...")
    const results = await Promise.allSettled(targets.map((u) => adminUpdateUserStatus(u.id, nextActive)))

    toast.dismiss(toastId)

    const ok = results.filter((r) => r.status === "fulfilled").length
    const bad = results.length - ok

    if (ok) toast.success(lang === "ar" ? `تم تنفيذ ${ok}` : `Updated ${ok}`)
    if (bad) toast.error(lang === "ar" ? `فشل ${bad}` : `Failed ${bad}`)

    setSelectedIds([])
    await Promise.all([loadUsers(), loadStats()])
  }, [lang, loadStats, loadUsers])

  const requestSingleUserStatusChange = useCallback((u: AdminUser, nextActive: boolean) => {
    setStatusChangeTarget({ scope: "single", user: u, nextActive })
  }, [])

  const requestBulkUserStatusChange = useCallback((nextActive: boolean) => {
    if (!selectedIds.length) return
    const targets = users.filter((u) => selectedIds.includes(u.id))
    const actionable = targets.filter(canActOnUser)

    if (!actionable.length) {
      toast.message(lang === "ar" ? "لا يوجد عناصر قابلة للتنفيذ" : "Nothing actionable")
      return
    }

    setStatusChangeTarget({ scope: "bulk", users: actionable, nextActive })
  }, [canActOnUser, lang, selectedIds, users])

  const applyPendingUserStatusChange = useCallback(async () => {
    if (!statusChangeTarget) return

    setIsUpdatingUserStatus(true)

    try {
      if (statusChangeTarget.scope === "single") {
        await applySingleUserStatusChange(statusChangeTarget.user, statusChangeTarget.nextActive)
      } else {
        await applyBulkUserStatusChange(statusChangeTarget.users, statusChangeTarget.nextActive)
      }

      setStatusChangeTarget(null)
    } finally {
      setIsUpdatingUserStatus(false)
    }
  }, [applyBulkUserStatusChange, applySingleUserStatusChange, statusChangeTarget])

  const bulkDelete = async () => {
    if (!selectedIds.length) return
    const targets = users.filter((u) => selectedIds.includes(u.id))
    const actionable = targets.filter(canActOnUser)

    if (!actionable.length) {
      toast.message(lang === "ar" ? "لا يوجد عناصر قابلة للحذف" : "Nothing to delete")
      setBulkDeleteOpen(false)
      return
    }

    const toastId = toast.loading(lang === "ar" ? "جارِ الحذف..." : "Deleting...")
    const results = await Promise.allSettled(actionable.map((u) => adminDeleteUser(u.id)))
    toast.dismiss(toastId)

    const ok = results.filter((r) => r.status === "fulfilled").length
    const bad = results.length - ok

    if (ok) toast.success(lang === "ar" ? `تم حذف ${ok}` : `Deleted ${ok}`)
    if (bad) toast.error(lang === "ar" ? `فشل ${bad}` : `Failed ${bad}`)

    setSelectedIds([])
    setBulkDeleteOpen(false)

    const isLastOnPage = users.length === actionable.length && page > 1
    if (isLastOnPage) setPage((p) => p - 1)

    await Promise.all([loadUsers(), loadStats()])
  }

  const exportCSV = async (mode: "page" | "all") => {
    try {
      if (mode === "page") {
        const header = ["id", "name", "email", "phone", "role", "isActive", "createdAt"].join(",")
        const rows = users.map((u) =>
          [
            csvEscape(u.id),
            csvEscape(u.name),
            csvEscape(u.email),
            csvEscape(u.phone ?? ""),
            csvEscape(u.role),
            csvEscape(u.isActive),
            csvEscape(u.createdAt),
          ].join(","),
        )
        const csv = [header, ...rows].join("\n")
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `users-page-${page}-${new Date().toISOString().slice(0, 10)}.csv`
        a.click()
        URL.revokeObjectURL(url)
        toast.success(lang === "ar" ? "تم التصدير" : "Exported")
        return
      }

      const toastId = toast.loading(lang === "ar" ? "جارِ التصدير..." : "Exporting...")
      const isActive = statusFilter === "all" ? undefined : statusFilter === "active" ? true : false

      let p = 1
      let pages = 1
      const all: AdminUser[] = []
      do {
        const res = await adminListUsers({
          q: debouncedSearch || undefined,
          role: selectedRole === "all" ? undefined : selectedRole,
          isActive,
          page: p,
          limit: 100,
          excludeWalkIns: !showWalkInGuests,
          ...sortParams,
        })
        all.push(...res.items)
        pages = res.pages
        p += 1
      } while (p <= pages)

      toast.dismiss(toastId)

      const header = ["id", "name", "email", "phone", "role", "isActive", "createdAt"].join(",")
      const rows = all.map((u) =>
        [
          csvEscape(u.id),
          csvEscape(u.name),
          csvEscape(u.email),
          csvEscape(u.phone ?? ""),
          csvEscape(u.role),
          csvEscape(u.isActive),
          csvEscape(u.createdAt),
        ].join(","),
      )
      const csv = [header, ...rows].join("\n")
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `users-all-${new Date().toISOString().slice(0, 10)}.csv`
      a.click()
      URL.revokeObjectURL(url)

      toast.success(lang === "ar" ? "تم التصدير" : "Exported")
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : lang === "ar" ? "فشل التصدير" : "Export failed")
    }
  }

  const sendResetLink = async (u: AdminUser) => {
    setResetTarget(u)
    setResetLink(null)
    setResetDialogOpen(true)
    setResetLoading(true)
    try {
      const res = await adminCreatePasswordResetLink(u.id)
      setResetLink({ url: res.resetUrl, expiresAt: res.expiresAt })
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : lang === "ar" ? "فشل إنشاء الرابط" : "Failed to create link")
      setResetDialogOpen(false)
    } finally {
      setResetLoading(false)
    }
  }

  const clearFilters = () => {
    setSearchQuery("")
    setSelectedRole("all")
    setStatusFilter("all")
    setShowWalkInGuests(false)
    setSortKey("newest")
    setPage(1)
    toast.message(lang === "ar" ? "تمت إعادة الضبط" : "Filters reset")
  }

  const totalPages = result?.pages ?? 1
  const compact = density === "compact"
  const effectiveViewMode: ViewMode = isMobile ? "cards" : viewMode

  const allOnPageSelected = users.length > 0 && users.every((u) => selectedIds.includes(u.id))
  const someOnPageSelected = users.some((u) => selectedIds.includes(u.id))

  const toggleSelectAllOnPage = () => {
    if (allOnPageSelected) {
      setSelectedIds((prev) => prev.filter((id) => !users.some((u) => u.id === id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...users.map((u) => u.id)])))
    }
  }

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const paginationItems = useMemo(() => buildPagination(page, totalPages), [page, totalPages])
  const statusChangeCount = statusChangeTarget?.scope === "bulk" ? statusChangeTarget.users.length : 1
  const statusChangeDialogCopy = statusChangeTarget
    ? {
        title: statusChangeTarget.nextActive
          ? lang === "ar"
            ? "تأكيد التفعيل"
            : "Confirm activation"
          : lang === "ar"
            ? "تأكيد التعطيل"
            : "Confirm deactivation",
        description:
          statusChangeTarget.scope === "single"
            ? statusChangeTarget.nextActive
              ? lang === "ar"
                ? `سيتم تفعيل المستخدم "${statusChangeTarget.user.name}".`
                : `This will activate "${statusChangeTarget.user.name}".`
              : lang === "ar"
                ? `سيتم تعطيل المستخدم "${statusChangeTarget.user.name}".`
                : `This will deactivate "${statusChangeTarget.user.name}".`
            : statusChangeTarget.nextActive
              ? lang === "ar"
                ? `سيتم تفعيل ${nf.format(statusChangeCount)} مستخدم(ين) محددين.`
                : `This will activate ${nf.format(statusChangeCount)} selected users.`
              : lang === "ar"
                ? `سيتم تعطيل ${nf.format(statusChangeCount)} مستخدم(ين) محددين.`
                : `This will deactivate ${nf.format(statusChangeCount)} selected users.`,
        confirmLabel: statusChangeTarget.nextActive
          ? lang === "ar"
            ? "تفعيل"
            : "Activate"
          : lang === "ar"
            ? "تعطيل"
            : "Deactivate",
      }
    : null

  const pageActions = (
    <>
      <Button variant="outline" className="rounded-2xl bg-transparent" onClick={refresh} disabled={loading}>
        <RefreshCcw className={cn("me-2 h-4 w-4", loading && "animate-spin")} />
        {lang === "ar" ? "تحديث" : "Refresh"}
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="rounded-2xl bg-transparent">
            <Download className="me-2 h-4 w-4" />
            {lang === "ar" ? "تصدير" : "Export"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{lang === "ar" ? "تصدير البيانات" : "Export data"}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => exportCSV("page")}>
            {lang === "ar" ? "تصدير الصفحة الحالية" : "Export current page"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => exportCSV("all")}>
            {lang === "ar" ? "تصدير كل النتائج (مفلترة)" : "Export all filtered results"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button className="rounded-2xl" onClick={openCreate}>
        <Plus className="me-2 h-4 w-4" />
        {lang === "ar" ? "إضافة" : "New user"}
      </Button>
    </>
  )

  // RBAC guard (front-end)
  if (!currentUser || currentUser.role !== "admin") {
    return (
      <div className="space-y-6" dir={dir}>
        <PageHeader
          title={lang === "ar" ? "إدارة المستخدمين" : "User management"}
          description={lang === "ar" ? "صلاحيات غير كافية." : "You don’t have access."}
        />
        <EmptyState
          icon={Shield}
          title={lang === "ar" ? "غير مصرح" : "Not authorized"}
          description={lang === "ar" ? "هذه الصفحة متاحة للمدير فقط." : "This page is admin-only."}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6" dir={dir}>
      <PageHeader
        title={lang === "ar" ? "إدارة المستخدمين" : "User management"}
        description={
          lang === "ar"
            ? "لوحة احترافية لإدارة الحسابات — بحث، فلاتر، عمليات جماعية، وتصدير."
            : "A modern admin panel for users — search, filters, bulk actions, and export."
        }
        actions={pageActions}
      />

      {/* Stats */}
      <AnimatePresence mode="popLayout">
        <motion.div
          key="stats"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          {statsLoading ? (
            <LoadingSkeleton variant="stats" />
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatTile icon={Users} label={lang === "ar" ? "إجمالي" : "Total"} value={nf.format(stats.total)} tone="primary" />
                <StatTile icon={UserCheck} label={lang === "ar" ? "نشط" : "Active"} value={nf.format(stats.active)} tone="success" />
                <StatTile icon={UserX} label={lang === "ar" ? "غير نشط" : "Inactive"} value={nf.format(stats.inactive)} tone="amber" />
                <StatTile icon={Shield} label={lang === "ar" ? "المديرون" : "Admins"} value={nf.format(stats.byRole.admin)} tone="sky" />
              </div>

            </>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Filters + List */}
      <Card className="rounded-3xl border-border/60 bg-card/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <CardTitle className="text-xl font-black">{lang === "ar" ? "المستخدمون" : "Users"}</CardTitle>
              <CardDescription>
                {lang === "ar"
                  ? "استخدم البحث والفلاتر لإدارة الحسابات بسرعة."
                  : "Use search and filters to manage accounts quickly."}
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!isMobile ? (
                <div className="flex items-center rounded-2xl border border-border/60 bg-background/60 p-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn("rounded-xl", viewMode === "table" && "bg-muted")}
                    onClick={() => setViewMode("table")}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={cn("rounded-xl", viewMode === "cards" && "bg-muted")}
                    onClick={() => setViewMode("cards")}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                </div>
              ) : null}

              {!isMobile ? (
                <Select value={density} onValueChange={(v: any) => setDensity(v)}>
                  <SelectTrigger className="rounded-2xl h-9 w-[150px] bg-transparent">
                    <SlidersHorizontal className="me-2 h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comfortable">{lang === "ar" ? "مريح" : "Comfortable"}</SelectItem>
                    <SelectItem value="compact">{lang === "ar" ? "مضغوط" : "Compact"}</SelectItem>
                  </SelectContent>
                </Select>
              ) : null}

              <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                <SelectTrigger className="rounded-2xl h-9 w-[120px] bg-transparent">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50, 100].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {lang === "ar" ? `${n} / صفحة` : `${n} / page`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Filter bar */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            <div className="lg:col-span-4 relative">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setPage(1)
                }}
                placeholder={lang === "ar" ? "بحث بالاسم أو البريد أو الهاتف..." : "Search name, email, phone..."}
                className="rounded-2xl h-11 ps-10"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute end-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground hover:text-foreground"
                  aria-label={lang === "ar" ? "مسح" : "Clear"}
                >
                  <XCircle className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="lg:col-span-2">
              <Select
                value={selectedRole}
                onValueChange={(v: any) => {
                  setSelectedRole(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="rounded-2xl h-11 bg-transparent">
                  <SelectValue placeholder={lang === "ar" ? "الدور" : "Role"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{lang === "ar" ? "كل الأدوار" : "All roles"}</SelectItem>
                  <SelectItem value="admin">{roleLabel("admin", lang)}</SelectItem>
                  <SelectItem value="manager">{roleLabel("manager", lang)}</SelectItem>
                  <SelectItem value="player">{roleLabel("player", lang)}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="lg:col-span-3">
              <Tabs
                value={statusFilter}
                onValueChange={(v) => {
                  setStatusFilter(v as any)
                  setPage(1)
                }}
              >
                <TabsList className="rounded-2xl w-full grid grid-cols-3">
                  <TabsTrigger value="all" className="rounded-xl">
                    {lang === "ar" ? "الكل" : "All"}
                  </TabsTrigger>
                  <TabsTrigger value="active" className="rounded-xl">
                    {lang === "ar" ? "نشط" : "Active"}
                  </TabsTrigger>
                  <TabsTrigger value="inactive" className="rounded-xl">
                    {lang === "ar" ? "غير نشط" : "Inactive"}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="lg:col-span-12 flex items-center">
              <label className="flex min-h-11 w-full items-center gap-3 rounded-2xl border border-border/60 bg-background/70 px-4 py-2 text-sm font-medium">
                <Checkbox
                  checked={showWalkInGuests}
                  onCheckedChange={(checked) => {
                    setShowWalkInGuests(Boolean(checked))
                    setPage(1)
                  }}
                />
                <span>{lang === "ar" ? "إظهار ضيوف الحجز اليدوي" : "Show walk-in guests"}</span>
              </label>
            </div>

            <div className="lg:col-span-2">
              <Select
                value={sortKey}
                onValueChange={(v: any) => {
                  setSortKey(v)
                  setPage(1)
                }}
              >
                <SelectTrigger className="rounded-2xl h-11 bg-transparent">
                  <ArrowUpDown className="me-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">{lang === "ar" ? "الأحدث" : "Newest"}</SelectItem>
                  <SelectItem value="oldest">{lang === "ar" ? "الأقدم" : "Oldest"}</SelectItem>
                  <SelectItem value="name_asc">{lang === "ar" ? "الاسم (أ-ي)" : "Name (A→Z)"}</SelectItem>
                  <SelectItem value="name_desc">{lang === "ar" ? "الاسم (ي-أ)" : "Name (Z→A)"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Bulk action bar */}
          <AnimatePresence>
            {selectedIds.length > 0 ? (
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: -8 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="rounded-3xl border border-primary/20 bg-primary/5 p-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="rounded-2xl">
                      {nf.format(selectedIds.length)} {lang === "ar" ? "محدد" : "selected"}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {lang === "ar"
                        ? "يمكنك تنفيذ عمليات جماعية على العناصر المحددة."
                        : "You can run bulk actions on selected users."}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => requestBulkUserStatusChange(true)}>
                      <UserCheck className="me-2 h-4 w-4" />
                      {lang === "ar" ? "تفعيل" : "Activate"}
                    </Button>

                    <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => requestBulkUserStatusChange(false)}>
                      <UserX className="me-2 h-4 w-4" />
                      {lang === "ar" ? "تعطيل" : "Deactivate"}
                    </Button>

                    <Button variant="destructive" className="rounded-2xl" onClick={() => setBulkDeleteOpen(true)}>
                      <Trash2 className="me-2 h-4 w-4" />
                      {lang === "ar" ? "حذف" : "Delete"}
                    </Button>

                    <Button variant="ghost" className="rounded-2xl" onClick={() => setSelectedIds([])}>
                      {lang === "ar" ? "إلغاء التحديد" : "Clear"}
                    </Button>
                  </div>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Content */}
          {loading ? (
            <LoadingSkeleton variant={effectiveViewMode === "table" ? "table" : "list"} count={6} />
          ) : error ? (
            <div className="rounded-3xl border border-destructive/30 bg-destructive/5 p-5">
              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                <div className="min-w-0">
                  <div className="font-black">{lang === "ar" ? "حدث خطأ" : "Something went wrong"}</div>
                  <div className="text-sm text-muted-foreground">{error}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <Button className="rounded-2xl" onClick={refresh}>
                      <RefreshCcw className="me-2 h-4 w-4" />
                      {lang === "ar" ? "إعادة المحاولة" : "Retry"}
                    </Button>
                    <Button variant="outline" className="rounded-2xl bg-transparent" onClick={clearFilters}>
                      {lang === "ar" ? "إعادة ضبط الفلاتر" : "Reset filters"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          ) : users.length === 0 ? (
            <EmptyState
              icon={Users}
              title={lang === "ar" ? "لا يوجد مستخدمون" : "No users"}
              description={lang === "ar" ? "جرّب تغيير الفلاتر أو مسح البحث." : "Try changing filters or clearing search."}
              action={{
                label: lang === "ar" ? "مسح الفلاتر" : "Clear filters",
                onClick: clearFilters,
              }}
            />
          ) : (
            <>
              {effectiveViewMode === "table" ? (
                <div className="rounded-3xl border border-border/60 overflow-x-auto">
                  <Table className="min-w-[900px]">
                    <TableHeader>
                      <tr className="border-b">
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                            onCheckedChange={toggleSelectAllOnPage}
                            aria-label={lang === "ar" ? "تحديد الكل" : "Select all"}
                          />
                        </TableHead>
                        <TableHead>{lang === "ar" ? "المستخدم" : "User"}</TableHead>
                        <TableHead>{lang === "ar" ? "الدور" : "Role"}</TableHead>
                        <TableHead>{lang === "ar" ? "الحالة" : "Status"}</TableHead>
                        <TableHead className="text-right">{lang === "ar" ? "تاريخ الإنشاء" : "Created"}</TableHead>
                        <TableHead className="w-12 text-right">{lang === "ar" ? "إجراءات" : "Actions"}</TableHead>
                      </tr>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => {
                        const created = new Date(u.createdAt)
                        const rowSelected = selectedIds.includes(u.id)

                        return (
                          <motion.tr
                            key={u.id}
                            data-state={rowSelected ? "selected" : undefined}
                            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                            transition={{ duration: 0.18 }}
                            className={cn(
                              "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted/60",
                              compact && "text-[13px]",
                            )}
                          >
                            <TableCell className="w-10">
                              <Checkbox
                                checked={rowSelected}
                                onCheckedChange={() => toggleOne(u.id)}
                                aria-label={lang === "ar" ? "تحديد المستخدم" : "Select user"}
                              />
                            </TableCell>

                            <TableCell
                              className={cn("cursor-pointer", compact ? "py-2" : "py-3")}
                              onClick={(e) => {
                                if (isInteractiveTarget(e.target)) return
                                openDetails(u)
                              }}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <Avatar className={cn("rounded-2xl border border-border/60", compact ? "h-9 w-9" : "h-10 w-10")}>
                                  <AvatarImage src={u.avatar || "/placeholder-user.jpg"} />
                                  <AvatarFallback className="rounded-2xl bg-muted font-black">
                                    {initialsOf(u.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="font-extrabold truncate">
                                    <HighlightedText text={u.name} query={debouncedSearch} />
                                  </div>
                                  <div className="text-sm text-muted-foreground truncate" dir="ltr">
                                    <HighlightedText text={u.email} query={debouncedSearch} />
                                  </div>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell>
                              <RoleBadge role={u.role} lang={lang} />
                            </TableCell>

                            <TableCell>
                              <ActiveBadge isActive={!!u.isActive} lang={lang} />
                            </TableCell>

                            <TableCell className="text-right">
                              <div className="inline-flex items-center gap-2 text-muted-foreground">
                                <CalendarClock className="h-4 w-4" />
                                <span className={cn("font-bold", compact && "text-[12px]")}>{formatDateIntl(created, locale)}</span>
                              </div>
                            </TableCell>

                            <TableCell className="text-right">
                              <RowActions
                                user={u}
                                lang={lang}
                                onView={() => openDetails(u)}
                                onEdit={() => openEdit(u)}
                                onResetPassword={() => sendResetLink(u)}
                                onToggleActive={(nextActive) => requestSingleUserStatusChange(u, nextActive)}
                                onDelete={() => setDeleteTarget(u)}
                                canAct={canActOnUser(u)}
                              />
                            </TableCell>
                          </motion.tr>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <AnimatePresence>
                    {users.map((u) => {
                      const created = new Date(u.createdAt)
                      const selected = selectedIds.includes(u.id)
                      return (
                        <motion.div
                          key={u.id}
                          layout
                          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
                          transition={{ duration: 0.2 }}
                        >
                          <Card
                            className={cn(
                              "cursor-pointer rounded-3xl border-border/60 bg-card/50 transition-all hover:bg-card hover:shadow-md hover:-translate-y-[2px] ring-1 ring-transparent hover:ring-primary/20 focus-visible:ring-primary/30",
                              selected && "border-primary/30 ring-primary/20",
                            )}
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              if (isInteractiveTarget(e.target)) return
                              openDetails(u)
                            }}
                            onKeyDown={(e) => {
                              if (isInteractiveTarget(e.target)) return
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault()
                                openDetails(u)
                              }
                            }}
                            aria-label={lang === "ar" ? `عرض تفاصيل المستخدم ${u.name}` : `View details for ${u.name}`}
                          >
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-start gap-3">
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                  <Avatar className="h-10 w-10 rounded-2xl border border-border/60">
                                    <AvatarImage src={u.avatar || "/placeholder-user.jpg"} />
                                    <AvatarFallback className="rounded-2xl bg-muted font-black">{initialsOf(u.name)}</AvatarFallback>
                                  </Avatar>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-[15px] font-extrabold leading-6">
                                      <HighlightedText text={u.name} query={debouncedSearch} />
                                    </div>
                                    <div className="mt-1 break-all text-xs leading-5 text-muted-foreground" dir="ltr">
                                      <HighlightedText text={u.email} query={debouncedSearch} />
                                    </div>
                                    {u.phone ? (
                                      <div className="mt-1 text-xs text-muted-foreground/80" dir="ltr">
                                        {u.phone}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-2" data-user-card-action="true">
                                  <Checkbox
                                    checked={selected}
                                    onCheckedChange={() => toggleOne(u.id)}
                                    aria-label={lang === "ar" ? "تحديد المستخدم" : "Select user"}
                                  />
                                  <RowActions
                                    user={u}
                                    lang={lang}
                                    onView={() => openDetails(u)}
                                    onEdit={() => openEdit(u)}
                                    onResetPassword={() => sendResetLink(u)}
                                    onToggleActive={(nextActive) => requestSingleUserStatusChange(u, nextActive)}
                                    onDelete={() => setDeleteTarget(u)}
                                    canAct={canActOnUser(u)}
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <RoleBadge role={u.role} lang={lang} />
                                <ActiveBadge isActive={!!u.isActive} lang={lang} />
                              </div>

                              <Separator className="bg-border/60" />

                              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                                <span className="inline-flex min-w-0 items-center gap-2">
                                  <CalendarClock className="h-4 w-4" />
                                  <span className="truncate font-bold">{formatDateIntl(created, locale)}</span>
                                </span>

                                <Button
                                  variant="ghost"
                                  className="shrink-0 rounded-2xl"
                                  data-user-card-action="true"
                                  onClick={() => openDetails(u)}
                                >
                                  <Eye className="me-2 h-4 w-4" />
                                  {lang === "ar" ? "عرض" : "View"}
                                </Button>
                              </div>

                            </CardContent>
                          </Card>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              )}

              {/* Footer: pagination */}
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  {lang === "ar"
                    ? `الصفحة ${nf.format(page)} من ${nf.format(totalPages)} — ${nf.format(result?.total ?? 0)} مستخدم`
                    : `Page ${nf.format(page)} of ${nf.format(totalPages)} — ${nf.format(result?.total ?? 0)} users`}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="outline" className="rounded-2xl bg-transparent" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    {lang === "ar" ? "السابق" : "Prev"}
                  </Button>

                  {paginationItems.map((it, idx) =>
                    it === "ellipsis" ? (
                      <span key={`e-${idx}`} className="px-2 text-muted-foreground">
                        …
                      </span>
                    ) : (
                      <Button
                        key={it}
                        variant={it === page ? "default" : "outline"}
                        className={cn("rounded-2xl", it !== page && "bg-transparent")}
                        onClick={() => setPage(it)}
                      >
                        {nf.format(it)}
                      </Button>
                    ),
                  )}

                  <Button variant="outline" className="rounded-2xl bg-transparent" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                    {lang === "ar" ? "التالي" : "Next"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* DETAILS: Right Sheet */}
      <Sheet
        open={detailsOpen}
        onOpenChange={(v) => {
          setDetailsOpen(v)
          if (!v) setDetailsUser(null)
        }}
      >
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={cn(
            "p-0",
            isMobile ? "h-[88vh] w-full rounded-t-[28px] rounded-b-none" : "w-full sm:max-w-xl",
          )}
        >
          {detailsUser ? (
            <div className="h-full flex flex-col">
              <div className="p-5 border-b border-border/60 bg-linear-to-br from-primary/10 via-primary/3 to-transparent">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-primary" />
                    {lang === "ar" ? "ملف المستخدم" : "User profile"}
                  </SheetTitle>
                  <SheetDescription>{lang === "ar" ? "تفاصيل + إجراءات سريعة." : "Details + quick actions."}</SheetDescription>
                </SheetHeader>

                <div className="mt-4 flex items-start gap-4">
                  <Avatar className="h-14 w-14 rounded-3xl border border-primary/20">
                    <AvatarImage src={detailsUser.avatar || "/placeholder-user.jpg"} />
                    <AvatarFallback className="rounded-3xl bg-primary/10 text-primary font-black">{initialsOf(detailsUser.name)}</AvatarFallback>
                  </Avatar>

                  <div className="min-w-0 flex-1">
                    <div className="text-xl font-black truncate">{detailsUser.name}</div>
                    <div className="mt-1 text-sm text-muted-foreground space-y-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <Mail className="h-4 w-4 shrink-0" />
                        <span className="truncate" dir="ltr">
                          {detailsUser.email}
                        </span>
                      </div>

                      {detailsUser.phone ? (
                        <div className="flex items-center gap-2" dir="ltr">
                          <Phone className="h-4 w-4 shrink-0" />
                          <span className="truncate">{detailsUser.phone}</span>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <RoleBadge role={detailsUser.role} lang={lang} />
                      <ActiveBadge isActive={!!detailsUser.isActive} lang={lang} />
                    </div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="rounded-2xl bg-transparent h-11"
                    onClick={() =>
                      copyToClipboard(detailsUser.email, lang === "ar" ? "تم نسخ البريد" : "Email copied", lang === "ar" ? "فشل النسخ" : "Copy failed")
                    }
                  >
                    <Copy className="me-2 h-4 w-4" />
                    {lang === "ar" ? "نسخ البريد" : "Copy email"}
                  </Button>

                  <Button
                    variant="outline"
                    className="rounded-2xl bg-transparent h-11"
                    onClick={() =>
                      copyToClipboard(detailsUser.id, lang === "ar" ? "تم نسخ المعرّف" : "ID copied", lang === "ar" ? "فشل النسخ" : "Copy failed")
                    }
                  >
                    <Hash className="me-2 h-4 w-4" />
                    {lang === "ar" ? "نسخ المعرّف" : "Copy ID"}
                  </Button>
                </div>
              </div>

              <div className="p-5 overflow-auto space-y-5 flex-1 min-h-0">
                <div className="grid grid-cols-2 gap-3">
                  <Card className="rounded-3xl border-border/60 bg-card/50">
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">{lang === "ar" ? "أنشئ بتاريخ" : "Created"}</div>
                      <div className="mt-1 font-black inline-flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-muted-foreground" />
                        {formatDateIntl(new Date(detailsUser.createdAt), locale)}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="rounded-3xl border-border/60 bg-card/50">
                    <CardContent className="p-4">
                      <div className="text-xs text-muted-foreground">{lang === "ar" ? "الدور" : "Role"}</div>
                      <div className="mt-1">
                        <RoleBadge role={detailsUser.role} lang={lang} />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="rounded-3xl border border-border/60 bg-muted/15 p-4">
                  <div className="flex items-start gap-3">
                    <KeyRound className="h-5 w-5 text-primary mt-0.5" />
                    <div className="min-w-0">
                      <div className="font-extrabold">{lang === "ar" ? "الأمان" : "Security"}</div>
                      <div className="text-sm text-muted-foreground">
                        {lang === "ar" ? "أرسل رابط إعادة تعيين كلمة المرور للمستخدم." : "Send a password reset link to the user."}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button className="rounded-2xl" onClick={() => sendResetLink(detailsUser)}>
                          <KeyRound className="me-2 h-4 w-4" />
                          {lang === "ar" ? "رابط إعادة تعيين" : "Reset link"}
                        </Button>

                        <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => openEdit(detailsUser)}>
                          <Pencil className="me-2 h-4 w-4" />
                          {lang === "ar" ? "تعديل" : "Edit"}
                        </Button>

                        <Button
                          variant="outline"
                          className="rounded-2xl bg-transparent"
                          disabled={!canActOnUser(detailsUser)}
                          onClick={() => requestSingleUserStatusChange(detailsUser, !detailsUser.isActive)}
                        >
                          {detailsUser.isActive ? (
                            <>
                              <UserX className="me-2 h-4 w-4" />
                              {lang === "ar" ? "تعطيل" : "Deactivate"}
                            </>
                          ) : (
                            <>
                              <UserCheck className="me-2 h-4 w-4" />
                              {lang === "ar" ? "تفعيل" : "Activate"}
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

              </div>

              <SheetFooter className="p-5 border-t border-border/60 bg-background/60">
                <div className="w-full flex items-center justify-between gap-2">
                  <Button
                    variant="destructive"
                    className={cn("rounded-2xl", !canActOnUser(detailsUser) && "opacity-50 pointer-events-none")}
                    onClick={() => {
                      setDetailsOpen(false)
                      setDeleteTarget(detailsUser)
                    }}
                  >
                    <Trash2 className="me-2 h-4 w-4" />
                    {lang === "ar" ? "حذف" : "Delete"}
                  </Button>

                  <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => setDetailsOpen(false)}>
                    {lang === "ar" ? "إغلاق" : "Close"}
                  </Button>
                </div>
              </SheetFooter>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      {/* CREATE/EDIT */}
      <UserFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initial={formInitial}
        loading={formSaving}
        lang={lang}
        onSubmit={formMode === "create" ? createUser : updateUser}
      />

      <AlertDialog
        open={!!statusChangeTarget}
        onOpenChange={(open) => {
          if (!open && !isUpdatingUserStatus) {
            setStatusChangeTarget(null)
          }
        }}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {statusChangeTarget?.nextActive ? (
                <UserCheck className="h-5 w-5 text-primary" />
              ) : (
                <UserX className="h-5 w-5 text-warning" />
              )}
              {statusChangeDialogCopy?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>{statusChangeDialogCopy?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl" disabled={isUpdatingUserStatus}>
              {lang === "ar" ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <Button
              className="rounded-2xl"
              variant={statusChangeTarget?.nextActive ? "default" : "destructive"}
              disabled={isUpdatingUserStatus}
              onClick={applyPendingUserStatusChange}
            >
              {isUpdatingUserStatus ? <Loader2 className="me-2 h-4 w-4 animate-spin" /> : null}
              {statusChangeDialogCopy?.confirmLabel}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DELETE confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              {lang === "ar" ? "تأكيد الحذف" : "Confirm delete"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? lang === "ar"
                  ? `سيتم حذف المستخدم "${deleteTarget.name}". لا يمكن التراجع بسهولة.`
                  : `You are about to delete "${deleteTarget.name}". This action cannot be easily undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteUser(deleteTarget)}
            >
              {lang === "ar" ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* BULK DELETE confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              {lang === "ar" ? "حذف جماعي" : "Bulk delete"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lang === "ar"
                ? `سيتم حذف ${nf.format(selectedIds.length)} مستخدم(ين) محددين.`
                : `You are about to delete ${nf.format(selectedIds.length)} selected users.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">{lang === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={bulkDelete}
            >
              {lang === "ar" ? "حذف" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* RESET LINK dialog */}
      <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
        <DialogContent className="sm:max-w-xl rounded-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              {lang === "ar" ? "رابط إعادة تعيين كلمة المرور" : "Password reset link"}
            </DialogTitle>
            <DialogDescription>
              {resetTarget
                ? lang === "ar"
                  ? `إنشاء رابط لإعادة تعيين كلمة المرور للمستخدم: ${resetTarget.email}`
                  : `Generate a reset link for: ${resetTarget.email}`
                : null}
            </DialogDescription>
          </DialogHeader>

          {resetLoading ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin me-2" />
              {lang === "ar" ? "جارٍ الإنشاء..." : "Generating..."}
            </div>
          ) : resetLink ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border/60 bg-muted/20 p-3">
                <div className="text-xs text-muted-foreground">{lang === "ar" ? "الرابط" : "Link"}</div>
                <div className="mt-1 break-all font-mono text-xs" dir="ltr">
                  {resetLink.url}
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {lang === "ar" ? "ينتهي في: " : "Expires at: "}
                <span className="font-bold">{formatDateTimeIntl(new Date(resetLink.expiresAt), locale)}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  className="rounded-2xl"
                  onClick={() =>
                    copyToClipboard(resetLink.url, lang === "ar" ? "تم نسخ الرابط" : "Link copied", lang === "ar" ? "فشل النسخ" : "Copy failed")
                  }
                >
                  <Copy className="me-2 h-4 w-4" />
                  {lang === "ar" ? "نسخ" : "Copy"}
                </Button>

                <Button
                  variant="outline"
                  className="rounded-2xl bg-transparent"
                  onClick={() => window.open(resetLink.url, "_blank", "noopener,noreferrer")}
                >
                  <Eye className="me-2 h-4 w-4" />
                  {lang === "ar" ? "فتح" : "Open"}
                </Button>

                <Button variant="outline" className="rounded-2xl bg-transparent" onClick={() => setResetDialogOpen(false)}>
                  {lang === "ar" ? "إغلاق" : "Close"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-6 text-sm text-muted-foreground">{lang === "ar" ? "لا يوجد رابط" : "No link"}</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RowActions({
  user,
  lang,
  onView,
  onEdit,
  onResetPassword,
  onToggleActive,
  onDelete,
  canAct,
}: {
  user: AdminUser
  lang: "ar" | "en"
  onView: () => void
  onEdit: () => void
  onResetPassword: () => void
  onToggleActive: (nextActive: boolean) => void
  onDelete: () => void
  canAct: boolean
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="rounded-2xl h-9 w-9 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>{lang === "ar" ? "إجراءات" : "Actions"}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onView}>
          <Eye className="me-2 h-4 w-4" />
          {lang === "ar" ? "عرض" : "View"}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="me-2 h-4 w-4" />
          {lang === "ar" ? "تعديل" : "Edit"}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onResetPassword}>
          <KeyRound className="me-2 h-4 w-4" />
          {lang === "ar" ? "رابط إعادة تعيين" : "Reset link"}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => onToggleActive(!user.isActive)} disabled={!canAct}>
          {user.isActive ? (
            <>
              <UserX className="me-2 h-4 w-4" />
              {lang === "ar" ? "تعطيل" : "Deactivate"}
            </>
          ) : (
            <>
              <UserCheck className="me-2 h-4 w-4" />
              {lang === "ar" ? "تفعيل" : "Activate"}
            </>
          )}
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive" disabled={!canAct}>
          <Trash2 className="me-2 h-4 w-4" />
          {lang === "ar" ? "حذف" : "Delete"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
