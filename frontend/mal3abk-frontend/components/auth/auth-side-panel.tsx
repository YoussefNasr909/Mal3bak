"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type AuthHighlight = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type AuthSidePanelProps = {
  eyebrow: string;
  title: string;
  description: string;
  highlights: AuthHighlight[];
  note?: ReactNode;
  className?: string;
};

export function AuthSidePanel({
  eyebrow,
  title,
  description,
  highlights,
  note,
  className,
}: AuthSidePanelProps) {
  return (
    <div className={cn("relative", className)}>
      <div className="pointer-events-none absolute inset-x-10 top-2 h-32 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative overflow-hidden rounded-[32px] border border-border/45 bg-card/50 px-7 py-8 backdrop-blur-md sm:px-8 sm:py-9">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.28),transparent_34%,rgba(13,71,161,0.05)_100%)] dark:bg-[linear-gradient(150deg,rgba(255,255,255,0.08),transparent_34%,rgba(13,71,161,0.12)_100%)]" />

        <div className="relative flex h-full flex-col gap-7">
          <div className="space-y-4">
            <Badge className="rounded-full border-primary/20 bg-primary/10 px-4 py-1.5 text-primary shadow-sm">
              {eyebrow}
            </Badge>

            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[2rem]">
                {title}
              </h2>
              <p className="max-w-xl text-sm leading-7 text-muted-foreground sm:text-[15px]">
                {description}
              </p>
            </div>
          </div>

          <div className="grid gap-0 divide-y divide-border/35">
            {highlights.map((highlight) => (
              <div
                key={highlight.title}
                className="flex items-start gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/10">
                  <highlight.icon className="h-5 w-5 text-primary" />
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-sm font-semibold text-foreground">
                    {highlight.title}
                  </h3>
                  <p className="text-sm leading-6 text-muted-foreground">
                    {highlight.description}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {note ? (
            <div className="mt-auto rounded-[22px] bg-background/45 px-5 py-4 ring-1 ring-border/35 backdrop-blur-sm">
              {note}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
