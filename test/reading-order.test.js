import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { comparisonRows } from "../shared/comparison.js";
import { orderMonthAds, statusRank } from "../shared/reading-order.js";

const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
const status = JSON.parse(readFileSync(new URL("../public/data/ad-status.json", import.meta.url), "utf8"));

test("enabled snapshot ads lead, and every selected-month ad stays visible", () => {
  for (const book of ["Mind", "Coworkers", "SurvivalGuide", "Trap"]) {
    const rows = comparisonRows({
      ads: deck.ads,
      statusById: status.ads_by_id,
      book,
      period: "nov1_7",
    });
    const ordered = orderMonthAds(rows, status.ads_by_id);
    assert.equal(ordered.length, rows.length);
    assert.deepEqual(ordered.map((ad) => ad.adId).sort(), rows.map((ad) => ad.adId).sort());
    const ranks = ordered.map((ad) => statusRank(status.ads_by_id[ad.adId]));
    const sorted = ranks.slice().sort((a, b) => a - b);
    assert.deepEqual(ranks, sorted);
    assert.equal(deck.bookTotals.nov1_7[book].n, rows.length);
  }
  assert.equal(statusRank({ effective_status: "ACTIVE" }), 0);
  assert.equal(statusRank(null), 2);
});
