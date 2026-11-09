import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { clientIp, cookieFlags } from "../server/security.js";

function psql(sql) {
  execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
}

function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

function start(port, extra = {}) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: String(port), ...extra },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (chunk) => { log += chunk; });
  child.stderr.on("data", (chunk) => { log += chunk; });
  return { child, readLog: () => log };
}

async function stop(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

async function health(port) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return response.json();
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
}

function cookiePair(response) {
  const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""];
  const line = lines.find((item) => item && item.startsWith("km_session="));
  if (!line) return { token: "", flags: "" };
  const [pair, ...flags] = line.split(";");
  return { token: pair.slice("km_session=".length), flags: flags.join(";") };
}

test("cookie policy stays Secure on HTTPS and refuses plain production HTTP", () => {
  const https = cookieFlags({ headers: { "x-forwarded-proto": "https" }, socket: {} });
  process.env.TRUST_PROXY = "1";
  const proxied = cookieFlags({ headers: { "x-forwarded-proto": "https" }, socket: {} });
  assert.match(proxied, /Secure/);
  assert.match(proxied, /HttpOnly/);
  assert.match(proxied, /SameSite=Lax/);
  delete process.env.TRUST_PROXY;
  assert.equal(https, null);
  assert.equal(cookieFlags({ headers: { "x-forwarded-for": "203.0.113.4", "x-forwarded-proto": "https" }, socket: { remoteAddress: "10.0.0.1" } }), null);
  assert.match(cookieFlags({ headers: { host: "creator-review-slides.opendurian.dev" }, socket: {} }), /Secure/);
  assert.match(cookieFlags({ headers: { "cf-connecting-ip": "203.0.113.9" }, socket: {} }), /Secure/);
  assert.equal(clientIp({ headers: { "x-forwarded-for": "1.2.3.4", "x-real-ip": "5.6.7.8" }, socket: { remoteAddress: "9.9.9.9" } }), "unknown");
  assert.equal(clientIp({ headers: { "cf-connecting-ip": "203.0.113.9" } }), "203.0.113.9");
  const previous = process.env.NODE_ENV;
  const allow = process.env.ALLOW_INSECURE_COOKIES;
  process.env.NODE_ENV = "production";
  process.env.ALLOW_INSECURE_COOKIES = "1";
  assert.equal(cookieFlags({ headers: {}, socket: {} }), null);
  assert.match(cookieFlags({ headers: { host: "creator-review-slides.opendurian.dev" }, socket: {} }), /Secure/);
  process.env.NODE_ENV = "test";
  const local = cookieFlags({ headers: {}, socket: {} });
  assert.match(local, /HttpOnly/);
  assert.doesNotMatch(local, /Secure/);
  process.env.NODE_ENV = previous;
  if (allow == null) delete process.env.ALLOW_INSECURE_COOKIES;
  else process.env.ALLOW_INSECURE_COOKIES = allow;
});

