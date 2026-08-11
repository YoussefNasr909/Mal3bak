import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import {
  ORIGIN,
  seedAdmin,
  seedPlayer,
  seedManagerWith24hCourt,
  cookieFromLogin,
  loginUntilOk,
  register,
  promoteRoleById,
  waitForUserByEmail,
  uniquePhone,
} from "../helpers/integration-fixtures.js";
import { getAbsoluteBookingTimes, minutesToTime } from "../../src/utils/date-utils.js";

function datePlus(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function cairoParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type)?.value;
  const hour = get("hour") === "24" ? "00" : get("hour");

  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${hour}:${get("minute")}`,
  };
}

async function createManagerWithCourt({
  openTime = "08:00",
  closeTime = "23:00",
  useOpeningDayForOvernightBookings = false,
} = {}) {
  const suffix = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const email = `mgr_edge_${suffix}@example.com`;

  const reg = await register(app, {
    name: "Edge Manager",
    email,
    phone: uniquePhone("010"),
  });
  expect(reg.status).toBe(201);

  await waitForUserByEmail(reg.body.user.email);
  await promoteRoleById(reg.body.user.id, "manager");

  const login = await loginUntilOk(app, reg.body.user.email);
  expect(login.status).toBe(200);

  const token = cookieFromLogin(login);

  const courtRes = await request(app)
    .post("/api/v1/courts")
    .set("Origin", ORIGIN)
    .set("Cookie", [token])
    .send({
      name: `Edge Court ${suffix}`,
      nameEn: `Edge Court ${suffix}`,
      sportType: "padel",
      city: "Cairo",
      cityEn: "Cairo",
      peakPrice: 120,
      offPeakPrice: 90,
      openTime,
      closeTime,
      useOpeningDayForOvernightBookings,
    });

  expect(courtRes.status).toBe(201);

  return {
    token,
    userId: reg.body.user.id,
    courtId: courtRes.body.court.id,
  };
}

async function createBooking({ token, courtId, date, startTime, endTime }) {
  return request(app)
    .post("/api/v1/bookings")
    .set("Origin", ORIGIN)
    .set("Cookie", [token])
    .send({ courtId, date, startTime, endTime });
}

describe("booking edge regression suite", () => {
  test("24h court: 23:00 -> 00:00 does not block next-day 00:00 -> 01:00", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const playerA = await seedPlayer(app, "edge_a");
    const playerB = await seedPlayer(app, "edge_b");

    const d1 = datePlus(60);
    const d2 = datePlus(61);

    const first = await createBooking({
      token: playerA.token,
      courtId: manager.courtId,
      date: d1,
      startTime: "23:00",
      endTime: "00:00",
    });

    expect(first.status).toBe(201);

    const slots = await request(app)
      .get(`/api/v1/bookings/availability?courtId=${manager.courtId}&date=${d2}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [playerA.token]);

    expect(slots.status).toBe(200);
    expect(slots.body.bookedSlots.some((s) => s.startTime === "00:00" && s.endTime === "01:00")).toBe(false);

    const second = await createBooking({
      token: playerB.token,
      courtId: manager.courtId,
      date: d2,
      startTime: "00:00",
      endTime: "01:00",
    });

    expect(second.status).toBe(201);
  });

  test("24h court: 23:00 -> 01:00 blocks next-day 00:00 -> 01:00", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const playerA = await seedPlayer(app, "edge_c");
    const playerB = await seedPlayer(app, "edge_d");

    const d1 = datePlus(70);
    const d2 = datePlus(71);

    const first = await createBooking({
      token: playerA.token,
      courtId: manager.courtId,
      date: d1,
      startTime: "23:00",
      endTime: "01:00",
    });

    expect(first.status).toBe(201);

    const second = await createBooking({
      token: playerB.token,
      courtId: manager.courtId,
      date: d2,
      startTime: "00:00",
      endTime: "01:00",
    });

    expect(second.status).toBe(409);
  });

  test("regular court rejects outside hours but allows touching slots", async () => {
    const manager = await createManagerWithCourt({ openTime: "08:00", closeTime: "23:00" });
    const playerA = await seedPlayer(app, "edge_e");
    const playerB = await seedPlayer(app, "edge_f");

    const date = datePlus(80);

    const early = await createBooking({
      token: playerA.token,
      courtId: manager.courtId,
      date,
      startTime: "07:00",
      endTime: "08:00",
    });
    expect(early.status).toBe(400);

    const first = await createBooking({
      token: playerA.token,
      courtId: manager.courtId,
      date,
      startTime: "08:00",
      endTime: "09:00",
    });
    expect(first.status).toBe(201);

    const touching = await createBooking({
      token: playerB.token,
      courtId: manager.courtId,
      date,
      startTime: "09:00",
      endTime: "10:00",
    });
    expect(touching.status).toBe(201);
  });

  test("overnight court supports after-midnight operating-session slots", async () => {
    const manager = await createManagerWithCourt({ openTime: "18:00", closeTime: "02:00" });
    const playerA = await seedPlayer(app, "edge_g");
    const playerB = await seedPlayer(app, "edge_h");

    const date = datePlus(90);

    const late = await createBooking({
      token: playerA.token,
      courtId: manager.courtId,
      date,
      startTime: "23:00",
      endTime: "00:00",
    });
    expect(late.status).toBe(201);

    const midnight = await createBooking({
      token: playerB.token,
      courtId: manager.courtId,
      date,
      startTime: "00:00",
      endTime: "01:00",
    });
    expect(midnight.status).toBe(201);

    const outside = await createBooking({
      token: playerB.token,
      courtId: manager.courtId,
      date,
      startTime: "02:00",
      endTime: "03:00",
    });
    expect(outside.status).toBe(400);
  });

  test("opening-day overnight bookings persist the court option snapshot", async () => {
    const manager = await createManagerWithCourt({
      openTime: "08:00",
      closeTime: "03:00",
      useOpeningDayForOvernightBookings: true,
    });
    const player = await seedPlayer(app, "edge_opening_day_snapshot");

    const date = datePlus(95);
    const bookingRes = await createBooking({
      token: player.token,
      courtId: manager.courtId,
      date,
      startTime: "01:00",
      endTime: "02:00",
    });

    expect(bookingRes.status).toBe(201);
    expect(bookingRes.body.booking.useOpeningDayForOvernightBookings).toBe(true);

    const booking = await prisma.booking.findUnique({
      where: { id: bookingRes.body.booking.id },
      select: {
        date: true,
        startTime: true,
        sessionOpenTime: true,
        sessionCloseTime: true,
        useOpeningDayForOvernightBookings: true,
      },
    });

    expect(booking).toMatchObject({
      date,
      startTime: "01:00",
      sessionOpenTime: "08:00",
      sessionCloseTime: "03:00",
      useOpeningDayForOvernightBookings: true,
    });
  });

  test("public overnight availability returns the correct booking date per mode", async () => {
    const offManager = await createManagerWithCourt({
      openTime: "08:00",
      closeTime: "03:00",
      useOpeningDayForOvernightBookings: false,
    });
    const onManager = await createManagerWithCourt({
      openTime: "08:00",
      closeTime: "03:00",
      useOpeningDayForOvernightBookings: true,
    });

    const date = datePlus(96);
    const nextDate = datePlus(97);

    const offAvailability = await request(app)
      .get(`/api/v1/courts/public/${offManager.courtId}/availability?date=${date}&slotMinutes=60`)
      .set("Origin", ORIGIN);
    expect(offAvailability.status).toBe(200);
    expect(offAvailability.body.slots.find((slot) => slot.start === "01:00")?.date).toBe(nextDate);

    const onAvailability = await request(app)
      .get(`/api/v1/courts/public/${onManager.courtId}/availability?date=${date}&slotMinutes=60`)
      .set("Origin", ORIGIN);
    expect(onAvailability.status).toBe(200);
    expect(onAvailability.body.slots.find((slot) => slot.start === "01:00")?.date).toBe(date);
  });

  test("full-day closure on 24h court blocks same date but not next day midnight", async () => {
    const manager = await seedManagerWith24hCourt(app);
    const playerA = await seedPlayer(app, "edge_i");
    const playerB = await seedPlayer(app, "edge_j");

    const d1 = datePlus(100);
    const d2 = datePlus(101);

    const closure = await request(app)
      .post(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        fullDay: true,
        date: d1,
        reason: "Full day QA closure",
      });

    expect(closure.status).toBe(201);

    const blocked = await createBooking({
      token: playerA.token,
      courtId: manager.courtId,
      date: d1,
      startTime: "12:00",
      endTime: "13:00",
    });
    expect(blocked.status).toBe(409);

    const nextDay = await createBooking({
      token: playerB.token,
      courtId: manager.courtId,
      date: d2,
      startTime: "00:00",
      endTime: "01:00",
    });
    expect(nextDay.status).toBe(201);
  });

  test("booking blocks closure and closure blocks booking", async () => {
    const manager = await createManagerWithCourt({ openTime: "08:00", closeTime: "23:00" });
    const player = await seedPlayer(app, "edge_k");
    const date = datePlus(110);

    const booking = await createBooking({
      token: player.token,
      courtId: manager.courtId,
      date,
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(booking.status).toBe(201);

    const times = getAbsoluteBookingTimes(date, "10:00", "11:00", "08:00");

    const conflictClosure = await request(app)
      .post(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        startDate: new Date(times.startMs).toISOString(),
        endDate: new Date(times.endMs).toISOString(),
        reason: "Should conflict",
      });

    expect(conflictClosure.status).toBe(409);

    const closureTimes = getAbsoluteBookingTimes(date, "12:00", "13:00", "08:00");

    const closure = await request(app)
      .post(`/api/v1/courts/${manager.courtId}/closures`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({
        startDate: new Date(closureTimes.startMs).toISOString(),
        endDate: new Date(closureTimes.endMs).toISOString(),
        reason: "Should block",
      });

    expect(closure.status).toBe(201);

    const blockedBooking = await createBooking({
      token: player.token,
      courtId: manager.courtId,
      date,
      startTime: "12:00",
      endTime: "13:00",
    });

    expect(blockedBooking.status).toBe(409);
  });

  test("check-in permissions and lowercase code verification", async () => {
    const admin = await seedAdmin(app);
    const manager = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app, "edge_l");

    const start = new Date(Date.now() + 5 * 60 * 1000);
    const end = new Date(Date.now() + 65 * 60 * 1000);
    const startParts = cairoParts(start);
    const endParts = cairoParts(end);

    const booking = await prisma.booking.create({
      data: {
        courtId: manager.courtId,
        userId: player.userId,
        date: startParts.date,
        startTime: startParts.time,
        endTime: endParts.time,
        sessionOpenTime: "00:00",
        sessionCloseTime: "00:00",
        duration: 1,
        totalPrice: 100,
        amount: 100,
        status: "confirmed",
        paymentStatus: "pending",
        checkInCode: "ABCD1234",
      },
    });

    const playerAttempt = await request(app)
      .post(`/api/v1/bookings/${booking.id}/check-in`)
      .set("Origin", ORIGIN)
      .set("Cookie", [player.token])
      .send();

    expect(playerAttempt.status).toBe(403);

    const codeAttempt = await request(app)
      .post("/api/v1/bookings/verify-code")
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ code: "abcd1234" });

    expect(codeAttempt.status).toBe(200);
    expect(codeAttempt.body.booking.status).toBe("completed");
    expect(codeAttempt.body.booking.paymentStatus).toBe("paid");

    const secondAttempt = await request(app)
      .post(`/api/v1/bookings/${booking.id}/check-in`)
      .set("Origin", ORIGIN)
      .set("Cookie", [admin.token])
      .send();

    expect(secondAttempt.status).toBe(400);
  });

  test("admin can check in a missed booking by code while managers stay time-limited", async () => {
    const admin = await seedAdmin(app);
    const manager = await seedManagerWith24hCourt(app);
    const otherManager = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app, "edge_admin_missed");

    const booking = await prisma.booking.create({
      data: {
        courtId: manager.courtId,
        userId: player.userId,
        date: datePlus(-1),
        startTime: "10:00",
        endTime: "11:00",
        sessionOpenTime: "00:00",
        sessionCloseTime: "00:00",
        duration: 1,
        totalPrice: 100,
        amount: 100,
        status: "no_show",
        paymentStatus: "pending",
        checkInCode: "MISSD001",
      },
    });

    const otherManagerAttempt = await request(app)
      .post("/api/v1/bookings/verify-code")
      .set("Origin", ORIGIN)
      .set("Cookie", [otherManager.token])
      .send({ code: booking.checkInCode });

    expect(otherManagerAttempt.status).toBe(404);

    const owningManagerAttempt = await request(app)
      .post("/api/v1/bookings/verify-code")
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token])
      .send({ code: booking.checkInCode });

    expect(owningManagerAttempt.status).toBe(400);
    expect(owningManagerAttempt.body.message).toMatch(/missed/i);

    const adminAttempt = await request(app)
      .post("/api/v1/bookings/verify-code")
      .set("Origin", ORIGIN)
      .set("Cookie", [admin.token])
      .send({ code: booking.checkInCode });

    expect(adminAttempt.status).toBe(200);
    expect(adminAttempt.body.booking.status).toBe("completed");
    expect(adminAttempt.body.booking.paymentStatus).toBe("paid");
    expect(adminAttempt.body.booking.checkInVerified).toBe(true);
    expect(adminAttempt.body.booking.checkedIn).toBe(true);
    expect(adminAttempt.body.booking.checkedInAt).toBeTruthy();
  });

  test("admin missed override also works after an expired confirmed booking syncs to no-show", async () => {
    const admin = await seedAdmin(app);
    const manager = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app, "edge_admin_expired");

    const booking = await prisma.booking.create({
      data: {
        courtId: manager.courtId,
        userId: player.userId,
        date: datePlus(-1),
        startTime: "09:00",
        endTime: "10:00",
        sessionOpenTime: "00:00",
        sessionCloseTime: "00:00",
        duration: 1,
        totalPrice: 100,
        amount: 100,
        status: "confirmed",
        paymentStatus: "pending",
        checkInCode: "EXPRD001",
      },
    });

    const adminAttempt = await request(app)
      .post("/api/v1/bookings/verify-code")
      .set("Origin", ORIGIN)
      .set("Cookie", [admin.token])
      .send({ code: booking.checkInCode });

    expect(adminAttempt.status).toBe(200);
    expect(adminAttempt.body.booking.status).toBe("completed");
    expect(adminAttempt.body.booking.checkInVerified).toBe(true);
    expect(adminAttempt.body.booking.checkedIn).toBe(true);

    const dbBooking = await prisma.booking.findUnique({
      where: { id: booking.id },
      select: { status: true, paymentStatus: true, checkedInAt: true },
    });

    expect(dbBooking).toMatchObject({
      status: "completed",
      paymentStatus: "paid",
    });
    expect(dbBooking?.checkedInAt).toBeTruthy();
  });

  test("admin missed override does not allow future, cancelled, or already completed bookings", async () => {
    const admin = await seedAdmin(app);
    const manager = await seedManagerWith24hCourt(app);
    const player = await seedPlayer(app, "edge_admin_blocked");

    const common = {
      courtId: manager.courtId,
      userId: player.userId,
      sessionOpenTime: "00:00",
      sessionCloseTime: "00:00",
      duration: 1,
      totalPrice: 100,
      amount: 100,
      paymentStatus: "pending",
    };

    const future = await prisma.booking.create({
      data: {
        ...common,
        date: datePlus(30),
        startTime: "10:00",
        endTime: "11:00",
        status: "confirmed",
        checkInCode: "FUTUR001",
      },
    });

    const cancelled = await prisma.booking.create({
      data: {
        ...common,
        date: datePlus(-1),
        startTime: "12:00",
        endTime: "13:00",
        status: "cancelled",
        checkInCode: "CNCLD001",
      },
    });

    const completed = await prisma.booking.create({
      data: {
        ...common,
        date: datePlus(-1),
        startTime: "14:00",
        endTime: "15:00",
        status: "completed",
        paymentStatus: "paid",
        checkInCode: "DONE0001",
        checkInVerified: true,
        checkedIn: true,
        checkedInAt: new Date(),
      },
    });

    for (const booking of [future, cancelled, completed]) {
      const res = await request(app)
        .post("/api/v1/bookings/verify-code")
        .set("Origin", ORIGIN)
        .set("Cookie", [admin.token])
        .send({ code: booking.checkInCode });

      expect(res.status).toBe(400);
    }

    const futureAfter = await prisma.booking.findUnique({
      where: { id: future.id },
      select: { status: true, checkInVerified: true, checkedIn: true, checkedInAt: true },
    });

    expect(futureAfter).toEqual({
      status: "confirmed",
      checkInVerified: false,
      checkedIn: false,
      checkedInAt: null,
    });
  });

  test("race condition: two players cannot book exact same slot", async () => {
    const manager = await createManagerWithCourt({ openTime: "08:00", closeTime: "23:00" });
    const playerA = await seedPlayer(app, "edge_m");
    const playerB = await seedPlayer(app, "edge_n");

    const date = datePlus(120);

    const [a, b] = await Promise.allSettled([
      createBooking({
        token: playerA.token,
        courtId: manager.courtId,
        date,
        startTime: "16:00",
        endTime: "17:00",
      }),
      createBooking({
        token: playerB.token,
        courtId: manager.courtId,
        date,
        startTime: "16:00",
        endTime: "17:00",
      }),
    ]);

    const statuses = [a, b].map((r) => (r.status === "fulfilled" ? r.value.status : 500));
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(1);
  });

  test("manager booking list 'Today' filter correctly arranges overnight tail slots (2am-3am) first chronologically", async () => {
    const manager = await createManagerWithCourt({
      openTime: "08:00",
      closeTime: "03:00",
      useOpeningDayForOvernightBookings: true,
    });
    const player1 = await seedPlayer(app, "edge_arr_1");
    const player2 = await seedPlayer(app, "edge_arr_2");
    const player3 = await seedPlayer(app, "edge_arr_3");

    // Use a test date in the future to avoid any "past date" validations
    const today = datePlus(150);

    // Create 3 bookings for the operating day
    // 1. Morning booking
    await createBooking({ token: player1.token, courtId: manager.courtId, date: today, startTime: "10:00", endTime: "11:00" });
    // 2. Evening booking
    await createBooking({ token: player2.token, courtId: manager.courtId, date: today, startTime: "20:00", endTime: "21:00" });
    // 3. Overnight tail booking (02:00 - 03:00) which is technically +24 hours
    await createBooking({ token: player3.token, courtId: manager.courtId, date: today, startTime: "02:00", endTime: "03:00" });

    const res = await request(app)
      .get(`/api/v1/bookings?date=${today}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);

    // By default, sorting is absolute time descending (latest time first).
    // The latest time of the business day is 02:00 (which is effectively 26:00).
    expect(res.body.items[0].startTime).toBe("02:00");
    expect(res.body.items[1].startTime).toBe("20:00");
    expect(res.body.items[2].startTime).toBe("10:00");
  });

  test("manager booking list 'Today' filter correctly arranges literal dates when mode is OFF (2am-3am)", async () => {
    const manager = await createManagerWithCourt({
      openTime: "08:00",
      closeTime: "03:00",
      useOpeningDayForOvernightBookings: false,
    });
    const player1 = await seedPlayer(app, "edge_arr_4");
    const player2 = await seedPlayer(app, "edge_arr_5");
    const player3 = await seedPlayer(app, "edge_arr_6");

    const today = datePlus(160);

    // When mode is OFF, a 2am booking belongs to the PREVIOUS shift, but is literally on 'today'
    // 1. Overnight tail booking of yesterday's shift, literal date today (02:00 - 03:00)
    await createBooking({ token: player1.token, courtId: manager.courtId, date: today, startTime: "02:00", endTime: "03:00" });
    // 2. Morning booking today
    await createBooking({ token: player2.token, courtId: manager.courtId, date: today, startTime: "10:00", endTime: "11:00" });
    // 3. Evening booking today
    await createBooking({ token: player3.token, courtId: manager.courtId, date: today, startTime: "20:00", endTime: "21:00" });

    const res = await request(app)
      .get(`/api/v1/bookings?date=${today}`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);

    // Since mode is OFF, their absolute times are exactly as written on the literal date.
    // 20:00 is the latest in absolute time today.
    // 10:00 is the second latest.
    // 02:00 is the earliest in the day.
    // Sorting is absolute time descending (latest time first)
    expect(res.body.items[0].startTime).toBe("20:00");
    expect(res.body.items[1].startTime).toBe("10:00");
    expect(res.body.items[2].startTime).toBe("02:00");
  });

  test("manager revenue report and bookings date range correctly arrange overnight tail slots", async () => {
    const manager = await createManagerWithCourt({
      openTime: "08:00",
      closeTime: "03:00",
      useOpeningDayForOvernightBookings: true,
    });
    const player1 = await seedPlayer(app, "edge_arr_7");
    const player2 = await seedPlayer(app, "edge_arr_8");
    const player3 = await seedPlayer(app, "edge_arr_9");

    const today = datePlus(170);

    // Create 3 bookings for the operating day
    const b1 = await createBooking({ token: player1.token, courtId: manager.courtId, date: today, startTime: "10:00", endTime: "11:00" });
    const b2 = await createBooking({ token: player2.token, courtId: manager.courtId, date: today, startTime: "20:00", endTime: "21:00" });
    const b3 = await createBooking({ token: player3.token, courtId: manager.courtId, date: today, startTime: "02:00", endTime: "03:00" });

    // Mark as checked in so they appear in revenue report
    await prisma.booking.updateMany({
      where: { id: { in: [b1.body.booking.id, b2.body.booking.id, b3.body.booking.id] } },
      data: { status: "completed", checkedIn: true, checkInVerified: true, checkedInAt: new Date() }
    });

    // 1. Test Revenue Report Sort By Date DESC
    const revenueRes = await request(app)
      .get(`/api/v1/bookings/revenue-report?dateFrom=${today}&dateTo=${today}&sortBy=date&order=desc`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(revenueRes.status).toBe(200);
    expect(revenueRes.body.items).toHaveLength(3);
    
    // In descending date order, the latest absolute time should be first
    expect(revenueRes.body.items[0].startTime).toBe("02:00");
    expect(revenueRes.body.items[1].startTime).toBe("20:00");
    expect(revenueRes.body.items[2].startTime).toBe("10:00");

    // 2. Test Booking List Date Range Sort By Date DESC
    const bookingsRes = await request(app)
      .get(`/api/v1/bookings?dateFrom=${today}&dateTo=${today}&sortBy=date&order=desc`)
      .set("Origin", ORIGIN)
      .set("Cookie", [manager.token]);

    expect(bookingsRes.status).toBe(200);
    expect(bookingsRes.body.items).toHaveLength(3);

    expect(bookingsRes.body.items[0].startTime).toBe("02:00");
    expect(bookingsRes.body.items[1].startTime).toBe("20:00");
    expect(bookingsRes.body.items[2].startTime).toBe("10:00");
  });
});



