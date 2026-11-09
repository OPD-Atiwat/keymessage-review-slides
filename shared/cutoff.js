/** Performance metrics stop at yesterday in Asia/Bangkok. Never today's partial day. */

export const BANGKOK = "Asia/Bangkok";

export function bangkokDateParts(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BANGKOK,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const pick = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: pick("year"), month: pick("month"), day: pick("day") };
}

export function shiftDate(parts, days) {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  utc.setUTCDate(utc.getUTCDate() + days);
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export function isoDate(parts) {
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `${parts.year}-${month}-${day}`;
}

/** Last complete performance day. Uses the Bangkok calendar, not the UTC date. */
export function performanceThrough(now = new Date()) {
  return shiftDate(bangkokDateParts(now), -1);
}

export function performanceThroughIso(now = new Date()) {
  return isoDate(performanceThrough(now));
}

/** This release's frozen metrics. November performance is 1–8. Status checks are separate. */
export const FROZEN_PERFORMANCE = {
  timezone: BANGKOK,
  through: "2026-11-08",
  throughLabel: "ผลลัพธ์ถึง 8 พ.ย. 2569",
  novMtdLabel: "1–8 พ.ย. 2569 (ยังไม่ครบเดือน)",
  rule: "ชุดนี้รวมถึง 8 พ.ย. 2569 ตามเวลาไทย และไม่รวมวันที่ 9 ที่ยังไม่จบวัน",
};
