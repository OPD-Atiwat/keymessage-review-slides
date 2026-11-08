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
    const content = document.querySelector(".slide.active .content").getBoundingClientRect();
    return {
      stageBottom: stage.bottom,
      toolbarTop: toolbar.top,
      contentBottom: content.bottom,
      noteCount: document.querySelectorAll(".slide-notes").length,
      slideText: document.querySelector(".slide.active h1").textContent,
    };
  });
}

test("slides, analysis shortlist, and ad controls at both viewports", async () => {
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
    await bare.waitForSelector("#password");
    assert.equal(await bare.$("#s01-axis"), null);
    await bare.type("#password", password);
    await Promise.all([
      bare.waitForNavigation({ waitUntil: "domcontentloaded" }),
      bare.click("#login-form button"),
    ]);
    const fallback = await bare.$eval("#s01-axis", (node) => getComputedStyle(node).display);
    assert.equal(fallback, "flex");
    assert.match(await bare.$eval("#s01-axis h1", (node) => node.textContent), /ข้อความแอด/);
    await bare.close();

    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 900 });
    await page.goto(origin, { waitUntil: "networkidle0" });
    await page.waitForSelector("#deck[data-hydrated='1']");
    await page.waitForSelector(".month-row");
    const books = await page.$$eval(".month-name", (nodes) => nodes.map((node) => node.textContent));
    assert.deepEqual(books, ["ถือไพ่เหนือกว่า", "ออฟฟิศนี้เฮงซวย", "Survival Guide", "กับดักความรู้สึกผิด"]);
    assert.match(await page.$eval("#asof", (node) => node.textContent), /7 พ\.ย\. 2569/);
    const overviewFit = await page.evaluate(() => {
      const names = [...document.querySelectorAll(".month-name")].map((node) => node.getBoundingClientRect());
      return {
        names: names.map((box) => box.bottom),
        height: window.innerHeight,
        notes: document.querySelectorAll(".slide-notes").length,
      };
    });
    assert.equal(overviewFit.names.length, 4);
    assert.equal(overviewFit.notes, 0);
    assert.ok(overviewFit.names.every((bottom) => bottom > 0 && bottom < overviewFit.height));
    await page.screenshot({ path: "/workspace/docs/progress/overview-1366.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/overview-1366.png" });
    await page.setViewport({ width: 1024, height: 900 });
    await page.screenshot({ path: "/workspace/docs/progress/overview-1024.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/overview-1024.png" });

    await page.setViewport({ width: 1366, height: 900 });
    await page.click("[data-book='Coworkers']");
    await page.waitForSelector(".scan-row");
    await page.evaluate(() => { document.querySelector("#web-main").scrollTop = 0; });
    const bookFit = await page.evaluate(() => {
      const rows = [...document.querySelectorAll(".scan-row")].slice(0, 3).map((node) => node.getBoundingClientRect());
      return {
        count: document.querySelectorAll(".scan-row").length,
        heights: rows.map((box) => box.height),
        tops: rows.map((box) => box.top),
        height: window.innerHeight,
        notes: document.querySelectorAll(".slide-notes").length,
      };
    });
    assert.ok(bookFit.count >= 2);
    assert.equal(bookFit.notes, 0);
    assert.ok(bookFit.heights.every((height) => height > 20 && height < 88));
    assert.ok(bookFit.tops.every((top) => top > 0 && top < bookFit.height));
    await page.screenshot({ path: "/workspace/docs/progress/book-1366.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/book-1366.png" });
    await page.setViewport({ width: 1024, height: 900 });
    await page.evaluate(() => { document.querySelector("#web-main").scrollTop = 0; });
    await page.screenshot({ path: "/workspace/docs/progress/book-1024.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/book-1024.png" });

    await page.setViewport({ width: 1366, height: 900 });
    await page.click("[data-book='Coworkers']");
    await page.waitForSelector(".scan-row .pick-btn");
    const pickedName = await page.$eval(".scan-row .ad-name", (node) => node.textContent);
    assert.equal(await page.$eval("#report-period", (node) => node.value), "oct");
    await page.click(".scan-row .pick-btn");
    await page.waitForFunction(() => document.querySelector(".scan-row .pick-btn").textContent === "เลือกแล้ว");
    assert.equal(await page.$eval("#report-period", (node) => node.value), "oct");
    assert.equal(await page.$eval("[data-book='Coworkers'].on", (node) => node.dataset.book), "Coworkers");
    await page.click("[data-view='analysis']");
    await page.waitForSelector(".analysis-card");
    assert.equal(await page.$(".slide-notes"), null);
    assert.match(await page.$eval(".analysis-lead", (node) => node.textContent), /เลือกเอง/);
    const cardText = await page.$eval(".analysis-card", (node) => node.innerText);
    assert.ok(cardText.includes(pickedName));
    assert.match(cardText, /ออฟฟิศนี้เฮงซวย/);
    assert.match(cardText, /ต\.ค\. ทั้งเดือน/);
    assert.equal(cardText.includes("แนะนำให้เลือก"), false);
    await page.type(".analysis-note", marker);
    await page.waitForFunction(() => document.querySelector(".analysis-status").textContent.includes("บันทึกแล้ว"));
    await page.screenshot({ path: "/workspace/docs/progress/analysis-1366.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/analysis-1366.png" });
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#deck[data-hydrated='1']");
    await page.click("[data-view='analysis']");
    await page.waitForSelector(".analysis-note");
    assert.match(await page.$eval(".analysis-note", (node) => node.value), new RegExp(marker));
    assert.equal(await page.$eval("#report-period", (node) => node.value), "oct");

    await page.setViewport({ width: 1024, height: 554 });
    await page.click("[data-view='present']");
    assert.equal(new URL(page.url()).hash, "");
    assert.equal(new URL(page.url()).search, "");
    let box = await fit(page);
    assert.equal(box.noteCount, 0);
    assert.ok(box.stageBottom <= box.toolbarTop + 1, "toolbar covers the 1024 stage");
    assert.ok(box.contentBottom <= box.stageBottom + 1);
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
      assert.equal(box.noteCount, 0, "note footer on slide " + (step + 2));
      assert.ok(box.stageBottom <= box.toolbarTop + 1);
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
    assert.equal(await page.$(".slide.active textarea"), null);
    const context = await browser.createBrowserContext();
    const fresh = await context.newPage();
    await fresh.setViewport({ width: 1366, height: 768 });
    await fresh.goto(origin, { waitUntil: "networkidle0" });
    await fresh.waitForSelector("#password");
    assert.equal((await fresh.content()).includes(marker), false);
    await fresh.type("#password", password);
    await Promise.all([
      fresh.waitForNavigation({ waitUntil: "networkidle0" }),
      fresh.click("#login-form button"),
    ]);
    await fresh.waitForSelector("#deck[data-hydrated='1']");
    assert.equal(await fresh.$(".slide-notes"), null);
    await fresh.click("[data-view='analysis']");
    await fresh.waitForFunction((text) => {
      const area = document.querySelector(".analysis-note");
      return Boolean(area && area.value.includes(text));
    }, {}, marker);
    await context.close();
    await page.keyboard.press("ArrowRight");
    assert.match(await page.$eval("#count", (node) => node.textContent), /^2 \/ 12/);
    await page.setViewport({ width: 1024, height: 554 });
    box = await fit(page);
    assert.equal(box.noteCount, 0);
    assert.ok(box.stageBottom <= box.toolbarTop + 1, "stage stays above the toolbar");
    await page.click("#logout");
    await page.waitForSelector("#password");
    assert.equal((await page.content()).includes(marker), false);
  } finally {
    await browser.close();
    await stop(child);
  }
});
