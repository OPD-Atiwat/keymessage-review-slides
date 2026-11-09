import { analysisItemId } from "/shared/analysis.js?v=20261109t115";
import { rates } from "/shared/metrics.js?v=20261109t115";
import { comparisonRows } from "/shared/comparison.js?v=20261109t115";
import { FROZEN_PERFORMANCE } from "/shared/cutoff.js?v=20261109t115";
import { changePct, metricTone, sameLengthBase, TONE_LABEL } from "/shared/conditional.js?v=20261109t115";
import { contentBadge, STATUS_CHECKED_LABEL } from "/shared/status-labels.js?v=20261109t115";
import { TABLE_HEAD } from "/shared/labels.js?v=20261109t115";
import { OVERVIEW_METRICS, OVERVIEW_MONTHS, formatMetric, metricCell } from "/shared/history.js?v=20261109t115";
import { filterAds, sortAds } from "/shared/ad-query.js?v=20261109t115";
import {
  CREATOR_METRICS,
  UNKNOWN_LABEL,
  coverageOf,
  creatorGroups,
  creatorHistory,
  knownCreators,
  reconcileCreators,
  sortCreators,
  unknownCreator,
} from "/shared/creator-rank.js?v=20261109t115";
import { renderPeriodChart, renderScatter, renderTrendChart } from "/chart-view.js?v=20261109t115";

const BOOKS = [
  ["Mind", "ถือไพ่เหนือกว่า"],
  ["Coworkers", "ออฟฟิศนี้เฮงซวย"],
  ["SurvivalGuide", "Survival Guide"],
  ["Trap", "กับดักความรู้สึกผิด"],
];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function baht(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return "฿" + Math.round(Number(value)).toLocaleString("en-US");
}
function num(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Math.round(Number(value)).toLocaleString("en-US");
}
function roasOf(totals) {
  if (!totals || !totals.spend) return null;
  return rates(totals).roas;
}
function roasText(totals) {
  const value = roasOf(totals);
  return value == null ? "—" : value.toFixed(2);
}
function mom(current, previous) {
  return changePct(current, previous).text;
}
function reportLabel(id) {
  return { may: "พ.ค. 2569", jun: "มิ.ย. 2569", jul: "ก.ค. 2569", aug: "ส.ค. 2569", sep: "ก.ย. 2569", oct: "ต.ค. 2569", oct1_7: "1–7 ต.ค. 2569", nov1_8: "1–8 พ.ย. 2569" }[id] || id;
}
function opening(ad) {
  const body = (ad.body || "").trim();
  if (!body) return "";
  return body.split(/\s+\/\s+/)[0];
}

function appendGateLine(method, opts, className) {
  const line = opts.metaGate && opts.metaGate.ok === true ? opts.metaGate.line : "";
  if (!line) return;
  method.append(el("p", className, line));
}

function banner() {
  const box = el("section", "cutoff");
  box.append(el("strong", "", FROZEN_PERFORMANCE.throughLabel));
  box.append(el("span", "", "เวลาไทย · " + FROZEN_PERFORMANCE.novMtdLabel));
  box.append(el("span", "cutoff-status", STATUS_CHECKED_LABEL + " — สถานะบัญชีตอนตรวจ ไม่ใช่ผลลัพธ์วันที่ 7 และย้อนสถานะเมื่อวานไม่ได้"));
  return box;
}

export function renderWeb(root, opts) {
  root.replaceChildren();
  if (opts.view === "analysis") renderAnalysis(root, opts);
  else if (opts.view === "book") renderBook(root, opts);
  else if (opts.view === "creator") renderCreator(root, opts);
  else renderOverview(root, opts);
}

const BOOK_COLOR = {
  Mind: "#1E2A5A",
  Coworkers: "#5B5BD6",
  SurvivalGuide: "#8B6FE8",
  Trap: "#B9A7F5",
};

function renderOverview(root, opts) {
  const snap = opts.deck.snapshot || {};
  root.append(el("h1", "web-title", "ภาพรวมรายเดือน"));
  const caption = el("div", "page-caption");
  caption.append(el("p", "history-help", `${snap.coverage || "เฉพาะรายการที่ยืนยันเล่มได้"} · ถึง ${snap.frozenThrough || "7 พ.ย. 2569"} · ไม่ใช่กำไร`));
  const method = el("details", "history-method");
  method.append(el("summary", "", "วิธีนับ"));
  method.append(el("p", "history-help", [
    snap.channel,
    snap.method,
    snap.attribution,
    snap.revision,
    snap.optionalCrossRange,
    "Revenue คือ omni_purchase ไม่ใช่ BEP",
    "CVR คือ Purchases ÷ Messages (ซื้อ/แชท) ไม่ใช่ CVR ที่ Meta จับคู่",
    "1–8 พ.ย. ไม่ใช่เดือนเต็ม",
    "— ไม่ใช่ 0",
    "ไม่ได้เทียบเดือนก่อน เพราะ mom_eligible เป็นเท็จทุกช่วง",
    `ตรวจ ${snap.pulled || ""}`,
  ].filter(Boolean).join(" · ")));
  appendGateLine(method, opts, "history-help");
  caption.append(method);
  root.append(caption);
  const combined = combineBooks(opts.deck.bookTotals?.[opts.reportId]);
  if (combined) root.append(heroCard(combined, `${reportLabel(opts.reportId)} · 4 เล่มที่ยืนยันแล้ว`));
  renderTrendChart(root, { ...opts, books: BOOKS, onChartMetric: opts.onChartMetric });
  renderPeriodChart(root, { ...opts, books: BOOKS, periodLabel: reportLabel(opts.reportId) });
  for (const [id, name] of BOOKS) root.append(metricTable(opts.deck.bookTotals, id, name, opts));
  root.append(exclusionNote(opts.deck));
}

