"use client"

import { memo, useState, type ReactNode } from "react"
import {
  Search,
  Calendar,
  Filter,
  ArrowUpDown,
  List,
  Users,
  Building2,
  CheckCircle,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  SlidersHorizontal,
  RotateCcw,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"

interface BookingFiltersProps {
  language: string
  searchQuery: string
  onSearchChange: (value: string) => void
  viewMode: "list" | "calendar" | "table"
  onViewModeChange: (mode: "list" | "calendar" | "table") => void
  selectedCourt: string
  onCourtChange: (value: string) => void
  selectedDateRange: string
  onDateRangeChange: (value: string) => void
  sortBy: string
  onSortByChange: (value: string) => void
  selectedStatus: string
  onStatusChange: (value: string) => void
  selectedCustomerType: string
  onCustomerTypeChange: (value: string) => void
  onClearFilters: () => void
  managerCourts: any[]
  statusCounts: Record<string, number>
  customerCounts: { total: number; guest: number; registered: number }
  embedded?: boolean
  showViewMode?: boolean
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition-colors",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  )
}

function StatusPill({
  active,
  onClick,
  icon,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
  count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
        active
          ? "border-primary/40 bg-primary text-primary-foreground"
          : "border-border/50 bg-background/80 text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      <span>{label}</span>
      <span className={cn("tabular-nums", active ? "opacity-90" : "opacity-70")}>({count})</span>
    </button>
  )
}

export const BookingFilters = memo(function BookingFilters({
  language,
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  selectedCourt,
  onCourtChange,
  selectedDateRange,
  onDateRangeChange,
  sortBy,
  onSortByChange,
  selectedStatus,
  onStatusChange,
  selectedCustomerType,
  onCustomerTypeChange,
  onClearFilters,
  managerCourts,
  statusCounts,
  customerCounts,
  embedded = false,
  showViewMode = true,
}: BookingFiltersProps) {
  const isAr = language === "ar"
  const [moreOpen, setMoreOpen] = useState(false)

  const datePresets = [
    ["all", isAr ? "الكل" : "All"],
    ["today", isAr ? "اليوم" : "Today"],
    ["tomorrow", isAr ? "غدًا" : "Tomorrow"],
    ["this_week", isAr ? "الأسبوع" : "This week"],
    ["this_month", isAr ? "الشهر" : "This month"],
    ["past", isAr ? "سابقة" : "Past"],
  ] as const

  const getCount = (key: string) => Number(statusCounts[key] || 0)

  const advancedCount =
    (selectedCourt !== "all" ? 1 : 0) +
    (sortBy !== "date_desc" ? 1 : 0) +
    (showViewMode && viewMode !== "list" && viewMode !== "table" ? 1 : 0)

  const hasActiveFilters =
    advancedCount > 0 ||
    selectedStatus !== "all" ||
    selectedCustomerType !== "all" ||
    selectedDateRange !== "all" ||
    Boolean(searchQuery.trim())

  const inner = (
    <div className="space-y-4 p-4 md:p-5">
        <div className="relative">
          <Search className="absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={
              isAr ? "ابحث عن لاعب، ملعب، أو هاتف..." : "Search player, court, or phone..."
            }
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-11 rounded-2xl border-0 bg-muted/50 ps-10 shadow-none focus-visible:ring-1"
          />
        </div>

        <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {datePresets.map(([key, label]) => (
            <FilterPill
              key={key}
              active={selectedDateRange === key}
              onClick={() => onDateRangeChange(key)}
            >
              {label}
            </FilterPill>
          ))}
        </div>

        <div className="flex gap-1.5 rounded-2xl bg-muted/50 p-1.5">
          {(
            [
              ["all", isAr ? "الكل" : "All", customerCounts.total],
              ["guest", isAr ? "ضيوف" : "Walk-in", customerCounts.guest],
              ["registered", isAr ? "مسجل" : "Registered", customerCounts.registered],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => onCustomerTypeChange(key)}
              className={cn(
                "flex min-h-[4.25rem] flex-1 flex-col items-center justify-center rounded-xl px-1 py-2.5 transition-all",
                selectedCustomerType === key
                  ? "bg-background text-foreground shadow-sm ring-1 ring-primary/20"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="text-[11px] font-semibold sm:text-xs">{label}</span>
              <span
                className={cn(
                  "mt-1 text-xl font-black tabular-nums leading-none sm:text-2xl",
                  selectedCustomerType === key ? "text-primary" : "text-foreground/80",
                )}
              >
                {count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>

        <div className="scrollbar-hide -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          <StatusPill
            active={selectedStatus === "all"}
            onClick={() => onStatusChange("all")}
            icon={<Filter className="h-3.5 w-3.5" />}
            label={isAr ? "الكل" : "All"}
            count={customerCounts.total}
          />
          <StatusPill
            active={selectedStatus === "checked_in"}
            onClick={() => onStatusChange("checked_in")}
            icon={<CheckCircle className="h-3.5 w-3.5" />}
            label={isAr ? "حضور" : "Checked in"}
            count={getCount("checked_in")}
          />
          <StatusPill
            active={selectedStatus === "confirmed"}
            onClick={() => onStatusChange("confirmed")}
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label={isAr ? "مؤكد" : "Confirmed"}
            count={getCount("confirmed")}
          />
          <StatusPill
            active={selectedStatus === "cancelled"}
            onClick={() => onStatusChange("cancelled")}
            icon={<XCircle className="h-3.5 w-3.5" />}
            label={isAr ? "ملغي" : "Cancelled"}
            count={getCount("cancelled")}
          />
          <StatusPill
            active={selectedStatus === "no_show"}
            onClick={() => onStatusChange("no_show")}
            icon={<AlertCircle className="h-3.5 w-3.5" />}
            label={isAr ? "لم يحضر" : "No-show"}
            count={getCount("no_show")}
          />
        </div>

        <div
          className={cn(
            "hidden gap-2 md:grid",
            showViewMode ? "md:grid-cols-[1fr_1fr_auto]" : "md:grid-cols-2",
          )}
        >
          <Select value={selectedCourt} onValueChange={onCourtChange}>
            <SelectTrigger className="h-10 rounded-xl border-0 bg-muted/50 shadow-none">
              <Building2 className="me-2 h-4 w-4 shrink-0" />
              <SelectValue placeholder={isAr ? "الملعب" : "Court"} />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="all">{isAr ? "جميع الملاعب" : "All courts"}</SelectItem>
              {managerCourts.map((court) => (
                <SelectItem key={court.id} value={court.id}>
                  {isAr ? court.name : court.nameEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={onSortByChange}>
            <SelectTrigger className="h-10 rounded-xl border-0 bg-muted/50 shadow-none">
              <ArrowUpDown className="me-2 h-4 w-4 shrink-0" />
              <SelectValue placeholder={isAr ? "ترتيب" : "Sort"} />
            </SelectTrigger>
            <SelectContent className="rounded-2xl">
              <SelectItem value="date_desc">{isAr ? "الأحدث" : "Newest"}</SelectItem>
              <SelectItem value="date_asc">{isAr ? "الأقدم" : "Oldest"}</SelectItem>
              <SelectItem value="price_desc">{isAr ? "أعلى سعر" : "Highest price"}</SelectItem>
              <SelectItem value="price_asc">{isAr ? "أقل سعر" : "Lowest price"}</SelectItem>
              <SelectItem value="player_asc">{isAr ? "اللاعب" : "Player"}</SelectItem>
            </SelectContent>
          </Select>

          {showViewMode ? (
            <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
              {(
                [
                  ["table", List, isAr ? "جدول" : "Table"],
                  ["list", Users, isAr ? "بطاقات" : "Cards"],
                  ["calendar", Calendar, isAr ? "تقويم" : "Calendar"],
                ] as const
              ).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  title={label}
                  onClick={() => onViewModeChange(mode)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors",
                    viewMode === mode
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="hidden lg:inline">{label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <Collapsible open={moreOpen} onOpenChange={setMoreOpen} className="md:hidden">
          <div className="flex items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-10 flex-1 justify-between rounded-xl border-0 bg-muted/50 px-3 shadow-none"
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {isAr ? "خيارات إضافية" : "More options"}
                  {advancedCount > 0 && (
                    <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                      {advancedCount}
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")}
                />
              </Button>
            </CollapsibleTrigger>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 shrink-0 rounded-xl"
                onClick={onClearFilters}
                aria-label={isAr ? "إعادة ضبط" : "Reset"}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}
          </div>
          <CollapsibleContent className="mt-3 space-y-2">
            <Select value={selectedCourt} onValueChange={onCourtChange}>
              <SelectTrigger className="h-10 rounded-xl border-0 bg-muted/50 shadow-none">
                <SelectValue placeholder={isAr ? "الملعب" : "Court"} />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="all">{isAr ? "جميع الملاعب" : "All courts"}</SelectItem>
                {managerCourts.map((court) => (
                  <SelectItem key={court.id} value={court.id}>
                    {isAr ? court.name : court.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={onSortByChange}>
              <SelectTrigger className="h-10 rounded-xl border-0 bg-muted/50 shadow-none">
                <SelectValue placeholder={isAr ? "ترتيب" : "Sort"} />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="date_desc">{isAr ? "الأحدث" : "Newest"}</SelectItem>
                <SelectItem value="date_asc">{isAr ? "الأقدم" : "Oldest"}</SelectItem>
                <SelectItem value="price_desc">{isAr ? "أعلى سعر" : "Highest price"}</SelectItem>
                <SelectItem value="price_asc">{isAr ? "أقل سعر" : "Lowest price"}</SelectItem>
                <SelectItem value="player_asc">{isAr ? "اللاعب" : "Player"}</SelectItem>
              </SelectContent>
            </Select>
            {showViewMode ? (
              <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
                {(
                  [
                    ["table", List],
                    ["list", Users],
                    ["calendar", Calendar],
                  ] as const
                ).map(([mode, Icon]) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onViewModeChange(mode)}
                    className={cn(
                      "flex flex-1 items-center justify-center rounded-lg py-2.5 transition-colors",
                      viewMode === mode
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            ) : null}
          </CollapsibleContent>
        </Collapsible>

        {hasActiveFilters && (
          <div className="hidden md:flex md:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl text-muted-foreground"
              onClick={onClearFilters}
            >
              <RotateCcw className="me-2 h-4 w-4" />
              {isAr ? "إعادة ضبط" : "Reset"}
            </Button>
          </div>
        )}
    </div>
  )

  if (embedded) return inner

  return (
    <Card className="overflow-hidden rounded-3xl border-border/60 shadow-sm">
      <CardContent className="p-0">{inner}</CardContent>
    </Card>
  )
})
