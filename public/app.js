import { analysisItemId } from "/shared/analysis.js?v=20261108t100";
import { changePct, metricTone, TONE_LABEL } from "/shared/conditional.js?v=20261108t100";
import { TABLE_HEAD } from "/shared/labels.js?v=20261108t100";
import { rates, sumTotals, volumeFlag } from "/shared/metrics.js?v=20261108t100";
import { MAX_NOTE, NOTE_IDS, SLIDE_IDS } from "/shared/slides.js?v=20261108t100";
import { contentBadge } from "/shared/status-labels.js?v=20261108t100";
import { renderWeb } from "/web.js?v=20261108t100";

const BOOKS = [
  { id: "Mind", name: "ถือไพ่เหนือกว่า", cls: "mind" },
  { id: "Coworkers", name: "ออฟฟิศนี้เฮงซวย", cls: "office" },
  { id: "SurvivalGuide", name: "Survival Guide", cls: "survival" },
  { id: "Trap", name: "กับดักความรู้สึกผิด", cls: "trap" },
];
const PERIODS = [
  { id: "sep", label: "ก.ย. ทั้งเดือน" },
  { id: "oct", label: "ต.ค. ทั้งเดือน" },
  { id: "oct1_7", label: "1–7 ต.ค." },
  { id: "nov1_7", label: "1–7 พ.ย." },
];
const SORTS = [
  ["revenue", "Revenue"],
  ["spend", "Spend"],
  ["roas", "ROAS"],
  ["chats", "Messages"],
  ["costPerMsg", "Cost per Message"],
  ["cpm", "CPM"],
  ["purchases", "Purchases"],
  ["cvr", "CVR"],
  ["aov", "AOV"],
];

const deckEl = document.getElementById("deck");
const slides = deckEl ? [...deckEl.querySelectorAll(".slide")] : [];
let deck = null;
let index = 0;
let userMoved = false;
const PERIOD_IDS = ["nov1_7", "oct1_7", "oct", "sep"];
const adState = { period: "nov1_7", book: "", tag: "", sort: "revenue", q: "", page: 0, bodyKey: "", contentId: "all", statusId: "all" };
let statusData = { ads_by_id: {}, summary: {} };
let webView = { view: "overview", book: "Mind", pages: {}, historyStart: 0 };

function setWebView(patch) {
  webView = {
    view: patch.view,
    book: patch.book === undefined ? webView.book : patch.book,
    pages: webView.pages,
    historyStart: webView.historyStart || 0,
  };
}
const slidePages = {};
const PRESENT_ROWS = 4;
const analysisState = { items: {}, drafts: {} };
const noteState = {
  configured: false,
  reason: "",
  authed: false,
  csrf: "",
  notes: {},
  dirty: {},
  conflict: {},
  timers: {},
  pendingImport: null,
};

const $ = (sel, root = document) => root.querySelector(sel);
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
  const value = rates(totals).roas;
  return value == null ? "—" : value.toFixed(2);
}
function periodLabel(id) {
  return PERIODS.find((item) => item.id === id)?.label || id;
}
function bookMeta(id) {
  return BOOKS.find((item) => item.id === id);
}
function safeUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return url.href;
  } catch {
    return "";
  }
}
function volumeText(totals) {
  return volumeFlag(totals) === "low" ? "ข้อมูลน้อย" : "พอใช้";
}
function confidenceText(value) {
  if (value === "A_roster") return "A ป้ายตรงชีต";
  if (value === "B_project_classifier") return "B กลุ่มเดิม";
  if (value === "C_adname_influencer") return "C influencer ยังไม่ยืนยัน";
  return "C ป้ายในชื่อแอด ยังไม่ยืนยัน";
}
function banner(message) {
  const node = document.getElementById("boot-error");
  node.hidden = false;
  node.textContent = message;
}

function initialIndex() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return 0;
  const asNumber = Number(hash);
  if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= SLIDE_IDS.length) return asNumber - 1;
  const found = SLIDE_IDS.indexOf(hash);
  return found >= 0 ? found : 0;
}

function show(next, fromUser) {
  index = Math.max(0, Math.min(SLIDE_IDS.length - 1, next));
  slides.forEach((slide, i) => slide.classList.toggle("active", i === index));
  $("#count").textContent = `${index + 1} / ${SLIDE_IDS.length}`;
  markNav();
  $("#prev").disabled = index === 0;
  $("#next").disabled = index === SLIDE_IDS.length - 1;
  const jump = $("#jump");
  if (jump.value !== String(index)) jump.value = String(index);
  if (fromUser) {
    userMoved = true;
    history.replaceState(null, "", `#${index + 1}`);
  }
  const dirtyId = SLIDE_IDS.find((id) => noteState.dirty[id]);
  if (dirtyId) saveNote(dirtyId);
}

function editableTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function bookTable(leftId, rightId) {
  const wrap = el("div");
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const hr = document.createElement("tr");
  ["เล่ม", periodLabel(leftId) + " Spend → รายได้", "ROAS", periodLabel(rightId) + " Spend → รายได้", "ROAS", "แชท", "บาท/แชท"].forEach((label) => {
    hr.append(el("th", "", label));
  });
  head.append(hr);
  table.append(head);
  const body = document.createElement("tbody");
  for (const book of BOOKS) {
    const left = deck.bookTotals[leftId][book.id];
    const right = deck.bookTotals[rightId][book.id];
    const tr = document.createElement("tr");
    [
      book.name,
      `${baht(left.spend)} → ${baht(left.revenue)}`,
      roasText(left),
      `${baht(right.spend)} → ${baht(right.revenue)}`,
      roasText(right),
      `${num(left.chats)} → ${num(right.chats)}`,
      `${rates(left).costPerMsg == null ? "—" : baht(rates(left).costPerMsg)} → ${rates(right).costPerMsg == null ? "—" : baht(rates(right).costPerMsg)}`,
    ].forEach((value) => tr.append(el("td", "", value)));
    body.append(tr);
  }
  table.append(body);
  wrap.append(table);
  wrap.append(el("p", "fine", "ROAS และบาท/แชทหารจากผลรวมของช่วง ไม่ใช่ค่าเฉลี่ยของรายแอด · 1–7 ต.ค. อยู่ในเดือน ต.ค. ห้ามบวกเข้าด้วยกัน · ไม่ใช่คำสั่งให้เพิ่มหรือปิดงบ"));
  return wrap;
}

function metricBits(totals) {
  const rate = rates(totals);
  return `Spend ${baht(totals.spend)} · รายได้ ${baht(totals.revenue)} · ROAS ${roasText(totals)} · แชท ${num(totals.chats)} · บาท/แชท ${rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)} · ซื้อ ${num(totals.purchases)}`;
}

function messageCard(message) {
  const book = bookMeta(message.book);
  const focus = message.periods[message.focus];
  const card = el("article", "msg " + book.cls);
  card.dataset.message = message.id;
  const top = el("div", "chips");
  top.append(el("span", "chip", book.name));
  top.append(el("span", "chip " + (volumeFlag(focus) === "low" ? "low" : ""), volumeText(focus)));
  top.append(el("span", "chip", "ข้อความเดียวกันทั้งแอด · " + message.adIds.length + " ชื่อ"));
  card.append(top);
  card.append(el("h2", "", message.opening));
  card.append(el("p", "metric-line", `${periodLabel(message.focus)} · ${metricBits(focus)}`));
  const across = PERIODS.map((period) => {
    const bucket = message.periods[period.id];
    if (!bucket || bucket.spend <= 0) return "";
    return `${period.label} ${roasText(bucket)}`;
  }).filter(Boolean);
  if (across.length) card.append(el("p", "fine", across.join(" · ")));
  card.append(el("p", "talk", message.talk));
  const button = el("button", "ghost", "ดูแอดของข้อความนี้");
  button.type = "button";
  button.addEventListener("click", () => {
    adState.bodyKey = message.bodyKey;
    adState.book = message.book;
    adState.period = message.focus;
    adState.page = 0;
    renderAds();
    show(SLIDE_IDS.indexOf("s10-ads"), true);
  });
  card.append(button);
  return card;
}

function messagesFor(slideId) {
  return deck.messages.filter((message) => message.slides.includes(slideId));
}

