import { analysisItemId } from "/shared/analysis.js?v=20261108t99";
import { rates } from "/shared/metrics.js?v=20261108t99";
import { comparisonRows, pageOf } from "/shared/comparison.js?v=20261108t99";
import { FROZEN_PERFORMANCE } from "/shared/cutoff.js?v=20261108t99";
import { changePct, metricTone, sameLengthBase, TONE_LABEL } from "/shared/conditional.js?v=20261108t99";
import { contentBadge } from "/shared/status-labels.js?v=20261108t99";
import { TABLE_HEAD } from "/shared/labels.js?v=20261108t99";

const BOOKS = [
  ["Mind", "ถือไพ่เหนือกว่า"],
  ["Coworkers", "ออฟฟิศนี้เฮงซวย"],
  ["SurvivalGuide", "Survival Guide"],
  ["Trap", "กับดักความรู้สึกผิด"],
];
const PAGE = 6;

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
  return { sep: "ก.ย. ทั้งเดือน", oct: "ต.ค. ทั้งเดือน", oct1_7: "1–7 ต.ค. 2569", nov1_7: "1–7 พ.ย. 2569" }[id] || id;
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
  root.append(el("h2", "web-title", "ภาพรวมทั้งเดือน แยกเล่ม"));
  const board = el("div", "month-board");
  const head = el("div", "month-head");
  ["เล่ม", "ก.ย. ทั้งเดือน", "ต.ค. ทั้งเดือน", "MoM รายได้", "1–7 พ.ย. ถึงวานนี้"].forEach((label) => head.append(el("span", "", label)));
  board.append(head);
  for (const [id, name] of BOOKS) {
    const sep = opts.deck.bookTotals.sep[id];
    const oct = opts.deck.bookTotals.oct[id];
    const nov = opts.deck.bookTotals.nov1_7[id];
    const row = el("button", "month-row");
    row.type = "button";
    row.append(el("span", "month-name", name));
    row.append(mini(sep));
    row.append(mini(oct));
    row.append(el("b", "", mom(oct.revenue, sep.revenue)));
    row.append(mini(nov));
    row.addEventListener("click", () => opts.onBook(id));
    board.append(row);
  }
  root.append(board);
  for (const [id, name] of BOOKS) {
    root.append(bookTable(name, id, opts, `ov-${id}`));
  }
}

function mini(totals) {
  const cell = el("div");
  cell.append(el("b", "", roasText(totals)));
  cell.append(el("span", "", `${baht(totals.spend)} → ${baht(totals.revenue)}`));
  return cell;
}

function renderBook(root, opts) {
  const name = BOOKS.find((item) => item[0] === opts.book)?.[1] || opts.book;
  root.append(bookTable(name, opts.book, opts, opts.book));
}

function bookTable(name, book, opts, pageKey) {
  const wrap = el("section", "scan-sheet");
  const totals = opts.deck.bookTotals[opts.reportId][book];
  const baseline = roasOf(totals);
  const rows = comparisonRows({
    ads: opts.deck.ads,
    statusById: opts.status.ads_by_id,
    book,
    period: opts.reportId,
    contentId: opts.contentId,
    statusId: opts.statusId,
  });
  const paged = pageOf(rows, opts.pages?.[pageKey] || 0, PAGE);
  const head = el("header", "scan-top");
  const titles = el("div");
  titles.append(el("h2", "", `${name} · ${reportLabel(opts.reportId)}`));
  titles.append(el("div", "ref-rule"));
  const aside = el("div", "scan-aside");
  aside.append(el("p", "ref-page", `${paged.page + 1} / ${paged.pages}`));
  aside.append(legend());
  head.append(titles, aside);
  wrap.append(head);
  const compare = compareLine(opts, book);
  if (compare) wrap.append(compare);
  wrap.append(totalRow(totals, baseline, reportLabel(opts.reportId)));
  wrap.append(columnHead(baseline));
  const bookRate = rates(totals);
  rows.length ? paged.slice.forEach((ad, index) => wrap.append(scanRow(ad, paged.page * PAGE + index + 1, baseline, bookRate, opts.status.ads_by_id[ad.adId], opts))) : wrap.append(el("p", "web-sub", "ไม่มีแอดในช่วงนี้"));
  const pager = el("div", "scan-pager");
  const prev = el("button", "", "ก่อนหน้า");
  prev.type = "button";
  prev.disabled = paged.page === 0;
  prev.addEventListener("click", () => opts.onPage(pageKey, paged.page - 1));
  const next = el("button", "", "ถัดไป");
  next.type = "button";
  next.disabled = paged.page >= paged.pages - 1;
  next.addEventListener("click", () => opts.onPage(pageKey, paged.page + 1));
  pager.append(prev, el("span", "", `${rows.length} แอด · ไม่ได้ยุบแอดที่ใช้ข้อความเดียวกัน`), next);
  wrap.append(pager);
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
  row.append(el("span", "scan-rank", String(index)));
  row.append(thumb(ad));
  const name = el("div", "scan-name");
  const title = el("button", "ad-name", ad.adName);
  title.type = "button";
  title.title = ad.adName;
  title.addEventListener("click", () => openDetail(ad));
  name.append(title);
  const badge = contentBadge(record);
  name.append(el("em", "", `${ad.creatorTag} · ${badge.text}`));
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

const PERIOD_LABEL = { sep: "ก.ย. ทั้งเดือน", oct: "ต.ค. ทั้งเดือน", oct1_7: "1–7 ต.ค.", nov1_7: "1–7 พ.ย." };
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
  const current = opts.deck.bookTotals[opts.reportId][book];
  const previous = opts.deck.bookTotals[baseId][book];
  const line = el("p", "compare-line", `รายได้เทียบ ${reportLabel(baseId)} ${mom(current.revenue, previous.revenue)}`);
  return line;
}

function openDetail(ad) {
  const dialog = document.getElementById("zoom");
  const target = document.getElementById("zoom-img");
  const caption = document.getElementById("zoom-caption");
  if (ad.thumb) {
    target.hidden = false;
    target.src = "/media/" + ad.thumb;
    target.alt = ad.assetLabel || ad.adName;
  } else {
    target.hidden = true;
    target.removeAttribute("src");
  }
  caption.textContent = ad.adName + (opening(ad) ? "\n" + opening(ad) : "");
  dialog.showModal();
}

function thumb(ad) {
  if (!ad.thumb) {
    const empty = el("div", "scan-thumb scan-ph", "ไม่มีภาพ");
    return empty;
  }
  const button = el("button", "scan-thumb");
  button.type = "button";
  const img = document.createElement("img");
  img.src = "/media/" + ad.thumb;
  img.alt = ad.assetLabel || ad.adName;
  button.append(img);
  button.title = ad.assetKind === "video-still" ? "ภาพนิ่ง ไม่ใช่คลิปที่เล่นได้" : (ad.assetLabel || "");
  button.addEventListener("click", () => {
    const dialog = document.getElementById("zoom");
    const target = document.getElementById("zoom-img");
    target.src = img.src;
    target.alt = img.alt;
    dialog.showModal();
  });
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
