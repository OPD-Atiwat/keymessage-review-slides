import { changePct, metricTone } from "./conditional.js";
import { rates } from "./metrics.js";

/** Months present in the frozen 8 Nov 2026 snapshot. May–August are not in this file. */
export const VERIFIED_HISTORY = [
  { id: "sep", kind: "full", label: "ก.ย. 2569", short: "ก.ย." },
  { id: "oct", kind: "full", label: "ต.ค. 2569", short: "ต.ค." },
  { id: "nov1_7", kind: "partial", label: "1–7 พ.ย. 2569", short: "1–7 พ.ย.", through: "2026-11-07" },
];

/** Same-length pair already inside the snapshot. Not a full-month comparison. */
export const MATCHED_PARTIAL = { id: "nov1_7", baseId: "oct1_7", baseLabel: "1–7 ต.ค. 2569" };

export const UNPUBLISHED_MONTHS = ["พ.ค. 2569", "มิ.ย. 2569", "ก.ค. 2569", "ส.ค. 2569"];

export const HISTORY_WINDOW = 4;

export const SOURCE_CUTOFF = "2026-11-07";

export function visibleHistory(start = 0) {
  const max = Math.max(0, VERIFIED_HISTORY.length - HISTORY_WINDOW);
  const safe = Math.max(0, Math.min(start, max));
  return { start: safe, max, items: VERIFIED_HISTORY.slice(safe, safe + HISTORY_WINDOW) };
}

export function totalsFor(bookTotals, periodId, bookId) {
  const row = bookTotals?.[periodId]?.[bookId];
  if (!row || row.spend == null || row.revenue == null) return null;
  return row;
}

function fullPrior(periodId) {
  const full = VERIFIED_HISTORY.filter((item) => item.kind === "full");
  const index = full.findIndex((item) => item.id === periodId);
  return index > 0 ? full[index - 1] : null;
}

function trend(text, tone, basis, short) {
  return { text, tone, basis, short };
}

export function roasTrend(bookTotals, periodId, bookId) {
  const spec = VERIFIED_HISTORY.find((item) => item.id === periodId);
  if (!spec) return trend("—", "neutral", "ไม่มีช่วงนี้ในชุดที่ยืนยัน", "—");
  const current = totalsFor(bookTotals, periodId, bookId);
  if (!current) return trend("—", "neutral", "ไม่มียอดในช่วงนี้", "—");
  const roas = rates(current).roas;
  const text = roas == null ? "—" : roas.toFixed(2);
  if (spec.kind === "partial") {
    if (periodId !== MATCHED_PARTIAL.id) {
      return trend(text, "neutral", "ช่วงไม่ครบเดือน ไม่เทียบทั้งเดือน", "ไม่เทียบทั้งเดือน");
    }
    const base = totalsFor(bookTotals, MATCHED_PARTIAL.baseId, bookId);
    if (!base || rates(base).roas == null) {
      return trend(text, "neutral", "ไม่มี 1–7 ต.ค. ในชุดนี้", "ไม่มีฐาน 1–7 ต.ค.");
    }
    return trend(
      text,
      metricTone("roas", roas, rates(base).roas),
      `เทียบ ${MATCHED_PARTIAL.baseLabel} ของเล่มนี้ ไม่ใช่เกณฑ์กำไร`,
      "เทียบ 1–7 ต.ค.",
    );
  }
  const prior = fullPrior(periodId);
  if (!prior) return trend(text, "neutral", "ไม่มีเดือนก่อนในชุดนี้", "ไม่มีเดือนก่อน");
  const previous = totalsFor(bookTotals, prior.id, bookId);
  if (!previous || rates(previous).roas == null) {
    return trend(text, "neutral", "ไม่มีเดือนก่อนของเล่มนี้", "ไม่มีฐานเดือนก่อน");
  }
  return trend(
    text,
    metricTone("roas", roas, rates(previous).roas),
    `เทียบ ${prior.label} ของเล่มนี้ ไม่ใช่เกณฑ์กำไร`,
    `เทียบ ${prior.short}`,
  );
}

export function revenueTrend(bookTotals, periodId, bookId) {
  const spec = VERIFIED_HISTORY.find((item) => item.id === periodId);
  if (!spec) return { text: "—", tone: "neutral", basis: "ไม่มีช่วงนี้ในชุดที่ยืนยัน" };
  const current = totalsFor(bookTotals, periodId, bookId);
  if (!current) return { text: "—", tone: "neutral", basis: "ไม่มียอดในช่วงนี้" };
  let previous = null;
  let basis = "";
  if (spec.kind === "partial") {
    if (periodId !== MATCHED_PARTIAL.id) {
      return { text: "—", tone: "neutral", basis: "ช่วงไม่ครบเดือน ไม่เทียบทั้งเดือน" };
    }
    previous = totalsFor(bookTotals, MATCHED_PARTIAL.baseId, bookId);
    basis = `เทียบ ${MATCHED_PARTIAL.baseLabel}`;
    if (!previous) return { text: "—", tone: "neutral", basis: "ไม่มี 1–7 ต.ค. ในชุดนี้" };
  } else {
    const prior = fullPrior(periodId);
    if (!prior) return { text: "—", tone: "neutral", basis: "ไม่มีเดือนก่อนในชุดนี้" };
    previous = totalsFor(bookTotals, prior.id, bookId);
    basis = `เทียบ ${prior.label}`;
    if (!previous) return { text: "—", tone: "neutral", basis: "ไม่มีเดือนก่อนของเล่มนี้" };
  }
  const change = changePct(current.revenue, previous.revenue);
  if (!change.comparable) return { text: change.text, tone: "neutral", basis };
  const tone = change.pct > 0 ? "better" : change.pct < 0 ? "worse" : "neutral";
  return { text: change.text, tone, basis: `${basis} รายได้` };
}
