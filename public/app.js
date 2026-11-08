import { rates, sumTotals, volumeFlag } from "/shared/metrics.js";
import { MAX_NOTE, SLIDE_IDS } from "/shared/slides.js";

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
  ["revenue", "รายได้ Meta"],
  ["spend", "Spend"],
  ["roas", "ROAS"],
  ["chats", "แชท"],
  ["costPerMsg", "บาท/แชท"],
  ["cpm", "CPM"],
  ["purchases", "ซื้อ"],
  ["cvr", "ซื้อ÷แชท"],
  ["aov", "AOV"],
];

const deckEl = document.getElementById("deck");
const slides = [...deckEl.querySelectorAll(".slide")];
let deck = null;
let index = 0;
let userMoved = false;
const adState = { period: "nov1_7", book: "", tag: "", sort: "revenue", q: "", page: 0, bodyKey: "" };
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
    if (!q) return true;
    return `${ad.adName} ${ad.body} ${ad.creatorTag} ${ad.adId}`.toLowerCase().includes(q);
  });
  rows.sort((a, b) => {
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
  const filters = el("div", "filters");
  filters.append(select("ช่วง", PERIODS.map((item) => [item.id, item.label]), adState.period, (value) => {
    adState.period = value;
    adState.page = 0;
    renderAdPage(mount);
  }));
  filters.append(select("เล่ม", [["", "ทุกเล่ม"], ...BOOKS.map((book) => [book.id, book.name])], adState.book, (value) => {
    adState.book = value;
    adState.page = 0;
    renderAdPage(mount);
  }));
  const tags = [...new Set(deck.ads.map((ad) => ad.creatorTag))].sort((a, b) => a.localeCompare(b, "th"));
  filters.append(select("ป้าย", [["", "ทุกป้าย"], ...tags.map((tag) => [tag, tag])], adState.tag, (value) => {
    adState.tag = value;
    adState.page = 0;
    renderAdPage(mount);
  }, "creator-filter"));
  filters.append(select("เรียง", SORTS, adState.sort, (value) => {
    adState.sort = value;
    adState.page = 0;
    renderAdPage(mount);
  }, "sort-filter"));
  const searchLabel = el("label", "", "ค้น");
  const search = document.createElement("input");
  search.type = "search";
  search.value = adState.q;
  search.setAttribute("aria-label", "ค้นชื่อแอดหรือข้อความ");
  search.addEventListener("input", () => {
    adState.q = search.value;
    adState.page = 0;
    renderAdPage(mount);
  });
  searchLabel.append(search);
  filters.append(searchLabel);
  if (adState.bodyKey) {
    const clear = el("button", "ghost", "ล้างตัวกรองข้อความ");
    clear.type = "button";
    clear.addEventListener("click", () => {
      adState.bodyKey = "";
      adState.page = 0;
      renderAds();
    });
    filters.append(clear);
  }
  mount.append(filters);
  const results = el("div", "ad-results");
  mount.append(results);
  renderAdPage(mount);
}

function renderAdPage(mount) {
  const results = mount.querySelector(".ad-results");
  if (!results) return;
  results.replaceChildren();
  const rows = filteredAds();
  const pageSize = 2;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  if (adState.page > pages - 1) adState.page = 0;
  const slice = rows.slice(adState.page * pageSize, adState.page * pageSize + pageSize);
  const list = el("div", "adlist");
  if (!slice.length) list.append(el("p", "fine", "ไม่พบแอดในช่วงกรองนี้"));
  for (const ad of slice) list.append(adCard(ad));
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
  results.append(el("p", "fine", "สี่ช่วงอยู่แยกกัน 1–7 ต.ค. เป็นส่วนหนึ่งของเดือน ต.ค. · รายได้เป็นยอดที่ Meta นับให้แอด · ภาพนิ่งไม่ใช่วิดีโอที่เล่นได้"));
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
  const mount = document.querySelector('[data-mount="s01-axis"]');
  mount.replaceChildren();
  const grid = el("div", "books");
  for (const book of BOOKS) {
    const oct = deck.bookTotals.oct[book.id];
    const nov = deck.bookTotals.nov1_7[book.id];
    const card = el("article", "book " + book.cls);
    card.append(el("h2", "", book.name));
    card.append(el("p", "metric-line", `ต.ค. ROAS ${roasText(oct)} · 1–7 พ.ย. ROAS ${roasText(nov)} · บาท/แชท ${rates(nov).costPerMsg == null ? "—" : baht(rates(nov).costPerMsg)}`));
    grid.append(card);
  }
  mount.append(grid);
  const chips = el("div", "chips");
  ["รายได้คือ omni_purchase ของ Meta ไม่ใช่ BEP หรือ Organic", "ซื้อ÷แชทเกิน 100% ได้ เพราะไม่ได้จับคู่แชทกับออเดอร์", "ข้อความมาจากตัวแอด ยังไม่ได้ดูคลิป", "ไม่มีเกณฑ์ 115% หรือ 70% และไม่มีคำสั่งงบ", "สแนปชอต 8 พ.ย. 2569 ไม่รวมยอดวันที่ 8 ที่ยังไม่จบวัน"].forEach((text) => chips.append(el("span", "chip", text)));
  mount.append(chips);
}

function renderQuestions() {
  const mount = document.querySelector('[data-mount="s11-questions"]');
  mount.replaceChildren();
  const grid = el("div", "questions");
  const items = [
    ["กับดักสองข้อความเรื่องโรควิตก", "ช่วง 1–7 พ.ย. ข้อความ “ใกล้ตัวคุณกว่าที่คิด” ROAS 1.95 ส่วน “โรคที่คนไทยเป็นเยอะ” ROAS 0.52 ทั้งที่เป็นคนละข้อความ ไฟล์วิเคราะห์ถามว่าในคลิปพูดต่างกันตรงไหน หน้านี้ยังไม่ได้ดูคลิป"],
    ["ออฟฟิศที่เปิดด้วยความทุกข์เรื่องคน", "สองข้อความเครื่องหมายคำพูดไม่ตรงกันทุกตัวอักษร ได้แชทถูกและ ROAS เกิน 2 ใน 1–7 พ.ย. คำถามคืออะไรทำให้คนทัก ไม่ใช่บทใหม่ที่แต่งขึ้น"],
    ["Mind แชทถูกแต่ซื้อบาง", "“ลูกค้าไม่ซื้อ อาจไม่ใช่เพราะราคา” มีแชท 134 ครั้งและซื้อ 11 ครั้งใน 1–7 พ.ย. คำถามคือสิ่งที่คลิปสัญญาตรงกับที่แอดมินตอบหรือไม่"],
    ["โปรและเล่มลายเซ็นของกับดัก", "บาทต่อแชทสูงและซื้อ÷แชทสูงในบางชุด ไฟล์วิเคราะห์ถามว่าคนซื้อผ่านช่องทางไหน ข้อมูลนี้ยังตอบไม่ได้"],
  ];
  for (const [title, copy] of items) {
    const card = el("article", "point");
    card.append(el("h2", "", title), el("p", "", copy));
    grid.append(card);
  }
  mount.append(grid);
  const quarantined = sumTotals(deck.excluded.quarantine.filter((row) => row.period === "nov1_7" && row.adId === "120255364063130260"));
  mount.append(el("p", "fine", `ตัดสอง ad_id ออกทุกช่วง: 120255364063130260 และ 120255499941520260 เพราะชื่อเล่มกับข้อความไม่ตรงกัน ตัวแรกช่วง 1–7 พ.ย. Spend ${baht(quarantined.spend)} รายได้ ${baht(quarantined.revenue)} ถ้าเอากลับเข้ากับดัก ROAS ของเล่มจะเปลี่ยน Shopee และ OPDApp ไม่ได้อยู่ในตารางแชท`));
}

function renderSynthesis() {
  const mount = document.querySelector('[data-mount="s12-synthesis"]');
  mount.replaceChildren();
  const grid = el("div", "questions");
  const lines = [
    ["ออฟฟิศคือเล่มที่ขยับขึ้น", `ROAS ทั้งเดือน 1.33 ใน ก.ย. เป็น 1.45 ใน ต.ค. และ 1.67 ใน 1–7 พ.ย. บาท/แชทของสัปดาห์นั้น ${baht(rates(deck.bookTotals.nov1_7.Coworkers).costPerMsg)} ข้อความที่เปิดด้วยความทุกข์เรื่องคนคือชุดที่แชทถูกที่สุดในสัปดาห์นี้`],
    ["Mind ต่ำทั้งเล่ม", `ต.ค. ROAS ${roasText(deck.bookTotals.oct.Mind)} และ 1–7 พ.ย. ยัง ${roasText(deck.bookTotals.nov1_7.Mind)} ข้อความแชทถูกอย่าง “ลูกค้าไม่ซื้อ อาจไม่ใช่เพราะราคา” ยังตามด้วยยอดซื้อบาง`],
    ["กับดักใหญ่ แต่ข้อความคนละแบบ", "ข้อความโรควิตก “ใกล้ตัว” ถือแชทได้ถูกใน 1–7 พ.ย. ส่วนอีกข้อความที่พ้องชื่อใช้เงินไปแล้ว ROAS 0.52 ในสัปดาห์นั้น ทั้งที่ทั้งเดือน ก.ย. และ ต.ค. ชุดหลังยังเกิน 1"],
    ["Survival อย่าอ่านแค่สัปดาห์เล็ก", `ทั้งเดือน ต.ค. ROAS ${roasText(deck.bookTotals.oct.SurvivalGuide)} บางข้อความต้น พ.ย. ROAS สูงบน Spend หลักร้อยหรือหลักพัน ฐานนั้นยังเล็ก`],
  ];
  for (const [title, copy] of lines) {
    const card = el("article", "point");
    card.append(el("h2", "", title), el("p", "", copy));
    grid.append(card);
  }
  mount.append(grid);
  mount.append(el("p", "fine", "ใช้คุยข้อความแอดในรอบสแนปชอตนี้ ไม่ได้สรุปว่าข้อความเป็นสาเหตุ และไม่ได้สั่งให้ขยับงบ ป้ายครีเอเตอร์เป็นแค่ตัวกรองในรายการแอด"));
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

function renderAll() {
  renderAxis();
  document.querySelector('[data-mount="s02-sep-oct"]').replaceChildren(bookTable("sep", "oct"));
  document.querySelector('[data-mount="s03-matched-week"]').replaceChildren(bookTable("oct1_7", "nov1_7"));
  renderOverview();
  renderMessageGrid("s05-mind");
  renderMessageGrid("s06-coworkers");
  renderMessageGrid("s07-survival");
  renderMessageGrid("s08-trap");
  renderMessageGrid("s09-same-copy");
  renderAds();
  renderQuestions();
  renderSynthesis();
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
  for (const id of SLIDE_IDS) {
    const region = document.querySelector(`[data-notes-for="${id}"]`);
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
  noteState.authed = false;
  noteState.csrf = "";
  noteState.notes = {};
  noteState.dirty = {};
  noteState.conflict = {};
  noteState.pendingImport = null;
  paintNotes();
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
    if (noteState.authed) await loadNotes();
    else paintNotes();
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
  $("#full").addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  });
  document.addEventListener("keydown", (event) => {
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

async function init() {
  bindChrome();
  const response = await fetch("/data/deck.json");
  if (!response.ok) throw new Error("โหลดข้อมูลสไลด์ไม่ได้");
  deck = await response.json();
  renderAll();
  deckEl.classList.add("ready");
  show(initialIndex(), false);
  deckEl.dataset.hydrated = "1";
  await refreshSession();
}

init().catch((error) => {
  banner("สไลด์แรกยังเปิดอยู่ — " + (error && error.message ? error.message : "สคริปต์สะดุด"));
});
