import { jest } from "@jest/globals";
import crypto from "crypto";
import {
  verifyTransactionHmac,
  createPaymentIntention,
} from "../../src/modules/payments/paymob.service.js";

describe("Paymob Service - Unit Tests (Phase 5)", () => {
  const secretKey = "egy_sk_test_mock_secret_key";
  const publicKey = "egy_pk_test_mock_public_key";
  const hmacSecret = "TEST_HMAC_SECRET_1234567890ABCDEF";
  const apiKey = "TEST_API_KEY_MOCK";

  beforeEach(() => {
    process.env.PAYMOB_SECRET_KEY = secretKey;
    process.env.PAYMOB_PUBLIC_KEY = publicKey;
    process.env.PAYMOB_HMAC_SECRET = hmacSecret;
    process.env.PAYMOB_API_KEY = apiKey;
    process.env.PAYMOB_BASE_URL = "https://accept.paymob.com";
  });

  describe("HMAC SHA-512 Verification (20 Canonical Fields)", () => {
    const sampleObj = {
      amount_cents: 20000,
      created_at: "2026-08-14T20:00:00.000000",
      currency: "EGP",
      error_occured: false,
      has_parent_transaction: false,
      id: 515460807,
      integration_id: 5835543,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 587505945 },
      owner: 2428940,
      pending: false,
      source_data: {
        pan: "2346",
        sub_type: "MasterCard",
        type: "card",
      },
      success: true,
    };

    function calculateHmac(obj, secret) {
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
      return crypto.createHmac("sha512", secret).update(concatenated).digest("hex").toLowerCase();
    }

    it("should return true for a correctly signed callback", () => {
      const validHmac = calculateHmac(sampleObj, hmacSecret);
      expect(verifyTransactionHmac(sampleObj, validHmac)).toBe(true);
    });

    it("should return true when HMAC is in uppercase (case-insensitive)", () => {
      const validHmacUpper = calculateHmac(sampleObj, hmacSecret).toUpperCase();
      expect(verifyTransactionHmac(sampleObj, validHmacUpper)).toBe(true);
    });

    it("should return false if amount_cents is tampered", () => {
      const validHmac = calculateHmac(sampleObj, hmacSecret);
      const tampered = { ...sampleObj, amount_cents: 10000 };
      expect(verifyTransactionHmac(tampered, validHmac)).toBe(false);
    });

    it("should return false if success status is tampered", () => {
      const validHmac = calculateHmac(sampleObj, hmacSecret);
      const tampered = { ...sampleObj, success: false };
      expect(verifyTransactionHmac(tampered, validHmac)).toBe(false);
    });

    it("should return false if order id is tampered", () => {
      const validHmac = calculateHmac(sampleObj, hmacSecret);
      const tampered = { ...sampleObj, order: { id: 9999999 } };
      expect(verifyTransactionHmac(tampered, validHmac)).toBe(false);
    });

    it("should return false if secret is incorrect", () => {
      const wrongSecretHmac = calculateHmac(sampleObj, "WRONG_SECRET");
      expect(verifyTransactionHmac(sampleObj, wrongSecretHmac)).toBe(false);
    });

    it("should return false if obj or hmac is null/undefined", () => {
      expect(verifyTransactionHmac(null, "some_hmac")).toBe(false);
      expect(verifyTransactionHmac(sampleObj, null)).toBe(false);
      expect(verifyTransactionHmac(sampleObj, "")).toBe(false);
    });
  });

  describe("Unified Checkout URL Builder", () => {
    it("should build Unified Checkout URL with accept.paymob.com/unifiedcheckout/", async () => {
      const mockClientSecret = "egy_csk_test_mock_12345";
      const originalFetch = global.fetch;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pi_test_123",
          client_secret: mockClientSecret,
          intention_order_id: 123456,
        }),
      });

      const result = await createPaymentIntention({
        amountCents: 20000,
        currency: "EGP",
        specialReference: "booking_123_1723640000000",
        customer: { firstName: "Test", lastName: "User", email: "test@user.com", phone: "+201000000000" },
      });

      expect(result.clientSecret).toBe(mockClientSecret);
      expect(result.checkoutUrl).toBe(
        `https://accept.paymob.com/unifiedcheckout/?publicKey=${publicKey}&clientSecret=${mockClientSecret}`
      );
      expect(global.fetch).toHaveBeenCalledWith(
        "https://accept.paymob.com/v1/intention/",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: `Token ${secretKey}`,
            "Content-Type": "application/json",
          }),
        })
      );

      global.fetch = originalFetch;
    });
  });
});
