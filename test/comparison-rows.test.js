import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rates } from "../shared/metrics.js";
import { comparisonRows, pageOf } from "../shared/comparison.js";

const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
const status = JSON.parse(readFileSync(new URL("../public/data/ad-status.json", import.meta.url), "utf8"));

test("comparison keeps every ad and does not merge the same body", () => {
  const rows = comparisonRows({
    ads: deck.ads,
    statusById: status.ads_by_id,
    book: "SurvivalGuide",
    period: "sep",
  });
  const expected = deck.ads.filter((ad) => ad.book === "SurvivalGuide" && ad.period === "sep");
  assert.equal(rows.length, expected.length);
  assert.equal(new Set(rows.map((ad) => ad.adId)).size, rows.length);
  const flat = [];
  const size = 6;
  const { pages } = pageOf(rows, 0, size);
  for (let page = 0; page < pages; page += 1) flat.push(...pageOf(rows, page, size).slice);
  assert.equal(flat.length, rows.length);
  for (const ad of rows) {
    if (!ad.spend) continue;
    assert.equal(rates(ad).roas, ad.revenue / ad.spend);
    if (ad.thumb) assert.match(ad.thumb, new RegExp("^" + ad.adId + "\\."));
  }
  assert.equal(rows.some((ad) => ad.adId === "120255364063130260"), false);
});
