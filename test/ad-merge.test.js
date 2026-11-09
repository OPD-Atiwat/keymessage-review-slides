import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeAdsByName } from "../shared/ad-merge.js";
import { rates, sumTotals } from "../shared/metrics.js";

const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));

test("same names sum inputs and recompute ratios without changing the book total", () => {
  const ads = deck.ads.filter((ad) => ad.period === "nov1_8");
  const merged = mergeAdsByName(ads);
  const names = merged.filter((ad) => ad.mergedCount > 1);
  assert.equal(names.length, 17);
  assert.equal(ads.length - merged.length, 29);
  const sample = names.find((ad) => ad.adName.startsWith("[03.11.26][jademarsx]"));
  assert.equal(sample.mergedCount, 2);
  assert.equal(sample.memberIds.length, 2);
  const parts = ads.filter((ad) => ad.adName.trim() === sample.adName);
  assert.equal(sample.spend, sumTotals(parts).spend);
  assert.equal(sample.chats, sumTotals(parts).chats);
  assert.equal(rates(sample).roas, rates(sumTotals(parts)).roas);
  assert.ok(Math.abs(sumTotals(merged).spend - sumTotals(ads).spend) < 0.01);
  assert.ok(Math.abs(sumTotals(merged).revenue - sumTotals(ads).revenue) < 0.01);
  assert.equal(sumTotals(merged).purchases, sumTotals(ads).purchases);
});
