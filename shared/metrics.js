/** Ratio helpers. Every rate is a sum of parts, never an average of rates. */

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function ratio(numerator, denominator) {
  const den = num(denominator);
  if (den === 0) return null;
  return num(numerator) / den;
}

export function rates(totals) {
  const spend = num(totals.spend);
  const revenue = num(totals.revenue);
  const chats = num(totals.chats);
  const purchases = num(totals.purchases);
  const impressions = num(totals.impressions);
  return {
    roas: ratio(revenue, spend),
    costPerMsg: ratio(spend, chats),
    cpm: ratio(spend * 1000, impressions),
    cvrProxy: ratio(purchases, chats),
    aov: ratio(revenue, purchases),
  };
}

export function sumTotals(rows) {
  const totals = { spend: 0, revenue: 0, impressions: 0, chats: 0, purchases: 0, n: 0 };
  for (const row of rows) {
    totals.spend += num(row.spend);
    totals.revenue += num(row.revenue);
    totals.impressions += num(row.impressions);
    totals.chats += num(row.chats);
    totals.purchases += num(row.purchases);
    totals.n += 1;
  }
  return totals;
}

/** Reading aid copied from the early-November findings note. Not a stop/scale rule. */
export function volumeFlag(totals) {
  if (num(totals.spend) < 5000 || num(totals.purchases) < 10) return "low";
  return "enough";
}

export function meanOfRatios(rows, pick) {
  const ratios = [];
  for (const row of rows) {
    const value = pick(row);
    if (value != null && Number.isFinite(value)) ratios.push(value);
  }
  if (!ratios.length) return null;
  return ratios.reduce((sum, value) => sum + value, 0) / ratios.length;
}
