import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import puppeteer from "puppeteer-core";

function psql(sql) {
  execFileSync("sudo", ["-u", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
}
function hashPassword(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
function start(port, env) {
  const child = spawn(process.execPath, ["server/index.js"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});
  return child;
}
async function stop(child) {
  if (!child || child.killed) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}
async function waitUp(port) {
  for (let i = 0; i < 40; i += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return;
    } catch { /* retry */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("ui server did not start");
}

async function fit(page) {
  return page.evaluate(() => {
    const stage = document.querySelector("#stage").getBoundingClientRect();
    const toolbar = document.querySelector("#toolbar").getBoundingClientRect();
    const notes = document.querySelector(".slide.active .slide-notes").getBoundingClientRect();
    const content = document.querySelector(".slide.active .content").getBoundingClientRect();
    return {
      stageBottom: stage.bottom,
      toolbarTop: toolbar.top,
      notesBottom: notes.bottom,
      notesTop: notes.top,
      contentBottom: content.bottom,
      notesHeight: notes.height,
      slideText: document.querySelector(".slide.active h1").textContent,
      notesText: document.querySelector(".slide.active .slide-notes").innerText,
    };
  });
}

test("slides, inline notes, and ad controls at both viewports", async () => {
  psql("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ubuntu') THEN CREATE ROLE ubuntu LOGIN SUPERUSER; END IF; END $$;");
  psql("DROP DATABASE IF EXISTS kmnotes_ui");
  psql("CREATE DATABASE kmnotes_ui OWNER ubuntu");
  const port = 18082;
  const password = randomBytes(18).toString("hex");
  const marker = "โน้ตบนสไลด์-" + randomBytes(3).toString("hex");
  const child = start(port, {
    DATABASE_URL: "postgres://ubuntu@/kmnotes_ui?host=/var/run/postgresql",
    EDITOR_PASSWORD_HASH: hashPassword(password),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    ALLOW_INSECURE_COOKIES: "1",
    NODE_ENV: "test",
  });
  mkdirSync("/workspace/docs/progress", { recursive: true });
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  try {
    await waitUp(port);
    const origin = `http://127.0.0.1:${port}/`;
    const bare = await browser.newPage();
    await bare.setRequestInterception(true);
    bare.on("request", (request) => {
      if (request.url().includes("/app.js")) request.abort();
      else request.continue();
    });
    await bare.setViewport({ width: 1024, height: 554 });
    await bare.goto(origin, { waitUntil: "domcontentloaded" });
    const fallback = await bare.$eval("#s01-axis", (node) => getComputedStyle(node).display);
    assert.equal(fallback, "flex");
    assert.match(await bare.$eval("#s01-axis h1", (node) => node.textContent), /ข้อความแอด/);
    await bare.close();

    const page = await browser.newPage();
    await page.setViewport({ width: 1024, height: 554 });
    await page.goto(origin, { waitUntil: "networkidle0" });
    await page.waitForSelector("#deck[data-hydrated='1']");
    await page.click("[data-view='present']");
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(new URL(page.url()).search, "");
    let box = await fit(page);
    assert.ok(box.stageBottom <= box.toolbarTop + 1, "toolbar covers the 1024 stage");
    assert.ok(box.notesBottom <= box.toolbarTop + 1);
    assert.ok(box.notesHeight > 40);
    assert.match(box.notesText, /เข้าสู่ระบบเพื่อดูและแก้บันทึก/);
    assert.equal(box.notesText.includes(marker), false);
    await page.screenshot({ path: "/workspace/docs/progress/slide1-1024.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/slide1-1024.png" });

    await page.setViewport({ width: 1366, height: 768 });
    box = await fit(page);
    assert.ok(box.stageBottom <= box.toolbarTop + 1, "toolbar covers the 1366 stage");
    await page.screenshot({ path: "/workspace/docs/progress/slide1-1366.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/slide1-1366.png" });

    for (let step = 0; step < 11; step += 1) {
      await page.keyboard.press("ArrowRight");
      box = await fit(page);
      assert.ok(box.notesHeight > 30, "notes missing on slide " + (step + 2));
      assert.ok(box.notesBottom <= box.toolbarTop + 1);
    }
    assert.match(box.slideText, /รอบนี้ข้อความแอด/);
    await page.screenshot({ path: "/workspace/docs/progress/slide12-synthesis.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/slide12-synthesis.png" });

    await page.select("#jump", "9");
    await page.waitForSelector(".ad-name");
    const labels = await page.$$eval(".slide.active .metrics span", (nodes) => nodes.map((node) => node.textContent));
    for (const label of ["Spend", "รายได้ Meta", "ROAS", "แชท", "บาท/แชท", "CPM", "ซื้อ", "ซื้อ÷แชท", "AOV"]) {
      assert.ok(labels.includes(label), label);
    }
    const name = await page.$eval(".ad-name", (node) => node.textContent);
    assert.ok(name.length > 8);
    const tags = await page.$$eval("[data-filter='creator-filter'] option", (nodes) => nodes.map((node) => node.value));
    for (const tag of ["Central", "Central+Leef", "Central+Park", "Central+Phum"]) assert.ok(tags.includes(tag));
    await page.select("[data-filter='sort-filter']", "spend");
    const pager = await page.$eval(".pager", (node) => node.textContent);
    assert.match(pager, /แอด/);
    await page.click("[aria-label='หน้าถัดไปของรายการแอด']");
    await page.select("[data-filter='creator-filter']", "Central");
    await page.select("[data-filter='creator-filter']", "Central+Leef");
    await page.screenshot({ path: "/workspace/docs/progress/ads-1366.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/ads-1366.png" });

    await page.select("#jump", "0");
    await page.type(".slide.active input[type=password]", password);
    await page.click(".slide.active .notes-login button");
    await page.waitForSelector(".slide.active textarea");
    await page.type(".slide.active textarea", marker);
    await page.waitForFunction(() => document.querySelector(".slide.active .notes-status").textContent.includes("บันทึกแล้ว"));
    assert.match(await page.$eval(".slide.active textarea", (node) => node.value), new RegExp(marker));
    const context = await browser.createBrowserContext();
    const fresh = await context.newPage();
    await fresh.setViewport({ width: 1366, height: 768 });
    await fresh.goto(origin, { waitUntil: "networkidle0" });
    await fresh.waitForSelector("#deck[data-hydrated='1']");
    await fresh.click("[data-view='present']");
    assert.equal((await fresh.content()).includes(marker), false);
    await fresh.type(".slide.active input[type=password]", password);
    await fresh.click(".slide.active .notes-login button");
    await fresh.waitForFunction((text) => {
      const area = document.querySelector(".slide.active textarea");
      return Boolean(area && area.value.includes(text));
    }, {}, marker);
    await context.close();
    await page.keyboard.press("ArrowRight");
    assert.match(await page.$eval("#count", (node) => node.textContent), /^1 \/ 12/);
    await page.evaluate(() => {
      const area = document.querySelector(".slide.active textarea");
      area.value = "บรรทัดบันทึก\n".repeat(30);
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.setViewport({ width: 1024, height: 554 });
    box = await fit(page);
    assert.ok(box.stageBottom <= box.toolbarTop + 1, "long note pushes into the toolbar");
    assert.ok(box.contentBottom <= box.notesTop + 1);
    await page.screenshot({ path: "/workspace/docs/progress/notes-inline-1024.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/notes-inline-1024.png" });

    await page.evaluate(() => {
      const button = [...document.querySelectorAll(".slide.active .notes-tools button")].find((node) => node.textContent === "ออกจากระบบ");
      button.click();
    });
    await page.waitForFunction(() => document.querySelector(".slide.active .notes-guest"));
    assert.equal((await page.$eval(".slide.active .slide-notes", (node) => node.innerText)).includes(marker), false);
  } finally {
    await browser.close();
    await stop(child);
  }
});
