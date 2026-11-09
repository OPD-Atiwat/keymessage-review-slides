import { changePct, metricTone } from "./conditional.js";
import { ratio } from "./metrics.js";

/** Review adapter for a held history bundle. It never writes the website deck. */

export const REVIEW_CHANNEL = "messaging";
export const PUBLISHABLE_STATUS = "APPROVED_FOR_PUBLISH";

const BOOKS = ["Mind", "Coworkers", "SurvivalGuide", "Trap"];

const PERIODS = [
  { id: "2026-05", kind: "full", label: "พ.ค. 2569", short: "พ.ค." },
  { id: "2026-06", kind: "full", label: "มิ.ย. 2569", short: "มิ.ย." },
  { id: "2026-07", kind: "full", label: "ก.ค. 2569", short: "ก.ค." },
  { id: "2026-08", kind: "full", label: "ส.ค. 2569", short: "ส.ค." },
  { id: "2026-09", kind: "full", label: "ก.ย. 2569", short: "ก.ย." },
  { id: "2026-10", kind: "full", label: "ต.ค. 2569", short: "ต.ค." },
  { id: "2026-11", kind: "partial", label: "1–7 พ.ย. 2569", short: "1–7 พ.ย.", through: "2026-11-07" },
];

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function priorFull(periodId) {
  const full = PERIODS.filter((item) => item.kind === "full");
  const index = full.findIndex((item) => item.id === periodId);
  return index > 0 ? full[index - 1] : null;
}

function includedSum(rows, periodId, book) {
  let spend = 0;
  let revenue = 0;
  let count = 0;
  for (const row of rows) {
    if (row.period !== periodId || row.book !== book || row.channel !== REVIEW_CHANNEL) continue;
    if (row.allocation_bucket !== "included") continue;
    if (!finite(row.spend) || !finite(row.revenue_meta) || row.spend < 0 || row.revenue_meta < 0) {
      throw new Error(`included row ${row.ad_id} ${periodId} is missing or negative`);
    }
    spend += row.spend;
    revenue += row.revenue_meta;
    count += 1;
  }
  return count ? { spend, revenue, count } : null;
}

function trendFor(cells, period, book, official) {
  const current = cells[period.id]?.[book];
  if (!current) return { roasText: "—", tone: "neutral", short: "—", revenueText: "—", revenueTone: "neutral", basis: "ไม่มียอดในช่วงนี้" };
  const roas = finite(current.spend) && finite(current.revenue) ? ratio(current.revenue, current.spend) : null;
  const roasText = roas == null ? "—" : roas.toFixed(2);
  if (period.kind === "partial") {
    return {
      roasText,
      tone: "neutral",
      short: "ไม่เทียบทั้งเดือน",
      revenueText: "—",
      revenueTone: "neutral",
      basis: "1–7 พ.ย. ไม่เทียบทั้งเดือน และไม่มีฐาน 1–7 ต.ค. ในชุดนี้",
    };
  }
  const prior = priorFull(period.id);
  if (!prior) {
    return { roasText, tone: "neutral", short: "ไม่มีเดือนก่อน", revenueText: "—", revenueTone: "neutral", basis: "ไม่มีเดือนก่อนในชุดนี้" };
  }
  if (official?.mom_eligible === false) {
    return { roasText, tone: "neutral", short: "ไม่เทียบ", revenueText: "—", revenueTone: "neutral", basis: "ชุดนี้ปิดการเทียบเดือนนี้" };
  }
  const previous = cells[prior.id]?.[book];
  if (!previous || !finite(previous.spend) || previous.spend === 0 || !finite(previous.revenue)) {
    return { roasText, tone: "neutral", short: "ไม่มีฐานเดือนก่อน", revenueText: "—", revenueTone: "neutral", basis: "ไม่มีเดือนก่อนของเล่มนี้" };
  }
  const change = changePct(current.revenue, previous.revenue);
  const revenueTone = !change.comparable ? "neutral" : change.pct > 0 ? "better" : change.pct < 0 ? "worse" : "neutral";
  return {
    roasText,
    tone: metricTone("roas", roas, ratio(previous.revenue, previous.spend)),
    short: `เทียบ ${prior.short}`,
    revenueText: change.text,
    revenueTone,
    basis: `เทียบ ${prior.label} ของเล่มนี้ ไม่ใช่เกณฑ์กำไร`,
  };
}

