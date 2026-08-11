import path from "node:path";
import { pathToFileURL } from "node:url";

const backendEnv = process.env as Record<string, string | undefined>;
const frontendRoot = process.cwd();
const workspaceRoot = path.resolve(frontendRoot, "..");
const backendRoot = backendEnv.E2E_BACKEND_DIR
  ? path.resolve(backendEnv.E2E_BACKEND_DIR)
  : path.join(workspaceRoot, "mal3abi-backend");
const backendApiBaseUrl = backendEnv.E2E_BACKEND_BASE_URL || "http://127.0.0.1:4000/api/v1";
const frontendOrigin = backendEnv.E2E_FRONTEND_ORIGIN || "http://localhost:3000";
const defaultE2eDatabaseUrl = "postgresql://postgres:omar@localhost:5432/mal3abk_test?schema=public";

backendEnv.NODE_ENV = "test";
backendEnv.TZ ??= "Africa/Cairo";
backendEnv.HOST ??= "127.0.0.1";
backendEnv.PORT ??= "4000";
backendEnv.FRONTEND_URL ??= `${frontendOrigin},http://127.0.0.1:3000`;
backendEnv.DATABASE_URL = backendEnv.E2E_DATABASE_URL || backendEnv.DATABASE_URL || defaultE2eDatabaseUrl;
backendEnv.JWT_SECRET ??= "test-secret-key-12345";
backendEnv.JWT_REFRESH_SECRET ??= "test-refresh-secret-12345";

type SeededAccount = {
  email: string;
  token: string;
  userId: string;
};

type SeededManager = SeededAccount & {
  courtId: string;
  managerId: string;
};

type BackendModules = {
  app: any;
  prisma: any;
  createPlayerBooking: (
    app: any,
    playerToken: string,
    courtId: string,
    date: string,
    startTime: string,
    endTime: string,
  ) => Promise<any>;
  seedManagerWith24hCourt: (app: any) => Promise<{
    email: string;
    token: string;
    courtId: string;
    managerId: string;
  }>;
  seedPlayer: (
    app: any,
    prefix?: string,
    options?: Record<string, unknown>,
  ) => Promise<{
    email: string;
    token: string;
    userId: string;
  }>;
};

export type BrowserScenario = {
  manager: SeededManager;
  player: SeededAccount;
  approvedCaptain: SeededAccount;
  courtName: string;
  tournamentId: string;
  approvedTeamName: string;
  pendingTeamName: string;
  closureReason: string;
  currentWindowBookingId: string;
  scheduleStartLocal: string;
  scheduleEndLocal: string;
};

const BACKEND_BASE_URL = backendApiBaseUrl;
const ORIGIN = frontendOrigin;
let backendModulesPromise: Promise<BackendModules> | null = null;

function describeDatabaseUrl(raw: string | undefined) {
  try {
    const url = new URL(raw || "");
    const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
    const port = url.port ? `:${url.port}` : "";
    return `${url.protocol}//${url.hostname}${port}/${dbName}`;
  } catch {
    return "<invalid DATABASE_URL>";
  }
}

function assertSafeE2eDatabaseUrl(raw: string | undefined) {
  const url = new URL(raw || "");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const dbName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  const isPostgres = url.protocol === "postgres:" || url.protocol === "postgresql:";
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const isTestDatabase = /test/i.test(dbName);

  if (!isPostgres || !isLocal || !isTestDatabase) {
    throw new Error(
      `[e2e] Refusing to reset database. DATABASE_URL must point to a local PostgreSQL test database. Current target: ${describeDatabaseUrl(raw)}`,
    );
  }
}

assertSafeE2eDatabaseUrl(backendEnv.DATABASE_URL);

