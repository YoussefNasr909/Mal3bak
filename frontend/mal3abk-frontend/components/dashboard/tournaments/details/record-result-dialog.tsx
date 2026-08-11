"use client";

import { useEffect, useState } from "react";
import { Loader2, Trophy, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TournamentMatch } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ResultFormData {
  matchId: string;
  winnerTeamId: string;
  sets: Array<{ a: string; b: string }>;
  resultType: "standard" | "walkover";
}

interface RecordResultDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  match: TournamentMatch | null;
  isArabic: boolean;
  busyAction: string | null;
  onSubmit: (data: ResultFormData) => Promise<void>;
}

export function RecordResultDialog({
  open,
  onOpenChange,
  match,
  isArabic,
  busyAction,
  onSubmit,
}: RecordResultDialogProps) {
  const [winnerTeamId, setWinnerTeamId] = useState("");
  const [sets, setSets] = useState<Array<{ a: string; b: string }>>([{ a: "", b: "" }]);
  const [resultType, setResultType] = useState<"standard" | "walkover">("standard");

  useEffect(() => {
    if (open && match) {
      setWinnerTeamId(match.winnerTeamId || match.teamAId || "");
      setSets(
        Array.isArray(match.scoreJson?.teamA) && match.scoreJson.teamA.length > 0
          ? match.scoreJson.teamA.map((a: number, i: number) => ({
              a: String(a),
              b: String(match.scoreJson?.teamB?.[i] ?? ""),
            }))
          : [{ a: "", b: "" }],
      );
      setResultType((match.scoreJson?.resultType as "standard" | "walkover") || "standard");
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const wasCompleted = match?.status === "completed";

  const handleSubmit = () => {
    onSubmit({ matchId: match?.id ?? "", winnerTeamId, sets, resultType });
  };

  const teams = [
    { id: match?.teamAId, name: match?.teamAName },
    { id: match?.teamBId, name: match?.teamBName },
  ].filter((t) => t.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {wasCompleted
              ? isArabic
                ? "تعديل نتيجة المباراة"
                : "Edit match result"
              : isArabic
                ? "تسجيل نتيجة المباراة"
                : "Record match result"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Winner selection */}
          <div className="space-y-2">
            <Label>{isArabic ? "من فاز في هذه المباراة؟" : "Who won this match?"}</Label>
            <div className="grid grid-cols-2 gap-2">
              {teams.map((team) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => setWinnerTeamId(team.id!)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-3 text-sm font-medium transition-colors text-center",
                    winnerTeamId === team.id
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {winnerTeamId === team.id && <Trophy className="h-4 w-4" />}
                  {team.name}
                </button>
              ))}
            </div>
          </div>

          {/* Set scores */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Label>{isArabic ? "نتيجة المجموعات" : "Set scores"}</Label>
              <span className="text-xs text-muted-foreground">
                {isArabic ? "مرن: أدخل أرقام كل مجموعة" : "Flexible: enter each set score"}
              </span>
            </div>
            <p className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              {isArabic
                ? "اختر الفائز من الأعلى، ثم أدخل نتيجة كل مجموعة كما تم تسجيلها. الترتيب يستخدم الفائز للمكسب/الخسارة، وكل مجموعة يفوز بها الفريق من الأرقام تضيف 3 نقاط."
                : "Choose the winner above, then enter each set exactly as recorded. Standings use the selected winner for W/L, and every set won from the entered numbers gives 3 PTS."}
            </p>
            {sets.map((set, i) => {
              const bothFilled = set.a !== "" && set.b !== "";
              return (
                <div
                  key={i}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2",
                    bothFilled ? "border-primary/25 bg-primary/5" : "border-border bg-muted/20",
                  )}
                >
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">
                    {isArabic ? `مج ${i + 1}` : `Set ${i + 1}`}
                  </span>
                  <span className="max-w-[72px] truncate text-xs font-medium">
                    {match?.teamAName}
                  </span>
                  <Input
                    className="h-8 w-16 text-center"
                    value={set.a}
                    onChange={(e) =>
                      setSets((prev) =>
                        prev.map((s, idx) => (idx === i ? { ...s, a: e.target.value } : s)),
                      )
                    }
                    placeholder="6"
                    min={0}
                    inputMode="numeric"
                  />
                  <span className="text-muted-foreground">—</span>
                  <Input
                    className="h-8 w-16 text-center"
                    value={set.b}
                    onChange={(e) =>
                      setSets((prev) =>
                        prev.map((s, idx) => (idx === i ? { ...s, b: e.target.value } : s)),
                      )
                    }
                    placeholder="4"
                    min={0}
                    inputMode="numeric"
                  />
                  <span className="max-w-[72px] truncate text-xs font-medium">
                    {match?.teamBName}
                  </span>
                  {sets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSets((prev) => prev.filter((_, idx) => idx !== i))}
                      className="ml-auto text-muted-foreground hover:text-destructive"
                    >
                      <XCircle className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
            {sets.length < 5 && (
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={() => setSets((prev) => [...prev, { a: "", b: "" }])}
              >
                {isArabic ? "+ أضف مجموعة" : "+ Add set"}
              </Button>
            )}
          </div>

          {/* Walkover option */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              {isArabic ? "لا توجد نتيجة عادية؟" : "No standard score?"}
            </Label>
            <div className="flex gap-2">
              <Button
                variant={resultType === "walkover" ? "default" : "outline"}
                size="sm"
                type="button"
                onClick={() =>
                  setResultType((prev) => (prev === "walkover" ? "standard" : "walkover"))
                }
              >
                {isArabic ? "فوز بالانسحاب" : "Walkover"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isArabic ? "إلغاء" : "Cancel"}
          </Button>
          <Button onClick={handleSubmit} disabled={busyAction !== null}>
            {busyAction === "record-result" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            {wasCompleted
              ? isArabic
                ? "حفظ التعديل"
                : "Save changes"
              : isArabic
                ? "حفظ النتيجة"
                : "Save result"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
