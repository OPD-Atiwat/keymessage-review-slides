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

export function metricTone(metric, value, baseline) {
  if (value == null || baseline == null || !Number.isFinite(value) || !Number.isFinite(baseline)) return "neutral";
  if (metric === "roas") {
    if (value > baseline) return "better";
    if (value < baseline) return "worse";
    return "neutral";
  }
  if (metric === "costPerMsg" || metric === "cpm") {
    if (value < baseline) return "better";
    if (value > baseline) return "worse";
    return "neutral";
  }
  return "neutral";
}
