"use client";

import { useState } from "react";
import { Download, FileUp, Info, Loader2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── CSV / import helpers (inlined) ───────────────────────────────────────────

type TeamImportDraft = {
  teamName: string;
  captainEmail: string;
  captainPhone: string;
  captainName: string;
  partnerName: string;
  partnerPhone: string;
  notes: string;
};

const defaultTeamImportDraft: TeamImportDraft = {
  teamName: "",
  captainEmail: "",
  captainPhone: "",
  captainName: "",
  partnerName: "",
  partnerPhone: "",
  notes: "",
};

const TEAM_IMPORT_TEMPLATE_ROWS: Array<Array<string>> = [
  ["Team Name", "Captain Email or Phone", "Captain Account Name", "Partner Name", "Partner Phone", "Notes"],
  ["Falcons", "ahmed@example.com", "", "Omar", "01111111111", "Optional note"],
  ["Wolves", "", "United Player 90", "Mona", "01222222222", ""],
];

function normalizeTeamImportDraft(row: TeamImportDraft): TeamImportDraft {
  return {
    teamName: row.teamName.trim(),
    captainEmail: row.captainEmail.trim(),
    captainPhone: row.captainPhone.trim(),
    captainName: row.captainName.trim(),
    partnerName: row.partnerName.trim(),
    partnerPhone: row.partnerPhone.trim(),
    notes: row.notes.trim(),
  };
}

function escapeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  if (typeof window === "undefined") return;
  const csv = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function detectTeamImportDelimiter(text: string) {
  const firstContentLine = text.split(/\r?\n/).find((line) => line.trim()) || "";
  const candidates = [",", ";", "\t"];
  return candidates.reduce((best, candidate) => {
    const count = firstContentLine.split(candidate).length - 1;
    const bestCount = firstContentLine.split(best).length - 1;
    return count > bestCount ? candidate : best;
  }, ",");
}

function parseDelimitedRows(text: string, delimiter = ",") {
  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') { cell += '"'; i += 1; }
      else inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && char === delimiter) { row.push(cell.trim()); cell = ""; continue; }
    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = []; cell = "";
      continue;
    }
    cell += char;
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeImportHeader(value: string) {
  return value.toLowerCase().replace(/[\s_\-./]+/g, "").trim();
}

function isLikelyEmail(value: string) {
  return /\S+@\S+\.\S+/.test(value.trim());
}

function isLikelyPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 6 && /^[+()\-\s\d]+$/.test(value.trim());
}

function getTeamImportHeaderIndexes(headerRow: string[]) {
  const aliases: Record<string, string[]> = {
    teamName: ["teamname", "team", "name", "اسمالفريق", "الفريق"],
    captain: ["captainemailorphone", "captain", "captaincontact", "captainphoneoremail", "playeremailorphone", "player", "قائدالفريق", "القائد"],
    captainEmail: ["captainemail", "email", "playeremail", "بريدالقائد", "البريد"],
    captainPhone: ["captainphone", "phone", "playerphone", "هاتفالقائد", "الهاتف"],
    captainName: ["captainname", "captainaccountname", "playername", "accountname", "اسم القائد", "اسمالقائد"],
    partnerName: ["partnername", "partner", "teammate", "اسمالشريك", "الشريك"],
    partnerPhone: ["partnerphone", "teammatephone", "هاتفالشريك"],
    notes: ["notes", "note", "comments", "latestnote", "ملاحظات", "ملاحظة"],
  };
  const normalized = headerRow.map(normalizeImportHeader);
  const findIndex = (field: keyof typeof aliases) =>
    normalized.findIndex((cell) => aliases[field].includes(cell));
  return {
    teamName: findIndex("teamName"),
    captain: findIndex("captain"),
    captainEmail: findIndex("captainEmail"),
    captainPhone: findIndex("captainPhone"),
    captainName: findIndex("captainName"),
    partnerName: findIndex("partnerName"),
    partnerPhone: findIndex("partnerPhone"),
    notes: findIndex("notes"),
  };
}

