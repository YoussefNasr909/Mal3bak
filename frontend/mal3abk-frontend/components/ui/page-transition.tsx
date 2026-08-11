"use client"

import type React from "react"

interface PageTransitionProps {
  children: React.ReactNode
  duration?: number
}

export function PageTransition({ children, duration = 0.35 }: PageTransitionProps) {
  return (
    <div className="mobile-fade-in" style={{ animationDuration: `${duration}s` }}>
      {children}
    </div>
  )
}
