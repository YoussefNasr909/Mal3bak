import { verifyTransactionHmac } from "../../src/modules/payments/paymob.service.js";
import crypto from "crypto";

describe("Paymob Service - HMAC SHA-512 Verification", () => {
  const secret = "TEST_HMAC_SECRET_12345";

  beforeAll(() => {
    process.env.PAYMOB_HMAC_SECRET = secret;
  });

  it("should verify valid transaction HMAC correctly", () => {
    const sampleObj = {
      amount_cents: 100,
      created_at: "2020-03-25T18:39:44.719228",
      currency: "EGP",
      error_occured: false,
      has_parent_transaction: false,
      id: 2556706,
      integration_id: 6741,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 4778239 },
      owner: 4705,
      pending: false,
      source_data: {
        pan: "2346",
        sub_type: "MasterCard",
        type: "card",
      },
      success: true,
    };

    // Calculate expected HMAC SHA-512 based on the 20 canonical fields in exact order
    const fields = [
      sampleObj.amount_cents,
      sampleObj.created_at,
      sampleObj.currency,
      sampleObj.error_occured,
      sampleObj.has_parent_transaction,
      sampleObj.id,
      sampleObj.integration_id,
      sampleObj.is_3d_secure,
      sampleObj.is_auth,
      sampleObj.is_capture,
      sampleObj.is_refunded,
      sampleObj.is_standalone_payment,
      sampleObj.is_voided,
      sampleObj.order.id,
      sampleObj.owner,
      sampleObj.pending,
      sampleObj.source_data.pan,
      sampleObj.source_data.sub_type,
      sampleObj.source_data.type,
      sampleObj.success,
    ];

    const concatenatedString = fields.map(String).join("");
    const validHmac = crypto
      .createHmac("sha512", secret)
      .update(concatenatedString)
      .digest("hex");

    const result = verifyTransactionHmac(sampleObj, validHmac);
    expect(result).toBe(true);
  });

  it("should reject tampered payload or invalid HMAC", () => {
    const sampleObj = {
      amount_cents: 1000, // Tampered amount
      created_at: "2020-03-25T18:39:44.719228",
      currency: "EGP",
      error_occured: false,
      has_parent_transaction: false,
      id: 2556706,
      integration_id: 6741,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 4778239 },
      owner: 4705,
      pending: false,
      source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
      success: true,
    };

    const result = verifyTransactionHmac(sampleObj, "invalid_hmac_hex_string_1234567890");
    expect(result).toBe(false);
  });
});
