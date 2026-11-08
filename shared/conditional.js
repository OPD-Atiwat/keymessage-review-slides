/** Visual comparison only. Not a budget rule and not a live-ad instruction. */

export function changePct(current, previous) {
  if (previous == null || Number(previous) === 0) {
    if (current == null || Number(current) === 0) return { text: "—", comparable: false };
    return { text: "ใหม่/ไม่มีฐาน", comparable: false };
  }
  if (current == null || !Number.isFinite(Number(current))) return { text: "—", comparable: false };
  const pct = ((Number(current) - Number(previous)) / Number(previous)) * 100;
  if (!Number.isFinite(pct)) return { text: "—", comparable: false };
  return { text: (pct > 0 ? "+" : "") + pct.toFixed(1) + "%", comparable: true, pct };
}

/** Same-length pairs only. November-to-date is not compared with a full month. */
export function sameLengthBase(reportId) {
  if (reportId === "oct") return "sep";
  if (reportId === "nov1_7") return "oct1_7";
  return null;
}

/** Compared at the same precision the table prints, so a rounded tie is not a color. */
export function roundMetric(metric, value) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  const number = Number(value);
  if (metric === "roas") return Number(number.toFixed(2));
  if (metric === "cvrProxy") return Number((number * 100).toFixed(1));
  if (metric === "costPerMsg" || metric === "cpm" || metric === "aov") return Math.round(number);
  return number;
}

const HIGHER_BETTER = new Set(["roas", "cvrProxy", "aov"]);
const LOWER_BETTER = new Set(["costPerMsg", "cpm"]);
const VOLUME = new Set(["spend", "revenue", "chats", "purchases", "impressions"]);

export const TONE_LABEL = {
  better: "ดีกว่าค่าเฉลี่ยเล่ม",
  worse: "ด้อยกว่าค่าเฉลี่ยเล่ม",
  neutral: "ใกล้เคียง/ไม่มีฐานเปรียบเทียบ",
  volume: "ปริมาณ ไม่ได้แปลว่าดีหรือด้อย",
  baseline: "ฐานของเล่มนี้ ไม่ได้จัดอันดับข้ามเล่ม",
};

export function metricTone(metric, value, baseline) {
  if (VOLUME.has(metric)) return "volume";
  if (!HIGHER_BETTER.has(metric) && !LOWER_BETTER.has(metric)) return "neutral";
  const left = roundMetric(metric, value);
  const right = roundMetric(metric, baseline);
  if (left == null || right == null) return "neutral";
  if (left === right) return "neutral";
  const above = left > right;
  if (HIGHER_BETTER.has(metric)) return above ? "better" : "worse";
  return above ? "worse" : "better";
}
