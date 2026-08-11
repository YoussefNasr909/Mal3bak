"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  Clock3,
  Edit,
  Plus,
  RefreshCcw,
  Trash2,
  XCircle,
} from "lucide-react";

import {
  createCourtClosure,
  deleteAllCourtClosures,
  deleteCourtClosure,
  listCourtClosures,
  updateCourtClosure,
} from "@/lib/api";
import type { Court, CourtClosure } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { createEgyptDate, formatEgyptISODate, getEgyptNow, getEgyptTodayString } from "@/lib/date";
import { toast } from "sonner";

function getClosureSaveErrorMessage(error: any, language: string) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("existing booking") || message.includes("player bookings") || message.includes("booking interval")) {
    return language === "ar"
      ? "لا يمكن حفظ الإغلاق لأن هناك حجوزات لاعبين موجودة داخل هذه الفترة. الرجاء تعديل أو إلغاء هذه الحجوزات أولاً."
      : "This closure cannot be saved because there are player bookings in this time interval. Please cancel those bookings first.";
  }

  if (message.includes("another closure")) {
    return language === "ar"
      ? "لا يمكن حفظ الإغلاق لأن هناك إغلاقاً آخر متداخلاً على نفس الملعب."
      : "This closure overlaps another closure on the same court.";
  }

  return error?.message || (language === "ar" ? "تعذر حفظ الإغلاق" : "Could not save closure");
}

type ClosureCreateMode = "single" | "daily";

type ClosureFormState = {
  mode: ClosureCreateMode;
  fullDay: boolean;
  singleFullDayDate: string;
  startDate: string;
  endDate: string;
  rangeStartDate: string;
  rangeEndDate: string;
  dailyStartTime: string;
  dailyEndTime: string;
  reason: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function getCairoDateParts(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const getPart = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  let hour = getPart("hour");
  if (Number.parseInt(hour, 10) >= 24) hour = "00";

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
    hour,
    minute: getPart("minute"),
  };
}

function toCairoInputValue(value: string | Date) {
  const parts = getCairoDateParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function parseCairoInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return createEgyptDate(Number(year), Number(month), Number(day), Number(hour), Number(minute));
}

function toIsoFromCairoInput(value: string) {
  const date = parseCairoInputValue(value);
  if (!date) return "";
  return date.toISOString();
}

function formatDateOnly(value: string | Date) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return formatEgyptISODate(date);
}

function addDays(dateOnly: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateOnly || ""));
  if (!match) return dateOnly;
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function extractCairoTime(value: string | Date) {
  const parts = getCairoDateParts(value);
  if (!parts) return "09:00";
  return `${parts.hour}:${parts.minute}`;
}

