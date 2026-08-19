import { jest } from "@jest/globals";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import {
  ORIGIN,
  seedPlayer,
  seedManagerWith24hCourt,
  tomorrowDateStr,
} from "../helpers/integration-fixtures.js";
import { expireStaleBookingHoldsService } from "../../src/modules/bookings/bookings.service.js";

describe("Booking Hold Lifecycle & Timer Integration Tests", () => {
  const hmacSecret = "TEST_INTEGRATION_HMAC_SECRET_512";
  let playerA;
  let playerB;
  let managerA;
  let testDate;

  beforeEach(async () => {
    process.env.PAYMOB_HMAC_SECRET = hmacSecret;
    process.env.PAYMOB_SECRET_KEY = "egy_sk_test_mock_secret";
    process.env.PAYMOB_PUBLIC_KEY = "egy_pk_test_mock_public";
    process.env.PAYMOB_BASE_URL = "https://accept.paymob.com";

    testDate = tomorrowDateStr();

    playerA = await seedPlayer(app, "hold_pl_a");
    playerB = await seedPlayer(app, "hold_pl_b");
    managerA = await seedManagerWith24hCourt(app);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("creates a 15-minute booking hold and retrieves hold status with remaining time", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url) => {
      if (String(url).includes("/v1/intention")) {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () =>
            Promise.resolve({
              id: "cs_hold_test_123",
              client_secret: "cs_secret_123",
              intention_order_id: 998811,
              payment_keys: [{ key: "pk_hold_123" }],
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });

    try {
      const res = await request(app)
        .post("/api/v1/payments/create-checkout-session")
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token])
        .send({
          courtId: managerA.courtId,
          date: testDate,
          startTime: "10:00",
          endTime: "11:00",
        });

      expect(res.status).toBe(201);
      expect(res.body.bookingId).toBeDefined();
      expect(res.body.expiresAt).toBeDefined();

      const bookingId = res.body.bookingId;

      // Check hold-status endpoint
      const holdRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}/hold-status`)
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token]);

      expect(holdRes.status).toBe(200);
      expect(holdRes.body.status).toBe("pending");
      expect(holdRes.body.isExpired).toBe(false);
      expect(holdRes.body.isPaid).toBe(false);
      expect(holdRes.body.remainingSeconds).toBeGreaterThan(0);
      expect(holdRes.body.courtName).toBeDefined();
      expect(holdRes.body.clientSecret).toBe("cs_secret_123");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("blocks another player from booking the same slot while the hold is active", async () => {
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "cs_hold_test_456",
          client_secret: "cs_secret_456",
          intention_order_id: 998822,
          payment_keys: [{ key: "pk_hold_456" }],
        }),
    });

    try {
      // Player A creates hold on 14:00-15:00
      const resA = await request(app)
        .post("/api/v1/payments/create-checkout-session")
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token])
        .send({
          courtId: managerA.courtId,
          date: testDate,
          startTime: "14:00",
          endTime: "15:00",
        });

      expect(resA.status).toBe(201);

      // Player B tries to checkout the same slot
      const resB = await request(app)
        .post("/api/v1/payments/create-checkout-session")
        .set("Origin", ORIGIN)
        .set("Cookie", [playerB.token])
        .send({
          courtId: managerA.courtId,
          date: testDate,
          startTime: "14:00",
          endTime: "15:00",
        });

      expect([400, 409]).toContain(resB.status);
      expect(resB.body.message).toMatch(/conflict|already booked|not available|no longer available/i);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("automatically expires stale hold, cancels booking, and frees the slot for other players", async () => {
    let seq = Date.now();
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation((url) => {
      seq += 1;
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: `cs_hold_test_${seq}`,
            client_secret: `cs_secret_${seq}`,
            intention_order_id: seq,
            payment_keys: [{ key: `pk_hold_${seq}` }],
          }),
      });
    });

    try {
      // Player A creates hold on 16:00-17:00
      const resA = await request(app)
        .post("/api/v1/payments/create-checkout-session")
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token])
        .send({
          courtId: managerA.courtId,
          date: testDate,
          startTime: "16:00",
          endTime: "17:00",
        });

      expect(resA.status).toBe(201);
      const bookingId = resA.body.bookingId;

      // Simulate hold expiration by setting expiresAt in the past
      await prisma.booking.update({
        where: { id: bookingId },
        data: { expiresAt: new Date(Date.now() - 1000 * 60 * 5) },
      });

      // Query hold status — should proactively cancel and return expired
      const holdRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}/hold-status`)
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token]);

      expect(holdRes.status).toBe(200);
      expect(["expired", "cancelled"]).toContain(holdRes.body.status);
      expect(holdRes.body.isExpired).toBe(true);
      expect(holdRes.body.remainingSeconds).toBe(0);

      // Now Player B should be able to book the exact same slot without conflict!
      const resB = await request(app)
        .post("/api/v1/payments/create-checkout-session")
        .set("Origin", ORIGIN)
        .set("Cookie", [playerB.token])
        .send({
          courtId: managerA.courtId,
          date: testDate,
          startTime: "16:00",
          endTime: "17:00",
        });

      expect(resB.status).toBe(201);
      expect(resB.body.bookingId).toBeDefined();
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("confirms booking when paid and updates hold status to confirmed", async () => {
    let seq = Date.now() + 500;
    const originalFetch = global.fetch;
    global.fetch = jest.fn().mockImplementation(() => {
      seq += 1;
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: `cs_hold_test_paid_${seq}`,
            client_secret: `cs_secret_paid_${seq}`,
            intention_order_id: seq,
            payment_keys: [{ key: `pk_hold_paid_${seq}` }],
          }),
      });
    });

    try {
      const resA = await request(app)
        .post("/api/v1/payments/create-checkout-session")
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token])
        .send({
          courtId: managerA.courtId,
          date: testDate,
          startTime: "18:00",
          endTime: "19:00",
        });

      expect(resA.status).toBe(201);
      const bookingId = resA.body.bookingId;

      // Simulate successful payment confirmation
      await prisma.booking.update({
        where: { id: bookingId },
        data: { status: "confirmed", paymentStatus: "paid", expiresAt: null },
      });

      const holdRes = await request(app)
        .get(`/api/v1/bookings/${bookingId}/hold-status`)
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token]);

      expect(holdRes.status).toBe(200);
      expect(holdRes.body.status).toBe("confirmed");
      expect(holdRes.body.isPaid).toBe(true);
      expect(holdRes.body.isExpired).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
