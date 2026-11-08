import { readFileSync } from "node:fs";
import { hashPassword } from "./security.js";

const password = readFileSync(0, "utf8").replace(/\r?\n$/, "");
if (password.length < 10) {
  console.error("รหัสผ่านสั้นเกิน (อย่างน้อย 10 ตัว) — ไม่พิมพ์รหัสออกมา");
  process.exit(1);
}
process.stdout.write(hashPassword(password) + "\n");
