"use client"

import type * as React from "react"
import { createContext, useContext, useState, useCallback, useEffect } from "react"

export type Language = "ar" | "en"
type Direction = "rtl" | "ltr"

interface Translations {
  [key: string]: {
    ar: string
    en: string
  }
}

const translations: Translations = {
  // Navigation
  "nav.home": { ar: "الرئيسية", en: "Home" },
  "nav.courts": { ar: "الملاعب", en: "Courts" },
  "nav.bookings": { ar: "الحجوزات", en: "Bookings" },
  "nav.dashboard": { ar: "لوحة التحكم", en: "Dashboard" },
  "nav.settings": { ar: "الإعدادات", en: "Settings" },
  "nav.profile": { ar: "الملف الشخصي", en: "Profile" },
  "nav.logout": { ar: "تسجيل الخروج", en: "Logout" },
  "nav.login": { ar: "تسجيل الدخول", en: "Login" },
  "nav.register": { ar: "إنشاء حساب", en: "Register" },
  "nav.browseCourts": { ar: "استعرض الملاعب", en: "Browse Courts" },
  "nav.discover": { ar: "اكتشف", en: "Discover" },
  "nav.help": { ar: "المساعدة", en: "Help" },

  // Auth
  "auth.login": { ar: "تسجيل الدخول", en: "Login" },
  "auth.register": { ar: "إنشاء حساب جديد", en: "Create Account" },
  "auth.email": { ar: "البريد الإلكتروني", en: "Email" },
  "auth.phone": { ar: "رقم الهاتف", en: "Phone Number" },
  "auth.password": { ar: "كلمة المرور", en: "Password" },
  "auth.confirmPassword": { ar: "تأكيد كلمة المرور", en: "Confirm Password" },
  "auth.forgotPassword": { ar: "نسيت كلمة المرور؟", en: "Forgot Password?" },
  "auth.resetPassword": { ar: "إعادة تعيين كلمة المرور", en: "Reset Password" },
  "auth.verifyCode": { ar: "التحقق من الرمز", en: "Verify Code" },
  "auth.sendCode": { ar: "إرسال الرمز", en: "Send Code" },
  "auth.resendCode": { ar: "إعادة إرسال الرمز", en: "Resend Code" },
  "auth.noAccount": { ar: "ليس لديك حساب؟", en: "Don't have an account?" },
  "auth.hasAccount": { ar: "لديك حساب بالفعل؟", en: "Already have an account?" },
  "auth.sessionExpired": { ar: "انتهت صلاحية الجلسة", en: "Session Expired" },
  "auth.sessionExpiredDesc": { ar: "يرجى تسجيل الدخول مرة أخرى للمتابعة", en: "Please login again to continue" },
  "auth.name": { ar: "الاسم الكامل", en: "Full Name" },

  // Roles
  "role.admin": { ar: "مدير النظام", en: "Admin" },
  "role.manager": { ar: "مدير الملعب", en: "Manager" },
  "role.player": { ar: "لاعب", en: "Player" },

  // Dashboard
  "dashboard.title": { ar: "لوحة التحكم", en: "Dashboard" },
  "dashboard.welcome": { ar: "مرحباً بك", en: "Welcome" },
  "dashboard.totalBookings": { ar: "إجمالي الحجوزات", en: "Total Bookings" },
  "dashboard.totalUsers": { ar: "إجمالي المستخدمين", en: "Total Users" },
  "dashboard.totalCourts": { ar: "إجمالي الملاعب", en: "Total Courts" },
  "dashboard.occupancyRate": { ar: "معدل الإشغال", en: "Occupancy Rate" },
  "dashboard.recentBookings": { ar: "الحجوزات الأخيرة", en: "Recent Bookings" },
  "dashboard.topCourts": { ar: "أفضل الملاعب", en: "Top Courts" },
  "dashboard.analytics": { ar: "التحليلات", en: "Analytics" },
  "dashboard.reports": { ar: "التقارير", en: "Reports" },
  "dashboard.auditLogs": { ar: "سجلات المراجعة", en: "Audit Logs" },
  "dashboard.userManagement": { ar: "إدارة المستخدمين", en: "User Management" },
  "dashboard.myCourts": { ar: "ملاعبي", en: "My Courts" },
  "dashboard.myBookings": { ar: "حجوزاتي", en: "My Bookings" },
  "dashboard.revenue": { ar: "الإيراد", en: "Revenue" },
  "dashboard.favorites": { ar: "المفضلة", en: "Favorites" },
  "dashboard.checkIn": { ar: "تسجيل الحضور", en: "Check-in" },
  "dashboard.tournaments": { ar: "البطولات", en: "Tournaments" },
  "dashboard.coupons": { ar: "الكوبونات والخصومات", en: "Coupons & Discounts" },
  "dashboard.upcomingBookings": { ar: "الحجوزات القادمة", en: "Upcoming Bookings" },
  "dashboard.bookingHistory": { ar: "سجل الحجوزات", en: "Booking History" },

  // Courts
  "courts.title": { ar: "الملاعب", en: "Courts" },
  "courts.addCourt": { ar: "إضافة ملعب", en: "Add Court" },
  "courts.editCourt": { ar: "تعديل الملعب", en: "Edit Court" },
  "courts.name": { ar: "اسم الملعب", en: "Court Name" },
  "courts.city": { ar: "المدينة", en: "City" },
  "courts.location": { ar: "الموقع", en: "Location" },
  "courts.sportType": { ar: "نوع الرياضة", en: "Sport Type" },
  "courts.pricing": { ar: "التسعير", en: "Pricing" },
  "courts.schedule": { ar: "الجدول الزمني", en: "Schedule" },
  "courts.status": { ar: "الحالة", en: "Status" },
  "courts.active": { ar: "نشط", en: "Active" },
  "courts.inactive": { ar: "غير نشط", en: "Inactive" },
  "courts.peakHours": { ar: "ساعات الذروة", en: "Peak Hours" },
  "courts.offPeakHours": { ar: "خارج الذروة", en: "Off-Peak Hours" },
  "courts.perHour": { ar: "للساعة", en: "Per Hour" },

  // Bookings
  "bookings.status": { ar: "الحالة", en: "Status" },
  "bookings.title": { ar: "الحجوزات", en: "Bookings" },
  "bookings.newBooking": { ar: "حجز جديد", en: "New Booking" },
  "bookings.selectCourt": { ar: "اختر الملعب", en: "Select Court" },
  "bookings.selectDate": { ar: "اختر التاريخ", en: "Select Date" },
  "bookings.selectTime": { ar: "اختر الوقت", en: "Select Time" },
  "bookings.confirmBooking": { ar: "تأكيد الحجز", en: "Confirm Booking" },
  "bookings.cancelBooking": { ar: "إلغاء الحجز", en: "Cancel Booking" },
  "bookings.status.confirmed": { ar: "مؤكد", en: "Confirmed" },
  "bookings.status.cancelled": { ar: "ملغي", en: "Cancelled" },
  "bookings.status.completed": { ar: "مكتمل", en: "Completed" },
  "bookings.status.noShow": { ar: "لم يحضر", en: "Missed booking" },
  "bookings.checkInCode": { ar: "رمز الحضور", en: "Check-in Code" },
  "bookings.cancellationPolicy": { ar: "سياسة الإلغاء", en: "Cancellation Policy" },
  "bookings.freeCancellation": { ar: "إلغاء مجاني قبل", en: "Free cancellation before" },
  "bookings.hours": { ar: "ساعات", en: "hours" },

  // Reports
  "reports.title": { ar: "التقارير", en: "Reports" },
  "reports.generate": { ar: "إنشاء تقرير", en: "Generate Report" },
  "reports.dateRange": { ar: "الفترة الزمنية", en: "Date Range" },
  "reports.export": { ar: "تصدير", en: "Export" },
  "reports.netProfit": { ar: "صافي الربح", en: "Net Profit" },
  "reports.cancellations": { ar: "الإلغاءات", en: "Cancellations" },
  "reports.noShowRate": { ar: "معدل عدم الحضور", en: "Missed booking rate" },
  "reports.activeUsers": { ar: "المستخدمين النشطين", en: "Active Users" },

  // Common
  "common.search": { ar: "بحث...", en: "Search..." },
  "common.filter": { ar: "تصفية", en: "Filter" },
  "common.sort": { ar: "ترتيب", en: "Sort" },
  "common.save": { ar: "حفظ", en: "Save" },
  "common.cancel": { ar: "إلغاء", en: "Cancel" },
  "common.delete": { ar: "حذف", en: "Delete" },
  "common.edit": { ar: "تعديل", en: "Edit" },
  "common.view": { ar: "عرض", en: "View" },
  "common.add": { ar: "إضافة", en: "Add" },
  "common.loading": { ar: "جاري التحميل...", en: "Loading..." },
  "common.noResults": { ar: "لا توجد نتائج", en: "No results found" },
  "common.error": { ar: "حدث خطأ", en: "An error occurred" },
  "common.success": { ar: "تم بنجاح", en: "Success" },
  "common.confirm": { ar: "تأكيد", en: "Confirm" },
  "common.back": { ar: "رجوع", en: "Back" },
  "common.next": { ar: "التالي", en: "Next" },
  "common.previous": { ar: "السابق", en: "Previous" },
  "common.all": { ar: "الكل", en: "All" },
  "common.today": { ar: "اليوم", en: "Today" },
  "common.thisWeek": { ar: "هذا الأسبوع", en: "This Week" },
  "common.thisMonth": { ar: "هذا الشهر", en: "This Month" },
  "common.actions": { ar: "الإجراءات", en: "Actions" },
  "common.details": { ar: "التفاصيل", en: "Details" },
  "common.date": { ar: "التاريخ", en: "Date" },
  "common.time": { ar: "الوقت", en: "Time" },
  "common.from": { ar: "من", en: "From" },
  "common.to": { ar: "إلى", en: "To" },
  "common.skipToContent": { ar: "تخطي إلى المحتوى", en: "Skip to content" },
  "common.egp": { ar: "ج.م", en: "EGP" },

  // Landing Page
  "landing.hero.title": { ar: "احجز ملعبك المفضل بسهولة", en: "Book Your Favorite Court Easily" },
  "landing.hero.subtitle": {
    ar: "منصة شاملة لحجز وإدارة الملاعب الرياضية في مصر",
    en: "A comprehensive platform for booking and managing sports courts in Egypt",
  },
  "landing.hero.cta": { ar: "ابدأ الآن", en: "Get Started" },
  "landing.hero.exploreCourts": { ar: "استكشف الملاعب", en: "Explore Courts" },
  "landing.features.title": { ar: "لماذا ملعبك؟", en: "Why Mal3bk?" },
  "landing.features.booking": { ar: "حجز سهل وسريع", en: "Easy & Fast Booking" },
  "landing.features.bookingDesc": { ar: "احجز ملعبك في ثوانٍ معدودة", en: "Book your court in seconds" },
  "landing.features.management": { ar: "إدارة متكاملة", en: "Complete Management" },
  "landing.features.managementDesc": {
    ar: "نظام شامل لإدارة الملاعب والحجوزات",
    en: "Comprehensive system for court and booking management",
  },
  "landing.features.analytics": { ar: "تحليلات متقدمة", en: "Advanced Analytics" },
  "landing.features.analyticsDesc": { ar: "تقارير وإحصائيات تفصيلية", en: "Detailed reports and statistics" },
  "landing.stats.courts": { ar: "ملعب", en: "Courts" },
  "landing.stats.bookings": { ar: "حجز", en: "Bookings" },
  "landing.stats.users": { ar: "مستخدم", en: "Users" },
  "landing.stats.cities": { ar: "مدينة", en: "Cities" },
  "landing.cta.title": { ar: "هل أنت مالك ملعب؟", en: "Are you a court owner?" },
  "landing.cta.subtitle": {
    ar: "انضم إلينا وابدأ في إدارة ملعبك بسهولة",
    en: "Join us and start managing your court easily",
  },
  "landing.cta.button": { ar: "سجل كمدير ملعب", en: "Register as Court Manager" },
  "landing.footer.rights": { ar: "جميع الحقوق محفوظة", en: "All rights reserved" },

  // Verification
  "verification.title": { ar: "التحقق من الحضور", en: "Check-in Verification" },
  "verification.enterCode": { ar: "أدخل رمز الحضور", en: "Enter Check-in Code" },
  "verification.verify": { ar: "تحقق", en: "Verify" },
  "verification.success": { ar: "تم التحقق بنجاح", en: "Verification Successful" },
  "verification.failed": { ar: "فشل التحقق", en: "Verification Failed" },
  "verification.expired": { ar: "انتهت صلاحية الرمز", en: "Code Expired" },
  "verification.invalid": { ar: "رمز غير صالح", en: "Invalid Code" },

  // Command Palette
  "command.placeholder": { ar: "ابحث عن أمر أو صفحة...", en: "Search for a command or page..." },
  "command.noResults": { ar: "لا توجد نتائج", en: "No results found" },
  "command.navigation": { ar: "التنقل", en: "Navigation" },
  "command.actions": { ar: "الإجراءات", en: "Actions" },
  "command.theme": { ar: "المظهر", en: "Theme" },
  "command.language": { ar: "اللغة", en: "Language" },
  "validation.emailInvalid": { ar: "البريد الإلكتروني غير صالح", en: "Invalid email address" },
  "validation.passwordMin": { ar: "كلمة المرور يجب أن تكون 6 أحرف على الأقل", en: "Password must be at least 6 characters" },
}

