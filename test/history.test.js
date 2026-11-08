import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rates } from "../shared/metrics.js";
import {
  MATCHED_PARTIAL,
  SOURCE_CUTOFF,
  UNPUBLISHED_MONTHS,
  VERIFIED_HISTORY,
  revenueTrend,
  roasTrend,
  totalsFor,
  visibleHistory,
} from "../shared/history.js";

const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
const books = ["Mind", "Coworkers", "SurvivalGuide", "Trap"];

function canon() {
  const out = {};
  for (const period of ["sep", "oct", "oct1_7", "nov1_7"]) {
    out[period] = {};
    for (const book of books) {
      const row = deck.bookTotals[period][book];
      const roas = rates(row).roas;
      out[period][book] = {
        spend: row.spend,
        revenue: row.revenue,
        roas: roas == null ? null : Number(roas.toFixed(2)),
      };
    }
  }
  return out;
}

test("published history is only the frozen snapshot, with a stable checksum", () => {
  assert.deepEqual(VERIFIED_HISTORY.map((item) => item.id), ["sep", "oct", "nov1_7"]);
  assert.equal(SOURCE_CUTOFF, "2026-11-07");
  assert.deepEqual(UNPUBLISHED_MONTHS, ["พ.ค. 2569", "มิ.ย. 2569", "ก.ค. 2569", "ส.ค. 2569"]);
  assert.equal(deck.snapshot.frozenThrough, "7 พ.ย. 2569");
  const hash = createHash("sha256").update(JSON.stringify(canon())).digest("hex");
  assert.equal(hash, "b602b3aef7f05ea9a97328c58eae342306a8ed3eafd651d03e30797b96f3b028");
  assert.equal(canon().oct.Mind.roas, 0.69);
  assert.equal(canon().nov1_7.Mind.spend, 34886.98999999999);
});

test("a missing period is blank, and November is not judged against a full month", () => {
  assert.equal(totalsFor(deck.bookTotals, "may", "Mind"), null);
  assert.equal(totalsFor({}, "sep", "Mind"), null);
  const sep = roasTrend(deck.bookTotals, "sep", "Mind");
  assert.equal(sep.text, "0.89");
  assert.equal(sep.tone, "neutral");
  assert.equal(sep.short, "ไม่มีเดือนก่อน");
  const oct = roasTrend(deck.bookTotals, "oct", "Mind");
  assert.equal(oct.text, "0.69");
  assert.equal(oct.tone, "worse");
  assert.equal(oct.short, "เทียบ ก.ย.");
  const nov = roasTrend(deck.bookTotals, "nov1_7", "Mind");
  assert.equal(nov.text, "0.89");
  assert.equal(nov.tone, "better");
  assert.equal(nov.short, "เทียบ 1–7 ต.ค.");
  assert.match(nov.basis, /1–7 ต\.ค\./);
  assert.equal(nov.basis.includes("ทั้งเดือน"), false);
  const stripped = { ...deck.bookTotals, oct1_7: undefined };
  const blocked = roasTrend(stripped, "nov1_7", "Mind");
  assert.equal(blocked.tone, "neutral");
  assert.match(blocked.basis, /ไม่มี 1–7 ต\.ค\./);
  assert.equal(MATCHED_PARTIAL.baseId, "oct1_7");
});

test("revenue change is directional text and skips a full-month base for November", () => {
  const oct = revenueTrend(deck.bookTotals, "oct", "Mind");
  assert.equal(oct.tone, "worse");
  assert.match(oct.text, /-/);
  const nov = revenueTrend(deck.bookTotals, "nov1_7", "Coworkers");
  assert.match(nov.basis, /1–7 ต\.ค\./);
  assert.equal(nov.basis.includes("ต.ค. 2569 รายได้") && nov.basis.startsWith("เทียบ ต.ค. 2569"), false);
  const sep = revenueTrend(deck.bookTotals, "sep", "Trap");
  assert.equal(sep.text, "—");
  assert.equal(sep.tone, "neutral");
  assert.equal(visibleHistory(0).items.length, 3);
  assert.equal(visibleHistory(9).start, 0);
});