test("notes persist across a new session and a server restart", async () => {
  psql("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ubuntu') THEN CREATE ROLE ubuntu LOGIN SUPERUSER; END IF; END $$;");
  psql("DROP DATABASE IF EXISTS kmnotes_test");
  psql("CREATE DATABASE kmnotes_test OWNER ubuntu");
  const port = 18081;
  const password = randomBytes(18).toString("hex");
  const secret = randomBytes(32).toString("hex");
  const env = {
    DATABASE_URL: "postgres://ubuntu@/kmnotes_test?host=/var/run/postgresql",
    EDITOR_PASSWORD_HASH: hashPassword(password),
    SESSION_SECRET: secret,
    ALLOW_INSECURE_COOKIES: "1",
    NODE_ENV: "test",
  };
  const marker = "บันทึกข้ามเครื่อง-" + randomBytes(4).toString("hex");
  let server = start(port, env);
  try {
    const ready = await health(port);
    assert.equal(ready.notes.configured, true);
    const origin = `http://127.0.0.1:${port}`;
    const anon = await fetch(origin + "/api/notes");
    assert.equal(anon.status, 401);
    const denied = await anon.json();
    assert.equal(JSON.stringify(denied).includes(marker), false);
    const login = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const first = cookiePair(login);
    assert.match(first.flags, /HttpOnly/i);
    assert.match(first.flags, /SameSite=Lax/i);
    const csrf = (await login.json()).csrf;
    const saved = await fetch(origin + "/api/notes/s12-synthesis", {
      method: "PUT",
      headers: { origin, "content-type": "application/json", cookie: `km_session=${first.token}`, "x-csrf-token": csrf },
      body: JSON.stringify({ text: marker, baseRevision: 0 }),
    });
    assert.equal(saved.status, 200);
    const savedBody = await saved.json();
    assert.equal(savedBody.saved, true);
    assert.equal(savedBody.note.revision, 1);

    const conflict = await fetch(origin + "/api/notes/s12-synthesis", {
      method: "PUT",
      headers: { origin, "content-type": "application/json", cookie: `km_session=${first.token}`, "x-csrf-token": csrf },
      body: JSON.stringify({ text: "ชน", baseRevision: 0 }),
    });
    assert.equal(conflict.status, 409);

    const stranger = await fetch(origin + "/api/notes", { headers: { cookie: "km_session=forged" } });
    assert.equal(stranger.status, 401);

    await stop(server.child);
    server = start(port, env);
    await health(port);
    const again = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const second = cookiePair(again);
    const csrf2 = (await again.json()).csrf;
    const read = await fetch(origin + "/api/notes", { headers: { cookie: `km_session=${second.token}` } });
    assert.equal(read.status, 200);
    const notes = await read.json();
    assert.equal(notes.notes["s12-synthesis"].text, marker);

    const imported = await fetch(origin + "/api/notes/import", {
      method: "POST",
      headers: { origin, "content-type": "application/json", cookie: `km_session=${second.token}`, "x-csrf-token": csrf2 },
      body: JSON.stringify({
        confirm: true,
        document: {
          schemaVersion: 1,
          deckId: "od-howto-creator-review-2026-11-09",
          notes: { "s08-coworkers-messages": { text: "โน้ตเก่าออฟฟิศ", updatedAt: null } },
        },
      }),
    });
    assert.equal(imported.status, 200);
    const after = await imported.json();
    assert.match(after.notes["s06-coworkers"].text, /โน้ตเก่าออฟฟิศ/);
  } finally {
    await stop(server.child);
  }
});

test("anonymous visitors get the login gate, and the first bootstrap password is stored hashed", async () => {
  psql("DROP DATABASE IF EXISTS kmnotes_boot");
  psql("CREATE DATABASE kmnotes_boot OWNER ubuntu");
  const port = 18083;
  const password = "boot-" + randomBytes(12).toString("hex");
  const origin = `http://127.0.0.1:${port}`;
  const base = {
    DATABASE_URL: "postgres://ubuntu@/kmnotes_boot?host=/var/run/postgresql",
    EDITOR_PASSWORD_HASH: "",
    SESSION_SECRET: "",
    ALLOW_INSECURE_COOKIES: "1",
    NODE_ENV: "test",
    TRUST_PROXY: "",
  };
  let server = start(port, { ...base, BOOTSTRAP_PASSWORD: password });
  try {
    const ready = await health(port);
    assert.equal(ready.notes.configured, true);
    assert.equal(server.readLog().includes(password), false);
    const home = await fetch(origin + "/");
    const html = await home.text();
    assert.equal(home.status, 200);
    assert.match(html, /เข้าสู่ระบบ/);
    assert.equal(html.includes("ข้อความแอดเดือน"), false);
    const deck = await fetch(origin + "/data/deck.json");
    assert.equal(deck.status, 401);
    const login = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(login.status, 200);
    const wrong = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ password: password + "-no" }),
    });
    assert.equal(wrong.status, 401);
  } finally {
    await stop(server.child);
  }

  server = start(port, { ...base, BOOTSTRAP_PASSWORD: "" });
  try {
    await health(port);
    assert.equal(server.readLog().includes(password), false);
    const again = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(again.status, 200);
    const replaced = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ password: "different-password-value" }),
    });
    assert.equal(replaced.status, 401);
  } finally {
    await stop(server.child);
  }

  const bare = start(18084, { ...base, DATABASE_URL: "", BOOTSTRAP_PASSWORD: "" });
  try {
    const healthBody = await health(18084);
    assert.equal(healthBody.notes.configured, false);
    const page = await fetch("http://127.0.0.1:18084/");
    const text = await page.text();
    assert.match(text, /BOOTSTRAP_PASSWORD/);
    assert.match(text, /DATABASE_URL/);
    assert.equal(text.includes("120255364063130260"), false);
  } finally {
    await stop(bare.child);
  }
});