function metricTable(bookTotals, bookId, name, opts) {
  const section = el("section", "metric-book");
  const title = el("h3", "book-heading");
  title.append(bookDot(bookId));
  const open = el("button", "metric-book-name", name);
  open.type = "button";
  open.dataset.book = bookId;
  open.addEventListener("click", () => opts.onBook(bookId));
  title.append(open);
  section.append(title);
  section.append(el("p", "metric-scope", "เฉพาะรายการที่ยืนยันเล่มได้"));
  const scroller = el("div", "metric-scroll");
  const table = el("table", "metric-table");
  table.dataset.book = bookId;
  const head = el("tr", "");
  head.append(el("th", "metric-name", "เมตริก"));
  for (const period of OVERVIEW_MONTHS) {
    const cell = el("th", period.kind === "partial" ? "month-col is-partial" : "month-col", period.short);
    cell.dataset.period = period.id;
    cell.title = period.kind === "partial" ? `${period.label} ยังไม่ครบเดือน` : period.label;
    head.append(cell);
  }
  const thead = el("thead", "");
  thead.append(head);
  const body = el("tbody", "");
  for (const metric of OVERVIEW_METRICS) {
    const row = el("tr", "");
    row.append(el("th", "metric-name", metric.label));
    for (const period of OVERVIEW_MONTHS) {
      const value = metricCell(bookTotals, period.id, bookId, metric.key);
      const cell = el("td", "metric-value cell-" + value.tone, value.text);
      cell.dataset.metric = metric.key;
      cell.dataset.period = period.id;
      cell.title = value.basis;
      cell.setAttribute("aria-label", `${metric.label} ${period.short} ${value.text}. ${value.basis}`);
      row.append(cell);
    }
    body.append(row);
  }
  table.append(thead, body);
  scroller.append(table);
  section.append(scroller);
  return section;
}

function exclusionNote(deck) {
  const details = el("details", "exclusion-note");
  details.append(el("summary", "", "รายการที่แยกออกจากยอด"));
  details.append(el("p", "history-help", "นับแยกตามเดือน ช่องทาง และเหตุผล ไม่ได้บวกกลับเข้าเล่ม และโปรหลายเล่มห้ามบวกรวมข้ามเล่ม"));
  const table = el("table", "metric-table exclusion-table");
  const head = el("tr", "");
  for (const label of ["เดือน", "เหตุผล", "ช่องทาง", "แอด", "Spend", "Revenue"]) head.append(el("th", "", label));
  const thead = el("thead", "");
  thead.append(head);
  const body = el("tbody", "");
  for (const row of deck.exclusions || []) {
    const line = el("tr", "");
    line.append(el("td", "", reportLabel(row.period)));
    line.append(el("td", "", row.reason || row.bucket));
    line.append(el("td", "", row.channel));
    line.append(el("td", "", String(row.adCount)));
    line.append(el("td", "", baht(row.spend)));
    line.append(el("td", "", baht(row.revenue)));
    body.append(line);
  }
  table.append(thead, body);
  details.append(table);
  return details;
}

function renderBook(root, opts) {
  const switcher = el("div", "book-switch");
  for (const [id, name] of BOOKS) {
    const button = el("button", opts.book === id ? "on" : "");
    button.type = "button";
    button.append(bookDot(id), document.createTextNode(name));
    button.dataset.book = id;
    button.setAttribute("aria-pressed", opts.book === id ? "true" : "false");
    button.addEventListener("click", () => opts.onBook(id));
    switcher.append(button);
  }
  root.append(switcher);
  const name = BOOKS.find((item) => item[0] === opts.book)?.[1] || opts.book;
  root.append(bookTable(name, opts.book, opts, opts.book));
}

const QUERY_METRICS = [
  ["spend", "Spend"],
  ["revenue", "Revenue"],
  ["roas", "ROAS"],
  ["chats", "Messages"],
  ["costPerMsg", "Cost per Message"],
  ["cpm", "CPM"],
  ["purchases", "Purchases"],
  ["cvrProxy", "CVR"],
  ["aov", "AOV"],
];

function bookTable(name, book, opts) {
  const wrap = el("section", "scan-sheet");
  const totals = opts.deck.bookTotals[opts.reportId]?.[book];
  if (!totals) {
    wrap.append(el("h2", "", `${name} · ${reportLabel(opts.reportId)}`));
    wrap.append(el("p", "web-sub", "ไม่มีรายการที่ยืนยันได้"));
    return wrap;
  }
  const query = opts.query || { sortKey: "spend", sortDir: "desc", filterKey: "spend", min: "", max: "", appliedKey: "spend", appliedMin: "", appliedMax: "", error: "" };
  const baseline = roasOf(totals);
  const all = comparisonRows({
    ads: opts.deck.ads,
    statusById: opts.status.ads_by_id,
    book,
    period: opts.reportId,
    contentId: opts.contentId,
    statusId: opts.statusId,
  });
  const filtered = filterAds(all, { key: query.appliedKey || query.filterKey, min: query.appliedMin || "", max: query.appliedMax || "" });
  const rows = filtered.ok ? sortAds(filtered.rows, query.sortKey, query.sortDir) : sortAds(all, query.sortKey, query.sortDir);
  const head = el("header", "scan-top");
  const titles = el("div");
  titles.append(el("h2", "", `${name} · ${reportLabel(opts.reportId)}`));
  titles.append(el("p", "scan-count", `${rows.length}/${all.length} แอด`));
  const caption = el("div", "page-caption");
  caption.append(el("p", "history-help", "เฉพาะรายการที่ยืนยันเล่มได้ · สีของแอดเทียบยอดเล่มช่วงนี้ · ไม่ใช่กำไร"));
  const method = el("details", "history-method");
  method.append(el("summary", "", "วิธีนับ"));
  method.append(el("p", "history-help", "CVR คือ Purchases ÷ Messages (ซื้อ/แชท) ไม่ใช่ CVR ที่ Meta จับคู่. Revenue คือ omni_purchase ไม่ใช่ BEP. ไม่ได้เทียบเดือนก่อน. ยอดเล่มไม่เปลี่ยนเมื่อกรองแอด."));
  appendGateLine(method, opts, "history-help");
  caption.append(method);
  titles.append(caption);
  head.append(titles);
  wrap.append(head);
  wrap.append(heroCard(totals, `${reportLabel(opts.reportId)} · ไม่ใช่ยอดที่กรอง`));
  renderScatter(wrap, filtered.ok ? filtered.rows : all, baseline, opts);
  const tools = el("div", "table-tools");
  tools.append(legend(), filterBar(query, opts));
  wrap.append(tools);
  if (!filtered.ok) wrap.append(el("p", "metric-filter-error", filtered.message || query.error));
  else if (query.error) wrap.append(el("p", "metric-filter-error", query.error));
  const scroller = el("div", "scan-scroll");
  scroller.append(columnHead(baseline, query, opts));
  const bookRate = rates(totals);
  if (!rows.length) scroller.append(el("p", "web-sub", all.length ? "ไม่มีแอดในช่วงตัวเลขนี้" : "ไม่มีแอดในช่วงนี้"));
  else rows.forEach((ad, index) => scroller.append(scanRow(ad, index + 1, baseline, bookRate, opts.status.ads_by_id[ad.adId], opts)));
  wrap.append(scroller);
  return wrap;
}

