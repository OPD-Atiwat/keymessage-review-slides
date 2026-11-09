/** Display order only. It does not drop a row or change a metric. */

export function statusRank(record) {
  const code = record?.effective_status || "";
  if (code === "ACTIVE") return 0;
  if (code === "PAUSED" || code === "ADSET_PAUSED" || code === "WITH_ISSUES") return 1;
  return 2;
}

export function orderMonthAds(rows, statusById) {
  return rows.slice().sort((a, b) => {
    const rank = statusRank(statusById?.[a.adId]) - statusRank(statusById?.[b.adId]);
    if (rank) return rank;
    return b.revenue - a.revenue || String(a.adName).localeCompare(String(b.adName), "th");
  });
}
