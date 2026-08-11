export function parseCookieHeader(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;

  const headerStrings = Array.isArray(cookieHeader) ? cookieHeader : [String(cookieHeader)];

  headerStrings.forEach((headerString) => {
    headerString.split(";").forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;

      const index = trimmed.indexOf("=");
      if (index === -1) return;

      const key = trimmed.substring(0, index).trim();
      let val = trimmed.substring(index + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!out[key]) out[key] = val;
    });
  });

  return out;
}
