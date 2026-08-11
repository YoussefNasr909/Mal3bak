"use client"

import { ChevronDown, ChevronUp, MessageSquareText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { hasBookingNote, normalizeBookingNote } from "@/lib/booking-notes"
import { cn } from "@/lib/utils"

function getBookingNoteCopy(language: string) {
  return {
    label:
      language === "ar"
        ? "\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0644\u0627\u0639\u0628"
        : "Player note",
    shortLabel:
      language === "ar"
        ? "\u0645\u0644\u0627\u062D\u0638\u0629"
        : "Note",
    show:
      language === "ar"
        ? "\u0639\u0631\u0636 \u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0644\u0627\u0639\u0628"
        : "Show player note",
    hide:
      language === "ar"
        ? "\u0625\u062E\u0641\u0627\u0621 \u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0644\u0627\u0639\u0628"
        : "Hide player note",
  }
}

function getClampClass(lines?: number) {
  switch (lines) {
    case 1:
      return "line-clamp-1"
    case 2:
      return "line-clamp-2"
    case 3:
      return "line-clamp-3"
    case 4:
      return "line-clamp-4"
    default:
      return ""
  }
}

type BookingNoteSummaryProps = {
  note?: string | null
  language: string
  className?: string
  lines?: 1 | 2 | 3 | 4
}

export function BookingNoteSummary({
  note,
  language,
  className,
  lines = 2,
}: BookingNoteSummaryProps) {
  const normalized = normalizeBookingNote(note)
  if (!normalized) return null

  const copy = getBookingNoteCopy(language)

  return (
    <div
      dir={language === "ar" ? "rtl" : "ltr"}
      className={cn(
        "rounded-2xl border border-primary/12 bg-primary/[0.045] px-3 py-2 text-start",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <MessageSquareText className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-primary">{copy.label}</p>
          <p
            className={cn(
              "mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-foreground/80",
              getClampClass(lines),
            )}
          >
            {normalized}
          </p>
        </div>
      </div>
    </div>
  )
}

type BookingNoteToggleButtonProps = {
  language: string
  expanded?: boolean
  onClick: () => void
  className?: string
}

export function BookingNoteToggleButton({
  language,
  expanded = false,
  onClick,
  className,
}: BookingNoteToggleButtonProps) {
  const copy = getBookingNoteCopy(language)

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onClick}
      aria-expanded={expanded}
      aria-label={expanded ? copy.hide : copy.show}
      className={cn(
        "h-9 rounded-2xl border-primary/15 bg-primary/[0.04] px-3 text-xs font-semibold text-primary hover:bg-primary/[0.08]",
        className,
      )}
    >
      <MessageSquareText className="me-1.5 h-3.5 w-3.5" />
      {copy.shortLabel}
      {expanded ? <ChevronUp className="ms-1 h-3.5 w-3.5" /> : <ChevronDown className="ms-1 h-3.5 w-3.5" />}
    </Button>
  )
}

type BookingNotePanelProps = {
  note?: string | null
  language: string
  className?: string
}

export function BookingNotePanel({ note, language, className }: BookingNotePanelProps) {
  const normalized = normalizeBookingNote(note)
  if (!normalized) return null

  const copy = getBookingNoteCopy(language)

  return (
    <div
      dir={language === "ar" ? "rtl" : "ltr"}
      className={cn("rounded-2xl border border-primary/12 bg-primary/[0.045] p-3 text-start", className)}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MessageSquareText className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.01em] text-primary">{copy.label}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">{normalized}</p>
        </div>
      </div>
    </div>
  )
}

type BookingNotePopoverButtonProps = {
  note?: string | null
  language: string
  className?: string
  align?: "start" | "center" | "end"
  iconOnly?: boolean
}

export function BookingNotePopoverButton({
  note,
  language,
  className,
  align = "end",
  iconOnly = false,
}: BookingNotePopoverButtonProps) {
  if (!hasBookingNote(note)) return null

  const copy = getBookingNoteCopy(language)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={iconOnly ? "icon" : "sm"}
          aria-label={copy.show}
          className={cn(
            iconOnly
              ? "h-8 w-8 rounded-xl border-primary/15 bg-primary/[0.04] p-0 text-primary hover:bg-primary/[0.08]"
              : "h-8 rounded-xl border-primary/15 bg-primary/[0.04] px-3 text-xs font-semibold text-primary hover:bg-primary/[0.08]",
            className,
          )}
        >
          <MessageSquareText className="h-3.5 w-3.5" />
          {iconOnly ? null : copy.shortLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0">
        <BookingNotePanel note={note} language={language} className="rounded-xl border-0 bg-transparent p-4" />
      </PopoverContent>
    </Popover>
  )
}
