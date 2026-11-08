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
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto(origin, { waitUntil: "networkidle0" });
    await page.waitForSelector("#deck[data-hydrated='1']");
    assert.equal(await page.$eval("body", (node) => node.classList.contains("mode-present")), true);
    assert.equal(await page.$eval("#present-period", (node) => node.value), "nov1_7");
    assert.equal(await page.$eval("#report-period", (node) => node.value), "nov1_7");
    const opening = await page.$eval("#s01-axis h1", (node) => node.textContent);
    assert.match(opening, /ข้อความแอด/);
    assert.match(opening, /1–7 พ\.ย\. 2569/);
    assert.equal(/ต\.ค\. ทั้งเดือน/.test(opening), false);
    assert.equal(await page.$$eval("#s01-axis .book-total", (nodes) => nodes.length), 4);
    assert.match(await page.$eval("#s01-axis .tone-legend", (node) => node.innerText), /ดีกว่าค่าเฉลี่ยเล่ม/);
    assert.equal(await page.$$eval(".slide-notes", (nodes) => nodes.length), 0);
    const stageRatio = await page.evaluate(() => {
      const box = document.querySelector("#stage").getBoundingClientRect();
      return box.width / box.height;
    });
    assert.ok(Math.abs(stageRatio - 16 / 9) < 0.05, "stage is 16:9");
    await page.screenshot({ path: "/workspace/docs/progress/overview-1366.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/overview-1366.png" });
    await page.setViewport({ width: 1024, height: 554 });
    await page.screenshot({ path: "/workspace/docs/progress/overview-1024.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/overview-1024.png" });

    await page.setViewport({ width: 1366, height: 768 });
    await page.select("#jump", "5");
    await page.waitForSelector("#s06-coworkers .prow .ad-name");
    const bookTone = await page.evaluate(() => {
      const rows = [...document.querySelectorAll("#s06-coworkers .prow")].slice(0, 3);
      const boxes = rows.map((node) => node.getBoundingClientRect());
      const judged = document.querySelectorAll("#s06-coworkers .cell-better, #s06-coworkers .cell-worse").length;
      const spend = [...document.querySelectorAll("#s06-coworkers [data-metric='spend']")].map((node) => node.dataset.tone);
      const content = document.querySelector("#s06-coworkers .content");
      return {
        count: document.querySelectorAll("#s06-coworkers .prow").length,
        heights: boxes.map((box) => box.height),
        judged,
        spend,
        overflow: content.scrollHeight - content.clientHeight,
      };
    });
    assert.ok(bookTone.count >= 2);
    assert.ok(bookTone.judged > 0);
    assert.ok(bookTone.spend.every((tone) => tone === "volume"));
    assert.ok(bookTone.heights.every((height) => height > 20 && height < 96));
    assert.ok(bookTone.overflow < 2);
    const chrome = await page.evaluate(() => {
      const visible = (selector) => [...document.querySelectorAll(selector)].filter((node) => {
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        return style.display !== "none" && style.visibility !== "hidden" && box.width > 0 && box.height > 0;
      }).length;
      return {
        full: visible("#full, #full-slide"),
        period: visible("#present-period, #report-period"),
        prev: visible("#prev"),
        nav: visible("#webnav"),
        chips: visible(".book-chip"),
      };
    });
    assert.equal(chrome.full, 1);
    assert.equal(chrome.period, 1);
    assert.equal(chrome.prev, 1);
    assert.equal(chrome.nav, 0);
    assert.equal(chrome.chips, 0);
    await page.screenshot({ path: "/workspace/docs/progress/book-1366.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/book-1366.png" });
    await page.setViewport({ width: 1024, height: 554 });
    await page.screenshot({ path: "/workspace/docs/progress/book-1024.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/book-1024.png" });

    await page.setViewport({ width: 1366, height: 768 });
    const pickedName = await page.$eval("#s06-coworkers .ad-name", (node) => node.textContent);
    assert.equal(await page.$eval("#present-period", (node) => node.value), "nov1_7");
    await page.click("#s06-coworkers .pick-btn");
    await page.waitForFunction(() => document.querySelector("#s06-coworkers .pick-btn").getAttribute("aria-pressed") === "true");
    assert.equal(await page.$eval("#s06-coworkers .prow.is-picked [data-metric='spend']", (node) => node.dataset.tone), "volume");
    const stillJudged = await page.$eval("#s06-coworkers .prow.is-picked", (node) => node.querySelector(".cell-better, .cell-worse") != null);
    assert.equal(stillJudged, true);
    await page.screenshot({ path: "/workspace/docs/progress/selected-1366.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/selected-1366.png" });
    await page.setViewport({ width: 1024, height: 554 });
    await page.screenshot({ path: "/workspace/docs/progress/selected-1024.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/selected-1024.png" });
    await page.setViewport({ width: 1366, height: 768 });
    assert.equal(await page.$eval("#present-period", (node) => node.value), "nov1_7");
    await page.click("#to-analysis");
    await page.waitForSelector(".analysis-card");
    assert.equal(await page.$(".slide-notes"), null);
    assert.match(await page.$eval(".analysis-lead", (node) => node.textContent), /เลือกเอง/);
    const cardText = await page.$eval(".analysis-card", (node) => node.innerText);
    assert.ok(cardText.includes(pickedName));
    assert.match(cardText, /ออฟฟิศนี้เฮงซวย/);
    assert.match(cardText, /1–7 พ\.ย\./);
    assert.equal(cardText.includes("แนะนำให้เลือก"), false);
    await page.type(".analysis-note", marker);
    await page.waitForFunction(() => document.querySelector(".analysis-status").textContent.includes("บันทึกแล้ว"));
    await page.screenshot({ path: "/workspace/docs/progress/analysis-1366.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/analysis-1366.png" });
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("#deck[data-hydrated='1']");
    await page.click("#to-analysis");
    await page.waitForSelector(".analysis-note");
    assert.match(await page.$eval(".analysis-note", (node) => node.value), new RegExp(marker));
    assert.equal(await page.$eval("#report-period", (node) => node.value), "nov1_7");

    await page.setViewport({ width: 1024, height: 554 });
    await page.click("[data-view='present']");
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
    const closing = await page.$eval("#s12-synthesis", (node) => node.innerText);
    assert.match(closing, /Cost per Message/);
    assert.equal(closing.includes("บาท/แชท"), false);
    assert.equal(closing.includes("เป็น 1.45 ใน ต.ค."), false);
    await page.screenshot({ path: "/workspace/docs/progress/slide12-synthesis.png" });
    await page.screenshot({ path: "/opt/cursor/artifacts/slide12-synthesis.png" });

    await page.select("#jump", "9");
    await page.waitForSelector(".ad-name");
    const labels = await page.$$eval(".slide.active .metrics span", (nodes) => nodes.map((node) => node.textContent));
    for (const label of ["Spend", "Revenue", "ROAS", "Messages", "Cost per Message", "CPM", "Purchases", "CVR", "AOV"]) {
      assert.ok(labels.includes(label), label);
    }
    assert.equal(labels.some((label) => /บาท\/แชท|ซื้อ÷แชท|รายได้ Meta/.test(label)), false);
    const name = await page.$eval(".ad-name", (node) => node.textContent);
    assert.ok(name.length > 8);
    const tags = await page.$$eval("[data-filter='creator-filter'] option", (nodes) => nodes.map((node) => node.value));
    for (const tag of ["Central", "Central+Leef", "Central+Park", "Central+Phum"]) assert.ok(tags.includes(tag));
    await page.select("[data-filter='sort-filter']", "spend");
    const pager = await page.$eval(".pager", (node) => node.textContent);
    assert.match(pager, /แอด/);
    await page.click(".slide.active [aria-label='หน้าถัดไปของรายการแอด']");
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
    await fresh.click("#to-analysis");
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
