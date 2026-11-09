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
} from "/shared/chart-data.js?v=20261109t115";
import { metricCell } from "/shared/history.js?v=20261109t115";

const BOOK_COLOR = {
  Mind: "#1E2A5A",
  Coworkers: "#5B5BD6",
  SurvivalGuide: "#8B6FE8",
  Trap: "#B9A7F5",
};

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
  section.append(el("p", "chart-note", "พ.ค.–ต.ค. สเกลเดียวกัน เริ่มที่ 0 ไม่รวม 1–8 พ.ย. และไม่ได้เทียบเดือนก่อน"));
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
    panel.dataset.series = id;
    const title = el("div", "trend-panel-head");
    const heading = el("h4", "", name);
    heading.prepend(bookDot(id));
    title.append(heading);
    const now = el("p", "trend-now");
    const figure = el("b", "cell-neutral", latest.text);
    figure.style.color = id === "Trap" ? "#6D55D9" : BOOK_COLOR[id];
    now.append(figure);
    now.append(el("span", "", "ต.ค. 2569"));
    title.append(now);
    panel.append(title);
    panel.append(trendSvg(series, scale, metric, BOOK_COLOR[id], readout, (periodId) => opts.onInspect && opts.onInspect(id, periodId)));
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
  const partial = opts.reportId === "nov1_8" ? `${opts.periodLabel} ไม่เต็มเดือน. ` : "";
  const note = metric.key === "revenue"
    ? partial + "รายได้ที่ Meta นับให้แอด (omni_purchase) ไม่ใช่ยอดขาย BEP และไม่ใช่เกณฑ์กำไร"
    : partial + "แท่งเริ่มที่ 0 เรียงตามเมตริกที่เลือก ไม่ได้บอกว่าเล่มไหนกำไร";
  section.append(el("p", "chart-note", note));
  const finite = series.map((item) => item.value).filter((value) => value != null && Number.isFinite(value));
  const scale = trendScale(finite.length ? finite : [0], metric.key);
  const list = el("div", "period-chart");
  for (const item of series) {
    const row = el("button", "period-row");
    row.type = "button";
    row.dataset.book = item.id;
    row.addEventListener("click", () => opts.onInspect && opts.onInspect(item.id, opts.reportId));
    const name = el("span", "period-name", item.name);
    name.prepend(bookDot(item.id));
    row.append(name);
    const slot = el("span", "period-slot");
    const share = item.value == null || scale.max === 0 ? 0 : Math.max(0, item.value / scale.max);
    const track = el("span", "period-track");
    const bar = el("i", "period-bar");
    bar.style.setProperty("--p", String(share));
    bar.style.background = BOOK_COLOR[item.id] || "#1E2A5A";
    track.append(bar);
    const end = el("span", "period-end");
    end.append(el("b", "period-value", formatChartValue(metric.key, item.value)));
    if (metric.key !== "spend") {
      const spend = bookMetric(opts.deck.bookTotals?.[opts.reportId]?.[item.id], "spend");
      end.append(el("span", "period-spend", `Spend ${formatChartValue("spend", spend)}`));
    }
    track.append(end);
    slot.append(track);
    row.append(slot);
    list.append(row);
  }
  section.append(list);
  section.append(sectionTable(["เล่ม", metric.label], series.map((item) => [item.name, formatChartValue(metric.key, item.value)])));
  parent.append(section);
}

