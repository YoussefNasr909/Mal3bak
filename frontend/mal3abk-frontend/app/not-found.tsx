"use client"

import Link from "next/link"
import { Home, ArrowLeft, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/providers/language-provider"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AuthNavbar } from "@/components/auth/auth-navbar"
import { GridBackground, NoiseTexture, Spotlight } from "@/components/ui/floating-elements"

export default function NotFound() {
  const { language, direction } = useLanguage()

  return (
    <div className="min-h-screen bg-background" dir={direction}>
      <AuthNavbar />

      <div className="relative">
        <GridBackground />
        <NoiseTexture />
        <Spotlight />
      </div>

      <div className="container-responsive py-24 sm:py-32">
        <div className="mx-auto max-w-2xl">
          <Card className="border-2 border-border/60 bg-card/75 backdrop-blur-xl shadow-lg">
            <CardContent className="p-8 sm:p-10">
              <div className="text-center space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-sm text-primary">
                  <Search className="h-4 w-4" />
                  {language === "ar" ? "لم يتم العثور على الصفحة" : "Page not found"}
                </div>
                <h1 className="text-7xl sm:text-8xl font-extrabold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-primary to-emerald-500">
                  404
                </h1>
                <h2 className="text-2xl font-extrabold text-foreground">
                  {language === "ar" ? "عذراً، هذه الصفحة غير موجودة" : "Sorry, this page doesn’t exist"}
                </h2>
                <p className="text-muted-foreground">
                  {language === "ar"
                    ? "ربما تم نقلها أو تمت كتابتها بشكل غير صحيح. استخدم الأزرار أدناه."
                    : "It may have been moved or typed incorrectly. Use the actions below."}
                </p>

                <div className="flex flex-wrap justify-center gap-2">
                  <Badge variant="secondary" className="rounded-xl">
                    {language === "ar" ? "نقترح" : "Suggestions"}
                  </Badge>
                  <Badge className="rounded-xl bg-success/15 text-success border-success/25">
                    {language === "ar" ? "العودة للصفحة الرئيسية" : "Return to homepage"}
                  </Badge>
                  <Badge className="rounded-xl bg-info/15 text-info border-info/25">
                    {language === "ar" ? "التحقق من الرابط" : "Check the URL"}
                  </Badge>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row gap-3 justify-center">
                  <Button asChild className="rounded-xl">
                    <Link href="/">
                      <Home className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
                      {language === "ar" ? "الرئيسية" : "Home"}
                    </Link>
                  </Button>
                  <Button variant="outline" className="rounded-xl" onClick={() => window.history.back()}>
                    <ArrowLeft className="h-4 w-4 ltr:mr-2 rtl:ml-2 rtl:rotate-180" />
                    {language === "ar" ? "رجوع" : "Go Back"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
