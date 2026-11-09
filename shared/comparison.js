/** One row per ad in a reporting period. Same body text does not merge two creatives. */

export function comparisonRows({ ads, statusById, book, period, contentId = "all", statusId = "all" }) {
  const rows = [];
  for (const ad of ads) {
    if (ad.period !== period) continue;
    if (book && ad.book !== book) continue;
    const record = statusById?.[ad.adId];
    const content = record?.content_month || "unknown";
    if (contentId === "unknown" && content !== "unknown") continue;
    if (contentId !== "all" && contentId !== "unknown" && content !== contentId && content !== "unknown") continue;
    if (statusId !== "all" && record?.effective_status !== statusId) continue;
    rows.push(ad);
  }
  rows.sort((a, b) => b.revenue - a.revenue || a.adName.localeCompare(b.adName, "th"));
  return rows;
}

export function pageOf(rows, page, pageSize) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safe = Math.max(0, Math.min(page, pages - 1));
  return { pages, page: safe, slice: rows.slice(safe * pageSize, safe * pageSize + pageSize) };
}
