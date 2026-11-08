import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { meanOfRatios, rates, sumTotals } from "../shared/metrics.js";
import { SLIDE_IDS, mapImportedNotes } from "../shared/slides.js";

const deck = JSON.parse(readFileSync(new URL("../public/data/deck.json", import.meta.url), "utf8"));
const QUARANTINE = ["120255364063130260", "120255499941520260"];

test("book rates come from sums, not the mean of ad rates", () => {
  for (const period of Object.keys(deck.bookTotals)) {
    for (const book of Object.keys(deck.bookTotals[period])) {
      const rows = deck.ads.filter((ad) => ad.period === period && ad.book === book);
      const summed = sumTotals(rows);
      const published = deck.bookTotals[period][book];
      assert.equal(Math.round(summed.spend), Math.round(published.spend));
      assert.equal(Math.round(summed.revenue), Math.round(published.revenue));
      assert.equal(rates(published).roas.toFixed(2), rates(summed).roas.toFixed(2));
      if (rows.length > 3 && summed.spend > 0) {
        const mean = meanOfRatios(rows, (row) => rates(row).roas);
        if (mean != null && Math.abs(mean - rates(summed).roas) > 0.02) {
          assert.notEqual(mean.toFixed(2), rates(summed).roas.toFixed(2));
        }
      }
    }
  }
});

test("quarantine stays out of the deck and central tags stay separate", () => {
  const ids = new Set(deck.ads.map((ad) => ad.adId));
  for (const id of QUARANTINE) assert.equal(ids.has(id), false);
  assert.ok(deck.excluded.quarantine.some((row) => row.adId === QUARANTINE[0]));
  const tags = new Set(deck.ads.map((ad) => ad.creatorTag));
  for (const tag of ["Central", "Central+Leef", "Central+Park", "Central+Phum"]) {
    assert.equal(tags.has(tag), true);
  }
  assert.equal(tags.has("Central+Leef/Park/Phum"), false);
});

test("verified stills are 83 files and namecards are not creatives", () => {
  const files = readdirSync(new URL("../public/media/", import.meta.url));
  assert.equal(files.length, 83);
  assert.equal(files.some((name) => name.endsWith(".bin")), false);
  assert.ok(files.every((name) => /\.(jpe?g|png|webp)$/.test(name)));
  assert.equal(deck.thumbCount, 83);
  const namecards = deck.ads.filter((ad) => ad.assetKind === "namecard");
  assert.ok(namecards.length >= 10);
  assert.equal(namecards.some((ad) => ad.thumb), false);
});

test("two office wordings stay unmerged and trap anxiety copy is exact", () => {
  const straight = deck.messages.find((message) => message.id === "cw-people-straight");
  const doubled = deck.messages.find((message) => message.id === "cw-people-doubled");
  assert.notEqual(straight.bodyKey, doubled.bodyKey);
  assert.ok(straight.opening.includes("ใครกำลังเป็นทุกข์"));
  const near = deck.messages.find((message) => message.id === "trap-near");
  assert.equal(near.grouping, "verified-exact");
  assert.equal(near.adIds.length, 5);
  assert.ok(rates(near.periods.nov1_7).roas > 1.8);
  const common = deck.messages.find((message) => message.id === "trap-common");
  assert.ok(rates(common.periods.nov1_7).roas < 1);
  assert.ok(rates(common.periods.oct).roas > 1);
});

test("legacy creator notes map onto discussion slides, not a ranking closer", () => {
  assert.equal(SLIDE_IDS.at(-1), "s12-synthesis");
  assert.equal(SLIDE_IDS.includes("s12-creator-evidence"), false);
  const mapped = mapImportedNotes({
    schemaVersion: 1,
    deckId: "od-howto-creator-review-2026-11-09",
    notes: {
      "s06-mind-messages": { text: "ข้อความ mind", updatedAt: "2026-11-01T00:00:00.000Z" },
      "s05-mind-rank": { text: "อันดับเก่า", updatedAt: "2026-11-02T00:00:00.000Z" },
      "s03-total-rank": { text: "อันดับรวม", updatedAt: null },
    },
  });
  assert.match(mapped["s05-mind"].text, /ข้อความ mind/);
  assert.match(mapped["s05-mind"].text, /จากบันทึกเก่า s05-mind-rank/);
  assert.match(mapped["s11-questions"].text, /อันดับรวม/);
  assert.equal(mapped["s12-synthesis"], undefined);
});
