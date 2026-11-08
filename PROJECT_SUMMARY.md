# creator-review-slides

## Purpose and requirements

Thai Key Message review for four chat-campaign books (Mind, Coworkers, Survival Guide, Trap). Audience is public on the internet: `https://creator-review-slides.opendurian.dev`. The whole site requires an application session. IP addresses and proxy headers are not authentication.

Key Message is the narrative axis. Creator tags are filters only. Slide 12 is a Key Message synthesis, not a creator ranking.

Performance is a frozen Meta snapshot checked 8 Nov 2026 (Asia/Bangkok) and includes spend only through yesterday, 7 Nov 2026. November is 1–7, not a full month. Status checked at 8 Nov 11:39 is account metadata, not performance through 7 Nov. ACTIVE means เปิดใช้งาน, not confirmed delivery.

Chat campaigns only. Revenue is Meta omni_purchase. Ratios use sums of numerators and denominators. Content month comes only from the leading date tag in the ad name and is labeled unverified. It is not the reporting period and not `created_time`. Two ads tagged year 69 stay visible with an unknown content month. Reporting period, content month, and current status are separate filters. Quarantine ad ids `120255364063130260` and `120255499941520260` stay out of totals. Ten Kaoborkwa namecards are not creatives. Stills are not playable video. IG/FB links are unverified and login-required.

Notes are visible on the page, persisted in this project's PostgreSQL, and never public. No Meta token, no KPI database, no new Meta pull.

## What the system has

- Web overview of all four books, one-row comparison tables (nine metrics), and a 12-slide presentation.
- Compact sticky toolbar: reporting period plus “ข้อมูลถึง 7 พ.ย. 2569”. Content month, status, creator, and sort sit in a details control. Status timestamp appears only when status is relevant.
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
