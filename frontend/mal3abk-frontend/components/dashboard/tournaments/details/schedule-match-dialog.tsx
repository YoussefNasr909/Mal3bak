"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { createEgyptDate } from "@/lib/date";
import type { Tournament, TournamentMatch } from "@/lib/types";

// ── date helpers (inlined to keep this component self-contained) ─────────────

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

function toMs(value: string | Date | null | undefined) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function getDefaultScheduleWindow(match: TournamentMatch, tournament: Tournament | null) {
  if (match.startAt && match.endAt) {
    return {
      startAt: toCairoInputValue(match.startAt),
      endAt: toCairoInputValue(match.endAt),
    };
  }
  const baseMs = Math.max(
    toMs(tournament?.startDate) ?? 0,
    Date.now() + 30 * 60 * 1000,
  );
  const roundedStartMs = Math.ceil(baseMs / (30 * 60 * 1000)) * 30 * 60 * 1000;
  return {
    startAt: toCairoInputValue(new Date(roundedStartMs)),
    endAt: toCairoInputValue(new Date(roundedStartMs + 60 * 60 * 1000)),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export interface ScheduleFormData {
  matchId: string;
  courtId: string;
  startAt: string; // ISO string
  endAt: string;   // ISO string
}

interface ScheduleMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: TournamentMatch | null;
  tournament: Tournament | null;
  isArabic: boolean;
  busyAction: string | null;
  onSubmit: (data: ScheduleFormData) => Promise<void>;
}

export function ScheduleMatchDialog({
  open,
  onOpenChange,
  match,
  tournament,
  isArabic,
  busyAction,
  onSubmit,
}: ScheduleMatchDialogProps) {
  const [courtId, setCourtId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  useEffect(() => {
    if (open && match) {
      const defaults = getDefaultScheduleWindow(match, tournament);
      setCourtId(match.courtId || tournament?.courts?.[0]?.id || "");
      setStartAt(defaults.startAt);
      setEndAt(defaults.endAt);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = () => {
    if (!match?.id) return;
    const startIso = toIsoFromCairoInput(startAt);
    const endIso = toIsoFromCairoInput(endAt);
    if (!startIso || !endIso) return;
    onSubmit({ matchId: match.id, courtId, startAt: startIso, endAt: endIso });
  };

  const courts = tournament?.courts ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isArabic ? "جدولة مباراة" : "Schedule match"}
          </DialogTitle>
          <DialogDescription>
            {isArabic
              ? "سيتم إنشاء إغلاق تلقائي على الملعب المختار لمنع أي تضارب مع الحجوزات أو المباريات الأخرى."
              : "An automatic court closure will be created to prevent overlap with bookings or other tournament matches."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="schedule-court">
              {isArabic ? "الملعب" : "Court"}
            </Label>
            <select
              id="schedule-court"
              title={isArabic ? "اختر ملعبًا" : "Select a court"}
              className="h-10 rounded-md border bg-background px-3 text-sm"
              value={courtId}
              onChange={(e) => setCourtId(e.target.value)}
            >
              <option value="">
                {isArabic ? "اختر ملعبًا" : "Select a court"}
              </option>
              {courts.map((court) => (
                <option key={court.id} value={court.id}>
                  {isArabic ? court.name : court.nameEn || court.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label>{isArabic ? "بداية المباراة" : "Match start"}</Label>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(e) => setStartAt(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{isArabic ? "نهاية المباراة" : "Match end"}</Label>
            <Input
              type="datetime-local"
              value={endAt}
              onChange={(e) => setEndAt(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={busyAction !== null}>
            {busyAction === "schedule-match" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {isArabic ? "حفظ الجدولة" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
