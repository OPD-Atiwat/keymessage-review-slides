#!/usr/bin/env python3
"""Freeze the 8 Nov 2026 chat-campaign extract into public/data and thumbs.

Source files are the uploaded snapshot, not a live Meta account.
Ratios are not stored; the app divides sums. This script only checks them.
"""

from __future__ import annotations

import base64
import csv
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML_PATH = Path(
    "/home/ubuntu/.cursor/projects/workspace/uploads/Creator-Review-2026-11-09-v3_da67.html"
)
CSV_PATH = Path("/home/ubuntu/.cursor/projects/workspace/uploads/ad_period_rows_23e2.csv")
PUBLIC = ROOT / "public"
MEDIA = PUBLIC / "media"
FONTS = PUBLIC / "fonts"
DATA = PUBLIC / "data" / "deck.json"

QUARANTINE = {"120255364063130260", "120255499941520260"}
PERIODS = ["sep", "oct", "oct1_7", "nov1_7"]
BOOKS = ["Mind", "Coworkers", "SurvivalGuide", "Trap"]


def num(value):
    return float(value or 0)


def normalize_body(text: str) -> str:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r" *\n+ *", " / ", text)
    return text.strip()


def body_key(text: str) -> str:
    return hashlib.sha1(normalize_body(text).encode("utf-8")).hexdigest()[:16]


def load_media(html: str) -> dict:
    marker = "window.MEDIA_MANIFEST="
    start = html.find(marker)
    if start < 0:
        raise SystemExit("MEDIA_MANIFEST missing")
    start += len(marker)
    end = html.find("</script>", start)
    raw = html[start:end].strip()
    if raw.endswith(";"):
        raw = raw[:-1]
    return json.loads(raw)


def font_faces(html: str):
    pattern = re.compile(
        r"@font-face\{font-family:'IBM Plex Sans Thai';font-weight:(\d+);src:url\(data:font/woff2;base64,([A-Za-z0-9+/=]+)\) format\('woff2'\);unicode-range:([^}]+)\}"
    )
    found = []
    for weight, b64, urange in pattern.findall(html):
        found.append((weight, base64.b64decode(b64), urange))
    if len(found) != 6:
        raise SystemExit(f"expected 6 font faces, got {len(found)}")
    return found


def write_fonts(html: str):
    FONTS.mkdir(parents=True, exist_ok=True)
    seen = {"thai": set(), "latin": set()}
    for weight, blob, urange in font_faces(html):
        kind = "thai" if "U+0E01" in urange else "latin"
        if weight in seen[kind]:
            raise SystemExit("duplicate font " + kind + weight)
        seen[kind].add(weight)
        (FONTS / f"ibm-plex-sans-thai-{weight}-{kind}.woff2").write_bytes(blob)


def image_bytes(b64: str):
    if not b64:
        return None
    try:
        return base64.b64decode(b64, validate=False)
    except Exception:
        return None


def save_thumb(ad_id: str, blob: bytes) -> str:
    if blob.startswith(b"\xff\xd8\xff"):
        ext = "jpg"
    elif blob.startswith(b"\x89PNG"):
        ext = "png"
    elif blob.startswith(b"RIFF") and blob[8:12] == b"WEBP":
        ext = "webp"
    else:
        ext = "bin"
    name = f"{ad_id}.{ext}"
    (MEDIA / name).write_bytes(blob)
    return name


def totals():
    return {"spend": 0.0, "revenue": 0.0, "impressions": 0.0, "chats": 0.0, "purchases": 0.0, "n": 0}


def add(bucket, row):
    bucket["spend"] += row["spend"]
    bucket["revenue"] += row["revenue"]
    bucket["impressions"] += row["impressions"]
    bucket["chats"] += row["chats"]
    bucket["purchases"] += row["purchases"]
    bucket["n"] += 1


def roas(bucket):
    return bucket["revenue"] / bucket["spend"] if bucket["spend"] else None


def round_baht(value):
    return int(value + 0.5) if value >= 0 else int(value - 0.5)