function filterBar(query, opts) {
  const form = el("form", "metric-filter");
  const metric = document.createElement("select");
  metric.className = "metric-filter-key";
  metric.setAttribute("aria-label", "เมตริกที่ใช้กรอง");
  for (const [key, label] of QUERY_METRICS) metric.append(new Option(label, key));
  metric.value = query.filterKey || "spend";
  const min = document.createElement("input");
  min.className = "metric-min";
  min.inputMode = "decimal";
  min.placeholder = metric.value === "cvrProxy" ? "ตั้งแต่ %" : "ตั้งแต่";
  min.setAttribute("aria-label", "ค่าต่ำสุด");
  min.value = query.min || "";
  const max = document.createElement("input");
  max.className = "metric-max";
  max.inputMode = "decimal";
  max.placeholder = metric.value === "cvrProxy" ? "ถึง %" : "ถึง";
  max.setAttribute("aria-label", "ค่าสูงสุด");
  max.value = query.max || "";
  metric.addEventListener("change", () => {
    const percent = metric.value === "cvrProxy";
    min.placeholder = percent ? "ตั้งแต่ %" : "ตั้งแต่";
    max.placeholder = percent ? "ถึง %" : "ถึง";
  });
  const apply = el("button", "", "กรอง");
  apply.type = "submit";
  const reset = el("button", "metric-reset", "ล้าง");
  reset.type = "button";
  form.append(el("span", "", "กรอง"), metric, min, max, apply, reset);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const next = filterAds([{ adId: "0", spend: 0, revenue: 0, impressions: 0, chats: 0, purchases: 0 }], {
      key: metric.value,
      min: min.value,
      max: max.value,
    });
    opts.onQuery({
      ...query,
      filterKey: metric.value,
      min: min.value,
      max: max.value,
      appliedKey: next.ok ? metric.value : query.appliedKey,
      appliedMin: next.ok ? min.value : query.appliedMin,
      appliedMax: next.ok ? max.value : query.appliedMax,
      error: next.ok ? "" : next.message,
    });
  });
  reset.addEventListener("click", () => opts.onQuery({ sortKey: "spend", sortDir: "desc", filterKey: "spend", min: "", max: "", appliedKey: "spend", appliedMin: "", appliedMax: "", error: "" }));
  return form;
}

function bookDot(bookId) {
  const dot = el("i", "book-dot");
  dot.style.background = BOOK_COLOR[bookId] || "#5B5BD6";
  if (bookId === "Trap") dot.style.boxShadow = "inset 0 0 0 1px #8B6FE8";
  return dot;
}

function combineBooks(byBook) {
  if (!byBook) return null;
  const rows = BOOKS.map(([id]) => byBook[id]).filter(Boolean);
  if (!rows.length) return null;
  const totals = { spend: 0, revenue: 0, impressions: 0, chats: 0, purchases: 0 };
  for (const row of rows) {
    totals.spend += Number(row.spend) || 0;
    totals.revenue += Number(row.revenue) || 0;
    totals.impressions += Number(row.impressions) || 0;
    totals.chats += Number(row.chats) || 0;
    totals.purchases += Number(row.purchases) || 0;
  }
  return totals;
}

function heroBit(label, value, large) {
  const cell = el("div", large ? "hero-bit is-large" : "hero-bit");
  cell.append(el("span", "", label), el("b", "", value));
  return cell;
}

