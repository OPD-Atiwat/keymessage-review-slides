import { sumTotals } from "./metrics.js";

/** Display groups only. Book totals and the Ads Manager gate keep every ad id. */
export function mergeAdsByName(ads) {
  const groups = new Map();
  for (const ad of ads) {
    const name = String(ad.adName || "").trim();
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(ad);
  }
  const merged = [];
  for (const [name, list] of groups) {
    if (list.length === 1) {
      merged.push({ ...list[0], adName: name, mergedCount: 1, memberIds: [String(list[0].adId)] });
      continue;
    }
    const totals = sumTotals(list);
    const tags = [...new Set(list.map((ad) => ad.creatorTag || ""))];
    merged.push({
      ...list[0],
      adName: name,
      adId: String(list[0].adId),
      spend: totals.spend,
      revenue: totals.revenue,
      impressions: totals.impressions,
      chats: totals.chats,
      purchases: totals.purchases,
      creatorTag: tags.length === 1 ? tags[0] : tags.filter(Boolean).join(", "),
      mergedCount: list.length,
      memberIds: list.map((ad) => String(ad.adId)),
      bodyConflict: list.some((ad) => ad.bodyConflict),
      metaOmitted: list.every((ad) => ad.metaOmitted),
    });
  }
  return merged;
}