CURATED = [
    {
        "id": "cw-people-straight",
        "book": "Coworkers",
        "prefix": 'ใครกำลังเป็นทุกข์ เรื่อง "คน"',
        "not_prefix": 'ใครกำลังเป็นทุกข์ เรื่อง ""คน""',
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s06-coworkers"],
        "talk": "ข้อความแอดเปิดด้วยความทุกข์เรื่องคนในที่ทำงาน ช่วง 1–7 พ.ย. มีแชทหลักร้อยและ ROAS เกิน 2 ไฟล์วิเคราะห์ต้น พ.ย. จับคู่ข้อความนี้กับอีกชุดที่เครื่องหมายคำพูดไม่ตรงกันทุกตัวอักษร เป็นการจัดกลุ่มเชิงวิเคราะห์ ไม่ได้รวมตัวเลขในสไลด์นี้",
    },
    {
        "id": "cw-people-doubled",
        "book": "Coworkers",
        "prefix": 'ใครกำลังเป็นทุกข์ เรื่อง ""คน""',
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s06-coworkers"],
        "talk": "คนละข้อความกับชุดเครื่องหมายคำพูดตรง แม้ใจความเปิดจะเหมือนกัน ตัวเลขจึงแยกไว้",
    },
    {
        "id": "cw-see-him",
        "book": "Coworkers",
        "prefix": "ยังต้องเจอเขาทุกวัน",
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s06-coworkers"],
        "talk": "อีกข้อความของออฟฟิศที่ช่วง 1–7 พ.ย. ROAS สูงกว่า 2 บนฐาน Spend ประมาณห้าพันบาท",
    },
    {
        "id": "cw-every-word",
        "book": "Coworkers",
        "prefix": "จากคนที่เคยกล้าพูด",
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s06-coworkers"],
        "talk": "ROAS ของทั้งช่วง 1–7 พ.ย. ยังใกล้ 2 ไฟล์วิเคราะห์ระบุ ROAS รายวัน 4–7 พ.ย. ของแอดนี้ว่า 0.94 / 0.58 / 1.65 / 1.02 ซึ่งไม่ได้คำนวณใหม่จากไฟล์รายช่วง",
    },
    {
        "id": "cw-cannot-change",
        "book": "Coworkers",
        "prefix": "เราอาจเปลี่ยนคนในที่ทำงานไม่ได้",
        "focus": "nov1_7",
        "lane": "under",
        "slides": ["s04-km-overview", "s06-coworkers"],
        "talk": "ช่วง 1–7 พ.ย. ROAS ต่ำกว่า 1 และ Spend ยังไม่ถึง 5,000 บาท อ่านเป็นฐานเล็ก ไม่ใช่คำสั่งปิดแอด",
    },
    {
        "id": "mind-not-price",
        "book": "Mind",
        "prefix": "ลูกค้าไม่ซื้อ อาจไม่ใช่เพราะราคา",
        "focus": "nov1_7",
        "lane": "under",
        "slides": ["s04-km-overview", "s05-mind"],
        "talk": "แชทเยอะและบาทต่อแชทต่ำกว่าข้อความอื่นของเล่ม แต่ยอดซื้อที่ Meta นับมี 11 ครั้ง ROAS จึงยังต่ำกว่า 1",
    },
    {
        "id": "mind-one-rule",
        "book": "Mind",
        "prefix": "จะขายให้ได้ มีข้อห้ามอยู่ข้อเดียว",
        "contains": "ด้วยหลักจิตวิทยาที่เรียกว่า Commitment",
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s05-mind"],
        "talk": "เป็นข้อความ Mind ใน 1–7 พ.ย. ที่ ROAS เกิน 1 บน Spend ยังไม่ถึงเกณฑ์ 5,000 บาท จึงยังเป็นฐานที่อ่านได้แบบระวัง",
    },
    {
        "id": "mind-chase",
        "book": "Mind",
        "prefix": '"ลูกค้าบางคน ยิ่งตาม ยิ่งหนี',
        "focus": "nov1_7",
        "lane": "under",
        "slides": ["s04-km-overview", "s05-mind"],
        "talk": "ช่วง 1–7 พ.ย. ซื้อ 2 ครั้งจากแชท 59 ครั้ง ROAS ต่ำมาก และ Spend ยังต่ำกว่า 5,000 บาท",
    },
    {
        "id": "mind-five-min",
        "book": "Mind",
        "prefix": "จะปิดการขายได้ไหม ขึ้นอยู่กับ 5 นาทีแรก",
        "focus": "nov1_7",
        "lane": "under",
        "slides": ["s04-km-overview", "s05-mind"],
        "talk": "ช่วง 1–7 พ.ย. ซื้อ 3 ครั้ง ROAS ต่ำกว่า 1 ฐาน Spend ยังไม่ถึง 5,000 บาท",
    },
    {
        "id": "mind-price-vanish",
        "book": "Mind",
        "prefix": "💬 ลูกค้าถามราคาแล้วหาย",
        "focus": "nov1_7",
        "lane": "small",
        "slides": ["s04-km-overview", "s05-mind"],
        "talk": "ไฟล์วิเคราะห์บอกว่าเปิด 6 พ.ย. Spend ยังหลักร้อย ROAS สูงได้บนฐานเล็ก",
    },
    {
        "id": "mind-come-to-me",
        "book": "Mind",
        "prefix": "อยากขายเก่ง จนลูกค้าเป็นฝ่ายเข้าหา",
        "focus": "nov1_7",
        "lane": "small",
        "slides": ["s04-km-overview", "s05-mind"],
        "talk": "ไฟล์วิเคราะห์บอกว่าเปิด 4 พ.ย. แชทถูก แต่ Spend ยังต่ำกว่า 5,000 บาทและซื้อยังไม่ถึง 10 ครั้ง",
    },
    {
        "id": "sv-every-home",
        "book": "SurvivalGuide",
        "prefix": "เหตุผลที่บ้านทุกหลังควรมีหนังสือเล่มนี้",
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s07-survival"],
        "talk": "ช่วง 1–7 พ.ย. ROAS เกิน 1 และมีแชทหลักสิบ ฐาน Spend ยังต่ำกว่า 5,000 บาท",
    },
    {
        "id": "sv-flood",
        "book": "SurvivalGuide",
        "prefix": "🚨 หนังสือเล่มนี้หยุดน้ำท่วมไม่ได้",
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s07-survival"],
        "talk": "ROAS สูงกว่า 1 แต่บาทต่อแชทแพง และจำนวนแชททั้งช่วงอยู่หลักสิบ",
    },
    {
        "id": "sv-dont-wait",
        "book": "SurvivalGuide",
        "prefix": "⚠️ “ความรู้เอาตัวรอด ไม่ควรเริ่มหาในวันที่ต้องเอาตัวรอด”",
        "focus": "nov1_7",
        "lane": "under",
        "slides": ["s04-km-overview", "s07-survival", "s09-same-copy"],
        "talk": "ทั้งเดือน ต.ค. ข้อความนี้ใช้เงินหลักหมื่นและ ROAS ใกล้ 1 ส่วน 1–7 พ.ย. ROAS ต่ำกว่า 1 บนฐานที่เล็กลง อย่าอ่านแค่วันแรกของเดือน",
    },
    {
        "id": "sv-199",
        "book": "SurvivalGuide",
        "prefix": "🚨 ลดแรง ราคาพิเศษ 199.-",
        "focus": "nov1_7",
        "lane": "small",
        "slides": ["s04-km-overview", "s07-survival"],
        "talk": "ไฟล์วิเคราะห์บอกว่าเปิด 5–6 พ.ย. ROAS สูงบน Spend หลักร้อย ยังสรุปข้อความนี้ไม่ได้",
    },
    {
        "id": "sv-dpm",
        "book": "SurvivalGuide",
        "prefix": "🚨 ปภ. ประกาศแจ้งเตือนให้ทุกบ้าน",
        "focus": "nov1_7",
        "lane": "small",
        "slides": ["s04-km-overview", "s07-survival"],
        "talk": "ROAS สูงแต่แชทหลักสิบ และอัตราซื้อ÷แชทสูงจนเกิน 100% ได้ ยอดซื้อไม่ได้ผูกกับแชท",
    },
    {
        "id": "trap-near",
        "book": "Trap",
        "prefix": "โรควิตกกังวล โรคทางจิตเวชที่อาจใกล้ตัวคุณกว่าที่คิด",
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s08-trap"],
        "talk": "ห้าแอดใช้ข้อความเดียวกันแบบตัวอักษรตรงกัน ช่วง 1–7 พ.ย. แชท 273 ครั้ง บาทต่อแชทต่ำ และ ROAS ใกล้ 2",
    },
    {
        "id": "trap-common",
        "book": "Trap",
        "prefix": "💔“โรควิตกกังวล” โรคที่คนไทยเป็นเยอะ",
        "focus": "nov1_7",
        "lane": "under",
        "slides": ["s04-km-overview", "s08-trap", "s09-same-copy"],
        "talk": "หัวข้อใกล้กับข้อความ “ใกล้ตัวคุณกว่าที่คิด” แต่คนละข้อความ ช่วง 1–7 พ.ย. ROAS ต่ำกว่า 1 ทั้งที่ทั้งเดือน ก.ย. และ ต.ค. ข้อความชุดนี้ ROAS เกิน 1 บน Spend สูง อย่าเอาสัปดาห์เดียวไปทับทั้งเดือน",
    },
    {
        "id": "trap-not-sad",
        "book": "Trap",
        "prefix": '"ไม่ได้เศร้า แต่ก็ไม่ได้รู้สึกมีความสุข',
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s08-trap"],
        "talk": "ช่วง 1–7 พ.ย. ROAS เกิน 1 แชทหลักสิบ และ Spend ยังต่ำกว่า 5,000 บาท",
    },
    {
        "id": "trap-cycle",
        "book": "Trap",
        "prefix": "วงจรของความเครียดซ้ำ ๆ",
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s04-km-overview", "s08-trap"],
        "talk": "ข้อความอ้างบทสัมภาษณ์คุณหมอในตัวแอด ช่วง 1–7 พ.ย. ROAS เกิน 1 แชทหลักสิบ ยังไม่ได้ตรวจบทพูดในวิดีโอ",
    },
    {
        "id": "trap-kao",
        "book": "Trap",
        "prefix": "หยุดคิดถึงความผิดพลาดไม่ได้?",
        "focus": "nov1_7",
        "lane": "strong",
        "slides": ["s08-trap"],
        "talk": "ROAS เกิน 1 แต่บาทต่อแชทสูง และซื้อ÷แชทเกิน 50% ภาพของชุด Kaoborkwa เป็นนามบัตร ไม่ใช่ครีเอทีฟโฆษณา",
    },
    {
        "id": "trap-signed",
        "book": "Trap",
        "prefix": "💢 20 เล่มสุดท้าย",
        "focus": "nov1_7",
        "lane": "promo",
        "slides": ["s08-trap"],
        "talk": "เล่มลายเซ็น ช่วง 1–7 พ.ย. ROAS เกิน 1 แต่บาทต่อแชทสูงและซื้อ÷แชทสูง ไฟล์วิเคราะห์ตั้งคำถามว่าคนซื้อผ่านช่องทางไหน ไม่ได้ตอบในข้อมูลนี้",
    },
    {
        "id": "sv-fire",
        "book": "SurvivalGuide",
        "prefix": "⚠️ ถ้าวันนี้เกิดไฟไหม้",
        "focus": "oct",
        "lane": "compare",
        "slides": ["s09-same-copy"],
        "talk": "ข้อความชุดเดียวกันทั้งเดือน ก.ย. ROAS เกิน 1 แล้วทั้งเดือน ต.ค. ต่ำกว่า 1 บน Spend ที่ยังสูง",
    },
    {
        "id": "cw-toxic-game",
        "book": "Coworkers",
        "prefix": '🔥 เลิกเป็นเหยื่อ Toxic แล้วเปลี่ยนมาเป็น "ผู้ควบคุมเกม"',
        "focus": "oct",
        "lane": "compare",
        "slides": ["s09-same-copy", "s06-coworkers"],
        "talk": "ข้อความนี้อยู่กับออฟฟิศทั้ง ก.ย. และ ต.ค. โดย ROAS ยังเกิน 2 ช่วง 1–7 พ.ย. ROAS ยังสูงแต่แชทเหลือหลักสิบและบาทต่อแชทแพงขึ้น",
    },
    {
        "id": "mind-pushed",
        "book": "Mind",
        "prefix": "ยิ่งพยายาม ก็ยิ่งขายไม่ได้",
        "focus": "oct",
        "lane": "compare",
        "slides": ["s09-same-copy", "s05-mind"],
        "talk": "ข้อความชุดเดียวกัน ก.ย. ROAS เกิน 1 แล้ว ต.ค. ต่ำกว่า 1 พร้อมจำนวนแอดที่ใช้ข้อความนี้มากขึ้น",
    },
]


