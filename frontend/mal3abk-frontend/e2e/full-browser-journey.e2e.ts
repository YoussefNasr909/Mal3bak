import { test, expect, type Locator, type Page } from "@playwright/test";
import { disconnectBrowserFixtures, seedBrowserScenario } from "./helpers/backend-fixtures";

const password = "Password123";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bilingualPattern(english: string | string[], arabic: string | string[], exact = false) {
  const values = [...(Array.isArray(english) ? english : [english]), ...(Array.isArray(arabic) ? arabic : [arabic])];
  const source = values.map(escapeRegExp).join("|");
  return new RegExp(exact ? `^(?:${source})$` : source, "i");
}

const patterns = {
  switchToEnglish: bilingualPattern("Switch to English", "\u0627\u0644\u062a\u0628\u062f\u064a\u0644 \u0625\u0644\u0649 \u0627\u0644\u0625\u0646\u062c\u0644\u064a\u0632\u064a\u0629"),
  signIn: bilingualPattern("Sign In", "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644", true),
  startBooking: bilingualPattern("Start booking", "\u0627\u0628\u062f\u0623 \u0627\u0644\u062d\u062c\u0632"),
  bookNow: bilingualPattern("Book now", "\u0627\u062d\u062c\u0632 \u0627\u0644\u0622\u0646"),
  bookCourt: bilingualPattern("Book court", "\u062d\u062c\u0632 \u0645\u0644\u0639\u0628"),
  confirmBooking: bilingualPattern("Confirm booking", "\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u062d\u062c\u0632"),
  cancel: bilingualPattern("Cancel", "\u0625\u0644\u063a\u0627\u0621", true),
  confirmCancel: bilingualPattern("Confirm Cancel", "\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0625\u0644\u063a\u0627\u0621"),
  cancelled: bilingualPattern("Cancelled", "\u0645\u0644\u063a\u064a"),
  registerTeam: bilingualPattern("Register team", "\u062a\u0633\u062c\u064a\u0644 \u0641\u0631\u064a\u0642", true),
  registerDialog: bilingualPattern(
    ["Register a new team", "Update and resubmit your team"],
    ["\u062a\u0633\u062c\u064a\u0644 \u0641\u0631\u064a\u0642 \u062c\u062f\u064a\u062f", "\u062a\u0639\u062f\u064a\u0644 \u0627\u0644\u0641\u0631\u064a\u0642 \u0648\u0625\u0639\u0627\u062f\u0629 \u0627\u0644\u0625\u0631\u0633\u0627\u0644"],
  ),
  pendingReview: bilingualPattern("Pending review", "\u0642\u064a\u062f \u0627\u0644\u0645\u0631\u0627\u062c\u0639\u0629"),
  addClosure: bilingualPattern("Add closure", "\u0625\u0636\u0627\u0641\u0629 \u0625\u063a\u0644\u0627\u0642"),
  courtClosures: bilingualPattern("Court closures", "\u0625\u063a\u0644\u0627\u0642\u0627\u062a \u0627\u0644\u0645\u0644\u0639\u0628"),
  manageCourtClosures: bilingualPattern("Manage court closures", "\u0625\u062f\u0627\u0631\u0629 \u0625\u063a\u0644\u0627\u0642\u0627\u062a \u0627\u0644\u0645\u0644\u0639\u0628"),
  createClosure: bilingualPattern("Create closure", "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0625\u063a\u0644\u0627\u0642"),
  bookingsTab: bilingualPattern("Bookings", "\u0627\u0644\u062d\u062c\u0648\u0632\u0627\u062a"),
  checkIn: bilingualPattern("Check In", ["\u062a\u0633\u062c\u064a\u0644 \u062d\u0636\u0648\u0631", "\u062a\u0633\u062c\u064a\u0644"], true),
  completed: bilingualPattern("Completed", "\u0645\u0643\u062a\u0645\u0644"),
  teamsTab: bilingualPattern("Teams", "\u0627\u0644\u0641\u0631\u0642", true),
  approve: bilingualPattern("Approve", "\u0645\u0648\u0627\u0641\u0642\u0629", true),
  approveTeam: bilingualPattern("Approve team", "\u0627\u0639\u062a\u0645\u0627\u062f \u0627\u0644\u0641\u0631\u064a\u0642"),
  approved: bilingualPattern("Approved", "\u0645\u0639\u062a\u0645\u062f"),
  closeRegistration: bilingualPattern("Close registration", "\u0625\u063a\u0644\u0627\u0642 \u0627\u0644\u062a\u0633\u062c\u064a\u0644"),
  bracketTab: bilingualPattern("Bracket", "\u0627\u0644\u0634\u062c\u0631\u0629", true),
  previewDraw: bilingualPattern("Preview draw", "\u0645\u0639\u0627\u064a\u0646\u0629 \u0627\u0644\u0642\u0631\u0639\u0629"),
  confirmDraw: bilingualPattern("Confirm draw", "\u062a\u0623\u0643\u064a\u062f \u0627\u0644\u0642\u0631\u0639\u0629"),
  generateBracket: bilingualPattern("Generate bracket", "\u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0634\u062c\u0631\u0629"),
  matchesTab: bilingualPattern("Matches", "\u0627\u0644\u0645\u0628\u0627\u0631\u064a\u0627\u062a", true),
  schedule: bilingualPattern("Schedule", "\u062c\u062f\u0648\u0644\u0629", true),
  scheduleMatch: bilingualPattern("Schedule match", "\u062c\u062f\u0648\u0644\u0629 \u0645\u0628\u0627\u0631\u0627\u0629"),
  saveSchedule: bilingualPattern("Save schedule", "\u062d\u0641\u0638 \u0627\u0644\u062c\u062f\u0648\u0644\u0629"),
  scheduled: bilingualPattern("Scheduled", "\u0645\u062c\u062f\u0648\u0644\u0629"),
};

