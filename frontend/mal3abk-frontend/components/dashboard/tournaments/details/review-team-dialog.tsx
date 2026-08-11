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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Tournament } from "@/lib/types";

interface ReviewTeamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: Tournament["teams"][number] | null;
  mode: "approve" | "reject";
  isArabic: boolean;
  busyAction: string | null;
  onSubmit: (notes: string) => Promise<void>;
}

export function ReviewTeamDialog({
  open,
  onOpenChange,
  team,
  mode,
  isArabic,
  busyAction,
  onSubmit,
}: ReviewTeamDialogProps) {
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
                ? "مراجعة واعتماد الفريق"
                : "Review and approve team"
              : isArabic
                ? "مراجعة ورفض الفريق"
                : "Review and reject team"}
          </DialogTitle>
          <DialogDescription>
            {team
              ? isArabic
                ? `راجع بيانات فريق ${team.teamName} ثم أضف ملاحظة اختيارية تظهر لاحقًا في حالة الفريق.`
                : `Review ${team.teamName} and add an optional note that will appear later in the team status.`
              : isArabic
                ? "راجع بيانات الفريق ثم أضف ملاحظة اختيارية."
                : "Review the team details and add an optional note."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {team ? (
            <div className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">
                  {isArabic ? "الفريق:" : "Team:"}
                </span>{" "}
                {team.teamName}
              </p>
              <p>
                <span className="font-semibold text-foreground">
                  {isArabic ? "القائد:" : "Captain:"}
                </span>{" "}
                {team.captainName || "-"}
              </p>
              <p>
                <span className="font-semibold text-foreground">
                  {isArabic ? "الشريك:" : "Partner:"}
                </span>{" "}
                {team.partnerName || "-"}
              </p>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="review-notes">
              {isArabic ? "ملاحظة المراجعة" : "Review note"}
            </Label>
            <Textarea
              id="review-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                mode === "approve"
                  ? isArabic
                    ? "اختياري: أضف ملاحظة قصيرة إذا احتجت إلى توضيح"
                    : "Optional: add a short note if you need to clarify anything"
                  : isArabic
                    ? "اختياري: اشرح للاعب ما الذي يحتاج إلى تعديله قبل إعادة الإرسال"
                    : "Optional: explain what the player should fix before resubmitting"
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={() => onSubmit(notes)} disabled={busyAction !== null}>
            {busyAction === "review-approve" || busyAction === "review-reject" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {mode === "approve"
              ? isArabic
                ? "اعتماد الفريق"
                : "Approve team"
              : isArabic
                ? "رفض الفريق"
                : "Reject team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
