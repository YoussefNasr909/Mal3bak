"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { HeaderLogo } from "@/components/branding/header-logo";
import { useAuth } from "@/components/providers/auth-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { NavbarPreferenceControls } from "@/components/ui/navbar-preference-controls";
import { cn } from "@/lib/utils";

export function AuthNavbar() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const next = window.scrollY > 24;
      setScrolled((prev) => (prev === next ? prev : next));
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const homeHref =
    user?.role === "admin"
      ? "/dashboard/admin"
      : user?.role === "manager"
        ? "/dashboard/manager"
        : user?.role === "player"
          ? "/dashboard/player"
          : "/";

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
      )}
    >
      <nav className="container-responsive pt-0">
        <div
          className={cn(
            "flex h-16 items-center justify-between gap-3 rounded-b-2xl border border-t-0 px-4 transition-all duration-300 sm:px-5 lg:px-6",
            scrolled
              ? "border-border/80 bg-background/82 shadow-smooth-lg backdrop-blur-2xl dark:border-white/[0.08] dark:bg-card/[0.72]"
              : "border-transparent bg-transparent shadow-none backdrop-blur-0",
          )}
        >
          <Link href={homeHref} className="flex shrink-0 items-center">
            <HeaderLogo
              language={language as "ar" | "en"}
              priority
              className="h-10 w-[126px] sm:h-11 sm:w-[142px] lg:h-12 lg:w-[156px]"
            />
          </Link>

          <NavbarPreferenceControls
            compact
            className={cn(
              "shrink-0 transition-all duration-300",
              scrolled
                ? "bg-background/88"
                : "bg-background/92 shadow-md dark:bg-card/[0.74]",
            )}
          />
        </div>
      </nav>
    </header>
  )
}
