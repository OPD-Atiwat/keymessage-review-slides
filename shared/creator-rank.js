import { rates, sumTotals } from "./metrics.js";

/** The four verified book scopes. Unmapped and excluded ads are not in this list. */
export const VERIFIED_BOOKS = ["Mind", "Coworkers", "SurvivalGuide", "Trap"];

/** Empty creatorTag in the snapshot. Not a person and not a guessed name. */
export const UNKNOWN_CREATOR = "";
export const UNKNOWN_LABEL = "ไม่ทราบ Creator";

export const CREATOR_METRICS = [
  { key: "spend", label: "Spend", lowerBetter: false },
  { key: "revenue", label: "Revenue", lowerBetter: false },
  { key: "roas", label: "ROAS", lowerBetter: false },
  { key: "chats", label: "Messages", lowerBetter: false },
  { key: "costPerMsg", label: "Cost per Message", lowerBetter: true },
  { key: "cpm", label: "CPM", lowerBetter: true },
  { key: "purchases", label: "Purchases", lowerBetter: false },
  { key: "cvrProxy", label: "CVR", lowerBetter: false },
  { key: "aov", label: "AOV", lowerBetter: false },
];

export function defaultCreatorDir(key) {
  const metric = CREATOR_METRICS.find((item) => item.key === key);
  return metric && metric.lowerBetter ? "asc" : "desc";
}

export function periodAds(ads, period, book = "all") {
  return ads.filter((ad) => {
    if (ad.period !== period) return false;
    if (!VERIFIED_BOOKS.includes(ad.book)) return false;
    if (book && book !== "all" && ad.book !== book) return false;
    return true;
  });
}

/**
 * One group per stored creatorTag. A composite tag stays one group.
 * Ads are not copied onto each named person and are not split.
 */
export function creatorGroups(ads, period, book = "all") {
  const buckets = new Map();
  for (const ad of periodAds(ads, period, book)) {
    const tag = typeof ad.creatorTag === "string" ? ad.creatorTag : UNKNOWN_CREATOR;
    if (!buckets.has(tag)) buckets.set(tag, []);
    buckets.get(tag).push(ad);
  }
  const groups = [];
  for (const [tag, list] of buckets) {
    const totals = sumTotals(list);
    const rate = rates(totals);
    groups.push({
      tag,
      known: tag !== UNKNOWN_CREATOR,
      label: tag || UNKNOWN_LABEL,
      n: list.length,
      spend: totals.spend,
      revenue: totals.revenue,
      impressions: totals.impressions,
      chats: totals.chats,
      purchases: totals.purchases,
      roas: rate.roas,
      costPerMsg: rate.costPerMsg,
      cpm: rate.cpm,
      cvrProxy: rate.cvrProxy,
      aov: rate.aov,
      ads: list,
    });
  }
  return groups;
}

export function knownCreators(groups) {
  return groups.filter((row) => row.known);
}

export function unknownCreator(groups) {
  return groups.find((row) => !row.known) || null;
}

function tie(a, b) {
  const byLabel = a.label.localeCompare(b.label, "th");
  if (byLabel) return byLabel;
  if (a.tag === b.tag) return 0;
  return a.tag < b.tag ? -1 : 1;
}

/** Missing rates sort last in both directions. Equal values keep a stable name order. */
export function sortCreators(rows, key = "roas", dir = "desc") {
  const sign = dir === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const left = a[key];
    const right = b[key];
    const leftMissing = left == null || !Number.isFinite(Number(left));
    const rightMissing = right == null || !Number.isFinite(Number(right));
    if (leftMissing || rightMissing) {
      if (leftMissing && rightMissing) return tie(a, b);
      return leftMissing ? 1 : -1;
    }
    if (Number(left) !== Number(right)) return (Number(left) - Number(right)) * sign;
    return tie(a, b);
  });
}

export function expectedTotals(bookTotals, period, book = "all") {
  if (book && book !== "all") return bookTotals?.[period]?.[book] || null;
  const totals = { spend: 0, revenue: 0, impressions: 0, chats: 0, purchases: 0, n: 0 };
  let any = false;
  for (const id of VERIFIED_BOOKS) {
    const row = bookTotals?.[period]?.[id];
    if (!row) continue;
    any = true;
    totals.spend += Number(row.spend) || 0;
    totals.revenue += Number(row.revenue) || 0;
    totals.impressions += Number(row.impressions) || 0;
    totals.chats += Number(row.chats) || 0;
    totals.purchases += Number(row.purchases) || 0;
    totals.n += Number(row.n) || 0;
  }
  return any ? totals : null;
}

export function reconcileCreators(groups, bookTotals, period, book = "all") {
  const summed = { spend: 0, revenue: 0, impressions: 0, chats: 0, purchases: 0, n: 0 };
  for (const group of groups) {
    summed.spend += group.spend;
    summed.revenue += group.revenue;
    summed.impressions += group.impressions;
    summed.chats += group.chats;
    summed.purchases += group.purchases;
    summed.n += group.n;
  }
  const expected = expectedTotals(bookTotals, period, book);
  if (!expected) return { ok: summed.n === 0, summed, expected: null };
  const fields = ["spend", "revenue", "impressions", "chats", "purchases", "n"];
  const ok = fields.every((field) => Math.abs(summed[field] - Number(expected[field])) < 0.05);
  return { ok, summed, expected };
}

const FULL_MONTHS = [
  { id: "may", short: "พ.ค." },
  { id: "jun", short: "มิ.ย." },
  { id: "jul", short: "ก.ค." },
  { id: "aug", short: "ส.ค." },
  { id: "sep", short: "ก.ย." },
  { id: "oct", short: "ต.ค." },
];

/** May–October only. A month with no stored rows for this tag is null, not zero. */
export function creatorHistory(ads, book, tag, key) {
  return FULL_MONTHS.map((month) => {
    const group = creatorGroups(ads, month.id, book).find((row) => row.tag === tag) || null;
    const raw = group ? group[key] : null;
    const value = raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
    return { id: month.id, short: month.short, value, n: group ? group.n : 0 };
  });
}

export function coverageOf(groups) {
  let tagged = 0;
  let blank = 0;
  for (const group of groups) {
    if (group.known) tagged += group.n;
    else blank += group.n;
  }
  return { tagged, blank, total: tagged + blank };
}