function heroCard(totals, note) {
  const rate = rates(totals);
  const box = el("section", "hero scan-total");
  box.append(el("p", "hero-kicker", note));
  const main = el("div", "hero-main");
  main.append(heroBit("Spend", baht(totals.spend), true));
  main.append(heroBit("Revenue", baht(totals.revenue), true));
  main.append(heroBit("ROAS", rate.roas == null ? "—" : rate.roas.toFixed(2), true));
  box.append(main);
  const rest = el("div", "hero-rest");
  rest.append(heroBit("Messages", num(totals.chats)));
  rest.append(heroBit("Cost per Message", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)));
  rest.append(heroBit("CPM", rate.cpm == null ? "—" : baht(rate.cpm)));
  rest.append(heroBit("Purchases", num(totals.purchases)));
  rest.append(heroBit("CVR", rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%"));
  rest.append(heroBit("AOV", rate.aov == null ? "—" : baht(rate.aov)));
  box.append(rest);
  return box;
}

function totalRow(totals, baseline, label) {
  const rate = rates(totals);
  const row = el("div", "scan-total kpi-grid");
  const labelCell = el("span", "scan-total-label", `ยอดเล่มทั้งช่วง ${label} · ไม่ใช่ยอดที่กรอง`);
  row.append(labelCell);
  row.append(metric("Spend", baht(totals.spend)));
  row.append(metric("Revenue", baht(totals.revenue)));
  row.append(metric("ROAS", baseline == null ? "—" : baseline.toFixed(2)));
  row.append(metric("Messages", num(totals.chats)));
  row.append(metric("Cost per Message", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)));
  row.append(metric("CPM", rate.cpm == null ? "—" : baht(rate.cpm)));
  row.append(metric("Purchases", num(totals.purchases)));
  row.append(metric("CVR", rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%", "ซื้อ/แชท"));
  row.append(metric("AOV", rate.aov == null ? "—" : baht(rate.aov)));
  return row;
}

function metric(label, value, cue) {
  const cell = el("span", "scan-total-bit");
  const small = el("small", "", label);
  cell.append(small);
  if (cue) cell.append(el("small", "metric-cue", cue));
  cell.append(document.createTextNode(value));
  return cell;
}

function columnHead(baseline, query, opts) {
  const head = el("div", "scan-head scan-cols");
  head.append(el("span", "scan-rank", "#"));
  const name = el("span", "scan-name", "ข้อความแอด");
  head.append(name);
  head.append(el("span", "", "Creator"));
  head.append(el("span", "", "Content"));
  for (const [key, label] of QUERY_METRICS) {
    const button = el("button", "sort-key", label + (query.sortKey === key ? (query.sortDir === "desc" ? " ↓" : " ↑") : ""));
    button.type = "button";
    button.dataset.sort = key;
    button.setAttribute("aria-sort", query.sortKey === key ? (query.sortDir === "asc" ? "ascending" : "descending") : "none");
    if (key === "roas" && baseline != null) button.title = `เส้นเล่ม ${baseline.toFixed(2)} เป็นยอดทั้งช่วง`;
    button.addEventListener("click", () => {
      const dir = query.sortKey === key && query.sortDir === "desc" ? "asc" : "desc";
      opts.onQuery({ ...query, sortKey: key, sortDir: dir, error: "" });
    });
    head.append(button);
  }
  head.append(el("span", "", ""));
  return head;
}

function scanRow(ad, index, baseline, bookRate, record, opts) {
  const rate = rates(ad);
  const row = el("article", "scan-row scan-cols");
  row.dataset.adId = ad.adId;
  row.append(el("span", "scan-rank", String(index)));
  const name = el("div", "scan-name");
  const title = el("button", "ad-name", ad.adName);
  title.type = "button";
  title.title = ad.adName;
  title.setAttribute("aria-label", ad.adName);
  title.addEventListener("click", () => openDetail(ad, record, opts));
  name.append(title);
  row.append(name);
  row.tabIndex = 0;
  row.addEventListener("click", (event) => {
    if (event.target.closest("a, .pick-btn, .ad-name")) return;
    openDetail(ad, record, opts);
  });
  row.addEventListener("keydown", (event) => {
    if (event.key === "Enter") openDetail(ad, record, opts);
  });
  const creator = el("span", "scan-creator", ad.creatorTag || "—");
  creator.title = ad.creatorTag || "";
  row.append(creator);
  const content = contentBadge(record);
  const month = el("span", "scan-content", content.id === "unknown" ? "ไม่ระบุ" : content.id);
  month.title = content.text;
  row.append(month);
  row.append(volumeNum("spend", baht(ad.spend)));
  row.append(volumeNum("revenue", baht(ad.revenue)));
  row.append(coloredNum("roas", rate.roas == null ? "—" : rate.roas.toFixed(2), metricTone("roas", rate.roas, baseline)));
  row.append(volumeNum("chats", num(ad.chats)));
  row.append(coloredNum("costPerMsg", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg), metricTone("costPerMsg", rate.costPerMsg, bookRate.costPerMsg)));
  row.append(coloredNum("cpm", rate.cpm == null ? "—" : baht(rate.cpm), metricTone("cpm", rate.cpm, bookRate.cpm)));
  row.append(volumeNum("purchases", num(ad.purchases)));
  row.append(coloredNum("cvrProxy", rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%", metricTone("cvrProxy", rate.cvrProxy, bookRate.cvrProxy)));
  row.append(coloredNum("aov", rate.aov == null ? "—" : baht(rate.aov), metricTone("aov", rate.aov, bookRate.aov)));
  const actions = el("span", "scan-actions");
  if (!ad.metaOmitted) actions.append(pickButton(ad, opts));
  row.append(actions);
  if (opts.picks && opts.picks[analysisItemId(opts.reportId, ad.adId)]) row.classList.add("is-picked");
  return row;
}

function pickButton(ad, opts) {
  const itemId = analysisItemId(opts.reportId, ad.adId);
  const picked = Boolean(opts.picks && opts.picks[itemId]);
  const button = el("button", "pick-btn" + (picked ? " on" : ""), picked ? "เลือกแล้ว" : "เลือก");
  button.type = "button";
  button.dataset.pick = itemId;
  button.setAttribute("aria-pressed", picked ? "true" : "false");
  button.title = picked ? "เลือกไว้วิเคราะห์แล้ว ไม่ใช่สถานะการยิงแอด" : "เลือกข้อความนี้ไว้วิเคราะห์ต่อยอด ไม่ใช่สถานะการยิงแอด";
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    opts.onPick(ad, opts.reportId);
  });
  return button;
}

const PERIOD_LABEL = { may: "พ.ค. 2569", jun: "มิ.ย. 2569", jul: "ก.ค. 2569", aug: "ส.ค. 2569", sep: "ก.ย. 2569", oct: "ต.ค. 2569", oct1_7: "1–7 ต.ค.", nov1_8: "1–8 พ.ย." };
const BOOK_LABEL = Object.fromEntries(BOOKS);

function creatorToken(tag) {
  return tag ? tag : "~unknown";
}

function creatorValue(group, key) {
  if (key === "spend" || key === "revenue" || key === "chats" || key === "purchases") return group[key];
  return group[key];
}

function renderCreator(root, opts) {
  const scope = opts.creatorBook || "all";
  const sort = opts.creatorSort || { key: "roas", dir: "desc" };
  const metric = CREATOR_METRICS.find((item) => item.key === sort.key) || CREATOR_METRICS[2];
  const groups = creatorGroups(opts.deck.ads, opts.reportId, scope);
  const ranked = sortCreators(knownCreators(groups), metric.key, sort.dir);
  const unknown = unknownCreator(groups);
  const coverage = coverageOf(groups);
  const check = reconcileCreators(groups, opts.deck.bookTotals, opts.reportId, scope);
  const scopeName = scope === "all" ? "ภาพรวม" : (BOOKS.find((item) => item[0] === scope)?.[1] || scope);

  root.append(el("h2", "web-title", `อันดับ Creator · เรียงตาม ${metric.label}`));
  const switcher = el("div", "book-switch");
  const scopes = [["all", "ภาพรวม"], ...BOOKS];
  if (opts.deck.bookTotals?.[opts.reportId]?.Unassigned) scopes.push(["Unassigned", "ไม่ระบุเล่ม"]);
  for (const [id, name] of scopes) {
    const button = el("button", scope === id ? "on" : "");
    button.type = "button";
    if (id !== "all") button.append(bookDot(id));
    button.append(document.createTextNode(name));
    button.dataset.creatorScope = id;
    button.setAttribute("aria-pressed", scope === id ? "true" : "false");
    button.addEventListener("click", () => opts.onCreatorScope(id));
    switcher.append(button);
  }
  root.append(switcher);

  const controls = el("div", "creator-controls");
  const metricLabel = el("label", "", "เรียงตาม");
  const select = document.createElement("select");
  select.id = "creator-metric";
  select.setAttribute("aria-label", "เรียงตาม");
  for (const item of CREATOR_METRICS) select.append(new Option(item.label, item.key));
  select.value = metric.key;
  select.addEventListener("change", () => opts.onCreatorMetric(select.value));
  metricLabel.append(select);
  const dirText = sort.dir === "asc" ? "น้อยไปมาก" : "มากไปน้อย";
  const dir = el("button", "creator-dir", dirText);
  dir.type = "button";
  dir.setAttribute("aria-pressed", "true");
  dir.addEventListener("click", () => opts.onCreatorSort(metric.key));
  controls.append(metricLabel, dir);

  const caption = el("div", "page-caption");
  caption.append(el("p", "creator-note", `${scopeName} · ${reportLabel(opts.reportId)} · เรียงตาม ${metric.label} ${dirText} · ยอดทุกป้าย รวมไม่ทราบ Creator และไม่ระบุเล่ม เท่ากับยอดสี่เล่มบวกถังไม่ระบุเล่ม`));
  const method = el("details", "history-method");
  method.append(el("summary", "", "วิธีนับ"));
  const cover = coverage.total === 0
    ? "ไม่มีรายการที่ยืนยันได้"
    : coverage.blank === 0
      ? `ช่วงนี้มีป้าย Creator ครบ ${coverage.tagged} จาก ${coverage.total} แอด ไม่ได้เดาชื่อเพิ่ม`
      : `ช่วงนี้มีป้าย Creator ${coverage.tagged} จาก ${coverage.total} แอด อีก ${coverage.blank} แอดไม่มีป้ายในชุดนี้ จึงอยู่กลุ่มไม่ทราบ Creator ไม่ได้เดาจากชื่อแอด`;
  method.append(el("p", "creator-note", [
    scope === "all" ? "รวม 4 เล่มที่ยืนยันแล้ว สินค้าไม่เหมือนกัน การเทียบในเล่มเดียวชัดกว่า" : "เทียบในเล่มนี้เล่มเดียว",
    "ไม่ใช่อันดับคนเก่ง",
    cover,
    check.ok && coverage.total > 0 ? "ยอดทุกป้าย รวมกลุ่มไม่ทราบ Creator เท่ากับยอดชุดนี้ในช่วงที่เลือก" : "",
    "จัดตามป้าย Creator ที่เก็บไว้ในชุดนี้ ไม่ได้เดาจากวงเล็บในชื่อแอด. Central, Central+Leef, Central+Park และ Central+Phum เป็นคนละแถว. ป้ายร่วมอยู่แถวเดียว ไม่ได้แบ่งยอดให้หลายคน. การจัดกลุ่มไม่ใช่สาเหตุของยอด และไม่ใช่ยอดขายทั้งธุรกิจ. Revenue คือ omni_purchase. CVR คือ Purchases ÷ Messages. พ.ค.–ส.ค. มีแอดที่ไม่มีป้าย ส่วน ก.ย., ต.ค. และ 1–7 พ.ย. มีป้ายครบในชุดนี้.",
  ].filter(Boolean).join(" ")));
  appendGateLine(method, opts, "creator-note");
  caption.append(method);
  root.append(caption);

  if (!ranked.length && !unknown) {
    root.append(el("p", "history-help", "ไม่มีรายการที่ยืนยันได้"));
    return;
  }

  root.append(creatorChart(ranked, metric, opts, controls));
  root.append(creatorTable(ranked, metric, sort, opts));
  if (unknown) root.append(unknownBlock(unknown, opts));
  if (opts.creatorFocus != null) root.append(creatorAds(groups, opts));

}

/** Provisional bars only. Replace this view when the data and design review lands. The table is the figure of record. */
function creatorChart(ranked, metric, opts, controls) {
  const section = el("section", "chart-block creator-chart");
  const head = el("div", "chart-head");
  head.append(el("h3", "", `${metric.label} ของแต่ละ Creator`));
  if (controls) head.append(controls);
  section.append(head);
  const finite = ranked.map((row) => row[metric.key]).filter((value) => value != null && Number.isFinite(Number(value)));
  const max = finite.length ? Math.max(...finite.map(Number)) : 0;
  if (!ranked.length) {
    section.append(el("p", "creator-note", "ไม่มี Creator ที่รู้ชื่อในช่วงนี้"));
    return section;
  }
  for (const [index, row] of ranked.entries()) {
    const value = row[metric.key];
    const missing = value == null || !Number.isFinite(Number(value));
    const width = !missing && max > 0 ? Math.max(0, Math.min(100, (Number(value) / max) * 100)) : 0;
    const button = el("button", "creator-bar");
    button.type = "button";
    button.dataset.creator = creatorToken(row.tag);
    button.setAttribute("aria-label", `${index + 1} ${row.label} ${formatMetric(metric.key, missing ? null : value)} ${row.n} แอด`);
    button.append(el("span", "creator-bar-name", row.label));
    const track = el("span", "creator-bar-track");
    const fill = el("i", "creator-bar-fill" + (index === 0 ? " is-top" : ""));
    fill.style.setProperty("--p", String(width / 100));
    track.append(fill);
    const end = el("span", "creator-bar-end");
    end.append(el("b", "creator-bar-value", formatMetric(metric.key, missing ? null : value)));
    end.append(el("span", "creator-bar-meta", `${row.n} แอด`));
    track.append(end);
    button.append(track);
    button.addEventListener("click", () => opts.onCreatorOpen(row.tag));
    section.append(button);
  }
  return section;
}

function creatorTable(ranked, metric, sort, opts) {
  const wrap = el("div", "creator-table-wrap");
  const table = el("table", "creator-table");
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  hr.append(el("th", "", "#"));
  hr.append(el("th", "", "Creator"));
  hr.append(el("th", "", "จำนวนแอด"));
  for (const item of CREATOR_METRICS) {
    const th = document.createElement("th");
    const button = el("button", "sort-key", item.label + (sort.key === item.key ? (sort.dir === "desc" ? " ↓" : " ↑") : ""));
    button.type = "button";
    button.dataset.creatorSort = item.key;
    button.setAttribute("aria-sort", sort.key === item.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none");
    button.addEventListener("click", () => opts.onCreatorSort(item.key));
    th.append(button);
    hr.append(th);
  }
  head.append(hr);
  const body = document.createElement("tbody");
  ranked.forEach((row, index) => {
    const tr = document.createElement("tr");
    tr.className = "creator-row" + (opts.creatorFocus === row.tag ? " on" : "");
    tr.tabIndex = 0;
    tr.dataset.creator = creatorToken(row.tag);
    tr.setAttribute("role", "button");
    const open = () => opts.onCreatorOpen(row.tag);
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
    tr.append(el("td", "", String(index + 1)));
    tr.append(el("td", "creator-name", row.label));
    tr.append(el("td", "", String(row.n)));
    for (const item of CREATOR_METRICS) {
      const value = creatorValue(row, item.key);
      const missing = value == null || !Number.isFinite(Number(value));
      tr.append(el("td", "", formatMetric(item.key, missing ? null : value)));
    }
    body.append(tr);
  });
  table.append(head, body);
  wrap.append(table);
  return wrap;
}

function unknownBlock(unknown, opts) {
  const box = el("section", "creator-unknown");
  box.append(el("h3", "", UNKNOWN_LABEL));
  box.append(el("p", "creator-note", `${unknown.n} แอด · Spend ${formatMetric("spend", unknown.spend)} · Revenue ${formatMetric("revenue", unknown.revenue)} · ROAS ${formatMetric("roas", unknown.roas)} · กลุ่มนี้ไม่อยู่ในอันดับคนที่รู้ชื่อ แต่ถูกนับในยอดรวม`));
  const button = el("button", "", "ดูแอดในกลุ่มนี้");
  button.type = "button";
  button.dataset.creator = "~unknown";
  button.addEventListener("click", () => opts.onCreatorOpen(""));
  box.append(button);
  return box;
}

function creatorAds(groups, opts) {
  const tag = opts.creatorFocus;
  const group = groups.find((row) => row.tag === tag);
  const panel = el("section", "creator-ads");
  panel.id = "creator-ads";
  panel.tabIndex = -1;
  const title = group ? group.label : UNKNOWN_LABEL;
  panel.append(el("h3", "", `แอดของ ${title} · ${reportLabel(opts.reportId)}`));
  const close = el("button", "creator-close", "ปิดรายการแอด");
  close.type = "button";
  close.addEventListener("click", () => opts.onCreatorClose());
  panel.append(close);
  panel.append(el("p", "creator-note", "จัดตามป้ายที่มีอยู่ ไม่ได้แปลว่าคนนี้ทำให้เกิดยอด. Revenue คือ omni_purchase ไม่ใช่ BEP. CVR คือ Purchases ÷ Messages (ซื้อ/แชท)."));
  if (!group) {
    panel.append(el("p", "creator-note", "ไม่มีแอดของป้ายนี้ในช่วงที่เลือก"));
    return panel;
  }
  panel.append(el("p", "creator-note", `Spend ${formatMetric("spend", group.spend)} · Revenue ${formatMetric("revenue", group.revenue)} · ROAS ${formatMetric("roas", group.roas)} · Purchases ${formatMetric("purchases", group.purchases)} · ${group.n} แอด`));
  if ((opts.creatorBook || "all") === "all") {
    const mix = el("div", "creator-mix");
    mix.append(el("p", "creator-note", "Spend ตามเล่มในช่วงนี้ เป็นส่วนผสมของสินค้า ไม่ใช่การเทียบความสามารถ"));
    for (const [id, bookName] of BOOKS) {
      const part = creatorGroups(opts.deck.ads, opts.reportId, id).find((row) => row.tag === tag);
      const share = part && group.spend ? Math.round((part.spend / group.spend) * 100) : null;
      mix.append(el("p", "creator-note", `${bookName} · Spend ${formatMetric("spend", part ? part.spend : null)} · Revenue ${formatMetric("revenue", part ? part.revenue : null)} · ROAS ${formatMetric("roas", part ? part.roas : null)} · Purchases ${formatMetric("purchases", part ? part.purchases : null)} · ${part ? part.n : 0} แอด${share == null ? "" : ` · ${share}% ของ Spend ป้ายนี้`}`));
    }
    panel.append(mix);
  }
  const history = creatorHistory(opts.deck.ads, opts.creatorBook || "all", tag, "roas");
  panel.append(el("p", "creator-note", `ROAS พ.ค.–ต.ค. ของป้ายนี้: ${history.map((point) => `${point.short} ${point.value == null ? "—" : point.value.toFixed(2)}`).join(" · ")}. เดือนที่ว่างคือไม่มีรายการของป้ายนี้ ไม่ใช่วันเปิดตัว และไม่ได้เทียบเดือนก่อน. 1–7 พ.ย. ไม่อยู่บนเส้นเดือนเต็ม.`));
  const sorted = sortAds(group.ads, opts.creatorSort.key === "cvrProxy" ? "cvrProxy" : opts.creatorSort.key, opts.creatorSort.dir);
  for (const ad of sorted) {
    const row = el("article", "creator-ad");
    const name = el("button", "ad-name creator-ad-name", ad.adName);
    name.type = "button";
    name.title = ad.adName;
    name.addEventListener("click", () => openDetail(ad, (opts.status.ads_by_id || {})[ad.adId], opts));
    row.append(name);
    const bookName = BOOKS.find((item) => item[0] === ad.book)?.[1] || ad.book;
    row.append(el("p", "creator-note", bookName));
    const bits = el("div", "creator-ad-metrics");
    const rate = rates(ad);
    const cells = [
      ["Spend", formatMetric("spend", ad.spend)],
      ["Revenue", formatMetric("revenue", ad.revenue)],
      ["ROAS", formatMetric("roas", rate.roas)],
      ["Messages", formatMetric("chats", ad.chats)],
      ["Cost per Message", formatMetric("costPerMsg", rate.costPerMsg)],
      ["CPM", formatMetric("cpm", rate.cpm)],
      ["Purchases", formatMetric("purchases", ad.purchases)],
      ["CVR", formatMetric("cvrProxy", rate.cvrProxy)],
      ["AOV", formatMetric("aov", rate.aov)],
    ];
    for (const [label, value] of cells) {
      const cell = el("span", "", `${label} ${value}`);
      bits.append(cell);
    }
    row.append(bits);
    panel.append(row);
  }
  return panel;
}

function renderAnalysis(root, opts) {
  const page = el("section", "analysis-page");
  page.append(el("h2", "web-title", "วิเคราะห์ต่อยอด"));
  page.append(el("p", "analysis-lead", "รายการที่เลือกเองจากตาราง ไม่ได้จัดอันดับให้ และไม่ได้แนะนำให้เลือกข้อความใด"));
  const picks = Object.values(opts.picks || {});
  if (!picks.length) {
    page.append(el("p", "analysis-empty", "ยังไม่ได้เลือกข้อความ กลับไปที่ตารางแล้วกด เลือก"));
  }
  for (const item of picks) {
    page.append(analysisCard(item, opts));
  }
  const legacy = (opts.legacyNotes || []).filter((note) => note.text && note.text.trim());
  if (legacy.length) {
    const old = el("details", "legacy-notes");
    old.append(el("summary", "", "บันทึกเดิมที่เคยอยู่บนสไลด์"));
    old.append(el("p", "analysis-lead", "เก็บบันทึกชุดเดิมไว้ ไม่ได้ลบ และไม่ได้เอาไปปนกับรายการที่เลือก"));
    for (const note of legacy) {
      const block = el("article", "legacy-note");
      block.append(el("strong", "", note.id));
      block.append(el("p", "", note.text));
      old.append(block);
    }
    page.append(old);
  }
  root.append(page);
}

function analysisCard(item, opts) {
  const ad = (opts.deck.ads || []).find((row) => row.adId === item.adId && row.period === item.reportPeriod);
  const card = el("article", "analysis-card is-picked");
  card.dataset.analysis = item.itemId;
  const media = el("div", "scan-ph", "");
  const body = el("div", "analysis-body");
  const title = el("h3", "ad-name", ad ? ad.adName : item.adId);
  title.title = ad ? ad.adName : item.adId;
  body.append(title);
  body.append(el("p", "analysis-context", [
    BOOK_LABEL[item.book] || item.book,
    item.contentMonthLabel || "ไม่ระบุเดือน Content",
    "ผลลัพธ์ช่วง " + (PERIOD_LABEL[item.reportPeriod] || item.reportPeriod),
  ].join(" · ")));
  if (ad) body.append(metricLine(ad));
  else {
    const reason = opts.deck.exclusionReasons?.[item.adId];
    const why = item.reportPeriod === "oct1_7"
      ? "ไม่มีช่วง 1–7 ต.ค. ในชุดที่ยืนยันรอบนี้"
      : (reason || "ไม่ได้อยู่ในรายการที่ยืนยันเล่มได้ช่วงนี้");
    body.append(el("p", "analysis-excluded", `ไม่รวมยอด: ${why}`));
  }
  const area = document.createElement("textarea");
  area.className = "analysis-note";
  area.maxLength = 20000;
  area.placeholder = "วิเคราะห์ต่อยอดจากข้อความนี้";
  area.setAttribute("aria-label", "บันทึกวิเคราะห์");
  area.value = Object.prototype.hasOwnProperty.call(opts.drafts || {}, item.itemId) ? opts.drafts[item.itemId] : (item.text || "");
  const status = el("p", "analysis-status", item.text ? "บันทึกแล้ว" : "ยังไม่มีบันทึกวิเคราะห์");
  status.dataset.analysisStatus = item.itemId;
  area.addEventListener("input", () => {
    opts.onDraft(item.itemId, area.value);
    status.textContent = "มีการแก้ไขที่ยังไม่บันทึก";
    clearTimeout(timers[item.itemId]);
    timers[item.itemId] = setTimeout(() => opts.onSave(item.itemId, area.value), 700);
  });
  const remove = el("button", "analysis-remove", "เอาออกจากรายการ");
  remove.type = "button";
  remove.addEventListener("click", () => opts.onRemove(item.itemId));
  body.append(area, status, remove);
  card.append(media, body);
  return card;
}

const timers = {};

function metricLine(ad) {
  const rate = rates(ad);
  const line = el("p", "analysis-metrics");
  const bits = [
    ["Spend", baht(ad.spend)],
    ["Revenue", baht(ad.revenue)],
    ["ROAS", rate.roas == null ? "—" : rate.roas.toFixed(2)],
    ["Messages", num(ad.chats)],
    ["Cost per Message", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)],
    ["CPM", rate.cpm == null ? "—" : baht(rate.cpm)],
    ["Purchases", num(ad.purchases)],
    ["CVR", rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%"],
    ["AOV", rate.aov == null ? "—" : baht(rate.aov)],
  ];
  for (const [label, value] of bits) {
    const bit = el("span", "", value);
    bit.prepend(el("small", "", label));
    line.append(bit);
  }
  return line;
}

function coloredNum(metric, text, tone) {
  const node = el("span", "scan-num cell-" + tone, text);
  const label = TONE_LABEL[tone] || TONE_LABEL.neutral;
  node.dataset.metric = metric;
  node.dataset.tone = tone;
  node.title = label;
  node.setAttribute("aria-label", text + " " + label);
  return node;
}

function volumeNum(metric, text) {
  return coloredNum(metric, text, "volume");
}

function legend() {
  const box = el("p", "tone-legend");
  box.append(el("span", "cell-better", TONE_LABEL.better));
  box.append(el("span", "cell-worse", TONE_LABEL.worse));
  box.append(el("span", "cell-neutral", TONE_LABEL.neutral));
  return box;
}

function compareLine(opts, book) {
  const baseId = sameLengthBase(opts.reportId);
  if (!baseId) return null;
  const current = opts.deck.bookTotals[opts.reportId]?.[book];
  const previous = opts.deck.bookTotals[baseId]?.[book];
  if (!current || !previous) return null;
  const line = el("p", "compare-line", `รายได้เทียบ ${reportLabel(baseId)} ${mom(current.revenue, previous.revenue)}`);
  return line;
}

let detailReturn = null;

function openDetail(ad, record, opts) {
  const dialog = document.getElementById("zoom");
  detailReturn = document.activeElement;
  const bookId = ad.book || opts.book;
  dialog.dataset.book = bookId || "";
  dialog.style.borderTopColor = BOOK_COLOR[bookId] || "#5B5BD6";
  document.getElementById("detail-name").textContent = ad.adName;
  const content = contentBadge(record);
  document.getElementById("detail-meta").textContent = [
    ad.creatorTag ? `Creator ${ad.creatorTag}` : "ไม่ทราบ Creator",
    content.text,
    `ผลลัพธ์ช่วง ${reportLabel(opts.reportId)}`,
    ad.bodyConflict ? "เนื้อครีเอทีฟไม่ตรงกับแท็กเล่มในชื่อแคมเปญและชื่อแอด ยอดนับตามแคมเปญ" : "",
    ad.metaOmitted ? "ระดับแคมเปญมียอดนี้ แต่ระดับแอดของ Meta ไม่ส่งแถวมา จึงโชว์เป็นแถวเดียวและนับในไม่ทราบ Creator" : "",
  ].filter(Boolean).join(" · ");
  const rate = rates(ad);
  const bookTotals = opts.deck.bookTotals[opts.reportId]?.[ad.book || opts.book];
  const bookRate = bookTotals ? rates(bookTotals) : {};
  const bits = [
    ["Spend", baht(ad.spend), "volume"],
    ["Revenue", baht(ad.revenue), "volume"],
    ["ROAS", rate.roas == null ? "—" : rate.roas.toFixed(2), metricTone("roas", rate.roas, bookRate.roas)],
    ["Messages", num(ad.chats), "volume"],
    ["Cost per Message", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg), metricTone("costPerMsg", rate.costPerMsg, bookRate.costPerMsg)],
    ["CPM", rate.cpm == null ? "—" : baht(rate.cpm), metricTone("cpm", rate.cpm, bookRate.cpm)],
    ["Purchases", num(ad.purchases), "volume"],
    ["CVR", rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%", metricTone("cvrProxy", rate.cvrProxy, bookRate.cvrProxy)],
    ["AOV", rate.aov == null ? "—" : baht(rate.aov), metricTone("aov", rate.aov, bookRate.aov)],
  ];
  const grid = document.getElementById("detail-metrics");
  grid.replaceChildren();
  for (const [label, value, tone] of bits) {
    const cell = el("p", "detail-bit");
    cell.append(el("small", "", label), document.createTextNode(value));
    if (tone === "better" || tone === "worse") {
      const higher = label === "ROAS" || label === "CVR" || label === "AOV";
      const above = (tone === "better") === higher;
      cell.append(el("em", "cell-" + tone, above ? "สูงกว่าเส้นเล่ม" : "ต่ำกว่าเส้นเล่ม"));
    }
    grid.append(cell);
  }
  const source = document.getElementById("detail-source");
  source.replaceChildren();
  const href = ad.ig || ad.fb || "";
  if (href) {
    const link = document.createElement("a");
    link.href = href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "ลิงก์โพสต์ที่มีอยู่";
    source.append(link);
  } else source.textContent = "ไม่มีลิงก์โพสต์ในชุดนี้";
  document.getElementById("detail-note").textContent = "Revenue คือ omni_purchase ที่ Meta นับให้แอด ไม่ใช่ยอดขาย BEP. CVR คือ Purchases ÷ Messages ไม่ใช่ CVR ที่ Meta จับคู่. เส้นเล่มคือยอดทั้งช่วงที่เลือก ไม่ใช่เกณฑ์กำไร.";
  if (!dialog.dataset.bound) {
    dialog.addEventListener("close", () => {
      if (detailReturn && detailReturn.focus) detailReturn.focus();
    });
    dialog.dataset.bound = "1";
  }
  dialog.showModal();
}

function sourceLink(ad) {
  const href = ad.ig || ad.fb || "";
  if (!href) return el("span", "scan-open muted", "—");
  const anchor = document.createElement("a");
  anchor.className = "scan-open";
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = "เปิด";
  return anchor;
}

function roasCell(value, baseline) {
  const tone = metricTone("roas", value, baseline);
  const cell = el("div", "scan-roas");
  cell.dataset.metric = "roas";
  cell.dataset.tone = tone;
  const track = el("div", "scan-track");
  const scale = Math.max(3, baseline || 0, value || 0, 0.01);
  const fill = el("i", tone === "worse" ? "under" : tone === "better" ? "over" : "neutral");
  fill.style.width = (value == null ? 0 : Math.min(100, (value / scale) * 100)) + "%";
  track.append(fill);
  if (baseline != null) {
    const mark = el("b", "scan-mark");
    mark.style.left = Math.min(100, (baseline / scale) * 100) + "%";
    track.append(mark);
  }
  const figure = value == null ? "—" : value.toFixed(2);
  const number = el("strong", "cell-" + tone, figure);
  const label = TONE_LABEL[tone] || TONE_LABEL.neutral;
  number.title = label;
  number.setAttribute("aria-label", figure + " " + label);
  cell.append(track, number);
  return cell;
}
