/** Local, auth-gated stills only. A rejected logo or a missing file stays missing. */

const FILE_NAME = /^[0-9]+\.webp$/;

export function previewState(manifest, adId) {
  const item = manifest?.ads?.[adId];
  if (!item || item.coverage !== "ready") {
    return {
      state: item ? "missing" : "unknown",
      label: "ยังไม่มีภาพเนื้อหาจากวิดีโอที่ยืนยันได้",
      title: item?.reason || "รอบนี้ยังไม่มีภาพที่ยืนยัน",
    };
  }
  if ((item.kind !== "video_cover" && item.kind !== "ad_image") || !FILE_NAME.test(item.file || "")) {
    return {
      state: "missing",
      label: "ยังไม่มีภาพเนื้อหาจากวิดีโอที่ยืนยันได้",
      title: "ไฟล์ภาพไม่ผ่านเงื่อนไข",
    };
  }
  const label = item.kind === "video_cover" ? "ปกวิดีโอ" : "ภาพแอดจริง";
  const title = item.kind === "video_cover"
    ? "ปกจาก creative เดียวกัน ไม่ใช่เฟรมที่ตัดจากวิดีโอ และไม่ได้ดึงไฟล์วิดีโอใหม่"
    : "ภาพแอด ไม่ใช่เฟรมวิดีโอ";
  return {
    state: "ready",
    kind: item.kind,
    label,
    title,
    src: `/data/previews/${item.file}`,
    alt: label,
    width: item.width,
    height: item.height,
  };
}

export function previewFor(manifest, adId) {
  const state = previewState(manifest, adId);
  if (state.state !== "ready") return null;
  return state;
}
