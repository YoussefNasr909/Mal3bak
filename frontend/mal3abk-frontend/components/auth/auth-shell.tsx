"use client";

import type { ReactNode } from "react";

import { AuthNavbar } from "@/components/auth/auth-navbar";
import { useLanguage } from "@/components/providers/language-provider";
import { AnimatedContainer } from "@/components/ui/animated-container";
import { GridBackground } from "@/components/ui/floating-elements";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  title: string;
  description: string;
  children: ReactNode;
  maxWidthClassName?: string;
};

export function AuthShell({
  title,
  description,
  children,
  maxWidthClassName,
}: AuthShellProps) {
  const { direction } = useLanguage();

  return (
    <>
      <AuthNavbar />

      <main
        dir={direction}
        className="relative min-h-screen overflow-hidden bg-background pt-20"
      >
        <GridBackground className="opacity-30" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(13,71,161,0.12),transparent_35%)]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-background/35 via-background/80 to-background" />

        <div className="container-responsive relative z-10 flex min-h-[calc(100vh-5rem)] items-center justify-center py-8 sm:py-10">
          <div
            className={cn("w-full max-w-md animate-in fade-in slide-in-from-bottom-8 duration-700 fill-mode-both", maxWidthClassName)}
          >
            <section className="overflow-hidden rounded-[28px] border border-border/60 bg-card/95 shadow-smooth-lg backdrop-blur-xl">
              <div className="h-1 w-full bg-gradient-to-r from-primary/70 via-primary/35 to-transparent" />

              <div className="p-6 sm:p-8">
                <div className="mb-6 space-y-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                    {title}
                  </h1>
                  <p className="text-sm leading-7 text-muted-foreground sm:text-[15px]">
                    {description}
                  </p>
                </div>

                {children}
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
