"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Eye,
  EyeOff,
  Loader2,
  Shield,
  Zap,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react";

import { AuthNavbar } from "@/components/auth/auth-navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";
import { AnimatedContainer } from "@/components/ui/animated-container";
import { cn } from "@/lib/utils";
import { ApiError, NetworkError } from "@/lib/api";
import {
  buildPasswordSchema,
  getPasswordStrength,
  passwordStrengthColors,
  getPasswordRequirements,
} from "@/lib/password-validation";
import { getDefaultDashboardPath } from "@/lib/auth-routing";

type RegisterFormData = {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
};

function buildRegisterSchema(lang: "ar" | "en") {
  const msgs =
    lang === "ar"
      ? {
          nameMin: "الاسم يجب أن يكون حرفين على الأقل",
          emailInvalid: "البريد الإلكتروني غير صالح",
          phoneInvalid: "أدخل رقماً صالحاً (10-15 رقماً فقط)",
          confirmMismatch: "كلمات المرور غير متطابقة",
        }
      : {
          nameMin: "Name must be at least 2 characters",
          emailInvalid: "Invalid email address",
          phoneInvalid: "Enter a valid number (10-15 digits only)",
          confirmMismatch: "Passwords do not match",
        };

  return z
    .object({
      name: z.string().trim().min(2, msgs.nameMin),
      email: z.string().trim().email(msgs.emailInvalid),
      phone: z.string().refine((value) => {
        const digits = value.replace(/\D/g, "");
        return digits.length >= 10 && digits.length <= 15;
      }, msgs.phoneInvalid),
      password: buildPasswordSchema(lang),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: msgs.confirmMismatch,
      path: ["confirmPassword"],
    });
}

