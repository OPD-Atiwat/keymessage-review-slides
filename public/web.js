import { rates } from "/shared/metrics.js";
import { FROZEN_PERFORMANCE } from "/shared/cutoff.js";
import { STATUS_CHECKED_LABEL, contentBadge, isQuarantine, statusBadge } from "/shared/status-labels.js";

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
function roasText(totals) {
  if (!totals || !totals.spend) return "—";
  const value = rates(totals).roas;
  return value == null ? "—" : value.toFixed(2);
}
function mom(current, previous) {
  if (!previous) return "ใหม่/ไม่มีฐาน";
  const pct = ((current - previous) / previous) * 100;
  return (pct > 0 ? "+" : "") + pct.toFixed(1) + "%";
}

function banner() {
  const box = el("section", "cutoff");
  box.append(el("strong", "", FROZEN_PERFORMANCE.throughLabel));
  box.append(el("span", "", "เวลาไทย · " + FROZEN_PERFORMANCE.novMtdLabel));
  box.append(el("span", "cutoff-status", STATUS_CHECKED_LABEL + " — สถานะบัญชีตอนตรวจ ไม่ใช่ผลลัพธ์วันที่ 7 และย้อนสถานะเมื่อวานไม่ได้"));
  box.append(el("span", "", FROZEN_PERFORMANCE.rule));
  return box;
}

function periodCell(totals) {
  const cell = el("div");
  cell.append(el("b", "", roasText(totals)));
  cell.append(el("span", "", `${baht(totals.spend)} → ${baht(totals.revenue)}`));
  return cell;
}

export function renderWeb(root, { deck, status, view, book, reportId, contentId, statusId, onBook }) {
  root.replaceChildren();
  root.append(banner());
  if (view === "book") renderBook(root, { deck, status, book, reportId, contentId, statusId });
  else if (view === "ads") renderAds(root, { deck, status, book, reportId, contentId, statusId });
  else renderOverview(root, { deck, status, onBook });
}

function renderOverview(root, { deck, status, onBook }) {
  root.append(el("h2", "web-title", "ภาพรวมรายเดือน แยกเล่ม"));
  root.append(el("p", "web-sub", "ก.ย. และ ต.ค. เป็นทั้งเดือน พ.ย. นับถึง 7 พ.ย. เท่านั้น"));
  const table = el("div", "month-board");
  const head = el("div", "month-head");
  ["เล่ม", "ก.ย. ทั้งเดือน", "ต.ค. ทั้งเดือน", "MoM รายได้", "1–7 พ.ย. ถึงวานนี้"].forEach((label) => head.append(el("span", "", label)));
  table.append(head);
  for (const [id, name] of BOOKS) {
    const sep = deck.bookTotals.sep[id];
    const oct = deck.bookTotals.oct[id];
    const nov = deck.bookTotals.nov1_7[id];
    const row = el("button", "month-row");
    row.type = "button";
    row.append(el("span", "month-name", name));
    row.append(periodCell(sep));
    row.append(periodCell(oct));
    row.append(el("b", "", mom(oct.revenue, sep.revenue)));
    row.append(periodCell(nov));
    row.addEventListener("click", () => onBook(id));
    table.append(row);
  }
  root.append(table);
  root.append(statusBlock(status));
}

function statusBlock(status) {
  const box = el("section", "status-block");
  box.append(el("h2", "web-title", "สถานะบัญชี ณ ตอนตรวจ 8 พ.ย. 11:39"));
  box.append(el("p", "web-sub", "เปิดใช้งานหมายถึงสถานะ ACTIVE ตอนตรวจ ไม่ได้ยืนยันว่าวันนี้มีการส่งโฆษณา และไม่ใช่สถานะย้อนหลังของวันที่ 7"));
  const counts = { Mind: 0, Coworkers: 0, SurvivalGuide: 0, Trap: 0 };
  let quarantined = 0;
  for (const record of Object.values(status.ads_by_id)) {
    if (isQuarantine(record)) {
      quarantined += 1;
      continue;
    }
    if (record.effective_status === "ACTIVE") counts[record.book] += 1;
  }
  const row = el("div", "month-row");
  for (const [id, name] of BOOKS) row.append(el("span", "", `${name} ${counts[id]}`));
  box.append(row);
  box.append(el("p", "web-sub", `รวมเปิดใช้งานใน 4 เล่ม ${Object.values(counts).reduce((a, b) => a + b, 0)} ตัว ไม่นับ ${quarantined} แอดที่ตัดออกจากยอด ครอบคลุมเฉพาะแอดใน ก.ย.–7 พ.ย. ไม่ใช่ทั้งบัญชี`));
  return box;
}

