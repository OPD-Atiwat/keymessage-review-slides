import { rates } from "./metrics.js";

export const SORT_KEYS = ["spend", "revenue", "roas", "chats", "costPerMsg", "cpm", "purchases", "cvrProxy", "aov"];

export function metricValue(ad, key) {
  if (key === "spend" || key === "revenue" || key === "chats" || key === "purchases") {
    if (ad[key] == null || !Number.isFinite(Number(ad[key]))) return null;
    return Number(ad[key]);
  }
  const value = rates(ad)[key];
  return value == null || !Number.isFinite(value) ? null : value;
}

function idOrder(a, b) {
  const left = Number(a.adId);
  const right = Number(b.adId);
  if (Number.isFinite(left) && Number.isFinite(right) && left !== right) return left - right;
  if (a.adId === b.adId) return 0;
  return a.adId < b.adId ? -1 : 1;
}

export function sortAds(rows, key = "spend", dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const left = metricValue(a, key);
    const right = metricValue(b, key);
    if (left == null || right == null) {
      if (left == null && right == null) return idOrder(a, b);
      return left == null ? 1 : -1;
    }
    if (left !== right) return (left - right) * sign;
    return idOrder(a, b);
  });
}

export function filterAds(rows, spec) {
  const key = spec?.key || "spend";
  const min = parseBound(spec?.min);
  const max = parseBound(spec?.max);
  if (!min.ok || !max.ok) return { ok: false, message: "ใส่ตัวเลขให้ถูก", rows };
  if (min.value != null && max.value != null && min.value > max.value) {
    return { ok: false, message: "ค่าต่ำสุดมากกว่าค่าสูงสุด", rows };
  }
  const scale = key === "cvrProxy" ? 100 : 1;
  const kept = rows.filter((ad) => {
    if (min.value == null && max.value == null) return true;
    const value = metricValue(ad, key);
    if (value == null) return false;
    const shown = value * scale;
    if (min.value != null && shown < min.value) return false;
    if (max.value != null && shown > max.value) return false;
    return true;
  });
  return { ok: true, message: "", rows: kept };
}

function parseBound(text) {
  if (text == null || String(text).trim() === "") return { ok: true, value: null };
  const value = Number(String(text).trim());
  if (!Number.isFinite(value)) return { ok: false, value: null };
  return { ok: true, value };
}