interface LanguageContextType {
  language: Language
  direction: Direction
  setLanguage: (lang: Language) => void
  t: (key: string) => string
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined)
const LANGUAGE_STORAGE_KEY = "mal3bk_language"
const LANGUAGE_COOKIE_KEY = "mal3bk_language"

function applyLanguageToDocument(lang: Language) {
  if (typeof document === "undefined") return
  document.documentElement.lang = lang
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"
}

function persistLanguage(lang: Language) {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
    } catch {}
  }

  if (typeof document !== "undefined") {
    const secure = typeof window !== "undefined" && window.location.protocol === "https:" ? "; Secure" : ""
    document.cookie = `${LANGUAGE_COOKIE_KEY}=${lang}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`
  }
}

export function LanguageProvider({
  children,
  initialLanguage = "ar",
}: {
  children: React.ReactNode
  initialLanguage?: Language
}) {
  const [language, setLanguageState] = useState<Language>(initialLanguage)
  const direction: Direction = language === "ar" ? "rtl" : "ltr"

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang)
  }, [])

  const t = useCallback(
    (key: string): string => {
      const translation = translations[key]
      if (!translation) {
        console.warn(`Missing translation for key: ${key}`)
        return key
      }
      return translation[language]
    },
    [language],
  )

  useEffect(() => {
    applyLanguageToDocument(language)
    persistLanguage(language)
  }, [language])

  return <LanguageContext.Provider value={{ language, direction, setLanguage, t }}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider")
  }
  return context
}
