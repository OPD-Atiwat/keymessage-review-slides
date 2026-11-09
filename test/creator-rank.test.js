import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { rates } from "../shared/metrics.js";
import {
  coverageOf,
  creatorGroups,
  creatorHistory,
  defaultCreatorDir,
  knownCreators,
  reconcileCreators,
  sortCreators,
  unknownCreator,
} from "../shared/creator-rank.js";

const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
const SOURCE_SHA = "7dd0e69edbe69785a13add925242976332367ad3516541119c86c7b786d4d297";
const PERIODS = ["may", "jun", "jul", "aug", "sep", "oct", "nov1_7"];
const BOOKS = ["Mind", "Coworkers", "SurvivalGuide", "Trap"];

test("the verified deck file is unchanged", () => {
  const bytes = readFileSync(new URL("../public/data/deck.json", import.meta.url));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), SOURCE_SHA);
});

test("creator groups including unknown match every book and the four-book total", () => {
  for (const period of PERIODS) {
    const scopes = ["all", ...BOOKS];
    for (const book of scopes) {
      const groups = creatorGroups(deck.ads, period, book);
      const check = reconcileCreators(groups, deck.bookTotals, period, book);
      assert.equal(check.ok, true, `${period} ${book}`);
      if (!check.expected) {
        assert.equal(groups.length, 0);
        continue;
      }
      const summedRates = rates(check.summed);
      const expectedRates = rates(check.expected);
      for (const key of ["roas", "costPerMsg", "cpm", "cvrProxy", "aov"]) {
        const left = summedRates[key];
        const right = expectedRates[key];
        if (left == null || right == null) assert.equal(left, right, `${period} ${book} ${key}`);
        else assert.ok(Math.abs(left - right) < 1e-9, `${period} ${book} ${key}`);
      }
      const seen = new Set();
      for (const group of groups) {
        for (const ad of group.ads) {
          const id = `${ad.adId}`;
          assert.equal(seen.has(id), false, id);
          seen.add(id);
        }
      }
      assert.equal(seen.size, check.expected.n);
    }
  }
});

test("Central tags stay separate and a joint tag is not split or copied", () => {
  const groups = creatorGroups(deck.ads, "oct", "all");
  const tags = groups.map((row) => row.tag);
  for (const tag of ["Central", "Central+Leef", "Central+Park", "Central+Phum"]) {
    assert.equal(tags.filter((item) => item === tag).length, 1, tag);
  }
  const joint = groups.find((row) => row.tag === "Central+Leef");
  const central = groups.find((row) => row.tag === "Central");
  const jointIds = new Set(joint.ads.map((ad) => ad.adId));
  assert.equal(central.ads.some((ad) => jointIds.has(ad.adId)), false);
  assert.ok(joint.spend > central.spend);
});

test("a malformed name stays unknown and is not repaired into ริว", () => {
  const groups = creatorGroups(deck.ads, "may", "Trap");
  const unknown = unknownCreator(groups);
  assert.ok(unknown.ads.some((ad) => ad.adId === "120248465651870260"));
  const riu = knownCreators(groups).find((row) => row.tag === "ริว");
  if (riu) assert.equal(riu.ads.some((ad) => ad.adId === "120248465651870260"), false);
});

test("a blank tag stays unknown even when the ad name contains a person", () => {
  const groups = creatorGroups(deck.ads, "may", "Trap");
  const unknown = unknownCreator(groups);
  assert.ok(unknown);
  assert.equal(unknown.known, false);
  assert.equal(unknown.label, "ไม่ทราบ Creator");
  const hidden = unknown.ads.find((ad) => ad.adId === "120243955299420260");
  assert.ok(hidden);
  assert.match(hidden.adName, /หมิว/);
  const named = knownCreators(groups).find((row) => row.tag === "หมิว");
  assert.equal(named.ads.some((ad) => ad.adId === hidden.adId), false);
  assert.equal(knownCreators(groups).some((row) => !row.known), false);
  const coverage = coverageOf(groups);
  assert.ok(coverage.blank > 0);
  assert.equal(coverage.tagged + coverage.blank, coverage.total);
});

test("September through 1–7 November have a stored tag on every included ad", () => {
  for (const period of ["sep", "oct", "nov1_7"]) {
    const coverage = coverageOf(creatorGroups(deck.ads, period, "all"));
    assert.equal(coverage.blank, 0, period);
    assert.ok(coverage.tagged > 0);
  }
});

test("a creator history uses the stored tag and leaves a missing month null", () => {
  const history = creatorHistory(deck.ads, "Mind", "ริว", "roas");
  assert.deepEqual(history.map((point) => point.id), ["may", "jun", "jul", "aug", "sep", "oct"]);
  const october = creatorGroups(deck.ads, "oct", "Mind").find((row) => row.tag === "ริว");
  assert.equal(history.find((point) => point.id === "oct").value, october.roas);
  assert.equal(history.find((point) => point.id === "may").value, null);
  assert.equal(history.some((point) => point.value === 0 && point.n === 0), false);
});

test("missing rates sort last, zero stays zero, and ties follow the name", () => {
  const rows = [
    { tag: "b", label: "บ", known: true, roas: null, costPerMsg: 10 },
    { tag: "a", label: "ก", known: true, roas: 1, costPerMsg: 10 },
    { tag: "c", label: "ค", known: true, roas: 0, costPerMsg: null },
    { tag: "d", label: "ง", known: true, roas: 1, costPerMsg: 2 },
  ];
  assert.deepEqual(sortCreators(rows, "roas", "desc").map((row) => row.tag), ["a", "d", "c", "b"]);
  assert.deepEqual(sortCreators(rows, "roas", "asc").map((row) => row.tag), ["c", "a", "d", "b"]);
  assert.deepEqual(sortCreators(rows, "costPerMsg", "asc").map((row) => row.tag), ["d", "a", "b", "c"]);
  assert.deepEqual(sortCreators(rows, "costPerMsg", "desc").map((row) => row.tag), ["a", "b", "d", "c"]);
  assert.equal(defaultCreatorDir("roas"), "desc");
  assert.equal(defaultCreatorDir("costPerMsg"), "asc");
  assert.equal(defaultCreatorDir("cpm"), "asc");
});
