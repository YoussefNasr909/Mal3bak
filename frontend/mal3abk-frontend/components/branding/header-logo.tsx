"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

type HeaderLogoProps = {
  language: "ar" | "en"
  className?: string
  imageClassName?: string
  priority?: boolean
}

export function HeaderLogo({
  language,
  className,
  imageClassName,
  priority = false,
}: HeaderLogoProps) {
  const [hasImageError, setHasImageError] = useState(false)
  const alt = language === "ar" ? "ملعبك" : "Mal3bk"
  const sharedImageProps = {
    fill: true,
    sizes: "156px",
    priority,
    draggable: false,
  }

  useEffect(() => {
    setHasImageError(false)
  }, [language])

  return (
    <div className={cn("relative h-10 w-[126px] shrink-0 overflow-hidden", className)}>
      {hasImageError ? (
        <div className="flex h-full w-full items-center gap-2 rounded-full border border-border/50 bg-background/75 px-2.5 text-foreground shadow-sm backdrop-blur-sm">
          <Image
            src="/mal3bk-logo.svg"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0"
            draggable={false}
            unoptimized
          />
          <span className="truncate text-sm font-extrabold tracking-tight">{alt}</span>
        </div>
      ) : (
        <>
          <Image
            src="/mal3bk-logo-dark-header.webp"
            alt={alt}
            {...sharedImageProps}
            onError={() => setHasImageError(true)}
            className={cn(
              "absolute inset-0 h-full w-full object-contain object-left dark:hidden",
              imageClassName,
            )}
          />
          <Image
            src="/mal3bk-logo-header.webp"
            alt={alt}
            {...sharedImageProps}
            onError={() => setHasImageError(true)}
            className={cn(
              "absolute inset-0 hidden h-full w-full object-contain object-left dark:block",
              imageClassName,
            )}
          />
        </>
      )}
    </div>
  )
}
