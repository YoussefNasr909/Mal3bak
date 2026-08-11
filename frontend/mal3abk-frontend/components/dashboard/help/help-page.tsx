"use client"

import * as React from "react"
import {
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
  Heart,
  Languages,
  Layers,
  LayoutDashboard,
  Lock,
  MapPin,
  QrCode,
  Search,
  Settings2,
  Shield,
  Sparkles,
  Star,
  User,
  Users,
  Mail,
  MessageCircle,
  Bug,
  LifeBuoy,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

import { useLanguage } from "@/components/providers/language-provider"
import { AnimatedContainer } from "@/components/ui/animated-container"
import { PageHeader } from "@/components/ui/page-header"
import { cn } from "@/lib/utils"

type LangText = { ar: string; en: string }

function t(text: LangText, lang: "ar" | "en") {
  return lang === "ar" ? text.ar : text.en
}

const overviewCards: {
  id: string
  icon: React.ElementType
  title: LangText
  description: LangText
}[] = [
  {
    id: "overview-1",
    icon: Building2,
    title: { ar: "منصة لحجز الملاعب", en: "Court booking platform" },
    description: {
      ar: "ملعبك هو مشروع متكامل يساعد المستخدم على اكتشاف الملاعب الرياضية، استعراض التفاصيل، ثم إنشاء الحجز بسهولة.",
      en: "Mal3bk is a complete platform that helps users discover sports courts, review details, and create bookings easily.",
    },
  },
  {
    id: "overview-2",
    icon: Users,
    title: { ar: "أدوار متعددة", en: "Multiple user roles" },
    description: {
      ar: "المنصة مبنية لثلاثة أدوار أساسية: اللاعب، مدير الملاعب، والمشرف، ولكل دور لوحة تحكم وصلاحيات مناسبة.",
      en: "The platform is built for three core roles: player, court manager, and admin, each with its own dashboard and permissions.",
    },
  },
  {
    id: "overview-3",
    icon: Languages,
    title: { ar: "عربي وإنجليزي", en: "Arabic and English" },
    description: {
      ar: "تجربة الاستخدام ثنائية اللغة بالكامل مع دعم RTL و LTR لضمان واجهة واضحة وسهلة.",
      en: "The experience is fully bilingual with RTL and LTR support for a clean and easy interface.",
    },
  },
  {
    id: "overview-4",
    icon: LayoutDashboard,
    title: { ar: "لوحات تحكم منظمة", en: "Organized dashboards" },
    description: {
      ar: "كل مستخدم يرى الأدوات والمحتوى المناسبين له داخل النظام، مع واجهات مبنية لتكون واضحة وسريعة.",
      en: "Each user sees the tools and content relevant to them inside the system, through clear and fast dashboards.",
    },
  },
]

const journeySteps: {
  id: string
  icon: React.ElementType
  title: LangText
  description: LangText
}[] = [
  {
    id: "step-1",
    icon: User,
    title: { ar: "1) إنشاء الحساب", en: "1) Create an account" },
    description: {
      ar: "يبدأ المستخدم بإنشاء حساب جديد ثم الدخول إلى المنصة حسب دوره وصلاحياته.",
      en: "The user starts by creating an account, then enters the platform based on their role and permissions.",
    },
  },
  {
    id: "step-2",
    icon: Search,
    title: { ar: "2) استكشاف الملاعب", en: "2) Explore courts" },
    description: {
      ar: "يمكن للاعب تصفح الملاعب ومراجعة المدينة والسعر والمواعيد والتفاصيل الأساسية قبل اتخاذ القرار.",
      en: "Players can browse courts and review city, price, schedule, and essential details before making a decision.",
    },
  },
  {
    id: "step-3",
    icon: Calendar,
    title: { ar: "3) إنشاء الحجز", en: "3) Create a booking" },
    description: {
      ar: "بعد اختيار الملعب والموعد المناسب، يتم إنشاء الحجز ومتابعته من لوحة المستخدم.",
      en: "After choosing the court and suitable time, the booking is created and tracked from the user dashboard.",
    },
  },
  {
    id: "step-4",
    icon: QrCode,
    title: { ar: "4) استلام كود الحضور", en: "4) Receive the check-in code" },
    description: {
      ar: "بعد تأكيد الحجز يحصل المستخدم على كود حضور مكوّن من 8 خانات لاستخدامه عند الوصول.",
      en: "After booking confirmation, the user receives an 8-character check-in code to use upon arrival.",
    },
  },
  {
    id: "step-5",
    icon: CheckCircle2,
    title: { ar: "5) التحقق والتشغيل", en: "5) Verification and operations" },
    description: {
      ar: "يقوم مدير الملعب أو موظف التشغيل بالتحقق من الكود لتسجيل الحضور وإتمام الرحلة التشغيلية.",
      en: "The court manager or operations staff verifies the code to complete check-in and the operational flow.",
    },
  },
]

const roleCards: {
  id: string
  icon: React.ElementType
  title: LangText
  description: LangText
  bullets: LangText[]
  tone: "primary" | "success" | "warning"
}[] = [
  {
    id: "role-player",
    icon: Star,
    title: { ar: "اللاعب", en: "Player" },
    description: {
      ar: "هذا هو المستخدم الذي يبحث عن الملاعب ويقوم بالحجز ويتابع مفضلاته وحجوزاته.",
      en: "This is the user who searches for courts, makes bookings, and tracks favorites and bookings.",
    },
    bullets: [
      {
        ar: "استعراض الملاعب ومراجعة التفاصيل قبل الحجز.",
        en: "Browse courts and review details before booking.",
      },
      {
        ar: "إنشاء الحجز ومتابعة حالته من لوحة التحكم.",
        en: "Create bookings and track their status from the dashboard.",
      },
      {
        ar: "إضافة الملاعب إلى المفضلة للرجوع إليها بسرعة.",
        en: "Add courts to favorites for quick access later.",
      },
    ],
    tone: "primary",
  },
  {
    id: "role-manager",
    icon: Building2,
    title: { ar: "مدير الملاعب", en: "Manager" },
    description: {
      ar: "يمتلك أدوات تشغيل تساعده على إدارة الملاعب والحجوزات والتحقق من الحضور.",
      en: "Has operational tools to manage courts, bookings, and check-in verification.",
    },
    bullets: [
      {
        ar: "إدارة الملاعب التابعة له ومتابعة بياناتها.",
        en: "Manage owned courts and track their information.",
      },
      {
        ar: "متابعة الحجوزات اليومية والحالات المرتبطة بها.",
        en: "Track daily bookings and their related statuses.",
      },
      {
        ar: "التحقق من كود الحضور داخل صفحة تسجيل الوصول.",
        en: "Verify the check-in code inside the check-in page.",
      },
    ],
    tone: "success",
  },
  {
    id: "role-admin",
    icon: Shield,
    title: { ar: "المشرف", en: "Admin" },
    description: {
      ar: "يمتلك رؤية شاملة على مستوى النظام لإدارة المستخدمين والملاعب والحجوزات.",
      en: "Has a full system-level view to manage users, courts, and bookings.",
    },
    bullets: [
      {
        ar: "إدارة المستخدمين داخل النظام.",
        en: "Manage users across the system.",
      },
      {
        ar: "متابعة الملاعب والحجوزات من منظور إداري شامل.",
        en: "Monitor courts and bookings from an overall administrative perspective.",
      },
      {
        ar: "الوصول إلى لوحات معلومات تساعد في المراقبة والمتابعة.",
        en: "Access dashboards that support monitoring and oversight.",
      },
    ],
    tone: "warning",
  },
]

const featureCards: {
  id: string
  icon: React.ElementType
  title: LangText
  description: LangText
}[] = [
  {
    id: "feature-auth",
    icon: Lock,
    title: { ar: "التسجيل والدخول", en: "Authentication" },
    description: {
      ar: "يتضمن المشروع صفحات تسجيل دخول وتسجيل وإنشاء حساب واسترجاع كلمة المرور.",
      en: "The project includes login, registration, account creation, and password recovery flows.",
    },
  },
  {
    id: "feature-browse",
    icon: Search,
    title: { ar: "استعراض الملاعب", en: "Browse courts" },
    description: {
      ar: "يمكن للمستخدم تصفح الملاعب وعرض بيانات مثل الموقع والسعر والمواعيد والتفاصيل.",
      en: "Users can browse courts and review details such as location, price, schedule, and key information.",
    },
  },
  {
    id: "feature-booking",
    icon: Calendar,
    title: { ar: "إدارة الحجز", en: "Booking flow" },
    description: {
      ar: "تشمل الرحلة اختيار الموعد المناسب، تأكيد الحجز، ومتابعة الحالة داخل لوحة المستخدم.",
      en: "The journey includes choosing a suitable time, confirming the booking, and tracking status inside the dashboard.",
    },
  },
  {
    id: "feature-favorites",
    icon: Heart,
    title: { ar: "المفضلة", en: "Favorites" },
    description: {
      ar: "تسمح هذه الميزة بحفظ الملاعب المفضلة للرجوع إليها لاحقًا بسرعة.",
      en: "This feature allows users to save favorite courts for fast return later.",
    },
  },
  {
    id: "feature-checkin",
    icon: QrCode,
    title: { ar: "كود الحضور", en: "Check-in code" },
    description: {
      ar: "بعد تأكيد الحجز يحصل المستخدم على كود حضور مكوّن من 8 خانات يتم التحقق منه عند الوصول.",
      en: "After booking confirmation, the user receives an 8-character check-in code that is verified on arrival.",
    },
  },
  {
    id: "feature-profile",
    icon: Settings2,
    title: { ar: "الملف الشخصي والإعدادات", en: "Profile and settings" },
    description: {
      ar: "يمكن للمستخدم إدارة بياناته الشخصية، تعديل كلمة المرور، والتحكم في بعض إعدادات التجربة.",
      en: "Users can manage personal data, update their password, and control parts of the experience settings.",
    },
  },
  {
    id: "feature-language",
    icon: Globe,
    title: { ar: "دعم اللغات", en: "Language support" },
    description: {
      ar: "الواجهة مصممة لتعمل بسلاسة بالعربية والإنجليزية مع اتجاه مناسب لكل لغة.",
      en: "The interface is designed to work smoothly in Arabic and English with the proper layout direction for each language.",
    },
  },
  {
    id: "feature-ui",
    icon: Sparkles,
    title: { ar: "واجهة حديثة ومنظمة", en: "Clean modern UI" },
    description: {
      ar: "يعتمد المشروع على بطاقات ولوحات واضحة لتقديم تجربة استخدام مريحة وسهلة الفهم.",
      en: "The project relies on clean cards and dashboards to deliver a clear and user-friendly experience.",
    },
  },
]

const projectSections: {
  id: string
  icon: React.ElementType
  title: LangText
  description: LangText
  points: LangText[]
}[] = [
  {
    id: "section-player",
    icon: Users,
    title: { ar: "تجربة اللاعب داخل المشروع", en: "Player experience inside the project" },
    description: {
      ar: "هذه الرحلة تركّز على المستخدم النهائي الذي يريد العثور على ملعب مناسب ثم إتمام الحجز بسهولة.",
      en: "This journey focuses on the end user who wants to find the right court and complete a booking easily.",
    },
    points: [
      {
        ar: "الدخول إلى صفحة تصفح الملاعب واستعراض الخيارات المتاحة.",
        en: "Enter the court browsing page and review available options.",
      },
      {
        ar: "فتح صفحة تفاصيل الملعب لمراجعة المعلومات والصور والمواعيد.",
        en: "Open the court details page to review information, images, and schedule.",
      },
      {
        ar: "إتمام الحجز ثم متابعة الكود والحالة من صفحة الحجوزات.",
        en: "Complete the booking, then track the code and status from the bookings page.",
      },
    ],
  },
  {
    id: "section-manager",
    icon: Layers,
    title: { ar: "تجربة مدير الملاعب", en: "Manager experience" },
    description: {
      ar: "هذا الجزء يركز على التشغيل اليومي للملاعب وإدارة الحجوزات والتحقق من الوصول.",
      en: "This part focuses on daily court operations, booking management, and arrival verification.",
    },
    points: [
      {
        ar: "متابعة الملاعب الخاصة به من لوحة المدير.",
        en: "Track owned courts from the manager dashboard.",
      },
      {
        ar: "مراجعة الحجوزات الحالية والسابقة وحالاتها المختلفة.",
        en: "Review current and past bookings and their different statuses.",
      },
      {
        ar: "استخدام صفحة check-in للتحقق من كود الحضور وتسجيل الوصول.",
        en: "Use the check-in page to verify the booking code and complete check-in.",
      },
    ],
  },
  {
    id: "section-admin",
    icon: Shield,
    title: { ar: "تجربة المشرف", en: "Admin experience" },
    description: {
      ar: "المشرف يدير المنصة من منظور أعلى ويملك صفحات إدارية لمتابعة الكيانات الأساسية.",
      en: "The admin manages the platform from a higher-level perspective and has administrative pages for core entities.",
    },
    points: [
      {
        ar: "إدارة المستخدمين داخل النظام.",
        en: "Manage users across the system.",
      },
      {
        ar: "متابعة الملاعب والحجوزات بشكل شامل.",
        en: "Monitor courts and bookings comprehensively.",
      },
      {
        ar: "الوصول إلى لوحة إدارية تدعم المتابعة والتحكم العام.",
        en: "Access an admin dashboard that supports overall monitoring and control.",
      },
    ],
  },
]

const faqItems: {
  id: string
  question: LangText
  answer: LangText
}[] = [
  {
    id: "faq-1",
    question: { ar: "ما الهدف من صفحة المساعدة الجديدة؟", en: "What is the purpose of the new help page?" },
    answer: {
      ar: "تم تحويل الصفحة من مركز دعم تقليدي إلى دليل مشروع واضح يشرح المنتج نفسه بدل عرض قنوات تواصل أو دعم مباشر.",
      en: "The page was transformed from a traditional support center into a clear project guide that explains the product itself instead of showing direct support channels.",
    },
  },
  {
    id: "faq-2",
    question: { ar: "من هم المستخدمون الأساسيون في المشروع؟", en: "Who are the main users of the project?" },
    answer: {
      ar: "المستخدمون الأساسيون هم اللاعب، مدير الملاعب، والمشرف، وكل واحد منهم يملك تجربة وصلاحيات مختلفة داخل النظام.",
      en: "The main users are the player, court manager, and admin, and each one has a different experience and permissions inside the system.",
    },
  },
  {
    id: "faq-3",
    question: { ar: "كيف يعمل الحجز داخل المنصة؟", en: "How does booking work inside the platform?" },
    answer: {
      ar: "يستعرض اللاعب الملاعب، يختار ملعبًا وموعدًا مناسبًا، ينشئ الحجز، ثم يحصل بعد التأكيد على كود حضور لمتابعة الوصول.",
      en: "The player browses courts, selects a suitable court and time, creates the booking, and after confirmation receives a check-in code for arrival verification.",
    },
  },
  {
    id: "faq-4",
    question: { ar: "ما هو كود الحضور؟", en: "What is the check-in code?" },
    answer: {
      ar: "هو كود مكوّن من 8 خانات يُستخدم للتحقق من الحجز عند الوصول إلى الملعب.",
      en: "It is an 8-character code used to verify the booking when arriving at the court.",
    },
  },
  {
    id: "faq-5",
    question: { ar: "هل الصفحة تدعم العربية والإنجليزية؟", en: "Does the page support Arabic and English?" },
    answer: {
      ar: "نعم، الصفحة والمشروع يدعمان اللغتين مع اتجاه مناسب لكل لغة داخل الواجهة.",
      en: "Yes, both the page and the project support both languages with the proper layout direction for each one.",
    },
  },
  {
    id: "faq-6",
    question: { ar: "هل هذه الصفحة تعرض الدعم المباشر؟", en: "Does this page show direct support channels?" },
    answer: {
      ar: "لا، تم حذف أقسام مثل Find answers in seconds وLive chat وCall us وغيرها، لتكون الصفحة دليلًا نظيفًا ومنظمًا للمشروع فقط.",
      en: "No. Sections like Find answers in seconds, Live chat, Call us, and similar support blocks were removed so the page stays a clean project guide only.",
    },
  },
]

function toneClasses(tone: "primary" | "success" | "warning") {
  switch (tone) {
    case "success":
      return {
        icon: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/15",
        border: "border-emerald-500/20",
        badge: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      }
    case "warning":
      return {
        icon: "bg-amber-500/10 text-amber-600 ring-amber-500/15",
        border: "border-amber-500/20",
        badge: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      }
    default:
      return {
        icon: "bg-primary/10 text-primary ring-primary/15",
        border: "border-primary/20",
        badge: "bg-primary/10 text-primary",
      }
  }
}

export function HelpPage() {
  const { language, direction } = useLanguage()
  const lang = (language === "ar" ? "ar" : "en") as "ar" | "en"
  const dir = direction ?? (lang === "ar" ? "rtl" : "ltr")

  return (
    <div dir={dir} className="space-y-6">
      <AnimatedContainer animation="fade-up">
        <PageHeader
          title={lang === "ar" ? "مركز المساعدة" : "Help Center"}
          description={
            lang === "ar"
              ? "نحن هنا لمساعدتك. ابحث عن إجابات لأسئلتك أو تواصل مع فريق الدعم."
              : "We're here to help. Find answers to your questions or contact our support team."
          }
        />
      </AnimatedContainer>

      <AnimatedContainer animation="fade-up" delay={80}>
        <div className="relative overflow-hidden rounded-[32px] border border-border/40 bg-card/60 shadow-sm">
          <div className="absolute inset-0 bg-linear-to-br from-primary/[0.08] via-transparent to-transparent pointer-events-none" />
          <div className="relative px-6 py-10 sm:px-10 sm:py-16 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-primary/10 text-primary mb-6 ring-1 ring-primary/20">
              <LifeBuoy className="h-8 w-8" />
            </div>
            <h2 className="text-3xl font-black tracking-tight sm:text-4xl text-foreground">
              {lang === "ar" ? "كيف يمكننا مساعدتك اليوم؟" : "How can we help you today?"}
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              {lang === "ar"
                ? "ابحث في دليل الاستخدام أو تصفح الأقسام أدناه للعثور على ما تبحث عنه بسرعة."
                : "Search our guide or browse the sections below to quickly find what you're looking for."}
            </p>

            <div className="mt-8 w-full max-w-xl relative">
              <div className="relative flex items-center w-full">
                <Search className={cn("absolute h-5 w-5 text-muted-foreground", dir === "rtl" ? "right-4" : "left-4")} />
                <Input
                  type="text"
                  placeholder={lang === "ar" ? "ابحث عن مشكلة أو مقال..." : "Search for an issue or article..."}
                  className={cn(
                    "h-14 w-full rounded-full border-border/60 bg-background/80 text-base shadow-xs backdrop-blur-md transition-colors focus-visible:border-primary/50 focus-visible:ring-primary/20",
                    dir === "rtl" ? "pr-12 pl-32" : "pl-12 pr-32"
                  )}
                />
                <Button 
                  className={cn("absolute h-10 rounded-full px-6 font-bold", dir === "rtl" ? "left-2" : "right-2")}
                >
                  {lang === "ar" ? "بحث" : "Search"}
                </Button>
              </div>
            </div>
            
            <div className="mt-8 flex flex-wrap justify-center gap-2">
              {["الحجوزات", "إنشاء حساب", "كود الحضور", "استرداد الأموال"].map((tag, i) => (
                <Badge key={i} variant="secondary" className="rounded-full bg-background/60 hover:bg-background/80 px-3 py-1 text-xs font-medium cursor-pointer transition-colors border-border/40">
                  {lang === "ar" ? tag : ["Bookings", "Sign up", "Check-in code", "Refunds"][i]}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </AnimatedContainer>

      <AnimatedContainer animation="fade-up" delay={120}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((item) => {
            const Icon = item.icon
            return (
              <Card
                key={item.id}
                className="rounded-3xl border-border/60 bg-card/70 shadow-sm transition-all hover:-translate-y-[1px] hover:shadow-md"
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-black">{t(item.title, lang)}</p>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {t(item.description, lang)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </AnimatedContainer>

      <AnimatedContainer animation="fade-up" delay={160}>
        <Card className="rounded-3xl border-border/60 bg-card/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg font-black">
              <Calendar className="h-5 w-5 text-primary" />
              {lang === "ar" ? "كيف تعمل المنصة؟" : "How the platform works"}
            </CardTitle>
            <CardDescription>
              {lang === "ar"
                ? "رحلة الاستخدام الأساسية من التسجيل حتى التحقق من الحضور."
                : "The main user journey from registration to check-in verification."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-5">
              {journeySteps.map((step, index) => {
                const Icon = step.icon
                return (
                  <div
                    key={step.id}
                    className="relative rounded-3xl border border-border/60 bg-background/60 p-4 shadow-sm"
                  >
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <p className="mt-4 font-black">{t(step.title, lang)}</p>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">
                      {t(step.description, lang)}
                    </p>

                    {index !== journeySteps.length - 1 && (
                      <div className="pointer-events-none absolute -end-2 top-1/2 hidden h-px w-4 -translate-y-1/2 bg-border xl:block" />
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </AnimatedContainer>

      <AnimatedContainer animation="fade-up" delay={200}>
        <Card className="rounded-3xl border-border/60 bg-card/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg font-black">
              <Users className="h-5 w-5 text-primary" />
              {lang === "ar" ? "الأدوار داخل النظام" : "Roles inside the system"}
            </CardTitle>
            <CardDescription>
              {lang === "ar"
                ? "كل دور له واجهته وصلاحياته ومسار عمله الخاص."
                : "Each role has its own interface, permissions, and workflow."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-3">
              {roleCards.map((role) => {
                const Icon = role.icon
                const tone = toneClasses(role.tone)

                return (
                  <Card
                    key={role.id}
                    className={cn("rounded-3xl border bg-background/60 shadow-sm", tone.border)}
                  >
                    <CardContent className="p-5">
                      <div className={cn("flex h-12 w-12 items-center justify-center rounded-2xl ring-1", tone.icon)}>
                        <Icon className="h-5 w-5" />
                      </div>

                      <div className="mt-4">
                        <Badge className={cn("rounded-2xl border-0", tone.badge)}>
                          {t(role.title, lang)}
                        </Badge>
                      </div>

                      <h3 className="mt-3 text-base font-black sm:text-lg">
                        {t(role.title, lang)}
                      </h3>
                      <p className="mt-2 text-sm leading-6 text-muted-foreground">
                        {t(role.description, lang)}
                      </p>

                      <Separator className="my-4 opacity-60" />

                      <div className="space-y-3">
                        {role.bullets.map((bullet, index) => (
                          <div key={index} className="flex items-start gap-2">
                            <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">
                              {t(bullet, lang)}
                            </p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </AnimatedContainer>

      <AnimatedContainer animation="fade-up" delay={240}>
        <div className="space-y-6 pt-6">
          <div className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-xl font-black text-foreground">
              <Sparkles className="h-6 w-6 text-primary" />
              {lang === "ar" ? "ماذا يتضمن المشروع؟" : "What the project includes"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? "أهم الصفحات والمزايا الأساسية داخل المنصة."
                : "The main pages and core features inside the platform."}
            </p>
          </div>
          
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {featureCards.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.id}
                  className="rounded-3xl bg-card/40 p-5 transition-all hover:-translate-y-[1px] hover:bg-card/80 border border-transparent hover:border-border/60 hover:shadow-sm"
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <p className="mt-4 font-black">{t(feature.title, lang)}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {t(feature.description, lang)}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </AnimatedContainer>

      <AnimatedContainer animation="fade-up" delay={280}>
        <div className="grid gap-4 xl:grid-cols-3">
          {projectSections.map((section) => {
            const Icon = section.icon
            return (
              <Card
                key={section.id}
                className="rounded-3xl border-border/60 bg-card/70 shadow-sm"
              >
                <CardHeader className="pb-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <CardTitle className="pt-3 text-lg font-black">
                    {t(section.title, lang)}
                  </CardTitle>
                  <CardDescription className="text-sm leading-6">
                    {t(section.description, lang)}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {section.points.map((point, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {t(point, lang)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </AnimatedContainer>

      <AnimatedContainer animation="fade-up" delay={320}>
        <div className="space-y-6 pt-6">
          <div className="flex flex-col gap-2">
            <h2 className="flex items-center gap-2 text-xl font-black text-foreground">
              <BookOpen className="h-6 w-6 text-primary" />
              {lang === "ar" ? "الأسئلة الشائعة" : "Frequently Asked Questions"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {lang === "ar"
                ? "إجابات سريعة لأكثر الأسئلة تداولاً."
                : "Quick answers to the most common questions."}
            </p>
          </div>
          
          <Accordion type="single" collapsible className="space-y-3 w-full max-w-3xl">
            {faqItems.map((faq) => (
              <AccordionItem
                key={faq.id}
                value={faq.id}
                className="rounded-2xl border-none bg-card/40 px-5 data-[state=open]:bg-card/80 transition-colors"
              >
                <AccordionTrigger className="py-5 text-start hover:no-underline">
                  <p className="font-bold leading-7">{t(faq.question, lang)}</p>
                </AccordionTrigger>
                <AccordionContent className="pb-5">
                  <p className="text-sm leading-7 text-muted-foreground">
                    {t(faq.answer, lang)}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </AnimatedContainer>

      <AnimatedContainer animation="fade-up" delay={360}>
        <div className="mt-10 rounded-[32px] border border-primary/20 bg-primary/5 p-8 sm:p-12 text-center">
          <h2 className="text-2xl font-black text-foreground">
            {lang === "ar" ? "هل تحتاج لمزيد من المساعدة؟" : "Need more help?"}
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {lang === "ar" ? "فريق الدعم لدينا متاح دائماً للإجابة على استفساراتك." : "Our support team is always available to answer your inquiries."}
          </p>
          
          <div className="mt-8 grid gap-4 sm:grid-cols-3 max-w-4xl mx-auto">
            <div className="flex flex-col items-center rounded-3xl bg-background p-6 shadow-sm border border-border/40 hover:border-primary/40 transition-colors cursor-pointer">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MessageCircle className="h-6 w-6" />
              </div>
              <p className="mt-4 font-bold">{lang === "ar" ? "واتساب" : "WhatsApp"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "رد سريع" : "Fast response"}</p>
            </div>
            
            <div className="flex flex-col items-center rounded-3xl bg-background p-6 shadow-sm border border-border/40 hover:border-primary/40 transition-colors cursor-pointer">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Mail className="h-6 w-6" />
              </div>
              <p className="mt-4 font-bold">{lang === "ar" ? "البريد الإلكتروني" : "Email"}</p>
              <p className="mt-1 text-xs text-muted-foreground">support@mal3bk.com</p>
            </div>
            
            <div className="flex flex-col items-center rounded-3xl bg-background p-6 shadow-sm border border-border/40 hover:border-primary/40 transition-colors cursor-pointer">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Bug className="h-6 w-6" />
              </div>
              <p className="mt-4 font-bold">{lang === "ar" ? "الإبلاغ عن مشكلة" : "Report an Issue"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{lang === "ar" ? "الدعم الفني" : "Technical support"}</p>
            </div>
          </div>
        </div>
      </AnimatedContainer>
    </div>
  )
}