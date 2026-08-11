"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tournament } from "@/lib/types";

interface BulkReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "approve" | "reject";
  selectedTeams: Tournament["teams"];
  isArabic: boolean;
  busyAction: string | null;
  onSubmit: (notes: string) => Promise<void>;
}

export function BulkReviewDialog({
  open,
  onOpenChange,
  mode,
  selectedTeams,
  isArabic,
  busyAction,
  onSubmit,
}: BulkReviewDialogProps) {
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) setNotes("");
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setNotes("");
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "approve"
              ? isArabic
                ? "اعتماد الفرق المحددة"
                : "Approve selected teams"
              : isArabic
                ? "رفض الفرق المحددة"
                : "Reject selected teams"}
          </DialogTitle>
          <DialogDescription>
            {mode === "approve"
              ? isArabic
                ? "اعتمد عدة فرق دفعة واحدة مع إضافة ملاحظة مشتركة عند الحاجة."
                : "Approve multiple teams in one step, with an optional shared note."
              : isArabic
                ? "ارفض الفرق المحددة مع ملاحظة مشتركة تساعد اللاعبين على فهم المطلوب."
                : "Reject the selected teams with an optional shared note that explains what they should fix."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="rounded-2xl border bg-muted/40 p-4">
            <p className="text-sm font-semibold text-foreground">
              {isArabic
                ? `الفرق المحددة: ${selectedTeams.length}`
                : `Selected teams: ${selectedTeams.length}`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {selectedTeams.map((team) => (
                <Badge key={team.id} variant="outline">
                  {team.teamName}
                </Badge>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-review-notes">
              {isArabic ? "ملاحظة مشتركة" : "Shared note"}
            </Label>
            <Textarea
              id="bulk-review-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                mode === "approve"
                  ? isArabic
                    ? "اختياري: أضف توضيحًا قصيرًا يظهر لكل فريق معتمد."
                    : "Optional: add a short note that will be saved for each approved team."
                  : isArabic
                    ? "اختياري: اشرح بإيجاز سبب الرفض أو ما يجب تعديله قبل إعادة التقديم."
                    : "Optional: explain why the teams were rejected or what they should change before resubmitting."
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button
            onClick={() => onSubmit(notes)}
            disabled={busyAction !== null || selectedTeams.length === 0}
          >
            {busyAction === `bulk-review-${mode}` ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {mode === "approve"
              ? isArabic
                ? "اعتماد المحدد"
                : "Approve selection"
              : isArabic
                ? "رفض المحدد"
                : "Reject selection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
