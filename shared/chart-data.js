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
      creator: ad.creatorTag || "",
      spend,
      revenue: ad.revenue,
      chats: ad.chats,
      purchases: ad.purchases,
      roas: rate.roas,
      plot: spend != null && rate.roas != null,
    };
  });
}

export function niceStep(span, target = 4) {
  const rough = Math.abs(span) / target || 1;
  const pow = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 2.5, 5, 10].map((multiplier) => multiplier * pow).find((step) => span / step <= target + 1) || rough;
}

export function formatSpendTick(value) {
  if (value === 0) return "฿0";
  if (value % 1000 === 0) return `฿${value / 1000}k`;
  if (value >= 1000) return `฿${(value / 1000).toFixed(1)}k`;
  return `฿${Math.round(value)}`;
}

export function axisTicks(min, max, target = 4) {
  const step = niceStep(max - min, target);
  const start = Math.ceil((min - step * 1e-9) / step) * step;
  const ticks = [];
  for (let value = start; value <= max + step * 1e-6; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return ticks;
}

export function scatterLayout(points, baseline, width = 640, height = 320) {
  const plot = points.filter((point) => point.plot);
  const spends = plot.map((point) => point.spend);
  const roases = plot.map((point) => point.roas).concat(baseline == null ? [] : [baseline]);
  const rawX = Math.max(0, ...spends, 0);
  const rawY = Math.max(0, ...roases, 0);
  const xMax = rawX === 0 ? 1 : rawX * 1.1;
  const yMin = 0;
  const yMax = rawY === 0 ? 1 : rawY * 1.1;
  const padL = 52;
  const padR = 16;
  const padT = 28;
  const padB = 44;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = Math.max(1, height - padT - padB);
  const xOf = (spend) => padL + (spend / xMax) * innerW;
  const yOf = (roas) => padT + (1 - (roas - yMin) / (yMax - yMin)) * innerH;
  const xTicks = axisTicks(0, xMax, 4).filter((value) => value >= 0 && value <= xMax + 1e-6);
  const yTicks = axisTicks(yMin, yMax, 4);
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
    baseline,
    baseY: baseline == null ? null : yOf(baseline),
    xTicks: xTicks.map((value) => ({ value, label: formatSpendTick(value), x: xOf(value) })),
    yTicks: yTicks.map((value) => ({ value, label: Number(value.toFixed(2)).toString(), y: yOf(value) })),
    dots: plot.map((point) => ({ ...point, x: xOf(point.spend), y: yOf(point.roas) })),
  };
}

/** Shared axis from zero. ROAS may use 0–2.5 only when every point fits. Other metrics never inherit that ceiling. */
export function trendScale(values, key) {
  const finite = values.filter((value) => value != null && Number.isFinite(value));
  const dataMax = finite.length ? Math.max(...finite) : 0;
  let max;
  if (key === "roas" && dataMax <= 2.5) max = 2.5;
  else {
    const padded = dataMax === 0 ? 1 : dataMax * 1.1;
    const step = niceStep(padded, 4);
    max = Math.ceil((padded - 1e-9) / step) * step;
    if (!(max > dataMax)) max = padded;
  }
  const ticks = axisTicks(0, max, 4).filter((value) => value >= -1e-9 && value <= max + 1e-6);
  if (!ticks.length || ticks[0] > 0) ticks.unshift(0);
  return { min: 0, max, ticks };
}

export function formatAxisTick(key, value) {
  if (key === "roas") {
    const text = Number(value.toFixed(2));
    return text.toString();
  }
  if (key === "cvrProxy") return `${Math.round(value * 100)}%`;
  if (key === "chats" || key === "purchases") {
    if (Math.abs(value) >= 1000) return `${Math.round(value / 100) / 10}k`;
    return String(Math.round(value));
  }
  return formatSpendTick(value);
}