function renderMessageGrid(slideId) {
  const mount = document.querySelector(`[data-mount="${slideId}"]`);
  mount.replaceChildren();
  const grid = el("div", "cards");
  for (const message of messagesFor(slideId)) grid.append(messageCard(message));
  mount.append(grid);
  if (slideId === "s05-mind") {
    const count = deck.creatorEvidence.mindOctoberUnderOne.length;
    mount.append(el("p", "fine", `ป้ายชื่อในแอดของ Mind ที่มียอดใช้ใน ต.ค. มี ${count} ป้าย และทุกป้าย ROAS ต่ำกว่า 1 เมื่อหารจากผลรวมของป้ายนั้น เรื่องนี้อยู่ที่เล่มและข้อความ ไม่ใช่อันดับคน`));
  }
  if (slideId === "s06-coworkers") {
    const bits = deck.creatorEvidence.coworkersOctoberCentralSeparate.map((row) => {
      const cost = row.chats ? baht(row.spend / row.chats) : "—";
      return `${row.tag} ROAS ${row.roas == null ? "—" : Number(row.roas).toFixed(2)} · ${cost}/แชท`;
    });
    mount.append(el("p", "fine", "ป้าย Central, Central+Leef, Central+Park และ Central+Phum ไม่ได้ถูกรวมกัน เดือน ต.ค. ของออฟฟิศที่มี Spend: " + (bits.join(" · ") || "—")));
  }
}

function metricCell(label, value, title) {
  const cell = el("div");
  cell.append(el("span", "", label));
  const strong = el("b", "", value);
  if (title) strong.title = title;
  cell.append(strong);
  return cell;
}

function adCard(ad) {
  const card = el("article", "ad");
  card.dataset.adId = ad.adId;
  if (ad.thumb) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = "/media/" + ad.thumb;
    img.alt = ad.assetLabel;
    card.append(img);
  } else {
    card.append(el("div", "ph", ad.assetKind === "namecard" ? "นามบัตร ไม่ใช่ครีเอทีฟ" : "ไม่มีภาพที่ยืนยันได้"));
  }
  const main = el("div");
  main.append(el("h3", "ad-name", ad.adName));
  main.append(el("p", "fine", `${ad.creatorTag} · ${confidenceText(ad.confidence)} · ${ad.assetLabel}`));
  const rate = rates(ad);
  const metrics = el("div", "metrics");
  const cvr = rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%";
  metrics.append(
    metricCell("Spend", baht(ad.spend)),
    metricCell("รายได้ Meta", baht(ad.revenue)),
    metricCell("ROAS", rate.roas == null ? "—" : rate.roas.toFixed(2)),
    metricCell("แชท", num(ad.chats)),
    metricCell("บาท/แชท", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)),
    metricCell("CPM", rate.cpm == null ? "—" : baht(rate.cpm)),
    metricCell("ซื้อ", num(ad.purchases)),
    metricCell("ซื้อ÷แชท", cvr, rate.cvrProxy > 1 ? "เกิน 100% ได้ เพราะยอดซื้อไม่ได้ผูกกับแชท ไม่ใช่อัตราปิดการขายจริง" : ""),
    metricCell("AOV", rate.aov == null ? "—" : baht(rate.aov))
  );
  main.append(metrics);
  const links = el("p", "links");
  const ig = safeUrl(ad.ig);
  const fb = safeUrl(ad.fb);
  const ads = safeUrl(ad.adsManager);
  if (ig) links.append(link(ig, "เปิดโพสต์ IG (ยังไม่ยืนยันเนื้อหา)"));
  if (fb) links.append(link(fb, "Facebook (ต้องล็อกอิน)"));
  if (ads) links.append(link(ads, "Ads Manager (ต้องล็อกอิน)"));
  main.append(links);
  if (ad.body) {
    const details = document.createElement("details");
    details.className = "body-copy";
    details.append(el("summary", "", "ข้อความแอด"));
    details.append(el("p", "", ad.body));
    details.append(el("p", "fine", "จากข้อความแอด ไม่ได้ตรวจบทพูดในวิดีโอ และภาพนิ่งเล่นเป็นคลิปไม่ได้"));
    main.append(details);
  }
  card.append(main);
  return card;
}

function link(href, label) {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer";
  anchor.textContent = label;
  return anchor;
}

function filteredAds() {
  const q = adState.q.trim().toLowerCase();
  const rows = deck.ads.filter((ad) => {
    if (ad.period !== adState.period) return false;
    if (adState.book && ad.book !== adState.book) return false;
    if (adState.tag && ad.creatorTag !== adState.tag) return false;
    if (adState.bodyKey && ad.bodyKey !== adState.bodyKey) return false;
    const record = statusData.ads_by_id[ad.adId];
    const content = record?.content_month || "unknown";
    if (adState.contentId === "unknown" && content !== "unknown") return false;
    if (adState.contentId !== "all" && adState.contentId !== "unknown" && content !== adState.contentId && content !== "unknown") return false;
    if (adState.statusId !== "all" && record && record.effective_status !== adState.statusId) return false;
    if (!q) return true;
    return `${ad.adName} ${ad.body} ${ad.creatorTag} ${ad.adId}`.toLowerCase().includes(q);
  });
  const groupScore = {};
  for (const ad of rows) {
    const value = sortValue(ad);
    if (groupScore[ad.bodyKey] == null || (value != null && value > groupScore[ad.bodyKey])) groupScore[ad.bodyKey] = value;
  }
  rows.sort((a, b) => {
    const group = (groupScore[b.bodyKey] ?? -Infinity) - (groupScore[a.bodyKey] ?? -Infinity);
    if (group) return group;
    const av = sortValue(a);
    const bv = sortValue(b);
    if (av == null && bv == null) return a.adName.localeCompare(b.adName, "th");
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av !== bv) return bv - av;
    return a.adName.localeCompare(b.adName, "th");
  });
  return rows;
}

function sortValue(ad) {
  const rate = rates(ad);
  const map = {
    revenue: ad.revenue,
    spend: ad.spend,
    roas: rate.roas,
    chats: ad.chats,
    costPerMsg: rate.costPerMsg,
    cpm: rate.cpm,
    purchases: ad.purchases,
    cvr: rate.cvrProxy,
    aov: rate.aov,
  };
  const value = map[adState.sort];
  return value == null || Number.isNaN(value) ? null : value;
}

function renderAds() {
  const mount = document.querySelector('[data-mount="s10-ads"]');
  if (!mount || !deck) return;
  mount.replaceChildren();
  const results = el("div", "ad-results");
  mount.append(results);
  renderAdPage(mount);
}

function renderAdPage(mount) {
  const results = mount.querySelector(".ad-results");
  if (!results) return;
  results.replaceChildren();
  const rows = filteredAds();
  const pageSize = window.matchMedia("(max-height: 620px)").matches ? 2 : 3;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  if (adState.page > pages - 1) adState.page = 0;
  const slice = rows.slice(adState.page * pageSize, adState.page * pageSize + pageSize);
  const baseline = adState.book && deck.bookTotals[adState.period]
    ? rates(deck.bookTotals[adState.period][adState.book]).roas
    : null;
  const title = document.querySelector("#s10-ads h1");
  if (title) {
    title.textContent = adState.bodyKey
      ? openingFor(adState.bodyKey)
      : `แอด${adState.book ? " " + bookMeta(adState.book).name : ""} ${periodLabel(adState.period)} เรียงตามรายได้ Meta`;
  }
  const list = el("div", "adlist");
  if (!slice.length) list.append(el("p", "ref-foot", "ไม่พบแอดในช่วงกรองนี้"));
  let lastKey = "";
  slice.forEach((ad, index) => {
    if (ad.bodyKey !== lastKey) {
      list.append(el("p", "ref-group", openingFor(ad.bodyKey)));
      lastKey = ad.bodyKey;
    }
    list.append(refAdRow(ad, adState.page * pageSize + index + 1, baseline));
  });
  results.append(list);
  const pager = el("div", "pager");
  const prev = el("button", "ghost", "หน้าก่อน");
  prev.type = "button";
  prev.disabled = adState.page === 0;
  prev.setAttribute("aria-label", "หน้าก่อนของรายการแอด");
  prev.addEventListener("click", () => {
    adState.page -= 1;
    renderAdPage(mount);
  });
  const next = el("button", "ghost", "หน้าถัดไป");
  next.type = "button";
  next.disabled = adState.page >= pages - 1;
  next.setAttribute("aria-label", "หน้าถัดไปของรายการแอด");
  next.addEventListener("click", () => {
    adState.page += 1;
    renderAdPage(mount);
  });
  pager.append(prev, el("span", "", `${adState.page + 1} / ${pages} · ${rows.length} แอด`), next);
  results.append(pager);
  results.append(el("p", "ref-foot", "รายได้เป็น omni_purchase ของ Meta ไม่ใช่ BEP · ชื่อแอดคือ Ad Name จริง · ภาพนิ่งเล่นเป็นคลิปไม่ได้ · เปิดโพสต์ยังไม่ยืนยันเนื้อหา · ไม่ใช่คำสั่งงบ"));
}

