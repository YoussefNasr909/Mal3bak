"use client"

import * as React from "react"
import { Clock, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface TimePickerProps {
  value: string // "HH:mm"
  onChange: (value: string) => void
  disabled?: boolean
  className?: string
  placeholder?: string
}

export function TimePicker({ value, onChange, disabled, className, placeholder }: TimePickerProps) {
  const [hour, setHour] = React.useState("")
  const [minute, setMinute] = React.useState("")
  const [period, setPeriod] = React.useState("")

  // Sync internal state with prop value
  React.useEffect(() => {
    if (!value) {
      setHour("")
      setMinute("")
      setPeriod("")
      return
    }
    const [h, m] = value.split(":")
    const hNum = parseInt(h, 10)
    const p = hNum >= 12 ? "PM" : "AM"
    const displayH = hNum % 12 || 12
    setHour(displayH.toString().padStart(2, "0"))
    setMinute(m || "00")
    setPeriod(p)
  }, [value])

  const emitTimeChange = (newHour: string, newMinute: string, newPeriod: string) => {
    if (!newHour || !newMinute || !newPeriod) return
    let h = parseInt(newHour, 10)
    if (newPeriod === "PM" && h < 12) h += 12
    if (newPeriod === "AM" && h === 12) h = 0
    const formattedTime = `${h.toString().padStart(2, "0")}:${newMinute}`
    onChange(formattedTime)
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            disabled={disabled}
            className={cn(
              "h-12 w-full justify-between items-center rounded-2xl bg-muted/20 border-border/60 px-4 font-mono text-base transition-all hover:bg-muted/30 hover:border-primary/30",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <span className="flex items-center gap-2">
              {value ? (
                <span className="text-foreground font-bold">
                  {hour}:{minute} {period}
                </span>
              ) : (
                <span className="text-muted-foreground font-medium">
                  {placeholder || "Select time"}
                </span>
              )}
            </span>
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3 rounded-2xl shadow-xl border-border/60 bg-popover/95 backdrop-blur-md" align="start">
          <div className="flex items-center gap-2">
            {/* Hour Select */}
            <Select 
              value={hour || undefined} 
              onValueChange={(v) => {
                const nextMinute = minute || "00"
                setHour(v)
                setMinute(nextMinute)
                emitTimeChange(v, nextMinute, period)
              }}
            >
              <SelectTrigger className="w-[70px] rounded-xl border-border/40">
                <SelectValue placeholder="Hr" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => {
                  const val = h.toString().padStart(2, "0")
                  return <SelectItem key={val} value={val}>{val}</SelectItem>
                })}
              </SelectContent>
            </Select>

            <span className="text-muted-foreground font-bold">:</span>

            {/* Minute Select */}
            <Select 
              value={minute || undefined} 
              onValueChange={(v) => {
                setMinute(v)
                emitTimeChange(hour, v, period)
              }}
            >
              <SelectTrigger className="w-[70px] rounded-xl border-border/40">
                <SelectValue placeholder="Min" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                {["00"].map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Period Select */}
            <Select 
              value={period || undefined} 
              onValueChange={(v) => {
                const nextMinute = minute || "00"
                setPeriod(v)
                setMinute(nextMinute)
                emitTimeChange(hour, nextMinute, v)
              }}
            >
              <SelectTrigger className="w-[75px] rounded-xl border-border/40">
                <SelectValue placeholder="AM/PM" />
              </SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="AM">AM</SelectItem>
                <SelectItem value="PM">PM</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
