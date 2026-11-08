import assert from "node:assert/strict";
import test from "node:test";
import { changePct, metricTone, sameLengthBase } from "../shared/conditional.js";
import { ratio } from "../shared/metrics.js";

test("same-length change only, and a zero base is not an infinite percent", () => {
  assert.equal(sameLengthBase("oct"), "sep");
  assert.equal(sameLengthBase("sep"), "aug");
  assert.equal(sameLengthBase("jun"), "may");
  assert.equal(sameLengthBase("nov1_7"), null);
  assert.equal(sameLengthBase("oct1_7"), null);
  assert.equal(changePct(100, 0).text, "ใหม่/ไม่มีฐาน");
  assert.equal(changePct(0, 0).text, "—");
  assert.equal(changePct(110, 100).text, "+10.0%");
  assert.equal(ratio(10, 0), null);
});

test("row color follows this book's period baseline, and skips metrics that cannot be compared", () => {
  assert.equal(metricTone("roas", 1.4, 1.04), "better");
  assert.equal(metricTone("roas", 0.8, 1.04), "worse");
  assert.equal(metricTone("costPerMsg", 40, 83), "better");
  assert.equal(metricTone("costPerMsg", 120, 83), "worse");
  assert.equal(metricTone("cpm", null, 99), "neutral");
  assert.equal(metricTone("roas", null, 1), "neutral");
  assert.equal(metricTone("roas", 0, 1.2), "worse");
  assert.equal(metricTone("roas", 2, null), "neutral");
  assert.equal(metricTone("cvrProxy", 0.3, 0.1), "better");
  assert.equal(metricTone("aov", 80, 120), "worse");
  assert.equal(metricTone("spend", 90000, 100), "volume");
  assert.equal(metricTone("revenue", 10, 90000), "volume");
  assert.equal(metricTone("chats", 10, 100), "volume");
  assert.equal(metricTone("purchases", 80, 1), "volume");
  assert.equal(metricTone("roas", 1.004, 1), "neutral");
  assert.equal(metricTone("costPerMsg", 54.4, 53.6), "neutral");
});
