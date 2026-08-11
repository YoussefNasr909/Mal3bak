"use client"

import type React from "react"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface EnhancedHoverCardProps {
  trigger: React.ReactNode
  content: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  delay?: number
  className?: string
}

export function EnhancedHoverCard({ trigger, content, side = "top", delay = 200, className }: EnhancedHoverCardProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  const handleOpen = () => {
    setIsOpen(true)
    setIsAnimating(true)
  }

  const handleClose = () => {
    setIsAnimating(false)
    setTimeout(() => setIsOpen(false), 150)
  }

  const positionClasses = {
    top: "bottom-full mb-2",
    right: "left-full ml-2",
    bottom: "top-full mt-2",
    left: "right-full mr-2",
  }

  return (
    <div className="relative inline-block group" onMouseEnter={handleOpen} onMouseLeave={handleClose}>
      {trigger}

      {isOpen && (
        <div
          className={cn(
            "absolute z-50 whitespace-nowrap",
            positionClasses[side],
            "animate-in fade-in slide-in duration-200",
            !isAnimating && "animate-out fade-out slide-out duration-150",
          )}
        >
          <div
            className={cn(
              "rounded-lg border border-border/50 bg-popover p-3 text-sm shadow-smooth-lg backdrop-blur-sm",
              className,
            )}
          >
            {content}
          </div>
        </div>
      )}
    </div>
  )
}

