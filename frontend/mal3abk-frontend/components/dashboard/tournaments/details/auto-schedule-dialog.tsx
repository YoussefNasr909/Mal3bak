"use client";

import { useState } from "react";
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

export interface AutoScheduleFormData {
  startAt: string;
  durationMinutes: number;
  gapMinutes: number;
}

interface AutoScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isArabic: boolean;
  busyAction: string | null;
  onSubmit: (form: AutoScheduleFormData) => Promise<void>;
}

export function AutoScheduleDialog({
  open,
  onOpenChange,
  isArabic,
  busyAction,
  onSubmit,
}: AutoScheduleDialogProps) {
  const [form, setForm] = useState<AutoScheduleFormData>({
    startAt: "",
    durationMinutes: 60,
    gapMinutes: 15,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isArabic ? "جدولة المباريات تلقائيًا" : "Auto schedule matches"}
          </DialogTitle>
          <DialogDescription>
            {isArabic
              ? "سيحاول النظام جدولة المباريات القابلة للعب على ملاعب البطولة مع احترام الحجوزات والإغلاقات."
              : "The system will try to schedule playable matches on assigned courts while respecting bookings and closures."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="space-y-2">
            <Label>{isArabic ? "وقت البداية" : "Start from"}</Label>
            <Input
              type="datetime-local"
              value={form.startAt}
              onChange={(e) => setForm((c) => ({ ...c, startAt: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{isArabic ? "مدة المباراة" : "Match duration"}</Label>
              <Input
                type="number"
                min={30}
                max={240}
                value={form.durationMinutes}
                onChange={(e) =>
                  setForm((c) => ({ ...c, durationMinutes: Number(e.target.value) }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>{isArabic ? "الفاصل" : "Gap"}</Label>
              <Input
                type="number"
                min={0}
                max={120}
                value={form.gapMinutes}
                onChange={(e) =>
                  setForm((c) => ({ ...c, gapMinutes: Number(e.target.value) }))
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={() => onSubmit(form)} disabled={busyAction !== null}>
            {busyAction === "auto-schedule" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {isArabic ? "ابدأ الجدولة" : "Start scheduling"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
