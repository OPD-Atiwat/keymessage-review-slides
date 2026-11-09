import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { parseAnalysisItemId, REPORT_PERIODS } from "../shared/analysis.js";
import { DECK_ID, MAX_NOTE, NOTE_IDS, mapImportedNotes } from "../shared/slides.js";
import {
  COOKIE,
  authEnvState,
  clientIp,
  cookieFlags,
  envStatus,
  hashPassword,
  newSession,
  rateLimit,
  readCookies,
  readSession,
  safeError,
  sameOrigin,
  storedSecretsStatus,
  useStoredSecrets,
  verifyPassword,
} from "./security.js";

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const SHARED_DIR = path.join(ROOT, "shared");
const PORT = Number(process.env.PORT || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
};

let pool = null;
let dbReady = false;
let dbReason = "";

function notesConfig() {
  const env = envStatus();
  if (!env.ok) return { configured: false, reason: env.reason };
  if (!dbReady) return { configured: false, reason: dbReason || "เชื่อมต่อฐานข้อมูลบันทึกไม่ได้" };
  return { configured: true, reason: "" };
}

async function ensureRuntimeAuth(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS app_runtime (
    key text PRIMARY KEY,
    value text NOT NULL
  )`);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("LOCK TABLE app_runtime IN EXCLUSIVE MODE");
    const existing = await client.query(
      "SELECT key, value FROM app_runtime WHERE key = ANY($1::text[])",
      [["password_hash", "session_secret"]]
    );
    const stored = Object.fromEntries(existing.rows.map((row) => [row.key, row.value]));
    let hash = stored.password_hash || "";
    let secret = stored.session_secret || "";
    if (!hash && !secret) {
      const password = process.env.BOOTSTRAP_PASSWORD || "";
      if (password.length < 10) {
        await client.query("ROLLBACK");
        return {
          ok: false,
          reason: password
            ? "BOOTSTRAP_PASSWORD สั้นเกิน (อย่างน้อย 10 ตัว)"
            : "ตั้ง BOOTSTRAP_PASSWORD อย่างน้อย 10 ตัวสำหรับเปิดครั้งแรก เซิร์ฟเวอร์จะสร้างรหัสแฮชและกุญแจเซสชันเก็บในฐานนี้",
        };
      }
      hash = hashPassword(password);
      secret = randomBytes(32).toString("hex");
      await client.query(
        "INSERT INTO app_runtime (key, value) VALUES ('password_hash', $1), ('session_secret', $2)",
        [hash, secret]
      );
    }
    const check = storedSecretsStatus(hash, secret);
    if (!check.ok) {
      await client.query("ROLLBACK");
      return check;
    }
    await client.query("COMMIT");
    useStoredSecrets(hash, secret);
    return { ok: true, reason: "" };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function initDb() {
  if (!process.env.DATABASE_URL) {
    dbReady = false;
    dbReason = envStatus().reason;
    return;
  }
  const auth = authEnvState();
  if (auth.state === "invalid") {
    dbReady = false;
    dbReason = auth.reason;
    return;
  }
  const next = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  try {
    await next.query("SELECT 1");
    await next.query(`CREATE TABLE IF NOT EXISTS notes (
      slide_id text PRIMARY KEY,
      body text NOT NULL,
      revision integer NOT NULL,
      updated_at timestamptz NOT NULL
    )`);
    await next.query(`CREATE TABLE IF NOT EXISTS note_revisions (
      slide_id text NOT NULL,
      revision integer NOT NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (slide_id, revision)
    )`);
    await next.query(`CREATE TABLE IF NOT EXISTS analysis_picks (
      item_id text PRIMARY KEY,
      ad_id text NOT NULL,
      report_period text NOT NULL,
      book text NOT NULL,
      content_month text NOT NULL,
      content_month_label text NOT NULL,
      note text NOT NULL,
      revision integer NOT NULL,
      updated_at timestamptz NOT NULL
    )`);
    await next.query(`CREATE TABLE IF NOT EXISTS analysis_revisions (
      item_id text NOT NULL,
      revision integer NOT NULL,
      body text NOT NULL,
      created_at timestamptz NOT NULL,
      PRIMARY KEY (item_id, revision)
    )`);
    if (auth.state === "pending") {
      const ready = await ensureRuntimeAuth(next);
      if (!ready.ok) {
        dbReady = false;
        dbReason = ready.reason;
        await next.end().catch(() => {});
        return;
      }
    }
    pool = next;
    dbReady = true;
    dbReason = "";
  } catch (error) {
    dbReady = false;
    dbReason = "เชื่อมต่อฐานข้อมูลบันทึกไม่ได้";
    console.error("notes-db", safeError(error));
    await next.end().catch(() => {});
  }
}

function send(res, status, body, extraHeaders = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const type = typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8";
  res.writeHead(status, {
    "content-type": extraHeaders["content-type"] || type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "SAMEORIGIN",
    "content-security-policy":
      "default-src 'self'; img-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    ...extraHeaders,
  });
  res.end(payload);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  readFile(filePath)
    .then((buf) => {
      res.writeHead(200, {
        "content-type": MIME[ext] || "application/octet-stream",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "x-frame-options": "SAMEORIGIN",
        "content-security-policy":
          "default-src 'self'; img-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
        "cache-control": "no-store",
      });
      res.end(buf);
    })
    .catch(() => send(res, 404, { error: "ไม่พบไฟล์" }));
}

function safeFile(root, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  if (decoded.includes("\0")) return null;
  const full = path.resolve(root, "." + decoded);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 300000) {
      const error = new Error("payload");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("json");
    error.status = 400;
    throw error;
  }
}

function sessionFrom(req) {
  const cookies = readCookies(req.headers.cookie);
  return readSession(cookies[COOKIE]);
}

function requireNotes(res) {
  const config = notesConfig();
  if (!config.configured) {
    send(res, 503, { error: config.reason, saved: false });
    return null;
  }
  return config;
}

function requireEditor(req, res) {
  if (!requireNotes(res)) return null;
  const session = sessionFrom(req);
  if (!session) {
    send(res, 401, { error: "ต้องเข้าสู่ระบบก่อนดูหรือแก้บันทึก", saved: false });
    return null;
  }
  return session;
}

function validText(text) {
  return typeof text === "string" && text.length <= MAX_NOTE && !text.includes("\u0000");
}

async function listNotes() {
  const result = await pool.query(
    "SELECT slide_id, body, revision, updated_at FROM notes WHERE slide_id = ANY($1::text[])",
    [NOTE_IDS]
  );
  const notes = {};
  for (const row of result.rows) {
    notes[row.slide_id] = {
      text: row.body,
      revision: row.revision,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }
  return notes;
}

async function writeNote(slideId, text, baseRevision) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT body, revision, updated_at FROM notes WHERE slide_id = $1 FOR UPDATE",
      [slideId]
    );
    const row = current.rows[0];
    const revision = row ? row.revision : 0;
    if (revision !== baseRevision) {
      await client.query("ROLLBACK");
      return {
        conflict: true,
        note: row
          ? { text: row.body, revision: row.revision, updatedAt: new Date(row.updated_at).toISOString() }
          : { text: "", revision: 0, updatedAt: null },
      };
    }
    if (row && row.body === text) {
      await client.query("COMMIT");
      return {
        note: { text, revision, updatedAt: new Date(row.updated_at).toISOString() },
      };
    }
    const next = revision + 1;
    const updated = await client.query(
      `INSERT INTO notes (slide_id, body, revision, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (slide_id) DO UPDATE SET body = EXCLUDED.body, revision = EXCLUDED.revision, updated_at = now()
       RETURNING updated_at`,
      [slideId, text, next]
    );
    await client.query(
      "INSERT INTO note_revisions (slide_id, revision, body, created_at) VALUES ($1, $2, $3, now())",
      [slideId, next, text]
    );
    await client.query("COMMIT");
    return {
      note: { text, revision: next, updatedAt: new Date(updated.rows[0].updated_at).toISOString() },
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function analysisTarget(pathname) {
  if (!pathname.startsWith("/api/analysis/")) return null;
  const raw = pathname.slice("/api/analysis/".length);
  if (!raw || raw === "select") return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return parseAnalysisItemId(decoded) ? decoded : null;
}

let adCatalogCache = null;

function adCatalog() {
  if (adCatalogCache) return adCatalogCache;
  const deck = JSON.parse(readFileSync(path.join(PUBLIC_DIR, "data/deck.json"), "utf8"));
  const status = JSON.parse(readFileSync(path.join(PUBLIC_DIR, "data/ad-status.json"), "utf8"));
  adCatalogCache = { ads: deck.ads || [], byId: status.ads_by_id || {} };
  return adCatalogCache;
}

function mapAnalysis(row) {
  return {
    itemId: row.item_id,
    adId: row.ad_id,
    reportPeriod: row.report_period,
    book: row.book,
    contentMonth: row.content_month,
    contentMonthLabel: row.content_month_label,
    text: row.note,
    revision: row.revision,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

async function listAnalysis() {
  const result = await pool.query(
    `SELECT item_id, ad_id, report_period, book, content_month, content_month_label, note, revision, updated_at
     FROM analysis_picks ORDER BY updated_at DESC`
  );
  const items = {};
  for (const row of result.rows) items[row.item_id] = mapAnalysis(row);
  return items;
}

async function selectAnalysis(adId, reportPeriod) {
  if (!REPORT_PERIODS.includes(reportPeriod) || !/^\d+$/.test(String(adId || ""))) {
    return { status: 400, error: "ไม่รู้จักแอดหรือช่วงผลลัพธ์" };
  }
  const catalog = adCatalog();
  const ad = catalog.ads.find((item) => item.adId === adId && item.period === reportPeriod);
  if (!ad) return { status: 400, error: "ไม่พบแอดในช่วงผลลัพธ์นี้" };
  const record = catalog.byId[adId];
  const itemId = `${reportPeriod}:${adId}`;
  const contentMonth = record?.content_month || "unknown";
  const contentMonthLabel = record?.content_month_label || "ไม่ระบุเดือน Content";
  const existing = await pool.query(
    `SELECT item_id, ad_id, report_period, book, content_month, content_month_label, note, revision, updated_at
     FROM analysis_picks WHERE item_id = $1`,
    [itemId]
  );
  if (existing.rows[0]) return { status: 200, item: mapAnalysis(existing.rows[0]) };
  const inserted = await pool.query(
    `INSERT INTO analysis_picks
      (item_id, ad_id, report_period, book, content_month, content_month_label, note, revision, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, '', 0, now())
     ON CONFLICT (item_id) DO NOTHING
     RETURNING item_id, ad_id, report_period, book, content_month, content_month_label, note, revision, updated_at`,
    [itemId, adId, reportPeriod, ad.book, contentMonth, contentMonthLabel]
  );
  if (inserted.rows[0]) return { status: 200, item: mapAnalysis(inserted.rows[0]) };
  const again = await pool.query(
    `SELECT item_id, ad_id, report_period, book, content_month, content_month_label, note, revision, updated_at
     FROM analysis_picks WHERE item_id = $1`,
    [itemId]
  );
  return { status: 200, item: mapAnalysis(again.rows[0]) };
}

async function writeAnalysis(itemId, text, baseRevision) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query(
      `SELECT item_id, ad_id, report_period, book, content_month, content_month_label, note, revision, updated_at
       FROM analysis_picks WHERE item_id = $1 FOR UPDATE`,
      [itemId]
    );
    const row = current.rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return { missing: true };
    }
    if (row.revision !== baseRevision) {
      await client.query("ROLLBACK");
      return { conflict: true, item: mapAnalysis(row) };
    }
    if (row.note === text) {
      await client.query("COMMIT");
      return { item: mapAnalysis(row) };
    }
    const next = row.revision + 1;
    const updated = await client.query(
      `UPDATE analysis_picks SET note = $2, revision = $3, updated_at = now()
       WHERE item_id = $1
       RETURNING item_id, ad_id, report_period, book, content_month, content_month_label, note, revision, updated_at`,
      [itemId, text, next]
    );
    await client.query(
      "INSERT INTO analysis_revisions (item_id, revision, body, created_at) VALUES ($1, $2, $3, now())",
      [itemId, next, text]
    );
    await client.query("COMMIT");
    return { item: mapAnalysis(updated.rows[0]) };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function deleteAnalysis(itemId, confirm) {
  const current = await pool.query(
    `SELECT item_id, ad_id, report_period, book, content_month, content_month_label, note, revision, updated_at
     FROM analysis_picks WHERE item_id = $1`,
    [itemId]
  );
  const row = current.rows[0];
  if (!row) return { missing: true };
  if (String(row.note || "").trim() && confirm !== true) return { needsConfirm: true, item: mapAnalysis(row) };
  await pool.query("DELETE FROM analysis_picks WHERE item_id = $1", [itemId]);
  return { deleted: true };
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/health") {
      const notes = notesConfig();
      return send(res, 200, { ok: true, deck: true, deckId: DECK_ID, notes });
    }

    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url);
    }

    if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, { error: "method" });
    const configured = notesConfig().configured;
    const session = sessionFrom(req);
    const openFile = url.pathname === "/login.html" || url.pathname === "/login.js" || url.pathname === "/config.html" || url.pathname === "/styles.css" || url.pathname.startsWith("/fonts/");
    if (!openFile && !session) {
      if (!configured) {
        if (url.pathname === "/") return sendFile(res, path.join(PUBLIC_DIR, "config.html"));
        return send(res, 503, { error: notesConfig().reason, saved: false });
      }
      if (url.pathname === "/") return sendFile(res, path.join(PUBLIC_DIR, "login.html"));
      return send(res, 401, { error: "ต้องเข้าสู่ระบบก่อนดูข้อมูล", saved: false });
    }
    let filePath = null;
    if (url.pathname.startsWith("/shared/")) {
      filePath = safeFile(SHARED_DIR, url.pathname.slice("/shared".length));
    } else {
      const rel = url.pathname === "/" ? "/index.html" : url.pathname;
      filePath = safeFile(PUBLIC_DIR, rel);
    }
    if (!filePath) return send(res, 400, { error: "path" });
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) return send(res, 404, { error: "ไม่พบไฟล์" });
    if (req.method === "HEAD") {
      res.writeHead(200);
      return res.end();
    }
    return sendFile(res, filePath);
  } catch (error) {
    console.error("request", safeError(error));
    if (res.headersSent) return;
    if (error.status === 413) return send(res, 413, { error: "ข้อมูลใหญ่เกิน", saved: false });
    if (error.status === 400) return send(res, 400, { error: "รูปแบบไม่ถูกต้อง", saved: false });
    send(res, 500, { error: "เซิร์ฟเวอร์ขัดข้อง", saved: false });
  }
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/session") {
    const notes = notesConfig();
    const session = sessionFrom(req);
    return send(res, 200, {
      configured: notes.configured,
      reason: notes.reason,
      authenticated: Boolean(notes.configured && session),
      csrf: notes.configured && session ? session.csrf : "",
    });
  }

  if (req.method === "POST" && url.pathname === "/api/login") {
    if (!sameOrigin(req)) return send(res, 403, { error: "ต้นทางคำขอไม่ถูกต้อง", saved: false });
    const notes = requireNotes(res);
    if (!notes) return;
    if (!rateLimit("login:" + clientIp(req), 8, 15 * 60 * 1000)) {
      return send(res, 429, { error: "ลองเข้าสู่ระบบใหม่ภายหลัง", saved: false });
    }
    const flags = cookieFlags(req);
    if (!flags) {
      return send(res, 503, {
        error: "ต้องใช้ HTTPS เพื่อออกคุกกี้ Secure จึงยังไม่เปิดให้เข้าสู่ระบบ และยังไม่ได้บันทึก",
        saved: false,
      });
    }
    const body = await readBody(req);
    if (!verifyPassword(body.password, process.env.EDITOR_PASSWORD_HASH)) {
      return send(res, 401, { error: "รหัสไม่ถูกต้อง", saved: false });
    }
    const session = newSession();
    return send(res, 200, { ok: true, csrf: session.csrf }, {
      "set-cookie": `${COOKIE}=${session.token}; ${flags}`,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/logout") {
    if (!sameOrigin(req)) return send(res, 403, { error: "ต้นทางคำขอไม่ถูกต้อง" });
    const flags = cookieFlags(req);
    const clear = flags ? flags.replace(/Max-Age=\d+/, "Max-Age=0") : "HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
    return send(res, 200, { ok: true }, { "set-cookie": `${COOKIE}=; ${clear}` });
  }

  if (req.method === "GET" && url.pathname === "/api/analysis") {
    const session = requireEditor(req, res);
    if (!session) return;
    return send(res, 200, { items: await listAnalysis() });
  }

  if (req.method === "POST" && url.pathname === "/api/analysis/select") {
    if (!sameOrigin(req)) return send(res, 403, { error: "ต้นทางคำขอไม่ถูกต้อง", saved: false });
    const session = requireEditor(req, res);
    if (!session) return;
    if (req.headers["x-csrf-token"] !== session.csrf) {
      return send(res, 403, { error: "คำขอแก้บันทึกไม่ผ่านการตรวจ", saved: false });
    }
    const ip = clientIp(req);
    if (!rateLimit("write:" + (ip === "unknown" ? session.csrf : ip), 60, 60 * 1000)) {
      return send(res, 429, { error: "บันทึกถี่เกิน ลองอีกครั้ง", saved: false });
    }
    const body = await readBody(req);
    const result = await selectAnalysis(String(body.adId || ""), String(body.reportPeriod || ""));
    if (result.error) return send(res, result.status, { error: result.error, saved: false });
    return send(res, 200, { saved: true, item: result.item });
  }

  const analysisItemIdFromPath = analysisTarget(url.pathname);
  if (req.method === "PUT" && analysisItemIdFromPath) {
    if (!sameOrigin(req)) return send(res, 403, { error: "ต้นทางคำขอไม่ถูกต้อง", saved: false });
    const session = requireEditor(req, res);
    if (!session) return;
    if (req.headers["x-csrf-token"] !== session.csrf) {
      return send(res, 403, { error: "คำขอแก้บันทึกไม่ผ่านการตรวจ", saved: false });
    }
    const body = await readBody(req);
    if (!validText(body.text) || !Number.isInteger(body.baseRevision) || body.baseRevision < 0) {
      return send(res, 400, { error: "ข้อความบันทึกไม่ผ่านเงื่อนไข", saved: false });
    }
    const result = await writeAnalysis(analysisItemIdFromPath, body.text, body.baseRevision);
    if (result.missing) return send(res, 404, { error: "ยังไม่ได้เลือกรายการนี้", saved: false });
    if (result.conflict) return send(res, 409, { error: "มีฉบับใหม่กว่า", saved: false, item: result.item });
    return send(res, 200, { saved: true, item: result.item });
  }

  if (req.method === "DELETE" && analysisItemIdFromPath) {
    if (!sameOrigin(req)) return send(res, 403, { error: "ต้นทางคำขอไม่ถูกต้อง", saved: false });
    const session = requireEditor(req, res);
    if (!session) return;
    if (req.headers["x-csrf-token"] !== session.csrf) {
      return send(res, 403, { error: "คำขอแก้บันทึกไม่ผ่านการตรวจ", saved: false });
    }
    const body = await readBody(req);
    const result = await deleteAnalysis(analysisItemIdFromPath, body.confirm);
    if (result.missing) return send(res, 404, { error: "ไม่พบรายการ", saved: false });
    if (result.needsConfirm) return send(res, 409, { error: "รายการนี้มีบันทึก ยืนยันก่อนเอาออก", saved: false, needsConfirm: true, item: result.item });
    return send(res, 200, { saved: true, deleted: true });
  }

  if (req.method === "GET" && url.pathname === "/api/notes") {
    const session = requireEditor(req, res);
    if (!session) return;
    const notes = await listNotes();
    return send(res, 200, { deckId: DECK_ID, schemaVersion: 2, notes });
  }

  if (req.method === "GET" && url.pathname === "/api/notes/export") {
    const session = requireEditor(req, res);
    if (!session) return;
    const notes = await listNotes();
    return send(res, 200, { schemaVersion: 2, deckId: DECK_ID, notes }, {
      "content-disposition": 'attachment; filename="keymessage-notes.json"',
    });
  }

  const put = url.pathname.match(/^\/api\/notes\/([a-z0-9-]+)$/);
  if (req.method === "PUT" && put) {
    if (!sameOrigin(req)) return send(res, 403, { error: "ต้นทางคำขอไม่ถูกต้อง", saved: false });
    const session = requireEditor(req, res);
    if (!session) return;
    const ip = clientIp(req);
    if (!rateLimit("write:" + (ip === "unknown" ? session.csrf : ip), 60, 60 * 1000)) {
      return send(res, 429, { error: "บันทึกถี่เกิน ลองอีกครั้ง", saved: false });
    }
    const slideId = put[1];
    if (!NOTE_IDS.includes(slideId)) return send(res, 400, { error: "ไม่รู้จักสไลด์", saved: false });
    if (req.headers["x-csrf-token"] !== session.csrf) {
      return send(res, 403, { error: "คำขอแก้บันทึกไม่ผ่านการตรวจ", saved: false });
    }
    const body = await readBody(req);
    if (!validText(body.text) || !Number.isInteger(body.baseRevision) || body.baseRevision < 0) {
      return send(res, 400, { error: "ข้อความบันทึกไม่ผ่านเงื่อนไข", saved: false });
    }
    const result = await writeNote(slideId, body.text, body.baseRevision);
    if (result.conflict) return send(res, 409, { error: "มีฉบับใหม่กว่า", saved: false, note: result.note });
    return send(res, 200, { saved: true, note: result.note });
  }

  if (req.method === "POST" && url.pathname === "/api/notes/import") {
    if (!sameOrigin(req)) return send(res, 403, { error: "ต้นทางคำขอไม่ถูกต้อง", saved: false });
    const session = requireEditor(req, res);
    if (!session) return;
    if (req.headers["x-csrf-token"] !== session.csrf) {
      return send(res, 403, { error: "คำขอแก้บันทึกไม่ผ่านการตรวจ", saved: false });
    }
    const body = await readBody(req);
    if (body.confirm !== true) {
      return send(res, 400, { error: "การนำเข้าต้องยืนยันจากปุ่มบนสไลด์", saved: false });
    }
    let mapped;
    try {
      mapped = mapImportedNotes(body.document);
    } catch (error) {
      return send(res, 400, { error: error.message || "ไฟล์ไม่ผ่านเงื่อนไข", saved: false });
    }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [slideId, note] of Object.entries(mapped)) {
        const current = await client.query("SELECT revision FROM notes WHERE slide_id = $1 FOR UPDATE", [slideId]);
        const next = (current.rows[0]?.revision || 0) + 1;
        await client.query(
          `INSERT INTO notes (slide_id, body, revision, updated_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (slide_id) DO UPDATE SET body = EXCLUDED.body, revision = EXCLUDED.revision, updated_at = now()`,
          [slideId, note.text, next]
        );
        await client.query(
          "INSERT INTO note_revisions (slide_id, revision, body, created_at) VALUES ($1, $2, $3, now())",
          [slideId, next, note.text]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
    return send(res, 200, { saved: true, notes: await listNotes() });
  }

  return send(res, 404, { error: "ไม่พบทางนี้" });
}

await initDb();
server.listen(PORT, "0.0.0.0", () => {
  const notes = notesConfig();
  console.log(`listening ${PORT} notes=${notes.configured ? "on" : "off"}`);
});
