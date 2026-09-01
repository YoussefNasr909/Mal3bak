"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  Users,
  CreditCard,
  FileText,
  Settings,
  LogOut,
  Moon,
  Sun,
  Globe,
  Menu,
  X,
  Bell,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  CheckCircle2,
  HelpCircle,
  User,
  CalendarIcon,
  Info,
  Gift,
  Trophy,
  Tag,
  ShieldCheck,
  RefreshCcw,
  Mail,
  Phone,
  Instagram,
} from "lucide-react";

import { useTheme } from "next-themes";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/providers/language-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { SessionExpiredDialog } from "@/components/dashboard/session-expired-dialog";
import { HeaderLogo } from "@/components/branding/header-logo";
import { NotificationBell } from "@/components/dashboard/notification-bell";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AnimatedContainer } from "@/components/ui/animated-container";
import { Separator } from "@/components/ui/separator";

import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 256 256"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="currentColor"
        d="M197.6 80.9c-16.9-9.1-30.5-23.4-38.4-40.9h-28.7v122.7c0 23.1-18.7 41.9-41.9 41.9S46.7 186 46.7 162.7c0-23.1 18.7-41.9 41.9-41.9c3.9 0 7.6.6 11.2 1.6v-29.6c-3.7-.5-7.4-.8-11.2-.8c-40.1 0-72.5 32.5-72.5 72.5s32.5 72.5 72.5 72.5c40.1 0 72.5-32.5 72.5-72.5V56.3c11.9 20.4 32.5 35.2 56.4 39v-14.4z"
      />
    </svg>
  );
}

interface NavItem {
  href: string;
  icon: React.ElementType;
  labelKey: string;
  roles: string[];
  badge?: string;
}

export const dashboardNavItems: NavItem[] = [
  {
    href: "/dashboard/admin",
    icon: LayoutDashboard,
    labelKey: "dashboard.title",
    roles: ["admin"],
  },
  {
    href: "/dashboard/manager",
    icon: LayoutDashboard,
    labelKey: "dashboard.title",
    roles: ["manager"],
  },
  {
    href: "/dashboard/player",
    icon: LayoutDashboard,
    labelKey: "dashboard.title",
    roles: ["player"],
  },

  {
    href: "/dashboard/admin/bookings",
    icon: CalendarDays,
    labelKey: "bookings.title",
    roles: ["admin"],
  },
  {
    href: "/dashboard/admin/check-in",
    icon: CheckCircle2,
    labelKey: "dashboard.checkIn",
    roles: ["admin"],
  },
  {
    href: "/dashboard/admin/courts",
    icon: Building2,
    labelKey: "courts.title",
    roles: ["admin"],
  },
  {
    href: "/dashboard/admin/users",
    icon: Users,
    labelKey: "dashboard.userManagement",
    roles: ["admin"],
  },
  {
    href: "/dashboard/admin/revenue",
    icon: CreditCard,
    labelKey: "dashboard.revenue",
    roles: ["admin"],
  },
  {
    href: "/dashboard/admin/tournaments",
    icon: Trophy,
    labelKey: "dashboard.tournaments",
    roles: ["admin"],
  },
  {
    href: "/dashboard/admin/coupons",
    icon: Tag,
    labelKey: "dashboard.coupons",
    roles: ["admin"],
  },

  {
    href: "/dashboard/manager/bookings",
    icon: CalendarDays,
    labelKey: "bookings.title",
    roles: ["manager"],
  },
  {
    href: "/dashboard/manager/check-in",
    icon: CheckCircle2,
    labelKey: "dashboard.checkIn",
    roles: ["manager"],
  },
  {
    href: "/dashboard/manager/courts",
    icon: Building2,
    labelKey: "dashboard.myCourts",
    roles: ["manager"],
  },
  {
    href: "/dashboard/manager/revenue",
    icon: CreditCard,
    labelKey: "dashboard.revenue",
    roles: ["manager"],
  },
  {
    href: "/dashboard/manager/tournaments",
    icon: Trophy,
    labelKey: "dashboard.tournaments",
    roles: ["manager"],
  },
  // {
  //   href: "/dashboard/manager/coupons",
  //   icon: Tag,
  //   labelKey: "dashboard.coupons",
  //   roles: ["manager"],
  // },

  {
    href: "/dashboard/player/browse",
    icon: Building2,
    labelKey: "nav.browseCourts",
    roles: ["player"],
  },
  {
    href: "/dashboard/player/bookings",
    icon: CalendarDays,
    labelKey: "dashboard.myBookings",
    roles: ["player"],
  },
  {
    href: "/dashboard/player/tournaments",
    icon: Trophy,
    labelKey: "dashboard.tournaments",
    roles: ["player"],
  },
  {
    href: "/dashboard/player/favorites",
    icon: Sparkles,
    labelKey: "dashboard.favorites",
    roles: ["player"],
  },
];

