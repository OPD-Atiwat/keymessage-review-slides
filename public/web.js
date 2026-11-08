import { analysisItemId } from "/shared/analysis.js?v=20261108t104";
import { rates } from "/shared/metrics.js?v=20261108t104";
import { comparisonRows } from "/shared/comparison.js?v=20261108t104";
import { FROZEN_PERFORMANCE } from "/shared/cutoff.js?v=20261108t104";
import { changePct, metricTone, sameLengthBase, TONE_LABEL } from "/shared/conditional.js?v=20261108t104";
import { contentBadge, statusBadge, STATUS_CHECKED_LABEL } from "/shared/status-labels.js?v=20261108t104";
import { TABLE_HEAD } from "/shared/labels.js?v=20261108t104";
import { OVERVIEW_METRICS, OVERVIEW_MONTHS, metricCell } from "/shared/history.js?v=20261108t104";
import { previewFor } from "/shared/previews.js?v=20261108t104";
import { orderMonthAds } from "/shared/reading-order.js?v=20261108t104";

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
  return { may: "พ.ค. 2569", jun: "มิ.ย. 2569", jul: "ก.ค. 2569", aug: "ส.ค. 2569", sep: "ก.ย. 2569", oct: "ต.ค. 2569", oct1_7: "1–7 ต.ค. 2569", nov1_7: "1–7 พ.ย. 2569" }[id] || id;
}
function opening(ad) {
  const body = (ad.body || "").trim();
  if (!body) return "";
  return body.split(/\s+\/\s+/)[0];
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
  else renderOverview(root, opts);
}

function renderOverview(root, opts) {
  const snap = opts.deck.snapshot || {};
  root.append(el("h2", "web-title", "ภาพรวมรายเดือน"));
  root.append(el("p", "history-help", `${snap.coverage || "เฉพาะรายการที่ยืนยันเล่มได้"} · ถึง ${snap.frozenThrough || "7 พ.ย. 2569"} · ตรวจ ${snap.pulled || ""} · สีบนอัตราเป็นแนวโน้มในเล่ม ไม่ใช่กำไร · 1–7 พ.ย. ไม่ได้เทียบเดือนเต็ม · — ไม่ใช่ 0`));
  const method = el("details", "history-method");
  method.append(el("summary", "", "วิธีนับ"));
  method.append(el("p", "history-help", [snap.channel, snap.method, snap.attribution, snap.revision, snap.optionalCrossRange].filter(Boolean).join(" · ")));
  root.append(method);
  for (const [id, name] of BOOKS) root.append(metricTable(opts.deck.bookTotals, id, name, opts));
  root.append(exclusionNote(opts.deck));
}

function metricTable(bookTotals, bookId, name, opts) {
  const section = el("section", "metric-book");
  const title = el("h3", "");
  const open = el("button", "metric-book-name", name);
  open.type = "button";
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
  const name = BOOKS.find((item) => item[0] === opts.book)?.[1] || opts.book;
  root.append(bookTable(name, opts.book, opts, opts.book));
}

function bookTable(name, book, opts, pageKey) {
  const wrap = el("section", "scan-sheet");
  const totals = opts.deck.bookTotals[opts.reportId]?.[book];
  if (!totals) {
    wrap.append(el("h2", "", `${name} · ${reportLabel(opts.reportId)}`));
    wrap.append(el("p", "web-sub", "ไม่มีรายการที่ยืนยันได้"));
    return wrap;
  }
  const baseline = roasOf(totals);
  const rows = orderMonthAds(comparisonRows({
    ads: opts.deck.ads,
    statusById: opts.status.ads_by_id,
    book,
    period: opts.reportId,
    contentId: opts.contentId,
    statusId: opts.statusId,
  }), opts.status.ads_by_id);
  const head = el("header", "scan-top");
  const titles = el("div");
  titles.append(el("h2", "", `${name} · ${reportLabel(opts.reportId)}`));
  titles.append(el("p", "scan-count", `${rows.length} แอดในช่วงนี้ · เปิดใช้งานจากสแนปช็อตอยู่บนสุด · ${STATUS_CHECKED_LABEL} · ไม่ได้ยืนยันว่ากำลังส่ง และไม่ได้กรองเดือน Content`));
  head.append(titles, legend());
  wrap.append(head);
  const compare = compareLine(opts, book);
  if (compare) wrap.append(compare);
  wrap.append(totalRow(totals, baseline, reportLabel(opts.reportId)));
  wrap.append(columnHead(baseline));
  const bookRate = rates(totals);
  rows.length ? rows.forEach((ad, index) => wrap.append(scanRow(ad, index + 1, baseline, bookRate, opts.status.ads_by_id[ad.adId], opts))) : wrap.append(el("p", "web-sub", "ไม่มีแอดในช่วงนี้"));
  return wrap;
}

