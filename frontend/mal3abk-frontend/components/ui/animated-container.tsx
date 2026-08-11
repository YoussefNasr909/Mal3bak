"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"

type AnimationKey =
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

export interface AnimatedContainerProps
  extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
  animation?: AnimationKey
  delay?: number
  duration?: number
  stagger?: boolean
  staggerDelay?: number
  once?: boolean
}

export function AnimatedContainer({
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
}: AnimatedContainerProps) {
  const isMobile = useIsMobile()
  const [DesktopMotionContainer, setDesktopMotionContainer] =
    React.useState<React.ComponentType<AnimatedContainerProps> | null>(null)

  React.useEffect(() => {
    let active = true

    if (animation === "none" || isMobile) {
      setDesktopMotionContainer(null)
      return () => {
        active = false
      }
    }

    import("./motion-container").then((module) => {
      if (active) {
        setDesktopMotionContainer(() => module.MotionContainer)
      }
    })

    return () => {
      active = false
    }
  }, [animation, isMobile])

  if (animation === "none") {
    return (
      <div className={cn(className)} style={style} {...props}>
        {children}
      </div>
    )
  }

  if (isMobile || !DesktopMotionContainer) {
    const mobileDelay = Math.round(delay * 0.3)
    const mobileDuration = Math.max(180, Math.round(duration * 0.35))

    return (
      <div
        className={cn("mobile-fade-in", className)}
        style={{
          ...style,
          animationDelay: mobileDelay > 0 ? `${mobileDelay}ms` : undefined,
          animationDuration: `${mobileDuration}ms`,
        }}
        {...props}
      >
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

// Animated text component for hero sections
export function AnimatedText({
  children,
  className,
  delay = 0,
  staggerWords = false,
}: {
  children: string
  className?: string
  delay?: number
  staggerWords?: boolean
}) {
  const [isVisible, setIsVisible] = React.useState(false)
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setIsVisible(true), delay)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [delay])

  if (staggerWords) {
    const words = children.split(" ")
    return (
      <span ref={ref} className={cn("inline-flex flex-wrap gap-x-2", className)}>
        {words.map((word, index) => (
          <span
            key={index}
            className="inline-block"
            style={{
              opacity: isVisible ? 1 : 0,
              transform: isVisible ? "translateY(0)" : "translateY(20px)",
              transition: `all 600ms cubic-bezier(0.16, 1, 0.3, 1)`,
              transitionDelay: `${index * 80}ms`,
            }}
          >
            {word}
          </span>
        ))}
      </span>
    )
  }

  return (
    <span
      ref={ref}
      className={cn("inline-block", className)}
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? "translateY(0)" : "translateY(20px)",
        transition: `all 600ms cubic-bezier(0.16, 1, 0.3, 1)`,
      }}
    >
      {children}
    </span>
  )
}

// Counter animation component
export function AnimatedCounter({
  value,
  duration = 2000,
  className,
  suffix = "",
  prefix = "",
}: {
  value: number
  duration?: number
  className?: string
  suffix?: string
  prefix?: string
}) {
  const [count, setCount] = React.useState(0)
  const [isVisible, setIsVisible] = React.useState(false)
  const ref = React.useRef<HTMLSpanElement>(null)

  React.useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [])

  React.useEffect(() => {
    if (!isVisible) return

    let startTime: number
    let animationFrame: number

    const animate = (timestamp: number) => {
      if (!startTime) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const easeOutQuart = 1 - Math.pow(1 - progress, 4)
      setCount(Math.floor(easeOutQuart * value))

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate)
      }
    }

    animationFrame = requestAnimationFrame(animate)

    return () => cancelAnimationFrame(animationFrame)
  }, [isVisible, value, duration])

  return (
    <span ref={ref} className={className}>
      {prefix}
      {count.toLocaleString()}
      {suffix}
    </span>
  )
}

// Parallax scroll component
export function ParallaxContainer({
  children,
  className,
  speed = 0.5,
}: {
  children: React.ReactNode
  className?: string
  speed?: number
}) {
  const [offset, setOffset] = React.useState(0)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let rafId: number
    const handleScroll = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect()
          const scrolled = window.scrollY
          const elementTop = rect.top + scrolled
          const relativeScroll = scrolled - elementTop + window.innerHeight
          setOffset(relativeScroll * speed * 0.1)
        }
      })
    }

    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", handleScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [speed])

  return (
    <div
      ref={ref}
      className={className}
      style={{
        transform: `translateY(${offset}px)`,
        willChange: "transform",
      }}
    >
      {children}
    </div>
  )
}