function bestMatchNav(items: NavItem[], pathname: string) {
  const sorted = [...items].sort((a, b) => b.href.length - a.href.length);
  return sorted.find(
    (i) => pathname === i.href || pathname.startsWith(i.href + "/"),
  );
}

function LanguageThemeMenus({
  language,
  setLanguage,
  theme,
  resolvedTheme,
  setTheme,
}: {
  language: "ar" | "en";
  setLanguage: (l: "ar" | "en") => void;
  theme?: string;
  resolvedTheme?: string;
  setTheme: (t: string) => void;
}) {
  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark";

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        className="group h-10 rounded-full px-3 text-foreground transition-all duration-300 hover:bg-primary/10 hover:text-primary"
        onClick={() => setLanguage(language === "ar" ? "en" : "ar")}
        aria-label={
          language === "ar" ? "التبديل إلى الإنجليزية" : "Switch to Arabic"
        }
      >
        <Globe className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
        <span className="text-[11px] font-black tracking-[0.22em]">
          {language === "ar" ? "AR" : "EN"}
        </span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        className="group h-10 w-10 rounded-full text-foreground transition-all duration-300 hover:bg-primary/10 hover:text-primary"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={language === "ar" ? "تبديل المظهر" : "Toggle theme"}
      >
        {isDark ? (
          <Moon className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-12" />
        ) : (
          <Sun className="h-4 w-4 transition-transform duration-500 group-hover:rotate-180" />
        )}
      </Button>
    </div>
  );
}

