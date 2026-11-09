import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mergeAdsByName } from "../shared/ad-merge.js";
import { contentMonthOf, contentMonthOptions, filterByContentMonth } from "../shared/content-month.js";
import { sumTotals } from "../shared/metrics.js";

const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));

test("a leading date tag becomes MM.YY and an unreadable name stays visible as unknown", () => {
  assert.equal(contentMonthOf("[03.11.26][jademarsx] คิดว่าดูคน").id, "2026-11");
  assert.equal(contentMonthOf("[03.11.26][jademarsx] คิดว่าดูคน").label, "11.26");
  assert.equal(contentMonthOf("[12.10.69][ชื่อ]").id, "unknown");
  assert.equal(contentMonthOf("ไม่มีวันที่").label, "ไม่ระบุเดือน");
});

test("Mind 1–8 November month chips are the merged rows, newest first", () => {
  const rows = mergeAdsByName(deck.ads.filter((ad) => ad.period === "nov1_8" && ad.book === "Mind"));
  const options = contentMonthOptions(rows);
  assert.deepEqual(options.map((item) => `${item.label} (${item.count})`), [
    "11.26 (6)",
    "10.26 (15)",
    "09.26 (6)",
    "08.26 (4)",
    "07.26 (1)",
  ]);
  const november = filterByContentMonth(rows, ["2026-11"]);
  assert.equal(november.length, 6);
  assert.ok(Math.abs(sumTotals(rows).spend - deck.bookTotals.nov1_8.Mind.spend) < 0.05);
});
