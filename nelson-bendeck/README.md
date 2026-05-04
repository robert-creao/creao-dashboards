# Creao · Profit Distribution Dashboard

A Creao-branded dashboard that reads from a CSV file and reveals data day-by-day. Designed for static hosting on **Cloudflare Pages** (recommended) or **Cloudflare Workers**.

## What it does

- Loads `data.csv` at runtime (no build step, no rebuild on data change)
- Shows KPIs, a line chart, an area chart of cumulative payouts, and a day-by-day table
- **Day-by-day reveal:** by default only shows rows whose `Date` is on or before today, so the customer's view fills in progressively
- Period filter (Period 1 / Period 2 / All) and an "as-of" date picker
- No customer name anywhere — the data file has no name column

## Files

- `index.html` — page markup
- `style.css` — Creao branding (dark `#1E1B2E`, teal `#20808D`, gold `#FFC553`)
- `app.js` — data loading, filtering, charts (Chart.js via CDN)
- `data.csv` — your data (replace this when you have new numbers; nothing else needs to change)
- `_headers` — Cloudflare Pages cache headers
- `wrangler.toml` — optional Workers config

## CSV format

Columns (header row required):

```
Date,Revenue,Adspend,Cost of Goods,Processing Fees,Net Profit,Partner Share Cumulative,Day Number,Period Target Payout,Period #,Period Label
```

- `Date` must be ISO `YYYY-MM-DD`
- `Period #` is `1`, `2`, etc.
- `Period Label` may contain commas — quote with `"..."` (e.g. `"April 1–15, 2026"`)
- All currency fields are plain numbers (no `$`, no commas)

To update the dashboard you only edit `data.csv` and re-deploy. Or: keep `data.csv` in any always-on location and replace it without redeploying.

## Deploy to Cloudflare Pages (easiest)

### Option A — Direct upload (60 seconds, no Git)
1. Go to https://dash.cloudflare.com → Workers & Pages → Create → Pages → Upload assets
2. Drag this entire folder
3. Click Deploy. Done — you get a `creao-dashboard.pages.dev` URL.

### Option B — Wrangler CLI
```bash
npm install -g wrangler
cd creao-dashboard
wrangler pages deploy .
```

### Option C — Git (recommended for ongoing updates)
1. Push this folder to a GitHub/GitLab repo
2. Cloudflare Pages → Create → Connect to Git → pick the repo
3. Build settings: **Build command: (leave empty)** · **Output directory: `/`**
4. Every push redeploys

## Updating data

Edit `data.csv` and re-deploy. The dashboard auto-refreshes with `cache: no-store`.

If you want **automatic** updates from your Google Sheet, you can:
- Publish the Sheet as CSV (File → Share → Publish to web → CSV) and change `fetch('./data.csv', ...)` in `app.js` to point at the published URL
- Or have Computer regenerate `data.csv` on a schedule

## Customizing

- **Brand colors:** `:root { --teal, --gold, --ink, ... }` in `style.css`
- **As-of date:** the date picker controls how far the reveal goes — clear it or click "Reset to today"
- **Period filter:** auto-builds from unique `Period #` values in the CSV

## Tested with

29 rows across 2 periods (Apr 1–15, 2026 totaling $1,527.41 partner payout; May 18–31, 2026 totaling $1,421.34).