function sectionForHref(
  role: string,
  href: string,
): "core" | "manage" | "insights" | "support" {
  if (href.endsWith(`/dashboard/${role}`) || href === `/dashboard/${role}`)
    return "core";

  if (
    href.includes("/users") ||
    href.includes("/courts") ||
    href.includes("/bookings") ||
    href.includes("/check-in") ||
    href.includes("/revenue") ||
    href.includes("/favorites") ||
    href.includes("/browse") ||
    href.includes("/tournaments") ||
    href.includes("/coupons")
  )
    return "manage";

  if (href.includes("/reports") || href.includes("/audit-logs"))
    return "insights";

  return "support";
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { language, setLanguage, t, direction } = useLanguage();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const {
    user,
    logout,
    isAuthenticated,
    isLoading,
    isLoggingOut,
    sessionExpired,
    setSessionExpired,
  } = useAuth();

  const pathname = usePathname();
  const router = useRouter();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  const filteredNavItems = useMemo(() => {
    if (!user) return [];
    return dashboardNavItems
      .filter((item) => item.roles.includes(user.role))
      .map((item) => {
        if (
          item.href.includes("/bookings") &&
          (user.role === "player" || user.role === "manager")
        ) {
          const activeCount = user.stats?.upcomingBookings ?? 0;
          return {
            ...item,
            badge: activeCount > 0 ? activeCount.toString() : undefined,
          };
        }
        return item;
      });
  }, [user]);

  const activeHref = useMemo(() => {
    return bestMatchNav(filteredNavItems, pathname)?.href ?? "";
  }, [filteredNavItems, pathname]);

  const initials =
    user?.name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .slice(0, 2) ?? "U";

  const CollapseIcon =
    direction === "rtl"
      ? sidebarCollapsed
        ? ChevronLeft
        : ChevronRight
      : sidebarCollapsed
        ? ChevronRight
        : ChevronLeft;
  const homeHref =
    user?.role === "admin"
      ? "/dashboard/admin"
      : user?.role === "manager"
        ? "/dashboard/manager"
        : user?.role === "player"
          ? "/dashboard/player"
          : "/";
  useEffect(() => {
    const body = document.body;
    const html = document.documentElement;

    if (sidebarOpen) {
      try {
        body.style.overflow = "hidden";
        html.style.overflow = "hidden";
      } catch {}
    } else {
      try {
        body.style.overflow = "";
        html.style.overflow = "";
      } catch {}
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      try {
        body.style.overflow = "";
        html.style.overflow = "";
      } catch {}
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const handleLogout = () => {
    setSidebarOpen(false);
    setAccountMenuOpen(false);

    if (typeof window !== "undefined") {
      window.requestAnimationFrame(() => {
        void logout();
      });
      return;
    }

    void logout();
  };

  // Group nav items without the finance sections
  const navSections = useMemo(() => {
    if (!user) return [];
    const role = user.role;
    const sectionsOrder =
      role === "admin"
        ? (["core", "manage", "insights"] as const)
        : (["core", "manage", "insights"] as const);

    const labels = {
      core: { ar: "الرئيسية", en: "Core" },
      manage: { ar: "الإدارة", en: "Management" },
      insights: { ar: "التقارير", en: "Insights" },
      support: { ar: "الدعم", en: "Support" },
    } as const;

    const bucket: Record<string, NavItem[]> = {};
    filteredNavItems.forEach((it) => {
      const key = sectionForHref(role, it.href);
      bucket[key] = bucket[key] || [];
      bucket[key].push(it);
    });

    return sectionsOrder
      .map((key) => ({
        key,
        title: labels[key][language],
        items: bucket[key] || [],
      }))
      .filter((s) => s.items.length > 0);
  }, [filteredNavItems, language, user]);

  useEffect(() => {
    if (isLoading || isLoggingOut || !user) return;

    const desiredRole = pathname.startsWith("/dashboard/admin")
      ? "admin"
      : pathname.startsWith("/dashboard/manager")
        ? "manager"
        : pathname.startsWith("/dashboard/player")
          ? "player"
          : null;

    if (desiredRole && user.role !== desiredRole) {
      router.replace(`/dashboard/${user.role}`);
    }
  }, [isLoading, isLoggingOut, user, pathname, router]);

  if (isLoading || isLoggingOut || !isAuthenticated || !user) {
    return (
      <div className="flex h-screen w-full bg-background overflow-hidden" dir={direction}>
        {/* Desktop Sidebar Skeleton */}
        <aside className="hidden lg:flex flex-col shrink-0 border-e border-border/60 bg-sidebar/70 w-[280px] px-3 py-6">
          <div className="h-8 w-32 bg-muted/50 rounded-lg animate-pulse mb-8 ms-4" />
          <div className="space-y-3">
             <div className="h-10 w-full bg-muted/40 rounded-2xl animate-pulse" />
             <div className="h-10 w-full bg-muted/40 rounded-2xl animate-pulse" />
             <div className="h-10 w-full bg-muted/40 rounded-2xl animate-pulse" />
             <div className="h-10 w-full bg-muted/40 rounded-2xl animate-pulse" />
             <div className="h-10 w-full bg-muted/40 rounded-2xl animate-pulse" />
          </div>
        </aside>

        {/* Main Content Skeleton */}
        <div className="flex-1 flex flex-col w-full min-w-0">
          {/* Header Skeleton */}
          <header className="h-[76px] border-b border-border/40 bg-background/95 px-4 lg:px-8 flex items-center justify-between sticky top-0 z-10">
             <div className="h-10 w-10 bg-muted/50 rounded-xl animate-pulse lg:hidden" />
             <div className="h-8 w-48 bg-muted/50 rounded-lg animate-pulse hidden lg:block" />
             <div className="flex items-center gap-3">
               <div className="h-10 w-10 bg-muted/50 rounded-full animate-pulse" />
               <div className="h-10 w-10 bg-muted/50 rounded-full animate-pulse" />
             </div>
          </header>

          {/* Body Skeleton */}
          <main className="flex-1 p-4 lg:p-8 space-y-8 overflow-hidden">
             <div className="flex flex-col gap-2 mb-6">
               <div className="h-8 w-48 bg-muted rounded animate-pulse" />
               <div className="h-4 w-64 bg-muted/60 rounded animate-pulse" />
             </div>
             <LoadingSkeleton variant="stats" />
             <LoadingSkeleton variant="table" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-screen max-w-full overflow-x-clip bg-background" dir={direction}>
        <SessionExpiredDialog
          open={sessionExpired}
          onOpenChange={setSessionExpired}
        />

        {/* Desktop Sidebar */}
        <aside
          className={cn(
            "hidden lg:block shrink-0 border-e border-border/60 bg-sidebar/70 backdrop-blur-xl transition-all duration-300 sticky top-0 h-screen",
            sidebarCollapsed ? "w-[96px]" : "w-[280px]",
          )}
        >
          <div className="flex h-full flex-col pt-[76px]">
            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 pb-2.5 pt-4 no-scrollbar">
              <div className={cn("space-y-3", sidebarCollapsed && "space-y-2.5")}>
                {navSections.map((section) => (
                  <div key={section.key}>
                    {!sidebarCollapsed && (
                      <div className="px-3 pb-1.5 pt-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground/75">
                        {section.title}
                      </div>
                    )}

                    <div
                      className={cn(
                        "space-y-1.5",
                        sidebarCollapsed && "space-y-1.5",
                      )}
                    >
                      {section.items.map((item) => {
                        const isActive = item.href === activeHref;

                        const NavLink = (
                          <Link
                            key={item.href}
                            href={item.href}
                            aria-current={isActive ? "page" : undefined}
                            className={cn(
                              "group/nav relative flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                              sidebarCollapsed
                                ? "justify-center px-2.5 hover:scale-[1.02]"
                                : "hover:translate-x-[1px]",
                              isActive
                                ? "border-primary/20 bg-primary/[0.10] text-primary shadow-[0_12px_28px_rgba(37,99,235,0.12)]"
                                : "border-transparent text-sidebar-foreground/80 hover:border-border/60 hover:bg-background/70 hover:shadow-sm",
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl transition-all duration-200",
                                isActive
                                  ? "bg-primary text-primary-foreground shadow-sm"
                                  : "bg-background/80 text-sidebar-foreground/65 group-hover/nav:bg-primary/10 group-hover/nav:text-primary",
                              )}
                            >
                              <item.icon className="h-4 w-4" />
                            </div>

                            {!sidebarCollapsed && (
                              <>
                                <span className="flex-1 truncate">
                                  {t(item.labelKey)}
                                </span>
                                {item.badge && (
                                  <Badge
                                    variant="secondary"
                                    className={cn(
                                      "h-6 min-w-[24px] justify-center rounded-full px-2 text-[11px] font-bold shadow-none",
                                      isActive
                                        ? "bg-primary/12 text-primary"
                                        : "bg-background/80 text-muted-foreground",
                                    )}
                                  >
                                    {item.badge}
                                  </Badge>
                                )}
                              </>
                            )}
                          </Link>
                        );

                        if (sidebarCollapsed) {
                          return (
                            <Tooltip key={item.href}>
                              <TooltipTrigger asChild>{NavLink}</TooltipTrigger>
                              <TooltipContent
                                side={direction === "rtl" ? "left" : "right"}
                                className="rounded-xl"
                              >
                                <div className="flex items-center gap-2">
                                  {t(item.labelKey)}
                                  {item.badge && (
                                    <Badge variant="secondary" className="h-5">
                                      {item.badge}
                                    </Badge>
                                  )}
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          );
                        }

                        return NavLink;
                      })}
                    </div>

                    {!sidebarCollapsed && (
                      <Separator className="mt-3 opacity-40" />
                    )}
                  </div>
                ))}
              </div>
            </nav>

            {/* Footer / Support & Legal */}
            <div className="border-t border-sidebar-border/60 p-2.5 space-y-1.5">
              {!sidebarCollapsed ? (
                <>
                  <div className="px-2.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {language === "ar" ? "الدعم والسياسات" : "Support & Legal"}
                  </div>

                  <Link
                    href="/dashboard/help"
                    aria-current={
                      pathname.startsWith("/dashboard/help")
                        ? "page"
                        : undefined
                    }
                    className={cn(
                      "group/help flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-sm font-semibold transition-all duration-200",
                      pathname.startsWith("/dashboard/help")
                        ? "border-primary/15 bg-primary/[0.08] text-primary shadow-sm"
                        : "border-transparent text-sidebar-foreground/78 hover:border-border/50 hover:bg-background/55",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
                        pathname.startsWith("/dashboard/help")
                          ? "bg-primary/14 text-primary"
                          : "text-sidebar-foreground/68 group-hover/help:text-primary",
                      )}
                    >
                      <HelpCircle className="h-4 w-4" />
                    </span>
                    {t("nav.help")}
                  </Link>

                  <Link
                    href="/policies"
                    aria-current={
                      pathname.startsWith("/policies") ? "page" : undefined
                    }
                    className={cn(
                      "group/policies flex items-center gap-2.5 rounded-xl border px-2.5 py-2 text-sm font-semibold transition-all duration-200",
                      pathname.startsWith("/policies")
                        ? "border-primary/15 bg-primary/[0.08] text-primary shadow-sm"
                        : "border-transparent text-sidebar-foreground/78 hover:border-border/50 hover:bg-background/55",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
                        pathname.startsWith("/policies")
                          ? "bg-primary/14 text-primary"
                          : "text-sidebar-foreground/68 group-hover/policies:text-primary",
                      )}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    {language === "ar" ? "السياسات والشروط" : "Policies & Terms"}
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="group/logout flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-sm font-semibold text-sidebar-foreground/78 transition-all duration-200 hover:border-destructive/12 hover:bg-destructive/8 hover:text-destructive"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl text-destructive/80 transition-all duration-200 group-hover/logout:text-destructive">
                      <LogOut className="h-4 w-4" />
                    </span>
                    {t("nav.logout")}
                  </button>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-full justify-center rounded-2xl border-border/50 bg-background/65 text-sidebar-foreground/80 transition-all duration-200 hover:bg-background hover:text-foreground"
                    onClick={() => setSidebarCollapsed(true)}
                  >
                    <CollapseIcon className="h-4 w-4" />
                    <span className="ms-2 text-sm font-semibold">
                      {language === "ar" ? "تصغير" : "Collapse"}
                    </span>
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-2 mb-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href="/dashboard/help"
                          aria-current={
                            pathname.startsWith("/dashboard/help")
                              ? "page"
                              : undefined
                          }
                          className={cn(
                            "inline-flex h-10 w-full items-center justify-center rounded-2xl border transition-all duration-200",
                            pathname.startsWith("/dashboard/help")
                              ? "border-primary/20 bg-primary/[0.10] text-primary shadow-sm"
                              : "border-transparent bg-background/70 text-sidebar-foreground/75 hover:border-border/60 hover:bg-background",
                          )}
                          aria-label={t("nav.help")}
                        >
                          <HelpCircle className="h-5 w-5" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent
                        side={direction === "rtl" ? "left" : "right"}
                        className="rounded-xl"
                      >
                        {t("nav.help")}
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href="/policies"
                          aria-current={
                            pathname.startsWith("/policies") ? "page" : undefined
                          }
                          className={cn(
                            "inline-flex h-10 w-full items-center justify-center rounded-2xl border transition-all duration-200",
                            pathname.startsWith("/policies")
                              ? "border-primary/20 bg-primary/[0.10] text-primary shadow-sm"
                              : "border-transparent bg-background/70 text-sidebar-foreground/75 hover:border-border/60 hover:bg-background",
                          )}
                          aria-label={
                            language === "ar"
                              ? "السياسات والشروط"
                              : "Policies & Terms"
                          }
                        >
                          <ShieldCheck className="h-5 w-5" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent
                        side={direction === "rtl" ? "left" : "right"}
                        className="rounded-xl"
                      >
                        {language === "ar"
                          ? "السياسات والشروط"
                          : "Policies & Terms"}
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={handleLogout}
                          className="inline-flex h-10 w-full items-center justify-center rounded-2xl border border-transparent bg-background/70 text-destructive/80 transition-all duration-200 hover:border-destructive/15 hover:bg-destructive/10 hover:text-destructive"
                          aria-label={t("nav.logout")}
                        >
                          <LogOut className="h-5 w-5" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent
                        side={direction === "rtl" ? "left" : "right"}
                        className="rounded-xl"
                      >
                        {t("nav.logout")}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-full rounded-2xl border-border/50 bg-background/70 text-sidebar-foreground/80 transition-all duration-200 hover:bg-background hover:text-foreground"
                    onClick={() => setSidebarCollapsed(false)}
                    aria-label={language === "ar" ? "توسيع القائمة" : "Expand"}
                  >
                    <CollapseIcon className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </aside>

        {/* Mobile Sidebar */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-[60] lg:hidden">
            <div
              className="fixed inset-0 bg-background/70 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
              role="presentation"
            />
            <div
              id="mobile-sidebar"
              className="fixed inset-y-0 start-0 w-[min(20rem,calc(100vw-2rem))] max-w-full border-e border-border bg-sidebar/85 backdrop-blur-xl"
              role="dialog"
              aria-modal="true"
              aria-label={t("nav.dashboard")}
            >
              <div className="flex h-full flex-col">
                <div className="flex h-16 items-center justify-between border-b border-sidebar-border/60 px-4">
                  <Link
                    href={homeHref}
                    className="flex items-center gap-2.5"
                    onClick={() => setSidebarOpen(false)}
                  >
                    <HeaderLogo language={language as "ar" | "en"} priority className="h-9 w-[110px]" />
                  </Link>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10 rounded-2xl border-border/60 bg-background/50 transition-all hover:bg-primary/10 hover:text-primary hover:shadow-md active:scale-[0.98]"
                    onClick={() => setSidebarOpen(false)}
                    aria-label={
                      language === "ar" ? "إغلاق القائمة" : "Close menu"
                    }
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 pb-3 pt-5 space-y-4 no-scrollbar">
                  {navSections.map((section) => (
                    <div key={section.key}>
                      <div className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground/75">
                        {section.title}
                      </div>

                      <div className="space-y-2">
                        {section.items.map((item) => {
                          const isActive = item.href === activeHref;
                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={() => setSidebarOpen(false)}
                              className={cn(
                                "group/mobile-nav flex items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-semibold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-primary/25 focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]",
                                isActive
                                  ? "border-primary/20 bg-primary/[0.10] text-primary shadow-[0_12px_28px_rgba(37,99,235,0.12)]"
                                  : "border-transparent text-sidebar-foreground/80 hover:border-border/60 hover:bg-background/70 hover:shadow-sm",
                              )}
                            >
                              <div
                                className={cn(
                                  "flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-200",
                                  isActive
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "bg-background/80 text-sidebar-foreground/65 group-hover/mobile-nav:bg-primary/10 group-hover/mobile-nav:text-primary",
                                )}
                              >
                                <item.icon className="h-4 w-4 transition-transform duration-200 group-hover/mobile-nav:scale-[1.02]" />
                              </div>
                              <span className="flex-1">{t(item.labelKey)}</span>
                              {item.badge && (
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    "h-6 min-w-[24px] justify-center rounded-full px-2 text-[11px] font-bold transition-all",
                                    isActive
                                      ? "bg-primary/12 text-primary"
                                      : "bg-background/80 text-muted-foreground",
                                  )}
                                >
                                  {item.badge}
                                </Badge>
                              )}
                            </Link>
                          );
                        })}
                      </div>

                      <Separator className="mt-4 opacity-40" />
                    </div>
                  ))}
                </nav>

                <div className="border-t border-sidebar-border/60 p-3 space-y-2">
                  <div className="px-2.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    {language === "ar" ? "الدعم والسياسات" : "Support & Legal"}
                  </div>

                  <Link
                    href="/dashboard/help"
                    onClick={() => setSidebarOpen(false)}
                    aria-current={
                      pathname.startsWith("/dashboard/help")
                        ? "page"
                        : undefined
                    }
                    className={cn(
                      "group/mobile-help flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-sm font-semibold transition-all duration-200",
                      pathname.startsWith("/dashboard/help")
                        ? "border-primary/15 bg-primary/[0.08] text-primary shadow-sm"
                        : "border-transparent text-sidebar-foreground/78 hover:border-border/50 hover:bg-background/55",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
                        pathname.startsWith("/dashboard/help")
                          ? "bg-primary/14 text-primary"
                          : "text-sidebar-foreground/68 group-hover/mobile-help:text-primary",
                      )}
                    >
                      <HelpCircle className="h-4 w-4" />
                    </span>
                    {t("nav.help")}
                  </Link>

                  <Link
                    href="/policies"
                    onClick={() => setSidebarOpen(false)}
                    aria-current={
                      pathname.startsWith("/policies") ? "page" : undefined
                    }
                    className={cn(
                      "group/mobile-policies flex items-center gap-2.5 rounded-xl border px-2.5 py-2.5 text-sm font-semibold transition-all duration-200",
                      pathname.startsWith("/policies")
                        ? "border-primary/15 bg-primary/[0.08] text-primary shadow-sm"
                        : "border-transparent text-sidebar-foreground/78 hover:border-border/50 hover:bg-background/55",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200",
                        pathname.startsWith("/policies")
                          ? "bg-primary/14 text-primary"
                          : "text-sidebar-foreground/68 group-hover/mobile-policies:text-primary",
                      )}
                    >
                      <ShieldCheck className="h-4 w-4" />
                    </span>
                    {language === "ar" ? "السياسات والشروط" : "Policies & Terms"}
                  </Link>

                  <button
                    onClick={handleLogout}
                    className="group/mobile-logout flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2.5 text-sm font-semibold text-sidebar-foreground/78 transition-all duration-200 hover:border-destructive/12 hover:bg-destructive/8 hover:text-destructive"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl text-destructive/80 transition-all duration-200 group-hover/mobile-logout:text-destructive">
                      <LogOut className="h-4 w-4" />
                    </span>
                    {t("nav.logout")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main */}
        <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-clip overflow-y-visible">
          {/* Topbar */}
          <header
            className="fixed inset-x-0 top-0 z-50 w-full max-w-[100vw] overflow-x-clip border-b border-border/60 bg-background/96 shadow-sm lg:bg-background/90 lg:shadow-smooth-lg lg:backdrop-blur-2xl lg:supports-[backdrop-filter]:bg-background/78"
          >
            <div className="flex h-[76px] w-full min-w-0 items-center justify-between px-3 sm:px-4 lg:px-6">
            <a
              href="#dashboard-main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 rounded-xl bg-primary text-primary-foreground px-3 py-1"
            >
              {t("common.skipToContent")}
            </a>
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full border border-border/70 bg-background/70 shadow-sm transition-all hover:bg-primary/10 hover:text-primary hover:shadow-md active:scale-[0.98] lg:hidden"
                onClick={() => setSidebarOpen((v) => !v)}
                aria-controls={sidebarOpen ? "mobile-sidebar" : undefined}
                aria-expanded={sidebarOpen}
              >
                <Menu className="h-5 w-5" />
              </Button>

              <Link
                href={homeHref}
                className="hidden min-w-0 items-center lg:flex"
              >
                <HeaderLogo
                  language={language as "ar" | "en"}
                  priority
                  className="h-8 w-[92px] sm:h-10 sm:w-[118px] md:h-11 md:w-[150px] xl:h-12 xl:w-[170px]"
                />
              </Link>

            </div>

            <div className="flex items-center gap-1 rounded-full bg-background/94 p-1 shadow-[0_8px_20px_rgba(15,23,42,0.07)] sm:bg-background/86 sm:backdrop-blur-sm lg:bg-background/78 lg:shadow-[0_12px_30px_rgba(15,23,42,0.08)] lg:backdrop-blur-xl dark:bg-slate-950/88 dark:shadow-[0_10px_24px_rgba(0,0,0,0.28)] lg:dark:shadow-[0_16px_36px_rgba(0,0,0,0.32)]">
              <LanguageThemeMenus
                language={language as "ar" | "en"}
                setLanguage={setLanguage as any}
                theme={theme}
                resolvedTheme={resolvedTheme}
                setTheme={setTheme}
              />

              <div className="mx-1 hidden h-5 w-px bg-border/35 sm:block" />

              <NotificationBell />

              <DropdownMenu
                open={accountMenuOpen}
                onOpenChange={setAccountMenuOpen}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="h-10 rounded-full px-1.5 text-foreground transition-all hover:bg-primary/10 hover:text-primary data-[state=open]:bg-primary/10 sm:px-2.5"
                  >
                    <Avatar className="h-8 w-8 shadow-sm">
                      <AvatarImage
                        src={user.avatar || "/placeholder-user.jpg"}
                        alt="user avatar"
                      />
                      <AvatarFallback className="bg-primary/10 text-primary font-extrabold">
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                    <div className="hidden text-start lg:block">
                      <div className="max-w-[128px] truncate text-sm font-bold leading-none">
                        {user.name}
                      </div>
                      <div className="mt-1 text-[11px] font-medium text-muted-foreground">
                        {t(`role.${user.role}`)}
                      </div>
                    </div>
                    <ChevronDown className="hidden h-4 w-4 text-muted-foreground lg:block" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent
                  align="end"
                  sideOffset={10}
                  className="w-[280px] rounded-3xl border-border/70 p-2 shadow-smooth-lg"
                >
                  <DropdownMenuLabel className="px-1 pb-2 pt-1 font-normal">
                    <div className="flex items-center gap-3 rounded-2xl bg-muted/40 p-3">
                      <Avatar className="h-12 w-12 border border-primary/20">
                        <AvatarImage
                          src={user.avatar || "/placeholder-user.jpg"}
                          alt="user avatar"
                        />
                        <AvatarFallback className="bg-primary/10 text-primary font-extrabold">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold leading-none">
                          {user.name}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                        <Badge
                          variant="secondary"
                          className="mt-2 h-6 rounded-full px-2.5 text-[10px] font-bold uppercase tracking-[0.16em]"
                        >
                          {t(`role.${user.role}`)}
                        </Badge>
                      </div>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="mx-1 my-2" />
                  <DropdownMenuItem asChild className="h-11 rounded-2xl px-3">
                    <Link href="/dashboard/profile">
                      <User className="me-2 h-4 w-4" />
                      {t("nav.profile")}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="h-11 rounded-2xl px-3">
                    <Link href="/dashboard/notifications">
                      <Bell className="me-2 h-4 w-4" />
                      {language === "ar" ? "الإشعارات" : "Notifications"}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-1 my-1" />
                  <DropdownMenuItem asChild className="h-10 rounded-2xl px-3 text-xs text-muted-foreground hover:text-foreground">
                    <Link href="/policies#privacy">
                      <ShieldCheck className="me-2 h-3.5 w-3.5 text-primary" />
                      {language === "ar" ? "سياسة الخصوصية" : "Privacy Policy"}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild className="h-10 rounded-2xl px-3 text-xs text-muted-foreground hover:text-foreground">
                    <Link href="/policies#refund">
                      <RefreshCcw className="me-2 h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                      {language === "ar" ? "سياسة الاسترجاع" : "Refund Policy"}
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="mx-1 my-1" />
                  <DropdownMenuItem
                    onSelect={(event) => {
                      event.preventDefault();
                      handleLogout();
                    }}
                    variant="destructive"
                    className="mt-1 h-11 rounded-2xl px-3"
                  >
                    <LogOut className="me-2 h-4 w-4" />
                    {t("nav.logout")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          </header>
          <div className="h-[76px] shrink-0" />

          {/* Content */}
          <main
            id="dashboard-main"
            className="flex min-w-0 flex-1 flex-col overflow-x-clip bg-gradient-to-b from-background via-background to-muted/20"
          >
            <div className="container-responsive max-w-full flex-1 p-4 md:p-6 lg:p-8">
              <AnimatedContainer animation="fade-in" delay={0.05}>
                {children}
              </AnimatedContainer>
            </div>

            {/* Dashboard Mini-Footer */}
            <footer className="mt-auto border-t border-border/40 bg-card/30 px-4 py-4 text-xs text-muted-foreground backdrop-blur-xs sm:px-6 lg:px-8">
              <div className="container-responsive flex flex-col items-center justify-between gap-3 sm:flex-row">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-center sm:text-start">
                  <span>
                    © {new Date().getFullYear()}{" "}
                    {language === "ar"
                      ? "منصة ملعبك. جميع الحقوق محفوظة."
                      : "Mal3bk. All rights reserved."}
                  </span>
                  <Link
                    href="/policies"
                    className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline transition-colors"
                  >
                    {language === "ar" ? "الشروط والسياسات" : "Policies & Terms"}
                  </Link>
                </div>

                <div className="flex items-center gap-4">
                  {/* Contact Links */}
                  <a
                    href="mailto:mal3bkk@gmail.com"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="mal3bkk@gmail.com"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">mal3bkk@gmail.com</span>
                  </a>
                  <a
                    href="tel:+201131734350"
                    dir="ltr"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                    title="+20 11 31734350"
                  >
                    <Phone className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">+20 11 31734350</span>
                  </a>

                  <div className="h-3.5 w-px bg-border/60" />

                  {/* Social Links */}
                  <div className="flex items-center gap-2">
                    <a
                      href="https://www.tiktok.com/@mal3bk.eg?_r=1&_t=ZS-94vmVUpLBYN"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground transition-all hover:scale-105 hover:border-primary hover:bg-primary hover:text-white dark:hover:text-slate-950"
                      aria-label="TikTok @mal3bk.eg"
                    >
                      <TikTokIcon className="h-3.5 w-3.5" />
                    </a>
                    <a
                      href="https://www.instagram.com/mal3bk.eg?igsh=a3kzcHFpcWdvb2d6"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground transition-all hover:scale-105 hover:border-primary hover:bg-primary hover:text-white dark:hover:text-slate-950"
                      aria-label="Instagram @mal3bk.eg"
                    >
                      <Instagram className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