const InfoSlider = ({ language }: { language: "ar" | "en" }) => {
  const [current, setCurrent] = useState(0);
  
  useEffect(() => {
    const prefersReducedMotion =
      typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const timer = setInterval(() => setCurrent(s => (s + 1) % 3), 3000);
    return () => clearInterval(timer);
  }, []);

  const slides = [
    {
      icon: Zap,
      title: language === "ar" ? "ابدأ حسابك بسهولة" : "Start with a clear profile",
      desc: language === "ar" ? "أنشئ حسابك مرة واحدة لتصبح بياناتك جاهزة عند الحجز أو الانضمام لأي نشاط." : "Create one profile so your details are ready when you book or join an activity."
    },
    {
      icon: Calendar,
      title: language === "ar" ? "اكتشف ملاعب مناسبة" : "Find courts that fit",
      desc: language === "ar" ? "بعد التسجيل يمكنك الوصول إلى الملاعب، الأوقات المتاحة، والتفاصيل التي تساعدك تختار بسرعة." : "After signup, browse courts, available times, and details that help you choose faster."
    },
    {
      icon: Shield,
      title: language === "ar" ? "جاهز للحجوزات القادمة" : "Ready for future bookings",
      desc: language === "ar" ? "ابدأ من حساب منظم يحفظ نشاطك ويسهّل عليك الرجوع لكل حجز لاحقاً." : "Begin with an organized account that keeps your activity and future bookings easy to revisit."
    }
  ];

  return (
    <div className="w-full flex flex-col items-center justify-center pt-8">
      <div className="relative w-full overflow-hidden h-[240px]">
        <div 
          className="absolute inset-0 flex transition-transform duration-700 ease-out motion-reduce:transition-none [will-change:transform]"
          dir="ltr"
          style={{ transform: `translate3d(-${current * 100}%, 0, 0)` }}
        >
          {slides.map((slide, idx) => {
            const Icon = slide.icon;
            return (
            <div key={idx} className="w-full flex-shrink-0 flex flex-col items-center justify-center text-center px-4" dir={language === "ar" ? "rtl" : "ltr"}>
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 shadow-sm">
                <Icon className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-[1.35rem] md:text-2xl font-bold text-foreground tracking-tight">{slide.title}</h3>
              <p className="text-muted-foreground mt-3 text-[15px] leading-relaxed max-w-xs">{slide.desc}</p>
            </div>
            );
          })}
        </div>
      </div>
      
      {/* Carousel Indicators */}
      <div className="flex items-center justify-center gap-2 mt-4">
        {slides.map((_, idx) => (
          <button 
            key={idx}
            onClick={() => setCurrent(idx)}
            className={cn(
              "h-2 rounded-full transition-all duration-300",
              current === idx ? "w-8 bg-primary" : "w-2 bg-primary/20 hover:bg-primary/40"
            )}
            aria-label={language === "ar" ? `الانتقال إلى الشريحة ${idx + 1}` : `Go to slide ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export function RegisterForm() {
  const { language, direction } = useLanguage();
  const { register: registerUser, user, isLoading, isServerOffline } = useAuth();

  const currentLang = language === "ar" ? "ar" : "en";
  const schema = useMemo(() => buildRegisterSchema(currentLang), [currentLang]);

  const [isHydrated, setIsHydrated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const navigatedRef = useRef(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Already-logged-in fallback (e.g. user navigates back to /auth/register).
  // Hard navigation — see the matching block in login-form.tsx for why.
  useEffect(() => {
    if (navigatedRef.current) return;
    if (isLoading || !user) return;
    // Don't redirect while the server is unreachable — the stored user may be
    // stale, and bouncing to /dashboard would just loop back to login.
    if (isServerOffline) return;
    if (typeof window === "undefined") return;
    navigatedRef.current = true;
    window.location.assign(getDefaultDashboardPath(user.role));
  }, [isLoading, isServerOffline, user]);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterFormData) => {
    try {
      setSubmitError(null);
      const newUser = await registerUser({
        name: data.name.trim(),
        email: data.email.trim().toLowerCase(),
        phone: data.phone.replace(/\D/g, ""),
        password: data.password,
      });
      toast.success(
        language === "ar"
          ? "تم إنشاء الحساب وتسجيل الدخول بنجاح"
          : "Account created and signed in successfully",
      );

      if (typeof window !== "undefined") {
        navigatedRef.current = true;
        // Hard navigation — see login-form.tsx onSubmit for the rationale.
        window.location.assign(getDefaultDashboardPath(newUser.role));
      }
      return;
    } catch (err: any) {
      if (err instanceof NetworkError || err?.name === "NetworkError") {
        const message =
          language === "ar" ? "تعذر الوصول إلى الخادم. تحقق من الاتصال وحاول مرة أخرى." : "We couldn't reach the server. Check your connection and try again.";
        setSubmitError(message);
        toast.error(message);
        return;
      }

      if (err instanceof ApiError && err.status === 409) {
        const raw = (err.message || "").toLowerCase();
        const isPhone = raw.includes("phone");
        const msg = isPhone
          ? language === "ar" ? "رقم الهاتف مستخدم بالفعل" : "Phone number already in use"
          : language === "ar" ? "البريد الإلكتروني مستخدم بالفعل" : "Email already in use";
        setSubmitError(null);
        form.setError(isPhone ? "phone" : "email", { type: "server", message: msg });
        toast.error(msg);
        return;
      }
      const fallback =
        (err && typeof err.message === "string" && err.message) ||
        (language === "ar" ? "فشل إنشاء الحساب" : "Failed to create account");
      setSubmitError(fallback);
      toast.error(fallback);
    }
  };

  const passwordStrength = getPasswordStrength(password);


  return (
    <div className="relative min-h-screen bg-[#F8F9FB] dark:bg-background flex flex-col overflow-x-hidden font-sans">
      <AuthNavbar />
      <div className="h-20 md:h-24 shrink-0" />

      {/* Background Decorative */}
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />

      {/* Main Container */}
      <main className="relative z-10 flex-1 flex flex-col px-4 md:px-8 pt-4 pb-12 sm:pb-16 lg:py-5 xl:py-6">
        <div className="mx-auto w-full max-w-[1160px] 2xl:max-w-[1200px] my-auto">
          <div className="w-full animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both">
            <div dir="ltr" className="relative rounded-[2.5rem] md:rounded-[3rem] bg-white dark:bg-slate-950/40 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.4)] flex flex-col lg:flex-row overflow-hidden border border-border/60 dark:border-white/[0.15] dark:shadow-[0_0_40px_rgba(0,0,0,0.8)]">
              
              {/* Left Panel - Hidden on Mobile, Slider on Desktop */}
              <div className="hidden lg:flex w-full lg:w-[42%] p-8 md:px-12 md:py-8 lg:px-14 lg:py-8 flex-col justify-center relative items-center">
                <div className="absolute inset-0 bg-[#F2F5F8] dark:bg-muted/30" />
                <div className="absolute top-8 right-8 lg:top-12 lg:right-12 flex flex-wrap w-16 gap-2 opacity-60">
                   <div className="w-2 h-2 rounded-full bg-primary" />
                   <div className="w-1.5 h-1.5 rounded-full bg-info self-end" />
                   <div className="w-2.5 h-2.5 rounded-full bg-destructive/60" />
                </div>
                <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                   <InfoSlider language={language as "ar" | "en"} />
                </div>
              </div>

              {/* Right Panel - Form */}
              <div dir={direction} className="w-full lg:w-[58%] p-5 sm:p-8 md:px-14 md:py-10 lg:px-14 xl:px-16 lg:py-10 flex flex-col justify-center bg-white dark:bg-slate-950/80 dark:backdrop-blur-md relative z-20">
                <div className="text-center lg:text-start mb-6 sm:mb-10">
                  <h2 className="text-3xl md:text-[2.5rem] font-bold text-foreground tracking-tight leading-tight">
                    {language === "ar" ? "إنشاء حساب" : "Create Account"}
                  </h2>
                  <p className="text-[15px] text-muted-foreground mt-3 leading-relaxed max-w-lg mx-auto lg:mx-0">
                    {language === "ar" ? "انضم إلينا الآن للوصول إلى أفضل الملاعب والميزات الحصرية!" : "Join us now to access the best courts and exclusive features!"}
                  </p>
                </div>

                <div className={cn("pointer-events-none absolute inset-0 bg-background/35 transition-opacity z-50 rounded-[3rem]", form.formState.isSubmitting ? "opacity-100" : "opacity-0")} />

                <form onSubmit={(event) => { void form.handleSubmit(onSubmit)(event); }} className="space-y-3 sm:space-y-4">
                  {submitError && (
                    <AnimatedContainer animation="none" delay={100}>
                      <div className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3.5 text-destructive">
                        <Zap className="h-5 w-5 shrink-0" />
                        <span className="text-sm font-medium">{submitError}</span>
                      </div>
                    </AnimatedContainer>
                  )}

                  <AnimatedContainer animation="none">
                    <label htmlFor="register-name" className={cn("block text-[13px] font-semibold text-foreground/80 mb-2 px-1", language === "ar" ? "text-right" : "text-left")}>
                      {language === "ar" ? "الاسم الكامل" : "Full Name"}
                    </label>
                    <div className={cn("group relative rounded-2xl border transition-all duration-300", "border-border/50 bg-background dark:bg-white/[0.02] dark:border-white/[0.12] hover:border-border dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04] focus-within:border-primary focus-within:bg-background dark:focus-within:bg-white/[0.05] focus-within:ring-[3px] focus-within:ring-primary/10 shadow-sm", form.formState.isSubmitted && form.formState.errors.name && "border-destructive focus-within:border-destructive focus-within:ring-destructive/10")}>
                      <Input
                        id="register-name"
                        {...form.register("name")}
                        aria-invalid={form.formState.isSubmitted && !!form.formState.errors.name}
                        aria-describedby={form.formState.isSubmitted && form.formState.errors.name ? "register-name-error" : undefined}
                        placeholder={language === "ar" ? "الاسم الكامل" : "Full Name"}
                        className={cn("h-12 sm:h-14 border-0 bg-transparent px-5 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 text-base md:text-[15px]", language === "ar" ? "text-right" : "text-left")}
                        onFocus={() => { if (submitError) setSubmitError(null); }}
                      />
                    </div>
                    {form.formState.isSubmitted && form.formState.errors.name && (<p id="register-name-error" role="alert" className="text-xs text-destructive mt-1.5 ms-2 font-medium">{form.formState.errors.name.message}</p>)}
                  </AnimatedContainer>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <AnimatedContainer animation="none" delay={50}>
                      <label htmlFor="register-email" className={cn("block text-[13px] font-semibold text-foreground/80 mb-2 px-1", language === "ar" ? "text-right" : "text-left")}>
                        {language === "ar" ? "البريد الإلكتروني" : "Email"}
                      </label>
                      <div className={cn("group relative rounded-2xl border transition-all duration-300", "border-border/50 bg-background dark:bg-white/[0.02] dark:border-white/[0.12] hover:border-border dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04] focus-within:border-primary focus-within:bg-background dark:focus-within:bg-white/[0.05] focus-within:ring-[3px] focus-within:ring-primary/10 shadow-sm", form.formState.isSubmitted && form.formState.errors.email && "border-destructive focus-within:border-destructive focus-within:ring-destructive/10")}>
                        <Input
                          id="register-email"
                          {...form.register("email")}
                          type="email"
                          inputMode="email"
                          aria-invalid={form.formState.isSubmitted && !!form.formState.errors.email}
                          aria-describedby={form.formState.isSubmitted && form.formState.errors.email ? "register-email-error" : undefined}
                          placeholder={language === "ar" ? "البريد الإلكتروني" : "Email"}
                          className={cn("h-12 sm:h-14 border-0 bg-transparent px-5 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 text-base md:text-[15px]", language === "ar" ? "text-right" : "text-left")}
                          onFocus={() => { if (submitError) setSubmitError(null); }}
                        />
                      </div>
                      {form.formState.isSubmitted && form.formState.errors.email && (<p id="register-email-error" role="alert" className="text-xs text-destructive mt-1.5 ms-2 font-medium">{form.formState.errors.email.message}</p>)}
                    </AnimatedContainer>

                    <AnimatedContainer animation="none" delay={100}>
                      <label htmlFor="register-phone" className={cn("block text-[13px] font-semibold text-foreground/80 mb-2 px-1", language === "ar" ? "text-right" : "text-left")}>
                        {language === "ar" ? "رقم الهاتف" : "Phone Number"}
                      </label>
                      <div className={cn("group relative rounded-2xl border transition-all duration-300", "border-border/50 bg-background dark:bg-white/[0.02] dark:border-white/[0.12] hover:border-border dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04] focus-within:border-primary focus-within:bg-background dark:focus-within:bg-white/[0.05] focus-within:ring-[3px] focus-within:ring-primary/10 shadow-sm", form.formState.isSubmitted && form.formState.errors.phone && "border-destructive focus-within:border-destructive focus-within:ring-destructive/10")}>
                        <Input
                          id="register-phone"
                          {...form.register("phone", { onChange: (e) => { const val = e.target.value.replace(/\D/g, ""); e.target.value = val; form.setValue("phone", val); } })}
                          type="tel"
                          inputMode="tel"
                          aria-invalid={form.formState.isSubmitted && !!form.formState.errors.phone}
                          aria-describedby={form.formState.isSubmitted && form.formState.errors.phone ? "register-phone-error" : undefined}
                          placeholder={language === "ar" ? "رقم الهاتف" : "Phone Number"}
                          className={cn("h-12 sm:h-14 border-0 bg-transparent px-5 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 text-base md:text-[15px]", language === "ar" ? "text-right" : "text-left")}
                          onFocus={() => { if (submitError) setSubmitError(null); }}
                        />
                      </div>
                      {form.formState.isSubmitted && form.formState.errors.phone && (<p id="register-phone-error" role="alert" className="text-xs text-destructive mt-1.5 ms-2 font-medium">{form.formState.errors.phone.message}</p>)}
                    </AnimatedContainer>
                  </div>

                  <AnimatedContainer animation="none" delay={150}>
                    <label htmlFor="register-password" className={cn("block text-[13px] font-semibold text-foreground/80 mb-2 px-1", language === "ar" ? "text-right" : "text-left")}>
                      {language === "ar" ? "كلمة المرور" : "Password"}
                    </label>
                    <div className={cn("group relative rounded-2xl border transition-all duration-300", "border-border/50 bg-background dark:bg-white/[0.02] dark:border-white/[0.12] hover:border-border dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04] focus-within:border-primary focus-within:bg-background dark:focus-within:bg-white/[0.05] focus-within:ring-[3px] focus-within:ring-primary/10 shadow-sm", form.formState.isSubmitted && form.formState.errors.password && "border-destructive focus-within:border-destructive focus-within:ring-destructive/10")}>
                      <Input
                        id="register-password"
                        {...form.register("password", { onChange: (e) => setPassword(e.target.value) })}
                        type={showPassword ? "text" : "password"}
                        aria-invalid={form.formState.isSubmitted && !!form.formState.errors.password}
                        aria-describedby={form.formState.isSubmitted && form.formState.errors.password ? "register-password-error" : undefined}
                        placeholder={language === "ar" ? "كلمة المرور" : "Password"}
                        className={cn("h-12 sm:h-14 border-0 bg-transparent px-5 pe-12 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 text-base md:text-[15px]", language === "ar" ? "text-right" : "text-left")}
                        onFocus={() => { if (submitError) setSubmitError(null); }}
                      />
                      <Button type="button" variant="ghost" size="icon" className="absolute end-1.5 top-1/2 -translate-y-1/2 h-11 w-11 rounded-xl hover:bg-muted text-muted-foreground transition-colors" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility">
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </Button>
                    </div>
                    {password.length > 0 && (
                      <div className="mt-2.5 flex gap-1.5 px-1">
                        {[0, 1, 2, 3].map((level) => (<div key={level} className={cn("h-1.5 flex-1 rounded-full transition-all duration-300", level < passwordStrength ? passwordStrengthColors[passwordStrength] : "bg-muted")} />))}
                      </div>
                    )}
                    {password.length > 0 && (
                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 px-1">
                        {getPasswordRequirements(password, currentLang).map((req, idx) => (
                          <div key={idx} className={cn("flex items-center gap-1.5 text-xs transition-colors duration-300", req.met ? "text-emerald-500" : "text-muted-foreground/70")}>
                            {req.met ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                            <span className={cn("font-medium", req.met && "line-through opacity-80")}>{req.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {form.formState.isSubmitted && form.formState.errors.password && (<p id="register-password-error" role="alert" className="text-xs text-destructive mt-1.5 ms-2 font-medium">{form.formState.errors.password.message}</p>)}
                  </AnimatedContainer>

                  <AnimatedContainer animation="none" delay={200}>
                    <label htmlFor="register-confirm-password" className={cn("block text-[13px] font-semibold text-foreground/80 mb-2 px-1", language === "ar" ? "text-right" : "text-left")}>
                      {language === "ar" ? "تأكيد كلمة المرور" : "Confirm Password"}
                    </label>
                    <div className={cn("group relative rounded-2xl border transition-all duration-300", "border-border/50 bg-background dark:bg-white/[0.02] dark:border-white/[0.12] hover:border-border dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04] focus-within:border-primary focus-within:bg-background dark:focus-within:bg-white/[0.05] focus-within:ring-[3px] focus-within:ring-primary/10 shadow-sm", form.formState.isSubmitted && form.formState.errors.confirmPassword && "border-destructive focus-within:border-destructive focus-within:ring-destructive/10")}>
                      <Input
                        id="register-confirm-password"
                        {...form.register("confirmPassword")}
                        type={showConfirmPassword ? "text" : "password"}
                        aria-invalid={form.formState.isSubmitted && !!form.formState.errors.confirmPassword}
                        aria-describedby={form.formState.isSubmitted && form.formState.errors.confirmPassword ? "register-confirm-password-error" : undefined}
                        placeholder={language === "ar" ? "تأكيد كلمة المرور" : "Confirm Password"}
                        className={cn("h-12 sm:h-14 border-0 bg-transparent px-5 pe-12 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 text-base md:text-[15px]", language === "ar" ? "text-right" : "text-left")}
                        onFocus={() => { if (submitError) setSubmitError(null); }}
                      />
                      <Button type="button" variant="ghost" size="icon" className="absolute end-1.5 top-1/2 -translate-y-1/2 h-11 w-11 rounded-xl hover:bg-muted text-muted-foreground transition-colors" onClick={() => setShowConfirmPassword((v) => !v)} aria-label="Toggle password visibility">
                        {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </Button>
                    </div>
                    {form.formState.isSubmitted && form.formState.errors.confirmPassword && (<p id="register-confirm-password-error" role="alert" className="text-xs text-destructive mt-1.5 ms-2 font-medium">{form.formState.errors.confirmPassword.message}</p>)}
                  </AnimatedContainer>

                  <AnimatedContainer animation="none" delay={250}>
                    <Button type={isHydrated ? "submit" : "button"} data-auth-submit="register" className="w-full h-12 sm:h-14 mt-2 sm:mt-4 rounded-2xl font-bold text-[15px] shadow-[0_12px_28px_rgba(13,71,161,0.22)] hover:shadow-[0_16px_34px_rgba(13,71,161,0.3)] hover:-translate-y-0.5 transition-all duration-300" disabled={!isHydrated || form.formState.isSubmitting}>
                      {!isHydrated ? (<Loader2 className="h-5 w-5 animate-spin" />) : form.formState.isSubmitting ? (<Loader2 className="h-5 w-5 animate-spin" />) : (language === "ar" ? "إنشاء حساب" : "Create account")}
                    </Button>
                  </AnimatedContainer>
                </form>

                <div className="mt-6 sm:mt-8 text-center text-[15px] text-muted-foreground">
                  {language === "ar" ? "لديك حساب بالفعل؟ " : "Already have an account? "}
                  <Link href="/auth/login" className="font-bold text-primary hover:text-primary/80 transition-colors">
                    {language === "ar" ? "تسجيل الدخول" : "Sign in"}
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
