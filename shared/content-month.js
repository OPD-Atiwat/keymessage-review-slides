/** Leading [DD.MM.YY] on the ad name. Year 69 stays unknown, matching the Content column. */

export function contentMonthOf(name) {
  const match = String(name || "").trim().match(/^\[(\d{2})\.(\d{2})\.(\d{2})\]/);
  if (!match) return { id: "unknown", label: "ไม่ระบุเดือน", sort: -1 };
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || year === 69) return { id: "unknown", label: "ไม่ระบุเดือน", sort: -1 };
  const full = 2000 + year;
  return {
    id: `${full}-${String(month).padStart(2, "0")}`,
    label: `${String(month).padStart(2, "0")}.${String(year).padStart(2, "0")}`,
    sort: full * 100 + month,
  };
}

export function contentMonthOptions(rows) {
  const map = new Map();
  for (const row of rows) {
    const month = contentMonthOf(row.adName);
    const item = map.get(month.id) || { ...month, count: 0 };
    item.count += 1;
    map.set(month.id, item);
  }
  return [...map.values()].sort((a, b) => b.sort - a.sort);
}

export function filterByContentMonth(rows, selected) {
  if (!selected || selected.length === 0) return rows;
  const allow = new Set(selected);
  return rows.filter((row) => allow.has(contentMonthOf(row.adName).id));
}
