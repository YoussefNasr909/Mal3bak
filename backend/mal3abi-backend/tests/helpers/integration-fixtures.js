import request from "supertest";
import { prisma } from "../../src/db/prisma.js";

export const ORIGIN = "http://localhost:3000";

export function cookieFromLogin(loginRes) {
  const raw = loginRes.headers["set-cookie"]?.[0];
  if (!raw) throw new Error("Expected Set-Cookie header from login");
  return raw.split(";")[0];
}

export function tomorrowDateStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Fresh digit suffix for phones (DB unique per test after global truncate).
 */
export function uniquePhone(prefix = "010") {
  const n = `${Date.now()}${Math.floor(Math.random() * 10000)}`.slice(-8);
  return `${prefix}${n}`;
}

export async function register(app, { name, email, phone, password = "Password123" }) {
  return request(app).post("/api/v1/auth/register").set("Origin", ORIGIN).send({
    name,
    email,
    phone,
    password,
  });
}

export async function login(app, email, password = "Password123") {
  return request(app).post("/api/v1/auth/login").set("Origin", ORIGIN).send({ email, password });
}

/**
 * After register, `findByEmail` / `findById` inside login→me can briefly lag behind the
 * row our test client already saw. Retry 401/404 only (known-good password in seed helpers).
 */
export async function loginUntilOk(app, email, password = "Password123", attempts = 25, delayMs = 40) {
  let last;
  for (let i = 0; i < attempts; i += 1) {
    last = await login(app, email, password);
    if (last.status === 200) return last;
    const transient = last.status === 404 || last.status === 401 || last.status === 403;
    if (transient && i < attempts - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
      continue;
    }
    return last;
  }
  return last;
}

export async function promoteRole(email, role) {
  await prisma.user.update({ where: { email }, data: { role } });
}

/** Postgres + Prisma can briefly return 201 before a follow-up query sees the row (observed under parallel truncates). */
export async function waitForUserRow(userId, attempts = 40, delayMs = 20) {
  for (let i = 0; i < attempts; i += 1) {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, deletedAt: true } });
    if (row && !row.deletedAt) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`waitForUserRow: no user with id ${userId} after register`);
}

/** Same key as auth login (`findUnique({ email })`) — avoids racing `findById` vs `findByEmail` visibility. */
export async function waitForUserByEmail(email, attempts = 100, delayMs = 50) {
  const norm = String(email).trim().toLowerCase();
  for (let i = 0; i < attempts; i += 1) {
    const row = await prisma.user.findUnique({
      where: { email: norm },
      select: { id: true, deletedAt: true, password: true, isActive: true, role: true },
    });
    if (row && !row.deletedAt && row.password && row.isActive) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`waitForUserByEmail: no login-ready user for ${norm}`);
}

export async function waitForUserRole(userId, role, attempts = 40, delayMs = 25) {
  for (let i = 0; i < attempts; i += 1) {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true },
    });
    if (row && !row.deletedAt && row.role === role) return;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`waitForUserRole: user ${userId} did not become ${role}`);
}

/** Prefer this after register — avoids any email normalization mismatch vs DB lookups. */
export async function promoteRoleById(userId, role) {
  await waitForUserRow(userId);
  const max = 15;
  for (let j = 0; j < max; j += 1) {
    try {
      await prisma.user.update({ where: { id: userId }, data: { role } });
      return;
    } catch (e) {
      if (e?.code === "P2025" && j < max - 1) {
        await new Promise((r) => setTimeout(r, 35));
        continue;
      }
      throw e;
    }
  }
}

/**
 * Register + login as player; returns cookie token.
 */
export async function seedPlayer(app, prefix = "pl", options = {}) {
  const phoneOverride = options.phone;
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const email = `${prefix}_${suffix}@example.com`;
  const phone = phoneOverride ?? uniquePhone("012");
  const reg = await register(app, { name: "Player", email, phone });
  if (reg.status !== 201) {
    throw new Error(`seedPlayer register failed ${reg.status}: ${JSON.stringify(reg.body)}`);
  }
  const loginEmail = reg.body.user.email ?? email;
  await waitForUserByEmail(loginEmail);
  const loginRes = await loginUntilOk(app, loginEmail);
  if (loginRes.status !== 200) {
    throw new Error(`seedPlayer login failed ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }
  return { email: loginEmail, phone, token: cookieFromLogin(loginRes), userId: reg.body.user.id };
}

export async function seedManagerWith24hCourt(app) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const email = `mgr_${suffix}@example.com`;
  const phone = uniquePhone("010");
  const reg = await register(app, { name: "Manager", email, phone });
  if (reg.status !== 201) throw new Error(`seedManager register failed: ${JSON.stringify(reg.body)}`);
  const loginEmail = reg.body.user.email ?? email;
  await waitForUserByEmail(loginEmail);
  await promoteRoleById(reg.body.user.id, "manager");
  await waitForUserRole(reg.body.user.id, "manager");
  const loginRes = await loginUntilOk(app, loginEmail);
  if (loginRes.status !== 200) {
    throw new Error(`seedManager login failed ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }
  const token = cookieFromLogin(loginRes);
  const courtRes = await request(app)
    .post("/api/v1/courts")
    .set("Origin", ORIGIN)
    .set("Cookie", [token])
    .send({
      name: "Fixture Court",
      nameEn: "Fixture Court",
      sportType: "padel",
      city: "Cairo",
      cityEn: "Cairo",
      peakPrice: 100,
      offPeakPrice: 80,
      openTime: "00:00",
      closeTime: "00:00",
    });
  if (courtRes.status !== 201) {
    throw new Error(`create court failed ${courtRes.status}: ${JSON.stringify(courtRes.body)}`);
  }
  const courtId = courtRes.body.court.id;
  await prisma.court.update({ where: { id: courtId }, data: { status: "active" } });

  return {
    email: loginEmail,
    phone,
    token,
    courtId,
    managerId: reg.body.user.id,
  };
}

export async function seedAdmin(app) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const email = `adm_${suffix}@example.com`;
  const phone = uniquePhone("015");
  const reg = await register(app, { name: "Admin", email, phone });
  if (reg.status !== 201) throw new Error(`seedAdmin register failed: ${JSON.stringify(reg.body)}`);
  const loginEmail = reg.body.user.email ?? email;
  await waitForUserByEmail(loginEmail);
  await promoteRoleById(reg.body.user.id, "admin");
  await waitForUserRole(reg.body.user.id, "admin");
  const loginRes = await loginUntilOk(app, loginEmail);
  if (loginRes.status !== 200) {
    throw new Error(`seedAdmin login failed ${loginRes.status}: ${JSON.stringify(loginRes.body)}`);
  }
  return { email: loginEmail, phone, token: cookieFromLogin(loginRes), userId: reg.body.user.id };
}

/**
 * Standard day booking helpers on 24h court (no overnight).
 */
export async function createPlayerBooking(app, playerToken, courtId, date, startTime, endTime) {
  return request(app)
    .post("/api/v1/bookings")
    .set("Origin", ORIGIN)
    .set("Cookie", [playerToken])
    .send({ courtId, date, startTime, endTime });
}
