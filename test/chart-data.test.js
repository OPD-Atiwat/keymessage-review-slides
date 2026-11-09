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
  formatSpendTick,
  scatterLayout,
  scatterPoints,
  trendSegments,
  trendScale,
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
  const roasValues = books.flatMap(([id]) => trendSeries(deck.bookTotals, id, "roas").map((point) => point.value));
  const roasScale = trendScale(roasValues, "roas");
  assert.equal(roasScale.min, 0);
  assert.equal(roasScale.max, 2.5);
  assert.ok(Math.max(...roasValues.filter((value) => value != null)) <= roasScale.max);
  const spendValues = books.flatMap(([id]) => trendSeries(deck.bookTotals, id, "spend").map((point) => point.value));
  const spendScale = trendScale(spendValues, "spend");
  assert.equal(spendScale.min, 0);
  assert.ok(spendScale.max > Math.max(...spendValues.filter((value) => value != null)));
  assert.notEqual(spendScale.max, 2.5);
  const taller = trendScale([0.4, 3.2], "roas");
  assert.ok(taller.max > 3.2);
  assert.notEqual(taller.max, 2.5);
  const expected = {
    Mind: [null, null, 0.85, 0.96, 0.9, 0.69],
    Coworkers: [2.16, 1.32, 1.18, 1.21, 1.21, 1.4],
    SurvivalGuide: [null, null, null, null, 1.04, 0.91],
    Trap: [1.52, 1.54, 1.67, 1.35, 1.32, 1.22],
  };
  for (const [id, values] of Object.entries(expected)) {
    const series = trendSeries(deck.bookTotals, id, "roas").map((point) => (point.value == null ? null : Number(point.value.toFixed(2))));
    assert.deepEqual(series, values, id);
  }
  const nov = periodSeries(deck.bookTotals, "nov1_7", books, "roas");
  assert.equal(nov.find((item) => item.id === "Mind").value.toFixed(2), "0.89");
  assert.equal(nov.find((item) => item.id === "Coworkers").value.toFixed(2), "1.61");
  assert.equal(nov.find((item) => item.id === "SurvivalGuide").value.toFixed(2), "1.15");
  assert.equal(nov.find((item) => item.id === "Trap").value.toFixed(2), "1.36");
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
  assert.ok(layout.xTicks.some((tick) => tick.label === "฿0"));
  assert.ok(layout.xTicks.some((tick) => /฿\d+k/.test(tick.label)));
  const spendTick = layout.xTicks.find((tick) => tick.value > 0);
  const aligned = scatterLayout(scatterPoints([{
    adId: "m",
    adName: "m",
    spend: spendTick.value,
    revenue: spendTick.value,
    impressions: 1000,
    chats: 1,
    purchases: 1,
  }]), baseline);
  const alignedTick = aligned.xTicks.find((tick) => tick.value === spendTick.value);
  assert.equal(aligned.dots[0].x.toFixed(2), alignedTick.x.toFixed(2));
  const zeroLayout = scatterLayout(zero, baseline);
  const zeroTick = zeroLayout.yTicks.find((tick) => Math.abs(tick.value) < 1e-6);
  assert.equal(zeroLayout.dots[0].y.toFixed(2), zeroTick.y.toFixed(2));
  assert.ok(layout.dots.every((dot) => dot.x <= layout.width - layout.padR && dot.y >= layout.padT));
  assert.equal(baseline.toFixed(2), "0.89");
  assert.equal(Math.round(deck.bookTotals.nov1_7.Mind.spend * 100) / 100, 34889.59);
  assert.equal(deck.bookTotals.nov1_7.Mind.revenue, 31096);
  assert.equal(deck.bookTotals.nov1_7.Mind.chats, 453);
  assert.equal(deck.bookTotals.nov1_7.Mind.purchases, 88);
  const outlier = points.find((point) => point.adId === "120255152050450260");
  assert.ok(outlier.roas > 9 && outlier.spend < 60);
  const outlierDot = layout.dots.find((dot) => dot.adId === outlier.adId);
  assert.ok(outlierDot.y >= layout.padT && outlierDot.y <= layout.height - layout.padB);
  assert.ok(layout.yMax > outlier.roas);
  const narrow = filterAds(ads, { key: "spend", min: "1000", max: "8000" });
  assert.equal(narrow.rows.length, 11);
  assert.equal(ads.length, 33);
  assert.equal(formatSpendTick(2000), "฿2k");
  const missing = scatterPoints([{ adId: "n", adName: "n", spend: 0, revenue: 0, impressions: 0, chats: 0, purchases: 0 }]);
  assert.equal(missing[0].roas, null);
  assert.equal(missing[0].plot, false);
});
