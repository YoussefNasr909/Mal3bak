import { test, expect, type Page } from "@playwright/test"

import { disconnectBrowserFixtures, seedBrowserScenario } from "./helpers/backend-fixtures"

const password = "Password123"

async function switchToEnglishIfPossible(page: Page) {
  const englishToggle = page.getByRole("button", { name: /Switch to English|التبديل إلى الإنجليزية/i })
  if (await englishToggle.isVisible().catch(() => false)) {
    await englishToggle.click({ timeout: 15_000 })
    await page
      .waitForFunction(() => document.documentElement.dir === "ltr", undefined, { timeout: 5_000 })
      .catch(() => undefined)
  }
}

async function loginThroughUi(page: Page, email: string) {
  await page.goto("/auth/login")
  await switchToEnglishIfPossible(page)
  await page.locator("#login-email").fill(email)
  await page.locator("#login-password").fill(password)
  await Promise.all([
    page.waitForURL(/\/dashboard\//),
    page.getByRole("button", { name: /Sign In|تسجيل الدخول/i }).click({ timeout: 15_000 }),
  ])
  await switchToEnglishIfPossible(page)
}

test.describe.configure({ mode: "serial" })

test.afterAll(async () => {
  await disconnectBrowserFixtures()
})

test("manager logout stays on the login page without bouncing back into the dashboard", async ({ page }) => {
  const scenario = await seedBrowserScenario()

  await loginThroughUi(page, scenario.manager.email)
  await expect(page).toHaveURL(/\/dashboard\/manager/)

  const logoutButton = page.getByRole("button", { name: /Logout/i }).first()
  await expect(logoutButton).toBeVisible()

  await Promise.all([
    page.waitForURL(/\/auth\/login/),
    logoutButton.click({ timeout: 15_000 }),
  ])

  await expect(page.locator("#login-email")).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/login$/)

  await page.waitForTimeout(1500)
  await expect(page).toHaveURL(/\/auth\/login$/)

  await page.reload()
  await expect(page.locator("#login-email")).toBeVisible()
  await expect(page).toHaveURL(/\/auth\/login$/)
})
