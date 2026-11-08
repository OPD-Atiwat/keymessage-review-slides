import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync } from "node:fs";

const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
if (password.length < 10) {
  console.error("รหัสผ่านสั้นเกิน (อย่างน้อย 10 ตัว) — ไม่พิมพ์รหัสออกมา");
  process.exit(1);
}
const N = 16384;
const r = 8;
const p = 1;
const salt = randomBytes(16);
const key = scryptSync(password, salt, 32, { N, r, p });
process.stdout.write(`scrypt$${N}$${r}$${p}$${salt.toString("hex")}$${key.toString("hex")}\n`);
