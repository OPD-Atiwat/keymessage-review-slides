/**
 * Deploy gate. Compares the published deck with data/meta_reference_<period>.json.
 * Book totals must match campaign-level insights. Each ad row must match ad-level
 * insights. When ad-level is below campaign-level, one explicit omitted row carries
 * the difference and is ไม่ทราบ Creator. Exit 1 blocks the image build.
 */
import { readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { OVERVIEW_MONTHS } from "../shared/history.js";

const BOOKS = ["Mind", "Coworkers", "SurvivalGuide", "Trap"];
export const OMITTED_NAME = "แอดที่ Meta ไม่ส่งรายแอด (ลบแล้ว)";
const MONEY = 1;
const REQUIRED_METRICS = {
  purchases: "omni_purchase",
  revenue: "omni_purchase",
  messages: "onsite_conversion.messaging_conversation_started_7d",
};

export function bookOf(name) {
  const hits = BOOKS.filter((book) => String(name || "").includes(`[${book}]`));
  return hits.length === 1 ? hits[0] : null;
}

function actionSum(list, type) {
  if (!Array.isArray(list)) return 0;
  let sum = 0;
  for (const item of list) {
    if (item && item.action_type === type) sum += Number(item.value) || 0;
  }
  return sum;
}

export function metricsOf(row) {
  return {
    spend: Number(row.spend) || 0,
    purchases: actionSum(row.actions, REQUIRED_METRICS.purchases),
    revenue: actionSum(row.action_values, REQUIRED_METRICS.revenue),
    messages: actionSum(row.actions, REQUIRED_METRICS.messages),
  };
}

function zero() {
  return { spend: 0, purchases: 0, revenue: 0, messages: 0 };
}

function add(left, right) {
  return {
    spend: left.spend + right.spend,
    purchases: left.purchases + right.purchases,
    revenue: left.revenue + right.revenue,
    messages: left.messages + right.messages,
  };
}

function moneyClose(left, right) {
  return Math.abs(Number(left) - Number(right)) <= MONEY;
}

function countExact(left, right) {
  const x = Number(left);
  const y = Number(right);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  if (Math.abs(x - Math.round(x)) > 1e-6 || Math.abs(y - Math.round(y)) > 1e-6) return false;
  return Math.round(x) === Math.round(y);
}

function sameTotals(left, right) {
  return moneyClose(left.spend, right.spend)
    && moneyClose(left.revenue, right.revenue)
    && countExact(left.purchases, right.purchases)
    && countExact(left.messages, right.messages);
}

function emptyTotals(row) {
  return moneyClose(row.spend, 0) && moneyClose(row.revenue, 0) && countExact(row.purchases, 0) && countExact(row.messages, 0);
}

function siteMetrics(ad) {
  return {
    spend: Number(ad.spend) || 0,
    purchases: Number(ad.purchases) || 0,
    revenue: Number(ad.revenue) || 0,
    messages: Number(ad.chats) || 0,
  };
}

function otherNames(reference) {
  const names = new Set();
  for (const item of reference.otherProductCampaigns || []) {
    const name = typeof item === "string" ? item : item?.campaign_name;
    if (name) names.add(name);
  }
  return names;
}

export function checkPeriod(periodAds, bookTotals, reference) {
  const failures = [];
  const fail = (code, detail) => failures.push({ code, detail });
  if (!reference) return { ok: false, failures: [{ code: "MISSING_REFERENCE", detail: "no data/meta_reference file for this period" }] };
  for (const [key, type] of Object.entries(REQUIRED_METRICS)) {
    if (reference.metrics?.[key] !== type) fail("METRIC_TYPE", `${key} must be ${type}`);
  }
  const other = otherNames(reference);
  const campBook = Object.fromEntries(BOOKS.map((book) => [book, zero()]));
  for (const row of reference.campaigns || []) {
    const name = row.campaign_name || "";
    const book = bookOf(name);
    if (book) campBook[book] = add(campBook[book], metricsOf(row));
    else if (!other.has(name)) fail("UNLISTED_CAMPAIGN", name);
  }
  const adBook = Object.fromEntries(BOOKS.map((book) => [book, zero()]));
  const refAds = [];
  for (const row of reference.ads || []) {
    const name = row.campaign_name || "";
    const book = bookOf(name);
    if (book) {
      const metrics = metricsOf(row);
      adBook[book] = add(adBook[book], metrics);
      refAds.push({ id: String(row.ad_id), book, metrics });
    } else if (!other.has(name)) {
      fail("UNLISTED_AD", `${row.ad_id} ${name}`);
    } else if (periodAds.some((ad) => String(ad.adId) === String(row.ad_id))) {
      fail("OTHER_PRODUCT_ON_SITE", String(row.ad_id));
    }
  }
  for (const book of BOOKS) {
    const site = bookTotals?.[book];
    const camp = campBook[book];
    if (!site) {
      if (!emptyTotals(camp)) fail("MISSING_BOOK", `${book} campaign spend ${camp.spend}`);
      continue;
    }
    const published = { spend: site.spend, purchases: site.purchases, revenue: site.revenue, messages: site.chats };
    if (!sameTotals(published, camp)) {
      fail("BOOK_CAMPAIGN", `${book} site ${published.spend}/${published.purchases}/${published.revenue}/${published.messages} campaign ${camp.spend}/${camp.purchases}/${camp.revenue}/${camp.messages}`);
    }
  }
  const real = periodAds.filter((ad) => !ad.metaOmitted);
  const omitted = periodAds.filter((ad) => ad.metaOmitted);
  const realById = new Map(real.map((ad) => [String(ad.adId), ad]));
  const refById = new Map(refAds.map((ad) => [ad.id, ad]));
  for (const ref of refAds) {
    const site = realById.get(ref.id);
    if (!site) {
      fail("MISSING_AD", ref.id);
      continue;
    }
    if (site.book !== ref.book) fail("AD_BOOK", `${ref.id} site ${site.book} campaign ${ref.book}`);
    if (!sameTotals(siteMetrics(site), ref.metrics)) fail("AD_METRICS", ref.id);
  }
  for (const ad of real) {
    if (!BOOKS.includes(ad.book)) fail("EXTRA_AD", `${ad.adId} book ${ad.book}`);
    else if (!refById.has(String(ad.adId))) fail("EXTRA_AD", String(ad.adId));
  }
  for (const book of BOOKS) {
    const gap = {
      spend: campBook[book].spend - adBook[book].spend,
      purchases: campBook[book].purchases - adBook[book].purchases,
      revenue: campBook[book].revenue - adBook[book].revenue,
      messages: campBook[book].messages - adBook[book].messages,
    };
    const adExceeds = gap.spend < -MONEY || gap.revenue < -MONEY || gap.purchases < -0.5 || gap.messages < -0.5;
    const needsRow = !adExceeds && !sameTotals(gap, zero());
    const rows = omitted.filter((ad) => ad.book === book);
    if (adExceeds) fail("AD_EXCEEDS_CAMPAIGN", book);
    else if (needsRow && rows.length !== 1) fail("OMITTED_ROW", `${book} needs 1 row, found ${rows.length}`);
    else if (!needsRow && rows.length) fail("OMITTED_ROW", `${book} has a row but ad-level already matches`);
    else if (needsRow) {
      const row = rows[0];
      if (row.adName !== OMITTED_NAME) fail("OMITTED_NAME", row.adName || "");
      if (row.creatorTag) fail("OMITTED_CREATOR", row.creatorTag);
      if (!sameTotals(siteMetrics(row), gap)) fail("OMITTED_METRICS", book);
    }
  }
  for (const ad of omitted) {
    if (!BOOKS.includes(ad.book)) fail("OMITTED_ROW", ad.adId);
  }
  const creator = new Map();
  const expect = new Map();
  const bump = (map, tag, metrics) => {
    map.set(tag, add(map.get(tag) || zero(), metrics));
  };
  for (const ad of periodAds) bump(creator, ad.creatorTag || "", siteMetrics(ad));
  for (const ref of refAds) {
    const site = realById.get(ref.id);
    if (site) bump(expect, site.creatorTag || "", ref.metrics);
  }
  for (const ad of omitted) bump(expect, "", siteMetrics(ad));
  const tags = new Set([...creator.keys(), ...expect.keys()]);
  for (const tag of tags) {
    const left = creator.get(tag) || zero();
    const right = expect.get(tag) || zero();
    if (!sameTotals(left, right)) fail("CREATOR", tag || "ไม่ทราบ Creator");
  }
  let siteSum = zero();
  let campSum = zero();
  for (const ad of periodAds) siteSum = add(siteSum, siteMetrics(ad));
  for (const book of BOOKS) campSum = add(campSum, campBook[book]);
  if (!sameTotals(siteSum, campSum)) fail("OVERALL", `site ${siteSum.spend} campaign ${campSum.spend}`);
  return { ok: failures.length === 0, failures, omitted: omitted.length, ads: real.length };
}

export function formatIct(date) {
  const parts = new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${get("day")} ${get("month")} ${get("year")} ${get("hour")}:${get("minute")} น.`;
}

export function gateLine(date, ranges) {
  return `ตรวจตรงกับ Ads Manager (Meta) ล่าสุด ${formatIct(date)} ICT, ช่วง ${ranges.join(", ")}`;
}

export function checkAll({ deck, references, periods, now = new Date() }) {
  const results = [];
  for (const period of periods) {
    const reference = references.find((item) => item.period === period.id) || null;
    const periodAds = (deck.ads || []).filter((ad) => ad.period === period.id);
    const checked = checkPeriod(periodAds, deck.bookTotals?.[period.id], reference);
    results.push({ id: period.id, range: reference?.range || period.label, ...checked });
  }
  const ok = results.every((item) => item.ok);
  const line = ok ? gateLine(now, results.map((item) => item.range)) : "";
  return { ok, results, line, checkedAt: now.toISOString() };
}

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadGate(root) {
  const dataDir = path.join(root, "data");
  const references = readdirSync(dataDir)
    .filter((name) => name.startsWith("meta_reference_") && name.endsWith(".json"))
    .map((name) => readJson(path.join(dataDir, name)));
  const deck = readJson(path.join(root, "public/data/deck.json"));
  return { deck, references };
}

export function runCli(root, options = {}) {
  const { deck, references } = loadGate(root);
  const report = checkAll({ deck, references, periods: OVERVIEW_MONTHS, now: options.now || new Date() });
  const lines = ["META RECONCILE"];
  for (const item of report.results) {
    if (item.ok) lines.push(`PASS ${item.id} ${item.range} ads=${item.ads} omitted=${item.omitted}`);
    else {
      lines.push(`FAIL ${item.id} ${item.range}`);
      for (const failure of item.failures) lines.push(`  ${failure.code} ${failure.detail}`);
    }
  }
  const stamp = path.join(root, "public/data/meta-gate.json");
  if (report.ok) {
    const payload = { ok: true, checkedAt: report.checkedAt, line: report.line, periods: report.results.map((item) => item.id) };
    if (options.writeStamp !== false) writeFileSync(stamp, JSON.stringify(payload));
    lines.push("GATE PASS");
    lines.push(report.line);
  } else {
    if (options.writeStamp !== false) {
      try { unlinkSync(stamp); } catch { /* no stale pass stamp */ }
    }
    lines.push("GATE FAIL");
  }
  return { code: report.ok ? 0 : 1, text: lines.join("\n"), report };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = runCli(root);
  console.log(result.text);
  process.exit(result.code);
}