test("selected message keeps its note across a new session and a restart", async () => {
  psql("DROP DATABASE IF EXISTS kmnotes_pick");
  psql("CREATE DATABASE kmnotes_pick OWNER ubuntu");
  const deck = JSON.parse(readFileSync(fileURLToPath(new URL("../public/data/deck.json", import.meta.url)), "utf8"));
  const status = JSON.parse(readFileSync(fileURLToPath(new URL("../public/data/ad-status.json", import.meta.url)), "utf8"));
  const ad = deck.ads.find((item) => item.book === "Coworkers" && item.period === "oct" && !status.ads_by_id[item.adId]?.excluded_from_book_totals);
  const port = 18085;
  const password = randomBytes(18).toString("hex");
  const marker = "วิเคราะห์-" + randomBytes(3).toString("hex");
  const env = {
    DATABASE_URL: "postgres://ubuntu@/kmnotes_pick?host=/var/run/postgresql",
    EDITOR_PASSWORD_HASH: hashPassword(password),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    ALLOW_INSECURE_COOKIES: "1",
    NODE_ENV: "test",
  };
  const origin = `http://127.0.0.1:${port}`;
  async function login() {
    const response = await fetch(origin + "/api/login", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    assert.equal(response.status, 200);
    const csrf = (await response.json()).csrf;
    const token = cookiePair(response).token;
    return { csrf, cookie: `km_session=${token}` };
  }
  let server = start(port, env);
  try {
    await health(port);
    const locked = await fetch(origin + "/api/analysis");
    assert.equal(locked.status, 401);
    const session = await login();
    const selected = await fetch(origin + "/api/analysis/select", {
      method: "POST",
      headers: { origin, "content-type": "application/json", cookie: session.cookie, "x-csrf-token": session.csrf },
      body: JSON.stringify({ adId: ad.adId, reportPeriod: "oct" }),
    });
    assert.equal(selected.status, 200);
    const picked = (await selected.json()).item;
    assert.equal(picked.book, "Coworkers");
    assert.equal(picked.reportPeriod, "oct");
    assert.equal(picked.adId, ad.adId);
    assert.equal(picked.text, "");
    assert.match(picked.contentMonthLabel, /Content/);
    const saved = await fetch(origin + "/api/analysis/" + encodeURIComponent(picked.itemId), {
      method: "PUT",
      headers: { origin, "content-type": "application/json", cookie: session.cookie, "x-csrf-token": session.csrf },
      body: JSON.stringify({ text: marker, baseRevision: picked.revision }),
    });
    assert.equal(saved.status, 200);
    const old = await fetch(origin + "/api/notes/s12-synthesis", {
      method: "PUT",
      headers: { origin, "content-type": "application/json", cookie: session.cookie, "x-csrf-token": session.csrf },
      body: JSON.stringify({ text: "บันทึกเก่าที่ยังอยู่", baseRevision: 0 }),
    });
    assert.equal(old.status, 200);
    const blocked = await fetch(origin + "/api/analysis/" + encodeURIComponent(picked.itemId), {
      method: "DELETE",
      headers: { origin, "content-type": "application/json", cookie: session.cookie, "x-csrf-token": session.csrf },
      body: JSON.stringify({ confirm: false }),
    });
    assert.equal(blocked.status, 409);
  } finally {
    await stop(server.child);
  }

  server = start(port, env);
  try {
    await health(port);
    const session = await login();
    const read = await fetch(origin + "/api/analysis", { headers: { cookie: session.cookie } });
    const items = (await read.json()).items;
    const item = Object.values(items).find((row) => row.adId === ad.adId);
    assert.equal(item.text, marker);
    assert.equal(item.reportPeriod, "oct");
    const legacy = await fetch(origin + "/api/notes", { headers: { cookie: session.cookie } });
    assert.equal((await legacy.json()).notes["s12-synthesis"].text, "บันทึกเก่าที่ยังอยู่");
    const removed = await fetch(origin + "/api/analysis/" + encodeURIComponent(item.itemId), {
      method: "DELETE",
      headers: { origin, "content-type": "application/json", cookie: session.cookie, "x-csrf-token": session.csrf },
      body: JSON.stringify({ confirm: true }),
    });
    assert.equal(removed.status, 200);
    const after = await fetch(origin + "/api/analysis", { headers: { cookie: session.cookie } });
    assert.equal(Object.keys((await after.json()).items).length, 0);
    const restored = await fetch(origin + "/api/analysis/select", {
      method: "POST",
      headers: { origin, "content-type": "application/json", cookie: session.cookie, "x-csrf-token": session.csrf },
      body: JSON.stringify({ adId: ad.adId, reportPeriod: "oct" }),
    });
    assert.equal(restored.status, 200);
    assert.equal((await restored.json()).item.text, marker);
    const still = await fetch(origin + "/api/notes", { headers: { cookie: session.cookie } });
    assert.equal((await still.json()).notes["s12-synthesis"].text, "บันทึกเก่าที่ยังอยู่");
  } finally {
    await stop(server.child);
  }
});
