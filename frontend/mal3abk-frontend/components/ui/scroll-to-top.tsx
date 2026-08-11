"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
import { useLanguage } from "@/components/providers/language-provider"
import { cn } from "@/lib/utils"

export function ScrollToTop() {
  const { language } = useLanguage()
  const pathname = usePathname()
  const [isVisible, setIsVisible] = useState(true)
  const [hasOpenDialog, setHasOpenDialog] = useState(false)
  const isVisibleRef = useRef(true)
  const lastScrollY = useRef(0)
  const isAuthPage = pathname?.startsWith("/auth/") ?? false
  const isDashboardPage = pathname?.startsWith("/dashboard") ?? false

  const setSupportVisible = useCallback((nextVisible: boolean) => {
    if (isVisibleRef.current === nextVisible) return

    isVisibleRef.current = nextVisible
    setIsVisible(nextVisible)
  }, [])

  useEffect(() => {
    lastScrollY.current = typeof window === "undefined" ? 0 : window.scrollY
    setSupportVisible(true)
  }, [pathname, setSupportVisible])

  useEffect(() => {
    if (isAuthPage) return
    if (isDashboardPage) return
    if (typeof window === "undefined") return

    let ticking = false
    lastScrollY.current = window.scrollY

    const handleScroll = () => {
      if (ticking) return

      ticking = true
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY
        const delta = currentScrollY - lastScrollY.current

        if (delta < -4 || currentScrollY < 50) {
          setSupportVisible(true)
        } else if (delta > 4 && currentScrollY > 100) {
          setSupportVisible(false)
        }

        lastScrollY.current = currentScrollY
        ticking = false
      })
      }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [isAuthPage, isDashboardPage, setSupportVisible])

  useEffect(() => {
    if (isAuthPage || !isDashboardPage) return
    if (typeof document === "undefined") return

    const root = document.documentElement
    const syncWithBottomNav = () => {
      setSupportVisible(root.dataset.mobileBottomNav !== "hidden")
    }

    syncWithBottomNav()

    const observer = new MutationObserver(syncWithBottomNav)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-mobile-bottom-nav"],
    })

    return () => observer.disconnect()
  }, [isAuthPage, isDashboardPage, pathname, setSupportVisible])

  useEffect(() => {
    if (isAuthPage) return
    if (typeof document === "undefined") return

    const updateDialogState = () => {
      setHasOpenDialog(Boolean(document.querySelector('[role="dialog"][data-state="open"]')))
    }

    updateDialogState()

    const observer = new MutationObserver(updateDialogState)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-state", "role"],
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [isAuthPage, pathname])

  const whatsappNumber = "+201131734350"
  const isArabic = language === "ar"
  const message = isArabic
    ? "مرحباً، أحتاج إلى مساعدة بخصوص تطبيق ملعبك"
    : "Hello, I need help with Mal3bk app"
  const ariaLabel = isArabic ? "تواصل معنا عبر واتساب" : "Contact us on WhatsApp"
  const supportLabel = isArabic ? "واتساب" : "WhatsApp"
  const supportHint = isArabic ? "مساعدة سريعة" : "Need help?"

  const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/\+/g, "")}?text=${encodeURIComponent(message)}`

  if (isAuthPage) return null

  return (
    <div 
      className={cn(
        "fixed bottom-[calc(var(--mobile-bottom-nav-offset,1.5rem)+0.5rem)] end-4 z-50 md:bottom-[calc(1.5rem+env(safe-area-inset-bottom))] md:end-6",
        "transform-gpu transition-[transform,opacity] duration-200 ease-out will-change-transform motion-reduce:transition-none",
        isVisible && !hasOpenDialog ? "translate-y-0 opacity-100" : "translate-y-[150%] opacity-0 pointer-events-none"
      )}
    >
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        dir={isArabic ? "rtl" : "ltr"}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={cn(
          "group relative flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-[#25D366]",
          "touch-manipulation text-white shadow-[0_8px_18px_rgba(37,211,102,0.24)] transition-transform duration-150 ease-out sm:shadow-[0_10px_24px_rgba(37,211,102,0.28)] [-webkit-tap-highlight-color:transparent]",
          "hover:-translate-y-1 hover:scale-105",
          "focus-visible:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#25D366] focus-visible:ring-offset-2",
          "active:translate-y-0 active:scale-95"
        )}
      >
        <span
          className="pointer-events-none absolute bottom-1/2 end-[calc(100%+1rem)] hidden min-w-[9rem] translate-y-1/2 scale-95 rounded-2xl border border-border/50 bg-background/98 px-4 py-2.5 text-start opacity-0 shadow-lg transition-all duration-300 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 sm:block sm:backdrop-blur-sm"
          aria-hidden="true"
        >
          <span className="block text-sm font-semibold text-foreground">{supportLabel}</span>
          <span className="mt-0.5 block text-xs font-medium text-muted-foreground">{supportHint}</span>
        </span>
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6 sm:h-7 sm:w-7 fill-current drop-shadow-sm"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.414 0 .004 5.412.001 12.049c0 2.123.54 4.197 1.566 6.041L0 24l6.102-1.6c1.778.969 3.798 1.482 5.86 1.482h.004c6.634 0 12.045-5.412 12.048-12.05a11.8 11.8 0 00-3.526-8.527z"/>
        </svg>
      </a>
    </div>
  )
}
