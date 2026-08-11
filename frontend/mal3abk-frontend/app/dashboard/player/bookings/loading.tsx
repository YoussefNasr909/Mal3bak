import { LoadingSkeleton } from "@/components/ui/loading-skeleton"

export default function Loading() {
  return (
    <div className="container-responsive py-6 md:py-10 space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
        <div className="h-4 w-64 bg-muted/60 rounded animate-pulse" />
      </div>

      <LoadingSkeleton variant="list" count={4} />
    </div>
  )
}
