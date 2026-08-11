"use client";

import { useEffect, useState } from "react";
import { Info, ListOrdered, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Textarea } from "@/components/ui/textarea";

export interface RegisterFormData {
  teamName: string;
  partnerName: string;
  partnerPhone: string;
  notes: string;
}

interface RegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "register" | "waitlist";
  /** Pre-populated form values (e.g. from existing team/waitlist entry). */
  seed: RegisterFormData | null;
  dialogTitle: string;
  dialogDescription: string;
  submitLabel: string;
  registrationGuide: { title: string; description: string } | null;
  isArabic: boolean;
  busyAction: string | null;
  onSubmit: (data: RegisterFormData) => Promise<void>;
}

export function RegisterDialog({
  open,
  onOpenChange,
  mode,
  seed,
  dialogTitle,
  dialogDescription,
  submitLabel,
  registrationGuide,
  isArabic,
  busyAction,
  onSubmit,
}: RegisterDialogProps) {
  const [form, setForm] = useState<RegisterFormData>({
    teamName: "",
    partnerName: "",
    partnerPhone: "",
    notes: "",
  });

  useEffect(() => {
    if (open) {
      setForm({
        teamName: seed?.teamName || "",
        partnerName: seed?.partnerName || "",
        partnerPhone: seed?.partnerPhone || "",
        notes: seed?.notes || "",
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {mode === "waitlist" ? (
            <Alert className="border-sky-500/20 bg-sky-500/5">
              <ListOrdered className="h-4 w-4" />
              <AlertTitle>
                {isArabic ? "كيف تعمل قائمة الانتظار" : "How the waitlist works"}
              </AlertTitle>
              <AlertDescription>
                <p>
                  {isArabic
                    ? "سنحتفظ ببيانات فريقك في الدور الحالي، وعندما يتوفر مقعد سيستطيع المدير ترقيتك مباشرة."
                    : "Your team details stay in the current queue order, and the manager can promote you directly when a slot opens."}
                </p>
              </AlertDescription>
            </Alert>
          ) : registrationGuide ? (
            <Alert className="border-border/60 bg-muted/40">
              <Info className="h-4 w-4" />
              <AlertTitle>{registrationGuide.title}</AlertTitle>
              <AlertDescription>
                <p>{registrationGuide.description}</p>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="team-name">
              {isArabic ? "اسم الفريق" : "Team name"}
            </Label>
            <Input
              id="team-name"
              value={form.teamName}
              onChange={(e) => setForm((c) => ({ ...c, teamName: e.target.value }))}
              placeholder={
                isArabic
                  ? "الاسم الذي سيظهر في الشجرة"
                  : "The name shown in the bracket"
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner-name">
              {isArabic ? "اسم الشريك" : "Partner name"}
            </Label>
            <Input
              id="partner-name"
              value={form.partnerName}
              onChange={(e) => setForm((c) => ({ ...c, partnerName: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="partner-phone">
              {isArabic ? "رقم هاتف الشريك" : "Partner phone"}
            </Label>
            <Input
              id="partner-phone"
              value={form.partnerPhone}
              onChange={(e) => setForm((c) => ({ ...c, partnerPhone: e.target.value }))}
              placeholder={isArabic ? "اختياري" : "Optional"}
            />
            <p className="text-xs text-muted-foreground">
              {isArabic
                ? "اختياري. يراه المدير فقط ليسهّل التواصل إذا احتاج إلى توضيح سريع."
                : "Optional. Only the manager sees it, and it helps with quick follow-up if needed."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="team-notes">
              {isArabic ? "رسالة للإدارة" : "Message for manager"}
            </Label>
            <Textarea
              id="team-notes"
              value={form.notes}
              onChange={(e) => setForm((c) => ({ ...c, notes: e.target.value }))}
              placeholder={
                isArabic
                  ? "اختياري: أي تفاصيل إضافية تساعد على مراجعة الفريق"
                  : "Optional: add anything that helps the manager review the team"
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={() => onSubmit(form)} disabled={busyAction !== null}>
            {busyAction === "register" || busyAction === "join-waitlist" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
