/** Current Meta status is metadata from the 8 Nov check. It is not performance through 7 Nov. */

export const STATUS_CHECKED_LABEL = "ตรวจสถานะ 8 พ.ย. 2569 เวลา 11:39 น. (Asia/Bangkok)";

export const STATUS_TEXT = {
  ACTIVE: "เปิดใช้งาน (ยังไม่ยืนยันการส่งโฆษณาจริง)",
  PAUSED: "หยุดชั่วคราว",
  ADSET_PAUSED: "ชุดโฆษณาหยุดชั่วคราว",
  WITH_ISSUES: "มีปัญหา",
};

export function contentBadge(record) {
  if (!record || record.content_month == null) {
    return {
      id: "unknown",
      text: record?.content_month_label || "ไม่ระบุเดือน Content",
      fromName: false,
    };
  }
  return {
    id: record.content_month,
    text: record.content_month_label,
    fromName: record.content_month_basis === "ad_name_leading_date_tag",
  };
}

export function statusBadge(record) {
  const code = record?.effective_status || "";
  return {
    code,
    text: STATUS_TEXT[code] || code || "ยังไม่ยืนยันสถานะล่าสุด",
    checked: STATUS_CHECKED_LABEL,
    deliveryConfirmed: false,
    detail: "เป็นการตรวจสถานะบัญชีตอน 8 พ.ย. 11:39 ไม่ใช่ผลลัพธ์ถึงวันที่ 7 และย้อนสถานะเมื่อวานไม่ได้",
  };
}

export function isQuarantine(record) {
  return Boolean(record && record.excluded_from_book_totals);
}