function formatRange(start: string | Date, end: string | Date, language: string) {
  const locale = language === "ar" ? "ar-EG" : "en-GB";
  const formatter = new Intl.DateTimeFormat(locale, {
    timeZone: "Africa/Cairo",
    dateStyle: "medium",
    timeStyle: "short",
  });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

function isFullDayClosure(closure: CourtClosure) {
  const startMs = new Date(closure.startDate).getTime();
  const endMs = new Date(closure.endDate).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  return extractCairoTime(closure.startDate) === "00:00" && extractCairoTime(closure.endDate) === "00:00" && endMs - startMs === 24 * 60 * 60 * 1000;
}

function isTournamentManagedClosure(closure: CourtClosure) {
  return closure.isTournamentReservation === true;
}

function getTournamentReservationLabel(closure: CourtClosure, language: string) {
  const round = closure.tournamentRoundNumber ?? "-";
  const match = closure.tournamentMatchNumber ?? "-";
  if (language === "ar") {
    const title = closure.tournamentTitle ? ` - ${closure.tournamentTitle}` : "";
    return `حجز بطولة · الجولة ${round} · المباراة ${match}${title}`;
  }
  const title = closure.tournamentTitle ? ` · ${closure.tournamentTitle}` : "";
  return `Tournament reservation · Round ${round} · Match ${match}${title}`;
}

function getClosureState(closure: CourtClosure) {
  const now = Date.now();
  const start = new Date(closure.startDate).getTime();
  const end = new Date(closure.endDate).getTime();
  if (start <= now && now < end) return "active" as const;
  if (start > now) return "upcoming" as const;
  return "past" as const;
}

function localMidnightInputValue(dateOnly: string) {
  return `${dateOnly}T00:00`;
}

function makeDefaultLocalRange() {
  const { h, m } = getEgyptNow();
  const today = getEgyptTodayString();
  const now = parseCairoInputValue(`${today}T${pad(h)}:${pad(m)}`) || new Date();
  now.setSeconds(0, 0);
  const minuteRemainder = m % 60;
  if (minuteRemainder !== 0) {
    now.setTime(now.getTime() + (60 - minuteRemainder) * 60 * 1000);
  }
  const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  return {
    mode: "single" as ClosureCreateMode,
    fullDay: false,
    singleFullDayDate: today,
    startDate: toCairoInputValue(now),
    endDate: toCairoInputValue(end),
    rangeStartDate: today,
    rangeEndDate: addDays(today, 2),
    dailyStartTime: extractCairoTime(now),
    dailyEndTime: extractCairoTime(end),
    reason: "",
  };
}

export function CourtClosuresManager({
  court,
  language,
  showAllByDefault = false,
}: {
  court: Court | null;
  language: string;
  showAllByDefault?: boolean;
}) {
  const [closures, setClosures] = useState<CourtClosure[]>([]);
  const [loading, setLoading] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CourtClosure | null>(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ClosureFormState>(() => makeDefaultLocalRange());

  const loadClosures = useCallback(async (showErrorToast = false) => {
    if (!court?.id) {
      setClosures([]);
      return;
    }

    try {
      setLoading(true);
      const res = await listCourtClosures(court.id);
      setClosures((res.items || []).slice().sort((a, b) => {
        const stateRank = { active: 0, upcoming: 1, past: 2 } as const;
        const aState = getClosureState(a);
        const bState = getClosureState(b);
        const stateDiff = stateRank[aState] - stateRank[bState];
        if (stateDiff !== 0) return stateDiff;
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      }));
    } catch (error: any) {
      console.error(error);
      if (showErrorToast) {
        toast.error(error?.message || (language === "ar" ? "تعذر تحميل الإغلاقات" : "Could not load closures"));
      }
    } finally {
      setLoading(false);
    }
  }, [court?.id, language]);

  useEffect(() => {
    void loadClosures(false);
  }, [loadClosures]);

  const manualClosures = useMemo(() => closures.filter((closure) => !isTournamentManagedClosure(closure)), [closures]);
  const protectedTournamentClosures = useMemo(() => closures.filter((closure) => isTournamentManagedClosure(closure)), [closures]);
  const previewClosures = useMemo(() => (showAllByDefault ? closures : closures.slice(0, 3)), [closures, showAllByDefault]);

  const resetForm = () => {
    setEditingId(null);
    setForm(makeDefaultLocalRange());
  };

  const startCreate = () => {
    resetForm();
    setManageOpen(true);
  };

  const startEdit = (closure: CourtClosure) => {
    setEditingId(closure.id);
    setForm({
      mode: "single",
      fullDay: isFullDayClosure(closure),
      singleFullDayDate: formatDateOnly(closure.startDate),
      startDate: toCairoInputValue(closure.startDate),
      endDate: toCairoInputValue(closure.endDate),
      rangeStartDate: formatDateOnly(closure.startDate),
      rangeEndDate: formatDateOnly(closure.endDate),
      dailyStartTime: extractCairoTime(closure.startDate),
      dailyEndTime: extractCairoTime(closure.endDate),
      reason: closure.reason || "",
    });
    setManageOpen(true);
  };

  const handleSubmit = async () => {
    if (!court?.id) return;

    try {
      setSaving(true);

      if (editingId || form.mode === "single") {
        let payload: any;

        if (form.fullDay) {
          if (!form.singleFullDayDate) {
            toast.error(language === "ar" ? "اختر تاريخ الإغلاق الكامل" : "Choose the full-day closure date");
            return;
          }

          payload = editingId
            ? {
                startDate: toIsoFromCairoInput(localMidnightInputValue(form.singleFullDayDate)),
                endDate: toIsoFromCairoInput(localMidnightInputValue(addDays(form.singleFullDayDate, 1))),
                reason: form.reason.trim() || null,
              }
            : {
                mode: "single" as const,
                fullDay: true,
                date: form.singleFullDayDate,
                reason: form.reason.trim() || null,
              };
        } else {
          if (!form.startDate || !form.endDate) {
            toast.error(language === "ar" ? "أدخل وقت البداية والنهاية" : "Enter both start and end time");
            return;
          }

          const start = parseCairoInputValue(form.startDate);
          const end = parseCairoInputValue(form.endDate);
          if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
            toast.error(language === "ar" ? "نطاق الوقت غير صحيح" : "Invalid time range");
            return;
          }

          payload = {
            mode: "single" as const,
            startDate: toIsoFromCairoInput(form.startDate),
            endDate: toIsoFromCairoInput(form.endDate),
            reason: form.reason.trim() || null,
          };
        }

        if (editingId) {
          await updateCourtClosure(editingId, payload);
          toast.success(language === "ar" ? "تم تحديث الإغلاق" : "Closure updated");
        } else {
          await createCourtClosure(court.id, payload);
          toast.success(language === "ar" ? "تم إنشاء الإغلاق" : "Closure created");
        }
      } else {
        if (!form.rangeStartDate || !form.rangeEndDate) {
          toast.error(language === "ar" ? "أدخل نطاق التاريخ" : "Enter the date range");
          return;
        }

        if (!form.fullDay && (!form.dailyStartTime || !form.dailyEndTime)) {
          toast.error(language === "ar" ? "أدخل الوقت اليومي أو فعّل إغلاق اليوم الكامل" : "Enter the daily time window or enable full-day closure");
          return;
        }

        if (!form.fullDay && form.dailyStartTime === form.dailyEndTime) {
          toast.error(language === "ar" ? "فعّل إغلاق اليوم الكامل لإنشاء إغلاق 24 ساعة" : "Enable full-day closure to create a 24-hour daily closure");
          return;
        }

        const rangeStart = new Date(`${form.rangeStartDate}T00:00:00`);
        const rangeEnd = new Date(`${form.rangeEndDate}T00:00:00`);
        if (Number.isNaN(rangeStart.getTime()) || Number.isNaN(rangeEnd.getTime()) || rangeEnd.getTime() < rangeStart.getTime()) {
          toast.error(language === "ar" ? "نطاق التاريخ غير صحيح" : "Invalid date range");
          return;
        }

        const response: any = await createCourtClosure(court.id, {
          mode: "daily",
          fullDay: form.fullDay,
          rangeStartDate: form.rangeStartDate,
          rangeEndDate: form.rangeEndDate,
          ...(form.fullDay ? {} : { dailyStartTime: form.dailyStartTime, dailyEndTime: form.dailyEndTime }),
          reason: form.reason.trim() || null,
        });

        const createdCount = Number(response?.count || response?.closures?.length || 0);
        toast.success(
          createdCount > 1
            ? language === "ar"
              ? `تم إنشاء ${createdCount} إغلاقات يومية`
              : `${createdCount} daily closures created`
            : language === "ar"
              ? "تم إنشاء الإغلاق اليومي"
              : "Daily closure created",
        );
      }

      await loadClosures(false);
      resetForm();
      setManageOpen(false);
    } catch (error: any) {
      console.error(error);
      toast.error(getClosureSaveErrorMessage(error, language));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      setDeletingId(deleteTarget.id);
      await deleteCourtClosure(deleteTarget.id);
      toast.success(language === "ar" ? "تم حذف الإغلاق" : "Closure deleted");
      setDeleteTarget(null);
      await loadClosures(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (language === "ar" ? "تعذر حذف الإغلاق" : "Could not delete closure"));
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAll = async () => {
    if (!court?.id) return;

    try {
      setDeletingAll(true);
      const result = await deleteAllCourtClosures(court.id);
      const deletedCount = Number(result?.deletedCount || 0);
      const protectedCount = Number(result?.protectedTournamentCount || 0);
      toast.success(
        deletedCount > 0
          ? protectedCount > 0
            ? language === "ar"
              ? `تم حذف ${deletedCount} من الإغلاقات اليدوية مع الإبقاء على ${protectedCount} من حجوزات البطولة محمية`
              : `${deletedCount} manual closures deleted. ${protectedCount} tournament reservations stayed protected.`
            : language === "ar"
              ? `تم حذف ${deletedCount} من الإغلاقات`
              : `${deletedCount} closures deleted`
          : protectedCount > 0
            ? language === "ar"
              ? `لا توجد إغلاقات يدوية للحذف. تم الإبقاء على ${protectedCount} من حجوزات البطولة محمية`
              : `No manual closures to delete. ${protectedCount} tournament reservations stayed protected.`
            : language === "ar"
              ? "لا توجد إغلاقات لحذفها"
              : "There are no closures to delete",
      );
      setDeleteAllOpen(false);
      setDeleteTarget(null);
      await loadClosures(false);
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || (language === "ar" ? "تعذر حذف جميع الإغلاقات" : "Could not delete all closures"));
    } finally {
      setDeletingAll(false);
    }
  };

  const stateBadge = (closure: CourtClosure) => {
    const state = getClosureState(closure);
    if (state === "active") {
      return <Badge className="rounded-2xl border border-amber-500/20 bg-amber-500/15 text-amber-700">{language === "ar" ? "نشط الآن" : "Active now"}</Badge>;
    }
    if (state === "upcoming") {
      return <Badge variant="outline" className="rounded-2xl">{language === "ar" ? "قادم" : "Upcoming"}</Badge>;
    }
    return <Badge variant="secondary" className="rounded-2xl">{language === "ar" ? "منتهي" : "Past"}</Badge>;
  };

  return (
    <>
      <Card className="overflow-hidden rounded-3xl border-border/50">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">{language === "ar" ? "إغلاقات الملعب" : "Court closures"}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {language === "ar"
                  ? "يمكنك إغلاق الملعب لفترة واحدة أو تكرار نفس الوقت يومياً عبر عدة أيام. بقية اليوم تبقى متاحة للحجز."
                  : "Block a single time range or repeat the same daily time across multiple days. The rest of each day stays bookable."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="rounded-2xl" onClick={() => void loadClosures(true)} disabled={loading}>
                <RefreshCcw className={cn("me-2 h-4 w-4", loading && "animate-spin")} />
                {language === "ar" ? "تحديث" : "Refresh"}
              </Button>
              {manualClosures.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-2xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setDeleteAllOpen(true)}
                >
                  <XCircle className="me-2 h-4 w-4" />
                  {language === "ar" ? "حذف كل الإغلاقات اليدوية" : "Delete all manual closures"}
                </Button>
              )}
              <Button size="sm" className="rounded-2xl" onClick={startCreate}>
                <Plus className="me-2 h-4 w-4" />
                {language === "ar" ? "إضافة إغلاق" : "Add closure"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="rounded-2xl border-border/60 bg-muted/20">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              {language === "ar"
                ? "الإغلاق يمنع الحجز في هذا الوقت فقط. الحفظ سيفشل إذا تداخل مع حجز موجود أو مع إغلاق آخر على نفس الملعب. حجوزات البطولة تظهر هنا للعلم فقط ولا يمكن تعديلها أو حذفها من هذه الشاشة."
                : "A closure blocks only that time window. Saving is prevented if it overlaps an existing booking or another closure on the same court. Tournament reservations are shown here for visibility only and cannot be edited or deleted from this screen."}
            </AlertDescription>
          </Alert>

          {protectedTournamentClosures.length > 0 && (
            <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              {language === "ar"
                ? `يوجد ${protectedTournamentClosures.length} من حجوزات البطولة المحمية على هذا الملعب. لا يمكن تعديلها أو حذفها من شاشة الإغلاقات.`
                : `${protectedTournamentClosures.length} protected tournament reservations exist on this court. They cannot be edited or deleted from the closures screen.`}
            </div>
          )}

          {loading ? (

            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
              {language === "ar" ? "جارٍ تحميل الإغلاقات..." : "Loading closures..."}
            </div>
          ) : closures.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
              {language === "ar"
                ? "لا توجد إغلاقات لهذا الملعب حالياً."
                : "There are no closures for this court right now."}
            </div>
          ) : (
            <div className="space-y-3">
              {previewClosures.map((closure) => (
                <div key={closure.id} className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {stateBadge(closure)}
                        <Badge variant="outline" className="rounded-2xl">
                          <CalendarDays className="me-1 h-3.5 w-3.5" />
                          {language === "ar" ? "إغلاق" : "Closure"}
                        </Badge>
                        {isTournamentManagedClosure(closure) && (
                          <Badge className="rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                            {language === "ar" ? "حجز بطولة" : "Tournament reservation"}
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm font-medium leading-6">
                        {formatRange(closure.startDate, closure.endDate, language)}
                      </div>
                      <div className="break-words text-sm text-muted-foreground">
                        {isTournamentManagedClosure(closure)
                          ? getTournamentReservationLabel(closure, language)
                          : closure.reason || (language === "ar" ? "بدون سبب مكتوب" : "No reason added")}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isTournamentManagedClosure(closure) ? (
                        <Badge className="rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                          {language === "ar" ? "يُدار من البطولة" : "Managed in tournament"}
                        </Badge>
                      ) : (
                        <>
                          <Button variant="outline" size="sm" className="rounded-2xl" onClick={() => startEdit(closure)}>
                            <Edit className="me-2 h-4 w-4" />
                            {language === "ar" ? "تعديل" : "Edit"}
                          </Button>
                          <Button variant="ghost" size="sm" className="rounded-2xl text-destructive hover:text-destructive" onClick={() => setDeleteTarget(closure)}>
                            <Trash2 className="me-2 h-4 w-4" />
                            {language === "ar" ? "حذف" : "Delete"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {!showAllByDefault && closures.length > previewClosures.length && (
                <Button variant="outline" className="w-full rounded-2xl" onClick={() => setManageOpen(true)}>
                  {language === "ar" ? "عرض كل الإغلاقات" : "View all closures"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={manageOpen}
        onOpenChange={(open) => {
          setManageOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-h-[92vh] w-[96vw] overflow-hidden rounded-3xl p-0 sm:max-w-5xl">
          <DialogHeader className="px-6 pb-3 pt-6">
            <DialogTitle>{language === "ar" ? "إدارة إغلاقات الملعب" : "Manage court closures"}</DialogTitle>
            <DialogDescription>
              {court
                ? language === "ar"
                  ? `الملعب: ${court.name}`
                  : `Court: ${court.nameEn || court.name}`
                : language === "ar"
                  ? "اختر ملعباً"
                  : "Choose a court"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[calc(92vh-72px)] gap-0 overflow-hidden lg:grid-cols-[380px,1fr]">
            <div className="overflow-y-auto border-b border-border/50 bg-muted/10 p-6 lg:border-b-0 lg:border-e">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold">
                    {editingId
                      ? language === "ar"
                        ? "تعديل إغلاق"
                        : "Edit closure"
                      : language === "ar"
                        ? "إغلاق جديد"
                        : "New closure"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {editingId
                      ? language === "ar"
                        ? "يمكنك تعديل فترة هذا الإغلاق فقط."
                        : "You can edit this saved closure only."
                      : language === "ar"
                        ? "اختر إغلاقاً لمرة واحدة أو كرره يومياً عبر فترة محددة."
                        : "Choose a one-time closure or repeat the same daily window across a date range."}
                  </p>
                </div>

                {!editingId && (
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={form.mode === "single" ? "default" : "outline"}
                      className="rounded-2xl"
                      onClick={() => setForm((prev) => ({ ...prev, mode: "single" }))}
                    >
                      <Clock3 className="me-2 h-4 w-4" />
                      {language === "ar" ? "مرة واحدة" : "One time"}
                    </Button>
                    <Button
                      type="button"
                      variant={form.mode === "daily" ? "default" : "outline"}
                      className="rounded-2xl"
                      onClick={() => setForm((prev) => ({ ...prev, mode: "daily" }))}
                    >
                      <RefreshCcw className="me-2 h-4 w-4" />
                      {language === "ar" ? "يومي عبر عدة أيام" : "Repeat daily"}
                    </Button>
                  </div>
                )}

                {!editingId && (
                  <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/60 bg-muted/20 p-3">
                    <div className="space-y-1">
                      <Label htmlFor="closure-full-day" className="text-sm font-medium">
                        {language === "ar" ? "إغلاق اليوم بالكامل (24 ساعة)" : "Full-day closure (24 hours)"}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {form.mode === "daily"
                          ? language === "ar"
                            ? "سيتم إغلاق كل يوم بالكامل داخل الفترة المختارة، مع إبقاء الأيام الأخرى متاحة."
                            : "Each selected date will be blocked for the full day, while other days stay open."
                          : language === "ar"
                            ? "استخدمه لإغلاق يوم كامل واحد بدلاً من إدخال نفس وقت البداية والنهاية."
                            : "Use it to block one full day instead of entering the same start and end time."}
                      </p>
                    </div>
                    <Checkbox
                      id="closure-full-day"
                      checked={form.fullDay}
                      onCheckedChange={(checked) => setForm((prev) => ({ ...prev, fullDay: Boolean(checked) }))}
                    />
                  </div>
                )}

                {(editingId || form.mode === "single") ? (
                  <>
                    {!editingId && form.fullDay ? (
                      <div className="space-y-2">
                        <Label htmlFor="closure-full-day-date">{language === "ar" ? "تاريخ الإغلاق الكامل" : "Full-day closure date"}</Label>
                        <Input
                          id="closure-full-day-date"
                          type="date"
                          value={form.singleFullDayDate}
                          onChange={(e) => setForm((prev) => ({ ...prev, singleFullDayDate: e.target.value, startDate: localMidnightInputValue(e.target.value), endDate: localMidnightInputValue(addDays(e.target.value, 1)) }))}
                        />
                        <p className="text-xs text-muted-foreground">
                          {language === "ar"
                            ? "سيتم إغلاق هذا اليوم بالكامل من 12:00 ص حتى 12:00 ص في اليوم التالي."
                            : "This blocks the whole selected day from 12:00 AM until 12:00 AM the following day."}
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="closure-start">{language === "ar" ? "البداية" : "Start"}</Label>
                          <Input
                            id="closure-start"
                            type="datetime-local"
                            value={form.startDate}
                            onChange={(e) => setForm((prev) => ({ ...prev, startDate: e.target.value }))}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="closure-end">{language === "ar" ? "النهاية" : "End"}</Label>
                          <Input
                            id="closure-end"
                            type="datetime-local"
                            value={form.endDate}
                            onChange={(e) => setForm((prev) => ({ ...prev, endDate: e.target.value }))}
                          />
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <Alert className="rounded-2xl border-border/60 bg-muted/20">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">
                        {language === "ar"
                          ? "سيتم إنشاء إغلاق منفصل لكل يوم في الفترة المحددة بنفس الوقت اليومي. بقية ساعات اليوم ستظل متاحة للحجز."
                          : "A separate closure will be created for each day in the selected range using the same daily time window. The remaining hours of each day stay open for booking."}
                      </AlertDescription>
                    </Alert>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="closure-range-start">{language === "ar" ? "من تاريخ" : "From date"}</Label>
                        <Input
                          id="closure-range-start"
                          type="date"
                          value={form.rangeStartDate}
                          onChange={(e) => setForm((prev) => ({ ...prev, rangeStartDate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="closure-range-end">{language === "ar" ? "إلى تاريخ" : "To date"}</Label>
                        <Input
                          id="closure-range-end"
                          type="date"
                          value={form.rangeEndDate}
                          onChange={(e) => setForm((prev) => ({ ...prev, rangeEndDate: e.target.value }))}
                        />
                      </div>
                    </div>

                    {form.fullDay ? (
                      <p className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
                        {language === "ar"
                          ? "سيتم إنشاء إغلاق لمدة 24 ساعة لكل يوم داخل الفترة المختارة، مع إبقاء الأيام الأخرى متاحة."
                          : "A 24-hour closure will be created for each day in the selected range, while other dates remain bookable."}
                      </p>
                    ) : (
                      <>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>{language === "ar" ? "وقت البداية اليومي" : "Daily start time"}</Label>
                            <TimePicker value={form.dailyStartTime} onChange={(value) => setForm((prev) => ({ ...prev, dailyStartTime: value }))} />
                          </div>
                          <div className="space-y-2">
                            <Label>{language === "ar" ? "وقت النهاية اليومي" : "Daily end time"}</Label>
                            <TimePicker value={form.dailyEndTime} onChange={(value) => setForm((prev) => ({ ...prev, dailyEndTime: value }))} />
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {language === "ar"
                            ? "إذا كان وقت النهاية أبكر من البداية، فسيستمر الإغلاق إلى ما بعد منتصف الليل في كل يوم."
                            : "If the end time is earlier than the start time, the closure continues past midnight each day."}
                        </p>
                      </>
                    )}
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="closure-reason">{language === "ar" ? "السبب" : "Reason"}</Label>
                  <Textarea
                    id="closure-reason"
                    rows={4}
                    value={form.reason}
                    onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
                    placeholder={language === "ar" ? "مثال: صيانة دورية أو حدث خاص" : "Example: routine maintenance or private event"}
                  />
                </div>

                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-start">
                  <Button className="rounded-2xl" onClick={() => void handleSubmit()} disabled={saving}>
                    <Clock3 className="me-2 h-4 w-4" />
                    {saving
                      ? language === "ar"
                        ? "جارٍ الحفظ..."
                        : "Saving..."
                      : editingId
                        ? language === "ar"
                          ? "حفظ التعديل"
                          : "Save changes"
                        : form.mode === "daily"
                          ? language === "ar"
                            ? "إنشاء الإغلاق اليومي"
                            : "Create daily closure"
                          : language === "ar"
                            ? "إنشاء الإغلاق"
                            : "Create closure"}
                  </Button>
                  <Button type="button" variant="outline" className="rounded-2xl" onClick={resetForm} disabled={saving}>
                    {language === "ar" ? "تفريغ" : "Reset"}
                  </Button>
                </DialogFooter>
              </div>
            </div>

            <div className="overflow-y-auto p-6">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">{language === "ar" ? "كل الإغلاقات" : "All closures"}</p>
                  <p className="text-xs text-muted-foreground">{language === "ar" ? "الفعّال والقادم والمنتهي" : "Active, upcoming and past closures"}</p>
                </div>
                <Badge variant="outline" className="rounded-2xl">{closures.length}</Badge>
              </div>

              {closures.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
                  {language === "ar" ? "لا توجد إغلاقات محفوظة بعد." : "No closures have been saved yet."}
                </div>
              ) : (
                <div className="space-y-3">
                  {closures.map((closure) => (
                    <div key={closure.id} className="rounded-2xl border border-border/50 bg-background/60 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            {stateBadge(closure)}
                            <Badge variant="outline" className="rounded-2xl">
                              <CalendarDays className="me-1 h-3.5 w-3.5" />
                              {language === "ar" ? "محجوز" : "Blocked"}
                            </Badge>
                            {isTournamentManagedClosure(closure) && (
                              <Badge className="rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                                {language === "ar" ? "حجز بطولة" : "Tournament reservation"}
                              </Badge>
                            )}
                          </div>
                          <p className="font-medium leading-6">{formatRange(closure.startDate, closure.endDate, language)}</p>
                          <p className="break-words text-sm text-muted-foreground">
                            {isTournamentManagedClosure(closure)
                              ? getTournamentReservationLabel(closure, language)
                              : closure.reason || (language === "ar" ? "بدون سبب مكتوب" : "No reason added")}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {isTournamentManagedClosure(closure) ? (
                            <Badge className="rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                              {language === "ar" ? "يُدار من البطولة" : "Managed in tournament"}
                            </Badge>
                          ) : (
                            <>
                              <Button variant="outline" size="sm" className="rounded-2xl" onClick={() => startEdit(closure)}>
                                <Edit className="me-2 h-4 w-4" />
                                {language === "ar" ? "تعديل" : "Edit"}
                              </Button>
                              <Button variant="ghost" size="sm" className="rounded-2xl text-destructive hover:text-destructive" onClick={() => setDeleteTarget(closure)}>
                                <Trash2 className="me-2 h-4 w-4" />
                                {language === "ar" ? "حذف" : "Delete"}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteAllOpen} onOpenChange={(open) => !deletingAll && setDeleteAllOpen(open)}>
        <AlertDialogContent className="rounded-[28px] border-border/60 p-0 overflow-hidden sm:max-w-lg">
          <div className="bg-gradient-to-br from-destructive/10 via-background to-background px-6 py-5">
            <AlertDialogHeader className="text-left">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                  <XCircle className="h-6 w-6" />
                </div>
                <div className="space-y-2">
                  <AlertDialogTitle className="text-xl">
                    {language === "ar" ? "حذف كل الإغلاقات؟" : "Delete all closures?"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="leading-6">
                    {language === "ar"
                      ? "سيتم حذف الإغلاقات اليدوية المسجلة لهذا الملعب فقط. حجوزات البطولة المحمية لن يتم حذفها."
                      : "This will delete only the saved manual closures for this court. Protected tournament reservations will not be removed."}
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm">
              <div className="font-medium">
                {language === "ar" ? "الملعب" : "Court"}: {court ? (language === "ar" ? court.name : court.nameEn || court.name) : "-"}
              </div>
              <div className="mt-2 text-muted-foreground">
                {language === "ar"
                  ? `عدد الإغلاقات اليدوية التي سيتم حذفها: ${manualClosures.length}${protectedTournamentClosures.length > 0 ? ` · حجوزات البطولة المحمية: ${protectedTournamentClosures.length}` : ""}`
                  : `Manual closures to delete: ${manualClosures.length}${protectedTournamentClosures.length > 0 ? ` · Protected tournament reservations: ${protectedTournamentClosures.length}` : ""}`}
              </div>
            </div>

            <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-muted-foreground">
              {language === "ar"
                ? "سيصبح وقت الملعب متاحاً للحجز مرة أخرى بعد حذف هذه الإغلاقات، لذلك تأكد أن هذا الإجراء مقصود."
                : "Deleting these closures will make those time windows bookable again, so make sure this action is intentional."}
            </div>
          </div>

          <AlertDialogFooter className="border-t border-border/50 bg-muted/10 px-6 py-4">
            <AlertDialogCancel className="rounded-2xl" disabled={deletingAll}>
              {language === "ar" ? "إلغاء" : "Cancel"}
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteAll();
              }}
              disabled={deletingAll}
            >
              {deletingAll
                ? language === "ar"
                  ? "جارٍ الحذف..."
                  : "Deleting..."
                : language === "ar"
                  ? "حذف كل الإغلاقات اليدوية"
                  : "Delete all manual closures"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !deletingId) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent className="rounded-[28px] border-border/60 p-0 overflow-hidden sm:max-w-lg">
          <div className="border-b border-border/50 bg-gradient-to-br from-destructive/10 via-background to-background px-6 py-5">
            <AlertDialogHeader className="text-left">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <AlertDialogTitle className="text-xl">
                    {language === "ar" ? "حذف الإغلاق" : "Delete closure"}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="leading-6">
                    {language === "ar"
                      ? "سيتم حذف هذا الإغلاق من الجدول الزمني للملعب. سيصبح الوقت متاحاً للحجز مرة أخرى إذا لم يكن هناك سبب آخر يمنعه."
                      : "This removes the closure from the court schedule. The time will become bookable again if nothing else is blocking it."}
                  </AlertDialogDescription>
                </div>
              </div>
            </AlertDialogHeader>
          </div>

          <div className="space-y-4 px-6 py-5">
            <div className="rounded-3xl border border-border/60 bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {language === "ar" ? "الفترة المحددة" : "Selected time range"}
              </p>
              <p className="mt-2 text-sm font-medium leading-6">
                {deleteTarget ? formatRange(deleteTarget.startDate, deleteTarget.endDate, language) : ""}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {deleteTarget?.reason || (language === "ar" ? "بدون سبب مكتوب" : "No reason added")}
              </p>
            </div>

            <Alert className="rounded-2xl border-destructive/20 bg-destructive/5">
              <AlertCircle className="h-4 w-4 text-destructive" />
              <AlertDescription className="text-sm leading-6">
                {language === "ar"
                  ? "إذا كان هذا الإغلاق يحمي وقتاً مهماً، تأكد من عدم وجود حجوزات جديدة ستُنشأ مباشرة بعد الحذف."
                  : "If this closure protects an important time window, make sure you will not immediately allow new bookings by mistake after deleting it."}
              </AlertDescription>
            </Alert>
          </div>

          <AlertDialogFooter className="border-t border-border/50 bg-muted/10 px-6 py-4">
            <AlertDialogCancel className="rounded-2xl" disabled={Boolean(deletingId)}>{language === "ar" ? "إلغاء" : "Cancel"}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={Boolean(deletingId)}
            >
              <Trash2 className="me-2 h-4 w-4" />
              {deletingId
                ? language === "ar"
                  ? "جارٍ الحذف..."
                  : "Deleting..."
                : language === "ar"
                  ? "نعم، احذف الإغلاق"
                  : "Yes, delete closure"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