function toCairoDateTimeLocalValue(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const hour = get("hour") === "24" ? "00" : get("hour");

  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

async function loadBackendModules(): Promise<BackendModules> {
  if (!backendModulesPromise) {
    backendModulesPromise = (async () => {
      const appModuleUrl = pathToFileURL(path.join(backendRoot, "src", "app.js")).href;
      const prismaModuleUrl = pathToFileURL(path.join(backendRoot, "src", "db", "prisma.js")).href;
      const fixturesModuleUrl = pathToFileURL(
        path.join(backendRoot, "tests", "helpers", "integration-fixtures.js"),
      ).href;
      const [{ app }, { prisma }, fixtures] = await Promise.all([
        import(appModuleUrl),
        import(prismaModuleUrl),
        import(fixturesModuleUrl),
      ]);

      return {
        app,
        prisma,
        createPlayerBooking: fixtures.createPlayerBooking,
        seedManagerWith24hCourt: fixtures.seedManagerWith24hCourt,
        seedPlayer: fixtures.seedPlayer,
      };
    })();
  }

  return backendModulesPromise;
}

function getCairoDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(value);

  const readPart = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return {
    year: Number(readPart("year")),
    month: Number(readPart("month")),
    day: Number(readPart("day")),
    hour: Number(readPart("hour")),
    minute: Number(readPart("minute")),
  };
}

