import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { previewFor, previewState } from "../shared/previews.js";

function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}

const root = fileURLToPath(new URL("../public/data/previews/", import.meta.url));
const manifest = JSON.parse(readFileSync(new URL("../public/data/previews/manifest.json", import.meta.url), "utf8"));
const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));

function sha(file) {
  return createHash("sha256").update(readFileSync(new URL(`../public/data/previews/${file}`, import.meta.url))).digest("hex");
}

test("validated previews keep exact files, labels, and the performance checksum", () => {
  assert.equal(manifest.coverage, "partial");
  assert.equal(manifest.newVideoFramesExtracted, 0);
  assert.equal(manifest.videoFilesAvailable, false);
  assert.equal(manifest.videoRouteRetested, false);
  assert.equal(manifest.counts.usable, 72);
  assert.equal(manifest.counts.videoCovers, 11);
  assert.equal(manifest.counts.adImages, 61);
  assert.equal(manifest.counts.novemberIds, 130);
  assert.equal(manifest.counts.novemberUsable, 15);
  assert.equal(manifest.counts.novemberCovers, 3);
  assert.equal(manifest.counts.novemberAdImages, 12);
  assert.equal(manifest.counts.novemberMissing, 115);
  assert.equal(manifest.counts.rejectedLogoOrProfile, 646);
  const ready = Object.entries(manifest.ads).filter(([, item]) => item.coverage === "ready");
  assert.equal(ready.length, 72);
  const files = readdirSync(root).filter((name) => name.endsWith(".webp")).sort();
  assert.deepEqual(files, ready.map(([, item]) => item.file).sort());
  const nov = { Mind: 0, Coworkers: 0, SurvivalGuide: 0, Trap: 0 };
  for (const [adId, item] of ready) {
    assert.equal(sha(item.file), item.sha256);
    assert.equal(item.objectFit, "contain");
    assert.equal(item.frameExtracted, false);
    const state = previewState(manifest, adId);
    assert.equal(state.state, "ready");
    assert.equal(state.label, item.kind === "video_cover" ? "ปกวิดีโอ" : "ภาพแอดจริง");
    assert.equal(state.label.includes("เฟรม"), false);
    if (item.november) nov[deck.ads.find((ad) => ad.adId === adId && ad.period === "nov1_7").book] += 1;
  }
  assert.deepEqual(nov, { Mind: 1, Coworkers: 3, SurvivalGuide: 1, Trap: 10 });
  const missingId = Object.keys(manifest.ads).find((id) => manifest.ads[id].november && manifest.ads[id].coverage !== "ready");
  assert.equal(Object.values(manifest.ads).filter((item) => item.november && item.coverage !== "ready").length, 115);
  assert.equal(previewFor(manifest, missingId), null);
  assert.equal(previewFor({ ads: { 1: { coverage: "ready", kind: "ad_image", file: "../secret.webp" } } }, "1"), null);
  assert.equal(previewState(manifest, "no-such").label, "ยังไม่มีภาพเนื้อหาจากวิดีโอที่ยืนยันได้");
  const raw = readFileSync(new URL("../public/data/previews/manifest.json", import.meta.url), "utf8");
  assert.equal(/https?:\/\/|access_token|thumbnail_url|signed/i.test(raw), false);
  const canon = createHash("sha256").update(JSON.stringify(deck.bookTotals)).digest("hex");
  assert.equal(canon, createHash("sha256").update(JSON.stringify(JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8")).bookTotals)).digest("hex"));
});

test("preview files stay behind the session", async () => {
  execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", "DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ubuntu') THEN CREATE ROLE ubuntu LOGIN SUPERUSER; END IF; END $$;"], { stdio: "pipe" });
  execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", "DROP DATABASE IF EXISTS kmnotes_preview"], { stdio: "pipe" });
  execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE kmnotes_preview OWNER ubuntu"], { stdio: "pipe" });
  const file = Object.values(manifest.ads).find((item) => item.coverage === "ready").file;
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: {
      ...process.env,
      PORT: "18083",
      DATABASE_URL: "postgres://ubuntu@/kmnotes_preview?host=/var/run/postgresql",
      EDITOR_PASSWORD_HASH: hashPassword("preview-gate-password"),
      SESSION_SECRET: randomBytes(32).toString("hex"),
      ALLOW_INSECURE_COOKIES: "1",
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    for (let i = 0; i < 40; i += 1) {
      try {
        const health = await fetch("http://127.0.0.1:18083/api/health");
        if (health.ok || health.status === 401 || health.status === 503) break;
      } catch { /* retry */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const hidden = await fetch(`http://127.0.0.1:18083/data/previews/${file}`);
    assert.equal(hidden.status, 401);
    const escape = await fetch("http://127.0.0.1:18083/data/previews/..%2F..%2Fserver%2Findex.js");
    assert.notEqual(escape.status, 200);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
});