function openingFor(bodyKey) {
  const message = deck.messages.find((item) => item.bodyKey === bodyKey);
  if (message) return message.opening;
  const ad = deck.ads.find((item) => item.bodyKey === bodyKey && item.body);
  return ad ? ad.body.split(/\s+\/\s+/)[0] : "";
}

function refAdRow(ad, index, baseline) {
  const card = el("article", "ref-ad");
  const top = el("div", "top");
  top.append(el("span", "", String(index)));
  if (ad.thumb) {
    const img = document.createElement("img");
    img.src = "/media/" + ad.thumb;
    img.alt = ad.assetLabel;
    top.append(img);
  } else top.append(el("div", "thumb-ph", ad.assetKind === "namecard" ? "นามบัตร" : "ไม่มีภาพ"));
  const text = el("div");
  text.append(el("h3", "ad-name", ad.adName));
  text.append(el("p", "ref-sub", `${ad.creatorTag} · ${confidenceText(ad.confidence)}`));
  top.append(text);
  const ig = safeUrl(ad.ig);
  if (ig) {
    const anchor = link(ig, "เปิด");
    anchor.className = "ref-open";
    top.append(anchor);
  } else top.append(el("span", "ref-sub", ""));
  card.append(top);
  const rate = rates(ad);
  const metrics = el("div", "metrics");
  const cvr = rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%";
  const cells = [
    ["Spend", baht(ad.spend), ""],
    ["รายได้ Meta", baht(ad.revenue), ""],
    ["ROAS", null, ""],
    ["แชท", num(ad.chats), ""],
    ["บาท/แชท", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg), ""],
    ["CPM", rate.cpm == null ? "—" : baht(rate.cpm), ""],
    ["ซื้อ", num(ad.purchases), ""],
    ["ซื้อ÷แชท", cvr, rate.cvrProxy > 1 ? "เกิน 100% ได้ เพราะยอดซื้อไม่ได้ผูกกับแชท" : ""],
    ["AOV", rate.aov == null ? "—" : baht(rate.aov), ""],
  ];
  for (const [label, value, title] of cells) {
    const cell = el("div");
    cell.append(el("span", "", label));
    if (label === "ROAS") cell.append(roasBar(rate.roas, baseline));
    else cell.append(metricCell(label, value, title).querySelector("b"));
    metrics.append(cell);
  }
  card.append(metrics);
  return card;
}

function select(label, options, value, onChange, testId) {
  const wrap = el("label", "", label);
  const node = document.createElement("select");
  if (testId) node.dataset.filter = testId;
  for (const [id, text] of options) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = text;
    if (id === value) option.selected = true;
    node.append(option);
  }
  node.addEventListener("change", () => onChange(node.value));
  wrap.append(node);
  return wrap;
}

function renderAxis() {
  const slide = document.getElementById("s01-axis");
  const octOffice = deck.bookTotals.oct.Coworkers;
  const octMind = deck.bookTotals.oct.Mind;
  const claim = `ข้อความแอดเดือน ต.ค. ออฟฟิศ ROAS ${roasText(octOffice)} Mind เหลือ ${roasText(octMind)}`;
  slide.querySelector("h1").textContent = claim;
  const jump = document.querySelector('#jump option[value="0"]');
  if (jump) jump.textContent = "1 " + claim;
  const mount = slide.querySelector('[data-mount="s01-axis"]');
  mount.replaceChildren();
  const list = document.createElement("ol");
  list.className = "bookline";
  for (const book of BOOKS) {
    const oct = deck.bookTotals.oct[book.id];
    const nov = deck.bookTotals.nov1_7[book.id];
    const item = document.createElement("li");
    const score = el("span", "roas " + (rates(oct).roas >= 1 ? "over" : "under"), roasText(oct));
    item.append(el("span", "name", book.name), score, el("span", "when", `ต.ค. · 1–7 พ.ย. ${roasText(nov)}`));
    list.append(item);
  }
  mount.append(list);
  const note = el("p", "footnote");
  note.append(document.createTextNode("รายได้เป็น omni_purchase ของ Meta ไม่ใช่ BEP · ข้อความจากตัวแอด ยังไม่ได้ดูคลิป · ไม่ใช่คำสั่งงบ · สแนปชอต 8 พ.ย. 2569 ไม่รวมวันที่ 8"));
  const source = el("button", "", "ที่มา");
  source.type = "button";
  source.addEventListener("click", openMethod);
  note.append(source);
  mount.append(note);
}

function barScale(baseline) {
  return Math.max(3, baseline || 0, 0.01);
}

function roasBar(value, baseline) {
  const wrap = el("div", "roas-cell");
  const track = el("div", "roas-track");
  const scale = barScale(baseline);
  const width = value == null ? 0 : Math.max(0, Math.min(100, (value / scale) * 100));
  const markAt = baseline == null ? null : Math.max(0, Math.min(100, (baseline / scale) * 100));
  const compared = metricTone("roas", value, baseline);
  const tone = compared === "better" ? "over" : compared === "worse" ? "under" : "neutral";
  const fill = el("div", "roas-fill " + tone);
  fill.style.width = width + "%";
  track.append(fill);
  if (markAt != null) {
    const mark = el("i", "roas-mark");
    mark.style.left = markAt + "%";
    track.append(mark);
  }
  const numEl = el("b", "roas-num " + tone, value == null ? "—" : value.toFixed(2));
  wrap.append(track, numEl);
  return wrap;
}

function renderCoworkers() {
  const slide = document.getElementById("s06-coworkers");
  const baseline = rates(deck.bookTotals.nov1_7.Coworkers).roas;
  const straight = deck.messages.find((message) => message.id === "cw-people-straight");
  slide.querySelector("h1").textContent = `ข้อความที่เปิดด้วยความทุกข์เรื่องคน ROAS ${roasText(straight.periods.nov1_7)}`;
  const mount = slide.querySelector('[data-mount="s06-coworkers"]');
  mount.replaceChildren();
  const head = el("div", "ref-head");
  ["#", "", "ข้อความแอด", "Spend", "ROAS", "แชท", "บาท/แชท"].forEach((label) => head.append(el("span", "", label)));
  mount.append(head);
  const messages = deck.messages
    .filter((message) => message.book === "Coworkers" && message.periods.nov1_7 && message.periods.nov1_7.spend > 0)
    .sort((a, b) => b.periods.nov1_7.revenue - a.periods.nov1_7.revenue)
    .slice(0, 5);
  messages.forEach((message, index) => {
    const focus = message.periods.nov1_7;
    const rate = rates(focus);
    const sample = deck.ads.find((ad) => ad.period === "nov1_7" && ad.bodyKey === message.bodyKey && ad.thumb)
      || deck.ads.find((ad) => ad.period === "nov1_7" && ad.bodyKey === message.bodyKey);
    const row = el("div", "msg-row");
    row.append(el("span", "", String(index + 1)));
    if (sample && sample.thumb) {
      const img = document.createElement("img");
      img.src = "/media/" + sample.thumb;
      img.alt = sample.assetLabel;
      row.append(img);
    } else row.append(el("div", "thumb-ph", "ไม่มีภาพ"));
    const text = el("div");
    text.append(el("div", "quote", message.opening));
    text.append(el("p", "meta", `1–7 พ.ย. · ${message.adIds.length} แอด · ${volumeText(focus)}`));
    row.append(text);
    row.append(el("b", "", baht(focus.spend)));
    row.append(roasBar(rate.roas, baseline));
    row.append(el("b", "", num(focus.chats)));
    row.append(el("b", "", rate.costPerMsg == null ? "—" : baht(rate.costPerMsg)));
    row.addEventListener("click", () => {
      adState.bodyKey = message.bodyKey;
      adState.book = "Coworkers";
      adState.period = "nov1_7";
      adState.page = 0;
      renderAds();
      show(SLIDE_IDS.indexOf("s10-ads"), true);
    });
    mount.append(row);
  });
  mount.append(el("p", "ref-foot", "รายได้เป็น omni_purchase ของ Meta ไม่ใช่ BEP · ข้อความจากตัวแอด ยังไม่ได้ดูคลิป · เส้นคือ ROAS ทั้งเล่มจากผลรวม ไม่ใช่คำสั่งงบ"));
}

