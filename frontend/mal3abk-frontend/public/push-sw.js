const PUSH_NOTIFICATION_ID_PARAM = "pushNotificationId"

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

function isArabicLanguage() {
  return String(self.navigator?.language || "").toLowerCase().startsWith("ar")
}

function buildTargetUrl(url, notificationId) {
  const target = new URL(url || "/dashboard/notifications", self.location.origin)
  if (notificationId) {
    target.searchParams.set(PUSH_NOTIFICATION_ID_PARAM, notificationId)
  }
  return target.toString()
}

self.addEventListener("push", (event) => {
  if (!event.data) return

  let payload = {}
  try {
    payload = event.data.json()
  } catch {
    payload = {}
  }

  const useArabic = isArabicLanguage()
  const title = useArabic && payload.titleAr ? payload.titleAr : payload.title || "Mal3bk"
  const body = useArabic && payload.bodyAr ? payload.bodyAr : payload.body || ""

  event.waitUntil((async () => {
    if (typeof self.registration?.showNotification === "function") {
      await self.registration.showNotification(title, {
        body,
        icon: payload.icon || "/icon.png",
        badge: payload.badge || "/icon.png",
        tag: payload.tag || `mal3bk:${payload.notificationId || Date.now()}`,
        renotify: payload.priority === "urgent",
        lang: useArabic ? "ar" : "en",
        dir: useArabic ? "rtl" : "ltr",
        data: {
          url: payload.url || "/dashboard/notifications",
          notificationId: payload.notificationId || null,
        },
      })
    }

    if (typeof self.navigator?.setAppBadge === "function") {
      try {
        await self.navigator.setAppBadge(1)
      } catch {}
    }
  })())
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()

  const url = buildTargetUrl(
    event.notification?.data?.url,
    event.notification?.data?.notificationId,
  )

  event.waitUntil((async () => {
    const clientsList = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    })

    for (const client of clientsList) {
      if (!client.url.startsWith(self.location.origin)) continue

      if (typeof client.navigate === "function") {
        await client.navigate(url)
      }
      await client.focus()
      return
    }

    await self.clients.openWindow(url)
  })())
})
