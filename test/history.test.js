import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rates } from "../shared/metrics.js";
import {
  MATCHED_PARTIAL,
  OVERVIEW_METRICS,
  OVERVIEW_MONTHS,
  SOURCE_CUTOFF,
  UNPUBLISHED_MONTHS,
  VERIFIED_HISTORY,
  metricCell,
  revenueTrend,
  roasTrend,
  totalsFor,
  visibleHistory,
} from "../shared/history.js";

const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
const books = ["Mind", "Coworkers", "SurvivalGuide", "Trap"];

function canon() {
  const out = {};
  for (const period of ["may", "jun", "jul", "aug", "sep", "oct", "nov1_8"]) {
    out[period] = {};
    for (const book of books) {
      const row = deck.bookTotals[period][book];
      if (!row) {
        out[period][book] = null;
        continue;
      }
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
  assert.deepEqual(VERIFIED_HISTORY.map((item) => item.id), ["may", "jun", "jul", "aug", "sep", "oct", "nov1_8"]);
  assert.equal(SOURCE_CUTOFF, "2026-11-08");
  assert.deepEqual(UNPUBLISHED_MONTHS, []);
  assert.equal(deck.snapshot.cutoff, "2026-11-08");
  assert.equal(deck.snapshot.frozenThrough, "8 พ.ย. 2569");
  assert.equal(deck.bookTotals.oct1_7, undefined);
  const hash = createHash("sha256").update(JSON.stringify(canon())).digest("hex");
  assert.equal(hash, "0050dad8935c9ebe5cb4427ad7d2863185258fd0e113855968e66d591a08a825");
  assert.equal(canon().oct.Mind.roas, 0.69);
  assert.equal(Math.round(canon().nov1_8.Mind.spend * 100) / 100, 39816.8);
  assert.equal(canon().may.Mind, null);
  assert.equal(canon().aug.SurvivalGuide, null);
});

test("a missing period is blank, and November is not judged against a full month", () => {
  assert.equal(totalsFor(deck.bookTotals, "may", "Mind"), null);
  assert.equal(totalsFor({}, "sep", "Mind"), null);
  const sep = roasTrend(deck.bookTotals, "sep", "Mind");
  assert.equal(sep.short, "ไม่เทียบ");
  assert.equal(sep.tone, "neutral");
  const oct = roasTrend(deck.bookTotals, "oct", "Mind");
  assert.equal(oct.text, "0.69");
  assert.equal(oct.tone, "neutral");
  assert.equal(oct.short, "ไม่เทียบ");
  assert.match(oct.basis, /mom_eligible/);
  const nov = roasTrend(deck.bookTotals, "nov1_8", "Mind");
  assert.equal(nov.text, "0.92");
  assert.equal(nov.tone, "neutral");
  assert.equal(nov.short, "ไม่มีฐาน 1–8 ต.ค.");
  assert.match(nov.basis, /ไม่มี 1–8 ต\.ค\./);
  assert.equal(nov.basis.includes("เทียบเดือนเต็ม"), false);
  const stripped = { ...deck.bookTotals, oct1_7: undefined };
  const blocked = roasTrend(stripped, "nov1_8", "Mind");
  assert.equal(blocked.tone, "neutral");
  assert.match(blocked.basis, /ไม่มี 1–8 ต\.ค\./);
  assert.equal(MATCHED_PARTIAL.baseId, "oct1_8");
});

test("revenue change is directional text and skips a full-month base for November", () => {
  const oct = revenueTrend(deck.bookTotals, "oct", "Mind");
  assert.equal(oct.tone, "neutral");
  assert.equal(oct.text, "—");
  assert.match(oct.basis, /mom_eligible/);
  const nov = revenueTrend(deck.bookTotals, "nov1_8", "Coworkers");
  assert.equal(nov.text, "—");
  assert.match(nov.basis, /ไม่มี 1–8 ต\.ค\./);
  assert.equal(nov.basis.startsWith("เทียบ ต.ค. 2569"), false);
  const sep = revenueTrend(deck.bookTotals, "sep", "SurvivalGuide");
  assert.equal(sep.text, "—");
  assert.equal(sep.tone, "neutral");
  assert.equal(visibleHistory(0).items[0].id, "may");
  assert.equal(visibleHistory(0).items.length, 4);
  assert.equal(OVERVIEW_MONTHS.map((item) => item.short).join(","), "พ.ค.,มิ.ย.,ก.ค.,ส.ค.,ก.ย.,ต.ค.,1–8 พ.ย.");
  assert.deepEqual(OVERVIEW_METRICS.map((item) => item.label), ["Spend", "Revenue", "ROAS", "Messages", "Cost per Message", "CPM", "Purchases", "CVR", "AOV"]);
  const maySpend = metricCell(deck.bookTotals, "may", "Mind", "spend");
  assert.equal(maySpend.text, "—");
  assert.equal(maySpend.basis, "ไม่มีรายการที่ยืนยันได้");
  assert.equal(maySpend.text.includes("0"), false);
  const octSpend = metricCell(deck.bookTotals, "oct", "Mind", "spend");
  assert.equal(octSpend.text, "฿176,389");
  assert.equal(octSpend.tone, "volume");
  const octRoas = metricCell(deck.bookTotals, "oct", "Mind", "roas");
  assert.equal(octRoas.text, "0.69");
  assert.equal(octRoas.tone, "neutral");
  assert.match(octRoas.basis, /mom_eligible/);
  const novRoas = metricCell(deck.bookTotals, "nov1_8", "Mind", "roas");
  assert.equal(novRoas.text, "0.92");
  assert.equal(novRoas.tone, "neutral");
  assert.match(novRoas.basis, /ไม่มี 1–8 ต\.ค\./);
  assert.equal(metricCell(deck.bookTotals, "may", "Coworkers", "cvrProxy").text.endsWith("%") || metricCell(deck.bookTotals, "may", "Coworkers", "cvrProxy").text === "—", true);
});
