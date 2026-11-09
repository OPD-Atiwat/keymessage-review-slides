import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { ingestHistoryBundle, PUBLISHABLE_STATUS, REVIEW_CHANNEL } from "../shared/history-ingest.js";

const HOLD_ZIP = process.env.HOLD_BUNDLE || "/home/ubuntu/.cursor/projects/workspace/uploads/cloudagent_review_bundle_HOLD_ac47.zip";
const BOOKS = ["Mind", "Coworkers", "SurvivalGuide", "Trap"];

function row(period, book, channel, extra = {}) {
  return {
    period,
    book,
    channel,
    ad_count: extra.ad_count ?? 0,
    quarantined_ad_count: extra.quarantined_ad_count ?? 0,
    coverage_label: extra.coverage || "no_verified_book_activity_metrics_null_not_zero",
    spend: extra.spend ?? null,
    revenue_meta: extra.revenue ?? null,
    mom_eligible: extra.mom_eligible ?? false,
  };
}

function bundle(overrides = {}) {
  const periods = ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
  const channels = ["messaging", "shopee_click", "opdapp_all", "all_channels"];
  const totals = [];
  for (const period of periods) {
    for (const book of BOOKS) {
      for (const channel of channels) totals.push(row(period, book, channel));
    }
  }
  return {
    metadata: {
      qa_status: "HOLD_DO_NOT_PUBLISH",
      generated_at: "2026-11-08T16:03:16+07:00",
      cutoff: "2026-11-07",
      monthly_rows: 0,
      unique_ads: 1,
      allocation_counts: { included: 0, quarantine: 0, other_or_unmapped: 1 },
      overlap_changed_ad_periods: 0,
      findings_by_severity: { CRITICAL: 1 },
    },
    book_period_totals: totals,
    ad_period_rows: [],
    ad_mapping: { 1: { ad_id: "1", book: null, allocation_bucket: "other_or_unmapped", allocation_reason: "unmapped" } },
    ...overrides,
  };
}

test("a missing book month stays null and a held bundle cannot publish", () => {
  const model = ingestHistoryBundle(bundle());
  assert.equal(model.publishable, false);
  assert.equal(model.gate, "HOLD_DO_NOT_PUBLISH");
  assert.equal(model.channel, REVIEW_CHANNEL);
  assert.equal(model.cell("2026-05", "Mind"), null);
  assert.equal(model.trend("2026-05", "Mind").roasText, "—");
  assert.equal(model.trend("2026-11", "Mind").revenueText, "—");
  assert.equal(model.trend("2026-11", "Mind").tone, "neutral");
  assert.equal(model.trend("2026-11", "Mind").basis, "ไม่มียอดในช่วงนี้");
});

test("messaging is not replaced by all_channels, and zero is not the same as null", () => {
  const source = bundle();
  const may = source.book_period_totals.find((item) => item.period === "2026-05" && item.book === "Trap" && item.channel === "messaging");
  may.spend = 0;
  may.revenue_meta = 0;
  may.ad_count = 1;
  may.coverage_label = "returned_activity_excluding_quarantine";
  may.mom_eligible = false;
  const all = source.book_period_totals.find((item) => item.period === "2026-05" && item.book === "Trap" && item.channel === "all_channels");
  all.spend = 40;
  all.revenue_meta = 80;
  all.ad_count = 2;
  source.ad_period_rows.push({
    period: "2026-05",
    ad_id: "9",
    book: "Trap",
    channel: "messaging",
    allocation_bucket: "included",
    spend: 0,
    revenue_meta: 0,
  });
  source.ad_mapping["9"] = { ad_id: "9", book: "Trap", allocation_bucket: "included", allocation_reason: "named book" };
  const model = ingestHistoryBundle(source);
  assert.equal(model.cell("2026-05", "Trap").spend, 0);
  assert.equal(model.cell("2026-05", "Trap").revenue, 0);
  assert.equal(model.trend("2026-05", "Trap").roasText, "—");
  assert.equal(model.cell("2026-06", "Trap"), null);
});