function isoDatePlusDays(days: number) {
  const now = new Date();
  const cairoToday = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = cairoToday.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function dateTimeLocal(days: number, hour: number, minute = 0) {
  return `${isoDatePlusDays(days)}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

async function chooseBookingDate(page: Page, dialog: Locator, dateISO: string) {
  const dateTrigger = dialog.locator("#court-details-date-trigger, #browse-booking-date-trigger").first();
  await expect(dateTrigger).toBeVisible();
  await dateTrigger.click({ timeout: 15_000 });

  const datePicker = page.locator('[data-slot="popover-content"]').last();
  await expect(datePicker).toBeVisible();

  const dayButton = datePicker.locator(`button[data-iso-date="${dateISO}"]`).first();
  await expect(dayButton).toBeEnabled({ timeout: 15_000 });
  await dayButton.click({ timeout: 15_000 });
  await expect(datePicker).toBeHidden({ timeout: 15_000 });
}

async function switchToEnglishIfPossible(page: Page) {
  const englishToggle = page.getByRole("button", { name: patterns.switchToEnglish });
  if (await englishToggle.isVisible().catch(() => false)) {
    await englishToggle.click({ timeout: 15_000 });
    await page
      .waitForFunction(() => document.documentElement.dir === "ltr", undefined, { timeout: 5_000 })
      .catch(() => undefined);
  }
}

async function loginThroughUi(page: Page, email: string) {
  await page.goto("/auth/login");
  await switchToEnglishIfPossible(page);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await Promise.all([
    page.waitForURL(/\/dashboard\//),
    page.getByRole("button", { name: patterns.signIn }).click({ timeout: 15_000 }),
  ]);
  await switchToEnglishIfPossible(page);
}

async function activateTab(page: Page, name: RegExp) {
  const tab = page.getByRole("tab", { name });
  await expect(tab).toBeVisible();
  await tab.click({ timeout: 15_000 });
  await expect(tab).toHaveAttribute("data-state", "active");
}

async function openCourtActions(page: Page, courtName: string) {
  const card = page.locator("article, [class*='rounded']").filter({ hasText: courtName }).first();
  await expect(card).toBeVisible();

  let actionButton = card.locator(
    'button[aria-label="Court actions"], button[aria-label="إجراءات الملعب"], button[title="Court actions"], button[title="إجراءات الملعب"]',
  );

  if ((await actionButton.count()) === 0) {
    actionButton = card.locator("button").first();
  }

  await expect(actionButton.first()).toBeVisible();
  await actionButton.first().scrollIntoViewIfNeeded();
  await actionButton.first().click({ force: true, timeout: 15_000 });
}

async function findRowOrCard(scope: Page | Locator, text: string) {
  const row = scope.locator("tr").filter({ hasText: text }).first();
  if ((await row.count()) > 0) {
    return row;
  }

  return scope.locator("div").filter({ hasText: text }).first();
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await disconnectBrowserFixtures();
});

test("runs auth, booking, cancellation, manager check-in, closures, and tournaments in one seeded browser journey", async ({
  browser,
}) => {
  test.slow();

  const scenario = await seedBrowserScenario();
  const playerContext = await browser.newContext();
  const managerContext = await browser.newContext();
  const playerPage = await playerContext.newPage();
  const managerPage = await managerContext.newPage();

  try {
    await test.step("player logs in, books a court, and cancels the new booking", async () => {
      await loginThroughUi(playerPage, scenario.player.email);

      await playerPage.goto(`/dashboard/player/browse/${scenario.manager.courtId}`);
      await switchToEnglishIfPossible(playerPage);
      await expect(playerPage.getByRole("heading", { name: scenario.courtName })).toBeVisible();

      const startBookingButton = playerPage.getByRole("button", { name: patterns.startBooking });
      if (await startBookingButton.isVisible().catch(() => false)) {
        await startBookingButton.click({ timeout: 15_000 });
      } else {
        await playerPage.getByRole("button", { name: patterns.bookNow }).first().click({ timeout: 15_000 });
      }

      const bookingDialog = playerPage.getByRole("dialog");
      await expect(bookingDialog.getByText(patterns.bookCourt)).toBeVisible();
      await chooseBookingDate(playerPage, bookingDialog, isoDatePlusDays(1));

      const eveningSlot = bookingDialog.getByRole("button", { name: /8:00 PM|8:00 \u0645/i });
      if (await eveningSlot.isVisible().catch(() => false)) {
        await eveningSlot.click({ timeout: 15_000 });
      } else {
        await bookingDialog.locator('button[aria-disabled="false"]').filter({ hasText: /8:00/ }).first().click({ timeout: 15_000 });
      }

      await Promise.all([
        playerPage.waitForURL(/\/dashboard\/player\/bookings/),
        bookingDialog.getByRole("button", { name: patterns.confirmBooking }).click({ timeout: 15_000 }),
      ]);

      await switchToEnglishIfPossible(playerPage);
      await expect(playerPage.getByText(/8:00 PM|8:00 \u0645/i)).toBeVisible();
      await playerPage.getByRole("button", { name: patterns.cancel }).first().click({ timeout: 15_000 });

      const confirmDialog = playerPage.getByRole("alertdialog");
      await expect(confirmDialog).toBeVisible();
      await confirmDialog.getByRole("button", { name: patterns.confirmCancel }).click({ timeout: 15_000 });

      await expect(playerPage.getByText(patterns.cancelled)).toBeVisible();
    });

    await test.step("player registers a team from the tournament details screen", async () => {
      await playerPage.goto(`/dashboard/player/tournaments/${scenario.tournamentId}`);
      await switchToEnglishIfPossible(playerPage);
      await expect(playerPage.getByRole("button", { name: patterns.registerTeam })).toBeVisible();
      await playerPage.getByRole("button", { name: patterns.registerTeam }).click({ timeout: 15_000 });

      const registerDialog = playerPage.getByRole("dialog").filter({ has: playerPage.locator("#team-name") });
      await expect(registerDialog).toBeVisible();
      await registerDialog.locator("#team-name").fill(scenario.pendingTeamName);
      await registerDialog.locator("#partner-name").fill("Frontend Teammate");
      await registerDialog.locator("#partner-phone").fill("01234567891");
      await registerDialog.getByRole("button", { name: patterns.registerTeam }).click({ timeout: 15_000 });

      await expect(playerPage.getByText(patterns.pendingReview).first()).toBeVisible();
    });

    await test.step("manager logs in and creates a court closure", async () => {
      await loginThroughUi(managerPage, scenario.manager.email);

      await managerPage.goto("/dashboard/manager/courts");
      await switchToEnglishIfPossible(managerPage);
      await expect(managerPage.getByText(scenario.courtName)).toBeVisible();
      await openCourtActions(managerPage, scenario.courtName);

      const closuresMenuItem = managerPage.getByRole("menuitem", { name: patterns.courtClosures });
      await expect(closuresMenuItem).toBeVisible();
      await closuresMenuItem.click({ timeout: 15_000 });

      const closuresOverviewDialog = managerPage
        .getByRole("dialog")
        .filter({ has: managerPage.getByRole("button", { name: patterns.addClosure }) })
        .first();
      await expect(closuresOverviewDialog).toBeVisible();
      await closuresOverviewDialog.getByRole("button", { name: patterns.addClosure }).click({ timeout: 15_000 });

      const closureDialog = managerPage.getByRole("dialog").filter({ has: managerPage.locator("#closure-start") }).last();
      await expect(closureDialog).toBeVisible();
      await closureDialog.locator("#closure-start").fill(dateTimeLocal(3, 9, 0));
      await closureDialog.locator("#closure-end").fill(dateTimeLocal(3, 11, 0));
      await closureDialog.locator("#closure-reason").fill(scenario.closureReason);
      await closureDialog.getByRole("button", { name: patterns.createClosure }).click({ timeout: 15_000 });

      await expect(closureDialog.getByText(scenario.closureReason)).toBeVisible();
    });

    await test.step("manager checks in the seeded current-window booking", async () => {
      await managerPage.goto("/dashboard/manager/check-in");
      await switchToEnglishIfPossible(managerPage);
      await activateTab(managerPage, patterns.bookingsTab);

      const bookingRow = await findRowOrCard(managerPage, "Browser Player");
      await expect(bookingRow).toBeVisible();
      await bookingRow.getByRole("button", { name: patterns.checkIn }).click({ timeout: 15_000 });

      await expect(bookingRow.getByText(patterns.completed)).toBeVisible();
    });

    await test.step("manager approves the new team, closes registration, generates the bracket, and schedules the match", async () => {
      await managerPage.goto(`/dashboard/manager/tournaments/${scenario.tournamentId}`);
      await switchToEnglishIfPossible(managerPage);

      await activateTab(managerPage, patterns.teamsTab);
      const pendingTeamRow = await findRowOrCard(managerPage, scenario.pendingTeamName);
      await expect(pendingTeamRow).toBeVisible();
      await pendingTeamRow.getByRole("button", { name: patterns.approve }).click({ timeout: 15_000 });
      const approveDialog = managerPage
        .getByRole("dialog")
        .filter({ hasText: /Review and approve team|مراجعة واعتماد الفريق/i })
        .last();
      await expect(approveDialog).toBeVisible();
      await approveDialog.getByRole("button", { name: patterns.approveTeam }).click({ timeout: 15_000 });
      await expect(managerPage.getByRole("button", { name: patterns.approve })).toHaveCount(0);

      const closeRegistrationButton = managerPage.getByRole("button", { name: patterns.closeRegistration });
      if (await closeRegistrationButton.isVisible().catch(() => false)) {
        await closeRegistrationButton.click({ timeout: 15_000 });
      }
      await activateTab(managerPage, patterns.bracketTab);
      await expect(managerPage.getByRole("button", { name: patterns.previewDraw }).first()).toBeVisible();
      await managerPage.getByRole("button", { name: patterns.previewDraw }).first().click({ timeout: 15_000 });
      const confirmDrawButton = managerPage.getByRole("button", { name: patterns.confirmDraw }).first();
      await expect(confirmDrawButton).toBeEnabled({ timeout: 15_000 });
      await confirmDrawButton.click({ timeout: 15_000 });

      await activateTab(managerPage, patterns.matchesTab);
      const matchCard = managerPage
        .locator('[data-slot="card"]')
        .filter({ has: managerPage.getByRole("button", { name: patterns.schedule }) })
        .filter({ hasText: scenario.approvedTeamName })
        .filter({ hasText: scenario.pendingTeamName })
        .first();
      await expect(matchCard).toBeVisible();
      const scheduleButton = matchCard.getByRole("button", { name: patterns.schedule }).first();
      await expect(scheduleButton).toBeVisible();
      await scheduleButton.click({ timeout: 15_000 });

      const scheduleDialog = managerPage.getByRole("dialog").filter({ has: managerPage.locator("#schedule-court") });
      await expect(scheduleDialog).toBeVisible();
      await scheduleDialog.locator("#schedule-court").selectOption({ label: scenario.courtName });
      await scheduleDialog.locator('input[type="datetime-local"]').nth(0).fill(scenario.scheduleStartLocal);
      await scheduleDialog.locator('input[type="datetime-local"]').nth(1).fill(scenario.scheduleEndLocal);
      await scheduleDialog.getByRole("button", { name: patterns.saveSchedule }).click({ timeout: 15_000 });

      await activateTab(managerPage, patterns.matchesTab);
      const scheduledMatchCard = managerPage
        .locator('[data-slot="card"]')
        .filter({ hasText: scenario.approvedTeamName })
        .filter({ hasText: scenario.pendingTeamName })
        .filter({ hasText: patterns.scheduled })
        .first();
      await expect(scheduledMatchCard).toBeVisible();
    });
  } finally {
    await playerContext.close();
    await managerContext.close();
  }
});
