"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Eye,
  Loader2,
  Pencil,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { createEgyptDate } from "@/lib/date";
import type { Court, Tournament } from "@/lib/types";

// ── date helpers (inlined) ───────────────────────────────────────────────────

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
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  let hour = get("hour");
  if (Number.parseInt(hour, 10) >= 24) hour = "00";
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute") };
}

function toCairoInputValue(value: string | Date | null | undefined) {
  if (!value) return "";
  const parts = getCairoDateParts(value);
  if (!parts) return "";
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function toIsoFromCairoInput(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!m) return null;
  const [, year, month, day, hour, minute] = m;
  return createEgyptDate(
    Number(year),
    Number(month),
    Number(day),
    Number(hour),
    Number(minute),
  ).toISOString();
}

// ── form types ───────────────────────────────────────────────────────────────

export type EditTournamentFormData = {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  teamsPerGroup: number;
  maxTeams: number;
  entryFee: string;
  registrationOpenAt: string;
  registrationCloseAt: string;
  startDate: string;
  endDate: string;
  rules: string;
  courtIds: string[];
};

type TournamentSettingsStep = "basics" | "format" | "dates" | "courts" | "review";

const settingsSteps: Array<{ key: TournamentSettingsStep; en: string; ar: string }> = [
  { key: "basics", en: "Basics", ar: "الأساسيات" },
  { key: "format", en: "Format & draw", ar: "النظام والقرعة" },
  { key: "dates", en: "Dates", ar: "المواعيد" },
  { key: "courts", en: "Courts", ar: "الملاعب" },
  { key: "review", en: "Review", ar: "المراجعة" },
];

const formatPresets = [
  { key: "mini", maxTeams: 8, teamsPerGroup: 4, en: "Mini World Cup", ar: "كأس مصغر", noteEn: "2 groups of 4, top 2 qualify", noteAr: "مجموعتان من 4 فرق، يتأهل أفضل فريقين" },
  { key: "classic", maxTeams: 16, teamsPerGroup: 4, en: "Classic World Cup", ar: "نظام كأس العالم", noteEn: "4 groups of 4, 8-team knockout", noteAr: "4 مجموعات من 4 فرق، 8 فرق في الإقصائيات" },
  { key: "major", maxTeams: 24, teamsPerGroup: 4, en: "Major Event", ar: "بطولة كبرى", noteEn: "6 groups of 4, 12 qualifiers · 4 top seeds receive byes", noteAr: "6 مجموعات من 4 فرق، 12 متأهلًا · أفضل 4 تصنيفات يحصلون على إعفاء" },
  { key: "grand", maxTeams: 32, teamsPerGroup: 4, en: "Grand Cup", ar: "كأس كبرى", noteEn: "8 groups of 4, 16-team knockout", noteAr: "8 مجموعات من 4 فرق، 16 فريقًا في الإقصائيات" },
];

const defaultEditForm: EditTournamentFormData = {
  title: "",
  titleAr: "",
  description: "",
  descriptionAr: "",
  teamsPerGroup: 4,
  maxTeams: 8,
  entryFee: "",
  registrationOpenAt: "",
  registrationCloseAt: "",
  startDate: "",
  endDate: "",
  rules: "",
  courtIds: [],
};

function buildFormFromTournament(tournament: Tournament): EditTournamentFormData {
  return {
    title: tournament.title || "",
    titleAr: tournament.titleAr || "",
    description: tournament.description || "",
    descriptionAr: tournament.descriptionAr || "",
    teamsPerGroup: Number(tournament.teamsPerGroup) || 4,
    maxTeams: Number(tournament.maxTeams) || 8,
    entryFee: tournament.entryFee == null ? "" : String(tournament.entryFee),
    registrationOpenAt: toCairoInputValue(tournament.registrationOpenAt),
    registrationCloseAt: toCairoInputValue(tournament.registrationCloseAt),
    startDate: toCairoInputValue(tournament.startDate),
    endDate: toCairoInputValue(tournament.endDate),
    rules: tournament.rules || "",
    courtIds: (tournament.courts || []).map((c) => c.id).filter(Boolean),
  };
}