def opening_of(body: str) -> str:
    body = (body or "").strip()
    part = re.split(r"\s+/\s+", body, maxsplit=1)[0].strip()
    return part or body[:180]


def match_group(spec, groups):
    hits = []
    for key, group in groups.items():
        if group["book"] != spec["book"]:
            continue
        body = group["body"]
        if not body.startswith(spec["prefix"]):
            continue
        banned = spec.get("not_prefix")
        if banned and body.startswith(banned):
            continue
        needle = spec.get("contains")
        if needle and needle not in body:
            continue
        blocked = spec.get("not_contains")
        if blocked and blocked in body:
            continue
        hits.append(group)
    if len(hits) != 1:
        sample = [h["body"][:80] for h in hits[:4]]
        raise SystemExit(f"{spec['id']} matched {len(hits)} bodies {sample}")
    return hits[0]


def main():
    html = HTML_PATH.read_text(encoding="utf-8")
    write_fonts(html)
    media = load_media(html)
    with CSV_PATH.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    MEDIA.mkdir(parents=True, exist_ok=True)
    for old in MEDIA.iterdir():
        if old.is_file():
            old.unlink()

    excluded = {"quarantine": [], "otherChannel": []}
    ads = []
    thumb_ids = set()
    for row in rows:
        ad_id = row["ad_id"]
        entry_base = {
            "period": row["period"],
            "book": row["book"],
            "adId": ad_id,
            "adName": row["ad_name"],
            "spend": num(row["spend"]),
            "revenue": num(row["val"]),
        }
        if ad_id in QUARANTINE or row["status"] == "quarantine":
            excluded["quarantine"].append(entry_base)
            continue
        if row["channel"] != "messaging":
            excluded["otherChannel"].append({**entry_base, "channel": row["channel"]})
            continue
        meta = media.get(ad_id) or {}
        body = meta.get("body") or ""
        name = row["ad_name"] or ""
        namecard = "[Kaoborkwa]" in name
        preview_ok = bool(meta.get("preview_ok"))
        asset_type = meta.get("asset_type") or ""
        thumb = None
        if namecard:
            asset_kind = "namecard"
            asset_label = "นามบัตร Kaoborkwa ไม่ใช่ครีเอทีฟโฆษณา — ไม่ได้ฝังภาพนี้"
        elif preview_ok and asset_type == "image":
            asset_kind = "image"
            asset_label = "ภาพนิ่งที่ยืนยันจากไฟล์ครีเอทีฟในสแนปชอต"
        elif preview_ok and asset_type.startswith("video"):
            asset_kind = "video-still"
            asset_label = "วิดีโอ — ในหน้านี้มีแค่ภาพนิ่ง เล่นคลิปไม่ได้ และยังไม่ได้ดูบทพูด"
        elif preview_ok:
            asset_kind = "unconfirmed-still"
            asset_label = "ภาพตัวอย่างจาก thumbnail ที่ชนิดสื่อยังไม่ยืนยัน อาจเป็นคลิป ใช้เป็นภาพนิ่งเท่านั้น"
        else:
            asset_kind = "none"
            asset_label = "ไม่มีภาพครีเอทีฟที่ยืนยันได้ จึงไม่แสดงโลโก้เพจแทนโฆษณา"
        if asset_kind in {"image", "video-still", "unconfirmed-still"} and ad_id not in thumb_ids:
            blob = image_bytes(meta.get("img") or "")
            if not blob:
                raise SystemExit("missing thumb bytes " + ad_id)
            thumb = save_thumb(ad_id, blob)
            thumb_ids.add(ad_id)
        elif asset_kind in {"image", "video-still", "unconfirmed-still"}:
            # later period of an ad already saved
            existing = list(MEDIA.glob(ad_id + ".*"))
            thumb = existing[0].name if existing else None
        ads.append(
            {
                "period": row["period"],
                "book": row["book"],
                "adId": ad_id,
                "adName": name,
                "creatorTag": row["creator_tag"],
                "confidence": row["map_confidence"],
                "spend": num(row["spend"]),
                "revenue": num(row["val"]),
                "impressions": num(row["imp"]),
                "chats": num(row["msg"]),
                "purchases": num(row["pur"]),
                "body": body,
                "bodyKey": body_key(body) if body.strip() else "",
                "ig": meta.get("open_instagram") or "",
                "fb": meta.get("open_facebook_login") or "",
                "adsManager": meta.get("ads_manager_login") or "",
                "thumb": thumb,
                "assetKind": asset_kind,
                "assetLabel": asset_label,
            }
        )

    # Verified non-logo stills live on the creative, including ads outside this chat table.
    for ad_id, meta in media.items():
        name = (meta.get("ad_name") or "")
        if "[Kaoborkwa]" in name or not meta.get("preview_ok"):
            continue
        if ad_id in thumb_ids:
            continue
        blob = image_bytes(meta.get("img") or "")
        if not blob:
            raise SystemExit("missing thumb bytes " + ad_id)
        save_thumb(ad_id, blob)
        thumb_ids.add(ad_id)

    if len(thumb_ids) != 83:
        raise SystemExit(f"expected 83 thumbs, saved {len(thumb_ids)}")

    book_totals = {period: {book: totals() for book in BOOKS} for period in PERIODS}
    all_totals = {period: totals() for period in PERIODS}
    for ad in ads:
        add(book_totals[ad["period"]][ad["book"]], ad)
        add(all_totals[ad["period"]], ad)

    groups = {}
    for ad in ads:
        if not ad["bodyKey"]:
            continue
        group = groups.get(ad["bodyKey"])
        if group is None:
            group = {
                "bodyKey": ad["bodyKey"],
                "book": ad["book"],
                "body": normalize_body(ad["body"]),
                "adIds": set(),
                "periods": {period: totals() for period in PERIODS},
            }
            groups[ad["bodyKey"]] = group
        if group["book"] != ad["book"]:
            raise SystemExit("body key crossed books " + ad["bodyKey"])
        group["adIds"].add(ad["adId"])
        add(group["periods"][ad["period"]], ad)

    messages = []
    for spec in CURATED:
        group = match_group(spec, groups)
        focus = group["periods"][spec["focus"]]
        if focus["n"] < 1 or focus["spend"] <= 0:
            raise SystemExit("empty focus " + spec["id"])
        messages.append(
            {
                "id": spec["id"],
                "book": spec["book"],
                "bodyKey": group["bodyKey"],
                "opening": opening_of(group["body"]),
                "body": group["body"],
                "grouping": "verified-exact",
                "adIds": sorted(group["adIds"]),
                "periods": group["periods"],
                "focus": spec["focus"],
                "lane": spec["lane"],
                "slides": spec["slides"],
                "talk": spec["talk"],
                "nAdsInFocus": focus["n"],
            }
        )

    # Creator evidence, October, messaging only. Tags stay unmerged.
    def by_tag(period, book=None):
        buckets = defaultdict(totals)
        for ad in ads:
            if ad["period"] != period:
                continue
            if book and ad["book"] != book:
                continue
            add(buckets[ad["creatorTag"]], ad)
        return buckets

    mind_oct = []
    for tag, bucket in by_tag("oct", "Mind").items():
        if bucket["spend"] <= 0:
            continue
        value = roas(bucket)
        if value is None or value >= 1:
            raise SystemExit(f"Mind October tag not under 1: {tag} {value}")
        mind_oct.append({"tag": tag, "confidenceNote": "tag จากชื่อแอด", **bucket, "roas": value})
    mind_oct.sort(key=lambda item: item["revenue"], reverse=True)

    central_oct = []
    for tag, bucket in by_tag("oct", "Coworkers").items():
        if not str(tag).startswith("Central"):
            continue
        central_oct.append({"tag": tag, **bucket, "roas": roas(bucket)})
    central_oct.sort(key=lambda item: item["revenue"], reverse=True)
    present_tags = {ad["creatorTag"] for ad in ads}
    for required in ("Central", "Central+Leef", "Central+Park", "Central+Phum"):
        if required not in present_tags:
            raise SystemExit("missing separate tag " + required)
    if len({item["tag"] for item in central_oct}) != len(central_oct):
        raise SystemExit("central tags merged")

    # Cheapest chat among Coworkers October tags with at least 100 chats.
    office = []
    for tag, bucket in by_tag("oct", "Coworkers").items():
        if bucket["chats"] >= 100 and bucket["spend"] > 0:
            office.append({"tag": tag, **bucket, "costPerMsg": bucket["spend"] / bucket["chats"], "roas": roas(bucket)})
    office.sort(key=lambda item: item["costPerMsg"])

    deck = {
        "deckId": "od-howto-keymessage-review-2026-11-08",
        "snapshot": {
            "pulled": "8 พ.ย. 2569 เวลาไทย",
            "frozenThrough": "7 พ.ย. 2569",
            "excludes": "ไม่รวมยอดวันที่ 8 พ.ย. ที่ยังไม่จบวัน",
            "revenue": "รายได้เป็น omni_purchase ที่ Meta นับให้แอด ไม่ใช่ยอดขาย BEP และไม่ใช่ยอด Organic",
            "channel": "เฉพาะแคมเปญแชท",
        },
        "bookTotals": book_totals,
        "allTotals": all_totals,
        "ads": ads,
        "messages": messages,
        "creatorEvidence": {
            "mindOctoberUnderOne": mind_oct,
            "coworkersOctoberCentralSeparate": central_oct,
            "coworkersOctoberCheapestChat": office[0] if office else None,
        },
        "excluded": excluded,
        "thumbCount": len(thumb_ids),
        "adRowCount": len(ads),
    }
    DATA.parent.mkdir(parents=True, exist_ok=True)
    DATA.write_text(json.dumps(deck, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    print("ads", len(ads), "thumbs", len(thumb_ids), "messages", len(messages))
    print("bytes", DATA.stat().st_size)
    for period in PERIODS:
        bits = []
        for book in BOOKS:
            bucket = book_totals[period][book]
            bits.append(f"{book[0]} {round_baht(bucket['spend'])}/{round_baht(bucket['revenue'])} R{roas(bucket):.2f}")
        print(period, " | ".join(bits))
    print("central", [(c["tag"], round_baht(c["spend"]), round(c["roas"], 2), round_baht(c["spend"] / c["chats"]) if c["chats"] else None) for c in central_oct])
    print("cheapest", office[0]["tag"], round(office[0]["costPerMsg"]), round(office[0]["roas"], 2))
    for message in messages:
        focus = message["periods"][message["focus"]]
        print(
            message["id"],
            message["focus"],
            "n",
            focus["n"],
            "sp",
            round_baht(focus["spend"]),
            "R",
            round(roas(focus), 2),
            "chat",
            round_baht(focus["chats"]),
            "pur",
            round_baht(focus["purchases"]),
        )


if __name__ == "__main__":
    main()
