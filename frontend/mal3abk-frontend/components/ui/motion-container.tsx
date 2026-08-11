"use client"

import * as React from "react"
import { cubicBezier, motion, type HTMLMotionProps } from "framer-motion"
import { cn } from "@/lib/utils"
import type { AnimatedContainerProps } from "./animated-container"

const variantsMap = {
  "fade-in": {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  "fade-up": {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0 },
  },
  "slide-up": {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0 },
  },
  "slide-down": {
    hidden: { opacity: 0, y: -40 },
    visible: { opacity: 1, y: 0 },
  },
  "slide-left": {
    hidden: { opacity: 0, x: 40 },
    visible: { opacity: 1, x: 0 },
  },
  "slide-right": {
    hidden: { opacity: 0, x: -40 },
    visible: { opacity: 1, x: 0 },
  },
  "slide-in-right": {
    hidden: { opacity: 0, x: -40 },
    visible: { opacity: 1, x: 0 },
  },
  "slide-in-left": {
    hidden: { opacity: 0, x: 40 },
    visible: { opacity: 1, x: 0 },
  },
  "scale-in": {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
  },
  "blur-in": {
    hidden: { opacity: 0, filter: "blur(10px)" },
    visible: { opacity: 1, filter: "blur(0px)" },
  },
  none: {
    hidden: {},
    visible: {},
  },
} as const

export function MotionContainer({
  children,
  className,
  animation = "fade-in",
  delay = 0,
  duration = 600,
  stagger = false,
  staggerDelay = 100,
  once = true,
  ...props
}: AnimatedContainerProps) {
  const safeAnimation = animation in variantsMap ? animation : "fade-in"
  const transition = {
    duration: duration / 1000,
    delay: delay / 1000,
    ease: cubicBezier(0.16, 1, 0.3, 1),
  }
  const containerVariants = stagger ? variantsMap.none : variantsMap[safeAnimation]
  const motionProps = props as Omit<HTMLMotionProps<"div">, "ref">

  return (
    <motion.div
      className={cn(className)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, margin: "50px", amount: 0.1 }}
      variants={containerVariants}
      transition={transition}
      {...motionProps}
    >
      {stagger
        ? React.Children.map(children, (child, index) => {
            if (child == null) return null
            return (
              <motion.div
                key={index}
                variants={variantsMap[safeAnimation]}
                transition={{
                  ...transition,
                  delay: delay / 1000 + (index * staggerDelay) / 1000,
                }}
              >
                {child}
              </motion.div>
            )
          })
        : children}
    </motion.div>
  )
}