function getFormatPreview(form: EditTournamentFormData, ar: boolean) {
  const tpg = Number(form.teamsPerGroup) || 4;
  const max = Number(form.maxTeams) || 0;
  const groups = max > 0 && tpg > 0 ? Math.floor(max / tpg) : 0;
  const ko = groups * 2;
  const nextPow2 = ko > 0 ? 2 ** Math.ceil(Math.log2(ko)) : 0;
  const byes = Math.max(0, nextPow2 - ko);
  const byesText = byes > 0
    ? ar ? ` · ${byes} إعفاء لأفضل التصنيفات` : ` · ${byes} top-seed byes`
    : "";
  return {
    groups, ko, byes,
    label: ar
      ? `${max || 0} فريق · ${groups} مجموعة · ${tpg} فرق · ${ko} في الإقصائيات${byesText}`
      : `${max || 0} teams · ${groups} groups · ${tpg} per group · ${ko} in knockouts${byesText}`,
  };
}

function getDrawPreview(form: EditTournamentFormData, ar: boolean) {
  const tpg = Number(form.teamsPerGroup) || 4;
  const max = Number(form.maxTeams) || 0;
  const groupsCount = max > 0 && tpg > 0 ? Math.floor(max / tpg) : 0;
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return Array.from({ length: Math.max(0, groupsCount) }, (_, gi) => ({
    label: ar ? `المجموعة ${letters[gi] || gi + 1}` : `Group ${letters[gi] || gi + 1}`,
    teams: Array.from({ length: tpg }, (_, ti) =>
      ar ? `مقعد ${gi * tpg + ti + 1}` : `Seed ${gi * tpg + ti + 1}`,
    ),
  }));
}

function getRankingRules(ar: boolean) {
  return ar
    ? ["الانتصارات", "النقاط (3 لكل مجموعة فائزة)", "فارق الأشواط", "الأشواط المكتسبة", "التصنيف / ترتيب القرعة"]
    : ["Wins", "PTS (3 per set won)", "Game difference", "Games won", "Seed / draw order"];
}

function getScorePolicy(ar: boolean) {
  return ar
    ? "اختر الفائز، ثم أدخل نتيجة كل مجموعة كما تم تسجيلها. كل مجموعة يكون رقم الفريق فيها أعلى تضيف 3 نقاط لهذا الفريق، والتعادل في المجموعة يعطي 0 للطرفين. الترتيب يعتمد على الانتصارات ثم النقاط ثم فارق الأشواط ثم الأشواط المكتسبة."
    : "Choose the winner, then enter each set score as recorded. Every set where a team has the higher number gives that team 3 PTS; tied sets give 0 to both. Ranking uses wins, then PTS, then game difference, then games won.";
}

