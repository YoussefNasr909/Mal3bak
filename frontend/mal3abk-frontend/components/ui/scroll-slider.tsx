 "use client"
 
 import { useEffect, useRef, useState } from "react"
 import { cn } from "@/lib/utils"
 
 export function ScrollSlider({
   hiddenOnMobile = true,
 }: {
   hiddenOnMobile?: boolean
 }) {
   const [progress, setProgress] = useState(0)
   const [visible, setVisible] = useState(false)
   const [dragging, setDragging] = useState(false)
   const railRef = useRef<HTMLDivElement | null>(null)
 
   useEffect(() => {
     const update = () => {
       const sh = document.documentElement.scrollHeight
       const ch = document.documentElement.clientHeight
       const st = document.documentElement.scrollTop
       const canScroll = sh > ch + 8
       setVisible(canScroll)
       setProgress(canScroll ? st / (sh - ch) : 0)
     }
     update()
     window.addEventListener("scroll", update, { passive: true })
     window.addEventListener("resize", update)
     return () => {
       window.removeEventListener("scroll", update)
       window.removeEventListener("resize", update)
     }
   }, [])
 
   useEffect(() => {
     const onMove = (e: MouseEvent | TouchEvent) => {
       if (!dragging || !railRef.current) return
       const rail = railRef.current
       const rect = rail.getBoundingClientRect()
       const clientY = (e as TouchEvent).touches ? (e as TouchEvent).touches[0].clientY : (e as MouseEvent).clientY
       const y = Math.min(Math.max(clientY - rect.top, 0), rect.height)
       const pct = y / rect.height
       const sh = document.documentElement.scrollHeight
       const ch = document.documentElement.clientHeight
       document.documentElement.scrollTo({ top: pct * (sh - ch), behavior: "auto" })
     }
     const stop = () => setDragging(false)
     window.addEventListener("mousemove", onMove)
     window.addEventListener("touchmove", onMove, { passive: false })
     window.addEventListener("mouseup", stop)
     window.addEventListener("touchend", stop)
     return () => {
       window.removeEventListener("mousemove", onMove)
       window.removeEventListener("touchmove", onMove as any)
       window.removeEventListener("mouseup", stop)
       window.removeEventListener("touchend", stop)
     }
   }, [dragging])
 
   const knobStyle = {
     transform: `translateY(${Math.round(progress * 100)}%)`,
   } as const
 
   if (!visible) return null
 
   return (
     <div
       className={cn(
         "fixed inset-y-0",
         "pointer-events-none z-[60]",
         "flex",
         "justify-end",
         hiddenOnMobile ? "hidden md:flex" : "flex",
       )}
       aria-hidden="true"
     >
       <div className="relative h-full w-6 me-1">
         <div
           ref={railRef}
           className="absolute top-24 bottom-6 end-2 w-2 rounded-full bg-gradient-to-b from-muted/40 via-muted/60 to-muted/40 shadow-inner"
           onMouseDown={(e) => {
             setDragging(true)
             const rail = railRef.current
             if (!rail) return
             const rect = rail.getBoundingClientRect()
             const y = e.clientY - rect.top
             const pct = Math.min(Math.max(y / rect.height, 0), 1)
             const sh = document.documentElement.scrollHeight
             const ch = document.documentElement.clientHeight
             document.documentElement.scrollTo({ top: pct * (sh - ch), behavior: "auto" })
           }}
           onTouchStart={(e) => {
             setDragging(true)
             const rail = railRef.current
             if (!rail) return
             const rect = rail.getBoundingClientRect()
             const y = e.touches[0].clientY - rect.top
             const pct = Math.min(Math.max(y / rect.height, 0), 1)
             const sh = document.documentElement.scrollHeight
             const ch = document.documentElement.clientHeight
             document.documentElement.scrollTo({ top: pct * (sh - ch), behavior: "auto" })
           }}
           style={{}}
         >
           <div
             className="absolute start-0 w-full h-10 rounded-full bg-background/70 backdrop-blur shadow-md border border-border/50 transition-transform"
             style={knobStyle}
           />
         </div>
       </div>
     </div>
   )
 }