test("June through October compare the previous full month, and November does not", () => {
  const source = bundle();
  for (const [period, spend, revenue, mom] of [
    ["2026-05", 100, 80, false],
    ["2026-06", 100, 120, true],
    ["2026-10", 50, 40, true],
  ]) {
    const item = source.book_period_totals.find((row) => row.period === period && row.book === "Mind" && row.channel === "messaging");
    item.spend = spend;
    item.revenue_meta = revenue;
    item.ad_count = 1;
    item.mom_eligible = mom;
    item.coverage_label = "returned_activity_excluding_quarantine";
    source.ad_period_rows.push({
      period,
      ad_id: "7",
      book: "Mind",
      channel: "messaging",
      allocation_bucket: "included",
      spend,
      revenue_meta: revenue,
    });
  }
  source.ad_period_rows.push({
    period: "2026-06",
    ad_id: "8",
    book: "Mind",
    channel: "messaging",
    allocation_bucket: "quarantine",
    spend: 999,
    revenue_meta: 999,
  });
  source.ad_mapping["7"] = { ad_id: "7", book: "Mind", allocation_bucket: "included", allocation_reason: "named book" };
  source.ad_mapping["8"] = { ad_id: "8", book: "Mind", allocation_bucket: "quarantine", allocation_reason: "body mentions different book" };
  const model = ingestHistoryBundle(source);
  const june = model.trend("2026-06", "Mind");
  assert.equal(june.short, "เทียบ พ.ค.");
  assert.equal(june.tone, "better");
  assert.equal(june.revenueTone, "better");
  assert.match(june.basis, /ไม่ใช่เกณฑ์กำไร/);
  assert.equal(model.cell("2026-06", "Mind").spend, 100);
  assert.equal(model.trend("2026-10", "Mind").short, "ไม่มีฐานเดือนก่อน");
  assert.equal(model.trend("2026-11", "Mind").short, "—");
  assert.equal(model.quarantine.length, 1);
  assert.equal(model.quarantine[0].reason, "body mentions different book");
});

test("an approved status is still required before publishable is true", () => {
  const source = bundle();
  source.metadata.qa_status = PUBLISHABLE_STATUS;
  source.metadata.findings_by_severity.CRITICAL = 2;
  assert.equal(ingestHistoryBundle(source).publishable, false);
  source.metadata.findings_by_severity.CRITICAL = 0;
  assert.equal(ingestHistoryBundle(source).publishable, true);
});

test("the published deck is still the frozen four periods", () => {
  const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(deck.bookTotals).sort(), ["aug", "jul", "jun", "may", "nov1_8", "oct", "sep"]);
  assert.equal(deck.bookTotals.oct1_7, undefined);
  assert.equal(deck.bookTotals.may.Mind, null);
});

test("the preliminary hold bundle is not the published deck", { skip: true }, () => {
  const raw = execFileSync("unzip", ["-p", HOLD_ZIP, "history_bundle.json"], { maxBuffer: 20 * 1024 * 1024 });
  const provenance = JSON.parse(execFileSync("unzip", ["-p", HOLD_ZIP, "query_provenance.json"], { maxBuffer: 1024 * 1024 }).toString("utf8"));
  const held = JSON.parse(raw.toString("utf8"));
  held.query_provenance = provenance;
  const model = ingestHistoryBundle(held);
  assert.equal(model.publishable, false);
  assert.equal(model.gate, "HOLD_DO_NOT_PUBLISH");
  assert.equal(model.channel, "messaging");
  assert.equal(model.cutoff, "2026-11-07");
  assert.equal(model.generatedAt, "2026-11-08T16:03:16.821496+07:00");
  assert.equal(model.counts.rows, 2881);
  assert.equal(model.counts.ids, 2097);
  assert.equal(model.counts.included, 1717);
  assert.equal(model.counts.quarantine, 3);
  assert.equal(model.counts.other, 377);
  assert.equal(model.overlapChangedAdPeriods, 70);
  assert.equal(model.quarantine.length, 3);
  assert.ok(model.quarantine.every((item) => item.id && item.reason));
  assert.match(model.attribution, /not recorded/);
  assert.equal(/7d_click|28d_click/.test(model.attribution), false);
  assert.equal(model.cell("2026-05", "Mind"), null);
  const oct = held.book_period_totals.find((item) => item.period === "2026-10" && item.book === "Mind" && item.channel === "messaging");
  assert.equal(model.cell("2026-10", "Mind").spend, oct.spend);
  assert.equal(model.cell("2026-10", "Mind").revenue, oct.revenue_meta);
  assert.equal(model.trend("2026-10", "Mind").roasText, "0.69");
  assert.equal(model.trend("2026-10", "Mind").short, "เทียบ ก.ย.");
  const nov = held.book_period_totals.find((item) => item.period === "2026-11" && item.book === "Mind" && item.channel === "messaging");
  assert.equal(model.cell("2026-11", "Mind").spend, nov.spend);
  assert.equal(model.cell("2026-11", "Mind").revenue, nov.revenue_meta);
  assert.equal(model.trend("2026-11", "Mind").revenueText, "—");
  assert.equal(model.trend("2026-11", "Mind").tone, "neutral");
  assert.equal(model.trend("2026-11", "Trap").basis.includes("1–7 ต.ค."), false);
  const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
  assert.notEqual(nov.spend, deck.bookTotals.nov1_8.Mind.spend);
  const canon = {};
  for (const period of model.periods) {
    canon[period.id] = {};
    for (const book of BOOKS) {
      const cell = model.cell(period.id, book);
      canon[period.id][book] = cell ? { spend: cell.spend, revenue: cell.revenue } : null;
    }
  }
  const hash = createHash("sha256").update(JSON.stringify(canon)).digest("hex");
  assert.equal(hash, "PENDING");
});
