import {
  CHART_METRICS,
  bookMetric,
  formatAxisTick,
  formatChartValue,
  periodSeries,
  scatterLayout,
  scatterPoints,
  trendScale,
  trendSegments,
  trendSeries,
} from "/shared/chart-data.js?v=20261109t110";
import { metricCell } from "/shared/history.js?v=20261109t110";

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function svgEl(tag, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

export function renderTrendChart(parent, opts) {
  const metric = CHART_METRICS.find((item) => item.key === (opts.chartMetric || "roas")) || CHART_METRICS[0];
  const section = el("section", "chart-block trend-block");
  const head = el("div", "chart-head");
  head.append(el("h3", "", `${metric.label} แต่ละเล่ม · พ.ค.–ต.ค. 2569`));
  head.append(metricSelect(opts));
  section.append(head);
  section.append(el("p", "chart-note", "เดือนเต็ม พ.ค.–ต.ค. ใช้สเกลเดียวกัน เริ่มที่ 0 เส้นไม่ลากข้ามเดือนที่ไม่มีรายการ และไม่รวม 1–7 พ.ย. ไม่ได้เทียบเดือนก่อน เพราะชุดข้อมูลปิดการเทียบนี้ไว้ทุกช่วง"));
  const readout = el("p", "scatter-readout", "เลือกจุดเพื่อดูเดือน Spend และ Revenue");
  const grid = el("div", "trend-grid");
  const all = opts.books.map(([id]) => trendSeries(opts.deck.bookTotals, id, metric.key));
  const scale = trendScale(all.flat().map((point) => point.value), metric.key);
  const tableRows = [];
  for (const [id, name] of opts.books) {
    const series = trendSeries(opts.deck.bookTotals, id, metric.key).map((point) => ({
      ...point,
      spend: bookMetric(opts.deck.bookTotals?.[point.id]?.[id], "spend"),
      revenue: bookMetric(opts.deck.bookTotals?.[point.id]?.[id], "revenue"),
    }));
    const latest = metricCell(opts.deck.bookTotals, "oct", id, metric.key);
    const panel = el("article", "chart-panel");
    const title = el("div", "trend-panel-head");
    title.append(el("h4", "", name));
    const now = el("p", "trend-now");
    now.append(el("b", "cell-neutral", latest.text));
    now.append(el("span", "", "ต.ค. 2569"));
    title.append(now);
    panel.append(title);
    panel.append(trendSvg(series, scale, metric, readout, (periodId) => opts.onInspect && opts.onInspect(id, periodId)));
    grid.append(panel);
    tableRows.push([name, ...series.map((point) => formatChartValue(metric.key, point.value))]);
  }
  section.append(grid, readout);
  section.append(sectionTable(["เล่ม", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค."], tableRows));
  parent.append(section);
}

export function renderPeriodChart(parent, opts) {
  const metric = CHART_METRICS.find((item) => item.key === (opts.chartMetric || "roas")) || CHART_METRICS[0];
  const series = periodSeries(opts.deck.bookTotals, opts.reportId, opts.books, metric.key);
  const lower = metric.key === "costPerMsg" || metric.key === "cpm";
  series.sort((a, b) => {
    if (a.value == null || b.value == null) {
      if (a.value == null && b.value == null) return a.name.localeCompare(b.name, "th");
      return a.value == null ? 1 : -1;
    }
    if (a.value !== b.value) return (a.value - b.value) * (lower ? 1 : -1);
    return a.name.localeCompare(b.name, "th");
  });
  const section = el("section", "chart-block");
  const head = el("div", "chart-head");
  head.append(el("h3", "", `${metric.label} ของ 4 เล่ม · ${opts.periodLabel}`));
  head.append(metricSelect(opts));
  section.append(head);
  const partial = opts.reportId === "nov1_7" ? `${opts.periodLabel} ไม่ใช่เดือนเต็ม. ` : "";
  const note = metric.key === "revenue"
    ? partial + "รายได้ที่ Meta นับให้แอด (omni_purchase) ไม่ใช่ยอดขาย BEP และไม่ใช่เกณฑ์กำไร"
    : partial + "แท่งเริ่มที่ 0 เรียงตามเมตริกที่เลือก ไม่ได้บอกว่าเล่มไหนกำไร";
  section.append(el("p", "chart-note", note));
  const finite = series.map((item) => item.value).filter((value) => value != null && Number.isFinite(value));
  const axisMax = finite.length ? Math.max(...finite) : 1;
  const scale = trendScale(finite.length ? finite : [0], metric.key);
  const list = el("div", "period-chart");
  const axis = el("div", "period-axis");
  axis.append(el("span", "period-axis-gap", ""));
  const ticks = el("span", "period-axis-ticks");
  for (const tick of scale.ticks) {
    const mark = el("span", "", formatAxisTick(metric.key, tick));
    mark.style.left = `${axisMax === 0 ? 0 : (tick / scale.max) * 100}%`;
    ticks.append(mark);
  }
  axis.append(ticks);
  list.append(axis);
  for (const item of series) {
    const row = el("button", "period-row");
    row.type = "button";
    row.addEventListener("click", () => opts.onInspect && opts.onInspect(item.id, opts.reportId));
    const name = el("span", "period-name", item.name);
    if (opts.reportId === "nov1_7") name.append(el("small", "period-partial", "ไม่เต็มเดือน"));
    row.append(name);
    const slot = el("span", "period-slot");
    const share = item.value == null || scale.max === 0 ? 0 : Math.max(0, item.value / scale.max);
    slot.style.setProperty("--p", String(share));
    slot.append(el("i", "period-bar"));
    slot.append(el("span", "period-value", formatChartValue(metric.key, item.value)));
    if (metric.key !== "spend") {
      const spend = bookMetric(opts.deck.bookTotals?.[opts.reportId]?.[item.id], "spend");
      slot.append(el("span", "period-spend", `Spend ${formatChartValue("spend", spend)}`));
    }
    row.append(slot);
    list.append(row);
  }
  section.append(list);
  section.append(sectionTable(["เล่ม", metric.label], series.map((item) => [item.name, formatChartValue(metric.key, item.value)])));
  parent.append(section);
}

export function renderScatter(parent, ads, baseline, opts) {
  const points = scatterPoints(ads);
  const layout = scatterLayout(points, baseline, 640, 320);
  const section = el("section", "chart-block scatter-block");
  section.append(el("h3", "", "Spend กับ ROAS ของแอดในช่วงนี้"));
  section.append(el("p", "chart-note", `เส้นประคือ ROAS ทั้งเล่ม ${baseline == null ? "—" : baseline.toFixed(2)} จากยอดที่ไม่ได้กรอง จุดสีกรมท่าอยู่เหนือเส้น จุดสีลาเวนเดอร์อยู่ใต้เส้น และสูงกว่าเส้นไม่แปลว่ากำไร`));
  const host = el("div", "scatter-host");
  const svg = svgEl("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, class: "chart scatter-chart", role: "img" });
  svg.append(svgEl("line", { x1: layout.padL, y1: layout.height - layout.padB, x2: layout.width - layout.padR, y2: layout.height - layout.padB, class: "chart-axis" }));
  svg.append(svgEl("line", { x1: layout.padL, y1: layout.padT, x2: layout.padL, y2: layout.height - layout.padB, class: "chart-axis" }));
  if (layout.baseY != null) {
    svg.append(svgEl("line", { x1: layout.padL, y1: layout.baseY, x2: layout.width - layout.padR, y2: layout.baseY, class: "chart-base" }));
    const labelY = layout.baseY < layout.padT + 16 ? layout.baseY + 14 : layout.baseY - 6;
    const baseLabel = svgEl("text", { x: layout.padL + 6, y: labelY, class: "chart-base-label" });
    baseLabel.textContent = `ROAS ทั้งเล่ม ${baseline.toFixed(2)}`;
    svg.append(baseLabel);
  }
  for (const tick of layout.xTicks) {
    const label = svgEl("text", { x: tick.x, y: layout.height - layout.padB + 14, class: "chart-tick x-tick", "text-anchor": "middle" });
    label.textContent = tick.label;
    svg.append(label);
  }
  for (const tick of layout.yTicks) {
    const label = svgEl("text", { x: layout.padL - 6, y: tick.y + 4, class: "chart-tick y-tick", "text-anchor": "end" });
    label.textContent = tick.label;
    svg.append(label);
  }
  const xLabel = svgEl("text", { x: layout.width / 2, y: layout.height - 6, class: "chart-axis-label", "text-anchor": "middle" });
  xLabel.textContent = "Spend";
  svg.append(xLabel);
  const yLabel = svgEl("text", { x: 14, y: 14, class: "chart-axis-label" });
  yLabel.textContent = "ROAS";
  svg.append(yLabel);
  const labeled = scatterCallouts(layout.dots);
  for (const dot of layout.dots) {
    const button = el("button", "scatter-hit");
    button.type = "button";
    button.style.left = `${(dot.x / layout.width) * 100}%`;
    button.style.top = `${(dot.y / layout.height) * 100}%`;
    button.dataset.adId = dot.adId;
    button.setAttribute("aria-label", `${dot.name} Spend ${formatChartValue("spend", dot.spend)} Revenue ${formatChartValue("revenue", dot.revenue)} Messages ${formatChartValue("chats", dot.chats)} Purchases ${formatChartValue("purchases", dot.purchases)} ROAS ${formatChartValue("roas", dot.roas)}`);
    button.addEventListener("click", () => locateRow(dot.adId));
    button.addEventListener("focus", () => showReadout(readout, dot));
    host.append(button);
    const above = baseline != null && dot.roas >= baseline;
    svg.append(svgEl("circle", { cx: dot.x, cy: dot.y, r: 4, class: above || baseline == null ? "scatter-dot" : "scatter-dot below" }));
  }
  const placed = [];
  for (const dot of labeled) {
    let x = dot.x + 8;
    let y = dot.y - 8;
    let anchor = "start";
    if (x > layout.width - 70) {
      x = dot.x - 8;
      anchor = "end";
    }
    if (placed.some((item) => Math.abs(item.x - x) < 48 && Math.abs(item.y - y) < 14)) y += 14;
    if (y < 12) y = dot.y + 14;
    placed.push({ x, y });
    const text = svgEl("text", { x, y, class: "scatter-callout", "text-anchor": anchor });
    text.textContent = dot.creator || "ไม่มีป้าย";
    svg.append(text);
  }
  host.append(svg);
  const readout = el("p", "scatter-readout", "กดจุดเพื่อดูชื่อและตัวเลข และไฮไลต์แถวในตาราง");
  section.append(host, readout);
  const skipped = points.length - layout.dots.length;
  if (skipped) section.append(el("p", "chart-note", `ไม่ลงจุด ${skipped} แอดที่หาร ROAS ไม่ได้`));
  parent.append(section);
}

function locateRow(adId) {
  document.querySelectorAll(".scan-row.is-located").forEach((node) => node.classList.remove("is-located"));
  const row = document.querySelector(`.scan-row[data-ad-id="${adId}"]`);
  if (!row) return;
  row.classList.add("is-located");
  row.scrollIntoView({ block: "nearest" });
}

function showReadout(node, dot) {
  node.textContent = `${dot.name} · Spend ${formatChartValue("spend", dot.spend)} · Revenue ${formatChartValue("revenue", dot.revenue)} · Messages ${formatChartValue("chats", dot.chats)} · Purchases ${formatChartValue("purchases", dot.purchases)} · ROAS ${formatChartValue("roas", dot.roas)}`;
}

function metricSelect(opts) {
  const select = document.createElement("select");
  select.className = "chart-metric";
  select.setAttribute("aria-label", "เมตริกของกราฟภาพรวม");
  for (const item of CHART_METRICS) select.append(new Option(item.label, item.key));
  select.value = opts.chartMetric || "roas";
  select.addEventListener("change", () => opts.onChartMetric(select.value));
  return select;
}

function trendSvg(series, scale, metric, readout, onPoint) {
  const width = 320;
  const height = 160;
  const padL = 36;
  const padR = 28;
  const padT = 16;
  const padB = 22;
  const min = scale.min;
  const max = scale.max;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xOf = (index) => padL + (series.length === 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
  const yOf = (value) => padT + (1 - (value - min) / (max - min || 1)) * innerH;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart trend-chart" });
  for (const tick of scale.ticks) {
    const y = yOf(tick);
    svg.append(svgEl("line", { x1: padL, y1: y, x2: width - padR, y2: y, class: "trend-gridline" }));
    const label = svgEl("text", { x: 2, y: y + 3, class: "chart-tick trend-y" });
    label.textContent = formatAxisTick(metric.key, tick);
    svg.append(label);
  }
  for (const segment of trendSegments(series)) {
    if (segment.length < 2) continue;
    const d = segment.map((point) => {
      const index = series.findIndex((item) => item.id === point.id);
      return `${xOf(index)},${yOf(point.value)}`;
    }).join(" ");
    svg.append(svgEl("polyline", { points: d, class: "trend-line" }));
  }
  series.forEach((point, index) => {
    const label = svgEl("text", { x: xOf(index), y: height - 4, class: "chart-tick", "text-anchor": "middle" });
    label.textContent = point.short;
    svg.append(label);
    if (point.value == null) return;
    const dot = svgEl("circle", { cx: xOf(index), cy: yOf(point.value), r: 3, class: "trend-dot" });
    dot.setAttribute("role", "button");
    dot.setAttribute("tabindex", "0");
    const summary = `${point.short} ${metric.label} ${formatChartValue(metric.key, point.value)} Spend ${formatChartValue("spend", point.spend)} Revenue ${formatChartValue("revenue", point.revenue)}`;
    dot.setAttribute("aria-label", summary);
    const show = () => { readout.textContent = summary; };
    dot.addEventListener("focus", show);
    dot.addEventListener("pointerenter", show);
    dot.addEventListener("click", () => onPoint && onPoint(point.id));
    dot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") onPoint && onPoint(point.id);
    });
    svg.append(dot);
  });
  for (const item of trendCallouts(series, xOf, yOf, width)) {
    const label = svgEl("text", { x: item.x, y: item.y, class: "chart-value", "text-anchor": item.anchor });
    label.textContent = formatChartValue(metric.key, item.value);
    svg.append(label);
  }
  return svg;
}

function trendCallouts(series, xOf, yOf, width) {
  const finite = series.filter((point) => point.value != null);
  if (!finite.length) return [];
  const high = finite.reduce((best, point) => (point.value > best.value ? point : best));
  const low = finite.reduce((best, point) => (point.value < best.value ? point : best));
  const last = finite[finite.length - 1];
  const picks = [];
  for (const point of [last, high, low]) {
    if (!picks.some((item) => item.id === point.id)) picks.push(point);
  }
  const placed = [];
  for (const point of picks) {
    const index = series.findIndex((item) => item.id === point.id);
    let x = xOf(index) + 8;
    let y = yOf(point.value) - 6;
    let anchor = "start";
    if (x > width - 46) {
      x = xOf(index) - 8;
      anchor = "end";
    }
    const crowded = placed.some((item) => Math.abs(item.x - x) < 64);
    if (crowded) {
      x = xOf(index) - 8;
      y = yOf(point.value) + 14;
      anchor = "end";
    }
    if (y < 12) y = yOf(point.value) + 14;
    placed.push({ ...point, x, y, anchor });
  }
  return placed;
}

function scatterCallouts(dots) {
  if (!dots.length) return [];
  const bySpend = dots.slice().sort((a, b) => b.spend - a.spend).slice(0, 3);
  const byRoas = dots.slice().sort((a, b) => a.roas - b.roas);
  const chosen = [];
  for (const dot of [...bySpend, byRoas[byRoas.length - 1], byRoas[0]]) {
    if (dot && !chosen.some((item) => item.adId === dot.adId)) chosen.push(dot);
  }
  return chosen;
}

function priorPhrase(basis) {
  const match = String(basis || "").match(/เทียบ \S+/);
  return match ? match[0] : basis || "";
}

function sectionTable(headers, rows) {
  const details = el("details", "chart-data");
  details.append(el("summary", "", "ดูเป็นตาราง"));
  const table = el("table", "");
  const head = el("tr", "");
  for (const header of headers) head.append(el("th", "", header));
  table.append(head);
  for (const cells of rows) {
    const row = el("tr", "");
    for (const cell of cells) row.append(el("td", "", cell));
    table.append(row);
  }
  details.append(table);
  return details;
}
