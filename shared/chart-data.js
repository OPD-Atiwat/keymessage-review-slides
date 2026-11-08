import { rates } from "./metrics.js";

/** Full months only. 1–7 November is a different comparison and is not on this axis. */
export const TREND_MONTHS = [
  { id: "may", short: "พ.ค." },
  { id: "jun", short: "มิ.ย." },
  { id: "jul", short: "ก.ค." },
  { id: "aug", short: "ส.ค." },
  { id: "sep", short: "ก.ย." },
  { id: "oct", short: "ต.ค." },
];

export const CHART_METRICS = [
  { key: "roas", label: "ROAS", zero: false },
  { key: "costPerMsg", label: "Cost per Message", zero: false },
  { key: "spend", label: "Spend", zero: true },
  { key: "revenue", label: "Revenue", zero: true },
];

export function bookMetric(totals, key) {
  if (!totals || totals.spend == null || totals.revenue == null) return null;
  if (key === "spend") return Number(totals.spend);
  if (key === "revenue") return Number(totals.revenue);
  const value = rates(totals)[key];
  return value == null || !Number.isFinite(value) ? null : value;
}

export function formatChartValue(key, value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const number = Number(value);
  if (key === "roas") return number.toFixed(2);
  if (key === "cvrProxy") return (number * 100).toFixed(1) + "%";
  if (key === "chats" || key === "purchases") return Math.round(number).toLocaleString("en-US");
  return "฿" + Math.round(number).toLocaleString("en-US");
}

export function trendSeries(bookTotals, bookId, key) {
  return TREND_MONTHS.map((month) => ({
    id: month.id,
    short: month.short,
    value: bookMetric(bookTotals?.[month.id]?.[bookId], key),
  }));
}

export function trendSegments(series) {
  const segments = [];
  let current = [];
  for (const point of series) {
    if (point.value == null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(point);
  }
  if (current.length) segments.push(current);
  return segments;
}

export function periodSeries(bookTotals, periodId, books, key) {
  return books.map(([id, name]) => ({
    id,
    name,
    value: bookMetric(bookTotals?.[periodId]?.[id], key),
  }));
}

export function scatterPoints(ads) {
  return ads.map((ad) => {
    const rate = rates(ad);
    const spend = ad.spend == null || !Number.isFinite(Number(ad.spend)) ? null : Number(ad.spend);
    return {
      adId: ad.adId,
      name: ad.adName,
      spend,
      revenue: ad.revenue,
      chats: ad.chats,
      purchases: ad.purchases,
      roas: rate.roas,
      plot: spend != null && rate.roas != null,
    };
  });
}

export function scatterLayout(points, baseline, width = 640, height = 220) {
  const plot = points.filter((point) => point.plot);
  const spends = plot.map((point) => point.spend);
  const roases = plot.map((point) => point.roas).concat(baseline == null ? [] : [baseline]);
  const xMax = Math.max(1, ...spends, 0) * 1.08;
  let yMin = Math.min(0, ...roases);
  let yMax = Math.max(0, ...roases);
  if (yMin === yMax) {
    yMin -= 0.2;
    yMax += 0.2;
  } else {
    const pad = (yMax - yMin) * 0.14;
    yMin -= pad;
    yMax += pad;
  }
  const padL = 44;
  const padR = 16;
  const padT = 18;
  const padB = 32;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = Math.max(1, height - padT - padB);
  const xOf = (spend) => padL + (spend / xMax) * innerW;
  const yOf = (roas) => padT + (1 - (roas - yMin) / (yMax - yMin)) * innerH;
  return {
    width,
    height,
    padL,
    padR,
    padT,
    padB,
    xMax,
    yMin,
    yMax,
    baseY: baseline == null ? null : yOf(baseline),
    dots: plot.map((point) => ({ ...point, x: xOf(point.spend), y: yOf(point.roas) })),
  };
}