function openMethod() {
  const body = document.getElementById("method-body");
  body.replaceChildren();
  const lines = [
    "ข้อมูลแคมเปญแชทที่ดึง 8 พ.ย. 2569 เวลาไทย ไม่รวมยอดวันที่ 8 ที่ยังไม่จบวัน",
    "Revenue คือ omni_purchase ที่ Meta นับให้แอด ไม่ใช่ยอดขาย BEP และไม่ใช่ยอด Organic",
    "ROAS = Revenue ÷ Spend จากผลรวมของช่วง ไม่ใช่ค่าเฉลี่ยของ ROAS รายแอด",
    "Messages คือจำนวนแชทจากแอด Cost per Message = Spend ÷ Messages",
    "CVR = Purchases ÷ Messages เป็นตัวแทน เกิน 100% ได้ เพราะยอดซื้อไม่ได้ผูกกับแชท และไม่ใช่ CVR event ของ Meta",
    "AOV = Revenue ÷ Purchases CPM = Spend ÷ impressions × 1,000",
    "ข้อความมาจากตัวแอด ยังไม่ได้ดูคลิป และไม่ได้สั่งให้เพิ่มหรือปิดงบ",
    "1–7 ต.ค. เป็นส่วนหนึ่งของเดือน ต.ค. ห้ามนำไปบวกกับทั้งเดือน",
    "ตัด ad 120255364063130260 และ 120255499941520260 เพราะชื่อเล่มกับข้อความไม่ตรงกัน",
  ];
  for (const line of lines) body.append(el("p", "", line));
  document.getElementById("method").showModal();
}

function openProof(messages, period) {
  const title = document.getElementById("proof-title");
  title.textContent = "แอดช่วง " + periodLabel(period);
  const body = document.getElementById("proof-body");
  body.replaceChildren();
  for (const message of messages) {
    body.append(el("p", "", message.opening));
    const table = document.createElement("table");
    table.className = "proof-table";
    const head = document.createElement("tr");
    ["", "Ad Name", "ป้าย", "Spend", "รายได้ Meta", "ROAS", "แชท", "บาท/แชท", "CPM", "ซื้อ", "ซื้อ÷แชท", "AOV"].forEach((label) => head.append(el("th", "", label)));
    table.append(head);
    const rows = deck.ads.filter((ad) => ad.period === period && ad.bodyKey === message.bodyKey);
    for (const ad of rows) {
      const rate = rates(ad);
      const tr = document.createElement("tr");
      const thumb = document.createElement("td");
      if (ad.thumb) {
        const img = document.createElement("img");
        img.src = "/media/" + ad.thumb;
        img.alt = ad.assetLabel;
        thumb.append(img);
      } else thumb.textContent = ad.assetKind === "namecard" ? "นามบัตร" : "ไม่มีภาพ";
      tr.append(thumb);
      tr.append(el("td", "name", ad.adName));
      tr.append(el("td", "", ad.creatorTag));
      const cvr = rate.cvrProxy == null ? "—" : (rate.cvrProxy * 100).toFixed(1) + "%";
      [
        baht(ad.spend),
        baht(ad.revenue),
        rate.roas == null ? "—" : rate.roas.toFixed(2),
        num(ad.chats),
        rate.costPerMsg == null ? "—" : baht(rate.costPerMsg),
        rate.cpm == null ? "—" : baht(rate.cpm),
        num(ad.purchases),
        cvr,
        rate.aov == null ? "—" : baht(rate.aov),
      ].forEach((value) => tr.append(el("td", "", value)));
      table.append(tr);
      const links = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 12;
      const ig = safeUrl(ad.ig);
      const fb = safeUrl(ad.fb);
      const adsUrl = safeUrl(ad.adsManager);
      if (ig) cell.append(link(ig, "เปิดโพสต์ IG (ยังไม่ยืนยันเนื้อหา) "));
      if (fb) cell.append(link(fb, "Facebook (ต้องล็อกอิน) "));
      if (adsUrl) cell.append(link(adsUrl, "Ads Manager (ต้องล็อกอิน)"));
      links.append(cell);
      table.append(links);
    }
    body.append(table);
  }
  document.getElementById("proof").showModal();
}

function renderOverview() {
  const mount = document.querySelector('[data-mount="s04-km-overview"]');
  mount.replaceChildren();
  const table = document.createElement("table");
  const head = document.createElement("tr");
  ["เล่ม", "ข้อความแอด", "ROAS", "Spend", "แชท", "บาท/แชท", "ฐาน"].forEach((label) => head.append(el("th", "", label)));
  table.append(head);
  for (const message of messagesFor("s04-km-overview")) {
    const focus = message.periods[message.focus];
    const rate = rates(focus);
    const tr = document.createElement("tr");
    [bookMeta(message.book).name, message.opening, roasText(focus), baht(focus.spend), num(focus.chats), rate.costPerMsg == null ? "—" : baht(rate.costPerMsg), volumeText(focus)].forEach((value) => {
      tr.append(el("td", "", value));
    });
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      adState.bodyKey = message.bodyKey;
      adState.book = message.book;
      adState.period = message.focus;
      adState.page = 0;
      renderAds();
      show(SLIDE_IDS.indexOf("s10-ads"), true);
    });
    table.append(tr);
  }
  mount.append(table);
  mount.append(el("p", "fine", "คลิกแถวเพื่อเปิดแอดของข้อความนั้น · จัดกลุ่มตามข้อความที่ตรงกันทั้งตัวอักษร · เกณฑ์ข้อมูลน้อยคือ Spend ต่ำกว่า ฿5,000 หรือซื้อไม่ถึง 10 ครั้ง เป็นตัวช่วยอ่าน ไม่ใช่กฎปิดแอด"));
}

function periodPhrase(id) {
  if (id === "nov1_7") return "1–7 พ.ย. 2569";
  if (id === "oct1_7") return "1–7 ต.ค. 2569";
  if (id === "oct") return "ต.ค. 2569 ทั้งเดือน";
  if (id === "sep") return "ก.ย. 2569 ทั้งเดือน";
  return periodLabel(id);
}

function sameLengthPair(id) {
  if (id === "nov1_7") return "oct1_7";
  if (id === "oct1_7") return "nov1_7";
  if (id === "oct") return "sep";
  return null;
}

function periodAds(book) {
  return deck.ads.filter((ad) => {
    if (ad.period !== adState.period) return false;
    if (book && ad.book !== book) return false;
    if (adState.tag && ad.creatorTag !== adState.tag) return false;
    const record = statusData.ads_by_id?.[ad.adId];
    if (record?.excluded_from_book_totals) return false;
    return true;
  }).sort((a, b) => b.revenue - a.revenue || a.adName.localeCompare(b.adName, "th"));
}

function setSlideHeading(id, kicker, title) {
  const slide = document.getElementById(id);
  if (!slide) return;
  const kick = slide.querySelector(".kicker");
  if (kick) kick.textContent = kicker;
  const pill = slide.querySelector(".ref-pill");
  if (pill) pill.lastChild.textContent = kicker;
  const h1 = slide.querySelector("h1");
  if (h1) h1.textContent = title;
}

function metricHead() {
  const head = el("div", "phead metrics");
  for (const label of TABLE_HEAD) {
    head.append(el("span", label === "Cost per Message" ? "wide" : "", label));
  }
  return head;
}

function presentPager(slideId, page, pages, total, render) {
  const bar = el("div", "pager ppager");
  const prev = el("button", "", "ก่อนหน้า");
  prev.type = "button";
  prev.disabled = page === 0;
  prev.addEventListener("click", () => {
    slidePages[slideId] = page - 1;
    render();
  });
  const next = el("button", "", "ถัดไป");
  next.type = "button";
  next.disabled = page >= pages - 1;
  next.setAttribute("aria-label", "หน้าถัดไปของรายการแอด");
  next.addEventListener("click", () => {
    slidePages[slideId] = page + 1;
    render();
  });
  bar.append(prev, el("span", "", `${page + 1} / ${pages} · ${total} แอด`), next);
  return bar;
}

function toneTitle(tone) {
  return TONE_LABEL[tone] || TONE_LABEL.neutral;
}

function toneLegend() {
  const row = el("p", "tone-legend");
  row.append(el("span", "cell-better", TONE_LABEL.better));
  row.append(el("span", "cell-worse", TONE_LABEL.worse));
  row.append(el("span", "cell-neutral", TONE_LABEL.neutral));
  return row;
}

function taggedCell(metric, text, tone) {
  const node = el("b", "pnum cell-" + tone, text);
  node.dataset.metric = metric;
  node.dataset.tone = tone;
  node.title = toneTitle(tone);
  node.setAttribute("aria-label", text + " " + toneTitle(tone));
  return node;
}

function rateText(metric, value) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (metric === "roas") return value.toFixed(2);
  if (metric === "cvrProxy") return (value * 100).toFixed(1) + "%";
  return baht(value);
}

