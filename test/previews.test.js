import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { previewFor } from "../shared/previews.js";

const manifest = JSON.parse(readFileSync(new URL("../public/data/previews/manifest.json", import.meta.url), "utf8"));

test("the preview manifest does not invent frames", () => {
  assert.equal(manifest.coverage, "pending");
  assert.deepEqual(manifest.ads, {});
  assert.equal(previewFor(manifest, "120244120919070260"), null);
  assert.equal(previewFor({ coverage: "partial", ads: { 1: { coverage: "ready", file: "../secret.png" } } }, "1"), null);
  assert.equal(previewFor({ coverage: "partial", ads: { 1: { coverage: "ready", file: "https://cdn.example/a.png" } } }, "1"), null);
  assert.deepEqual(previewFor({ coverage: "partial", ads: { 1: { coverage: "ready", file: "1.png", alt: "เฟรม" } } }, "1"), {
    src: "/data/previews/1.png",
    alt: "เฟรม",
  });
});
