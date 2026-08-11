"use client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { LucideIcon } from "lucide-react"
import Link from "next/link" // Standard for Next.js

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: {
    label: string
    onClick?: () => void
    href?: string // Add the optional href property
  }
  className?: string
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed p-12 text-center animate-fade-in",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-muted p-4">
          <Icon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      {description && <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>}
      
      {action && (
        <Button 
          onClick={action.onClick} 
          asChild={!!action.href} // Use asChild if an href is provided
          className="mt-6"
        >
          {action.href ? (
            <Link href={action.href}>{action.label}</Link>
          ) : (
            action.label
          )}
        </Button>
      )}
    </div>
  )
}