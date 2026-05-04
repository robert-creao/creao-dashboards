# Daily Auto-Release Automation

## How it works

1. **`period_config.json`** at the repo root defines the *active* payout period.
2. **`.github/workflows/daily-release.yml`** runs every day at 13:00 UTC (9 AM ET).
3. The workflow runs **`scripts/daily_release.py`**, which:
   - Reads the active period from `period_config.json`
   - Generates daily rows for the period using a healthy profit ramp (`$874` partner payout / period by default)
   - Trims the visible window to "today" — so on day 3 of a 15-day period only days 1–3 are visible
   - Updates each client's `daily_data.json` and `config.js`
4. The workflow commits and pushes any changes — GitHub Pages auto-redeploys `app.creao.co` within ~30 seconds.

## Release modes

| `release_mode` | Behavior |
|----------------|----------|
| `daily` | Extend the visible day each morning until period ends |
| `backfilled` | Full period already shown — workflow no-ops |

## Common tasks

### Roll over to the next biweekly cycle

```bash
python scripts/start_next_period.py \
  --num 8 \
  --start 2026-05-16 --end 2026-05-30 \
  --label "May 16-30" \
  --share 874
```

Then commit + push `period_config.json`. The Action takes over the next morning at 9 AM ET.

### Trigger a release manually (don't wait for the cron)

GitHub → Actions tab → "Daily dashboard release" → "Run workflow"

### Backfill the current period in full

Edit `period_config.json` and set `"release_mode": "backfilled"`, commit + push, then run `daily_release.py` once with that mode toggled to `daily` first to populate, then back to `backfilled` to lock.

(Or just ask the agent to do it.)

## What the Action does NOT do

- **It does not update Google Sheets.** Sheet writes are handled separately by the agent (which has the Google Sheets connector). The dashboards on `app.creao.co` are powered by `config.js` (data baked into the site), so they update independently.
- **It does not regenerate prior periods.** Only the `active_period` is touched. P1–P6 data is preserved in `daily_data.json`.

## Cron timing

`0 13 * * *` = 13:00 UTC = 9:00 AM EDT (Mar–Nov) / 8:00 AM EST (Nov–Mar).

GitHub schedules can drift up to ~30 minutes during high-load periods. Don't depend on minute-level precision.
