"use client"

export const PUSH_NOTIFICATION_ID_PARAM = "pushNotificationId"
export const PUSH_SERVICE_WORKER_PATH = "/push-sw.js"

export type BrowserPushSupportReason =
  | "unsupported"
  | "secure_context_required"
  | "ios_install_required"
  | null

export type BrowserPushSupportState = {
  supported: boolean
  reason: BrowserPushSupportReason
}

const SERVICE_WORKER_READY_TIMEOUT_MS = 15_000
const PUSH_SUBSCRIBE_RETRY_DELAY_MS = 750

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") return false

  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    (typeof navigator !== "undefined" && "standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  )
}

function isAppleMobileBrowser() {
  if (typeof navigator === "undefined") return false
  return /iPad|iPhone|iPod/i.test(navigator.userAgent)
}

export function isBraveDesktopBrowser() {
  if (typeof navigator === "undefined") return false
  const maybeBrave = navigator as Navigator & { brave?: unknown }
  return Boolean(maybeBrave.brave) && !isAppleMobileBrowser()
}

export function getBrowserPushSupport(): BrowserPushSupportState {
  if (typeof window === "undefined") {
    return { supported: false, reason: "unsupported" }
  }

  if (!window.isSecureContext) {
    return { supported: false, reason: "secure_context_required" }
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { supported: false, reason: "unsupported" }
  }

  if (isAppleMobileBrowser() && !isStandaloneDisplayMode()) {
    return { supported: false, reason: "ios_install_required" }
  }

  return { supported: true, reason: null }
}

export function getPushPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported"
  }

  return Notification.permission
}

export async function registerPushServiceWorker() {
  const support = getBrowserPushSupport()
  if (!support.supported) return null

  const registration = await navigator.serviceWorker.register(PUSH_SERVICE_WORKER_PATH, {
    scope: "/",
    updateViaCache: "none",
  })

  return waitForReadyRegistration(registration)
}

function isRegistrationActive(registration: ServiceWorkerRegistration | null) {
  return Boolean(registration?.active)
}

async function waitForReadyRegistration(registration: ServiceWorkerRegistration | null) {
  if (!registration) return null
  if (isRegistrationActive(registration)) return registration

  const readyPromise = navigator.serviceWorker.ready.catch(() => null)
  const timeoutPromise = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), SERVICE_WORKER_READY_TIMEOUT_MS)
  })

  const readyRegistration = await Promise.race([readyPromise, timeoutPromise])
  return readyRegistration && isRegistrationActive(readyRegistration) ? readyRegistration : null
}

async function getPushRegistration() {
  const existing = await navigator.serviceWorker.getRegistration()
  if (existing) {
    return waitForReadyRegistration(existing)
  }

  return registerPushServiceWorker()
}

export async function getExistingPushSubscription() {
  const registration = await getPushRegistration()
  if (!registration) return null
  return registration.pushManager.getSubscription()
}

function base64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index)
  }

  return output
}

function isPushAbortError(error: unknown) {
  return typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError"
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function subscribeWithRegistration(
  registration: ServiceWorkerRegistration,
  vapidPublicKey: string,
) {
  const existing = await registration.pushManager.getSubscription()
  if (existing) return existing

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64ToUint8Array(vapidPublicKey),
  })
}

export async function subscribeToPush(vapidPublicKey: string) {
  const registration = await getPushRegistration()
  if (!registration) {
    throw new Error("Push service worker could not be registered")
  }

  const readyRegistration = await waitForReadyRegistration(registration)
  if (!readyRegistration) {
    throw new Error("Push service worker is not ready yet")
  }

  try {
    return await subscribeWithRegistration(readyRegistration, vapidPublicKey)
  } catch (error) {
    if (!isPushAbortError(error)) {
      throw error
    }

    await wait(PUSH_SUBSCRIBE_RETRY_DELAY_MS)
    const retriedRegistration = await waitForReadyRegistration(await getPushRegistration())
    if (!retriedRegistration) {
      throw error
    }

    return subscribeWithRegistration(retriedRegistration, vapidPublicKey)
  }
}

export async function unsubscribeFromPush() {
  const subscription = await getExistingPushSubscription()
  if (!subscription) return null

  await subscription.unsubscribe()
  return subscription
}

export function serializePushSubscription(subscription: PushSubscription) {
  const json = subscription.toJSON()

  return {
    endpoint: subscription.endpoint,
    p256dhKey: json.keys?.p256dh || "",
    authKey: json.keys?.auth || "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  }
}
