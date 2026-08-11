"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

export type LandingAnimationKey =
  | "fade-in"
  | "fade-up"
  | "slide-up"
  | "slide-down"
  | "scale-in"
  | "slide-left"
  | "slide-right"
  | "slide-in-right"
  | "slide-in-left"
  | "blur-in"
  | "none"

export interface LandingAnimatedContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  animation?: LandingAnimationKey
  delay?: number
  duration?: number
  stagger?: boolean
  staggerDelay?: number
  once?: boolean
}

export function LandingAnimatedContainer({
  children,
  className,
  style,
  animation = "fade-in",
  delay = 0,
  duration = 600,
  stagger = false,
  staggerDelay = 100,
  once = true,
  ...props
}: LandingAnimatedContainerProps) {
  const isMobile = useIsMobile()
  const [DesktopMotionContainer, setDesktopMotionContainer] =
    React.useState<React.ComponentType<LandingAnimatedContainerProps> | null>(null)

  React.useEffect(() => {
    let active = true

    if (isMobile) {
      setDesktopMotionContainer(null)
      return () => {
        active = false
      }
    }

    import("./landing-motion-container").then((module) => {
      if (active) {
        setDesktopMotionContainer(() => module.LandingMotionContainer)
      }
    })

    return () => {
      active = false
    }
  }, [isMobile])

  if (isMobile) {
    if (animation === "none") {
      return (
        <div className={cn(className)} style={style} {...props}>
          {children}
        </div>
      )
    }

    const mobileDelay = Math.round(delay * 0.3)
    const mobileDuration = Math.max(200, duration * 0.4)

    return (
      <div
        className={cn("mobile-fade-in", className)}
        style={{
          ...style,
          animationDelay: mobileDelay > 0 ? `${mobileDelay}ms` : undefined,
          animationDuration: `${mobileDuration}ms`,
          willChange: "auto",
        }}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (!DesktopMotionContainer) {
    return (
      <div className={cn(className)} style={style} {...props}>
        {children}
      </div>
    )
  }

  return (
    <DesktopMotionContainer
      className={className}
      style={style}
      animation={animation}
      delay={delay}
      duration={duration}
      stagger={stagger}
      staggerDelay={staggerDelay}
      once={once}
      {...props}
    >
      {children}
    </DesktopMotionContainer>
  )
}