function presentAdRow(ad, index, bookRate) {
  const rate = rates(ad);
  const base = bookRate || rates(deck.bookTotals[ad.period][ad.book]);
  const row = el("article", "prow");
  row.append(el("span", "prank", String(index)));
  if (ad.thumb) {
    const img = document.createElement("img");
    img.src = "/media/" + ad.thumb;
    img.alt = ad.assetLabel || ad.adName;
    row.append(img);
  } else row.append(el("div", "thumb-ph", "ไม่มีภาพ"));
  const name = el("div", "pname");
  const title = el("button", "ad-name", ad.adName);
  title.type = "button";
  title.title = ad.adName;
  const record = statusData.ads_by_id?.[ad.adId];
  const badge = contentBadge(record);
  name.append(title);
  name.append(el("em", "", `${ad.creatorTag} · ${badge.text}`));
  row.append(name);
  row.append(taggedCell("spend", baht(ad.spend), "volume"));
  const roasTone = metricTone("roas", rate.roas, base.roas);
  const roasWrap = el("div", "pcell");
  roasWrap.dataset.metric = "roas";
  roasWrap.dataset.tone = roasTone;
  roasWrap.title = toneTitle(roasTone);
  roasWrap.append(roasBar(rate.roas, base.roas));
  row.append(roasWrap);
  row.append(taggedCell("revenue", baht(ad.revenue), "volume"));
  row.append(taggedCell("chats", num(ad.chats), "volume"));
  row.append(taggedCell("costPerMsg", rateText("costPerMsg", rate.costPerMsg), metricTone("costPerMsg", rate.costPerMsg, base.costPerMsg)));
  row.append(taggedCell("cpm", rateText("cpm", rate.cpm), metricTone("cpm", rate.cpm, base.cpm)));
  row.append(taggedCell("purchases", num(ad.purchases), "volume"));
  row.append(taggedCell("cvrProxy", rateText("cvrProxy", rate.cvrProxy), metricTone("cvrProxy", rate.cvrProxy, base.cvrProxy)));
  row.append(taggedCell("aov", rateText("aov", rate.aov), metricTone("aov", rate.aov, base.aov)));
  const picked = Boolean(analysisState.items[analysisItemId(ad.period, ad.adId)]);
  if (picked) row.classList.add("is-picked");
  const pick = el("button", "pick-btn" + (picked ? " on" : ""), picked ? "เลือกแล้ว" : "เลือก");
  pick.type = "button";
  pick.dataset.pick = analysisItemId(ad.period, ad.adId);
  pick.setAttribute("aria-pressed", picked ? "true" : "false");
  pick.title = picked ? "เลือกไว้วิเคราะห์แล้ว ไม่ใช่สถานะการยิงแอด" : "เลือกข้อความนี้ไว้วิเคราะห์ต่อยอด ไม่ใช่สถานะการยิงแอด";
  pick.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePick(ad, ad.period);
  });
  row.append(pick);
  return row;
}

function bookTotalRow(book, totals) {
  const rate = rates(totals);
  const row = el("article", "prow book-total");
  row.append(el("span", "prank", ""));
  row.append(el("div", "thumb-ph", ""));
  const name = el("div", "pname");
  name.append(el("strong", "ad-name", book.name));
  name.append(el("em", "", "ฐานของเล่มนี้ · ไม่ได้จัดอันดับข้ามเล่ม"));
  row.append(name);
  row.append(taggedCell("spend", baht(totals.spend), "volume"));
  const roasWrap = el("div", "pcell cell-baseline");
  roasWrap.dataset.metric = "roas";
  roasWrap.dataset.tone = "baseline";
  roasWrap.title = toneTitle("baseline");
  roasWrap.append(roasBar(rate.roas, null));
  row.append(roasWrap);
  row.append(taggedCell("revenue", baht(totals.revenue), "volume"));
  row.append(taggedCell("chats", num(totals.chats), "volume"));
  row.append(taggedCell("costPerMsg", rateText("costPerMsg", rate.costPerMsg), "baseline"));
  row.append(taggedCell("cpm", rateText("cpm", rate.cpm), "baseline"));
  row.append(taggedCell("purchases", num(totals.purchases), "volume"));
  row.append(taggedCell("cvrProxy", rateText("cvrProxy", rate.cvrProxy), "baseline"));
  row.append(taggedCell("aov", rateText("aov", rate.aov), "baseline"));
  row.append(el("span", "", ""));
  return row;
}

function renderPagedAds(slideId, book, rowsOverride) {
  const mount = document.querySelector(`[data-mount="${slideId}"]`);
  if (!mount) return;
  const rows = rowsOverride || periodAds(book);
  const pages = Math.max(1, Math.ceil(rows.length / PRESENT_ROWS));
  const page = Math.max(0, Math.min(slidePages[slideId] || 0, pages - 1));
  slidePages[slideId] = page;
  const bookRate = book && deck.bookTotals[adState.period] ? rates(deck.bookTotals[adState.period][book]) : null;
  mount.replaceChildren(metricHead(), toneLegend());
  const slice = rows.slice(page * PRESENT_ROWS, page * PRESENT_ROWS + PRESENT_ROWS);
  if (!slice.length) mount.append(el("p", "ref-foot", "ไม่มีแอดในช่วงนี้"));
  slice.forEach((ad, index) => mount.append(presentAdRow(ad, page * PRESENT_ROWS + index + 1, bookRate)));
  mount.append(presentPager(slideId, page, pages, rows.length, () => renderPagedAds(slideId, book, rowsOverride)));
}

function renderBookTotals(slideId) {
  const mount = document.querySelector(`[data-mount="${slideId}"]`);
  mount.replaceChildren(metricHead(), toneLegend());
  for (const book of BOOKS) mount.append(bookTotalRow(book, deck.bookTotals[adState.period][book.id]));
  mount.append(el("p", "ref-foot", `${periodPhrase(adState.period)} · รายได้เป็น omni_purchase ของ Meta · ไม่รวมวันนี้ · ไม่ใช่คำสั่งงบ`));
}

function renderMatchedSlide() {
  const mount = document.querySelector('[data-mount="s03-matched-week"]');
  const pair = sameLengthPair(adState.period);
  const h1 = document.querySelector("#s03-matched-week h1");
  if (!pair) {
    h1.textContent = "ไม่มีช่วงความยาวเท่ากันให้เทียบ";
    mount.replaceChildren(el("p", "ref-foot", "ไม่เทียบทั้งเดือนกับ 1–7 วัน และไม่แสดง MoM ที่ฐานไม่เท่ากัน"));
    return;
  }
  h1.textContent = `${periodPhrase(adState.period)} เทียบ ${periodPhrase(pair)}`;
  mount.replaceChildren(metricHead());
  for (const book of BOOKS) {
    const current = deck.bookTotals[adState.period][book.id];
    const previous = deck.bookTotals[pair][book.id];
    const row = bookTotalRow(book, current);
    const revenue = changePct(current.revenue, previous.revenue).text;
    row.querySelector("em").textContent = `รายได้เทียบ ${periodPhrase(pair)} ${revenue} · ความยาวเท่ากัน`;
    mount.append(row);
  }
  mount.append(el("p", "ref-foot", "เทียบเฉพาะช่วงที่ยาวเท่ากัน ต.ค. ทั้งเดือนไม่ถูกเอาไปชนกับ 1–7 พ.ย."));
}

function renderFullMonthReference() {
  const mount = document.querySelector('[data-mount="s02-sep-oct"]');
  document.querySelector("#s02-sep-oct h1").textContent = "อ้างอิงทั้งเดือน ก.ย. และ ต.ค.";
  mount.replaceChildren(el("p", "ref-foot", "คนละความยาวกับ 1–7 พ.ย. 2569 ใช้ดูย้อนหลัง ไม่ใช่ข้อสรุปของสัปดาห์นี้"));
  const head = el("div", "phead pref-head");
  ["เล่ม", "ก.ย. ROAS", "ก.ย. Revenue", "ต.ค. ROAS", "ต.ค. Revenue", "MoM Revenue"].forEach((label) => head.append(el("span", "", label)));
  mount.append(head);
  for (const book of BOOKS) {
    const sep = deck.bookTotals.sep[book.id];
    const oct = deck.bookTotals.oct[book.id];
    const row = el("article", "prow pref-row");
    row.append(el("strong", "", book.name));
    row.append(el("b", "", roasText(sep)));
    row.append(el("b", "", baht(sep.revenue)));
    row.append(el("b", "", roasText(oct)));
    row.append(el("b", "", baht(oct.revenue)));
    row.append(el("b", "", changePct(oct.revenue, sep.revenue).text));
    mount.append(row);
  }
}

