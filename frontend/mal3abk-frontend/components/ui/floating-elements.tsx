"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

export function FloatingOrbs({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      <div
        className="absolute top-1/4 -start-32 w-[500px] h-[500px] bg-gradient-to-br from-primary/30 to-emerald-500/20 rounded-full blur-[100px] animate-float"
        style={{ animationDuration: "8s" }}
      />
      <div
        className="absolute top-1/2 -end-32 w-[400px] h-[400px] bg-gradient-to-br from-cyan-500/20 to-blue-500/15 rounded-full blur-[100px] animate-float"
        style={{ animationDuration: "10s", animationDelay: "2s" }}
      />
      <div
        className="absolute bottom-1/4 start-1/3 w-[350px] h-[350px] bg-gradient-to-br from-amber-500/15 to-orange-500/10 rounded-full blur-[100px] animate-float"
        style={{ animationDuration: "12s", animationDelay: "4s" }}
      />
      <div
        className="absolute top-1/3 end-1/4 w-[300px] h-[300px] bg-gradient-to-br from-rose-500/10 to-pink-500/10 rounded-full blur-[100px] animate-float"
        style={{ animationDuration: "14s", animationDelay: "1s" }}
      />
    </div>
  )
}

export function GridBackground({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"
        style={{
          backgroundImage: `
            linear-gradient(to right, currentColor 1px, transparent 1px),
            linear-gradient(to bottom, currentColor 1px, transparent 1px)
          `,
          backgroundSize: "80px 80px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background" />
    </div>
  )
}

export function NoiseTexture({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden pointer-events-none opacity-[0.015] dark:opacity-[0.03] hidden md:block",
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
      }}
    />
  )
}

export function DotsPattern({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      <div
        className="absolute inset-0 opacity-[0.08] dark:opacity-[0.12]"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1.5px, transparent 1.5px)`,
          backgroundSize: "40px 40px",
        }}
      />
      <div className="absolute inset-0 bg-gradient-radial from-transparent via-transparent to-background" />
    </div>
  )
}

export function GlowCursor() {
  const [position, setPosition] = React.useState({ x: 0, y: 0 })
  const [isVisible, setIsVisible] = React.useState(false)
  const targetRef = React.useRef({ x: 0, y: 0 })
  const animationRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      targetRef.current = { x: e.clientX, y: e.clientY }
      setIsVisible(true)
    }

    const handleMouseLeave = () => setIsVisible(false)

    const animate = () => {
      setPosition((prev) => ({
        x: prev.x + (targetRef.current.x - prev.x) * 0.1,
        y: prev.y + (targetRef.current.y - prev.y) * 0.1,
      }))
      animationRef.current = requestAnimationFrame(animate)
    }

    window.addEventListener("mousemove", handleMouseMove)
    document.body.addEventListener("mouseleave", handleMouseLeave)
    animationRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      document.body.removeEventListener("mouseleave", handleMouseLeave)
      if (animationRef.current) cancelAnimationFrame(animationRef.current)
    }
  }, [])

  return (
    <div
      className="fixed pointer-events-none z-50 transition-opacity duration-500"
      style={{
        left: position.x - 250,
        top: position.y - 250,
        opacity: isVisible ? 1 : 0,
      }}
    >
      <div className="w-[500px] h-[500px] bg-gradient-radial from-primary/10 via-primary/5 to-transparent rounded-full blur-2xl" />
    </div>
  )
}

export function Marquee({
  children,
  className,
  speed = 30,
  direction = "left",
  pauseOnHover = true,
}: {
  children: React.ReactNode
  className?: string
  speed?: number
  direction?: "left" | "right"
  pauseOnHover?: boolean
}) {
  return (
    <div className={cn("flex overflow-hidden group", className)}>
      <div
        className={cn(
          "flex shrink-0 gap-8 items-center animate-marquee",
          pauseOnHover && "group-hover:[animation-play-state:paused]",
        )}
        style={{
          animationDuration: `${speed}s`,
          animationDirection: direction === "right" ? "reverse" : "normal",
        }}
      >
        {children}
        {children}
      </div>
      <style jsx>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-marquee {
          animation: marquee linear infinite;
        }
      `}</style>
    </div>
  )
}

export function Spotlight({ className }: { className?: string }) {
  const [position, setPosition] = React.useState({ x: 50, y: 50 })
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width) * 100
        const y = ((e.clientY - rect.top) / rect.height) * 100
        setPosition((prev) => ({
          x: prev.x + (x - prev.x) * 0.1,
          y: prev.y + (y - prev.y) * 0.1,
        }))
      }
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn("absolute inset-0 overflow-hidden pointer-events-none transition-opacity duration-700 hidden md:block", className)}
      style={{
        background: `radial-gradient(circle at ${position.x}% ${position.y}%, var(--primary) 0%, transparent 60%)`,
        opacity: 0.04,
      }}
    />
  )
}

export function GradientBorder({
  children,
  className,
  borderWidth = 1,
  animate = true,
}: {
  children: React.ReactNode
  className?: string
  borderWidth?: number
  animate?: boolean
}) {
  return (
    <div className={cn("relative group", className)}>
      <div
        className={cn(
          "absolute -inset-px rounded-[inherit] bg-gradient-to-r from-primary via-cyan-500 to-emerald-500",
          animate && "animate-gradient bg-[length:400%_400%]",
        )}
        style={{ padding: borderWidth }}
      />
      <div className="relative bg-background rounded-[inherit]">{children}</div>
    </div>
  )
}

export function MorphingBlob({ className }: { className?: string }) {
  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      <svg className="absolute w-full h-full opacity-30" viewBox="0 0 800 800">
        <defs>
          <linearGradient id="blob-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
            <stop offset="50%" stopColor="rgb(6, 182, 212)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0.3" />
          </linearGradient>
        </defs>
        <path fill="url(#blob-gradient)" className="animate-morph">
          <animate
            attributeName="d"
            dur="20s"
            repeatCount="indefinite"
            values="
              M400,250C500,250,550,350,550,400C550,500,450,550,400,550C300,550,250,450,250,400C250,300,300,250,400,250;
              M400,200C550,200,600,300,600,400C600,550,500,600,400,600C250,600,200,500,200,400C200,250,250,200,400,200;
              M400,250C500,250,550,350,550,400C550,500,450,550,400,550C300,550,250,450,250,400C250,300,300,250,400,250
            "
          />
        </path>
      </svg>
    </div>
  )
}

export function ParticleField({ className, count = 50 }: { className?: string; count?: number }) {
  const particles = React.useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() * 3 + 1,
        duration: Math.random() * 20 + 10,
        delay: Math.random() * 10,
      })),
    [count],
  )

  return (
    <div className={cn("absolute inset-0 overflow-hidden pointer-events-none", className)}>
      {particles.map((particle) => (
        <div
          key={particle.id}
          className="absolute rounded-full bg-primary/20 animate-float"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            width: particle.size,
            height: particle.size,
            animationDuration: `${particle.duration}s`,
            animationDelay: `${particle.delay}s`,
          }}
        />
      ))}
    </div>
  )
}

