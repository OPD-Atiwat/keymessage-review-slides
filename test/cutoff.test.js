import assert from "node:assert/strict";
import test from "node:test";
import { FROZEN_PERFORMANCE, performanceThroughIso } from "../shared/cutoff.js";
import { STATUS_CHECKED_LABEL, contentBadge, statusBadge } from "../shared/status-labels.js";

test("performance cutoff uses the Bangkok calendar, not the UTC date", () => {
  const lateUtcStillPreviousBangkokDay = new Date("2026-11-07T16:30:00.000Z");
  assert.equal(performanceThroughIso(lateUtcStillPreviousBangkokDay), "2026-11-06");
  const utcEveningIsAlreadyNextBangkokMorning = new Date("2026-11-07T18:30:00.000Z");
  assert.equal(performanceThroughIso(utcEveningIsAlreadyNextBangkokMorning), "2026-11-07");
  assert.notEqual(
    performanceThroughIso(utcEveningIsAlreadyNextBangkokMorning),
    "2026-11-06"
  );
  assert.equal(FROZEN_PERFORMANCE.through, "2026-11-07");
  assert.match(FROZEN_PERFORMANCE.novMtdLabel, /1–7 พ\.ย\./);
  assert.match(FROZEN_PERFORMANCE.novMtdLabel, /ไม่ครบเดือน/);
});

test("status checked on 8 Nov is not the performance cutoff and not yesterday's status", () => {
  const record = {
    effective_status: "ACTIVE",
    content_month: "2026-10",
    content_month_label: "Content 2026-10 — จากชื่อแอด (ยังไม่ยืนยันเดือนผลิต)",
    content_month_basis: "ad_name_leading_date_tag",
    status_checked_at: "2026-11-08T11:39:15.508542+07:00",
    delivery_confirmed: null,
  };
  const status = statusBadge(record);
  assert.match(status.text, /เปิดใช้งาน/);
  assert.doesNotMatch(status.text, /กำลังยิง/);
  assert.equal(status.deliveryConfirmed, false);
  assert.match(STATUS_CHECKED_LABEL, /8 พ\.ย\./);
  assert.match(status.detail, /ไม่ใช่ผลลัพธ์ถึงวันที่ 7/);
  const badge = contentBadge(record);
  assert.match(badge.text, /จากชื่อแอด/);
  assert.match(badge.text, /ยังไม่ยืนยันเดือนผลิต/);
  assert.equal(contentBadge({ content_month: null, content_month_label: "ไม่ระบุเดือน Content" }).id, "unknown");
});
