import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { OMITTED_NAME, bookOf, checkAll, checkPeriod, gateLine, loadGate, runCli } from "../scripts/reconcile-meta.js";
import { OVERVIEW_MONTHS } from "../shared/history.js";

const root = fileURLToPath(new URL("..", import.meta.url));

test("a campaign book tag is the single bracket token", () => {
  assert.equal(bookOf("⚠️ [OPDHOWTO] [Trap] [FB Msg]"), "Trap");
  assert.equal(bookOf("[OPDHOWTO][MyLastBook][FB Msg]"), null);
  assert.equal(bookOf("[OPDHOWTO] [Mind] [Trap]"), null);
});

test("the gate sentence names the checked ranges and the Bangkok time", () => {
  const line = gateLine(new Date("2026-11-09T05:40:00.000Z"), ["พ.ค. 2569", "1–8 พ.ย. 2569"]);
  assert.equal(line, "ตรวจตรงกับ Ads Manager (Meta) ล่าสุด 9 พ.ย. 2569 12:40 น. ICT, ช่วง พ.ค. 2569, 1–8 พ.ย. 2569");
});

test("book totals follow campaign-level, ad rows follow ad-level, and the gap is one omitted row", () => {
  const reference = {
    period: "may",
    metrics: { purchases: "omni_purchase", revenue: "omni_purchase", messages: "onsite_conversion.messaging_conversation_started_7d" },
    otherProductCampaigns: [{ campaign_name: "[OPDHOWTO][MyLastBook][FB Msg]" }],
    campaigns: [
      row("camp-book", "[OPDHOWTO] [Trap] [FB Msg]", 10, 2, 30, 4),
      row("camp-other", "[OPDHOWTO][MyLastBook][FB Msg]", 99, 9, 99, 9),
    ],
    ads: [
      row("1", "[OPDHOWTO] [Trap] [FB Msg]", 7, 1, 20, 3),
      row("9", "[OPDHOWTO][MyLastBook][FB Msg]", 99, 9, 99, 9),
    ],
  };
  const ads = [
    site("1", "Trap", 7, 1, 20, 3),
    site("meta-omitted-may-Trap", "Trap", 3, 1, 10, 1, true),
  ];
  const totals = { Trap: { spend: 10, purchases: 2, revenue: 30, chats: 4 } };
  assert.equal(checkPeriod(ads, totals, reference).ok, true);

  const missing = checkPeriod(ads.filter((ad) => ad.adId !== "meta-omitted-may-Trap"), totals, reference);
  assert.equal(missing.ok, false);
  assert.ok(missing.failures.some((item) => item.code === "OMITTED_ROW"));

  const drifted = checkPeriod(ads.map((ad) => ad.adId === "1" ? { ...ad, spend: 8.02 } : ad), totals, reference);
  assert.equal(drifted.ok, false);
  assert.ok(drifted.failures.some((item) => item.code === "AD_METRICS"));

  const counted = checkPeriod(ads.map((ad) => ad.adId === "1" ? { ...ad, purchases: 2 } : ad), totals, reference);
  assert.equal(counted.ok, false);

  const otherOnSite = checkPeriod([...ads, site("9", "Unassigned", 99, 9, 99, 9)], totals, reference);
  assert.equal(otherOnSite.ok, false);
  assert.ok(otherOnSite.failures.some((item) => item.code === "OTHER_PRODUCT_ON_SITE" || item.code === "EXTRA_AD"));
});

test("every published period matches its Meta reference", () => {
  const { deck, references } = loadGate(root);
  const report = checkAll({ deck, references, periods: OVERVIEW_MONTHS, now: new Date("2026-11-09T05:40:00.000Z") });
  assert.deepEqual(report.results.map((item) => item.id), ["may", "jun", "jul", "aug", "sep", "oct", "nov1_8"]);
  for (const item of report.results) {
    assert.equal(item.ok, true, `${item.id} ${item.failures?.map((failure) => failure.code + " " + failure.detail).join("; ")}`);
  }
  assert.equal(report.results.find((item) => item.id === "may").omitted, 1);
  assert.equal(report.results.find((item) => item.id === "jun").omitted, 1);
  assert.equal(report.results.find((item) => item.id === "jul").omitted, 1);
  assert.equal(report.results.filter((item) => item.id !== "may" && item.id !== "jun" && item.id !== "jul").every((item) => item.omitted === 0), true);
  const omitted = deck.ads.filter((ad) => ad.metaOmitted);
  assert.deepEqual(omitted.map((ad) => `${ad.period}:${ad.book}`).sort(), ["jul:Trap", "jun:Trap", "may:Trap"]);
  for (const ad of omitted) {
    assert.equal(ad.adName, OMITTED_NAME);
    assert.equal(ad.creatorTag, "");
  }
  assert.match(report.line, /^ตรวจตรงกับ Ads Manager \(Meta\) ล่าสุด .+ ICT, ช่วง พ\.ค\. 2569, .+1–8 พ\.ย\. 2569$/);
});

test("the command exits 0 only when every period passes", () => {
  const result = runCli(root, { writeStamp: false, now: new Date("2026-11-09T05:40:00.000Z") });
  assert.equal(result.code, 0);
  assert.match(result.text, /GATE PASS/);
  assert.match(result.text, /PASS may/);
  assert.match(result.text, /PASS nov1_8/);
});

function row(id, campaign, spend, purchases, revenue, messages) {
  return {
    ad_id: id,
    campaign_name: campaign,
    spend: String(spend),
    actions: [
      { action_type: "omni_purchase", value: String(purchases) },
      { action_type: "onsite_conversion.messaging_conversation_started_7d", value: String(messages) },
    ],
    action_values: [{ action_type: "omni_purchase", value: String(revenue) }],
  };
}

function site(adId, book, spend, purchases, revenue, messages, metaOmitted = false) {
  return {
    adId,
    book,
    spend,
    purchases,
    revenue,
    chats: messages,
    creatorTag: metaOmitted ? "" : "คริน",
    adName: metaOmitted ? OMITTED_NAME : "named",
    metaOmitted,
  };
}
