"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Shield,
  Zap,
  Calendar,
} from "lucide-react";

import { AuthNavbar } from "@/components/auth/auth-navbar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { toast } from "sonner";
import { AnimatedContainer } from "@/components/ui/animated-container";
import { cn } from "@/lib/utils";
import { ApiError, NetworkError } from "@/lib/api";
import {
  getDefaultDashboardPath,
  sanitizeInternalRedirect,
  shouldAutoRedirectAuthenticatedAuthUser,
} from "@/lib/auth-routing";

type LoginFormData = {
  email: string;
  password: string;
};

const AUTH_REDIRECT_ATTEMPT_KEY = "mal3bk_auth_redirect_attempt";
const AUTH_REDIRECT_ATTEMPT_TTL_MS = 15_000;

function hasRecentRedirectAttempt(target: string) {
  if (typeof window === "undefined") return false;

  try {
    const raw = window.sessionStorage.getItem(AUTH_REDIRECT_ATTEMPT_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { target?: string; at?: number };
    return parsed.target === target && typeof parsed.at === "number" && Date.now() - parsed.at < AUTH_REDIRECT_ATTEMPT_TTL_MS;
  } catch {
    return false;
  }
}

function markRedirectAttempt(target: string) {
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.setItem(AUTH_REDIRECT_ATTEMPT_KEY, JSON.stringify({ target, at: Date.now() }));
  } catch {}
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
      icon: Calendar,
      title: language === "ar" ? "حجوزاتك في مكان واحد" : "Your bookings in one place",
      desc: language === "ar" ? "ادخل بسرعة لمراجعة مواعيدك القادمة، تفاصيل الملعب، وحالة الحجز بدون بحث طويل." : "Sign in to review upcoming games, court details, and booking status without extra searching."
    },
    {
      icon: Shield,
      title: language === "ar" ? "دخول آمن وسلس" : "Secure, smooth access",
      desc: language === "ar" ? "نحافظ على جلسة حسابك محمية حتى تكمل إدارة حجوزاتك وبياناتك بثقة." : "Your account session stays protected while you manage bookings and personal details."
    },
    {
      icon: Zap,
      title: language === "ar" ? "ارجع للملعب أسرع" : "Get back to play faster",
      desc: language === "ar" ? "اختصر الطريق إلى لوحتك، دعواتك، وآخر نشاطاتك من نفس الحساب." : "Jump straight back to your dashboard, invitations, and recent activity from the same account."
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

export function LoginForm() {
  const { language, direction } = useLanguage();
  const { login, user, isLoading, isServerOffline, isSessionVerified } = useAuth();
  const searchParams = useSearchParams();

  const [isHydrated, setIsHydrated] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [, startTransition] = useTransition();
  const [rememberMe, setRememberMe] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const navigatedRef = useRef(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // If a logged-in user lands on /auth/login (e.g. via SPA link or by pressing Back
  // after we already redirected), bounce them out with a hard navigation. We use
  // window.location instead of router.replace because the freshly-issued auth
  // cookies have to attach to the next request — mobile Safari occasionally drops
  // them on a same-tick RSC navigation, which is the cause of the "page couldn't
  // load" / back-button auto-login bug.
  useEffect(() => {
    if (navigatedRef.current) return;
    const requestedRedirect = searchParams?.get("redirect");
    if (
      !shouldAutoRedirectAuthenticatedAuthUser({
        isLoading,
        hasUser: !!user,
        isServerOffline,
        isSessionVerified,
        requestedRedirect,
      })
    ) {
      return;
    }
    if (!user || typeof window === "undefined") return;

    const redirectTarget = sanitizeInternalRedirect(
      requestedRedirect,
      user.role,
      getDefaultDashboardPath(user.role),
    );

    if (hasRecentRedirectAttempt(redirectTarget)) return;

    navigatedRef.current = true;
    markRedirectAttempt(redirectTarget);
    window.location.assign(redirectTarget);
  }, [isLoading, isServerOffline, isSessionVerified, searchParams, user]);

  const messages = useMemo(
    () =>
      language === "ar"
        ? {
            emailInvalid: "البريد الإلكتروني غير صالح",
            passwordRequired: "أدخل كلمة المرور",
            networkError: "تعذر الوصول إلى الخادم. تحقق من الاتصال وحاول مرة أخرى.",
            timeoutError: "انتهت مهلة الطلب. حاول مرة أخرى.",
          }
        : {
            emailInvalid: "Invalid email address",
            passwordRequired: "Enter your password",
            networkError: "We couldn't reach the server. Check your connection and try again.",
            timeoutError: "The request timed out. Please try again.",
          },
    [language],
  );

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().trim().email(messages.emailInvalid),
        password: z.string().min(1, messages.passwordRequired),
      }),
    [messages.emailInvalid, messages.passwordRequired],
  );


  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitted, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    mode: "onSubmit",
    reValidateMode: "onSubmit",
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      setLoginError(null);
      const signedInUser = await login(data.email.trim().toLowerCase(), data.password, rememberMe);
      toast.success(language === "ar" ? "تم تسجيل الدخول بنجاح" : "Login successful");

      if (typeof window !== "undefined") {
        const redirectTarget = sanitizeInternalRedirect(
          searchParams?.get("redirect"),
          signedInUser.role,
          getDefaultDashboardPath(signedInUser.role),
        );

        navigatedRef.current = true;
        markRedirectAttempt(redirectTarget);
        // Hard navigation. Forces a fresh request so the just-set auth cookies
        // are guaranteed to be sent to the dashboard SSR — avoiding the iOS
        // Safari "page couldn't load" race that happened with router.replace().
        window.location.assign(redirectTarget);
      }
      return;
    } catch (err: any) {
      if (err instanceof NetworkError || err?.name === "NetworkError") {
        const message =
          typeof err?.message === "string" && err.message.toLowerCase().includes("timed out")
            ? messages.timeoutError
            : messages.networkError;
        setLoginError(message);
        toast.error(message);
        return;
      }

      if (err instanceof ApiError) {
        if (err.status === 401) {
          const msg =
            language === "ar" ? "البريد الإلكتروني أو كلمة المرور غير صحيحة" : "Incorrect email or password";
          setLoginError(msg);
          return;
        }

        if (err.status === 403) {
          const raw = (err.message || "").toLowerCase();
          const msg = raw.includes("inactive")
            ? language === "ar"
              ? "الحساب غير مفعل حالياً. تواصل مع الدعم أو الإدارة."
              : "Your account is inactive. Please contact support or the administrator."
            : raw.includes("csrf") || raw.includes("origin") || raw.includes("referer")
              ? language === "ar"
                ? "تعذر التحقق من طلب تسجيل الدخول على هذا المتصفح. أغلق الصفحة وافتح الموقع مباشرة ثم حاول مرة أخرى."
                : "We could not verify this sign-in request in this browser. Reopen the site directly and try again."
              : language === "ar"
                ? "تم رفض محاولة تسجيل الدخول. حاول مرة أخرى."
                : "This sign-in attempt was rejected. Please try again.";
          setLoginError(msg);
          return;
        }
      }
      const fallback =
        (err && typeof err.message === "string" && err.message) ||
        (language === "ar" ? "فشل تسجيل الدخول. تحقق من بياناتك." : "Login failed. Check your credentials.");
      setLoginError(fallback);
      toast.error(fallback);
    }
  };



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
                    {language === "ar" ? "تسجيل الدخول إلى" : "Welcome to"} <span className="text-primary">Mal3bk</span>
                  </h2>
                  <p className="text-[15px] text-muted-foreground mt-3 leading-relaxed max-w-lg mx-auto lg:mx-0">
                    {language === "ar" ? "سجل دخولك للوصول إلى العروض الحصرية، إدارة حجوزاتك، وتخطيط مباراتك القادمة بكل سهولة!" : "Login to access exclusive court deals, manage your bookings, and plan your next match hassle-free!"}
                  </p>
                </div>

                <div className={cn("pointer-events-none absolute inset-0 bg-background/35 transition-opacity z-50 rounded-[3rem]", isSubmitting ? "opacity-100" : "opacity-0")} />

                <form onSubmit={(event) => { void handleSubmit(onSubmit)(event); }} className="space-y-5">
                  {loginError && (
                    <AnimatedContainer animation="none" delay={150}>
                      <div role="alert" className="flex items-center gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3.5 text-destructive">
                        <AlertCircle className="h-5 w-5 shrink-0" />
                        <span className="text-sm font-medium">{loginError}</span>
                      </div>
                    </AnimatedContainer>
                  )}

                  <AnimatedContainer animation="none">
                    <label htmlFor="login-email" className={cn("block text-[13px] font-semibold text-foreground/80 mb-2 px-1", language === "ar" ? "text-right" : "text-left")}>
                      {language === "ar" ? "البريد الإلكتروني" : "Email"}
                    </label>
                    <div className={cn("group relative rounded-2xl border transition-all duration-300", "border-border/50 bg-background dark:bg-white/[0.02] dark:border-white/[0.12] hover:border-border dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04] focus-within:border-primary focus-within:bg-background dark:focus-within:bg-white/[0.05] focus-within:ring-[3px] focus-within:ring-primary/10 shadow-sm", isSubmitted && errors.email && "border-destructive focus-within:border-destructive focus-within:ring-destructive/10")}>
                      <Input
                        id="login-email"
                        {...register("email")}
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        placeholder={language === "ar" ? "البريد الإلكتروني" : "Email"}
                        aria-invalid={isSubmitted && !!errors.email}
                        aria-label="Email"
                        className={cn("h-12 sm:h-14 border-0 bg-transparent px-5 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 text-base md:text-[15px]", language === "ar" ? "text-right" : "text-left")}
                        onFocus={() => { if (loginError) setLoginError(null); }}
                      />
                    </div>
                    {isSubmitted && errors.email && (<p className="text-xs text-destructive mt-1.5 ms-2 font-medium">{errors.email.message}</p>)}
                  </AnimatedContainer>

                  <AnimatedContainer animation="none">
                    <label htmlFor="login-password" className={cn("block text-[13px] font-semibold text-foreground/80 mb-2 px-1", language === "ar" ? "text-right" : "text-left")}>
                      {language === "ar" ? "كلمة المرور" : "Password"}
                    </label>
                    <div className={cn("group relative rounded-2xl border transition-all duration-300", "border-border/50 bg-background dark:bg-white/[0.02] dark:border-white/[0.12] hover:border-border dark:hover:border-white/[0.1] dark:hover:bg-white/[0.04] focus-within:border-primary focus-within:bg-background dark:focus-within:bg-white/[0.05] focus-within:ring-[3px] focus-within:ring-primary/10 shadow-sm", isSubmitted && errors.password && "border-destructive focus-within:border-destructive focus-within:ring-destructive/10")}>
                      <Input
                        id="login-password"
                        {...register("password")}
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder={language === "ar" ? "كلمة المرور" : "Password"}
                        aria-invalid={isSubmitted && !!errors.password}
                        aria-label="Password"
                        className={cn("h-12 sm:h-14 border-0 bg-transparent px-5 pe-12 rounded-2xl focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-muted-foreground/60 text-base md:text-[15px]", language === "ar" ? "text-right" : "text-left")}
                        onFocus={() => { if (loginError) setLoginError(null); }}
                      />
                      <Button type="button" variant="ghost" size="icon" className="absolute end-1.5 top-1/2 -translate-y-1/2 h-11 w-11 rounded-xl hover:bg-muted text-muted-foreground transition-colors" onClick={() => startTransition(() => setShowPassword((v) => !v))} aria-label="Toggle password visibility">
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </Button>
                    </div>
                    {isSubmitted && errors.password && (<p className="text-xs text-destructive mt-1.5 ms-2 font-medium">{errors.password.message}</p>)}
                  </AnimatedContainer>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1 pb-2">
                    <label
                      htmlFor="remember-me"
                      dir={language === "ar" ? "rtl" : "ltr"}
                      className={cn(
                        "inline-flex min-h-11 cursor-pointer select-none items-center gap-2 px-1 text-sm font-semibold text-muted-foreground transition-all duration-200 hover:text-foreground",
                        "focus-within:ring-[3px] focus-within:ring-primary/10 rounded-xl",
                        isSubmitting && "cursor-not-allowed opacity-60",
                      )}
                    >
                      <Checkbox
                        id="remember-me"
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(checked === true)}
                        disabled={isSubmitting}
                        aria-label={language === "ar" ? "تذكرني" : "Remember me"}
                        className="h-5 w-5 rounded-full border-border/70 bg-white shadow-sm data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:bg-background"
                      />
                      <span>{language === "ar" ? "تذكرني" : "Remember me"}</span>
                    </label>
                    <Link href="/auth/forgot-password" className="inline-flex min-h-11 items-center rounded-2xl px-2 text-sm font-bold text-primary transition-colors hover:bg-primary/5 hover:text-primary/80">
                      {language === "ar" ? "نسيت كلمة المرور؟" : "Forgot Password?"}
                    </Link>
                  </div>

                  <AnimatedContainer animation="none" delay={100}>
                    <Button type={isHydrated ? "submit" : "button"} data-auth-submit="login" className="w-full h-12 sm:h-14 rounded-2xl font-bold text-[15px] shadow-[0_12px_28px_rgba(13,71,161,0.22)] hover:shadow-[0_16px_34px_rgba(13,71,161,0.3)] hover:-translate-y-0.5 transition-all duration-300" disabled={!isHydrated || isSubmitting}>
                      {!isHydrated ? (<Loader2 className="h-5 w-5 animate-spin" />) : isSubmitting ? (<Loader2 className="h-5 w-5 animate-spin" />) : (language === "ar" ? "تسجيل الدخول" : "Sign in")}
                    </Button>
                  </AnimatedContainer>
                </form>

                <div className="mt-6 sm:mt-8 text-center text-[15px] text-muted-foreground">
                  {language === "ar" ? "ليس لديك حساب؟ " : "Don't have an account? "}
                  <Link href="/auth/register" className="font-bold text-primary hover:text-primary/80 transition-colors">
                    {language === "ar" ? "سجل الآن" : "Sign up"}
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