function hasTeamImportHeader(row: string[]) {
  const idx = getTeamImportHeaderIndexes(row);
  return idx.teamName >= 0 || idx.partnerName >= 0 || idx.captain >= 0 ||
    idx.captainEmail >= 0 || idx.captainPhone >= 0 || idx.captainName >= 0;
}

function cellAt(row: string[], index: number) {
  return index >= 0 ? row[index] || "" : "";
}

function parseCaptainImportValue(value: string) {
  const captain = value.trim();
  if (!captain) return { captainEmail: "", captainPhone: "", captainName: "" };
  if (isLikelyEmail(captain)) return { captainEmail: captain, captainPhone: "", captainName: "" };
  if (isLikelyPhone(captain)) return { captainEmail: "", captainPhone: captain, captainName: "" };
  return { captainEmail: "", captainPhone: "", captainName: captain };
}

function parseTeamImportRows(text: string): TeamImportDraft[] {
  const delimiter = detectTeamImportDelimiter(text);
  const rows = parseDelimitedRows(text, delimiter);
  if (!rows.length) return [];
  const headerIndexes = hasTeamImportHeader(rows[0]) ? getTeamImportHeaderIndexes(rows[0]) : null;
  const dataRows = headerIndexes ? rows.slice(1) : rows;
  return dataRows
    .map((row) => {
      const teamName = headerIndexes ? cellAt(row, headerIndexes.teamName) : row[0] || "";
      const captain = headerIndexes ? cellAt(row, headerIndexes.captain) : row[1] || "";
      const parsedCaptain = parseCaptainImportValue(captain);
      const explicitCaptainEmail = headerIndexes ? cellAt(row, headerIndexes.captainEmail) : "";
      const explicitCaptainPhone = headerIndexes ? cellAt(row, headerIndexes.captainPhone) : "";
      const explicitCaptainName = headerIndexes ? cellAt(row, headerIndexes.captainName) : "";
      const partnerName = headerIndexes ? cellAt(row, headerIndexes.partnerName) : row[2] || "";
      const partnerPhone = headerIndexes ? cellAt(row, headerIndexes.partnerPhone) : row[3] || "";
      const notes = headerIndexes ? cellAt(row, headerIndexes.notes) : row.slice(4).filter(Boolean).join(", ");
      return normalizeTeamImportDraft({
        teamName,
        captainEmail: explicitCaptainEmail || parsedCaptain.captainEmail,
        captainPhone: explicitCaptainPhone || parsedCaptain.captainPhone,
        captainName: explicitCaptainName || parsedCaptain.captainName,
        partnerName,
        partnerPhone,
        notes,
      });
    })
    .filter((t) => t.teamName || t.partnerName || t.captainEmail || t.captainPhone || t.captainName);
}

// ─────────────────────────────────────────────────────────────────────────────

export interface TeamImportSubmitData {
  teams: Array<{
    teamName: string;
    captainEmail: string | null;
    captainPhone: string | null;
    captainName: string | null;
    partnerName: string;
    partnerPhone: string | null;
    notes: string | null;
    status: "pending" | "approved";
  }>;
  mode: "active" | "waitlist";
}

export type TeamImportResult = {
  imported: number;
  waitlisted: number;
  failed: Array<{ rowNumber: number; teamName?: string | null; reason: string }>;
};

interface TeamImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canImportTeams: boolean;
  isArabic: boolean;
  busyAction: string | null;
  onSubmit: (data: TeamImportSubmitData) => Promise<TeamImportResult | null>;
}