function validateStep(
  form: EditTournamentFormData,
  step: TournamentSettingsStep,
  ar: boolean,
  opts: { activeTeamsCount: number; maxTeamsLocked: boolean; currentMaxTeams: number },
): string | null {
  if (step === "basics") {
    if (!form.title.trim()) return ar ? "أدخل اسم البطولة" : "Enter a tournament title";
    const fee = form.entryFee === "" ? null : Number(form.entryFee);
    if (fee != null && (!Number.isFinite(fee) || fee < 0))
      return ar ? "رسوم الاشتراك يجب أن تكون رقمًا موجبًا أو صفرًا" : "Entry fee must be zero or a positive number";
    return null;
  }
  if (step === "format") {
    const tpg = Number(form.teamsPerGroup);
    const max = Number(form.maxTeams);
    if (!Number.isFinite(tpg) || tpg < 3 || tpg > 5)
      return ar ? "عدد الفرق في المجموعة يجب أن يكون بين 3 و 5" : "Teams per group must be between 3 and 5";
    if (!Number.isFinite(max) || max < 4 || max > 64)
      return ar ? "الحد الأقصى للفرق يجب أن يكون بين 4 و64" : "Max teams must be between 4 and 64";
    if (max % tpg !== 0)
      return ar ? `الحد الأقصى للفرق يجب أن يكون من مضاعفات ${tpg}` : `Max teams must be a multiple of ${tpg}`;
    if (max < opts.activeTeamsCount)
      return ar
        ? `لا يمكن تقليل الحد الأقصى عن عدد التسجيلات النشطة الحالي (${opts.activeTeamsCount}).`
        : `Max teams cannot be lower than the current active registrations (${opts.activeTeamsCount}).`;
    if (opts.maxTeamsLocked && max !== opts.currentMaxTeams)
      return ar
        ? "لا يمكن تغيير هيكل البطولة بعد جدولة أي مباراة أو تسجيل نتيجتها."
        : "Tournament structure cannot change after any match has been scheduled or scored.";
    return null;
  }
  if (step === "dates") {
    const roAt = form.registrationOpenAt ? toIsoFromCairoInput(form.registrationOpenAt) : null;
    const rcAt = form.registrationCloseAt ? toIsoFromCairoInput(form.registrationCloseAt) : null;
    const sd = form.startDate ? toIsoFromCairoInput(form.startDate) : null;
    const ed = form.endDate ? toIsoFromCairoInput(form.endDate) : null;
    if (form.registrationOpenAt && !roAt) return ar ? "وقت فتح التسجيل غير صحيح" : "Registration open time is invalid";
    if (form.registrationCloseAt && !rcAt) return ar ? "وقت إغلاق التسجيل غير صحيح" : "Registration close time is invalid";
    if (form.startDate && !sd) return ar ? "وقت بداية البطولة غير صحيح" : "Tournament start time is invalid";
    if (form.endDate && !ed) return ar ? "وقت نهاية البطولة غير صحيح" : "Tournament end time is invalid";
    const roMs = roAt ? new Date(roAt).getTime() : null;
    const rcMs = rcAt ? new Date(rcAt).getTime() : null;
    const sdMs = sd ? new Date(sd).getTime() : null;
    const edMs = ed ? new Date(ed).getTime() : null;
    if (roMs != null && rcMs != null && rcMs < roMs)
      return ar ? "يجب أن يكون إغلاق التسجيل بعد وقت الفتح" : "Registration close must be after registration open";
    if (sdMs != null && edMs != null && edMs < sdMs)
      return ar ? "يجب أن تكون نهاية البطولة بعد البداية" : "Tournament end must be after tournament start";
    if (roMs != null && sdMs != null && roMs > sdMs)
      return ar ? "لا يمكن أن يفتح التسجيل بعد بداية البطولة" : "Registration cannot open after the tournament starts";
    if (rcMs != null && sdMs != null && rcMs > sdMs)
      return ar ? "لا يمكن أن يُغلق التسجيل بعد بداية البطولة" : "Registration cannot close after the tournament starts";
    return null;
  }
  if (step === "courts" && !form.courtIds.length)
    return ar ? "اختر ملعبًا واحدًا على الأقل" : "Select at least one court";
  if (step === "review") {
    // full validation
    const basics = validateStep(form, "basics", ar, opts);
    if (basics) return basics;
    const format = validateStep(form, "format", ar, opts);
    if (format) return format;
    const dates = validateStep(form, "dates", ar, opts);
    if (dates) return dates;
    const courts = validateStep(form, "courts", ar, opts);
    if (courts) return courts;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────

interface EditTournamentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tournament: Tournament | null;
  availableCourts: Court[];
  courtsLoading: boolean;
  effectiveRole: "admin" | "manager" | "player";
  activeTeamsCount: number;
  /** true when hasScheduledOrCompletedMatches || terminalTournament */
  isLocked: boolean;
  isArabic: boolean;
  busyAction: string | null;
  onSubmit: (data: EditTournamentFormData) => Promise<void>;
}

export function EditTournamentDialog({
  open,
  onOpenChange,
  tournament,
  availableCourts,
  courtsLoading,
  effectiveRole,
  activeTeamsCount,
  isLocked,
  isArabic,
  busyAction,
  onSubmit,
}: EditTournamentDialogProps) {
  const [form, setForm] = useState<EditTournamentFormData>(defaultEditForm);
  const [step, setStep] = useState<TournamentSettingsStep>("basics");
  const [validationMsg, setValidationMsg] = useState("");

  // Reset form when dialog opens
  useEffect(() => {
    if (open && tournament) {
      setForm(buildFormFromTournament(tournament));
      setStep("basics");
      setValidationMsg("");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear validation when form or step changes
  useEffect(() => {
    setValidationMsg("");
  }, [form, step]);

  // ── computed ──────────────────────────────────────────────────────────────

  const stepIndex = settingsSteps.findIndex((s) => s.key === step);
  const canGoBack = stepIndex > 0;
  const canGoNext = stepIndex >= 0 && stepIndex < settingsSteps.length - 1;

  const formatPreview = useMemo(() => getFormatPreview(form, isArabic), [form, isArabic]);
  const drawPreview = useMemo(() => getDrawPreview(form, isArabic), [form, isArabic]);

  const selectedManagerId = useMemo(
    () =>
      form.courtIds
        .map((id) => availableCourts.find((c) => c.id === id)?.managerId)
        .find(Boolean) ||
      tournament?.managerId ||
      null,
    [availableCourts, form.courtIds, tournament?.managerId],
  );

  const selectedManagerName = useMemo(
    () =>
      availableCourts.find((c) => c.managerId && c.managerId === selectedManagerId)?.managerName ||
      tournament?.managerName ||
      null,
    [availableCourts, selectedManagerId, tournament?.managerName],
  );

  const sortedCourts = useMemo(
    () =>
      [...availableCourts].sort((a, b) =>
        effectiveRole === "admin"
          ? `${a.managerName || ""}-${a.nameEn || a.name}`.localeCompare(
            `${b.managerName || ""}-${b.nameEn || b.name}`,
          )
          : (a.nameEn || a.name).localeCompare(b.nameEn || b.name),
      ),
    [availableCourts, effectiveRole],
  );

  const selectedCourts = useMemo(
    () =>
      form.courtIds
        .map((id) => availableCourts.find((c) => c.id === id))
        .filter(Boolean) as Court[],
    [availableCourts, form.courtIds],
  );

  const validationOpts = {
    activeTeamsCount,
    maxTeamsLocked: isLocked,
    currentMaxTeams: tournament?.maxTeams ?? 0,
  };

  // ── navigation ────────────────────────────────────────────────────────────

  const goToStep = (targetIdx: number) => {
    if (targetIdx < 0 || targetIdx >= settingsSteps.length) return;
    if (targetIdx <= stepIndex) {
      setStep(settingsSteps[targetIdx].key);
      return;
    }
    for (let i = stepIndex; i < targetIdx; i += 1) {
      const err = validateStep(form, settingsSteps[i].key, isArabic, validationOpts);
      if (err) {
        toast.error(err);
        setValidationMsg(err);
        setStep(settingsSteps[i].key);
        return;
      }
    }
    setValidationMsg("");
    setStep(settingsSteps[targetIdx].key);
  };

  const goNext = () => { if (canGoNext) goToStep(stepIndex + 1); };
  const goBack = () => { if (canGoBack) setStep(settingsSteps[stepIndex - 1].key); };

  // ── form helpers ─────────────────────────────────────────────────────────

  const toggleCourt = (courtId: string) => {
    setForm((c) => ({
      ...c,
      courtIds: c.courtIds.includes(courtId)
        ? c.courtIds.filter((id) => id !== courtId)
        : [...c.courtIds, courtId],
    }));
  };

  const applyPreset = (preset: typeof formatPresets[number]) => {
    if (isLocked) return;
    setForm((c) => ({ ...c, maxTeams: preset.maxTeams, teamsPerGroup: preset.teamsPerGroup }));
  };

  const handleSubmit = async () => {
    const err = validateStep(form, "review", isArabic, validationOpts);
    if (err) {
      toast.error(err);
      setValidationMsg(err);
      return;
    }
    await onSubmit(form);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isArabic ? "تعديل البطولة" : "Edit tournament"}
          </DialogTitle>
          <DialogDescription>
            {isArabic
              ? "يمكن تعديل النصوص دائمًا، بينما تُقفل بعض الإعدادات الحساسة بعد إنشاء الشجرة أو جدولة المباريات."
              : "Text content can be edited anytime. Sensitive scheduling fields lock after the bracket or match scheduling begins."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Step nav */}
          <div className="grid gap-2 rounded-2xl border bg-muted/35 p-2 sm:grid-cols-5">
            {settingsSteps.map((s, idx) => {
              const active = s.key === step;
              const complete = idx < stepIndex;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => goToStep(idx)}
                  className={`rounded-xl px-3 py-2 text-start text-xs transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : complete
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                        : "text-muted-foreground hover:bg-background"
                  }`}
                >
                  <span className="flex items-center gap-2 font-semibold">
                    {complete ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full border text-[10px]">
                        {idx + 1}
                      </span>
                    )}
                    {isArabic ? s.ar : s.en}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Validation message */}
          {validationMsg ? (
            <div
              className="rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm font-medium text-destructive"
              role="alert"
            >
              {validationMsg}
            </div>
          ) : null}

          {/* ── Basics ── */}
          {step === "basics" ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="edit-title">
                  {isArabic ? "اسم البطولة" : "Tournament title"}
                </Label>
                <Input
                  id="edit-title"
                  value={form.title}
                  onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
                  placeholder={isArabic ? "بطولة الربيع" : "Spring Cup"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-title-ar">
                  {isArabic ? "الاسم بالعربية" : "Arabic title"}
                </Label>
                <Input
                  id="edit-title-ar"
                  value={form.titleAr}
                  onChange={(e) => setForm((c) => ({ ...c, titleAr: e.target.value }))}
                  placeholder={isArabic ? "اختياري" : "Optional"}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="edit-description">
                  {isArabic ? "الوصف" : "Description"}
                </Label>
                <Textarea
                  id="edit-description"
                  value={form.description}
                  onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
                  placeholder={isArabic ? "ملخص قصير وواضح للبطولة" : "A short, clear summary of the tournament"}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="edit-description-ar">
                  {isArabic ? "الوصف بالعربية" : "Arabic description"}
                </Label>
                <Textarea
                  id="edit-description-ar"
                  value={form.descriptionAr}
                  onChange={(e) => setForm((c) => ({ ...c, descriptionAr: e.target.value }))}
                  placeholder={isArabic ? "اختياري" : "Optional"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-entry-fee">
                  {isArabic ? "رسوم الاشتراك" : "Entry fee"}
                </Label>
                <Input
                  id="edit-entry-fee"
                  type="number"
                  min={0}
                  value={form.entryFee}
                  onChange={(e) => setForm((c) => ({ ...c, entryFee: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </div>
          ) : null}

          {/* ── Format ── */}
          {step === "format" ? (
            <div className="space-y-5">
              {isLocked ? (
                <div className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                  {isArabic
                    ? "تم قفل نظام البطولة بعد جدولة أو تسجيل مباراة. يمكنك مراجعة الإعدادات هنا بدون تغيير الهيكل."
                    : "The tournament format is locked after any match is scheduled or scored. You can review these settings without changing the structure."}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {formatPresets.map((preset) => {
                  const active =
                    preset.maxTeams === form.maxTeams &&
                    preset.teamsPerGroup === form.teamsPerGroup;
                  return (
                    <button
                      key={preset.key}
                      type="button"
                      disabled={isLocked}
                      onClick={() => applyPreset(preset)}
                      className={`rounded-2xl border p-4 text-start transition-all disabled:cursor-not-allowed disabled:opacity-55 ${
                        active
                          ? "border-primary bg-primary/10 text-foreground shadow-sm"
                          : "hover:border-primary/50 hover:bg-muted/40"
                      }`}
                    >
                      <Sparkles className="mb-3 h-4 w-4 text-primary" />
                      <p className="font-semibold">{isArabic ? preset.ar : preset.en}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {isArabic ? preset.noteAr : preset.noteEn}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-max-teams">
                    {isArabic ? "الحد الأقصى للفرق" : "Max teams"}
                  </Label>
                  <Input
                    id="edit-max-teams"
                    type="number"
                    min={4}
                    max={64}
                    disabled={isLocked}
                    value={form.maxTeams}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      const validSizes = [3, 4, 5].filter((s) => val % s === 0);
                      setForm((c) => ({
                        ...c,
                        maxTeams: val,
                        teamsPerGroup: validSizes.includes(c.teamsPerGroup)
                          ? c.teamsPerGroup
                          : (validSizes[0] ?? c.teamsPerGroup),
                      }));
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-tpg">
                    {isArabic ? "فرق المجموعة" : "Teams per group"}
                  </Label>
                  <select
                    id="edit-tpg"
                    aria-label={isArabic ? "عدد الفرق في كل مجموعة" : "Teams per group"}
                    title={isArabic ? "عدد الفرق في كل مجموعة" : "Teams per group"}
                    disabled={busyAction !== null || isLocked}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    value={form.teamsPerGroup}
                    onChange={(e) => setForm((c) => ({ ...c, teamsPerGroup: Number(e.target.value) }))}
                  >
                    {[3, 4, 5]
                      .filter((s) => form.maxTeams % s === 0)
                      .map((s) => (
                        <option key={s} value={s}>
                          {s}{" "}
                          {isArabic
                            ? `(سيكون ${form.maxTeams / s} مجموعات)`
                            : `(${form.maxTeams / s} groups)`}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="rounded-2xl border bg-muted/30 p-4">
                  <p className="text-xs text-muted-foreground">
                    {isArabic ? "معاينة النظام" : "Format preview"}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{formatPreview.label}</p>
                </div>
              </div>

              <div className="grid gap-3 rounded-2xl border p-4 md:grid-cols-2 xl:grid-cols-3">
                {drawPreview.map((group) => (
                  <div key={group.label} className="rounded-xl bg-muted/35 p-3">
                    <p className="text-sm font-semibold">{group.label}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {group.teams.map((seed) => (
                        <Badge key={seed} variant="outline" className="bg-background/80">
                          {seed}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border p-4">
                  <p className="font-semibold">
                    {isArabic ? "قواعد ترتيب المجموعة" : "Group ranking rules"}
                  </p>
                  <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted-foreground">
                    {getRankingRules(isArabic).map((rule) => (
                      <li key={rule}>{rule}</li>
                    ))}
                  </ol>
                </div>
                <div className="rounded-2xl border p-4">
                  <p className="font-semibold">
                    {isArabic ? "سياسة النتائج" : "Score policy"}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {getScorePolicy(isArabic)}
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {/* ── Dates ── */}
          {step === "dates" ? (
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="edit-reg-open">
                    {isArabic ? "فتح التسجيل" : "Registration opens"}
                  </Label>
                  <Input
                    id="edit-reg-open"
                    type="datetime-local"
                    disabled={isLocked}
                    value={form.registrationOpenAt}
                    onChange={(e) => setForm((c) => ({ ...c, registrationOpenAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reg-close">
                    {isArabic ? "إغلاق التسجيل" : "Registration closes"}
                  </Label>
                  <Input
                    id="edit-reg-close"
                    type="datetime-local"
                    disabled={isLocked}
                    value={form.registrationCloseAt}
                    onChange={(e) => setForm((c) => ({ ...c, registrationCloseAt: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-start-date">
                    {isArabic ? "بداية البطولة" : "Tournament starts"}
                  </Label>
                  <Input
                    id="edit-start-date"
                    type="datetime-local"
                    disabled={isLocked}
                    value={form.startDate}
                    onChange={(e) => setForm((c) => ({ ...c, startDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-end-date">
                    {isArabic ? "نهاية البطولة" : "Tournament ends"}
                  </Label>
                  <Input
                    id="edit-end-date"
                    type="datetime-local"
                    disabled={isLocked}
                    value={form.endDate}
                    onChange={(e) => setForm((c) => ({ ...c, endDate: e.target.value }))}
                  />
                </div>
              </div>

              {isLocked ? (
                <p className="rounded-xl border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                  {isArabic
                    ? "تم قفل مواعيد البطولة بعد جدولة مباريات أو إكمال البطولة."
                    : "Tournament timing fields are locked after match scheduling begins or once the tournament is finalized."}
                </p>
              ) : (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-muted-foreground">
                  {isArabic
                    ? "نصيحة: اجعل إغلاق التسجيل قبل بداية البطولة بوقت كافٍ لمراجعة الفرق وإنشاء القرعة."
                    : "Tip: close registration early enough to review teams and generate the draw before the event starts."}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="edit-rules">{isArabic ? "القواعد" : "Rules"}</Label>
                <Textarea
                  id="edit-rules"
                  value={form.rules}
                  onChange={(e) => setForm((c) => ({ ...c, rules: e.target.value }))}
                  placeholder={
                    isArabic ? "مثال: أفضل من ثلاث مجموعات" : "Example: best of three sets"
                  }
                />
              </div>
            </div>
          ) : null}

          {/* ── Courts ── */}
          {step === "courts" ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>{isArabic ? "ملاعب البطولة" : "Tournament courts"}</Label>
                <p className="text-xs text-muted-foreground">
                  {isArabic
                    ? "يجب اختيار ملعب واحد على الأقل. المباريات لا يمكن جدولتها إلا على الملاعب المحددة هنا."
                    : "Choose at least one court. Matches can only be scheduled on courts assigned here."}
                </p>
                {isLocked ? (
                  <p className="text-xs text-muted-foreground">
                    {isArabic
                      ? "تم قفل الملاعب بعد جدولة المباريات."
                      : "Courts are locked after tournament matches have been scheduled."}
                  </p>
                ) : null}
                {effectiveRole === "admin" && selectedManagerId ? (
                  <p className="text-xs text-muted-foreground">
                    {isArabic
                      ? `يمكنك اختيار ملاعب ${selectedManagerName || "هذا المدير"} فقط لأن جميع ملاعب البطولة يجب أن تتبع مديرًا واحدًا.`
                      : `You can only pick courts for ${selectedManagerName || "this manager"} because tournament courts must belong to one manager.`}
                  </p>
                ) : null}
              </div>

              <div className="grid gap-3 rounded-2xl border p-4 md:grid-cols-2">
                {courtsLoading ? (
                  <div className="md:col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isArabic ? "جارٍ تحميل الملاعب..." : "Loading courts..."}
                  </div>
                ) : sortedCourts.length > 0 ? (
                  sortedCourts.map((court) => {
                    const isSelected = form.courtIds.includes(court.id);
                    const lockedToOther =
                      effectiveRole === "admin" &&
                      !!selectedManagerId &&
                      court.managerId !== selectedManagerId &&
                      !isSelected;
                    return (
                      <label
                        key={court.id}
                        className={`flex items-start gap-3 rounded-xl border p-3 text-sm transition-colors ${
                          lockedToOther || isLocked
                            ? "cursor-not-allowed opacity-55"
                            : "cursor-pointer hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox
                          checked={isSelected}
                          disabled={isLocked || lockedToOther}
                          onCheckedChange={() => toggleCourt(court.id)}
                        />
                        <div className="space-y-1">
                          <p className="font-semibold text-foreground">
                            {isArabic ? court.name : court.nameEn || court.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {isArabic ? court.city : court.cityEn || court.city}
                          </p>
                          {effectiveRole === "admin" ? (
                            <p className="text-xs text-muted-foreground">
                              {isArabic ? "المدير:" : "Manager:"}{" "}
                              {court.managerName || (isArabic ? "غير محدد" : "Unknown")}
                            </p>
                          ) : null}
                        </div>
                      </label>
                    );
                  })
                ) : (
                  <p className="md:col-span-2 text-sm text-muted-foreground">
                    {isArabic ? "لا توجد ملاعب متاحة حاليًا." : "No active courts are available right now."}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {/* ── Review ── */}
          {step === "review" ? (
            <div className="space-y-4">
              <div className="rounded-2xl border bg-primary/5 p-5">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Eye className="h-4 w-4" />
                  {isArabic ? "مراجعة التعديلات قبل الحفظ" : "Review before saving"}
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl bg-background/70 p-3">
                    <p className="text-xs text-muted-foreground">{isArabic ? "الاسم" : "Title"}</p>
                    <p className="font-semibold">
                      {form.title || (isArabic ? "بدون اسم" : "Untitled")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-background/70 p-3">
                    <p className="text-xs text-muted-foreground">{isArabic ? "النظام" : "Format"}</p>
                    <p className="font-semibold">{formatPreview.label}</p>
                  </div>
                  <div className="rounded-xl bg-background/70 p-3">
                    <p className="text-xs text-muted-foreground">{isArabic ? "الملاعب" : "Courts"}</p>
                    <p className="font-semibold">
                      {selectedCourts.length
                        ? selectedCourts
                          .map((c) => (isArabic ? c.name : c.nameEn || c.name))
                          .join(" • ")
                        : isArabic ? "لم يتم اختيار ملاعب" : "No courts selected"}
                    </p>
                  </div>
                  <div className="rounded-xl bg-background/70 p-3">
                    <p className="text-xs text-muted-foreground">
                      {isArabic ? "سياسة التأهل" : "Qualification"}
                    </p>
                    <p className="font-semibold">
                      {isArabic ? "أفضل فريقين من كل مجموعة" : "Top two teams per group"}
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border p-4 text-sm text-muted-foreground">
                {isArabic
                  ? "سيتم حفظ النصوص المتاحة فورًا، بينما تبقى الحقول المقفلة بدون تغيير إذا بدأت الجدولة أو اكتملت البطولة."
                  : "Available text fields will be saved now, while locked scheduling fields remain unchanged once scheduling or tournament finalization has started."}
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {isArabic ? "إلغاء" : "Cancel"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={goBack}
              disabled={!canGoBack || busyAction !== null}
            >
              {isArabic ? "السابق" : "Back"}
            </Button>
          </div>
          {step === "review" ? (
            <Button onClick={handleSubmit} disabled={busyAction !== null}>
              {busyAction === "edit-tournament" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4" />
              )}
              {isArabic ? "حفظ التعديلات" : "Save changes"}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={goNext}
              disabled={!canGoNext || busyAction !== null}
            >
              {isArabic ? "التالي" : "Next"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
