import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { filterAds } from "../shared/ad-query.js";
import { comparisonRows } from "../shared/comparison.js";
import { rates } from "../shared/metrics.js";
import {
  bookMetric,
  formatChartValue,
  periodSeries,
  scatterLayout,
  scatterPoints,
  trendSegments,
  trendSeries,
} from "../shared/chart-data.js";

const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
const status = JSON.parse(readFileSync(new URL("../public/data/ad-status.json", import.meta.url), "utf8"));
const books = [["Mind", "ถือไพ่เหนือกว่า"], ["Coworkers", "ออฟฟิศนี้เฮงซวย"], ["SurvivalGuide", "Survival Guide"], ["Trap", "กับดักความรู้สึกผิด"]];

test("trend points match the monthly table and skip missing months and November", () => {
  assert.equal(deck.bookTotals.nov1_7.Mind.spend, 34889.59);
  assert.equal(deck.bookTotals.oct.Mind.revenue, 120291);
  for (const [id] of books) {
    const series = trendSeries(deck.bookTotals, id, "roas");
    assert.deepEqual(series.map((point) => point.id), ["may", "jun", "jul", "aug", "sep", "oct"]);
    for (const point of series) {
      const row = deck.bookTotals[point.id][id];
      if (!row) assert.equal(point.value, null);
      else assert.equal(point.value, rates(row).roas);
    }
    const segments = trendSegments(series);
    for (const segment of segments) {
      for (let index = 1; index < segment.length; index += 1) {
        const prev = series.findIndex((point) => point.id === segment[index - 1].id);
        const next = series.findIndex((point) => point.id === segment[index].id);
        assert.equal(next, prev + 1);
      }
    }
  }
  assert.equal(trendSeries(deck.bookTotals, "Mind", "roas")[0].value, null);
  assert.equal(trendSeries(deck.bookTotals, "Mind", "spend")[0].value, null);
  assert.equal(bookMetric(deck.bookTotals.oct.Mind, "roas").toFixed(2), "0.69");
});

test("the selected-period chart uses that period only, and a scatter keeps the unfiltered baseline", () => {
  const nov = periodSeries(deck.bookTotals, "nov1_7", books, "roas");
  assert.equal(nov.find((item) => item.id === "Mind").value.toFixed(2), rates(deck.bookTotals.nov1_7.Mind).roas.toFixed(2));
  assert.equal(formatChartValue("revenue", deck.bookTotals.nov1_7.Mind.revenue), "฿" + Math.round(deck.bookTotals.nov1_7.Mind.revenue).toLocaleString("en-US"));
  const ads = comparisonRows({ ads: deck.ads, statusById: status.ads_by_id, book: "Mind", period: "nov1_7" });
  const points = scatterPoints(ads);
  const baseline = rates(deck.bookTotals.nov1_7.Mind).roas;
  const layout = scatterLayout(points, baseline);
  assert.ok(points.some((point) => point.roas === 0 || point.plot));
  assert.equal(points.filter((point) => point.plot).length, layout.dots.length);
  for (const dot of layout.dots) {
    assert.ok(dot.x >= layout.padL && dot.x <= layout.width - layout.padR);
    assert.ok(dot.y >= layout.padT && dot.y <= layout.height - layout.padB);
  }
  assert.ok(layout.baseY >= layout.padT && layout.baseY <= layout.height - layout.padB);
  const filtered = filterAds(ads, { key: "spend", min: "1000", max: "8000" });
  const filteredLayout = scatterLayout(scatterPoints(filtered.rows), baseline);
  assert.ok(filteredLayout.dots.length < layout.dots.length);
  assert.equal(rates(deck.bookTotals.nov1_7.Mind).roas, baseline);
  const zero = scatterPoints([{ adId: "z", adName: "z", spend: 5, revenue: 0, impressions: 10, chats: 1, purchases: 0 }]);
  assert.equal(zero[0].roas, 0);
  assert.equal(zero[0].plot, true);
  const missing = scatterPoints([{ adId: "n", adName: "n", spend: 0, revenue: 0, impressions: 0, chats: 0, purchases: 0 }]);
  assert.equal(missing[0].roas, null);
  assert.equal(missing[0].plot, false);
});
