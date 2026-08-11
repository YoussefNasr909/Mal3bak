import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function applyEnvFile(fileName) {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const contents = readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) continue;

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key]) continue;

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

[".env.production.local", ".env.local", ".env.production", ".env"].forEach(applyEnvFile);

const isAbsoluteHttpUrl = (value) => /^https?:\/\//i.test(String(value || "").trim());

const hasServerApiUrl = Boolean(String(process.env.SERVER_API_URL || "").trim());
const hasBackendProxyTarget = Boolean(String(process.env.BACKEND_PROXY_TARGET || "").trim());
const hasAbsolutePublicApiUrl = isAbsoluteHttpUrl(process.env.NEXT_PUBLIC_API_URL);

if (!hasServerApiUrl && !hasBackendProxyTarget && !hasAbsolutePublicApiUrl) {
  console.error(
    "Missing production SSR API configuration. Set SERVER_API_URL, BACKEND_PROXY_TARGET, or an absolute NEXT_PUBLIC_API_URL before running next build.",
  );
  process.exit(1);
}

if (hasServerApiUrl && !isAbsoluteHttpUrl(process.env.SERVER_API_URL)) {
  console.error("SERVER_API_URL must be an absolute http(s) URL.");
  process.exit(1);
}

if (hasBackendProxyTarget && !isAbsoluteHttpUrl(process.env.BACKEND_PROXY_TARGET)) {
  console.error("BACKEND_PROXY_TARGET must be an absolute http(s) URL.");
  process.exit(1);
}
