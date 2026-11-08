export const DECK_ID = "od-howto-keymessage-review-2026-11-08";
export const LEGACY_DECK_ID = "od-howto-creator-review-2026-11-09";
export const MAX_NOTE = 20000;

export const SLIDE_IDS = [
  "s01-axis",
  "s02-sep-oct",
  "s03-matched-week",
  "s04-km-overview",
  "s05-mind",
  "s06-coworkers",
  "s07-survival",
  "s08-trap",
  "s09-same-copy",
  "s10-ads",
  "s11-questions",
  "s12-synthesis",
];

export const WEB_NOTE_IDS = ["web-overview", "web-book", "web-ads"];
export const NOTE_IDS = [...SLIDE_IDS, ...WEB_NOTE_IDS];

/** Old creator-ranking deck IDs, kept so an explicit import still lands on a slide. */
export const LEGACY_TO_SLIDE = {
  "s01-conclusions": "s01-axis",
  "s02-full-month": "s02-sep-oct",
  "s03-total-rank": "s11-questions",
  "s04-early-month": "s03-matched-week",
  "s05-mind-rank": "s05-mind",
  "s06-mind-messages": "s05-mind",
  "s07-coworkers-rank": "s06-coworkers",
  "s08-coworkers-messages": "s06-coworkers",
  "s09-survival-rank": "s07-survival",
  "s10-survival-messages": "s07-survival",
  "s11-trap-rank": "s08-trap",
  "s12-trap-messages": "s08-trap",
};

function badKey(key) {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

export function mapImportedNotes(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error("ไฟล์ต้องเป็น object");
  }
  const version = doc.schemaVersion;
  if (version !== 1 && version !== 2) throw new Error("schemaVersion ไม่รองรับ");
  if (version === 1 && doc.deckId !== LEGACY_DECK_ID) {
    throw new Error("deckId ของบันทึกเก่าไม่ตรง");
  }
  if (version === 2 && doc.deckId !== DECK_ID) {
    throw new Error("deckId ไม่ตรงกับสำรับนี้");
  }
  const notes = doc.notes;
  if (!notes || typeof notes !== "object" || Array.isArray(notes)) {
    throw new Error("notes ต้องเป็น object");
  }

  const buckets = new Map();
  for (const [key, note] of Object.entries(notes)) {
    if (badKey(key)) throw new Error("คีย์ต้องห้าม");
    if (!note || typeof note !== "object" || typeof note.text !== "string") {
      throw new Error("บันทึกเสียหาย: " + key);
    }
    if (note.text.length > MAX_NOTE) throw new Error("บันทึกยาวเกิน: " + key);
    if (note.text.includes("\u0000")) throw new Error("บันทึกมีอักขระต้องห้าม: " + key);
    let target = null;
    if (NOTE_IDS.includes(key)) target = key;
    else if (Object.prototype.hasOwnProperty.call(LEGACY_TO_SLIDE, key)) target = LEGACY_TO_SLIDE[key];
    else throw new Error("ไม่รู้จักสไลด์: " + key);
    if (!buckets.has(target)) buckets.set(target, []);
    buckets.get(target).push({
      from: key,
      text: note.text,
      updatedAt: typeof note.updatedAt === "string" ? note.updatedAt : null,
    });
  }

  const mapped = {};
  for (const [id, parts] of buckets) {
    let text;
    if (parts.length === 1 && parts[0].from === id) text = parts[0].text;
    else {
      text = parts
        .map((part) => (part.from === id ? part.text : `— จากบันทึกเก่า ${part.from} —\n${part.text}`))
        .join("\n\n");
    }
    if (text.length > MAX_NOTE) throw new Error("รวมบันทึกแล้วยาวเกิน: " + id);
    const times = parts.map((part) => part.updatedAt).filter(Boolean).sort();
    mapped[id] = { text, updatedAt: times.length ? times[times.length - 1] : null };
  }
  return mapped;
}
