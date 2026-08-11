"use client"

import * as React from "react"
import { motion, AnimatePresence } from "framer-motion"
import { WifiOff, RefreshCcw, ServerCrash } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/components/providers/language-provider"

interface ConnectivityErrorProps {
  isVisible: boolean
  onRetry: () => void
  isRetrying?: boolean
}

export function ConnectivityError({ isVisible, onRetry, isRetrying }: ConnectivityErrorProps) {
  const { language } = useLanguage()
  const lang = (language === "ar" ? "ar" : "en") as "ar" | "en"

  const content = {
    en: {
      title: "Server Unreachable",
      description: "We are having trouble connecting to our servers. Please check your internet connection or try again in a moment.",
      retry: "Retry Connection",
      retrying: "Connecting...",
    },
    ar: {
      title: "لا يمكن الاتصال بالخادم",
      description: "نواجه مشكلة في الاتصال بخوادمنا. يرجى التحقق من اتصال الإنترنت الخاص بك أو المحاولة مرة أخرى بعد قليل.",
      retry: "إعادة المحاولة",
      retrying: "جاري الاتصال...",
    },
  }

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-background/80 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="w-full max-w-md overflow-hidden rounded-[2.5rem] border border-border/50 bg-card/40 p-8 shadow-2xl md:backdrop-blur-2xl"
          >
            <div className="flex flex-col items-center text-center">
              <div className="relative mb-6">
                <motion.div
                  animate={{ 
                    scale: [1, 1.1, 1],
                    opacity: [0.5, 1, 0.5] 
                  }}
                  transition={{ 
                    duration: 3, 
                    repeat: Infinity, 
                    ease: "easeInOut" 
                  }}
                  className="absolute inset-0 rounded-full bg-primary/20 blur-2xl"
                />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-primary ring-1 ring-primary/20">
                  <WifiOff className="h-10 w-10" />
                </div>
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 }}
                  className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-lg ring-2 ring-background"
                >
                  <ServerCrash className="h-4 w-4" />
                </motion.div>
              </div>

              <h2 className="mb-3 text-2xl font-black tracking-tight text-foreground">
                {content[lang].title}
              </h2>
              
              <p className="mb-8 text-muted-foreground font-medium leading-relaxed">
                {content[lang].description}
              </p>

              <Button
                size="lg"
                onClick={onRetry}
                disabled={isRetrying}
                className="group relative h-14 w-full overflow-hidden rounded-2xl px-8 font-black transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="relative z-10 flex items-center justify-center gap-2">
                  {isRetrying ? (
                    <RefreshCcw className="h-5 w-5 animate-spin" />
                  ) : (
                    <RefreshCcw className="h-5 w-5 transition-transform group-hover:rotate-180 duration-500" />
                  )}
                  {isRetrying ? content[lang].retrying : content[lang].retry}
                </div>
                <motion.div 
                  className="absolute inset-0 bg-linear-to-r from-primary via-primary/80 to-primary"
                  animate={{ 
                    x: ["-100%", "100%"] 
                  }}
                  transition={{ 
                    duration: 3, 
                    repeat: Infinity, 
                    ease: "linear" 
                  }}
                  style={{ opacity: isRetrying ? 0.5 : 0 }}
                />
              </Button>
            </div>
            
            <div className="mt-8 flex justify-center">
              <div className="flex gap-1.5">
                {[...Array(3)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{ 
                      scale: [1, 1.5, 1],
                      opacity: [0.3, 1, 0.3] 
                    }}
                    transition={{ 
                      duration: 1.5, 
                      repeat: Infinity, 
                      delay: i * 0.2,
                      ease: "easeInOut" 
                    }}
                    className="h-1.5 w-1.5 rounded-full bg-primary"
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