export function TeamImportDialog({
  open,
  onOpenChange,
  canImportTeams,
  isArabic,
  busyAction,
  onSubmit,
}: TeamImportDialogProps) {
  const [draft, setDraft] = useState<TeamImportDraft>(defaultTeamImportDraft);
  const [rows, setRows] = useState<TeamImportDraft[]>([]);
  const [importStatus, setImportStatus] = useState<"pending" | "approved">("pending");
  const [importMode, setImportMode] = useState<"active" | "waitlist">("active");
  const [importResult, setImportResult] = useState<TeamImportResult | null>(null);

  const updateDraft = (field: keyof TeamImportDraft, value: string) => {
    setDraft((c) => ({ ...c, [field]: value }));
    setImportResult(null);
  };

  const getContactLabel = (row: TeamImportDraft) =>
    row.captainEmail || row.captainPhone || row.captainName || "—";

  const validateDraft = (row: TeamImportDraft) => {
    if (!row.teamName || !row.partnerName || (!row.captainEmail && !row.captainPhone && !row.captainName)) {
      return isArabic
        ? "أدخل اسم الفريق، قائد الفريق، واسم الشريك"
        : "Enter the team name, captain account, and partner name";
    }
    return "";
  };

  const addDraft = () => {
    const next = normalizeTeamImportDraft(draft);
    const err = validateDraft(next);
    if (err) { toast.error(err); return; }
    setRows((c) => [...c, next]);
    setDraft(defaultTeamImportDraft);
    setImportResult(null);
    toast.success(isArabic ? "تمت إضافة الفريق للقائمة" : "Team added to the import list");
  };

  const removeRow = (idx: number) => {
    setRows((c) => c.filter((_, i) => i !== idx));
    setImportResult(null);
  };

  const clearRows = () => {
    setRows([]);
    setImportResult(null);
  };

  const loadCsvFile = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseTeamImportRows(text);
      if (!parsed.length) {
        toast.error(isArabic ? "ملف CSV لا يحتوي على فرق قابلة للاستيراد" : "The CSV file does not contain importable teams");
        return;
      }
      setRows(parsed);
      setDraft(defaultTeamImportDraft);
      setImportResult(null);
      toast.success(
        isArabic
          ? `تم تحميل ${parsed.length} فريق من ملف CSV`
          : `${parsed.length} team${parsed.length === 1 ? "" : "s"} loaded from CSV`,
      );
    } catch {
      toast.error(isArabic ? "تعذر قراءة ملف CSV" : "Unable to read the CSV file");
    }
  };

  const useTemplate = () => {
    const templateText = TEAM_IMPORT_TEMPLATE_ROWS.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
    setRows(parseTeamImportRows(templateText));
    setDraft(defaultTeamImportDraft);
    setImportResult(null);
  };

  const downloadTemplate = () => {
    downloadCsv("tournament-team-import-template.csv", TEAM_IMPORT_TEMPLATE_ROWS);
  };

  const handleSubmit = async () => {
    if (!canImportTeams) {
      toast.error(
        isArabic
          ? "يمكن استيراد الفرق بعد فتح التسجيل، ويظل متاحًا بعد إغلاقه حتى إنشاء الشجرة أو بدء البطولة."
          : "Teams can be imported after registration opens, and after it closes until the bracket is generated or play starts.",
      );
      return;
    }

    const validRows = rows
      .map(normalizeTeamImportDraft)
      .filter((t) => t.teamName || t.partnerName || t.captainEmail || t.captainPhone || t.captainName);

    if (!validRows.length) {
      toast.error(isArabic ? "أضف فريقًا واحدًا على الأقل" : "Add at least one team");
      return;
    }

    const invalid = validRows.find((t) => validateDraft(t));
    if (invalid) { toast.error(validateDraft(invalid)); return; }

    const teams = validRows.map((t) => ({
      teamName: t.teamName,
      captainEmail: t.captainEmail || null,
      captainPhone: t.captainPhone || null,
      captainName: t.captainName || null,
      partnerName: t.partnerName,
      partnerPhone: t.partnerPhone || null,
      notes: t.notes || null,
      status: importStatus,
    }));

    const result = await onSubmit({ teams, mode: importMode });
    if (result) {
      setImportResult(result);
      if (!result.failed.length) {
        setRows([]);
        setDraft(defaultTeamImportDraft);
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setImportResult(null);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isArabic ? "إضافة فرق للبطولة" : "Add tournament teams"}
          </DialogTitle>
          <DialogDescription>
            {isArabic
              ? "أضف الفرق بنموذج بسيط أو ارفع ملف CSV. يجب أن يكون قائد الفريق حساب لاعب موجود بالبريد أو الهاتف أو الاسم المطابق."
              : "Add teams with a simple form or upload a CSV file. The captain must already have a player account by email, phone, or exact account name."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {/* CSV section */}
          <div className="rounded-2xl border bg-muted/30 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-semibold text-foreground">
                  {isArabic ? "استيراد سريع من CSV" : "Quick CSV import"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isArabic
                    ? "يمكن رفع ملف CSV من القالب أو ملف الفرق المصدر من هذه الصفحة."
                    : "Upload the template CSV or a teams export from this page."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={useTemplate}>
                  {isArabic ? "تجربة مثال" : "Use sample"}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4" />
                  {isArabic ? "تحميل قالب CSV" : "Download CSV template"}
                </Button>
                <Button asChild type="button" variant="default" size="sm">
                  <label className="cursor-pointer">
                    <FileUp className="h-4 w-4" />
                    {isArabic ? "رفع ملف CSV" : "Import CSV file"}
                    <input
                      className="sr-only"
                      type="file"
                      accept=".csv,text/csv,text/plain"
                      onChange={(e) => {
                        void loadCsvFile(e.target.files?.[0]);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>
                </Button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded-xl border bg-background/80">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="bg-muted/60 text-muted-foreground">
                  <tr>
                    {TEAM_IMPORT_TEMPLATE_ROWS[0].map((heading) => (
                      <th key={heading} className="px-3 py-2 text-start font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TEAM_IMPORT_TEMPLATE_ROWS.slice(1).map((row, rowIdx) => (
                    <tr key={rowIdx} className="border-t">
                      {row.map((cell, cellIdx) => (
                        <td key={`${rowIdx}-${cellIdx}`} className="px-3 py-2 text-muted-foreground">
                          {cell || "—"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Manual entry */}
          <div className="rounded-2xl border p-4">
            <div className="mb-4">
              <h3 className="font-semibold">
                {isArabic ? "إضافة فريق يدويًا" : "Add one team manually"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {isArabic
                  ? "املأ البيانات واضغط إضافة. لا تحتاج لكتابة صفوف CSV."
                  : "Fill the fields and press Add team. No CSV rows or special formatting needed."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ti-team-name">
                  {isArabic ? "اسم الفريق" : "Team name"}
                </Label>
                <Input
                  id="ti-team-name"
                  value={draft.teamName}
                  onChange={(e) => updateDraft("teamName", e.target.value)}
                  placeholder={isArabic ? "مثال: Falcons" : "Example: Falcons"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ti-captain">
                  {isArabic ? "قائد الفريق" : "Captain account"}
                </Label>
                <Input
                  id="ti-captain"
                  value={draft.captainEmail || draft.captainPhone || draft.captainName}
                  onChange={(e) => {
                    const parsed = parseCaptainImportValue(e.target.value);
                    setDraft((c) => ({ ...c, ...parsed }));
                    setImportResult(null);
                  }}
                  placeholder={isArabic ? "بريد، هاتف، أو اسم الحساب بالضبط" : "Email, phone, or exact account name"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ti-partner-name">
                  {isArabic ? "اسم الشريك" : "Partner name"}
                </Label>
                <Input
                  id="ti-partner-name"
                  value={draft.partnerName}
                  onChange={(e) => updateDraft("partnerName", e.target.value)}
                  placeholder={isArabic ? "مثال: Omar" : "Example: Omar"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ti-partner-phone">
                  {isArabic ? "هاتف الشريك" : "Partner phone"}
                </Label>
                <Input
                  id="ti-partner-phone"
                  value={draft.partnerPhone}
                  onChange={(e) => updateDraft("partnerPhone", e.target.value)}
                  placeholder="01234567890"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="ti-notes">
                  {isArabic ? "ملاحظات اختيارية" : "Optional notes"}
                </Label>
                <Input
                  id="ti-notes"
                  value={draft.notes}
                  onChange={(e) => updateDraft("notes", e.target.value)}
                  placeholder={isArabic ? "أي ملاحظة للمدير" : "Any manager note"}
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button type="button" onClick={addDraft}>
                <Users className="h-4 w-4" />
                {isArabic ? "إضافة الفريق" : "Add team"}
              </Button>
            </div>
          </div>

          {/* Rows list */}
          <div className="rounded-2xl border p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {isArabic ? "الفرق الجاهزة للاستيراد" : "Teams ready to import"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isArabic
                    ? `${rows.length} فريق في القائمة`
                    : `${rows.length} team${rows.length === 1 ? "" : "s"} in the list`}
                </p>
              </div>
              {rows.length > 0 ? (
                <Button type="button" variant="outline" size="sm" onClick={clearRows}>
                  <Trash2 className="h-4 w-4" />
                  {isArabic ? "مسح الكل" : "Clear all"}
                </Button>
              ) : null}
            </div>

            {rows.length > 0 ? (
              <div className="mt-4 grid gap-3">
                {rows.map((row, idx) => (
                  <div
                    key={`${row.teamName}-${idx}`}
                    className="rounded-xl border bg-muted/20 p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{row.teamName || "—"}</p>
                        <p className="text-sm text-muted-foreground">
                          {isArabic ? "القائد: " : "Captain: "}{getContactLabel(row)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {isArabic ? "الشريك: " : "Partner: "}{row.partnerName || "—"}
                          {row.partnerPhone ? ` · ${row.partnerPhone}` : ""}
                        </p>
                        {row.notes ? (
                          <p className="mt-1 text-xs text-muted-foreground">{row.notes}</p>
                        ) : null}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRow(idx)}
                      >
                        <Trash2 className="h-4 w-4" />
                        {isArabic ? "حذف" : "Remove"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                {isArabic
                  ? "لم تتم إضافة أي فرق بعد. أضف فريقًا يدويًا أو ارفع ملف CSV."
                  : "No teams added yet. Add a team manually or import a CSV file."}
              </div>
            )}
          </div>

          {/* Options */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{isArabic ? "حالة الفرق الجديدة" : "New team status"}</Label>
              <select
                aria-label={isArabic ? "حالة استيراد الفرق" : "Team import status"}
                title={isArabic ? "حالة استيراد الفرق" : "Team import status"}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={importStatus}
                onChange={(e) => setImportStatus(e.target.value as "pending" | "approved")}
              >
                <option value="pending">{isArabic ? "قيد المراجعة" : "Pending review"}</option>
                <option value="approved">{isArabic ? "معتمد مباشرة" : "Approved immediately"}</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>{isArabic ? "عند الامتلاء" : "When full"}</Label>
              <select
                aria-label={isArabic ? "طريقة إضافة الفرق عند الامتلاء" : "How to handle full tournaments"}
                title={isArabic ? "طريقة إضافة الفرق عند الامتلاء" : "How to handle full tournaments"}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as "active" | "waitlist")}
              >
                <option value="active">
                  {isArabic ? "أضف حتى الامتلاء ثم قائمة انتظار" : "Fill main list then waitlist"}
                </option>
                <option value="waitlist">
                  {isArabic ? "أضف إلى قائمة الانتظار" : "Import to waitlist"}
                </option>
              </select>
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>{isArabic ? "ملاحظات مهمة" : "Important notes"}</AlertTitle>
            <AlertDescription>
              {isArabic
                ? "الأفضل استخدام بريد أو هاتف قائد الفريق. إذا استخدمت اسم الحساب، يجب أن يطابق اسم حساب اللاعب بالضبط. ملفات الفرق المصدرة من هذه الصفحة مدعومة الآن."
                : "Email or phone is the most reliable captain identifier. If you use an account name, it must match the player account name exactly. Team exports from this page are now supported."}
            </AlertDescription>
          </Alert>

          {importResult ? (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>{isArabic ? "نتيجة الاستيراد" : "Import result"}</AlertTitle>
              <AlertDescription>
                {isArabic
                  ? `تم استيراد ${importResult.imported} فريق، وإضافة ${importResult.waitlisted} لقائمة الانتظار، وفشل ${importResult.failed.length}.`
                  : `${importResult.imported} imported, ${importResult.waitlisted} waitlisted, ${importResult.failed.length} failed.`}
                {importResult.failed.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    {importResult.failed.slice(0, 8).map((f) => (
                      <li key={`${f.rowNumber}-${f.reason}`}>
                        {isArabic ? "الفريق" : "Team"} {f.rowNumber}: {f.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isArabic ? "إغلاق" : "Close"}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={busyAction !== null || rows.length === 0}
          >
            {busyAction === "team-import" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isArabic ? "استيراد الفرق" : "Import teams"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
