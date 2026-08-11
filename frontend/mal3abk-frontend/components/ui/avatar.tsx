'use client'

import * as React from 'react'
import * as AvatarPrimitive from '@radix-ui/react-avatar'

import { cn } from '@/lib/utils'

const localAvatarHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

function getSafeAvatarSrc(src?: string) {
  if (!src) return undefined

  const value = src.trim()
  if (!value) return undefined
  if (value.startsWith('/')) return value

  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'https:') return value
    if (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:' && localAvatarHosts.has(parsed.hostname.toLowerCase())) {
      return value
    }
  } catch {
    return undefined
  }

  return undefined
}

function Avatar({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        'relative flex size-8 shrink-0 overflow-hidden rounded-full',
        className,
      )}
      {...props}
    />
  )
}

function AvatarImage({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  const safeSrc = typeof props.src === 'string' ? getSafeAvatarSrc(props.src) : props.src

  return (
    <AvatarPrimitive.Image
      data-slot="avatar-image"
      className={cn('aspect-square size-full', className)}
      {...props}
      src={safeSrc}
    />
  )
}

function AvatarFallback({
  className,
  ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      data-slot="avatar-fallback"
      className={cn(
        'bg-muted flex size-full items-center justify-center rounded-full',
        className,
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback }

