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

test("November overview and Mind book stay on the selected period", async () => {
  psql("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ubuntu') THEN CREATE ROLE ubuntu LOGIN SUPERUSER; END IF; END $$;");
  psql("DROP DATABASE IF EXISTS kmnotes_ui");
  psql("CREATE DATABASE kmnotes_ui OWNER ubuntu");
  const port = 18082;
  const password = randomBytes(18).toString("hex");
  const marker = "วิเคราะห์-" + randomBytes(3).toString("hex");
  const child = start(port, {
    DATABASE_URL: "postgres://ubuntu@/kmnotes_ui?host=/var/run/postgresql",
    EDITOR_PASSWORD_HASH: hashPassword(password),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    ALLOW_INSECURE_COOKIES: "1",
    NODE_ENV: "test",
  });
  mkdirSync("/opt/cursor/artifacts", { recursive: true });
  mkdirSync("/workspace/docs/progress", { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const errors = [];
  try {
    await waitUp(port);
    const origin = `http://127.0.0.1:${port}/`;
    const page = await browser.newPage();
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.setViewport({ width: 1366, height: 768 });
    await page.goto(origin + "#6", { waitUntil: "networkidle0" });
    await page.waitForSelector("#password");
    await page.type("#password", password);
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle0" }),
      page.click("#login-form button"),
    ]);
    await page.waitForSelector("body[data-hydrated='1']");
    assert.equal(await page.$eval("title", (node) => node.textContent), "ผลโฆษณารายเล่ม");
    assert.equal((await page.$eval("#webnav", (node) => node.textContent)).includes("วงคุย"), false);
    assert.equal(await page.$$eval("#webnav button[data-view]", (nodes) => nodes.map((node) => node.textContent).join(",")), "ภาพรวม,รายเล่ม,Creator,วิเคราะห์ต่อยอด");
    assert.equal(await page.$("#full"), null);
    assert.equal(await page.$("#toolbar"), null);
    assert.equal(await page.$("[data-view='present']"), null);
    const logout = await page.$$eval("button", (nodes) => nodes.map((node) => node.textContent).filter((text) => text.includes("ออกจากระบบ")));
    assert.deepEqual(logout, []);
    assert.equal(await page.$eval("#report-period", (node) => node.value), "nov1_7");
    assert.equal(await page.$eval("[data-view='overview']", (node) => node.getAttribute("aria-pressed")), "true");
    await page.waitForSelector(".metric-book .metric-table");
    assert.equal(await page.$$eval(".metric-book .metric-table", (nodes) => nodes.length), 4);
    assert.match(await page.$eval(".history-help", (node) => node.textContent), /ไม่ใช่กำไร/);
    assert.match(await page.$eval(".history-help", (node) => node.textContent), /เฉพาะรายการที่ยืนยันเล่มได้/);
    assert.match(await page.$eval(".metric-scope", (node) => node.textContent), /เฉพาะรายการที่ยืนยันเล่มได้/);
    const shape = await page.$eval(".metric-table[data-book='Mind']", (table) => {
      const months = [...table.querySelectorAll("thead .month-col")].map((node) => node.textContent);
      const metrics = [...table.querySelectorAll("tbody .metric-name")].map((node) => node.textContent);
      const may = table.querySelector("[data-metric='spend'][data-period='may']").textContent;
      const octRoas = table.querySelector("[data-metric='roas'][data-period='oct']");
      const octSpend = table.querySelector("[data-metric='spend'][data-period='oct']");
      const nov = table.querySelector("[data-metric='roas'][data-period='nov1_7']");
      const mixed = table.querySelector(".history-cell, .history-pair, .history-roas");
      return {
        months,
        metrics,
        may,
        octRoas: octRoas.textContent,
        octClass: octRoas.className,
        octTitle: octRoas.title,
        octColor: getComputedStyle(octRoas).color,
        octBackground: getComputedStyle(octRoas).backgroundColor,
        spendClass: octSpend.className,
        spendText: octSpend.textContent,
        novTitle: nov.title,
        mixed: Boolean(mixed),
      };
    });
    assert.deepEqual(shape.months, ["พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "1–7 พ.ย."]);
    assert.deepEqual(shape.metrics, ["Spend", "Revenue", "ROAS", "Messages", "Cost per Message", "CPM", "Purchases", "CVR", "AOV"]);
    assert.equal(shape.may, "—");
    assert.equal(shape.octRoas, "0.69");
    assert.match(shape.octClass, /cell-neutral/);
    assert.match(shape.octTitle, /mom_eligible/);
    assert.equal(shape.octColor, "rgb(75, 72, 112)");
    assert.ok(shape.octBackground === "transparent" || shape.octBackground === "rgba(0, 0, 0, 0)");
    assert.equal(shape.spendText, "฿174,743");
    assert.equal(await page.$eval(".metric-table[data-book='Mind'] [data-metric='spend'][data-period='may']", (node) => node.title), "ไม่มีรายการที่ยืนยันได้");
    assert.match(shape.spendClass, /cell-volume/);
    assert.match(shape.novTitle, /1–7 ต\.ค\./);
    assert.equal(shape.novTitle.includes("ทั้งเดือน"), false);
    assert.equal(shape.mixed, false);
    assert.equal(await page.$(".history-cell"), null);
    assert.equal(await page.$$eval(".trend-panel, .chart-panel", (nodes) => nodes.length), 4);
    const ticks = await page.$$eval(".trend-chart .chart-tick", (nodes) => nodes.map((node) => node.textContent));
    assert.ok(ticks.includes("พ.ค."));
    assert.equal(ticks.includes("พ.ย."), false);
    assert.equal(await page.$$eval(".period-row", (nodes) => nodes.length), 4);
    assert.ok((await page.$$eval(".trend-y", (nodes) => nodes.length)) >= 2);
    await page.screenshot({ path: "/opt/cursor/artifacts/overview-nov-1366.png" });
    await page.screenshot({ path: "/workspace/docs/progress/overview-nov-1366.png" });
    await page.setViewport({ width: 1024, height: 768 });
    await page.screenshot({ path: "/opt/cursor/artifacts/overview-nov-1024.png" });
    await page.screenshot({ path: "/workspace/docs/progress/overview-nov-1024.png" });
    await page.setViewport({ width: 390, height: 780 });
    await page.screenshot({ path: "/opt/cursor/artifacts/overview-narrow.png" });
    await page.screenshot({ path: "/workspace/docs/progress/overview-narrow.png" });
    await page.setViewport({ width: 1366, height: 768 });

    await page.click(".period-row");
    await page.waitForSelector(".book-switch");
    assert.equal(await page.$eval("[data-view='book']", (node) => node.getAttribute("aria-pressed")), "true");
    await page.click("[data-view='overview']");
    await page.waitForSelector(".trend-chart");
    await page.click("[data-book='Mind']");
    await page.waitForSelector(".scan-row");
    const mind = await page.$eval("h2", (node) => node.textContent);
    assert.match(mind, /1–7 พ\.ย\. 2569/);
    assert.equal(mind.includes("ต.ค. ทั้งเดือน"), false);
    const headers = await page.$$eval(".scan-head button, .scan-head span", (nodes) => nodes.map((node) => node.textContent));
    for (const label of ["Spend", "Revenue", "ROAS", "Messages", "Cost per Message", "CPM", "Purchases", "CVR", "AOV"]) {
      assert.ok(headers.some((text) => text === label || text.startsWith(label + " ")), label);
    }
    assert.equal(headers.some((label) => /บาท\/แชท|ซื้อ÷แชท|รายได้ Meta/.test(label)), false);
    const judged = await page.$$eval(".scan-row .cell-better, .scan-row .cell-worse", (nodes) => nodes.length);
    assert.ok(judged > 0);
    const ink = await page.$$eval(".scan-row [data-metric='costPerMsg'], .scan-row [data-metric='cpm'], .scan-row [data-metric='cvrProxy'], .scan-row [data-metric='aov']", (nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      return {
        text: node.textContent,
        color: style.color,
        background: style.backgroundColor,
        whiteSpace: style.whiteSpace,
      };
    }));
    assert.ok(ink.length >= 4);
    for (const cell of ink) {
      assert.equal(/▲|▼/.test(cell.text), false);
      assert.ok(cell.background === "transparent" || cell.background === "rgba(0, 0, 0, 0)");
      assert.equal(cell.whiteSpace, "nowrap");
    }
    const colored = ink.filter((cell) => cell.color === "rgb(21, 128, 61)" || cell.color === "rgb(185, 28, 28)");
    assert.ok(colored.length > 0);
    const tab = await page.$eval("[data-book='Mind']", (node) => getComputedStyle(node).backgroundColor);
    assert.equal(tab, "rgb(220, 252, 231)");
    assert.equal(await page.$eval("[data-book='Mind']", (node) => node.getAttribute("aria-pressed")), "true");
    assert.equal(await page.$eval("#report-period", (node) => node.value), "nov1_7");
    const shown = await page.$$eval(".scan-row", (nodes) => nodes.map((node) => node.dataset.adId));
    assert.equal(shown.length, 33);
    assert.equal(new Set(shown).size, 33);
    assert.equal(await page.$(".scan-pager"), null);
    assert.equal(await page.$(".ref-page"), null);
    const labels = await page.$$eval("button", (nodes) => nodes.map((node) => node.textContent));
    assert.equal(labels.some((text) => text.includes("ถัดไป") || text.includes("ดูเพิ่ม")), false);
    assert.equal(await page.$("#content-month"), null);
    assert.equal(await page.$(".scan-row .scan-status"), null);
    assert.equal(await page.$(".scan-row img"), null);
    await page.click(".ad-name");
    await page.waitForSelector("#zoom[open]");
    assert.ok((await page.$eval("#detail-name", (node) => node.textContent)).length > 8);
    assert.match(await page.$eval("#detail-metrics", (node) => node.textContent), /Spend/);
    assert.match(await page.$eval("#detail-metrics", (node) => node.textContent), /CVR/);
    assert.match(await page.$eval("#detail-note", (node) => node.textContent), /omni_purchase/);
    assert.equal(await page.$$eval(".pick-btn.on", (nodes) => nodes.length), 0);
    await page.screenshot({ path: "/opt/cursor/artifacts/ad-detail-1366.png" });
    await page.screenshot({ path: "/workspace/docs/progress/ad-detail-1366.png" });
    await page.setViewport({ width: 1024, height: 768 });
    await page.screenshot({ path: "/opt/cursor/artifacts/ad-detail-1024.png" });
    await page.screenshot({ path: "/workspace/docs/progress/ad-detail-1024.png" });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: "/opt/cursor/artifacts/ad-detail-390.png" });
    await page.screenshot({ path: "/workspace/docs/progress/ad-detail-390.png" });
    await page.setViewport({ width: 1366, height: 768 });
    const fit = await page.$eval("#zoom", (node) => {
      const rect = node.getBoundingClientRect();
      const note = document.getElementById("detail-note");
      const bits = [...document.querySelectorAll(".detail-bit")].every((bit) => bit.scrollWidth <= bit.clientWidth + 1);
      const close = node.querySelector(".detail-close").getBoundingClientRect();
      return {
        inside: rect.left >= -1 && rect.right <= window.innerWidth + 1,
        note: note.scrollWidth <= note.clientWidth + 1,
        bits,
        close: close.height >= 36 && close.right <= window.innerWidth + 1,
      };
    });
    assert.equal(fit.inside, true);
    assert.equal(fit.note, true);
    assert.equal(fit.bits, true);
    assert.equal(fit.close, true);
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#zoom[open]"));
    assert.match(await page.$eval(".scatter-block .chart-note", (node) => node.textContent), /ไม่แปลว่ากำไร/);
    const xTicks = await page.$$eval(".scatter-host .x-tick", (nodes) => nodes.map((node) => node.textContent));
    const yTicks = await page.$$eval(".scatter-host .y-tick", (nodes) => nodes.map((node) => node.textContent));
    assert.ok(xTicks.includes("฿0"));
    assert.ok(xTicks.some((label) => /฿\d+k/.test(label)));
    assert.ok(yTicks.some((label) => label === "0" || label.startsWith("0.")));
    assert.equal(await page.$eval(".chart-base-label", (node) => node.textContent), "ROAS ทั้งเล่ม 0.89");
    assert.equal(await page.$$eval("summary", (nodes) => nodes.filter((node) => node.textContent === "ตัวเลขในกราฟ").length), 0);
    const picksBefore = await page.$$eval(".pick-btn.on", (nodes) => nodes.length);
    await page.click(".scatter-hit");
    await page.waitForSelector(".scan-row.is-located");
    assert.equal(await page.$$eval(".pick-btn.on", (nodes) => nodes.length), picksBefore);
    assert.equal(await page.$eval("[data-sort='spend']", (node) => node.getAttribute("aria-sort")), "descending");
    const nameStyle = await page.$eval(".scan-row .ad-name", (node) => {
      const style = getComputedStyle(node);
      return { whiteSpace: style.whiteSpace, fontSize: style.fontSize, title: node.title };
    });
    assert.equal(nameStyle.whiteSpace, "nowrap");
    assert.ok(parseFloat(nameStyle.fontSize) >= 15);
    assert.ok(nameStyle.title.length > 0);
    const fullTotal = await page.$eval(".scan-total", (node) => node.textContent);
    assert.match(fullTotal, /ไม่ใช่ยอดที่กรอง/);
    assert.match(fullTotal, /34,890/);
    await page.click("[data-sort='revenue']");
    await page.waitForFunction(() => document.querySelector("[data-sort='revenue']").getAttribute("aria-sort") === "descending");
    await page.$eval(".metric-min", (node) => { node.value = "1000"; });
    await page.$eval(".metric-max", (node) => { node.value = "8000"; });
    await page.click(".metric-filter button[type='submit']");
    await page.waitForFunction(() => {
      const count = document.querySelector(".scan-count").textContent;
      return /^\d+\/33/.test(count) && !count.startsWith("33/");
    });
    const filteredCount = await page.$eval(".scan-count", (node) => node.textContent);
    assert.match(filteredCount, /^\d+\/33/);
    assert.match(await page.$eval(".scan-total", (node) => node.textContent), /34,890/);
    await page.screenshot({ path: "/opt/cursor/artifacts/mind-nov-book-1366.png" });
    await page.screenshot({ path: "/workspace/docs/progress/mind-nov-book-1366.png" });
    await page.setViewport({ width: 1024, height: 768 });
    await page.screenshot({ path: "/opt/cursor/artifacts/mind-nov-book-1024.png" });
    await page.screenshot({ path: "/workspace/docs/progress/mind-nov-book-1024.png" });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: "/opt/cursor/artifacts/mind-nov-book-390.png" });
    await page.screenshot({ path: "/workspace/docs/progress/mind-nov-book-390.png" });
    await page.setViewport({ width: 1366, height: 768 });
    await page.$eval(".metric-min", (node) => { node.value = "9"; });
    await page.$eval(".metric-max", (node) => { node.value = "1"; });
    await page.click(".metric-filter button[type='submit']");
    await page.waitForSelector(".metric-filter-error");
    assert.match(await page.$eval(".metric-filter-error", (node) => node.textContent), /มากกว่า/);
    assert.equal(await page.$eval(".scan-count", (node) => node.textContent), filteredCount);
    await page.click(".metric-reset");
    await page.waitForFunction(() => document.querySelector(".scan-count").textContent === "33/33 แอด");
    assert.equal(await page.$$eval(".scan-row", (nodes) => nodes.length), 33);
    await page.$eval(".scatter-block", (node) => node.scrollIntoView({ block: "center" }));
    await page.screenshot({ path: "/opt/cursor/artifacts/mind-nov-unfiltered-1366.png" });
    await page.screenshot({ path: "/workspace/docs/progress/mind-nov-unfiltered-1366.png" });

    await page.click("[data-book='Coworkers']");
    await page.waitForFunction(() => document.querySelector("h2").textContent.includes("1–7 พ.ย. 2569"));
    assert.equal((await page.$eval("h2", (node) => node.textContent)).includes("ต.ค. ทั้งเดือน"), false);
    await page.click("[data-view='overview']");
    await page.waitForSelector(".metric-table");
    assert.equal(await page.$eval("#report-period", (node) => node.value), "nov1_7");

    await page.click("[data-view='creator']");
    await page.waitForSelector(".creator-table");
    assert.match(await page.$eval("h2", (node) => node.textContent), /เรียงตาม Spend/);
    assert.equal(await page.$eval("[data-creator-scope='all']", (node) => node.getAttribute("aria-pressed")), "true");
    assert.match(await page.$eval("body", (node) => node.textContent), /สินค้าไม่เหมือนกัน/);
    await page.screenshot({ path: "/opt/cursor/artifacts/creator-overall-1366.png" });
    await page.screenshot({ path: "/workspace/docs/progress/creator-overall-1366.png" });
    await page.click("[data-creator-scope='Mind']");
    await page.waitForFunction(() => document.querySelector("[data-creator-scope='Mind']").getAttribute("aria-pressed") === "true");
    const creatorTable = await page.$eval(".creator-table", (node) => node.textContent);
    assert.match(creatorTable, /Central\+Leef/);
    assert.match(creatorTable, /Central/);
    assert.equal(creatorTable.includes("ไม่ทราบ Creator"), false);
    await page.screenshot({ path: "/opt/cursor/artifacts/creator-onebook-1366.png" });
    await page.screenshot({ path: "/workspace/docs/progress/creator-onebook-1366.png" });
    const creatorTag = await page.$eval(".creator-row", (node) => node.dataset.creator);
    await page.click(".creator-row");
    await page.waitForSelector("#creator-ads");
    assert.equal(await page.$$eval(".pick-btn.on", (nodes) => nodes.length), 0);
    const openedName = await page.$eval(".creator-ad-name", (node) => node.textContent);
    assert.ok(openedName.length > 12);
    assert.equal(openedName.includes("…"), false);
    await page.click(".creator-ad-name");
    await page.waitForSelector("#zoom[open]");
    const creatorFit = await page.$eval("#zoom", (node) => {
      const rect = node.getBoundingClientRect();
      const note = document.getElementById("detail-note");
      const bits = [...document.querySelectorAll(".detail-bit")].every((bit) => bit.scrollWidth <= bit.clientWidth + 1);
      return rect.left >= -1 && rect.right <= window.innerWidth + 1 && note.scrollWidth <= note.clientWidth + 1 && bits;
    });
    assert.equal(creatorFit, true);
    assert.equal(await page.$eval("#detail-name", (node) => node.textContent), openedName);
    await page.screenshot({ path: "/opt/cursor/artifacts/creator-ad-detail-1366.png" });
    await page.screenshot({ path: "/workspace/docs/progress/creator-ad-detail-1366.png" });
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#zoom[open]"));
    await page.keyboard.press("Escape");
    await page.waitForFunction(() => !document.querySelector("#creator-ads"));
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.creator || ""), creatorTag);
    await page.select("#creator-metric", "costPerMsg");
    await page.waitForFunction(() => document.querySelector("h2").textContent.includes("Cost per Message"));
    assert.match(await page.$eval(".creator-dir", (node) => node.textContent), /น้อยไปมาก/);
    await page.select("#creator-metric", "roas");
    await page.click("[data-creator-scope='all']");
    await page.select("#report-period", "may");
    await page.waitForFunction(() => document.body.innerText.includes("ไม่ทราบ Creator"));
    assert.match(await page.$eval("body", (node) => node.textContent), /ไม่ได้เดาจากชื่อแอด/);
    await page.select("#report-period", "nov1_7");
    await page.waitForSelector(".creator-row");
    await page.setViewport({ width: 1024, height: 768 });
    await page.screenshot({ path: "/opt/cursor/artifacts/creator-1024.png" });
    await page.screenshot({ path: "/workspace/docs/progress/creator-1024.png" });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: "/opt/cursor/artifacts/creator-390.png" });
    await page.screenshot({ path: "/workspace/docs/progress/creator-390.png" });
    await page.setViewport({ width: 1366, height: 768 });
    await page.evaluate(() => { location.hash = "#book/Coworkers"; });
    await page.waitForFunction(() => (document.querySelector("h2")?.textContent || "").includes("ออฟฟิศ"));
    await page.evaluate(() => { location.hash = "#creator/Mind"; });
    await page.waitForFunction(() => document.querySelector("[data-creator-scope='Mind']")?.getAttribute("aria-pressed") === "true");
    await page.click("[data-view='overview']");
    await page.waitForSelector(".metric-table");

    await page.click("[data-book='Mind']");
    await page.waitForSelector(".pick-btn");
    const pickedName = await page.$eval(".ad-name", (node) => node.textContent);
    await page.click(".pick-btn");
    await page.waitForFunction(() => document.querySelector(".pick-btn").getAttribute("aria-pressed") === "true");
    await page.click("[data-view='analysis']");
    await page.waitForSelector(".analysis-note");
    assert.match(await page.$eval(".analysis-card", (node) => node.innerText), /1–7 พ\.ย\./);
    assert.ok((await page.$eval(".analysis-card", (node) => node.innerText)).includes(pickedName));
    await page.type(".analysis-note", marker);
    await page.waitForFunction(() => document.querySelector(".analysis-status").textContent.includes("บันทึกแล้ว"));
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("body[data-hydrated='1']");
    assert.equal(await page.$eval("#report-period", (node) => node.value), "nov1_7");
    await page.click("[data-view='analysis']");
    await page.waitForFunction((text) => {
      const area = document.querySelector(".analysis-note");
      return Boolean(area && area.value.includes(text));
    }, {}, marker);
    assert.equal(await page.$eval("#boot-error", (node) => node.hidden), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await stop(child);
  }
});
