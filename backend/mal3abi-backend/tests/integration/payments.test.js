import { jest } from "@jest/globals";
import request from "supertest";
import crypto from "crypto";
import { app } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import {
  ORIGIN,
  seedPlayer,
  seedManagerWith24hCourt,
  seedAdmin,
  tomorrowDateStr,
} from "../helpers/integration-fixtures.js";
import { expireStaleBookingHoldsService } from "../../src/modules/bookings/bookings.service.js";

describe("Payments Module - Integration Tests (Phase 5)", () => {
  const hmacSecret = "TEST_INTEGRATION_HMAC_SECRET_512";
  let playerA;
  let playerB;
  let managerA;
  let managerB;
  let adminUser;
  let testDate;

  beforeEach(async () => {
    process.env.PAYMOB_HMAC_SECRET = hmacSecret;
    process.env.PAYMOB_SECRET_KEY = "egy_sk_test_mock_secret";
    process.env.PAYMOB_PUBLIC_KEY = "egy_pk_test_mock_public";
    process.env.PAYMOB_BASE_URL = "https://accept.paymob.com";

    testDate = tomorrowDateStr();

    playerA = await seedPlayer(app, "pay_pl_a");
    playerB = await seedPlayer(app, "pay_pl_b");
    managerA = await seedManagerWith24hCourt(app);
    managerB = await seedManagerWith24hCourt(app);
    adminUser = await seedAdmin(app);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function generateValidHmac(obj) {
    const fields = [
      obj.amount_cents,
      obj.created_at,
      obj.currency,
      obj.error_occured,
      obj.has_parent_transaction,
      obj.id,
      obj.integration_id,
      obj.is_3d_secure,
      obj.is_auth,
      obj.is_capture,
      obj.is_refunded,
      obj.is_standalone_payment,
      obj.is_voided,
      obj.order?.id,
      obj.owner,
      obj.pending,
      obj.source_data?.pan,
      obj.source_data?.sub_type,
      obj.source_data?.type,
      obj.success,
    ];
    const concatenated = fields.map((v) => (v !== undefined && v !== null ? String(v) : "")).join("");
    return crypto.createHmac("sha512", hmacSecret).update(concatenated).digest("hex").toLowerCase();
  }

  describe("POST /api/v1/payments/create-checkout-session", () => {
    it("should require authentication", async () => {
      const res = await request(app)
        .post("/api/v1/payments/create-checkout-session")
        .set("Origin", ORIGIN)
        .send({
          courtId: managerA.courtId,
          date: testDate,
          startTime: "10:00",
          endTime: "11:00",
        });

      expect(res.status).toBe(401);
    });

    it("should create a pending booking with a 15-minute hold (expiresAt)", async () => {
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pi_test_hold_123",
          client_secret: "egy_csk_test_hold_123",
          intention_order_id: 998877,
        }),
      });

      const beforeCreation = Date.now();
      const res = await request(app)
        .post("/api/v1/payments/create-checkout-session")
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token])
        .send({
          courtId: managerA.courtId,
          date: testDate,
          startTime: "11:00",
          endTime: "12:00",
          paymentMethodType: "card",
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("bookingId");
      expect(res.body).toHaveProperty("clientSecret", "egy_csk_test_hold_123");
      expect(res.body).toHaveProperty("checkoutUrl");
      expect(res.body.checkoutUrl).toContain("accept.paymob.com/unifiedcheckout/");

      const createdBooking = await prisma.booking.findUnique({
        where: { id: res.body.bookingId },
      });
      expect(createdBooking.status).toBe("pending");
      expect(createdBooking.paymentStatus).toBe("pending");
      expect(createdBooking.expiresAt).not.toBeNull();

      const holdTimeMs = new Date(createdBooking.expiresAt).getTime();
      expect(holdTimeMs).toBeGreaterThanOrEqual(beforeCreation + 14 * 60 * 1000);
      expect(holdTimeMs).toBeLessThanOrEqual(beforeCreation + 16 * 60 * 1000);

      global.fetch = originalFetch;
    });

    it("should calculate fixed deposit pricing correctly", async () => {
      await prisma.court.update({
        where: { id: managerA.courtId },
        data: {
          paymentPolicy: "fixed",
          depositValue: 50,
          allowOnlinePayment: true,
        },
      });

      const originalFetch = global.fetch;
      let sentAmountCents = 0;
      global.fetch = jest.fn().mockImplementation((url, opts) => {
        const body = JSON.parse(opts.body);
        sentAmountCents = body.amount;
        return Promise.resolve({
          ok: true,
          json: async () => ({
            id: "pi_test_dep_50",
            client_secret: "egy_csk_test_dep_50",
            intention_order_id: 112233,
          }),
        });
      });

      const res = await request(app)
        .post("/api/v1/payments/create-checkout-session")
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token])
        .send({
          courtId: managerA.courtId,
          date: testDate,
          startTime: "12:00",
          endTime: "13:00",
          paymentMethodType: "card",
        });

      expect(res.status).toBe(201);
      expect(res.body.amount).toBe(50);
      expect(sentAmountCents).toBe(5000);

      global.fetch = originalFetch;
    });
  });

  describe("POST /api/v1/payments/webhook", () => {
    it("should reject invalid HMAC signatures", async () => {
      const payload = {
        obj: {
          id: 999111,
          amount_cents: 10000,
          currency: "EGP",
          success: true,
          pending: false,
          error_occured: false,
          has_parent_transaction: false,
          is_3d_secure: true,
          is_auth: false,
          is_capture: false,
          is_refunded: false,
          is_standalone_payment: true,
          is_voided: false,
          order: { id: 888111 },
          created_at: "2026-08-14T22:00:00.000000",
        },
      };

      const res = await request(app)
        .post("/api/v1/payments/webhook?hmac=INVALID_FORGED_HMAC")
        .set("Origin", ORIGIN)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.processed).toBe(false);
    });

    it("should idempotently process valid payment webhook & confirm booking", async () => {
      const checkInCode = "TSTIDEM" + Math.floor(Math.random() * 10000);
      const booking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "14:00",
          endTime: "15:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "pending",
          paymentStatus: "pending",
          checkInCode,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });

      const payment = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          userId: playerA.userId,
          provider: "paymob",
          paymobOrderId: "9998881",
          amountCents: 10000,
          currency: "EGP",
          status: "pending",
        },
      });

      const txnId = 77889901;
      const callbackObj = {
        amount_cents: 10000,
        created_at: "2026-08-14T22:30:00.000000",
        currency: "EGP",
        error_occured: false,
        has_parent_transaction: false,
        id: txnId,
        integration_id: 5835543,
        is_3d_secure: true,
        is_auth: false,
        is_capture: false,
        is_refunded: false,
        is_standalone_payment: true,
        is_voided: false,
        order: { id: 9998881, merchant_order_id: `${booking.id}_${Date.now()}` },
        owner: 2428940,
        pending: false,
        source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
        success: true,
      };

      const validHmac = generateValidHmac(callbackObj);

      const res1 = await request(app)
        .post(`/api/v1/payments/webhook?hmac=${validHmac}`)
        .set("Origin", ORIGIN)
        .send({ obj: callbackObj });

      expect(res1.status).toBe(200);
      expect(res1.body.processed).toBe(true);

      const updatedBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(updatedBooking.status).toBe("confirmed");
      expect(updatedBooking.paymentStatus).toBe("paid");
      expect(updatedBooking.expiresAt).toBeNull();

      const updatedPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(updatedPayment.status).toBe("paid");
      expect(updatedPayment.paymobTransactionId).toBe(String(txnId));
      expect(updatedPayment.hmacVerified).toBe(true);

      const res2 = await request(app)
        .post(`/api/v1/payments/webhook?hmac=${validHmac}`)
        .set("Origin", ORIGIN)
        .send({ obj: callbackObj });

      expect(res2.status).toBe(200);
      expect(res2.body.processed).toBe(true);
    });

    it("should handle portal refunds (is_refunded: true)", async () => {
      const checkInCode = "TSTREF" + Math.floor(Math.random() * 10000);
      const booking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "16:00",
          endTime: "17:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "confirmed",
          paymentStatus: "paid",
          checkInCode,
        },
      });

      const payment = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          userId: playerA.userId,
          provider: "paymob",
          paymobOrderId: "8887771",
          paymobTransactionId: "66554433",
          amountCents: 10000,
          currency: "EGP",
          status: "paid",
          hmacVerified: true,
        },
      });

      const refundObj = {
        amount_cents: 10000,
        created_at: "2026-08-14T22:35:00.000000",
        currency: "EGP",
        error_occured: false,
        has_parent_transaction: true,
        id: 66554434,
        integration_id: 5835543,
        is_3d_secure: true,
        is_auth: false,
        is_capture: false,
        is_refunded: true,
        is_standalone_payment: true,
        is_voided: false,
        order: { id: 8887771, merchant_order_id: `${booking.id}_1723640000` },
        owner: 2428940,
        pending: false,
        source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
        success: true,
      };

      const validHmac = generateValidHmac(refundObj);
      const res = await request(app)
        .post(`/api/v1/payments/webhook?hmac=${validHmac}`)
        .set("Origin", ORIGIN)
        .send({ obj: refundObj });

      expect(res.status).toBe(200);

      const refundedBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(refundedBooking.status).toBe("cancelled");
      expect(refundedBooking.paymentStatus).toBe("refunded");

      const refundedPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(refundedPayment.status).toBe("refunded");
    });
  });

  describe("IDOR Protection: GET /api/v1/payments/status/:bookingId", () => {
    it("should allow booking owner (Player A) to view status", async () => {
      const testBooking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "18:00",
          endTime: "19:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "confirmed",
          paymentStatus: "paid",
          checkInCode: "TSTIDORSEC" + Math.floor(Math.random() * 10000),
        },
      });

      const res = await request(app)
        .get(`/api/v1/payments/status/${testBooking.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token]);

      expect(res.status).toBe(200);
      expect(res.body.booking.id).toBe(testBooking.id);
    });

    it("should allow court manager (Manager A) to view status", async () => {
      const testBooking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "18:00",
          endTime: "19:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "confirmed",
          paymentStatus: "paid",
          checkInCode: "TSTIDORMGR" + Math.floor(Math.random() * 10000),
        },
      });

      const res = await request(app)
        .get(`/api/v1/payments/status/${testBooking.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [managerA.token]);

      expect(res.status).toBe(200);
      expect(res.body.booking.id).toBe(testBooking.id);
    });

    it("should allow Admin to view status", async () => {
      const testBooking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "18:00",
          endTime: "19:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "confirmed",
          paymentStatus: "paid",
          checkInCode: "TSTIDORADM" + Math.floor(Math.random() * 10000),
        },
      });

      const res = await request(app)
        .get(`/api/v1/payments/status/${testBooking.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [adminUser.token]);

      expect(res.status).toBe(200);
      expect(res.body.booking.id).toBe(testBooking.id);
    });

    it("should block unauthorized player (Player B) with 403 Forbidden", async () => {
      const testBooking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "18:00",
          endTime: "19:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "confirmed",
          paymentStatus: "paid",
          checkInCode: "TSTIDORBLK" + Math.floor(Math.random() * 10000),
        },
      });

      const res = await request(app)
        .get(`/api/v1/payments/status/${testBooking.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [playerB.token]);

      expect(res.status).toBe(403);
    });

    it("should block unauthenticated requests with 401 Unauthorized", async () => {
      const testBooking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "18:00",
          endTime: "19:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "confirmed",
          paymentStatus: "paid",
          checkInCode: "TSTIDORUNAUTH" + Math.floor(Math.random() * 10000),
        },
      });

      const res = await request(app)
        .get(`/api/v1/payments/status/${testBooking.id}`)
        .set("Origin", ORIGIN);

      expect(res.status).toBe(401);
    });
  });

  describe("Multi-Tenant RBAC: POST /api/v1/payments/refund/:paymentId", () => {
    it("should block Player from issuing refunds (403 Forbidden)", async () => {
      const refundBooking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "20:00",
          endTime: "21:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "confirmed",
          paymentStatus: "paid",
          checkInCode: "TSTRBAC1" + Math.floor(Math.random() * 10000),
        },
      });

      const paymentRecord = await prisma.payment.create({
        data: {
          bookingId: refundBooking.id,
          userId: playerA.userId,
          provider: "paymob",
          paymobTransactionId: "99881122",
          amountCents: 10000,
          currency: "EGP",
          status: "paid",
          hmacVerified: true,
        },
      });

      const res = await request(app)
        .post(`/api/v1/payments/refund/${paymentRecord.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [playerA.token]);

      expect(res.status).toBe(403);
    });

    it("should block Manager B from refunding Manager A's court booking (403 Forbidden)", async () => {
      const refundBooking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "20:00",
          endTime: "21:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "confirmed",
          paymentStatus: "paid",
          checkInCode: "TSTRBAC2" + Math.floor(Math.random() * 10000),
        },
      });

      const paymentRecord = await prisma.payment.create({
        data: {
          bookingId: refundBooking.id,
          userId: playerA.userId,
          provider: "paymob",
          paymobTransactionId: "99881123",
          amountCents: 10000,
          currency: "EGP",
          status: "paid",
          hmacVerified: true,
        },
      });

      const res = await request(app)
        .post(`/api/v1/payments/refund/${paymentRecord.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [managerB.token]);

      expect(res.status).toBe(403);
    });

    it("should allow Manager A (court owner) to issue refund", async () => {
      const refundBooking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "20:00",
          endTime: "21:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "confirmed",
          paymentStatus: "paid",
          checkInCode: "TSTRBAC3" + Math.floor(Math.random() * 10000),
        },
      });

      const paymentRecord = await prisma.payment.create({
        data: {
          bookingId: refundBooking.id,
          userId: playerA.userId,
          provider: "paymob",
          paymobTransactionId: "99881124",
          amountCents: 10000,
          currency: "EGP",
          status: "paid",
          hmacVerified: true,
        },
      });

      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, id: 99881125 }),
      });

      const res = await request(app)
        .post(`/api/v1/payments/refund/${paymentRecord.id}`)
        .set("Origin", ORIGIN)
        .set("Cookie", [managerA.token]);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const dbPayment = await prisma.payment.findUnique({
        where: { id: paymentRecord.id },
      });
      expect(dbPayment.status).toBe("refunded");

      global.fetch = originalFetch;
    });
  });

  describe("Hold Expiration Cleaner Service", () => {
    it("should cancel expired pending bookings", async () => {
      const staleBooking = await prisma.booking.create({
        data: {
          courtId: managerA.courtId,
          userId: playerA.userId,
          date: testDate,
          startTime: "22:00",
          endTime: "23:00",
          sessionOpenTime: "00:00",
          sessionCloseTime: "00:00",
          duration: 60,
          totalPrice: 100,
          amount: 100,
          status: "pending",
          paymentStatus: "pending",
          checkInCode: "TSTSWEEP" + Math.floor(Math.random() * 10000),
          expiresAt: new Date(Date.now() - 60000),
        },
      });

      const sweptCount = await expireStaleBookingHoldsService();
      expect(sweptCount).toBeGreaterThanOrEqual(1);

      const updated = await prisma.booking.findUnique({ where: { id: staleBooking.id } });
      expect(updated.status).toBe("cancelled");
      expect(updated.paymentStatus).toBe("failed");
    });
  });
});
