import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { processDeadLetterQueueService } from "../src/modules/payments/payments.service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env") });

// Parse CLI args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [k, v] = arg.split("=");
  acc[k.replace(/^--/, "")] = v !== undefined ? v : true;
  return acc;
}, {});

const maxAgeMinutes = Number(args.maxAgeMinutes) || 5;
const maxAttempts = Number(args.maxAttempts) || 5;
const limit = Number(args.limit) || 50;

async function runDLQ() {
  console.log("\n================ DEAD-LETTER QUEUE (DLQ) PROCESSOR ================");
  console.log(`Scan Criteria : Webhooks older than ${maxAgeMinutes} min with < ${maxAttempts} attempts`);
  console.log(`Batch Limit   : ${limit}`);
  console.log("===================================================================\n");

  const startTime = Date.now();
  const summary = await processDeadLetterQueueService({ maxAgeMinutes, maxAttempts, limit });
  const durationMs = Date.now() - startTime;

  console.log(`Scanned       : ${summary.totalScanned}`);
  console.log(`Succeeded     : ${summary.succeeded}`);
  console.log(`Failed        : ${summary.failed}`);
  console.log(`Dead-Lettered : ${summary.deadLettered}`);
  console.log(`Duration      : ${durationMs}ms\n`);

  if (summary.items.length > 0) {
    console.log("Item Details:");
    for (const item of summary.items) {
      console.log(` - [${item.status.toUpperCase()}] ID: ${item.id} ${item.error ? `| Error: ${item.error}` : ""}`);
    }
  }

  console.log("\n✔ DLQ processing run completed.\n");
  process.exit(0);
}

runDLQ().catch((err) => {
  console.error("DLQ processing failed with fatal exception:", err);
  process.exit(1);
});
