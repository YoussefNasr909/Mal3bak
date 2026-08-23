import crypto from "crypto";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

const HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:4000";

// Parse CLI args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.split("=");
  acc[k.replace(/^--/, "")] = v !== undefined ? v : true;
  return acc;
}, {});

const bookingId = args.bookingId || "test-booking-id";
const amountCents = Number(args.amountCents) || 20000;
const isSuccess = args.success !== "false" && args.success !== false;
const isRefunded = args.refunded === "true" || args.refunded === true;
const transactionId = Number(args.transactionId) || Math.floor(100000000 + Math.random() * 900000000);
const orderId = Number(args.orderId) || Math.floor(100000000 + Math.random() * 900000000);

const samplePayloadObj = {
  amount_cents: amountCents,
  created_at: new Date().toISOString(),
  currency: "EGP",
  error_occured: !isSuccess,
  has_parent_transaction: false,
  id: transactionId,
  integration_id: 5835572,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: isRefunded,
  is_standalone_payment: true,
  is_voided: false,
  order: {
    id: orderId,
    merchant_order_id: `${bookingId}_${Date.now()}`,
  },
  owner: 2428940,
  pending: false,
  source_data: {
    pan: "01010101010",
    sub_type: "WALLET",
    type: "wallet",
  },
  success: isSuccess,
};

if (!HMAC_SECRET) {
  console.error("PAYMOB_HMAC_SECRET must be configured in backend/.env before simulating a webhook.");
  process.exit(1);
}

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

const computedHmac = calculateHmac(samplePayloadObj, HMAC_SECRET);

console.log("\n================ PAYMOB WEBHOOK SIMULATOR ================");
console.log(`Target URL        : ${BACKEND_URL}/api/v1/payments/webhook`);
console.log(`Booking ID        : ${bookingId}`);
console.log(`Transaction ID    : ${transactionId}`);
console.log(`Order ID          : ${orderId}`);
console.log(`Amount Cents      : ${amountCents} (${amountCents / 100} EGP)`);
console.log(`Payment Status    : ${isSuccess ? "SUCCESS" : "FAILED"}`);
console.log(`Computed HMAC-512 : ${computedHmac.slice(0, 16)}...${computedHmac.slice(-16)}`);
console.log("==========================================================\n");

async function dispatchWebhook() {
  try {
    const res = await fetch(`${BACKEND_URL}/api/v1/payments/webhook?hmac=${computedHmac}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "TRANSACTION",
        obj: samplePayloadObj,
      }),
    });

    const data = await res.json().catch(() => ({}));
    console.log(`[HTTP ${res.status}] Response:`, JSON.stringify(data, null, 2));

    if (res.ok && data.received) {
      console.log("\n✔ Webhook processed successfully by server.");
    } else {
      console.log("\n✖ Webhook rejected or failed.");
    }
  } catch (err) {
    console.error("Failed to connect to backend server:", err.message);
    console.log("Ensure backend server is running: `npm run dev` on port 4000");
  }
}

dispatchWebhook();
