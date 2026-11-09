import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export const COOKIE = "km_session";
const MIN_SECRET = 32;

export function hashPassword(password) {
  const N = 16384;
  const r = 8;
  const p = 1;
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N, r, p });
  return `scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}`;
}

/** env = both secrets already injected. pending = first boot may load or create them in this project's database. */
export function authEnvState() {
  const hash = process.env.EDITOR_PASSWORD_HASH || "";
  const secret = process.env.SESSION_SECRET || "";
  if (secret && secret.length < MIN_SECRET) {
    return { state: "invalid", reason: "SESSION_SECRET สั้นเกินกว่าจะใช้เซ็นคุกกี้" };
  }
  if (hash && !parseHash(hash)) {
    return { state: "invalid", reason: "EDITOR_PASSWORD_HASH ไม่ใช่รูปแบบ scrypt ที่เซิร์ฟเวอร์รองรับ" };
  }
  if (hash && secret) return { state: "env", reason: "" };
  if (hash || secret) {
    return {
      state: "invalid",
      reason: "EDITOR_PASSWORD_HASH กับ SESSION_SECRET ต้องตั้งคู่กัน ถ้าไม่ใช้คู่นี้ ให้เว้นทั้งคู่แล้วตั้ง BOOTSTRAP_PASSWORD ครั้งแรก",
    };
  }
  return { state: "pending", reason: "" };
}

export function storedSecretsStatus(hash, secret) {
  if (!hash || !secret) {
    return { ok: false, reason: "ค่าเข้าสู่ระบบในฐานไม่ครบคู่ และระบบจะไม่เขียนทับเอง" };
  }
  if (!parseHash(hash) || String(secret).length < MIN_SECRET) {
    return { ok: false, reason: "ค่าเข้าสู่ระบบที่เก็บในฐานของโปรเจกต์นี้ใช้ไม่ได้ และระบบจะไม่เขียนทับเอง" };
  }
  return { ok: true, reason: "" };
}

export function useStoredSecrets(hash, secret) {
  process.env.EDITOR_PASSWORD_HASH = hash;
  process.env.SESSION_SECRET = secret;
  delete process.env.BOOTSTRAP_PASSWORD;
}

export function envStatus() {
  if (!process.env.DATABASE_URL) return { ok: false, reason: "ยังไม่ได้ตั้ง DATABASE_URL" };
  const auth = authEnvState();
  if (auth.state === "invalid") return { ok: false, reason: auth.reason };
  if (auth.state === "env") return { ok: true, reason: "" };
  return {
    ok: false,
    reason: "ตั้ง BOOTSTRAP_PASSWORD อย่างน้อย 10 ตัวสำหรับเปิดครั้งแรก เซิร์ฟเวอร์จะสร้างรหัสแฮชและกุญแจเซสชันเก็บในฐานนี้",
  };
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

function headerValue(req, name) {
  const value = req.headers?.[name];
  if (Array.isArray(value)) return String(value[0] || "");
  return String(value || "");
}

/** Browser URL on this platform is always https://<slug>.opendurian.dev, including over VPN. */
function platformBrowserHttps(req) {
  const host = headerValue(req, "host").trim().toLowerCase().replace(/:\d+$/, "");
  if (host.endsWith(".opendurian.dev") && host !== "opendurian.dev") return true;
  return clientIp(req) !== "unknown";
}

export function requestIsHttps(req) {
  if (req.socket && req.socket.encrypted) return true;
  if (process.env.TRUST_PROXY === "1") {
    const proto = headerValue(req, "x-forwarded-proto").split(",")[0].trim().toLowerCase();
    if (proto === "https") return true;
  }
  return platformBrowserHttps(req);
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
  const raw = headerValue(req, "cf-connecting-ip").trim();
  if (!raw || raw.length > 64 || !/^[0-9a-fA-F:.]+$/.test(raw)) return "unknown";
  return raw;
}

export function safeError(error) {
  return String(error && error.message ? error.message : error).replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://…");
}