export function renderScatter(parent, ads, baseline, opts) {
  const points = scatterPoints(ads);
  const layout = scatterLayout(points, baseline, 1100, 320);
  const section = el("section", "chart-block scatter-block");
  section.append(el("h3", "", "Spend กับ ROAS ของแอดในช่วงนี้"));
  section.append(el("p", "chart-note", `เส้นประคือ ROAS ทั้งเล่ม ${baseline == null ? "—" : baseline.toFixed(2)} จากยอดที่ไม่ได้กรอง จุดทึบอยู่เหนือเส้น จุดขอบอยู่ใต้เส้น และสูงกว่าเส้นไม่แปลว่ากำไร`));
  const host = el("div", "scatter-host");
  const svg = svgEl("svg", { viewBox: `0 0 ${layout.width} ${layout.height}`, class: "chart scatter-chart", role: "img", preserveAspectRatio: "none" });
  const bookId = opts?.book || "Mind";
  const bookColor = BOOK_COLOR[bookId] || "#1E2A5A";
  const display = scatterDisplay(layout);
  host.style.setProperty("--book", bookColor);
  if (display.baseY != null) {
    svg.append(svgEl("line", { x1: layout.padL, y1: display.baseY, x2: layout.width - layout.padR, y2: display.baseY, class: "chart-base" }));
  }
  for (const tick of display.yTicks) {
    svg.append(svgEl("line", { x1: layout.padL, y1: tick.y, x2: layout.width - layout.padR, y2: tick.y, class: "trend-gridline" }));
    const label = el("span", "scatter-ylab y-tick", tick.label);
    label.style.top = `${(tick.y / layout.height) * 100}%`;
    host.append(label);
  }
  for (const tick of layout.xTicks) {
    const label = el("span", "scatter-xlab x-tick", tick.label);
    label.style.left = `${(tick.x / layout.width) * 100}%`;
    host.append(label);
  }
  const xLabel = el("span", "scatter-axis", "Spend");
  host.append(xLabel);
  host.append(svg);
  const selected = el("span", "scatter-selected");
  selected.hidden = true;
  const pinned = [];
  for (const dot of layout.dots) {
    const shown = display.place(dot);
    const above = baseline != null && dot.roas >= baseline;
    const button = el("button", shown.pinned ? "scatter-pin" : `scatter-hit scatter-point ${above || baseline == null ? "above" : "below"}`);
    button.type = "button";
    button.style.left = `${(shown.x / layout.width) * 100}%`;
    button.style.top = `${(shown.y / layout.height) * 100}%`;
    button.dataset.adId = dot.adId;
    button.setAttribute("aria-label", `${dot.name} Spend ${formatChartValue("spend", dot.spend)} Revenue ${formatChartValue("revenue", dot.revenue)} Messages ${formatChartValue("chats", dot.chats)} Purchases ${formatChartValue("purchases", dot.purchases)} ROAS ${formatChartValue("roas", dot.roas)}`);
    const choose = () => {
      locateRow(dot.adId);
      showReadout(readout, dot);
      host.querySelectorAll(".scatter-point.is-on, .scatter-pin.is-on").forEach((node) => node.classList.remove("is-on"));
      button.classList.add("is-on");
      selected.hidden = false;
      selected.textContent = dot.creator || dot.name.slice(0, 18);
      selected.style.left = button.style.left;
      selected.style.top = button.style.top;
    };
    button.addEventListener("click", choose);
    button.addEventListener("focus", () => showReadout(readout, dot));
    host.append(button);
    if (shown.pinned) pinned.push(dot);
  }
  if (display.baseY != null) {
    const baseLabel = el("span", "scatter-base-label chart-base-label", `ROAS ทั้งเล่ม ${baseline.toFixed(2)}`);
    baseLabel.style.top = `${(display.baseY / layout.height) * 100}%`;
    host.append(baseLabel);
  }
  host.append(selected);
  const readout = el("p", "scatter-readout", "กดจุดเพื่อดูชื่อและตัวเลข และไฮไลต์แถวในตาราง");
  section.append(host, readout);
  if (pinned.length) {
    const peak = Math.max(...pinned.map((dot) => dot.roas));
    section.append(el("p", "chart-note", `${pinned.length} แอด ROAS เกินกราฟ (สูงสุด ${peak.toFixed(2)})`));
  }
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

function bookDot(bookId) {
  const dot = el("i", "book-dot");
  dot.style.background = BOOK_COLOR[bookId] || "#5B5BD6";
  return dot;
}

function scatterDisplay(layout) {
  const roas = layout.dots.map((dot) => dot.roas).filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  const rank = roas.length ? Math.min(roas.length - 1, Math.max(0, Math.ceil(roas.length * 0.9) - 1)) : 0;
  const cap = Math.max((roas[rank] || 1) * 1.3, layout.baseline || 0, 0.5);
  const top = layout.padT + 12;
  const bottom = layout.height - layout.padB;
  const yOf = (value) => bottom - (Math.max(0, Math.min(value, cap)) / cap) * (bottom - top);
  return {
    cap,
    baseY: layout.baseline == null ? null : yOf(layout.baseline),
    yTicks: niceScatterTicks(cap).map((value) => ({ y: yOf(value), label: Math.abs(value) < 1e-9 ? "0" : Number(value.toFixed(2)).toString() })),
    place(dot) {
      const pinned = dot.roas > cap + 1e-6;
      let x = dot.x;
      let y = pinned ? top : yOf(dot.roas);
      if (dot.spend < 200 && dot.roas < 0.2) {
        let n = 0;
        for (const ch of String(dot.adId)) n = (n + ch.charCodeAt(0)) % 3;
        x += (n - 1) * 3;
        y += ((n + 1) % 3 - 1) * 3;
      }
      return { x, y, pinned };
    },
  };
}

function niceScatterTicks(cap) {
  const step = cap > 5 ? 1 : 0.5;
  const ticks = [];
  for (let value = 0; value < cap - step * 0.2; value += step) ticks.push(Number(value.toFixed(2)));
  return ticks.length ? ticks : [0];
}

function shownTicks(ticks) {
  if (ticks.length <= 4) return ticks;
  const last = ticks.length - 1;
  return [0, Math.round(last / 3), Math.round((last * 2) / 3), last].map((index) => ticks[index]);
}

function curvePath(points) {
  if (!points.length) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const left = points[i];
    const right = points[i + 1];
    const mid = (left.x + right.x) / 2;
    d += ` C ${mid} ${left.y}, ${mid} ${right.y}, ${right.x} ${right.y}`;
  }
  return d;
}

