import { test, expect, type Page } from "@playwright/test"

const ACCESS_TOKEN_COOKIE = "mal3abi_access_token"
const REFRESH_TOKEN_COOKIE = "mal3abi_refresh_token"
const PASSWORD = "Password123"

type Account = {
  name: string
  email: string
  formattedEmail: string
  phone: string
  formattedPhone: string
  password: string
}

function createAccount(prefix: string): Account {
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`
  const uniqueDigits = stamp.slice(-8)
  const phone = `010${uniqueDigits}`

  return {
    name: `Test ${prefix}`,
    email: `${prefix}_${stamp}@example.com`,
    formattedEmail: `  ${prefix}_${stamp}@EXAMPLE.com  `,
    phone,
    formattedPhone: `+20 10${uniqueDigits.slice(1, 3)}-${uniqueDigits.slice(3, 6)}-${uniqueDigits.slice(6)}`,
    password: PASSWORD,
  }
}

async function switchToEnglishIfPossible(page: Page) {
  const englishToggle = page.getByRole("button").filter({ hasText: /^AR$/ }).first()

  if (await englishToggle.isVisible().catch(() => false)) {
    await englishToggle.click({ timeout: 15_000 })
    await page
      .waitForFunction(() => document.documentElement.dir === "ltr", undefined, {
        timeout: 5_000,
      })
      .catch(() => undefined)
  }
}

async function openRegister(page: Page) {
  await page.goto("/auth/register")
  await switchToEnglishIfPossible(page)
  await expect(page.locator("[data-auth-submit='register']")).toBeEnabled()
}

async function openLogin(page: Page) {
  await page.goto("/auth/login")
  await switchToEnglishIfPossible(page)
  await expect(page.locator("[data-auth-submit='login']")).toBeEnabled()
}

async function fillRegistration(page: Page, account: Account, overrides: Partial<Account> = {}) {
  const values = { ...account, ...overrides }
  await page.locator("#register-name").fill(values.name)
  await page.locator("#register-email").fill(values.formattedEmail)
  await page.locator("#register-phone").fill(values.formattedPhone)
  await page.locator("#register-password").fill(values.password)
  await page.locator("#register-confirm-password").fill(values.password)
}

async function fillLogin(page: Page, email: string, password: string) {
  await page.locator("#login-email").fill(email)
  await page.locator("#login-password").fill(password)
}

async function expectNoHorizontalOverflow(page: Page) {
  const hasOverflow = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth + 1
  })

  expect(hasOverflow).toBeFalsy()
}

async function clearBrowserSession(page: Page) {
  await page.context().clearCookies()
  await page.evaluate(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })
}

async function submitRegistrationAndExpectDashboard(page: Page) {
  await Promise.all([
    page.waitForURL(/\/dashboard\/player/),
    page.locator("[data-auth-submit='register']").click(),
  ])
  await expect(page).toHaveURL(/\/dashboard\/player/)
}

test("registration blocks empty, weak, and mismatched submissions", async ({ page }) => {
  const account = createAccount("validation")

  await openRegister(page)
  await page.locator("[data-auth-submit='register']").click()

  await expect(page.locator("#register-name-error")).toBeVisible()
  await expect(page.locator("#register-email-error")).toBeVisible()
  await expect(page.locator("#register-phone-error")).toBeVisible()
  await expect(page.locator("#register-password-error")).toBeVisible()

  await page.locator("#register-name").fill(account.name)
  await page.locator("#register-email").fill(account.formattedEmail)
  await page.locator("#register-phone").fill(account.formattedPhone)
  await page.locator("#register-password").fill("short")
  await page.locator("#register-confirm-password").fill("short")
  await page.locator("[data-auth-submit='register']").click()

  await expect(page.locator("#register-password-error")).toBeVisible()

  await page.locator("#register-password").fill(account.password)
  await page.locator("#register-confirm-password").fill("Password124")
  await page.locator("[data-auth-submit='register']").click()

  await expect(page.locator("#register-confirm-password-error")).toBeVisible()
})

test("valid registration normalizes input, signs in, and blocks duplicate email reuse", async ({
  page,
}) => {
  const account = createAccount("register")

  await openRegister(page)
  await fillRegistration(page, account, {
    name: `  ${account.name}  `,
  })

  await submitRegistrationAndExpectDashboard(page)
  const registrationCookies = await page.context().cookies()
  expect(registrationCookies.some((cookie) => cookie.name === ACCESS_TOKEN_COOKIE)).toBeTruthy()

  await clearBrowserSession(page)
  await openRegister(page)
  await fillRegistration(page, account, {
    phone: `011${account.phone.slice(-8)}`,
    formattedPhone: `011${account.phone.slice(-8)}`,
  })
  await page.locator("[data-auth-submit='register']").click()

  await expect(page.locator("#register-email-error")).toBeVisible()
})

test("protected routes redirect to login, invalid login fails, valid login persists, and logout clears the session", async ({
  page,
}) => {
  const account = createAccount("login")

  await openRegister(page)
  await fillRegistration(page, account)
  await submitRegistrationAndExpectDashboard(page)
  await clearBrowserSession(page)

  await page.goto("/dashboard/player/bookings")
  await switchToEnglishIfPossible(page)
  await expect(page.locator("[data-auth-submit='login']")).toBeEnabled()
  await expect(page).toHaveURL(/\/auth\/login\?redirect=/)

  await fillLogin(page, account.email, "WrongPassword123")
  await page.locator("[data-auth-submit='login']").click()
  await expect(page.locator("form [role='alert']")).toBeVisible()

  await fillLogin(page, account.formattedEmail, account.password)
  await Promise.all([
    page.waitForURL(/\/dashboard\/player\/bookings/),
    page.locator("[data-auth-submit='login']").click(),
  ])

  const loginCookies = await page.context().cookies()
  expect(loginCookies.some((cookie) => cookie.name === ACCESS_TOKEN_COOKIE)).toBeTruthy()
  expect(loginCookies.some((cookie) => cookie.name === REFRESH_TOKEN_COOKIE)).toBeTruthy()

  await page.reload()
  await expect(page).toHaveURL(/\/dashboard\/player\/bookings/)

  const logoutButton = page.getByRole("button", { name: /Logout|تسجيل الخروج/i }).first()
  await expect(logoutButton).toBeVisible()

  await Promise.all([
    page.waitForURL(/\/auth\/login$/),
    logoutButton.click({ timeout: 15_000 }),
  ])

  const logoutCookies = await page.context().cookies()
  expect(logoutCookies.some((cookie) => cookie.name === ACCESS_TOKEN_COOKIE)).toBeFalsy()
  expect(logoutCookies.some((cookie) => cookie.name === REFRESH_TOKEN_COOKIE)).toBeFalsy()

  await page.reload()
  await expect(page).toHaveURL(/\/auth\/login$/)
})

test("login shows a visible error when the backend request fails", async ({ page }) => {
  const account = createAccount("network")

  await openRegister(page)
  await fillRegistration(page, account)
  await submitRegistrationAndExpectDashboard(page)
  await clearBrowserSession(page)

  await openLogin(page)
  await page.route("**/api/v1/auth/login", async (route) => {
    await route.abort("failed")
  })

  await fillLogin(page, account.email, account.password)
  await page.locator("[data-auth-submit='login']").click()

  await expect(page.locator("form [role='alert']")).toBeVisible()
})

test("auth screens stay usable on a mobile viewport and preserve cross-links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  await openRegister(page)
  await expect(page.locator("#register-email")).toBeVisible()
  await expect(page.locator("a[href='/auth/login']")).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.locator("a[href='/auth/login']").click()
  await page.waitForURL(/\/auth\/login/)
  await expect(page.locator("#login-email")).toBeVisible()
  await expect(page.locator("a[href='/auth/forgot-password']")).toBeVisible()
  await expect(page.locator("a[href='/auth/register']")).toBeVisible()
  await expectNoHorizontalOverflow(page)

  await page.locator("a[href='/auth/forgot-password']").click()
  await page.waitForURL(/\/auth\/forgot-password/)
  await expect(page.locator("#forgot-email")).toBeVisible()
  await expectNoHorizontalOverflow(page)
})