export function ingestHistoryBundle(bundle) {
  const meta = bundle?.metadata;
  if (!meta || !Array.isArray(bundle.book_period_totals) || !Array.isArray(bundle.ad_period_rows) || !bundle.ad_mapping) {
    throw new Error("history bundle is missing required sections");
  }
  const mappingIds = new Set(Object.keys(bundle.ad_mapping));
  const seen = new Set();
  for (const row of bundle.ad_period_rows) {
    if (!mappingIds.has(String(row.ad_id))) throw new Error(`orphan ad ${row.ad_id}`);
    if (row.channel === "all_channels") throw new Error("ad rows must not carry an all_channels double count");
    const key = `${row.period}:${row.ad_id}:${row.channel}`;
    if (seen.has(key)) throw new Error(`duplicate ${key}`);
    seen.add(key);
  }
  const cells = {};
  const official = {};
  for (const period of PERIODS) {
    cells[period.id] = {};
    official[period.id] = {};
    for (const book of BOOKS) {
      const stated = bundle.book_period_totals.find((row) => row.period === period.id && row.book === book && row.channel === REVIEW_CHANNEL);
      if (!stated) throw new Error(`missing ${REVIEW_CHANNEL} total ${period.id} ${book}`);
      const summed = includedSum(bundle.ad_period_rows, period.id, book);
      const empty = stated.spend == null && stated.revenue_meta == null;
      if (empty) {
        if (summed) throw new Error(`${period.id} ${book} is null in the total but has included ads`);
        if (stated.ad_count !== 0) throw new Error(`${period.id} ${book} null total has ads`);
        cells[period.id][book] = null;
      } else {
        if (!summed) throw new Error(`${period.id} ${book} total has no included ads`);
        if (Math.abs(summed.spend - stated.spend) > 0.02 || Math.abs(summed.revenue - stated.revenue_meta) > 0.02 || summed.count !== stated.ad_count) {
          throw new Error(`${period.id} ${book} messaging total does not match included ads`);
        }
        cells[period.id][book] = {
          spend: stated.spend,
          revenue: stated.revenue_meta,
          adCount: stated.ad_count,
          quarantinedAdCount: stated.quarantined_ad_count,
          coverage: stated.coverage_label,
        };
      }
      official[period.id][book] = stated;
    }
  }
  const quarantine = Object.values(bundle.ad_mapping)
    .filter((row) => row.allocation_bucket === "quarantine")
    .map((row) => ({ id: String(row.ad_id), book: row.book, reason: row.allocation_reason || "" }));
  const critical = Number(meta.findings_by_severity?.CRITICAL || 0);
  const publishable = meta.qa_status === PUBLISHABLE_STATUS && critical === 0;
  return {
    publishable,
    gate: meta.qa_status || "HOLD_DO_NOT_PUBLISH",
    channel: REVIEW_CHANNEL,
    generatedAt: meta.generated_at,
    cutoff: meta.cutoff,
    attribution: bundle.query_provenance?.attribution || "legacy attribution window was not recorded",
    counts: {
      rows: meta.monthly_rows,
      ids: meta.unique_ads,
      included: meta.allocation_counts?.included,
      quarantine: meta.allocation_counts?.quarantine,
      other: meta.allocation_counts?.other_or_unmapped,
    },
    overlapChangedAdPeriods: meta.overlap_changed_ad_periods,
    quarantine,
    periods: PERIODS,
    cell(periodId, book) {
      return cells[periodId]?.[book] ?? null;
    },
    trend(periodId, book) {
      const period = PERIODS.find((item) => item.id === periodId);
      if (!period) return { roasText: "—", tone: "neutral", short: "—", revenueText: "—", revenueTone: "neutral", basis: "ไม่มีช่วงนี้ในชุดที่ยืนยัน" };
      return trendFor(cells, period, book, official[periodId]?.[book]);
    },
  };
}