function trendSvg(series, scale, metric, color, readout, onPoint) {
  const width = 320;
  const height = 140;
  const padL = 36;
  const padR = 18;
  const padT = 12;
  const padB = 22;
  const min = scale.min;
  const max = scale.max;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const xOf = (index) => padL + (series.length === 1 ? innerW / 2 : (index / (series.length - 1)) * innerW);
  const yOf = (value) => padT + (1 - (value - min) / (max - min || 1)) * innerH;
  const svg = svgEl("svg", { viewBox: `0 0 ${width} ${height}`, class: "chart trend-chart" });
  const gradId = `trend-${color.slice(1)}`;
  const defs = svgEl("defs", {});
  const grad = svgEl("linearGradient", { id: gradId, x1: "0", y1: "0", x2: "0", y2: "1" });
  grad.append(svgEl("stop", { offset: "0%", "stop-color": color, "stop-opacity": "0.18" }));
  grad.append(svgEl("stop", { offset: "100%", "stop-color": color, "stop-opacity": "0" }));
  defs.append(grad);
  svg.append(defs);
  for (const tick of shownTicks(scale.ticks)) {
    const y = yOf(tick);
    svg.append(svgEl("line", { x1: padL, y1: y, x2: width - padR, y2: y, class: "trend-gridline" }));
    const label = svgEl("text", { x: 2, y: y + 3, class: "chart-tick trend-y" });
    label.textContent = formatAxisTick(metric.key, tick);
    svg.append(label);
  }
  const lastId = [...series].reverse().find((point) => point.value != null)?.id;
  for (const segment of trendSegments(series)) {
    if (segment.length < 2) continue;
    const spots = segment.map((point) => {
      const index = series.findIndex((item) => item.id === point.id);
      return { x: xOf(index), y: yOf(point.value) };
    });
    const d = curvePath(spots);
    const floor = height - padB;
    svg.append(svgEl("path", { d: `${d} L ${spots[spots.length - 1].x} ${floor} L ${spots[0].x} ${floor} Z`, fill: `url(#${gradId})`, stroke: "none" }));
    svg.append(svgEl("path", { d, fill: "none", stroke: color, "stroke-width": "2.5", class: "trend-line" }));
  }
  series.forEach((point, index) => {
    const label = svgEl("text", { x: xOf(index), y: height - 4, class: "chart-tick", "text-anchor": "middle" });
    label.textContent = point.short;
    svg.append(label);
    if (point.value == null) return;
    const last = point.id === lastId;
    const dot = svgEl("circle", {
      cx: xOf(index),
      cy: yOf(point.value),
      r: last ? 3.5 : 2.5,
      class: "trend-dot",
      fill: last ? color : "#fff",
      stroke: color,
      "stroke-width": "2",
    });
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