function cairoIsoDate(daysFromToday = 0) {
  const now = new Date();
  const cairoNow = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [year, month, day] = cairoNow.split("-").map(Number);
  const value = new Date(Date.UTC(year, month - 1, day + daysFromToday));
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function minutesToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getCurrentCairoCheckInWindowSlot() {
  const now = getCairoDateParts();
  const startMinutes = now.hour * 60;
  const endMinutes = (startMinutes + 60) % (24 * 60);

  return {
    date: `${String(now.year).padStart(4, "0")}-${String(now.month).padStart(2, "0")}-${String(now.day).padStart(2, "0")}`,
    startTime: minutesToTime(startMinutes),
    endTime: minutesToTime(endMinutes),
  };
}

async function apiRequest<T>(
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<T> {
  const headers = new Headers(init.headers || {});
  headers.set("Origin", ORIGIN);

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (init.token) {
    headers.set("Cookie", init.token);
  }

  const response = await fetch(`${BACKEND_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `API ${init.method || "GET"} ${path} failed with ${response.status}: ${JSON.stringify(body)}`,
    );
  }

  return body as T;
}

async function resetDatabase() {
  assertSafeE2eDatabaseUrl(backendEnv.DATABASE_URL);
  const { prisma } = await loadBackendModules();
  await prisma.favorite.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.tournamentMatch.deleteMany();
  await prisma.tournamentTeam.deleteMany();
  await prisma.tournamentCourt.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.courtClosure.deleteMany();
  await prisma.court.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
}

export async function disconnectBrowserFixtures() {
  const { prisma } = await loadBackendModules();
  await prisma.$disconnect();
}

export async function seedBrowserScenario(): Promise<BrowserScenario> {
  const { app, prisma, createPlayerBooking, seedManagerWith24hCourt, seedPlayer } =
    await loadBackendModules();
  await resetDatabase();

  const managerSeed = await seedManagerWith24hCourt(app);
  const playerSeed = await seedPlayer(app, "browser_player");
  const approvedCaptainSeed = await seedPlayer(app, "browser_rival");

  const courtName = "Browser E2E Court";
  const playerName = "Browser Player";
  const approvedCaptainName = "Rival Captain";

  await prisma.court.update({
    where: { id: managerSeed.courtId },
    data: {
      name: courtName,
      nameEn: courtName,
    },
  });

  await prisma.user.update({
    where: { id: playerSeed.userId },
    data: { name: playerName },
  });

  await prisma.user.update({
    where: { id: approvedCaptainSeed.userId },
    data: { name: approvedCaptainName },
  });

  const checkInBooking = await createPlayerBooking(
    app,
    playerSeed.token,
    managerSeed.courtId,
    cairoIsoDate(1),
    "09:00",
    "10:00",
  );

  if (checkInBooking.status !== 201) {
    throw new Error(`Could not seed check-in booking: ${JSON.stringify(checkInBooking.body)}`);
  }

  const currentWindow = getCurrentCairoCheckInWindowSlot();

  await prisma.booking.update({
    where: { id: checkInBooking.body.booking.id },
    data: {
      date: currentWindow.date,
      startTime: currentWindow.startTime,
      endTime: currentWindow.endTime,
      status: "confirmed",
      checkInVerified: false,
      checkedIn: false,
      checkedInAt: null,
    },
  });

  const tournamentStart = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  tournamentStart.setUTCHours(12, 0, 0, 0);
  const tournamentEnd = new Date(tournamentStart.getTime() + 4 * 60 * 60 * 1000);
  const scheduleStart = new Date(tournamentStart);
  const scheduleEnd = new Date(scheduleStart.getTime() + 60 * 60 * 1000);
  const registrationOpenAt = new Date(Date.now() - 60 * 60 * 1000);
  const registrationCloseAt = new Date(tournamentStart.getTime() - 60 * 60 * 1000);

  const tournamentCreate = await apiRequest<{ tournament: { id: string } }>("/tournaments", {
    method: "POST",
    token: managerSeed.token,
    body: JSON.stringify({
      title: "Browser Flow Championship",
      titleAr: "بطولة رحلة المتصفح",
      description: "Tournament created for the seeded browser flow.",
      descriptionAr: "بطولة مخصصة لاختبار رحلة المتصفح.",
      maxTeams: 2,
      teamsPerGroup: 2,
      entryFee: 250,
      registrationOpenAt: registrationOpenAt.toISOString(),
      registrationCloseAt: registrationCloseAt.toISOString(),
      startDate: tournamentStart.toISOString(),
      endDate: tournamentEnd.toISOString(),
      rules: "Best of three sets",
      courtIds: [managerSeed.courtId],
    }),
  });

  const tournamentId = tournamentCreate.tournament.id;

  await apiRequest(`/tournaments/${tournamentId}/publish`, {
    method: "POST",
    token: managerSeed.token,
    body: JSON.stringify({}),
  });

  await apiRequest(`/tournaments/${tournamentId}/open-registration`, {
    method: "POST",
    token: managerSeed.token,
    body: JSON.stringify({}),
  });

  const approvedTeamName = "Rival Ready Team";
  const approvedRegistration = await apiRequest<{ team: { id: string } }>(
    `/tournaments/${tournamentId}/register`,
    {
      method: "POST",
      token: approvedCaptainSeed.token,
      body: JSON.stringify({
        teamName: approvedTeamName,
        partnerName: "Rival Partner",
        partnerPhone: "01234567890",
      }),
    },
  );

  await apiRequest(`/tournaments/${tournamentId}/teams/${approvedRegistration.team.id}/approve`, {
    method: "POST",
    token: managerSeed.token,
    body: JSON.stringify({}),
  });

  return {
    manager: {
      email: managerSeed.email,
      token: managerSeed.token,
      userId: managerSeed.managerId,
      courtId: managerSeed.courtId,
      managerId: managerSeed.managerId,
    },
    player: {
      email: playerSeed.email,
      token: playerSeed.token,
      userId: playerSeed.userId,
    },
    approvedCaptain: {
      email: approvedCaptainSeed.email,
      token: approvedCaptainSeed.token,
      userId: approvedCaptainSeed.userId,
    },
    courtName,
    tournamentId,
    approvedTeamName,
    pendingTeamName: "Browser Duo",
    closureReason: "Browser maintenance window",
    currentWindowBookingId: checkInBooking.body.booking.id,
    scheduleStartLocal: toCairoDateTimeLocalValue(scheduleStart),
    scheduleEndLocal: toCairoDateTimeLocalValue(scheduleEnd),
  };
}
