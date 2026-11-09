import assert from "node:assert/strict";
import test from "node:test";
import { filterAds, sortAds } from "../shared/ad-query.js";

function ad(id, fields) {
  return {
    adId: id,
    adName: id,
    spend: 0,
    revenue: 0,
    impressions: 0,
    chats: 0,
    purchases: 0,
    ...fields,
  };
}

const rows = [
  ad("2", { spend: 2, revenue: 10, impressions: 1000, chats: 4, purchases: 1 }),
  ad("10", { spend: 10, revenue: 0, impressions: 0, chats: 0, purchases: 0 }),
  ad("3", { spend: 10, revenue: 5, impressions: 100, chats: 2, purchases: 0 }),
  ad("1", { spend: null, revenue: 1, impressions: 10, chats: 1, purchases: 1 }),
];

test("all nine keys sort numerically, with nulls last and ad id breaking ties", () => {
  const spendDesc = sortAds(rows, "spend", "desc").map((item) => item.adId);
  assert.deepEqual(spendDesc, ["3", "10", "2", "1"]);
  const spendAsc = sortAds(rows, "spend", "asc").map((item) => item.adId);
  assert.deepEqual(spendAsc, ["2", "3", "10", "1"]);
  assert.deepEqual(sortAds(rows, "revenue", "asc").map((item) => item.adId), ["10", "1", "3", "2"]);
  assert.equal(sortAds(rows, "chats", "desc")[0].adId, "2");
  assert.equal(sortAds(rows, "purchases", "desc")[0].adId, "1");
  assert.equal(sortAds(rows, "roas", "desc").at(-1).adId, "1");
  assert.equal(sortAds(rows, "costPerMsg", "asc").at(-1).adId, "10");
  assert.equal(sortAds(rows, "cpm", "asc").at(-1).adId, "10");
  assert.equal(sortAds(rows, "cvrProxy", "desc")[0].adId, "1");
  assert.equal(sortAds(rows, "aov", "asc").at(-1).adId, "10");
  assert.equal(sortAds([ad("b", { spend: 0 }), ad("a", { spend: 0 })], "spend", "desc").map((item) => item.adId).join(), "a,b");
});

test("min and max are inclusive, CVR uses percent, and a bad range is rejected", () => {
  const open = filterAds(rows, { key: "spend", min: "", max: "" });
  assert.equal(open.ok, true);
  assert.equal(open.rows.length, 4);
  const band = filterAds(rows, { key: "spend", min: "2", max: "10" });
  assert.deepEqual(band.rows.map((item) => item.adId).sort(), ["10", "2", "3"]);
  const lowerOnly = filterAds(rows, { key: "spend", min: "10", max: "" });
  assert.deepEqual(lowerOnly.rows.map((item) => item.adId).sort(), ["10", "3"]);
  const cvr = filterAds(rows, { key: "cvrProxy", min: "20", max: "30" });
  assert.deepEqual(cvr.rows.map((item) => item.adId), ["2"]);
  const bad = filterAds(rows, { key: "spend", min: "5", max: "1" });
  assert.equal(bad.ok, false);
  assert.match(bad.message, /มากกว่า/);
  const nan = filterAds(rows, { key: "spend", min: "x", max: "" });
  assert.equal(nan.ok, false);
});
