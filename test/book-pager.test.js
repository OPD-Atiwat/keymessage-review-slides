import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomBytes, scryptSync } from "node:crypto";
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
  throw new Error("pager server did not start");
}

async function login(page, origin, password) {
  await page.goto(origin, { waitUntil: "networkidle0" });
  await page.waitForSelector("#password");
  await page.type("#password", password);
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0" }),
    page.click("#login-form button"),
  ]);
  await page.waitForSelector("body[data-hydrated='1']");
}

test("book next page keeps working after the book tab replaces the view", async () => {
  psql("DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'ubuntu') THEN CREATE ROLE ubuntu LOGIN SUPERUSER; END IF; END $$;");
  psql("DROP DATABASE IF EXISTS kmnotes_pager");
  psql("CREATE DATABASE kmnotes_pager OWNER ubuntu");
  const port = 18086;
  const password = randomBytes(18).toString("hex");
  const child = start(port, {
    DATABASE_URL: "postgres://ubuntu@/kmnotes_pager?host=/var/run/postgresql",
    EDITOR_PASSWORD_HASH: hashPassword(password),
    SESSION_SECRET: randomBytes(32).toString("hex"),
    ALLOW_INSECURE_COOKIES: "1",
    NODE_ENV: "test",
  });
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
    page.on("pageerror", (error) => errors.push(String(error && error.stack ? error.stack : error)));
    await login(page, origin, password);
    await page.evaluate(() => localStorage.setItem("km-unrelated", "keep-me"));
    await page.waitForSelector("[data-book='Coworkers']");
    for (const book of ["Mind", "Coworkers", "SurvivalGuide", "Trap"]) {
      await page.click(`[data-book='${book}']`);
      await page.waitForSelector(".scan-pager");
      const before = await page.$eval(".ref-page", (node) => node.textContent);
      await page.click(".scan-pager button:last-of-type");
      await page.waitForFunction(() => document.querySelector(".ref-page"));
      const banner = await page.$eval("#boot-error", (node) => (node.hidden ? "" : node.textContent));
      assert.equal(banner, "");
      const after = await page.$eval(".ref-page", (node) => node.textContent);
      assert.notEqual(after, before, errors.join("\n"));
      await page.click(".scan-pager button");
      await page.waitForFunction((text) => document.querySelector(".ref-page").textContent === text, {}, before);
    }
    await page.select("#report-period", "oct");
    await page.waitForSelector(".scan-row");
    await page.select("#report-period", "nov1_7");
    await page.click(".scan-row .pick-btn");
    await page.waitForFunction(() => document.querySelector(".scan-row .pick-btn").textContent.includes("เลือกแล้ว"));
    await page.click("[data-view='overview']");
    await page.waitForSelector(".metric-table");
    await page.reload({ waitUntil: "networkidle0" });
    await page.waitForSelector("body[data-hydrated='1']");
    assert.equal(await page.evaluate(() => localStorage.getItem("km-unrelated")), "keep-me");
    assert.equal(await page.$eval("#boot-error", (node) => node.hidden), true);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await stop(child);
  }
});
