"use client"

import { useLanguage } from "@/components/providers/language-provider"
import { Card, CardContent } from "@/components/ui/card"
import { QrCode } from "lucide-react"

interface QRCodeDisplayProps {
  code: string
  size?: "sm" | "md" | "lg"
}

export function QRCodeDisplay({ code, size = "md" }: QRCodeDisplayProps) {
  const { language } = useLanguage()

  const sizeClasses = {
    sm: "p-2 px-4 text-lg",
    md: "p-4 px-8 text-2xl",
    lg: "p-6 px-12 text-4xl",
  }

  return (
    <Card className="inline-block border-2 border-primary/20 bg-primary/5 shadow-sm rounded-2xl overflow-hidden">
      <CardContent className={`${sizeClasses[size]} flex flex-col items-center justify-center gap-1`}>
        <p className="text-[10px] uppercase tracking-wider font-bold text-primary/60">
          {language === "ar" ? "رمز الدخول" : "CHECK-IN CODE"}
        </p>
        <p className="font-mono font-black tracking-[0.2em] text-primary">
          {code}
        </p>
      </CardContent>
    </Card>
  )
}

