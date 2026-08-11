import * as React from 'react'

import { cn } from '@/lib/utils'
import type { ComponentProps } from "react"

function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-lg border bg-background/70 px-3 py-2 text-base shadow-xs transition-[color,box-shadow,background-color,border-color] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-foreground dark:hover:bg-white/[0.05] md:text-sm',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }

