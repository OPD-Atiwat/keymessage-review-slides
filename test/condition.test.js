import assert from "node:assert/strict";
import test from "node:test";
import { conditionTone, monthBaseline, overviewCondition, periodAdBaseline } from "../shared/condition.js";

test("a ratio baseline uses the summed months, and volume uses the monthly mean", () => {
  const totals = {
    may: { Mind: { spend: 100, revenue: 50, impressions: 1000, chats: 10, purchases: 2, n: 1 } },
    oct: { Mind: { spend: 300, revenue: 450, impressions: 3000, chats: 30, purchases: 6, n: 1 } },
  };
  const base = monthBaseline(totals, "Mind");
  assert.equal(base.n, 2);
  assert.equal(base.revenue, 250);
  assert.equal(base.roas, 500 / 400);
  assert.equal(conditionTone("roas", 2, base.roas), "better");
  assert.equal(conditionTone("roas", base.roas, base.roas), "near");
  assert.equal(conditionTone("costPerMsg", base.costPerMsg * 1.06, base.costPerMsg), "worse");
  assert.equal(conditionTone("spend", 999, 100), "plain");
  assert.equal(conditionTone("revenue", null, 10), "empty");
});

test("November volume stays uncolored and a ratio uses the full-month baseline", () => {
  const totals = {
    oct: { Mind: { spend: 100, revenue: 200, impressions: 1000, chats: 10, purchases: 4, n: 2 } },
    nov1_8: { Mind: { spend: 10, revenue: 5, impressions: 100, chats: 2, purchases: 1, n: 1 } },
  };
  assert.equal(overviewCondition(totals, "nov1_8", "Mind", "revenue").tone, "plain");
  assert.equal(overviewCondition(totals, "nov1_8", "Mind", "spend").tone, "plain");
  assert.equal(overviewCondition(totals, "nov1_8", "Mind", "roas").tone, "worse");
  assert.match(overviewCondition(totals, "oct", "Mind", "roas").basis, /ค่าเฉลี่ย 1 เดือนเต็ม/);
});

test("an ad volume baseline is the mean ad of that book period", () => {
  const base = periodAdBaseline({ spend: 100, revenue: 80, impressions: 1000, chats: 10, purchases: 4, n: 4 });
  assert.equal(base.revenue, 20);
  assert.equal(base.roas, 0.8);
});
