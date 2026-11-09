# creator-review-slides

## Purpose and requirements

Thai Key Message review for four chat-campaign books (Mind, Coworkers, Survival Guide, Trap). Audience is public on the internet: `https://creator-review-slides.opendurian.dev`. The whole site requires an application session. IP addresses and proxy headers are not authentication.

Key Message is the narrative axis. Creator tags are filters only. Slide 12 is a Key Message synthesis, not a creator ranking.

Performance is a frozen Meta snapshot checked 8 Nov 2026 (Asia/Bangkok) and includes spend only through yesterday, 7 Nov 2026. November is 1–7, not a full month. Status checked at 8 Nov 11:39 is account metadata, not performance through 7 Nov. ACTIVE means เปิดใช้งาน, not confirmed delivery.

Chat campaigns only. Revenue is Meta omni_purchase. Ratios use sums of numerators and denominators. Content month comes only from the leading date tag in the ad name and is labeled unverified. It is not the reporting period and not `created_time`. Two ads tagged year 69 stay visible with an unknown content month. Reporting period, content month, and current status are separate filters. Quarantine ad ids `120255364063130260` and `120255499941520260` stay out of totals. Ten Kaoborkwa namecards are not creatives. Stills are not playable video. IG/FB links are unverified and login-required.

Notes are visible on the page, persisted in this project's PostgreSQL, and never public. No Meta token, no KPI database, no new Meta pull.

## What the system has

- Web overview of monthly book totals, a Creator ranking, one-line book tables (nine metrics), and the วิเคราะห์ต่อยอด shortlist. The header is ผลโฆษณารายเล่ม with four destinations: ภาพรวม, รายเล่ม, Creator, and วิเคราะห์ต่อยอด. There is no slide page and no logout button.
- The period control is ถึง 7 พ.ย. 2569. Book choice sits on รายเล่ม and Creator only. Creator ranking defaults to Spend, high to low. Central, Central+Leef, Central+Park, and Central+Phum stay separate. A blank creator tag, including the malformed name on ad 120248465651870260, stays ไม่ทราบ Creator.
- Month-to-month color is off. The source bundle sets mom_eligible false on every book-period, including full months. The published deck does not copy that flag, and the calendar is not treated as permission to compare. Ad rows can still be colored against the same book's own selected-period total. That is not a profit rule. CVR stays the canonical name, with the cue Purchases ÷ Messages (ซื้อ/แชท). Revenue is Meta omni_purchase, not BEP. Attribution window is unknown.
- Same-length comparisons only (October vs September, and 1–7 Nov vs 1–7 Oct). Zero divisors render as a dash. A zero prior base renders “ใหม่/ไม่มีฐาน”. ROAS, cost per message, and CPM are colored only against that book's own selected-period baseline.
- No note footer on the overview, book tables, or slides. One tab, วิเคราะห์ต่อยอด, holds the marketer's own shortlist and analysis notes.
- Choosing a row stores that ad id, book, content month, and the reporting period on screen. It does not change those filters and it does not rank or recommend a message.
- Removing a shortlist row asks for confirmation when an analysis note exists. Older per-slide notes stay in `notes` and can be read from a collapsed archive on the analysis page.
- Session gate on every page and data file. Login and the unconfigured notice are the only anonymous HTML.

Subdomain: `https://creator-review-slides.opendurian.dev`.

## Architecture and stack

Node 22 ESM, `node:http`, no Express. Dockerfile `EXPOSE 8080`. The platform routes that port. No GitLab CI. A normal push to company GitLab `main` deploys. A GitHub pull request does not.

No calls to other platform apps.

## Data

Pattern A. Local experiments use this project's **test** database only. The deployed app uses this project's **prod** database via `DATABASE_URL`, which the owner sets in the platform dashboard. Never the KPI database.

Tables:

