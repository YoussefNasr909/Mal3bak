export async function navigateToLogoutRoute(pathname = "/auth/logout") {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000)
    await fetch(pathname, { 
      method: "POST", 
      cache: "no-store",
      signal: controller.signal 
    })
    clearTimeout(timeoutId)
  } catch (e) {
    // Ignore network errors during logout
  }
}