function renderBook(root, { deck, status, book, reportId, contentId, statusId }) {
  const name = BOOKS.find((item) => item[0] === book)?.[1] || book;
  const sep = deck.bookTotals.sep[book];
  const oct = deck.bookTotals.oct[book];
  const nov = deck.bookTotals.nov1_7[book];
  root.append(el("h2", "web-title", name));
  const board = el("div", "month-board book-board");
  const head = el("div", "month-head");
  ["ช่วงผลลัพธ์", "Spend", "รายได้ Meta", "ROAS", "แชท", "บาท/แชท"].forEach((label) => head.append(el("span", "", label)));
  board.append(head);
  for (const [label, totals] of [["ก.ย. ทั้งเดือน", sep], ["ต.ค. ทั้งเดือน", oct], [FROZEN_PERFORMANCE.novMtdLabel, nov]]) {
    const rate = rates(totals);
    const row = el("div", "month-row");
    [label, baht(totals.spend), baht(totals.revenue), roasText(totals), num(totals.chats), rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)].forEach((value) => row.append(el("span", "", value)));
    board.append(row);
  }
  root.append(board);
  root.append(el("p", "web-sub", `MoM รายได้ ต.ค. เทียบ ก.ย. ${mom(oct.revenue, sep.revenue)} · ด้านล่างคือข้อความในช่วงผลลัพธ์ที่เลือก ไม่ได้เปลี่ยนเดือน Content`));
  const messages = deck.messages.filter((message) => message.book === book && message.periods[reportId] && message.periods[reportId].spend > 0);
  messages.sort((a, b) => b.periods[reportId].revenue - a.periods[reportId].revenue);
  for (const message of messages.slice(0, 8)) {
    const totals = message.periods[reportId];
    const months = new Set();
    for (const adId of message.adIds) {
      const record = status.ads_by_id[adId];
      if (!record || isQuarantine(record)) continue;
      months.add(contentBadge(record).text);
    }
    const card = el("article", "msg-card");
    card.append(el("h3", "", message.opening));
    card.append(el("p", "badge", [...months].join(" · ") || "ไม่ระบุเดือน Content"));
    card.append(el("p", "web-sub", `ผลลัพธ์ช่วง ${reportLabel(reportId)} · ROAS ${roasText(totals)} · Spend ${baht(totals.spend)} · แชท ${num(totals.chats)} · ${rates(totals).costPerMsg == null ? "—" : baht(rates(totals).costPerMsg)}/แชท`));
    root.append(card);
  }
  root.append(renderAds(el("div"), { deck, status, book, reportId, contentId, statusId }));
}

function reportLabel(id) {
  return {
    sep: "ก.ย. ทั้งเดือน",
    oct: "ต.ค. ทั้งเดือน",
    oct1_7: "1–7 ต.ค.",
    nov1_7: FROZEN_PERFORMANCE.novMtdLabel,
  }[id] || id;
}

function renderAds(root, { deck, status, book, reportId, contentId, statusId }) {
  root.append(el("h2", "web-title", "ตารางแอด"));
  root.append(el("p", "web-sub", `ผลลัพธ์ช่วง ${reportLabel(reportId)} คนละป้ายกับเดือน Content สถานะด้านล่างมาจากตอนตรวจ 8 พ.ย. 11:39`));
  const rows = [];
  const seen = new Set();
  for (const record of Object.values(status.ads_by_id)) {
    if (isQuarantine(record)) continue;
    if (book && record.book !== book) continue;
    const content = record.content_month || "unknown";
    if (contentId === "unknown" && content !== "unknown") continue;
    if (contentId && contentId !== "all" && contentId !== "unknown" && content !== contentId && content !== "unknown") continue;
    if (statusId && statusId !== "all" && record.effective_status !== statusId) continue;
    const metrics = deck.ads.find((ad) => ad.adId === record.ad_id && ad.period === reportId) || null;
    if (statusId === "all" && contentId === "all" && !metrics && record.effective_status !== "ACTIVE") continue;
    rows.push({ record, metrics });
    seen.add(record.ad_id);
  }
  rows.sort((a, b) => (b.metrics?.revenue || 0) - (a.metrics?.revenue || 0));
  const list = el("div", "ad-web");
  for (const { record, metrics } of rows.slice(0, 12)) {
    const badge = contentBadge(record);
    const state = statusBadge(record);
    const card = el("article", "ref-ad");
    const top = el("div", "top");
    const metricsAd = metrics || deck.ads.find((ad) => ad.adId === record.ad_id);
    if (metricsAd?.thumb) {
      const img = document.createElement("img");
      img.src = "/media/" + metricsAd.thumb;
      img.alt = metricsAd.assetLabel || "";
      top.append(img);
    } else top.append(el("div", "thumb-ph", "ไม่มีภาพ"));
    const text = el("div");
    text.append(el("h3", "ad-name", record.ad_name));
    text.append(el("p", "badge", badge.text));
    text.append(el("p", "ref-sub", `${record.book} · ${metricsAd?.creatorTag || "—"} · ${state.text}`));
    text.append(el("p", "ref-sub", state.checked));
    top.append(text);
    card.append(top);
    const line = el("div", "metrics");
    const rate = metrics ? rates(metrics) : null;
    const cells = [
      ["Spend", metrics ? baht(metrics.spend) : "—"],
      ["รายได้ Meta", metrics ? baht(metrics.revenue) : "—"],
      ["ROAS", rate?.roas == null ? "—" : rate.roas.toFixed(2)],
      ["แชท", metrics ? num(metrics.chats) : "—"],
      ["บาท/แชท", rate?.costPerMsg == null ? "—" : baht(rate.costPerMsg)],
      ["CPM", rate?.cpm == null ? "—" : baht(rate.cpm)],
      ["ซื้อ", metrics ? num(metrics.purchases) : "—"],
      ["ซื้อ÷แชท", rate?.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%"],
      ["AOV", rate?.aov == null ? "—" : baht(rate.aov)],
    ];
    if (!metrics) line.append(el("p", "ref-sub", "ไม่มีผลลัพธ์ในช่วงที่เลือก"));
    for (const [label, value] of cells) {
      const cell = el("div");
      cell.append(el("span", "", label), el("b", "", value));
      line.append(cell);
    }
    card.append(line);
    list.append(card);
  }
  root.append(list);
  root.append(el("p", "web-sub", `แสดง ${Math.min(12, rows.length)} จาก ${rows.length} แอดที่ผ่านตัวกรอง · เดือน Content ที่ไม่ระบุยังถูกแสดง · 2 แอด quarantine ไม่อยู่ในยอด`));
  return root;
}
