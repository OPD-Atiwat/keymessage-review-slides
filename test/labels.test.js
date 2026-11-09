import assert from "node:assert/strict";
import test from "node:test";
import { METRIC_LABELS } from "../shared/labels.js";

test("visible metric names stay the canonical English set", () => {
  assert.deepEqual(METRIC_LABELS, [
    "Spend",
    "Revenue",
    "ROAS",
    "Messages",
    "Cost per Message",
    "CPM",
    "Purchases",
    "CVR",
    "AOV",
  ]);
});
