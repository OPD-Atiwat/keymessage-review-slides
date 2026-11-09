export const REPORT_PERIODS = ["may", "jun", "jul", "aug", "sep", "oct", "oct1_7", "nov1_7", "nov1_8"];

export function analysisItemId(period, adId) {
  return `${period}:${adId}`;
}

export function parseAnalysisItemId(itemId) {
  const text = String(itemId || "");
  const split = text.indexOf(":");
  if (split <= 0) return null;
  const period = text.slice(0, split);
  const adId = text.slice(split + 1);
  if (!REPORT_PERIODS.includes(period) || !/^\d+$/.test(adId)) return null;
  return { period, adId };
}
