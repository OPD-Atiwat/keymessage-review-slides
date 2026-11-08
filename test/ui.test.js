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
    assert.equal(await page.$("#viewport"), null);
    assert.equal(await page.$("#toolbar"), null);
    assert.equal(await page.$("[data-view='present']"), null);
    const logout = await page.$$eval("button", (nodes) => nodes.map((node) => node.textContent).filter((text) => text.includes("ออกจากระบบ")));
    assert.deepEqual(logout, []);
    assert.equal(await page.$eval("#report-period", (node) => node.value), "nov1_7");
    assert.equal(await page.$eval("[data-view='overview']", (node) => node.getAttribute("aria-pressed")), "true");
    await page.waitForSelector(".month-row");
    await page.screenshot({ path: "/opt/cursor/artifacts/overview-nov-1366.png" });
    await page.screenshot({ path: "/workspace/docs/progress/overview-nov-1366.png" });

    await page.click("[data-book='Mind']");
    await page.waitForSelector(".scan-row");
    const mind = await page.$eval("h2", (node) => node.textContent);
    assert.match(mind, /1–7 พ\.ย\. 2569/);
    assert.equal(mind.includes("ต.ค. ทั้งเดือน"), false);
    const headers = await page.$$eval(".scan-head span", (nodes) => nodes.map((node) => node.textContent));
    for (const label of ["Spend", "Revenue", "ROAS", "Messages", "Cost per Message", "CPM", "Purchases", "CVR", "AOV"]) {
      assert.ok(headers.some((text) => text === label || text.startsWith(label + " ")), label);
    }
    assert.equal(headers.some((label) => /บาท\/แชท|ซื้อ÷แชท|รายได้ Meta/.test(label)), false);
    const judged = await page.$$eval(".cell-better, .cell-worse", (nodes) => nodes.length);
    assert.ok(judged > 0);
    assert.equal(await page.$eval("[data-book='Mind']", (node) => node.getAttribute("aria-pressed")), "true");
    assert.equal(await page.$eval("#report-period", (node) => node.value), "nov1_7");
    const pages = await page.$eval(".ref-page", (node) => node.textContent);
    assert.match(pages, /^1 \/ [1-9]/);
    assert.equal(pages.includes("/ 47"), false);
    await page.screenshot({ path: "/opt/cursor/artifacts/mind-nov-book-1366.png" });
    await page.screenshot({ path: "/workspace/docs/progress/mind-nov-book-1366.png" });
    await page.setViewport({ width: 1024, height: 768 });
    await page.screenshot({ path: "/opt/cursor/artifacts/mind-nov-book-1024.png" });
    await page.screenshot({ path: "/workspace/docs/progress/mind-nov-book-1024.png" });
    await page.setViewport({ width: 1366, height: 768 });

    await page.click("[data-book='Coworkers']");
    await page.waitForFunction(() => document.querySelector("h2").textContent.includes("1–7 พ.ย. 2569"));
    assert.equal((await page.$eval("h2", (node) => node.textContent)).includes("ต.ค. ทั้งเดือน"), false);
    await page.click("[data-view='overview']");
    await page.waitForSelector(".month-row");
    assert.equal(await page.$eval("#report-period", (node) => node.value), "nov1_7");

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
