import { rates } from "/shared/metrics.js";
import { comparisonRows, pageOf } from "/shared/comparison.js";
import { FROZEN_PERFORMANCE } from "/shared/cutoff.js";
import { STATUS_CHECKED_LABEL, contentBadge, statusBadge } from "/shared/status-labels.js";

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
  if (!previous) return "ใหม่/ไม่มีฐาน";
  const pct = ((current - previous) / previous) * 100;
  return (pct > 0 ? "+" : "") + pct.toFixed(1) + "%";
}
function reportLabel(id) {
  return { sep: "ก.ย. ทั้งเดือน", oct: "ต.ค. ทั้งเดือน", oct1_7: "1–7 ต.ค.", nov1_7: FROZEN_PERFORMANCE.novMtdLabel }[id] || id;
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
  root.append(banner());
  if (opts.view === "book") renderBook(root, opts);
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
  const sep = opts.deck.bookTotals.sep[opts.book];
  const oct = opts.deck.bookTotals.oct[opts.book];
  root.append(el("p", "web-sub", `${name} · ก.ย. ROAS ${roasText(sep)} · ต.ค. ROAS ${roasText(oct)} · MoM รายได้ ${mom(oct.revenue, sep.revenue)} · ${FROZEN_PERFORMANCE.novMtdLabel} ROAS ${roasText(opts.deck.bookTotals.nov1_7[opts.book])}`));
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
  const pill = el("p", "ref-pill");
  pill.append(el("i"), document.createTextNode(`${name} · ตารางเทียบ`));
  titles.append(pill);
  titles.append(el("h2", "", `${name} · ${reportLabel(opts.reportId)}`));
  titles.append(el("div", "ref-rule"));
  head.append(titles, el("p", "ref-page", `${paged.page + 1} / ${paged.pages}`));
  wrap.append(head);
  wrap.append(totalRow(totals, baseline, reportLabel(opts.reportId)));
  wrap.append(columnHead(baseline));
  rows.length ? paged.slice.forEach((ad, index) => wrap.append(scanRow(ad, paged.page * PAGE + index + 1, baseline, opts.status.ads_by_id[ad.adId], opts.reportId))) : wrap.append(el("p", "web-sub", "ไม่มีแอดในช่วงนี้"));
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
  row.append(metric("ROAS", baseline == null ? "—" : baseline.toFixed(2)));
  row.append(metric("รายได้", baht(totals.revenue)));
  row.append(metric("แชท", num(totals.chats)));
  row.append(metric("บาท/แชท", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)));
  row.append(metric("CPM", rate.cpm == null ? "—" : baht(rate.cpm)));
  row.append(metric("ซื้อ", num(totals.purchases)));
  row.append(metric("ซื้อ÷แชท", rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%"));
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
  ["#", "", "แอด", "Spend", `ROAS · เส้นเล่ม ${baseline == null ? "—" : baseline.toFixed(2)}`, "รายได้", "แชท", "บาท/แชท", "CPM", "ซื้อ", "ซื้อ÷แชท", "AOV", ""].forEach((label) => head.append(el("span", "", label)));
  return head;
}

function scanRow(ad, index, baseline, record) {
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
  row.append(el("span", "scan-spend", baht(ad.spend)));
  row.append(roasCell(rate.roas, baseline));
  row.append(el("span", "scan-num", baht(ad.revenue)));
  row.append(el("span", "scan-num", num(ad.chats)));
  row.append(el("span", "scan-num", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)));
  row.append(el("span", "scan-num", rate.cpm == null ? "—" : baht(rate.cpm)));
  row.append(el("span", "scan-num", num(ad.purchases)));
  row.append(el("span", "scan-num", rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%"));
  row.append(el("span", "scan-num", rate.aov == null ? "—" : baht(rate.aov)));
  row.append(sourceLink(ad));
  return row;
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
  const cell = el("div", "scan-roas");
  const track = el("div", "scan-track");
  const scale = Math.max(3, baseline || 0, value || 0);
  const fill = el("i", value != null && baseline != null && value < baseline ? "under" : "over");
  fill.style.width = (value == null ? 0 : Math.min(100, (value / scale) * 100)) + "%";
  track.append(fill);
  if (baseline != null) {
    const mark = el("b", "scan-mark");
    mark.style.left = Math.min(100, (baseline / scale) * 100) + "%";
    track.append(mark);
  }
  cell.append(track, el("strong", value != null && baseline != null && value < baseline ? "under" : "over", value == null ? "—" : value.toFixed(2)));
  return cell;
}
