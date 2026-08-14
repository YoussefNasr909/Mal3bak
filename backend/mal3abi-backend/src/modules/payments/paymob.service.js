import crypto from "crypto";

const getPaymobBaseUrl = () => process.env.PAYMOB_BASE_URL || "https://accept.paymob.com";
const getPaymobSecretKey = () => process.env.PAYMOB_SECRET_KEY || "";
const getPaymobPublicKey = () => process.env.PAYMOB_PUBLIC_KEY || "";
const getPaymobHmacSecret = () => process.env.PAYMOB_HMAC_SECRET || "";
const getPaymobApiKey = () => process.env.PAYMOB_API_KEY || "";
const getCardIntegrationId = () => Number(process.env.PAYMOB_INTEGRATION_ID_CARD) || 0;
const getWalletIntegrationId = () => Number(process.env.PAYMOB_INTEGRATION_ID_WALLET) || 0;

/**
 * Creates a Paymob Payment Intention using POST /v1/intention/
 * Required Header: Authorization: Token <SECRET_KEY>
 */
export async function createPaymentIntention({
  amountCents,
  currency = "EGP",
  specialReference,
  customer,
  items = [],
  paymentMethodType = "card",
  notificationUrl,
  redirectionUrl,
}) {
  const secretKey = getPaymobSecretKey();
  if (!secretKey) {
    throw new Error("PAYMOB_SECRET_KEY is not configured in environment variables");
  }

  const integrationId = paymentMethodType === "wallet" ? getWalletIntegrationId() : getCardIntegrationId();
  if (!integrationId) {
    throw new Error(`Paymob integration ID for '${paymentMethodType}' is not configured`);
  }

  const payload = {
    amount: amountCents,
    currency,
    payment_methods: [integrationId],
    items: items.map((item) => ({
      name: item.name || "Court Booking",
      amount: item.amount || amountCents,
      description: item.description || "Mal3bk Court Booking",
      quantity: item.quantity || 1,
    })),
    billing_data: {
      first_name: customer.firstName || "Player",
      last_name: customer.lastName || "User",
      email: customer.email || "player@mal3bk.com",
      phone_number: customer.phone || "+201000000000",
      apartment: "NA",
      floor: "NA",
      street: "NA",
      building: "NA",
      shipping_method: "NA",
      postal_code: "NA",
      city: "Cairo",
      country: "EGY",
      state: "Cairo",
    },
    customer: {
      first_name: customer.firstName || "Player",
      last_name: customer.lastName || "User",
      email: customer.email || "player@mal3bk.com",
    },
    special_reference: specialReference,
    notification_url: notificationUrl || `${process.env.BACKEND_URL || "http://localhost:4000"}/api/v1/payments/webhook`,
    redirection_url: redirectionUrl || `${process.env.PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || "http://localhost:3000"}/payment/complete?booking_id=${specialReference}`,
  };

  const response = await fetch(`${getPaymobBaseUrl()}/v1/intention/`, {
    method: "POST",
    headers: {
      "Authorization": `Token ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData.detail || JSON.stringify(errorData) || `Paymob API returned status ${response.status}`;
    throw new Error(`Paymob Intention Error: ${errorMsg}`);
  }

  const data = await response.json();
  const publicKey = getPaymobPublicKey();
  const checkoutUrl = `https://eg.checkout.paymob.com/?publicKey=${publicKey}&clientSecret=${data.client_secret}`;

  return {
    id: data.id,
    clientSecret: data.client_secret,
    checkoutUrl,
    paymobOrderId: data.intention_order_id || (data.order && data.order.id) || null,
  };
}

/**
 * Validates the HMAC-SHA512 signature of a Paymob Transaction Processed Callback.
 * Canonical order of 20 fields specified in Paymob documentation:
 * 1. amount_cents
 * 2. created_at
 * 3. currency
 * 4. error_occured
 * 5. has_parent_transaction
 * 6. id
 * 7. integration_id
 * 8. is_3d_secure
 * 9. is_auth
 * 10. is_capture
 * 11. is_refunded
 * 12. is_standalone_payment
 * 13. is_voided
 * 14. order.id
 * 15. owner
 * 16. pending
 * 17. source_data.pan
 * 18. source_data.sub_type
 * 19. source_data.type
 * 20. success
 */
export function verifyTransactionHmac(obj, receivedHmac) {
  const hmacSecret = getPaymobHmacSecret();
  if (!hmacSecret || !receivedHmac || !obj) {
    return false;
  }

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

  const concatenatedString = fields.map((val) => (val !== undefined && val !== null ? String(val) : "")).join("");
  const computedHmac = crypto
    .createHmac("sha512", hmacSecret)
    .update(concatenatedString)
    .digest("hex")
    .toLowerCase();

  const receivedHmacLower = String(receivedHmac).toLowerCase();

  if (computedHmac.length !== receivedHmacLower.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(computedHmac), Buffer.from(receivedHmacLower));
}

/**
 * Refund a Paymob Transaction
 * POST /api/acceptance/void_refund/refund
 */
export async function refundTransaction({ transactionId, amountCents }) {
  const secretKey = getPaymobSecretKey();
  if (!secretKey) {
    throw new Error("PAYMOB_SECRET_KEY is not configured");
  }

  const response = await fetch(`${getPaymobBaseUrl()}/api/acceptance/void_refund/refund`, {
    method: "POST",
    headers: {
      "Authorization": `Token ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction_id: String(transactionId),
      amount_cents: String(amountCents),
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(`Refund failed: ${errData.message || JSON.stringify(errData)}`);
  }

  return await response.json();
}

/**
 * Transaction Inquiry (Fallback reconciliation)
 * Uses API Key -> Auth Token flow
 */
export async function inquireTransaction(transactionId) {
  const apiKey = getPaymobApiKey();
  if (!apiKey) {
    throw new Error("PAYMOB_API_KEY is not configured");
  }

  // Step 1: Get short-lived Auth Token
  const tokenRes = await fetch(`${getPaymobBaseUrl()}/api/auth/tokens`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });

  if (!tokenRes.ok) {
    throw new Error("Failed to authenticate with Paymob API Key for transaction inquiry");
  }

  const { token } = await tokenRes.json();

  // Step 2: Inquire transaction by ID
  const txnRes = await fetch(`${getPaymobBaseUrl()}/api/acceptance/transactions/${transactionId}?token=${token}`, {
    method: "GET",
  });

  if (!txnRes.ok) {
    throw new Error(`Transaction Inquiry failed for transaction ${transactionId}`);
  }

  return await txnRes.json();
}
