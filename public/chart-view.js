import {
  CHART_METRICS,
  formatChartValue,
  formatSpendTick,
  periodSeries,
  scatterLayout,
  scatterPoints,
  trendScale,
  trendSegments,
  trendSeries,
} from "/shared/chart-data.js?v=20261108t109";

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
  section.append(el("p", "chart-note", "จุดคือยอดรวมถ่วงน้ำหนักของเล่ม เส้นไม่ลากข้ามเดือนที่ไม่มีรายการ และไม่รวม 1–7 พ.ย."));
  const grid = el("div", "trend-grid");
  const all = opts.books.map(([id]) => trendSeries(opts.deck.bookTotals, id, metric.key));
  const scale = trendScale(all.flat().map((point) => point.value), metric.zero);
  section.append(el("p", "chart-note", `แกนตั้งใช้สเกลเดียวกันทุกเล่ม ${scale.ticks.map((value) => formatChartValue(metric.key, value)).join(" · ")}`));
  for (const [id, name] of opts.books) {
    const series = trendSeries(opts.deck.bookTotals, id, metric.key);
    const panel = el("article", "chart-panel");
    panel.append(el("h4", "", name));
    panel.append(trendSvg(series, scale, metric.key, (periodId) => opts.onInspect && opts.onInspect(id, periodId)));
    panel.append(dataTable(series.map((point) => [point.short, formatChartValue(metric.key, point.value)])));
    grid.append(panel);
  }
  section.append(grid);
  parent.append(section);
}

export function renderPeriodChart(parent, opts) {
  const metric = CHART_METRICS.find((item) => item.key === (opts.chartMetric || "roas")) || CHART_METRICS[0];
  const series = periodSeries(opts.deck.bookTotals, opts.reportId, opts.books, metric.key);
  const section = el("section", "chart-block");
  section.append(el("h3", "", `${metric.label} ของ 4 เล่ม · ${opts.periodLabel}`));
  const note = metric.key === "revenue"
    ? "รายได้ที่ Meta นับให้แอด (omni_purchase) ไม่ใช่ยอดขาย BEP และไม่ใช่เกณฑ์กำไร"
    : "เทียบเล่มในช่วงที่เลือกด้านบน แท่งเริ่มที่ 0 ไม่ได้บอกว่าเล่มไหนกำไร";
  section.append(el("p", "chart-note", note));
  const max = Math.max(...series.map((item) => item.value || 0), 0);
  const list = el("div", "period-chart");
  for (const item of series) {
    const row = el("button", "period-row");
    row.type = "button";
    row.addEventListener("click", () => opts.onInspect && opts.onInspect(item.id, opts.reportId));
    row.append(el("span", "period-name", item.name));
    const track = el("span", "period-track");
    if (item.value != null && max > 0) {
      const bar = el("span", "period-bar");
      bar.style.width = `${(item.value / max) * 100}%`;
      track.append(bar);
    }
    row.append(track);
    row.append(el("span", "period-value", formatChartValue(metric.key, item.value)));
    list.append(row);
  }
  section.append(list);
  section.append(dataTable(series.map((item) => [item.name, formatChartValue(metric.key, item.value)])));
  parent.append(section);
}

export function renderScatter(parent, ads, baseline, opts) {
  const points = scatterPoints(ads);
  const layout = scatterLayout(points, baseline, 640, 200);
  const section = el("section", "chart-block scatter-block");
  section.append(el("h3", "", "Spend กับ ROAS ของแอดในช่วงนี้"));
  section.append(el("p", "chart-note", `เส้นประคือ ROAS ยอดเล่มทั้งช่วง ${baseline == null ? "—" : baseline.toFixed(2)} ไม่ได้คำนวณจากแถวที่กรอง และสูงกว่าเส้นไม่แปลว่ากำไร`));
  const host = el("div", "scatter-host");
  const svg = svgEl("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, class: "chart scatter-chart", role: "img" });
  svg.append(svgEl("line", { x1: layout.padL, y1: layout.height - layout.padB, x2: layout.width - layout.padR, y2: layout.height - layout.padB, class: "chart-axis" }));
  svg.append(svgEl("line", { x1: layout.padL, y1: layout.padT, x2: layout.padL, y2: layout.height - layout.padB, class: "chart-axis" }));
  if (layout.baseY != null) {
    svg.append(svgEl("line", { x1: layout.padL, y1: layout.baseY, x2: layout.width - layout.padR, y2: layout.baseY, class: "chart-base" }));
    const baseLabel = svgEl("text", { x: layout.width - layout.padR + 4, y: layout.baseY + 4, class: "chart-base-label" });
    baseLabel.textContent = baseline.toFixed(2);
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
  const xLabel = svgEl("text", { x: layout.width / 2, y: layout.height - 4, class: "chart-axis-label", "text-anchor": "middle" });
  xLabel.textContent = "Spend";
  svg.append(xLabel);
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
    svg.append(svgEl("circle", { cx: dot.x, cy: dot.y, r: 4.5, class: "scatter-dot" }));
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

function trendSvg(series, scale, key, onPoint) {
  const width = 320;
  const height = 132;
  const padL = 34;
  const padR = 36;
  const padT = 16;
  const padB = 22;
  const min = scale.min;
  const max = scale.max;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xOf = (index) => padL + (series.length === 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
  const yOf = (value) => padT + (1 - (value - min) / (max - min)) * innerH;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart trend-chart" });
  for (const tick of [scale.ticks[0], scale.ticks[scale.ticks.length - 1]]) {
    if (tick == null || tick < min || tick > max) continue;
    const label = svgEl("text", { x: 2, y: yOf(tick) + 3, class: "chart-tick trend-y" });
    label.textContent = key === "roas" ? formatChartValue(key, tick) : formatSpendTick(tick);
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
    const dot = svgEl("circle", { cx: xOf(index), cy: yOf(point.value), r: 6, class: "trend-dot" });
    dot.setAttribute("role", "button");
    dot.setAttribute("tabindex", "0");
    dot.setAttribute("aria-label", `${point.short} ${formatChartValue(key, point.value)}`);
    dot.addEventListener("click", () => onPoint && onPoint(point.id));
    dot.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") onPoint && onPoint(point.id);
    });
    svg.append(dot);
  });
  const last = [...series].reverse().find((point) => point.value != null);
  if (last) {
    const index = series.findIndex((point) => point.id === last.id);
    const label = svgEl("text", { x: xOf(index) + 6, y: yOf(last.value) + 4, class: "chart-value" });
    label.textContent = formatChartValue(key, last.value);
    svg.append(label);
  }
  return svg;
}

function dataTable(pairs) {
  const details = el("details", "chart-data");
  details.append(el("summary", "", "ตัวเลขในกราฟ"));
  const table = el("table", "");
  for (const [label, value] of pairs) {
    const row = el("tr", "");
    row.append(el("th", "", label), el("td", "", value));
    table.append(row);
  }
  details.append(table);
  return details;
}
