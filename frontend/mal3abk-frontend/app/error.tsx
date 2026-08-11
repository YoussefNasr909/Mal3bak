"use client"

import { useEffect, useState } from "react"
import { AlertCircle, RotateCw } from "lucide-react"
import { Button } from "@/components/ui/button"

type Lang = "ar" | "en"

// Read the language straight from the <html lang> attribute (set by the root
// layout from the cookie). Avoids useLanguage() so this boundary still renders
// even if the LanguageProvider itself was the thing that crashed.
function readDocumentLanguage(): Lang {
  if (typeof document === "undefined") return "ar"
  return document.documentElement.lang === "en" ? "en" : "ar"
}

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [lang, setLang] = useState<Lang>("ar")

  useEffect(() => {
    setLang(readDocumentLanguage())
    console.error("[App Error]", error)
  }, [error])

  const isAr = lang === "ar"

  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4"
      dir={isAr ? "rtl" : "ltr"}
    >
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
        </div>

        <div className="space-y-3">
          <h1 className="text-2xl font-bold text-foreground">
            {isAr ? "حدث خطأ غير متوقع" : "Something went wrong"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isAr
              ? "حدث خطأ غير متوقع. حاول مرة أخرى أو ارجع للصفحة الرئيسية. لو استمرت المشكلة، تواصل مع الدعم."
              : "We hit an unexpected error. You can try again, or go back home. If it keeps happening, contact support with what you were doing."}
          </p>
        </div>

        {process.env.NODE_ENV === "development" && error.message && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-left" dir="ltr">
            <p className="text-xs font-mono text-red-600 break-words">{error.message}</p>
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={reset} className="flex-1 h-12 rounded-lg gap-2">
            <RotateCw className="h-4 w-4" />
            {isAr ? "حاول مرة أخرى" : "Try Again"}
          </Button>
          <Button
            variant="outline"
            className="flex-1 h-12 rounded-lg bg-transparent"
            onClick={() => (window.location.href = "/")}
          >
            {isAr ? "الرئيسية" : "Go Home"}
          </Button>
        </div>
      </div>
    </div>
  )
}
