"use client"

import { useEffect, useState } from "react"
import { Globe, Moon, Sun } from "lucide-react"
import { useTheme } from "next-themes"

import { useLanguage } from "@/components/providers/language-provider"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type NavbarPreferenceControlsProps = {
  className?: string
  compact?: boolean
}

export function NavbarPreferenceControls({
  className,
  compact = false,
}: NavbarPreferenceControlsProps) {
  const { language, setLanguage } = useLanguage()
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const activeTheme = mounted ? (theme === "system" ? resolvedTheme : theme) : null
  const isDark = activeTheme === "dark"
  const languageToggleLabel =
    language === "ar" ? "التبديل إلى الإنجليزية" : "Switch to Arabic"
  const themeToggleLabel =
    !mounted
      ? language === "ar"
        ? "تبديل المظهر"
        : "Toggle color mode"
      : language === "ar"
        ? isDark
          ? "التبديل إلى الوضع الفاتح"
          : "التبديل إلى الوضع الداكن"
        : isDark
          ? "Switch to light mode"
          : "Switch to dark mode"

  return (
    <div
      className={cn(
        "flex items-center rounded-full border border-border/35 bg-background/72 p-1 text-foreground shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur-2xl supports-[backdrop-filter]:bg-background/68 dark:border-white/[0.08] dark:bg-white/[0.03] dark:shadow-[0_14px_28px_rgba(0,0,0,0.26)]",
        compact ? "gap-0.5" : "gap-1",
        className,
      )}
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          "group rounded-full font-black tracking-[0.22em] text-foreground transition-all duration-300 hover:bg-primary/10 hover:text-primary",
          compact ? "h-9 px-2.5 text-[11px]" : "h-10 px-3 text-xs",
        )}
        onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
        aria-label={languageToggleLabel}
      >
        <Globe className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
        <span>{language === "ar" ? "AR" : "EN"}</span>
      </Button>

      <div className="mx-0.5 h-5 w-px bg-border/20 dark:bg-white/[0.08]" />

      <Button
        variant="ghost"
        size="icon"
        className={cn(
          "group rounded-full text-foreground transition-all duration-300 hover:bg-primary/10 hover:text-primary",
          compact ? "h-9 w-9" : "h-10 w-10",
        )}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={themeToggleLabel}
      >
        {mounted ? (
          isDark ? (
            <Moon className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-12" />
          ) : (
            <Sun className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
          )
        ) : (
          <span className="block h-4 w-4" aria-hidden="true" />
        )}
      </Button>
    </div>
  )
}
