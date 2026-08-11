import { jest } from "@jest/globals";

const originalEnv = { ...process.env };

async function loadCorsModule() {
  jest.resetModules();
  return import("../../src/config/cors.js");
}

async function loadPublicFrontendUrlModule() {
  jest.resetModules();
  return import("../../src/utils/publicFrontendUrl.js");
}

async function loadCsrfModule() {
  jest.resetModules();
  return import("../../src/middleware/csrf.js");
}

function createMockResponse() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe("Security and deploy configuration helpers", () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.FRONTEND_URL;
    delete process.env.CORS_ORIGIN;
    delete process.env.CORS_ORIGINS;
    delete process.env.PUBLIC_FRONTEND_URL;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe("cors.js", () => {
    it("normalizes, merges, and deduplicates configured origins", async () => {
      process.env.NODE_ENV = "development";
      process.env.FRONTEND_URL = " https://app.example.com/ , https://shared.example.com/ ";
      process.env.CORS_ORIGIN = "https://shared.example.com, https://admin.example.com/";
      process.env.CORS_ORIGINS = "https://api.example.com/";

      const { allowedOrigins, normalizeOrigin } = await loadCorsModule();

      expect(normalizeOrigin(" https://app.example.com/ ")).toBe("https://app.example.com");
      expect(allowedOrigins).toEqual([
        "https://app.example.com",
        "https://shared.example.com",
        "https://admin.example.com",
        "https://api.example.com",
      ]);
    });

    it("falls back to localhost in test mode when no custom origins are provided", async () => {
      process.env.NODE_ENV = "test";

      const { allowedOrigins } = await loadCorsModule();

      expect(allowedOrigins).toContain("http://localhost:3000");
      expect(allowedOrigins).toHaveLength(1);
    });
  });

  describe("publicFrontendUrl.js", () => {
    it("prefers the explicit public frontend URL when present", async () => {
      process.env.PUBLIC_FRONTEND_URL = "https://public.example.com/";
      process.env.FRONTEND_URL = "https://fallback.example.com";

      const { getPublicFrontendUrl } = await loadPublicFrontendUrlModule();

      expect(getPublicFrontendUrl()).toBe("https://public.example.com");
    });

    it("uses an allowed preferred origin and falls back when the preferred origin is unknown", async () => {
      process.env.FRONTEND_URL = "https://app.example.com";
      process.env.CORS_ORIGINS = "https://admin.example.com";

      const { resolvePublicFrontendUrl } = await loadPublicFrontendUrlModule();

      expect(resolvePublicFrontendUrl("https://admin.example.com/")).toBe("https://admin.example.com");
      expect(resolvePublicFrontendUrl("https://malicious.example.com")).toBe("https://app.example.com");
    });
  });

  describe("csrf.js", () => {
    it("allows safe methods without origin checks", async () => {
      process.env.FRONTEND_URL = "https://app.example.com";
      const { csrfProtection } = await loadCsrfModule();
      const req = { method: "GET", headers: {} };
      const res = createMockResponse();
      const next = jest.fn();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("allows bearer-token API clients to bypass browser CSRF checks", async () => {
      process.env.FRONTEND_URL = "https://app.example.com";
      const { csrfProtection } = await loadCsrfModule();
      const req = {
        method: "POST",
        headers: {
          authorization: "Bearer token-123",
        },
      };
      const res = createMockResponse();
      const next = jest.fn();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("accepts same-origin fetch metadata when origin headers are missing", async () => {
      process.env.FRONTEND_URL = "https://app.example.com";
      const { csrfProtection } = await loadCsrfModule();
      const req = {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
        },
      };
      const res = createMockResponse();
      const next = jest.fn();

      csrfProtection(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("accepts browser mutations from an allowed origin or referer", async () => {
      process.env.FRONTEND_URL = "https://app.example.com";
      process.env.CORS_ORIGINS = "https://admin.example.com";
      const { csrfProtection } = await loadCsrfModule();

      const originReq = {
        method: "POST",
        headers: {
          origin: "https://app.example.com/",
        },
      };
      const refererReq = {
        method: "DELETE",
        headers: {
          referer: "https://admin.example.com/dashboard/bookings",
        },
      };

      const originRes = createMockResponse();
      const refererRes = createMockResponse();
      const originNext = jest.fn();
      const refererNext = jest.fn();

      csrfProtection(originReq, originRes, originNext);
      csrfProtection(refererReq, refererRes, refererNext);

      expect(originNext).toHaveBeenCalledTimes(1);
      expect(refererNext).toHaveBeenCalledTimes(1);
      expect(originRes.status).not.toHaveBeenCalled();
      expect(refererRes.status).not.toHaveBeenCalled();
    });

    it("blocks browser mutations when both origin and referer are missing or invalid", async () => {
      process.env.FRONTEND_URL = "https://app.example.com";
      const { csrfProtection } = await loadCsrfModule();
      const req = {
        method: "PATCH",
        headers: {
          origin: "https://evil.example.com",
          referer: "not-a-valid-url",
        },
      };
      const res = createMockResponse();
      const next = jest.fn();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: "CSRF protection: Invalid or missing Origin/Referer header",
      });
    });

    it("does not let upload-specific headers bypass cookie-based CSRF checks", async () => {
      process.env.FRONTEND_URL = "https://app.example.com";
      const { csrfProtection } = await loadCsrfModule();
      const req = {
        method: "POST",
        headers: {
          "x-upload-request": "1",
        },
      };
      const res = createMockResponse();
      const next = jest.fn();

      csrfProtection(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
