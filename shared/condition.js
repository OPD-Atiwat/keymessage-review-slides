import { rates, sumTotals } from "./metrics.js";
import { OVERVIEW_MONTHS, totalsFor } from "./history.js";

const FULL_MONTHS = ["may", "jun", "jul", "aug", "sep", "oct"];
const RATIOS = new Set(["roas", "costPerMsg", "cpm", "cvrProxy", "aov"]);
const HIGHER = new Set(["revenue", "roas", "chats", "purchases", "cvrProxy", "aov"]);
const LOWER = new Set(["costPerMsg", "cpm"]);

export function readMetric(row, metric) {
  if (!row) return null;
  if (metric === "spend" || metric === "revenue" || metric === "chats" || metric === "purchases" || metric === "impressions") {
    const value = Number(row[metric]);
    return Number.isFinite(value) ? value : null;
  }
  const value = rates(row)[metric];
  return value == null || !Number.isFinite(value) ? null : value;
}

/** Full months that have a total. Ratios use the summed months. Volumes use the monthly mean. */
export function monthBaseline(bookTotals, bookId) {
  const rows = FULL_MONTHS.map((id) => totalsFor(bookTotals, id, bookId)).filter(Boolean);
  if (!rows.length) return null;
  const sum = sumTotals(rows);
  const rate = rates(sum);
  const n = rows.length;
  return {
    n,
    revenue: sum.revenue / n,
    chats: sum.chats / n,
    purchases: sum.purchases / n,
    roas: rate.roas,
    costPerMsg: rate.costPerMsg,
    cpm: rate.cpm,
    cvrProxy: rate.cvrProxy,
    aov: rate.aov,
  };
}

/** More than 5% past the baseline. Exactly 5% stays near. Spend is never judged. */
export function conditionTone(metric, value, baseline) {
  if (metric === "spend") return "plain";
  if (value == null || !Number.isFinite(Number(value))) return "empty";
  if (baseline == null || !Number.isFinite(Number(baseline)) || Number(baseline) === 0) return "plain";
  const ratio = Number(value) / Number(baseline);
  if (HIGHER.has(metric)) {
    if (ratio > 1.05) return "better";
    if (ratio < 0.95) return "worse";
    return "near";
  }
  if (LOWER.has(metric)) {
    if (ratio < 0.95) return "better";
    if (ratio > 1.05) return "worse";
    return "near";
  }
  return "plain";
}

export function overviewCondition(bookTotals, periodId, bookId, metric, text) {
  const spec = OVERVIEW_MONTHS.find((item) => item.id === periodId);
  const current = totalsFor(bookTotals, periodId, bookId);
  if (!spec || !current) return { tone: "empty", basis: "ไม่มีรายการที่ยืนยันได้" };
  const value = readMetric(current, metric);
  if (metric === "spend") return { tone: "plain", basis: "Spend ไม่ได้ลงสี" };
  if (value == null) return { tone: "empty", basis: "ไม่มีตัวหาร" };
  if (spec.kind === "partial" && !RATIOS.has(metric)) {
    return { tone: "plain", basis: "เดือนไม่เต็ม ไม่ลงสีปริมาณ" };
  }
  const base = monthBaseline(bookTotals, bookId);
  if (!base) return { tone: "plain", basis: "ไม่มีเดือนเต็มของเล่มนี้" };
  const tone = conditionTone(metric, value, base[metric]);
  return { tone, basis: `เทียบค่าเฉลี่ย ${base.n} เดือนเต็มของเล่มนี้. ${text || ""}`.trim() };
}

/** Ad rows use this book's selected-period total. Volume is the mean ad, so one ad is not compared with the whole-book sum. */
export function periodAdBaseline(bookTotal) {
  if (!bookTotal || !bookTotal.n) return null;
  const rate = rates(bookTotal);
  const n = Number(bookTotal.n);
  return {
    n,
    revenue: bookTotal.revenue / n,
    chats: bookTotal.chats / n,
    purchases: bookTotal.purchases / n,
    roas: rate.roas,
    costPerMsg: rate.costPerMsg,
    cpm: rate.cpm,
    cvrProxy: rate.cvrProxy,
    aov: rate.aov,
  };
}
