import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE = "km_session";
const MIN_SECRET = 32;

export function envStatus() {
  const missing = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!process.env.EDITOR_PASSWORD_HASH) missing.push("EDITOR_PASSWORD_HASH");
  if (!process.env.SESSION_SECRET) missing.push("SESSION_SECRET");
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < MIN_SECRET) {
    return { ok: false, reason: "SESSION_SECRET สั้นเกินกว่าจะใช้เซ็นคุกกี้" };
  }
  if (process.env.EDITOR_PASSWORD_HASH && !parseHash(process.env.EDITOR_PASSWORD_HASH)) {
    return { ok: false, reason: "EDITOR_PASSWORD_HASH ไม่ใช่รูปแบบ scrypt ที่เซิร์ฟเวอร์รองรับ" };
  }
  if (missing.length) {
    return { ok: false, reason: "ยังไม่ได้ตั้ง " + missing.join(", ") };
  }
  return { ok: true, reason: "" };
}

export function parseHash(stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || N < 16384 || N > 262144) return null;
  if (!Number.isInteger(r) || r < 1 || r > 32) return null;
  if (!Number.isInteger(p) || p < 1 || p > 8) return null;
  if (!/^[0-9a-f]+$/i.test(parts[4]) || !/^[0-9a-f]+$/i.test(parts[5])) return null;
  const salt = Buffer.from(parts[4], "hex");
  const key = Buffer.from(parts[5], "hex");
  if (!salt.length || !key.length) return null;
  return { N, r, p, salt, key };
}

export function verifyPassword(password, stored) {
  const parsed = parseHash(stored);
  if (!parsed || typeof password !== "string" || !password) return false;
  const actual = scryptSync(password, parsed.salt, parsed.key.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
  });
  if (actual.length !== parsed.key.length) return false;
  return timingSafeEqual(actual, parsed.key);
}

export function requestIsHttps(req) {
  if (req.socket && req.socket.encrypted) return true;
  if (process.env.TRUST_PROXY === "1") {
    const proto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
    return proto === "https";
  }
  return false;
}

/** Secure cookies on HTTPS. Local HTTP only when explicitly allowed outside production. */
export function cookieFlags(req) {
  const base = "HttpOnly; SameSite=Lax; Path=/; Max-Age=43200";
  if (requestIsHttps(req)) return `Secure; ${base}`;
  if (process.env.ALLOW_INSECURE_COOKIES === "1" && process.env.NODE_ENV !== "production") {
    return base;
  }
  return null;
}

export function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readSession(token) {
  if (!token || !process.env.SESSION_SECRET) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || payload.v !== 1 || typeof payload.csrf !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function newSession() {
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const csrf = randomBytes(24).toString("base64url");
  return { token: signSession({ v: 1, exp, csrf }), csrf, exp };
}

export function readCookies(header) {
  const out = {};
  for (const part of String(header || "").split(";")) {
    const i = part.indexOf("=");
    if (i <= 0) continue;
    const key = part.slice(0, i).trim();
    try {
      out[key] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      out[key] = "";
    }
  }
  return out;
}

export function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = String(req.headers.host || "").trim().toLowerCase();
  return url.host.toLowerCase() === host;
}

const buckets = new Map();

export function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}

export function clientIp(req) {
  if (process.env.TRUST_PROXY === "1") {
    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket?.remoteAddress || "unknown";
}

export function safeError(error) {
  return String(error && error.message ? error.message : error).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://…");
}