function totalRow(totals, baseline, label) {
  const rate = rates(totals);
  const row = el("div", "scan-total scan-cols");
  const labelCell = el("span", "scan-total-label", `ยอดเล่ม · ผลลัพธ์ช่วง ${label}`);
  row.append(labelCell);
  row.append(metric("Spend", baht(totals.spend)));
  row.append(metric("Revenue", baht(totals.revenue)));
  row.append(metric("ROAS", baseline == null ? "—" : baseline.toFixed(2)));
  row.append(metric("Messages", num(totals.chats)));
  row.append(metric("Cost per Message", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)));
  row.append(metric("CPM", rate.cpm == null ? "—" : baht(rate.cpm)));
  row.append(metric("Purchases", num(totals.purchases)));
  row.append(metric("CVR", rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%"));
  row.append(metric("AOV", rate.aov == null ? "—" : baht(rate.aov)));
  row.append(el("span", "", ""));
  return row;
}

function metric(label, value) {
  const cell = el("span", "scan-total-bit");
  cell.append(el("small", "", label), document.createTextNode(value));
  return cell;
}

function columnHead(baseline) {
  const head = el("div", "scan-head scan-cols");
  TABLE_HEAD.forEach((label) => {
    const text = label === "ROAS" && baseline != null ? `ROAS · เส้นเล่ม ${baseline.toFixed(2)}` : label;
    head.append(el("span", label === "Cost per Message" ? "wide" : "", text));
  });
  return head;
}

function scanRow(ad, index, baseline, bookRate, record, opts) {
  const rate = rates(ad);
  const row = el("article", "scan-row scan-cols");
  row.dataset.adId = ad.adId;
  row.append(el("span", "scan-rank", String(index)));
  row.append(thumb(ad, opts.previews));
  const name = el("div", "scan-name");
  const title = el("button", "ad-name", ad.adName);
  title.type = "button";
  title.title = ad.adName;
  title.addEventListener("click", () => openDetail(ad, opts.previews));
  name.append(title);
  const state = statusBadge(record);
  const status = el("span", "scan-status", state.text);
  status.title = state.detail;
  name.append(status);
  const badge = contentBadge(record);
  name.append(el("em", "", `${ad.creatorTag || "ไม่ระบุป้าย"} · ${badge.text}`));
  row.append(name);
  row.append(volumeNum("spend", baht(ad.spend)));
  row.append(volumeNum("revenue", baht(ad.revenue)));
  row.append(roasCell(rate.roas, baseline));
  row.append(volumeNum("chats", num(ad.chats)));
  row.append(coloredNum("costPerMsg", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg), metricTone("costPerMsg", rate.costPerMsg, bookRate.costPerMsg)));
  row.append(coloredNum("cpm", rate.cpm == null ? "—" : baht(rate.cpm), metricTone("cpm", rate.cpm, bookRate.cpm)));
  row.append(volumeNum("purchases", num(ad.purchases)));
  row.append(coloredNum("cvrProxy", rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%", metricTone("cvrProxy", rate.cvrProxy, bookRate.cvrProxy)));
  row.append(coloredNum("aov", rate.aov == null ? "—" : baht(rate.aov), metricTone("aov", rate.aov, bookRate.aov)));
  const actions = el("span", "scan-actions");
  actions.append(sourceLink(ad), pickButton(ad, opts));
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

const PERIOD_LABEL = { may: "พ.ค. 2569", jun: "มิ.ย. 2569", jul: "ก.ค. 2569", aug: "ส.ค. 2569", sep: "ก.ย. 2569", oct: "ต.ค. 2569", oct1_7: "1–7 ต.ค.", nov1_7: "1–7 พ.ย." };
const BOOK_LABEL = Object.fromEntries(BOOKS);

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
  const media = ad ? thumb(ad) : el("div", "scan-thumb scan-ph", "ไม่มีภาพ");
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

function openDetail(ad, manifest) {
  const dialog = document.getElementById("zoom");
  const target = document.getElementById("zoom-img");
  const caption = document.getElementById("zoom-caption");
  const frame = previewSource(ad, manifest);
  if (frame) {
    target.hidden = false;
    target.src = frame.src;
    target.alt = frame.alt;
  } else {
    target.hidden = true;
    target.removeAttribute("src");
  }
  caption.textContent = ad.adName + (opening(ad) ? "\n" + opening(ad) : "");
  dialog.showModal();
}

function previewSource(ad, manifest) {
  const ready = previewFor(manifest, ad.adId);
  if (ready) return ready;
  if (!ad.thumb) return null;
  return { src: "/media/" + ad.thumb, alt: ad.assetLabel || ad.adName };
}

function thumb(ad, manifest) {
  const frame = previewSource(ad, manifest);
  if (!frame) return el("div", "scan-thumb scan-ph", "ยังไม่มีภาพจากวิดีโอ");
  const button = el("button", "scan-thumb");
  button.type = "button";
  const img = document.createElement("img");
  img.src = frame.src;
  img.alt = frame.alt || ad.adName;
  button.append(img);
  button.title = frame.src.startsWith("/data/previews/") ? "ภาพจากวิดีโอ" : "ภาพนิ่งที่มีอยู่ ไม่ใช่เฟรมวิดีโอชุดใหม่";
  button.addEventListener("click", () => openDetail(ad, manifest));
  return button;
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