function renderTopAds() {
  const mount = document.querySelector('[data-mount="s04-km-overview"]');
  document.querySelector("#s04-km-overview h1").textContent = `ข้อความแอดที่รายได้สูงใน ${periodPhrase(adState.period)}`;
  const rows = periodAds("").slice(0, PRESENT_ROWS);
  mount.replaceChildren(metricHead(), toneLegend());
  rows.forEach((ad, index) => {
    mount.append(presentAdRow(ad, index + 1, rates(deck.bookTotals[adState.period][ad.book])));
  });
  mount.append(el("p", "ref-foot", "หลายข้อความในหน้าเดียว ไม่ได้ยุบแอดที่ใช้ข้อความเดียวกัน และไม่ได้จัดอันดับครีเอเตอร์"));
}

function renderQuestions() {
  setSlideHeading("s11-questions", "วิธีอ่าน", "ชื่อตัวเลขเก้าช่อง");
  const mount = document.querySelector('[data-mount="s11-questions"]');
  const defs = [
    ["Spend", "เงินที่ใช้ในช่วงที่เลือก"],
    ["Revenue", "รายได้ที่ Meta นับให้แอด (omni_purchase) ไม่ใช่ยอด BEP"],
    ["ROAS", "Revenue ÷ Spend"],
    ["Messages", "จำนวนแชทจากแอดในช่วงที่เลือก"],
    ["Cost per Message", "Spend ÷ Messages"],
    ["CPM", "Spend ÷ impressions × 1,000"],
    ["Purchases", "จำนวนซื้อที่ Meta นับให้แอด"],
    ["CVR", "Purchases ÷ Messages เป็นตัวแทน ไม่ใช่ CVR event ของ Meta"],
    ["AOV", "Revenue ÷ Purchases"],
  ];
  mount.replaceChildren();
  for (const [name, text] of defs) {
    const row = el("article", "prow def-row");
    row.append(el("strong", "", name), el("span", "", text));
    mount.append(row);
  }
}

function renderSynthesis() {
  const phrase = periodPhrase(adState.period);
  setSlideHeading("s12-synthesis", phrase, `รอบนี้ข้อความแอดของ ${phrase}`);
  const mount = document.querySelector('[data-mount="s12-synthesis"]');
  mount.replaceChildren(metricHead(), toneLegend());
  for (const book of BOOKS) mount.append(bookTotalRow(book, deck.bookTotals[adState.period][book.id]));
  mount.append(el("p", "ref-foot", "เฉพาะช่วงที่เลือก ไม่ได้เอาทั้งเดือนไปเทียบกับช่วง 7 วัน"));
}

function renderAll() {
  const phrase = periodPhrase(adState.period);
  setSlideHeading("s01-axis", phrase, `ข้อความแอด ${phrase}`);
  renderBookTotals("s01-axis");
  renderFullMonthReference();
  renderMatchedSlide();
  renderTopAds();
  renderBookAdsHeading("s05-mind", "Mind");
  renderBookAdsHeading("s06-coworkers", "Coworkers");
  renderBookAdsHeading("s07-survival", "SurvivalGuide");
  renderBookAdsHeading("s08-trap", "Trap");
  const allAds = periodAds("");
  const copies = {};
  for (const ad of allAds) copies[ad.bodyKey] = (copies[ad.bodyKey] || 0) + 1;
  setSlideHeading("s09-same-copy", phrase, "ข้อความเดียวกัน ยังเป็นคนละแถว");
  renderPagedAds("s09-same-copy", "", allAds.filter((ad) => copies[ad.bodyKey] > 1));
  setSlideHeading("s10-ads", phrase, `แอด ${phrase}`);
  renderPagedAds("s10-ads", adState.book || "");
  renderQuestions();
  renderSynthesis();
  const jumpTitles = [
    "1 สี่เล่ม",
    "2 อ้างอิงทั้งเดือน",
    "3 เทียบช่วงเท่ากัน",
    "4 ข้อความที่รายได้สูง",
    "5 Mind",
    "6 ออฟฟิศ",
    "7 Survival",
    "8 กับดัก",
    "9 ข้อความซ้ำ คนละแอด",
    "10 แอดทั้งช่วง",
    "11 ชื่อตัวเลข",
    "12 สรุปช่วงที่เลือก",
  ];
  document.querySelectorAll("#jump option").forEach((option, i) => {
    if (jumpTitles[i]) option.textContent = jumpTitles[i];
  });
}

function renderBookAdsHeading(slideId, bookId) {
  const book = bookMeta(bookId);
  const totals = deck.bookTotals[adState.period][bookId];
  setSlideHeading(slideId, `${book.name} · ${periodPhrase(adState.period)}`, `${book.name} ROAS ${roasText(totals)}`);
  renderPagedAds(slideId, bookId);
}

function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("th-TH", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
}

function setStatus(id, text, kind) {
  const status = document.querySelector(`[data-notes-for="${id}"] [data-notes-status]`);
  if (!status) return;
  status.textContent = text;
  status.className = "notes-status" + (kind === "saved" ? " ok" : kind === "error" || kind === "conflict" ? " err" : "");
}

function loginForm() {
  const form = el("form", "notes-login");
  form.append(el("p", "notes-guest", "เข้าสู่ระบบเพื่อดูและแก้บันทึก"));
  const input = document.createElement("input");
  input.type = "password";
  input.autocomplete = "current-password";
  input.setAttribute("aria-label", "รหัสผู้แก้ไข");
  const button = el("button", "", "เข้าสู่ระบบ");
  button.type = "submit";
  const error = el("p", "login-error", "");
  form.append(input, button, error);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: input.value }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      error.textContent = data.error || "เข้าสู่ระบบไม่สำเร็จ";
      return;
    }
    noteState.authed = true;
    noteState.csrf = data.csrf || "";
    input.value = "";
    await loadNotes();
  });
  return form;
}

function editorTools(id) {
  const tools = el("div", "notes-tools");
  const save = el("button", "", "บันทึก");
  save.type = "button";
  save.addEventListener("click", () => saveNote(id, true));
  const exp = el("button", "", "ส่งออก JSON");
  exp.type = "button";
  exp.addEventListener("click", exportNotes);
  const imp = el("button", "", "นำเข้า JSON");
  imp.type = "button";
  imp.addEventListener("click", () => fileInput(id).click());
  const out = el("button", "", "ออกจากระบบ");
  out.type = "button";
  out.addEventListener("click", logout);
  const file = document.createElement("input");
  file.type = "file";
  file.accept = "application/json";
  file.hidden = true;
  file.dataset.importFor = id;
  file.addEventListener("change", () => stageImport(id, file));
  tools.append(save, exp, imp, out, file);
  return tools;
}

function fileInput(id) {
  return document.querySelector(`[data-import-for="${id}"]`);
}

function paintNotes() {
  for (const region of document.querySelectorAll("[data-notes-for]")) {
    const id = region.dataset.notesFor;
    if (!NOTE_IDS.includes(id)) continue;
    const body = region.querySelector("[data-notes-body]");
    body.replaceChildren();
    if (!noteState.configured) {
      region.dataset.mode = "off";
      setStatus(id, (noteState.reason || "บันทึกบนเซิร์ฟเวอร์ยังไม่ได้ตั้งค่า") + " — ยังไม่ได้บันทึก", "error");
      body.append(el("p", "notes-guest", "บันทึกจะอยู่บนสไลด์เมื่อเซิร์ฟเวอร์และฐานข้อมูลพร้อมเท่านั้น ตอนนี้ยังไม่ได้บันทึก"));
      continue;
    }
    if (!noteState.authed) {
      region.dataset.mode = "guest";
      setStatus(id, "เข้าสู่ระบบเพื่อดูและแก้บันทึก", "");
      body.append(loginForm());
      continue;
    }
    region.dataset.mode = "editor";
    const note = noteState.notes[id];
    const area = document.createElement("textarea");
    area.className = "note-text";
    area.maxLength = MAX_NOTE;
    area.placeholder = "ยังไม่มีบันทึกบนสไลด์นี้";
    area.setAttribute("aria-label", "บันทึกบนสไลด์");
    area.value = note?.text || "";
    area.addEventListener("input", () => {
      noteState.dirty[id] = true;
      setStatus(id, "มีการแก้ไขที่ยังไม่บันทึก", "");
      clearTimeout(noteState.timers[id]);
      noteState.timers[id] = setTimeout(() => saveNote(id, false), 700);
    });
    body.append(area);
    if (!noteState.conflict[id]) {
      if (note?.updatedAt) setStatus(id, "บันทึกแล้ว · " + formatTime(note.updatedAt), "saved");
      else setStatus(id, "ยังไม่มีบันทึกบนสไลด์นี้", "");
    } else {
      setStatus(id, "มีฉบับใหม่กว่าบนเซิร์ฟเวอร์ — ยังไม่ได้เขียนทับ", "conflict");
      body.append(conflictBox(id, noteState.conflict[id]));
    }
    body.append(editorTools(id));
    if (noteState.pendingImport) body.append(importPreview());
  }
}