- `notes`, `note_revisions` — older per-slide notes. Still stored. Not shown on every page.
- `analysis_picks`, `analysis_revisions` — shortlist and analysis notes, keyed by reporting period plus ad id.
- `app_runtime` — `password_hash` (scrypt) and `session_secret`. Created on first boot. Not exposed by any API.

The deck and stills are static files under `public/`. Client IP for rate limits is `CF-Connecting-IP` only. If that header is absent the IP is unknown. Writes then rate-limit by session. `X-Forwarded-For` is not read.

## Key decisions

- Owner secrets, once: `DATABASE_URL` (already set) and `BOOTSTRAP_PASSWORD` (still required, at least 10 characters). The server hashes the bootstrap password and generates the session secret, then stores both in `app_runtime`. It does not log them. A later change to `BOOTSTRAP_PASSWORD` does not reset an existing pair. The owner can delete `BOOTSTRAP_PASSWORD` after the first successful boot.
- `EDITOR_PASSWORD_HASH` and `SESSION_SECRET` remain an optional pair for tests and advanced override. Setting only one fails closed. `TRUST_PROXY` is not required: the browser URL is always `https://<slug>.opendurian.dev`, so cookies are `Secure; HttpOnly; SameSite=Lax` for that host and when `CF-Connecting-IP` is present.
- Cookies are refused on plain production HTTP that is not this platform host.
- Do not copy a database credential file into `set_project_secret`.

## Session trail

- 2026-11-08: Key Message deck, yesterday cutoff, one-row comparison, conditional labels, inline notes.
- 2026-11-08: Whole public app is session-gated. First-boot auth is one owner bootstrap password plus server-generated scrypt hash and session secret in this project's database. `PROJECT_SUMMARY.md` added for deploy. GitHub remains the working source; company GitLab `main` is the only deploy trigger.
- 2026-11-08 12:10 Asia/Bangkok: owner replaced notes on every page with one วิเคราะห์ต่อยอด tab. Shortlist and analysis notes persist in this project's Postgres. Old slide notes are kept.
- 2026-11-08 12:35: book-tab pagination crashed because replacing the view dropped `pages`. The page map is kept. Clicking next on ออฟฟิศ no longer throws. No database reset.
- 2026-11-08: fresh open is the 16:9 November 1–7 presentation. Visible metric names are Spend, Revenue, ROAS, Messages, Cost per Message, CPM, Purchases, CVR, AOV. CVR is Purchases ÷ Messages, explained in the method note. One control bar in the presentation. Book totals are the baseline and are not ranked against each other.
- 2026-11-08 16:10 Asia/Bangkok: the monthly overview is one table per book. Columns are May through October plus 1–7 November. Rows are Spend, Revenue, ROAS, Messages, Cost per Message, CPM, Purchases, CVR, and AOV. Figures are the scoped set “เฉพาะรายการที่ยืนยันเล่มได้” from campaigns whose names contain [FB Msg] or [MSG]. Empty book-months stay blank. November is not compared with a full month. September and October changes versus the previous website are a mapping correction, not a Meta restatement. Notes already saved stay in this project's database, including ads that are now outside the totals.
- 2026-11-08 17:58 Asia/Bangkok: a book page lists every ad in the selected month. There is no six-row pager. Ads that were ACTIVE in the 8 Nov 11:39 snapshot are listed first, and that status is not treated as confirmed delivery. Video frames are not invented. The preview set now has 72 validated local WebP files: 11 video covers and 61 ad images. November shows 15 of 130; the other 115 stay labeled missing. No new video file was read.
- 2026-11-08 19:55 Asia/Bangkok: the book table is one line per ad. Previews and account status are not shown there. Metric headers sort the full month, and a min/max filter does not change the book total.
- 2026-11-09: Creator ranking uses the stored creator tag. Spend is the default order. The source field mom_eligible is false for every book-period, so full months are not colored against the previous month. Charts keep the verified totals. The deck file is unchanged.
