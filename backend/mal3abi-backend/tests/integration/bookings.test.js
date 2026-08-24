import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { minutesToTime } from "../../src/utils/date-utils.js";
import { deleteBookingService } from "../../src/modules/bookings/bookings.service.js";
import {
  waitForUserByEmail,
  loginUntilOk,
  cookieFromLogin,
  promoteRoleById,
  uniquePhone,
} from "../helpers/integration-fixtures.js";

describe("Bookings Flow", () => {
  const origin = "http://localhost:3000";
  let managerToken;
  let playerToken;
  let playerId;
  let courtId;
  
  // A helper function to get tomorrow's date
  const getTomorrowDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getPastDateStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const getCurrentCairoCheckInWindowSlot = () => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date());
    const getPart = (type) => parts.find((part) => part.type === type)?.value;
    const startMinutes = Number(getPart("hour")) * 60;
    const endMinutes = (startMinutes + 60) % (24 * 60);

    return {
      date: `${getPart("year")}-${getPart("month")}-${getPart("day")}`,
      startTime: minutesToTime(startMinutes),
      endTime: minutesToTime(endMinutes),
    };
  };

  const moveBookingIntoOpenCheckInWindow = async (bookingId) => {
    const slot = getCurrentCairoCheckInWindowSlot();

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: "confirmed",
        checkInVerified: false,
        checkedIn: false,
        checkedInAt: null,
      },
    });

    return slot;
  };

  const getFutureCairoRoundedHourSlot = (hoursAhead) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(Date.now() + hoursAhead * 60 * 60 * 1000));
    const getPart = (type) => parts.find((part) => part.type === type)?.value;
    const startHour = Number(getPart("hour"));
    const endHour = (startHour + 1) % 24;

    return {
      date: `${getPart("year")}-${getPart("month")}-${getPart("day")}`,
      startTime: minutesToTime(startHour * 60),
      endTime: minutesToTime(endHour * 60),
    };
  };

  const moveBookingToFutureHourSlot = async (bookingId, hoursAhead) => {
    const slot = getFutureCairoRoundedHourSlot(hoursAhead);

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        date: slot.date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status: "confirmed",
        checkInVerified: false,
        checkedIn: false,
        checkedInAt: null,
      },
    });

    return slot;
  };

  beforeEach(async () => {
    const uniqueId = Date.now() + Math.random().toString(36).substring(7);
    const managerEmail = `manager_${uniqueId}@example.com`;
    const playerEmail = `player_${uniqueId}@example.com`;
    const phoneSuffix = String(Date.now()).slice(-8);
    const phoneManager = `010${phoneSuffix}`;
    const phonePlayer = `012${phoneSuffix}`;

    const mgrReg = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Manager", email: managerEmail, phone: phoneManager, password: "Password123",
    });
    expect(mgrReg.status).toBe(201);
    await waitForUserByEmail(mgrReg.body.user.email);
    await promoteRoleById(mgrReg.body.user.id, "manager");

    const managerLogin = await loginUntilOk(app, mgrReg.body.user.email);
    expect(managerLogin.status).toBe(200);
    managerToken = cookieFromLogin(managerLogin);

    const plReg = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Player", email: playerEmail, phone: phonePlayer, password: "Password123",
    });
    expect(plReg.status).toBe(201);
    playerId = plReg.body.user.id;
    await waitForUserByEmail(plReg.body.user.email);
    const playerLogin = await loginUntilOk(app, plReg.body.user.email);
    expect(playerLogin.status).toBe(200);
    playerToken = cookieFromLogin(playerLogin);

    // Create a true 24-hour court
    const courtRes = await request(app)
      .post("/api/v1/courts")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        name: "Test Court", nameEn: "Test Court", sportType: "padel",
        city: "Cairo", cityEn: "Cairo", peakPrice: 100, offPeakPrice: 80,
        openTime: "00:00", closeTime: "00:00", allowOnlinePayment: false
      });
    expect(courtRes.status).toBe(201);
    courtId = courtRes.body.court.id;
  });

  it("should allow a player to book a valid slot", async () => {
    const date = getTomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "10:00",
        endTime: "11:00",
      });
    
    expect(res.status).toBe(201);
    expect(res.body.booking.id).toBeDefined();
  });

  it("should require checkout before booking an online-payment court", async () => {
    await prisma.court.update({
      where: { id: courtId },
      data: { allowOnlinePayment: true },
    });

    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date: getTomorrowDateStr(),
        startTime: "13:00",
        endTime: "14:00",
      });

    await prisma.court.update({
      where: { id: courtId },
      data: { allowOnlinePayment: false },
    });

    expect(res.status).toBe(400);
    expect(res.body.error || res.body.message).toMatch(/requires online payment/i);
  });

  it("should store trimmed player notes when creating a booking", async () => {
    const date = getTomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "12:00",
        endTime: "13:00",
        notes: "  Please prepare extra balls.  ",
      });

    expect(res.status).toBe(201);
    expect(res.body.booking.notes).toBe("Please prepare extra balls.");
  });

  it("should reject booking notes longer than 200 characters", async () => {
    const date = getTomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "13:00",
        endTime: "14:00",
        notes: "a".repeat(201),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/notes/i);
  });

  it("should fail if player tries to book a past date", async () => {
    const date = getPastDateStr();
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "10:00",
        endTime: "11:00",
      });
    
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/past/i);
  });

  it("should fail if slot overlaps with an existing booking", async () => {
    const date = getTomorrowDateStr();
    
    // First booking
    await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "14:00", endTime: "16:00",
    });

    // Register Player 2 to test court conflict (not player conflict)
    const p2Email = `player2_${Date.now()}@example.com`;
    const p2Phone = `013${String(Date.now()).slice(-8)}`;
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Player 2", email: p2Email, phone: p2Phone, password: "Password123",
    });
    const p2Login = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: p2Email, password: "Password123",
    });
    const p2Token = p2Login.headers["set-cookie"][0].split(";")[0];

    // Second booking overlapping
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [p2Token])
      .send({
        courtId,
        date,
        startTime: "15:00",
        endTime: "17:00",
      });
    
    expect(res.status).toBe(409); // Conflict
  });

  it("should allow a player to book a slot that touches but doesn't overlap", async () => {
    const date = getTomorrowDateStr();
    
    await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "14:00", endTime: "15:00",
    });

    // Same player booking immediately after
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "15:00",
        endTime: "16:00",
      });
    
    expect(res.status).toBe(201);
  });

  it("should fail if booking duration is not full-hour increments", async () => {
    const date = getTomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "14:00",
        endTime: "15:15",
      });
    
    expect(res.status).toBe(400);
  });

  it("should fail if booking doesn't start on the hour", async () => {
    const date = getTomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "14:15",
        endTime: "15:15",
      });
    
    expect(res.status).toBe(400);
  });

  it("should prevent double booking via concurrent requests", async () => {
    const date = getTomorrowDateStr();
    const p2Email = `player2c_${Date.now()}@example.com`;
    const p2Phone = `014${String(Date.now()).slice(-8)}`;

    // Register Player 2
    await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Player 2", email: p2Email, phone: p2Phone, password: "Password123",
    });
    const p2Login = await request(app).post("/api/v1/auth/login").set("Origin", origin).send({
      email: p2Email, password: "Password123",
    });
    const p2Token = p2Login.headers["set-cookie"][0].split(";")[0];

    // Fire 2 booking requests simultaneously
    const req1 = request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({ courtId, date, startTime: "20:00", endTime: "21:00" });

    const req2 = request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [p2Token])
      .send({ courtId, date, startTime: "20:00", endTime: "21:00" });

    const [res1, res2] = await Promise.all([req1, req2]);

    // One should succeed (201), one should fail with conflict (409)
    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("should allow overnight bookings on a true 24-hour court", async () => {
    const date = getTomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({ courtId, date, startTime: "23:00", endTime: "01:00" });
    
    expect(res.status).toBe(201);
    expect(res.body.booking.id).toBeDefined();
    expect(res.body.booking.startTime).toBe("23:00");
    expect(res.body.booking.endTime).toBe("01:00");
  });

  it("should fail when booking duration is exactly 0", async () => {
    const date = getTomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({ courtId, date, startTime: "15:00", endTime: "15:00" });
    
    expect(res.status).toBe(400); 
  });

  it("should calculate correct pricing for peak vs off-peak hours", async () => {
    // Court was created with peakPrice: 100, offPeakPrice: 80
    // Peak hours are 18:00 - 06:00 by default in the service
    const date = getTomorrowDateStr();
    
    // Off-peak booking (14:00 - 15:00) -> 1 hour = 80
    const resOffPeak = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({ courtId, date, startTime: "14:00", endTime: "15:00" });
    
    expect(resOffPeak.status).toBe(201);
    expect(Number(resOffPeak.body.booking.totalPrice)).toBe(80);

    // Peak booking (19:00 - 21:00) -> 2 hours = 200
    const resPeak = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({ courtId, date, startTime: "19:00", endTime: "21:00" });
    
    expect(resPeak.status).toBe(201);
    expect(Number(resPeak.body.booking.totalPrice)).toBe(200);

    // Mixed booking (17:00 - 19:00) -> 1 hr off-peak (17-18), 1 hr peak (18-19) = 180
    const resMixed = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({ courtId, date, startTime: "17:00", endTime: "19:00" });
    
    expect(resMixed.status).toBe(201);
    expect(Number(resMixed.body.booking.totalPrice)).toBe(180);

    // Overnight peak booking (23:00 - 01:00) -> 2 peak hours = 200
    const resOvernightPeak = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({ courtId, date, startTime: "23:00", endTime: "01:00" });

    expect(resOvernightPeak.status).toBe(201);
    expect(Number(resOvernightPeak.body.booking.totalPrice)).toBe(200);
  });

  it("should allow a manager to create a manual booking", async () => {
    const date = getTomorrowDateStr();
    const res = await request(app)
      .post("/api/v1/bookings/manual")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        courtId,
        date,
        startTime: "08:00",
        endTime: "09:00",
        guestName: "Walk-in Guest",
        guestPhone: "01099999999",
      });
    
    expect(res.status).toBe(201);
    expect(res.body.booking.id).toBeDefined();
    expect(res.body.booking.paymentStatus).toBe("paid"); // manual defaults to paid
  });

  it("should apply percentage and fixed discounts to manual bookings", async () => {
    const date = getTomorrowDateStr();
    const percentageRes = await request(app)
      .post("/api/v1/bookings/manual")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        courtId,
        date,
        startTime: "09:00",
        endTime: "10:00",
        guestName: "Percentage Discount Guest",
        guestPhone: "01099999998",
        discountType: "percentage",
        discountValue: 100,
      });

    expect(percentageRes.status).toBe(201);
    expect(percentageRes.body.booking.totalPrice).toBe(0);
    expect(percentageRes.body.booking.discountType).toBe("percentage");
    expect(percentageRes.body.booking.discountValue).toBe(100);

    const fixedRes = await request(app)
      .post("/api/v1/bookings/manual")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        courtId,
        date,
        startTime: "10:00",
        endTime: "11:00",
        guestName: "Fixed Discount Guest",
        guestPhone: "01099999997",
        discountType: "fixed",
        discountValue: 80,
      });

    expect(fixedRes.status).toBe(201);
    expect(fixedRes.body.booking.totalPrice).toBe(0);
    expect(fixedRes.body.booking.discountType).toBe("fixed");
    expect(fixedRes.body.booking.discountValue).toBe(80);

    const excessiveRes = await request(app)
      .post("/api/v1/bookings/manual")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        courtId,
        date,
        startTime: "11:00",
        endTime: "12:00",
        guestName: "Excessive Discount Guest",
        guestPhone: "01099999996",
        discountType: "fixed",
        discountValue: 80.01,
      });

    expect(excessiveRes.status).toBe(400);
  });

  it("filters manager bookings by walk-in guests and returns guest vs registered counts", async () => {
    const date = getTomorrowDateStr();

    const manualRes = await request(app)
      .post("/api/v1/bookings/manual")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        courtId,
        date,
        startTime: "08:00",
        endTime: "09:00",
        guestName: "Walk-in Guest",
        guestPhone: "01088888888",
      });

    expect(manualRes.status).toBe(201);

    const playerRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "09:00",
        endTime: "10:00",
      });

    expect(playerRes.status).toBe(201);

    const guestListRes = await request(app)
      .get("/api/v1/bookings?customerType=guest&includeSummary=true")
      .set("Origin", origin)
      .set("Cookie", [managerToken]);

    expect(guestListRes.status).toBe(200);
    expect(guestListRes.body.items).toHaveLength(1);
    expect(guestListRes.body.items[0].userEmail).toMatch(/@walkin\.local$/i);
    expect(guestListRes.body.customerSummary).toMatchObject({
      total: 2,
      guest: 1,
      registered: 1,
    });
    expect(guestListRes.body.summary.confirmed).toBeGreaterThanOrEqual(1);
  });

  it("should allow a player to list their own bookings", async () => {
    const date = getTomorrowDateStr();
    await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "09:00", endTime: "10:00"
    });

    const res = await request(app)
      .get("/api/v1/bookings?mine=true")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);
    
    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it("should allow a player to cancel their booking", async () => {
    const date = getTomorrowDateStr();
    const createRes = await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "12:00", endTime: "13:00"
    });
    const bookingId = createRes.body.booking.id;

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set("Origin", origin)
      .set("Cookie", [playerToken]);
    
    if (res.status !== 200) console.error("Cancel Error:", res.body);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("cancelled");
    expect(res.body.booking.cancellationReason).toBe("player");
    expect(res.body.booking.cancellation).toEqual({
      reason: "player",
      initiatedBy: "player",
      displayKey: "booking.cancellation.player",
      refundStatus: "not_applicable",
    });

    const getRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set("Origin", origin)
      .set("Cookie", [playerToken]);
    const listRes = await request(app)
      .get("/api/v1/bookings?mine=true")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(getRes.status).toBe(200);
    expect(getRes.body.booking.cancellation).toEqual(res.body.booking.cancellation);
    expect(listRes.status).toBe(200);
    expect(listRes.body.items.find((item) => item.id === bookingId)?.cancellation)
      .toEqual(res.body.booking.cancellation);
  });

  it("keeps an eligible player refund in the outbox when Paymob is temporarily unavailable", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    const booking = await prisma.booking.create({
      data: {
        courtId,
        userId: playerId,
        date,
        startTime: "12:00",
        endTime: "13:00",
        sessionOpenTime: "00:00",
        sessionCloseTime: "00:00",
        duration: 60,
        totalPrice: 100,
        amount: 100,
        status: "confirmed",
        paymentStatus: "paid",
        checkInCode: `TSTCXL${Date.now()}`,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        userId: playerId,
        provider: "paymob",
        paymobTransactionId: `cancel_txn_${Date.now()}`,
        amountCents: 10000,
        currency: "EGP",
        status: "paid",
        hmacVerified: true,
      },
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ message: "Gateway temporarily unavailable" }),
    });

    try {
      const res = await request(app)
        .post(`/api/v1/bookings/${booking.id}/cancel`)
        .set("Origin", origin)
        .set("Cookie", [playerToken]);

      expect(res.status).toBe(200);
      expect(res.body.refundIssued).toBe(false);
      expect(res.body.refundPending).toBe(true);

      const [updatedBooking, updatedPayment] = await Promise.all([
        prisma.booking.findUnique({ where: { id: booking.id } }),
        prisma.payment.findUnique({ where: { id: payment.id } }),
      ]);
      expect(updatedBooking).toMatchObject({
        status: "cancelled",
        cancellationReason: "player",
        paymentStatus: "refund_pending",
      });
      expect(updatedPayment?.status).toBe("refund_pending");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should block a player from cancelling within 2 hours of the booking start", async () => {
    const createRes = await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId,
      date: getTomorrowDateStr(),
      startTime: "12:00",
      endTime: "13:00",
    });
    expect(createRes.status).toBe(201);

    const bookingId = createRes.body.booking.id;
    await moveBookingToFutureHourSlot(bookingId, 1);

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/2 hours/i);
  });

  it("should block non-managers from verifying check-in codes", async () => {
    const res = await request(app)
      .post("/api/v1/bookings/verify-code")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({ code: "ABCDEFGH" });
    
    // Will fail with 403 or 404 (if not found throws before auth check)
    expect([403, 404]).toContain(res.status);
  });

  it("should fail verification for invalid check-in code", async () => {
    const res = await request(app)
      .post("/api/v1/bookings/verify-code")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({ code: "INVALIDC" });
    
    expect(res.status).toBe(404);
  });

  it("should allow a manager to verify check-in code", async () => {
    const createRes = await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId,
      date: getTomorrowDateStr(),
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(createRes.status).toBe(201);
    await moveBookingIntoOpenCheckInWindow(createRes.body.booking.id);
    const code = createRes.body.code;

    const res = await request(app)
      .post("/api/v1/bookings/verify-code")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({ code });

    if (res.status !== 200) console.error("Verify Error:", res.body);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("completed");
    expect(res.body.booking.checkInVerified).toBe(true);
    expect(res.body.booking.checkedIn).toBe(true);
    expect(res.body.booking.checkedInAt).toBeTruthy();
  });

  it("should auto-complete a booking when a manager checks it in directly", async () => {
    const createRes = await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId,
      date: getTomorrowDateStr(),
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.booking.id;
    await moveBookingIntoOpenCheckInWindow(bookingId);

    const checkInRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/check-in`)
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({});

    if (checkInRes.status !== 200) console.error("Check-In Error:", checkInRes.body);
    expect(checkInRes.status).toBe(200);
    expect(checkInRes.body.booking.status).toBe("completed");
    expect(checkInRes.body.booking.checkInVerified).toBe(true);
    expect(checkInRes.body.booking.checkedIn).toBe(true);
    expect(checkInRes.body.booking.checkedInAt).toBeTruthy();

    const playerMeRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(playerMeRes.status).toBe(200);
    expect(playerMeRes.body.user.stats.totalBookings).toBe(1);
    expect(playerMeRes.body.user.stats.completedBookings).toBe(1);
    expect(playerMeRes.body.user.stats.upcomingBookings).toBe(0);

    const managerMeRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Origin", origin)
      .set("Cookie", [managerToken]);

    expect(managerMeRes.status).toBe(200);
    expect(managerMeRes.body.user.stats.totalBookings).toBe(1);
    expect(managerMeRes.body.user.stats.completedBookings).toBe(1);
    expect(managerMeRes.body.user.stats.upcomingBookings).toBe(0);

    const checkOutRes = await request(app)
      .post(`/api/v1/bookings/${bookingId}/check-out`)
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({});

    expect(checkOutRes.status).toBe(410);
    expect(checkOutRes.body.message).toMatch(/checkout is no longer used|completed/i);
  });

  it("filters revenue reports by walk-in guests and keeps a full customer breakdown", async () => {
    const date = getTomorrowDateStr();

    const manualRes = await request(app)
      .post("/api/v1/bookings/manual")
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({
        courtId,
        date,
        startTime: "08:00",
        endTime: "09:00",
        guestName: "Revenue Walk-in",
        guestPhone: "01077777777",
      });

    expect(manualRes.status).toBe(201);

    const playerRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "09:00",
        endTime: "10:00",
      });

    expect(playerRes.status).toBe(201);

    await moveBookingIntoOpenCheckInWindow(manualRes.body.booking.id);
    await moveBookingIntoOpenCheckInWindow(playerRes.body.booking.id);

    const manualCheckInRes = await request(app)
      .post(`/api/v1/bookings/${manualRes.body.booking.id}/check-in`)
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({});
    expect(manualCheckInRes.status).toBe(200);

    const playerCheckInRes = await request(app)
      .post(`/api/v1/bookings/${playerRes.body.booking.id}/check-in`)
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({});
    expect(playerCheckInRes.status).toBe(200);

    const revenueRes = await request(app)
      .get("/api/v1/bookings/revenue-report?customerType=guest")
      .set("Origin", origin)
      .set("Cookie", [managerToken]);

    expect(revenueRes.status).toBe(200);
    expect(revenueRes.body.items).toHaveLength(1);
    expect(revenueRes.body.items[0].userEmail).toMatch(/@walkin\.local$/i);
    expect(revenueRes.body.summary.checkedInCount).toBe(1);
    expect(revenueRes.body.customerSummary).toMatchObject({
      total: 2,
      guestCount: 1,
      registeredCount: 1,
    });
    expect(revenueRes.body.customerSummary.guestRevenue).toBeGreaterThan(0);
    expect(revenueRes.body.customerSummary.registeredRevenue).toBeGreaterThan(0);
  });

  it("should count attended bookings in manager and admin dashboard stats after check-in", async () => {
    const adminEmail = `admin_attended_${Date.now()}@example.com`;
    const adminPhone = `015${String(Date.now()).slice(-8)}`;

    const adminReg = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send({
        name: "Admin",
        email: adminEmail,
        phone: adminPhone,
        password: "Password123",
      });

    expect(adminReg.status).toBe(201);
    await waitForUserByEmail(adminReg.body.user.email);
    await promoteRoleById(adminReg.body.user.id, "admin");

    const adminLogin = await loginUntilOk(app, adminReg.body.user.email);
    expect(adminLogin.status).toBe(200);
    const adminToken = cookieFromLogin(adminLogin);

    const createRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date: getTomorrowDateStr(),
        startTime: "10:00",
        endTime: "11:00",
      });

    expect(createRes.status).toBe(201);
    await moveBookingIntoOpenCheckInWindow(createRes.body.booking.id);

    const checkInRes = await request(app)
      .post(`/api/v1/bookings/${createRes.body.booking.id}/check-in`)
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({});

    expect(checkInRes.status).toBe(200);

    const managerStatsRes = await request(app)
      .get("/api/v1/bookings/dashboard-stats")
      .set("Origin", origin)
      .set("Cookie", [managerToken]);

    expect(managerStatsRes.status).toBe(200);
    expect(managerStatsRes.body.bookingCounts.checked_in).toBe(1);
    expect(managerStatsRes.body.bookingCounts.completed).toBe(1);
    expect(managerStatsRes.body.grossRevenue).toBeGreaterThan(0);
    expect(managerStatsRes.body.checkedInAmount).toBeGreaterThan(0);

    const adminStatsRes = await request(app)
      .get("/api/v1/admin/dashboard-stats")
      .set("Origin", origin)
      .set("Cookie", [adminToken]);

    expect(adminStatsRes.status).toBe(200);
    expect(adminStatsRes.body.bookingCounts.checked_in).toBe(1);
    expect(adminStatsRes.body.bookingCounts.completed).toBe(1);
    expect(adminStatsRes.body.grossRevenue).toBeGreaterThan(0);
    expect(adminStatsRes.body.checkedInAmount).toBeGreaterThan(0);
  });

  it("should auto-mark an expired unattended booking as no-show across player, manager, and admin views", async () => {
    const adminEmail = `admin_${Date.now()}@example.com`;
    const adminPhone = `015${String(Date.now()).slice(-8)}`;

    const adminReg = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send({
        name: "Admin",
        email: adminEmail,
        phone: adminPhone,
        password: "Password123",
      });

    expect(adminReg.status).toBe(201);
    await waitForUserByEmail(adminReg.body.user.email);
    await promoteRoleById(adminReg.body.user.id, "admin");

    const adminLogin = await loginUntilOk(app, adminReg.body.user.email);
    expect(adminLogin.status).toBe(200);
    const adminToken = cookieFromLogin(adminLogin);

    const adminStatsBefore = await request(app)
      .get("/api/v1/admin/dashboard-stats")
      .set("Origin", origin)
      .set("Cookie", [adminToken]);

    expect(adminStatsBefore.status).toBe(200);

    const createRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date: getTomorrowDateStr(),
        startTime: "10:00",
        endTime: "11:00",
      });

    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.booking.id;

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        date: getPastDateStr(),
        startTime: "10:00",
        endTime: "11:00",
        status: "confirmed",
        checkInVerified: false,
        checkedIn: false,
        checkedInAt: null,
      },
    });

    const playerMeRes = await request(app)
      .get("/api/v1/auth/me")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(playerMeRes.status).toBe(200);
    expect(playerMeRes.body.user.stats.totalBookings).toBe(1);
    expect(playerMeRes.body.user.stats.completedBookings).toBe(0);
    expect(playerMeRes.body.user.stats.upcomingBookings).toBe(0);

    const playerListRes = await request(app)
      .get("/api/v1/bookings?mine=true&status=no_show")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(playerListRes.status).toBe(200);
    expect(playerListRes.body.items).toHaveLength(1);
    expect(playerListRes.body.items[0].id).toBe(bookingId);
    expect(playerListRes.body.items[0].status).toBe("no_show");

    const managerStatsRes = await request(app)
      .get("/api/v1/bookings/dashboard-stats")
      .set("Origin", origin)
      .set("Cookie", [managerToken]);

    expect(managerStatsRes.status).toBe(200);
    expect(managerStatsRes.body.totalBookings).toBe(1);
    expect(managerStatsRes.body.bookingCounts.confirmed).toBe(0);
    expect(managerStatsRes.body.bookingCounts.no_show).toBe(1);

    const adminStatsAfter = await request(app)
      .get("/api/v1/admin/dashboard-stats")
      .set("Origin", origin)
      .set("Cookie", [adminToken]);

    expect(adminStatsAfter.status).toBe(200);
    expect(adminStatsAfter.body.totalBookings).toBe(
      adminStatsBefore.body.totalBookings + 1,
    );
    expect(adminStatsAfter.body.bookingCounts.no_show).toBe(
      adminStatsBefore.body.bookingCounts.no_show + 1,
    );
  });

  it("should sync expired unattended bookings when admin dashboard stats are requested directly", async () => {
    const adminEmail = `admin_direct_${Date.now()}@example.com`;
    const adminPhone = `015${String(Date.now()).slice(-8)}`;

    const adminReg = await request(app)
      .post("/api/v1/auth/register")
      .set("Origin", origin)
      .send({
        name: "Admin Direct",
        email: adminEmail,
        phone: adminPhone,
        password: "Password123",
      });

    expect(adminReg.status).toBe(201);
    await waitForUserByEmail(adminReg.body.user.email);
    await promoteRoleById(adminReg.body.user.id, "admin");

    const adminLogin = await loginUntilOk(app, adminReg.body.user.email);
    expect(adminLogin.status).toBe(200);
    const adminToken = cookieFromLogin(adminLogin);

    const createRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date: getTomorrowDateStr(),
        startTime: "12:00",
        endTime: "13:00",
      });

    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.booking.id;

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        date: getPastDateStr(),
        startTime: "12:00",
        endTime: "13:00",
        status: "confirmed",
        checkInVerified: false,
        checkedIn: false,
        checkedInAt: null,
      },
    });

    const adminStatsRes = await request(app)
      .get("/api/v1/admin/dashboard-stats")
      .set("Origin", origin)
      .set("Cookie", [adminToken]);

    expect(adminStatsRes.status).toBe(200);
    expect(adminStatsRes.body.bookingCounts.confirmed).toBe(0);
    expect(adminStatsRes.body.bookingCounts.no_show).toBe(1);

    const refreshedBooking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true },
    });

    expect(refreshedBooking?.status).toBe("no_show");
  });

  it("should support upcoming bucket and checked-in attendance filters for booking lists", async () => {
    const futureBookingRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date: getTomorrowDateStr(),
        startTime: "15:00",
        endTime: "16:00",
      });

    expect(futureBookingRes.status).toBe(201);

    // Online-enabled courts now create an unpaid 15-minute hold. Upcoming reservations only
    // include confirmed bookings, so model the HMAC-verified payment settlement explicitly.
    await prisma.booking.update({
      where: { id: futureBookingRes.body.booking.id },
      data: { status: "confirmed", paymentStatus: "paid", expiresAt: null },
    });

    const attendedBookingRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date: getTomorrowDateStr(),
        startTime: "17:00",
        endTime: "18:00",
      });

    expect(attendedBookingRes.status).toBe(201);

    await prisma.booking.update({
      where: { id: attendedBookingRes.body.booking.id },
      data: {
        status: "completed",
        paymentStatus: "paid",
        expiresAt: null,
        checkedIn: true,
        checkInVerified: true,
        checkedInAt: new Date(),
      },
    });

    const upcomingRes = await request(app)
      .get("/api/v1/bookings?mine=true&bucket=upcoming")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(upcomingRes.status).toBe(200);
    expect(upcomingRes.body.items).toHaveLength(1);
    expect(upcomingRes.body.items[0].id).toBe(futureBookingRes.body.booking.id);

    const checkedInRes = await request(app)
      .get("/api/v1/bookings?mine=true&attendance=checked_in&includeSummary=true")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(checkedInRes.status).toBe(200);
    expect(checkedInRes.body.items).toHaveLength(1);
    expect(checkedInRes.body.items[0].id).toBe(attendedBookingRes.body.booking.id);
    expect(checkedInRes.body.summary.checked_in).toBe(1);
    expect(checkedInRes.body.summary.completed).toBe(1);
  });

  it("should split upcoming and history buckets without dropping past bookings", async () => {
    const upcomingRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date: getTomorrowDateStr(),
        startTime: "13:00",
        endTime: "14:00",
      });

    expect(upcomingRes.status).toBe(201);

    await prisma.booking.update({
      where: { id: upcomingRes.body.booking.id },
      data: { status: "confirmed", paymentStatus: "paid", expiresAt: null },
    });

    const historyRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date: getTomorrowDateStr(),
        startTime: "18:00",
        endTime: "19:00",
      });

    expect(historyRes.status).toBe(201);

    await prisma.booking.update({
      where: { id: historyRes.body.booking.id },
      data: {
        date: getPastDateStr(),
        startTime: "18:00",
        endTime: "19:00",
        status: "confirmed",
        paymentStatus: "paid",
        expiresAt: null,
        checkInVerified: false,
        checkedIn: false,
        checkedInAt: null,
      },
    });

    const upcomingListRes = await request(app)
      .get("/api/v1/bookings?mine=true&bucket=upcoming")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(upcomingListRes.status).toBe(200);
    expect(upcomingListRes.body.items.some((item) => item.id === upcomingRes.body.booking.id)).toBe(true);
    expect(upcomingListRes.body.items.some((item) => item.id === historyRes.body.booking.id)).toBe(false);

    const historyListRes = await request(app)
      .get("/api/v1/bookings?mine=true&bucket=history")
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(historyListRes.status).toBe(200);
    expect(historyListRes.body.items.some((item) => item.id === historyRes.body.booking.id)).toBe(true);
    expect(historyListRes.body.items.some((item) => item.id === upcomingRes.body.booking.id)).toBe(false);
  });

  it("should block a player from updating booking status", async () => {
    const date = getTomorrowDateStr();
    const createRes = await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "18:00", endTime: "19:00"
    });
    const bookingId = createRes.body.booking.id;

    const res = await request(app)
      .patch(`/api/v1/bookings/${bookingId}`)
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({ status: "completed" });
    
    expect(res.status).toBe(403);
  });

  it("should allow a manager to cancel their own court's booking", async () => {
    const date = getTomorrowDateStr();
    const createRes = await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "21:00", endTime: "22:00"
    });
    const bookingId = createRes.body.booking.id;

    const res = await request(app)
      .post(`/api/v1/bookings/${bookingId}/cancel`)
      .set("Origin", origin)
      .set("Cookie", [managerToken]);
    
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("cancelled");
    expect(res.body.booking.cancellationReason).toBe("manager");
  });

  it("should allow a manager to update booking notes and payment status", async () => {
    const date = getTomorrowDateStr();
    const createRes = await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "19:00", endTime: "20:00"
    });
    const bookingId = createRes.body.booking.id;

    const res = await request(app)
      .patch(`/api/v1/bookings/${bookingId}`)
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({ notes: "  Paid in cash  ", paymentStatus: "paid", paymentMethod: "cash" });
    
    expect(res.status).toBe(200);
    expect(res.body.booking.notes).toBe("Paid in cash");
    expect(res.body.booking.paymentStatus).toBe("paid");
    expect(res.body.booking.paymentMethod).toBe("cash");
  });

  it("should reject generic PATCH cancellation so side effects stay on the dedicated cancel endpoint", async () => {
    const date = getTomorrowDateStr();
    const createRes = await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "17:00", endTime: "18:00"
    });
    const bookingId = createRes.body.booking.id;

    const res = await request(app)
      .patch(`/api/v1/bookings/${bookingId}`)
      .set("Origin", origin)
      .set("Cookie", [managerToken])
      .send({ status: "cancelled" });

    expect(res.status).toBe(400);

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, paymentStatus: true },
    });
    // The generic PATCH is rejected; the unpaid 15-minute hold must remain untouched.
    expect(booking?.status).toBe("pending");
    expect(booking?.paymentStatus).toBe("pending");
  });

  it("preserves an expired in-flight checkout throughout the two-minute grace window", async () => {
    const date = getTomorrowDateStr();
    const createRes = await request(app)
      .post("/api/v1/bookings")
      .set("Origin", origin)
      .set("Cookie", [playerToken])
      .send({
        courtId,
        date,
        startTime: "18:00",
        endTime: "19:00",
      });

    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.booking.id;

    const payment = await prisma.payment.create({
      data: {
        bookingId,
        userId: playerId,
        provider: "paymob",
        paymobOrderId: `grace_order_${Date.now()}`,
        amountCents: 10000,
        currency: "EGP",
        status: "pending",
      },
    });

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "pending",
        paymentStatus: "pending",
        cancellationReason: null,
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    const getRes = await request(app)
      .get(`/api/v1/bookings/${bookingId}`)
      .set("Origin", origin)
      .set("Cookie", [playerToken]);

    expect(getRes.status).toBe(200);
    expect(getRes.body.booking.status).toBe("pending");
    expect(getRes.body.booking.cancellationReason).toBeNull();

    const refreshed = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { status: true, paymentStatus: true, cancellationReason: true },
    });

    expect(payment.status).toBe("pending");
    expect(refreshed).toMatchObject({
      status: "pending",
      paymentStatus: "pending",
      cancellationReason: null,
    });
  });

  it("should allow an admin to delete/archive a booking", async () => {
    const date = getTomorrowDateStr();
    const createRes = await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "16:00", endTime: "17:00"
    });
    const bookingId = createRes.body.booking.id;

    // Register an admin to test deletion
    const adminEmail = `admin_${Date.now()}@example.com`;
    const admReg = await request(app).post("/api/v1/auth/register").set("Origin", origin).send({
      name: "Admin", email: adminEmail, phone: uniquePhone("014"), password: "Password123",
    });
    expect(admReg.status).toBe(201);
    await waitForUserByEmail(admReg.body.user.email);
    await promoteRoleById(admReg.body.user.id, "admin");

    const adminLogin = await loginUntilOk(app, admReg.body.user.email);
    expect(adminLogin.status).toBe(200);
    const adminToken = cookieFromLogin(adminLogin);

    const res = await request(app)
      .delete(`/api/v1/bookings/${bookingId}`)
      .set("Origin", origin)
      .set("Cookie", [adminToken]);
    
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe("cancelled");
    expect(res.body.booking.notes).toMatch(/Archived by Admin/i);
  });

  it("keeps a paid Paymob archive in refund_pending when gateway settlement fails", async () => {
    const future = new Date();
    future.setDate(future.getDate() + 3);
    const date = `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, "0")}-${String(future.getDate()).padStart(2, "0")}`;
    const booking = await prisma.booking.create({
      data: {
        courtId,
        userId: playerId,
        date,
        startTime: "18:00",
        endTime: "19:00",
        sessionOpenTime: "00:00",
        sessionCloseTime: "00:00",
        duration: 60,
        totalPrice: 100,
        amount: 100,
        status: "confirmed",
        paymentStatus: "paid",
        checkInCode: `TSTARC${Date.now()}`,
      },
    });
    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        userId: playerId,
        provider: "paymob",
        paymobTransactionId: `archive_txn_${Date.now()}`,
        amountCents: 10000,
        currency: "EGP",
        status: "paid",
        hmacVerified: true,
      },
    });

    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ message: "Gateway temporarily unavailable" }),
    });

    try {
      const result = await deleteBookingService(booking.id, { id: playerId, role: "admin" });
      expect(result.refundIssued).toBe(false);
      expect(result.refundPending).toBe(true);

      const [updatedBooking, updatedPayment] = await Promise.all([
        prisma.booking.findUnique({ where: { id: booking.id } }),
        prisma.payment.findUnique({ where: { id: payment.id } }),
      ]);
      expect(updatedBooking).toMatchObject({
        status: "cancelled",
        cancellationReason: "manager",
        paymentStatus: "refund_pending",
      });
      expect(updatedPayment?.status).toBe("refund_pending");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("should allow fetching booked slots for availability", async () => {
    const date = getTomorrowDateStr();
    await request(app).post("/api/v1/bookings").set("Origin", origin).set("Cookie", [playerToken]).send({
      courtId, date, startTime: "08:00", endTime: "09:00"
    });

    const res = await request(app)
      .get(`/api/v1/bookings/availability?courtId=${courtId}&date=${date}`)
      .set("Origin", origin)
      .set("Cookie", [playerToken]);
    
    expect(res.status).toBe(200);
    expect(res.body.bookedSlots).toBeDefined();
    expect(res.body.bookedSlots.length).toBeGreaterThan(0);
    expect(res.body.bookedSlots[0].startTime).toBe("08:00");
  });

});
