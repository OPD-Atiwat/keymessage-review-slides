import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isQuarantine } from "../shared/status-labels.js";

const status = JSON.parse(readFileSync(new URL("../public/data/ad-status.json", import.meta.url), "utf8"));
const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
const QUARANTINE = ["120255364063130260", "120255499941520260"];

test("coverage is the frozen four periods, with quarantine out of the book totals", () => {
  const ads = Object.values(status.ads_by_id);
  assert.equal(ads.length, 755);
  assert.equal(ads.filter((ad) => !isQuarantine(ad)).length, 753);
  assert.equal(ads.filter(isQuarantine).length, 2);
  for (const id of QUARANTINE) {
    assert.equal(status.ads_by_id[id].excluded_from_book_totals, true);
    assert.equal(deck.ads.some((ad) => ad.adId === id), false);
  }
  const active = { Mind: 0, Coworkers: 0, SurvivalGuide: 0, Trap: 0 };
  for (const ad of ads) {
    if (ad.effective_status === "ACTIVE" && !isQuarantine(ad)) active[ad.book] += 1;
  }
  assert.deepEqual(active, { Mind: 15, Coworkers: 18, SurvivalGuide: 21, Trap: 30 });
  assert.equal(status.summary.fresh_status_counts.ACTIVE, 86);
});

test("content month stays on the name tag when the reporting period is different", () => {
  const octoberContentInNovember = Object.values(status.ads_by_id).filter((ad) => {
    return ad.content_month === "2026-10" && (ad.reporting_periods || []).includes("nov1_7") && !isQuarantine(ad);
  });
  assert.ok(octoberContentInNovember.length > 0);
  const unknown = Object.values(status.ads_by_id).filter((ad) => ad.content_month == null);
  assert.equal(unknown.length, 2);
  for (const ad of unknown) {
    assert.match(ad.ad_name, /\[12\.10\.69\]/);
    assert.match(ad.content_month_label, /ไม่ระบุเดือน Content/);
    assert.equal(ad.content_month_basis, "ambiguous_year_in_ad_name_69_may_be_Buddhist_year_unverified");
  }
  const mismatched = Object.values(status.ads_by_id).find((ad) => {
    return ad.created_time && ad.content_month && !ad.created_time.startsWith(ad.content_month);
  });
  assert.ok(mismatched);
  assert.match(mismatched.content_month_label, /จากชื่อแอด/);
  assert.doesNotMatch(mismatched.content_month_label, /created_time/);
  assert.equal(status.summary.content_month_production_verified, 0);
});
