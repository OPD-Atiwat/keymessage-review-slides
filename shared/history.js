import { changePct, metricTone } from "./conditional.js";
import { rates } from "./metrics.js";

/** Columns of the monthly overview. November is 1–8 only. */
export const OVERVIEW_MONTHS = [
  { id: "may", kind: "full", label: "พ.ค. 2569", short: "พ.ค." },
  { id: "jun", kind: "full", label: "มิ.ย. 2569", short: "มิ.ย." },
  { id: "jul", kind: "full", label: "ก.ค. 2569", short: "ก.ค." },
  { id: "aug", kind: "full", label: "ส.ค. 2569", short: "ส.ค." },
  { id: "sep", kind: "full", label: "ก.ย. 2569", short: "ก.ย." },
  { id: "oct", kind: "full", label: "ต.ค. 2569", short: "ต.ค." },
  { id: "nov1_8", kind: "partial", label: "1–8 พ.ย. 2569", short: "1–8 พ.ย.", through: "2026-11-08" },
];

/** Published months in this scoped snapshot. There is no separate 1–7 October column. */
export const VERIFIED_HISTORY = OVERVIEW_MONTHS;

export const OVERVIEW_METRICS = [
  { key: "spend", label: "Spend" },
  { key: "revenue", label: "Revenue" },
  { key: "roas", label: "ROAS" },
  { key: "chats", label: "Messages" },
  { key: "costPerMsg", label: "Cost per Message" },
  { key: "cpm", label: "CPM" },
  { key: "purchases", label: "Purchases" },
  { key: "cvrProxy", label: "CVR" },
  { key: "aov", label: "AOV" },
];

/** Same-length pair already inside the snapshot. Not a full-month comparison. */
export const MATCHED_PARTIAL = { id: "nov1_8", baseId: "oct1_8", baseLabel: "1–8 ต.ค. 2569" };

export const UNPUBLISHED_MONTHS = [];
export const EMPTY_BOOK_LABEL = "ไม่มีรายการที่ยืนยันได้";

export const HISTORY_WINDOW = 4;

export const SOURCE_CUTOFF = "2026-11-08";

/**
 * Every book-period row in the source bundle has mom_eligible false, including full months.
 * The published deck does not copy that flag. A full calendar month is not eligibility.
 */
export const MONTH_COMPARISON_OPEN = false;
const MONTH_CLOSED = "ชุดข้อมูลปิดการเทียบเดือนก่อน (mom_eligible เป็นเท็จทุกช่วง) ค่านี้เป็นยอดของเดือนนั้น";

export function visibleHistory(start = 0) {
  const max = Math.max(0, OVERVIEW_MONTHS.length - HISTORY_WINDOW);
  const safe = Math.max(0, Math.min(start, max));
  return { start: safe, max, items: OVERVIEW_MONTHS.slice(safe, safe + HISTORY_WINDOW) };
}

function readMetric(totals, metric) {
  if (!totals) return null;
  if (metric === "spend" || metric === "revenue" || metric === "chats" || metric === "purchases") return totals[metric];
  return rates(totals)[metric];
}

export function formatMetric(metric, value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  if (metric === "roas") return number.toFixed(2);
  if (metric === "cvrProxy") return (number * 100).toFixed(1) + "%";
  if (metric === "chats" || metric === "purchases") return Math.round(number).toLocaleString("en-US");
  return "฿" + Math.round(number).toLocaleString("en-US");
}

function lastValidFull(bookTotals, periodId, bookId) {
  const full = OVERVIEW_MONTHS.filter((item) => item.kind === "full");
  const index = full.findIndex((item) => item.id === periodId);
  for (let i = index - 1; i >= 0; i -= 1) {
    const row = totalsFor(bookTotals, full[i].id, bookId);
    if (row) return { spec: full[i], row };
  }
  return null;
}

export function metricCell(bookTotals, periodId, bookId, metric) {
  const spec = OVERVIEW_MONTHS.find((item) => item.id === periodId);
  if (!spec) return { text: "—", tone: "neutral", basis: "ไม่มีช่วงนี้ในชุดที่ยืนยัน" };
  const current = totalsFor(bookTotals, periodId, bookId);
  if (!current) return { text: "—", tone: "neutral", basis: EMPTY_BOOK_LABEL };
  const value = readMetric(current, metric);
  const text = formatMetric(metric, value);
  const tone = metricTone(metric, value, value);
  if (tone === "volume") return { text, tone: "volume", basis: "ปริมาณ ไม่ได้แปลว่าดีหรือด้อย" };
  if (!MONTH_COMPARISON_OPEN && spec.kind === "full") return { text, tone: "neutral", basis: MONTH_CLOSED };
  if (spec.kind === "partial") {
    if (periodId !== MATCHED_PARTIAL.id) return { text, tone: "neutral", basis: "ช่วงไม่ครบเดือน ไม่ได้เทียบเดือนเต็ม" };
    const base = totalsFor(bookTotals, MATCHED_PARTIAL.baseId, bookId);
    if (!base) return { text, tone: "neutral", basis: "ไม่มี 1–8 ต.ค. ในชุดนี้" };
    return {
      text,
      tone: metricTone(metric, value, readMetric(base, metric)),
      basis: `เทียบ ${MATCHED_PARTIAL.baseLabel} ของเล่มนี้ ไม่ใช่เกณฑ์กำไร`,
    };
  }
  const prior = lastValidFull(bookTotals, periodId, bookId);
  if (!prior) return { text, tone: "neutral", basis: "ไม่มีเดือนก่อนในชุดนี้" };
  return {
    text,
    tone: metricTone(metric, value, readMetric(prior.row, metric)),
    basis: `เทียบ ${prior.spec.label} ของเล่มนี้ ไม่ใช่เกณฑ์กำไร`,
  };
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
  if (!MONTH_COMPARISON_OPEN && spec.kind === "full") return trend(text, "neutral", MONTH_CLOSED, "ไม่เทียบ");
  if (spec.kind === "partial") {
    if (periodId !== MATCHED_PARTIAL.id) {
      return trend(text, "neutral", "ช่วงไม่ครบเดือน ไม่ได้เทียบเดือนเต็ม", "ไม่ได้เทียบเดือนเต็ม");
    }
    const base = totalsFor(bookTotals, MATCHED_PARTIAL.baseId, bookId);
    if (!base || rates(base).roas == null) {
      return trend(text, "neutral", "ไม่มี 1–8 ต.ค. ในชุดนี้", "ไม่มีฐาน 1–8 ต.ค.");
    }
    return trend(
      text,
      metricTone("roas", roas, rates(base).roas),
      `เทียบ ${MATCHED_PARTIAL.baseLabel} ของเล่มนี้ ไม่ใช่เกณฑ์กำไร`,
      "เทียบ 1–8 ต.ค.",
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
  if (!MONTH_COMPARISON_OPEN && spec.kind === "full") return { text: "—", tone: "neutral", basis: MONTH_CLOSED };
  let previous = null;
  let basis = "";
  if (spec.kind === "partial") {
    if (periodId !== MATCHED_PARTIAL.id) {
      return { text: "—", tone: "neutral", basis: "ช่วงไม่ครบเดือน ไม่ได้เทียบเดือนเต็ม" };
    }
    previous = totalsFor(bookTotals, MATCHED_PARTIAL.baseId, bookId);
    basis = `เทียบ ${MATCHED_PARTIAL.baseLabel}`;
    if (!previous) return { text: "—", tone: "neutral", basis: "ไม่มี 1–8 ต.ค. ในชุดนี้" };
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