function conflictBox(id, note) {
  const box = el("div", "conflict-box");
  box.append(el("p", "", "ฉบับบนเซิร์ฟเวอร์"));
  const preview = el("div", "conflict-text", note.text || "");
  box.append(preview);
  const row = el("div", "notes-tools");
  const useServer = el("button", "", "ใช้ฉบับบนเซิร์ฟเวอร์");
  useServer.type = "button";
  useServer.addEventListener("click", () => {
    noteState.notes[id] = note;
    noteState.conflict[id] = null;
    noteState.dirty[id] = false;
    paintNotes();
  });
  const overwrite = el("button", "", "บันทึกทับด้วยข้อความนี้");
  overwrite.type = "button";
  overwrite.addEventListener("click", () => {
    noteState.notes[id] = { ...(noteState.notes[id] || {}), revision: note.revision };
    noteState.conflict[id] = null;
    saveNote(id, true);
  });
  row.append(useServer, overwrite);
  box.append(row);
  return box;
}

async function saveNote(id, explicit) {
  if (!noteState.configured || !noteState.authed) {
    setStatus(id, "ยังไม่ได้บันทึก", "error");
    return;
  }
  const area = document.querySelector(`[data-notes-for="${id}"] textarea`);
  if (!area) return;
  if (!explicit && !noteState.dirty[id]) return;
  const text = area.value;
  const baseRevision = noteState.notes[id]?.revision || 0;
  setStatus(id, "กำลังบันทึก…", "");
  const response = await fetch("/api/notes/" + id, {
    method: "PUT",
    headers: { "content-type": "application/json", "x-csrf-token": noteState.csrf },
    body: JSON.stringify({ text, baseRevision }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 409 && data.note) {
    noteState.conflict[id] = data.note;
    setStatus(id, "มีฉบับใหม่กว่าบนเซิร์ฟเวอร์ — ยังไม่ได้เขียนทับ", "conflict");
    const body = document.querySelector(`[data-notes-for="${id}"] [data-notes-body]`);
    if (body && !body.querySelector(".conflict-box")) body.append(conflictBox(id, data.note));
    return;
  }
  if (!response.ok || !data.saved) {
    setStatus(id, data.error || "บันทึกไม่สำเร็จ — ข้อความยังอยู่ในช่องนี้", "error");
    return;
  }
  noteState.notes[id] = data.note;
  noteState.dirty[id] = false;
  noteState.conflict[id] = null;
  setStatus(id, "บันทึกแล้ว · " + formatTime(data.note.updatedAt), "saved");
}

async function loadNotes() {
  const response = await fetch("/api/notes");
  if (response.status === 401) {
    noteState.authed = false;
    noteState.notes = {};
    paintNotes();
    return;
  }
  if (!response.ok) {
    noteState.configured = false;
    noteState.reason = "อ่านบันทึกไม่ได้ — ยังไม่ได้บันทึก";
    paintNotes();
    return;
  }
  const payload = await response.json();
  noteState.notes = payload.notes || {};
  paintNotes();
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/";
}

async function exportNotes() {
  const response = await fetch("/api/notes/export");
  if (!response.ok) {
    setStatus(SLIDE_IDS[index], "ส่งออกไม่สำเร็จ", "error");
    return;
  }
  const blob = new Blob([await response.text()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "keymessage-notes.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function stageImport(id, input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const documentJson = JSON.parse(String(reader.result || ""));
      const count = documentJson && documentJson.notes ? Object.keys(documentJson.notes).length : 0;
      noteState.pendingImport = { document: documentJson, count };
      paintNotes();
      setStatus(id, `เลือกไฟล์แล้ว ${count} สไลด์ — กดยืนยันนำเข้าหากต้องการเขียนลงเซิร์ฟเวอร์`, "");
    } catch {
      setStatus(id, "ไฟล์ไม่ใช่ JSON", "error");
    }
  };
  reader.readAsText(file);
}

function importPreview() {
  const row = el("div", "import-preview");
  row.append(el("span", "", `ไฟล์นำเข้า ${noteState.pendingImport.count} สไลด์ ยังไม่เขียนจนกว่าจะยืนยัน`));
  const go = el("button", "", "ยืนยันนำเข้า");
  go.type = "button";
  go.addEventListener("click", confirmImport);
  const cancel = el("button", "", "ยกเลิกไฟล์");
  cancel.type = "button";
  cancel.addEventListener("click", () => {
    noteState.pendingImport = null;
    paintNotes();
  });
  row.append(go, cancel);
  return row;
}

async function confirmImport() {
  if (!noteState.pendingImport) return;
  const response = await fetch("/api/notes/import", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": noteState.csrf },
    body: JSON.stringify({ confirm: true, document: noteState.pendingImport.document }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.saved) {
    setStatus(SLIDE_IDS[index], data.error || "นำเข้าไม่สำเร็จ — ยังไม่ได้บันทึก", "error");
    return;
  }
  noteState.pendingImport = null;
  noteState.notes = data.notes || {};
  noteState.dirty = {};
  paintNotes();
}

async function refreshSession() {
  for (const id of SLIDE_IDS) setStatus(id, "กำลังตรวจสิทธิ์บันทึก…", "");
  try {
    const health = await fetch("/api/health").then((response) => response.json());
    noteState.configured = Boolean(health.notes && health.notes.configured);
    noteState.reason = (health.notes && health.notes.reason) || "";
    if (!noteState.configured) {
      noteState.authed = false;
      paintNotes();
      return;
    }
    const session = await fetch("/api/session").then((response) => response.json());
    noteState.authed = Boolean(session.authenticated);
    noteState.csrf = session.csrf || "";
    if (noteState.authed) {
      await loadNotes();
      await loadAnalysis();
    } else paintNotes();
    if (document.body.classList.contains("mode-web")) showWeb();
    else renderAll();
  } catch {
    noteState.configured = false;
    noteState.reason = "ติดต่อเซิร์ฟเวอร์บันทึกไม่ได้";
    paintNotes();
  }
}

function bindChrome() {
  $("#prev").addEventListener("click", () => show(index - 1, true));
  $("#next").addEventListener("click", () => show(index + 1, true));
  $("#jump").addEventListener("change", (event) => show(Number(event.target.value), true));
  const toggleFull = () => {
    const slides = document.body.classList.contains("mode-present");
    const target = document.getElementById(slides ? "viewport" : "web-stage");
    if (document.fullscreenElement) document.exitFullscreen();
    else target.requestFullscreen().catch(() => {});
  };
  $("#full").addEventListener("click", toggleFull);
  $("#full-slide").addEventListener("click", toggleFull);
  document.addEventListener("keydown", (event) => {
    if (!document.body.classList.contains("mode-present")) return;
    if (editableTarget(event.target)) return;
    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      show(index + 1, true);
    } else if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      show(index - 1, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      show(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      show(SLIDE_IDS.length - 1, true);
    }
  });
}

function readPeriod() {
  const node = document.getElementById("report-period");
  const value = node && node.value;
  if (PERIOD_IDS.includes(value)) {
    adState.period = value;
    return value;
  }
  adState.period = "nov1_7";
  if (node) node.value = "nov1_7";
  return "nov1_7";
}

function showWeb() {
  const root = document.getElementById("web-main");
  if (!root || !deck) return;
  if (webView.view === "present") webView.view = "overview";
  renderWeb(root, {
    deck,
    status: statusData,
    view: webView.view,
    book: webView.book,
    reportId: readPeriod(),
    contentId: adState.contentId,
    statusId: adState.statusId,
    pages: webView.pages,
    historyStart: webView.historyStart || 0,
    onHistory: (start) => {
      webView.historyStart = start;
      showWeb();
    },
    picks: analysisState.items,
    drafts: analysisState.drafts,
    legacyNotes: Object.entries(noteState.notes || {}).map(([id, note]) => ({ id, text: note.text || "" })),
    onBook: (id) => {
      setWebView({ view: "book", book: id });
      markNav();
      showWeb();
    },
    onPage: (key, page) => {
      webView.pages[key] = page;
      showWeb();
    },
    onPick: togglePick,
    onDraft: (itemId, text) => {
      analysisState.drafts[itemId] = text;
    },
    onSave: saveAnalysis,
    onRemove: removeAnalysis,
  });
}

function markNav() {
  document.querySelectorAll("#webnav button[data-view]").forEach((item) => {
    const on = item.dataset.view === webView.view && (item.dataset.view !== "book" || item.dataset.book === webView.book);
    item.classList.toggle("on", on);
    item.setAttribute("aria-pressed", on ? "true" : "false");
    if (on) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  });
  document.querySelectorAll("#toolbar .book-chip").forEach((chip) => {
    const on = document.body.classList.contains("mode-present") && chip.dataset.slide === String(index);
    chip.classList.toggle("on", on);
    chip.setAttribute("aria-pressed", on ? "true" : "false");
  });
  for (const id of ["content-month", "status-filter", "creator-filter", "sort-filter"]) {
    const node = document.getElementById(id);
    if (!node) continue;
    const chosen = node.value && node.value !== "all";
    node.classList.toggle("is-current", chosen);
  }
  for (const id of ["report-period", "present-period"]) {
    const node = document.getElementById(id);
    if (node) node.classList.add("is-current");
  }
}

function paintPick(itemId, on) {
  document.querySelectorAll(`[data-pick="${itemId}"]`).forEach((button) => {
    button.textContent = on ? "เลือกแล้ว" : "เลือก";
    button.classList.toggle("on", on);
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.title = on ? "เลือกไว้วิเคราะห์แล้ว ไม่ใช่สถานะการยิงแอด" : "เลือกข้อความนี้ไว้วิเคราะห์ต่อยอด ไม่ใช่สถานะการยิงแอด";
    const row = button.closest(".prow, .scan-row, .analysis-card");
    if (row) row.classList.toggle("is-picked", on);
  });
}

async function loadAnalysis() {
  const response = await fetch("/api/analysis");
  if (!response.ok) {
    analysisState.items = {};
    return;
  }
  const data = await response.json();
  analysisState.items = data.items || {};
}

async function togglePick(ad, period) {
  if (!noteState.authed) return;
  const itemId = analysisItemId(period, ad.adId);
  if (analysisState.items[itemId]) {
    await removeAnalysis(itemId);
    return;
  }
  const response = await fetch("/api/analysis/select", {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": noteState.csrf },
    body: JSON.stringify({ adId: ad.adId, reportPeriod: period }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.item) return;
  analysisState.items[data.item.itemId] = data.item;
  paintPick(itemId, true);
}

async function saveAnalysis(itemId, text) {
  const item = analysisState.items[itemId];
  if (!item || !noteState.authed) return;
  const status = document.querySelector(`[data-analysis-status="${itemId}"]`);
  if (status) status.textContent = "กำลังบันทึก…";
  const response = await fetch("/api/analysis/" + encodeURIComponent(itemId), {
    method: "PUT",
    headers: { "content-type": "application/json", "x-csrf-token": noteState.csrf },
    body: JSON.stringify({ text, baseRevision: item.revision || 0 }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 409 && data.item) {
    analysisState.items[itemId] = data.item;
    if (status) status.textContent = "มีฉบับใหม่กว่าบนเซิร์ฟเวอร์ — ยังไม่ได้เขียนทับ";
    return;
  }
  if (!response.ok || !data.saved) {
    if (status) status.textContent = data.error || "บันทึกไม่สำเร็จ — ข้อความยังอยู่ในช่องนี้";
    return;
  }
  analysisState.items[itemId] = data.item;
  if (analysisState.drafts[itemId] === data.item.text) delete analysisState.drafts[itemId];
  if (status) status.textContent = "บันทึกแล้ว · " + formatTime(data.item.updatedAt);
}

async function removeAnalysis(itemId) {
  const item = analysisState.items[itemId];
  if (!item) return;
  const text = (analysisState.drafts[itemId] ?? item.text ?? "").trim();
  let confirmDelete = false;
  if (text) {
    confirmDelete = window.confirm("รายการนี้มีบันทึกวิเคราะห์ เอาออกจากรายการหรือไม่");
    if (!confirmDelete) return;
  }
  const response = await fetch("/api/analysis/" + encodeURIComponent(itemId), {
    method: "DELETE",
    headers: { "content-type": "application/json", "x-csrf-token": noteState.csrf },
    body: JSON.stringify({ confirm: confirmDelete }),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 409 && data.needsConfirm) {
    if (!window.confirm("รายการนี้มีบันทึกวิเคราะห์ เอาออกจากรายการหรือไม่")) return;
    const retry = await fetch("/api/analysis/" + encodeURIComponent(itemId), {
      method: "DELETE",
      headers: { "content-type": "application/json", "x-csrf-token": noteState.csrf },
      body: JSON.stringify({ confirm: true }),
    });
    if (!retry.ok) return;
  } else if (!response.ok) {
    return;
  }
  delete analysisState.items[itemId];
  delete analysisState.drafts[itemId];
  if (webView.view === "analysis") showWeb();
  else {
    const button = document.querySelector(`[data-pick="${itemId}"]`);
    paintPick(itemId, false);
  }
}

function bindWeb() {
  document.querySelectorAll("#webnav button[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.dataset.view === "present" ? "overview" : button.dataset.view;
      setWebView({ view, book: button.dataset.book || webView.book });
      document.body.classList.add("mode-web");
      document.body.classList.remove("mode-present");
      markNav();
      showWeb();
    });
  });
  const full = document.getElementById("full");
  if (full) full.addEventListener("click", () => {
    const target = document.getElementById("web-stage");
    if (!target) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else target.requestFullscreen().catch(() => {});
  });
  document.getElementById("report-period").addEventListener("change", (event) => {
    adState.period = event.target.value;
    adState.page = 0;
    for (const key of Object.keys(webView.pages)) delete webView.pages[key];
    syncAsof();
    refreshViews();
  });
  document.getElementById("content-month").addEventListener("change", (event) => {
    adState.contentId = event.target.value;
    adState.page = 0;
    refreshViews();
  });
  document.getElementById("status-filter").addEventListener("change", (event) => {
    adState.statusId = event.target.value;
    adState.page = 0;
    syncAsof();
    refreshViews();
  });
  document.getElementById("creator-filter").addEventListener("change", (event) => {
    adState.tag = event.target.value;
    adState.page = 0;
    refreshViews();
  });
  document.getElementById("sort-filter").addEventListener("change", (event) => {
    adState.sort = event.target.value;
    adState.page = 0;
    refreshViews();
  });
}

function refreshViews() {
  if (document.body.classList.contains("mode-web")) showWeb();
  else renderAll();
}

function syncAsof() {
  const labels = { sep: "ก.ย. 2569 ทั้งเดือน", oct: "ต.ค. 2569 ทั้งเดือน", oct1_7: "1–7 ต.ค. 2569", nov1_7: "1–7 พ.ย. 2569" };
  const selected = document.getElementById("report-period").value;
  document.getElementById("asof").textContent = "ถึง 7 พ.ย. 2569 · ไม่รวมวันนี้";
  const badge = document.getElementById("present-asof");
  if (badge) badge.textContent = labels[selected];
  const present = document.getElementById("present-period");
  if (present && present.value !== selected) present.value = selected;
  document.getElementById("status-asof").hidden = document.getElementById("status-filter").value === "all";
}

function fillFilters() {
  const months = new Set();
  for (const record of Object.values(statusData.ads_by_id || {})) {
    if (record.content_month) months.add(record.content_month);
  }
  const content = document.getElementById("content-month");
  for (const month of [...months].sort()) {
    const option = document.createElement("option");
    option.value = month;
    option.textContent = month + " จากชื่อแอด";
    content.append(option);
  }
  const creator = document.getElementById("creator-filter");
  creator.append(new Option("ทุกป้าย", ""));
  for (const tag of [...new Set(deck.ads.map((ad) => ad.creatorTag))].sort((a, b) => a.localeCompare(b, "th"))) {
    creator.append(new Option(tag, tag));
  }
}

async function init() {
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  document.body.classList.add("mode-web");
  document.body.classList.remove("mode-present");
  const period = document.getElementById("report-period");
  if (period) period.value = "nov1_7";
  adState.period = "nov1_7";
  webView.view = "overview";
  bindWeb();
  const response = await fetch("/data/deck.json");
  if (!response.ok) throw new Error("โหลดข้อมูลไม่ได้");
  deck = await response.json();
  statusData = await fetch("/data/ad-status.json").then((item) => item.json());
  fillFilters();
  syncAsof();
  markNav();
  showWeb();
  document.body.dataset.hydrated = "1";
  await refreshSession();
}

init().catch((error) => {
  banner("สไลด์แรกยังเปิดอยู่ — " + (error && error.message ? error.message : "สคริปต์สะดุด"));
});
