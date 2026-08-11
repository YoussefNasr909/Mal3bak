"use client"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"

interface LoadingSkeletonProps {
  variant?: "card" | "table" | "list" | "chart" | "stats"
  count?: number
  className?: string
}

export function LoadingSkeleton({ variant = "card", count = 1, className }: LoadingSkeletonProps) {
  const renderSkeleton = () => {
    switch (variant) {
      case "stats":
        return (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/50 bg-card/70 p-6 space-y-3 shadow-sm motion-safe:animate-pulse"
              >
                <Skeleton className="h-4 w-24 bg-muted/60" />
                <Skeleton className="h-8 w-32 bg-gradient-to-r from-muted to-muted/50" />
                <Skeleton className="h-4 w-20 bg-muted/60" />
              </div>
            ))}
          </div>
        )
      case "chart":
        return (
          <div className="rounded-xl border border-border/50 bg-card/70 p-6 space-y-4 shadow-sm motion-safe:animate-pulse">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-32 bg-muted/60" />
              <Skeleton className="h-8 w-24 bg-muted/60" />
            </div>
            <Skeleton className="h-[300px] w-full bg-gradient-to-r from-muted to-muted/50 rounded-lg" />
          </div>
        )
      case "table":
        return (
          <div className="rounded-xl border border-border/50 bg-card/70 overflow-hidden shadow-sm motion-safe:animate-pulse">
            <div className="border-b border-border/50 p-4 bg-muted/20">
              <Skeleton className="h-6 w-48 bg-muted/60" />
            </div>
            <div className="divide-y divide-border/50">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-muted/5">
                  <Skeleton className="h-10 w-10 rounded-full bg-muted/60" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4 bg-muted/60" />
                    <Skeleton className="h-3 w-1/2 bg-muted/50" />
                  </div>
                  <Skeleton className="h-6 w-20 bg-muted/60" />
                </div>
              ))}
            </div>
          </div>
        )
      case "list":
        return (
          <div className="space-y-3">
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 rounded-lg border border-border/50 bg-card/70 p-4 shadow-sm motion-safe:animate-pulse"
              >
                <Skeleton className="h-12 w-12 rounded-lg bg-muted/60" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3 bg-muted/60" />
                  <Skeleton className="h-3 w-1/3 bg-muted/50" />
                </div>
              </div>
            ))}
          </div>
        )
      default:
        return (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl border border-border/50 bg-card/70 overflow-hidden shadow-sm motion-safe:animate-pulse"
              >
                <Skeleton className="h-48 w-full bg-gradient-to-r from-muted to-muted/50" />
                <div className="p-4 space-y-3">
                  <Skeleton className="h-5 w-3/4 bg-muted/60" />
                  <Skeleton className="h-4 w-1/2 bg-muted/60" />
                  <div className="flex items-center justify-between pt-2">
                    <Skeleton className="h-6 w-20 bg-muted/60" />
                    <Skeleton className="h-8 w-24 bg-muted/60" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
    }
  }

  return <div className={cn("", className)}>{renderSkeleton()}</div>
}

