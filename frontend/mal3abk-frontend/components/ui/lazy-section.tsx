"use client"

import React, { useRef, useState, useEffect } from "react"

/**
 * LazySection
 * Only renders its children when they approach the viewport.
 * Uses a native IntersectionObserver so the landing bundle does not need framer-motion.
 */
export function LazySection({
  children,
  minHeight = "400px",
  className = "",
}: {
  children: React.ReactNode
  minHeight?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [hasRendered, setHasRendered] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node || hasRendered) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasRendered(true)
          observer.disconnect()
        }
      },
      {
        root: null,
        // Smaller preload window on mobile reduces upfront work.
        rootMargin:
          typeof window !== "undefined" && window.innerWidth < 768
            ? "300px 0px"
            : "700px 0px",
        threshold: 0.01,
      },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [hasRendered])

  return (
    <div ref={ref} className={className} style={{ minHeight: hasRendered ? "auto" : minHeight }}>
      {hasRendered ? children : null}
    </div>
  )
}
