"""Daily auto-release for the current period.

Runs from the repo root via GitHub Actions. Reads `period_config.json`
to know what period is active, generates today's data through day N,
and rewrites each client's config.js so the dashboards reflect the
new visible window.

Period config schema (period_config.json at repo root):
{
  "active_period": {
    "num": 7,
    "label": "May 1\u201315",
    "start_date": "2026-05-01",
    "end_date": "2026-05-15",
    "partner_share": 874.00,
    "weights_profile": "healthy"
  },
  "clients": {
    "brian-jupina": {"name": "Brian Jupina", "sheet_id": "..."},
    "nelson-bendeck": {"name": "Nelson Bendeck", "sheet_id": "..."},
    "jim-erwin": {"name": "Jim Erwin", "sheet_id": "..."}
  }
}
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "period_config.json"
CLIENTS_DIR = ROOT  # client folders are subfolders of repo root

# Smooth "healthy" wave for 15 days
WEIGHTS_HEALTHY_15 = [
    0.060, 0.062, 0.064, 0.066, 0.068,
    0.070, 0.067, 0.065, 0.067, 0.069,
    0.071, 0.068, 0.066, 0.067, 0.070,
]
MARGIN = 0.1139


def load_config():
    return json.loads(CONFIG_PATH.read_text())


def days_visible(start: date, end: date, today: date) -> int:
    """How many days of the period to show, given today's date."""
    period_len = (end - start).days + 1
    if today < start:
        return 0
    if today >= end:
        return period_len
    return (today - start).days + 1


def build_full_period(start: date, partner_share: float, period_num: int, period_label: str):
    total_np = round(partner_share * 2, 2)
    period_len = len(WEIGHTS_HEALTHY_15)
    days = [start + timedelta(days=i) for i in range(period_len)]

    np_alloc = [round(total_np * w, 2) for w in WEIGHTS_HEALTHY_15]
    diff = round(total_np - sum(np_alloc), 2)
    np_alloc[-1] = round(np_alloc[-1] + diff, 2)

    rows = []
    for d, np_val in zip(days, np_alloc):
        revenue = round(np_val / MARGIN, 2)
        adspend = round(revenue * 0.4847, 2)
        cog = round(revenue * 0.35, 2)
        fees = round(revenue * 0.0515, 2)
        np_calc = round(revenue - adspend - cog - fees, 2)
        rows.append({
            "date": d.isoformat(),
            "revenue": revenue,
            "adspend": adspend,
            "cog": cog,
            "fees": fees,
            "net_profit": np_calc,
            "period_num": period_num,
            "period_label": period_label,
            "partner_share_target": partner_share,
        })

    np_total_actual = round(sum(r["net_profit"] for r in rows), 2)
    delta = round(total_np - np_total_actual, 2)
    if abs(delta) > 0.005:
        rows[-1]["net_profit"] = round(rows[-1]["net_profit"] + delta, 2)

    np_total_final = sum(r["net_profit"] for r in rows)
    cum_np = 0.0
    for i, r in enumerate(rows):
        r["day_num"] = i + 1
        cum_np += r["net_profit"]
        r["cum_payout"] = round(partner_share * (cum_np / np_total_final), 2)

    return rows


def update_client(slug: str, client_meta: dict, period: dict, n_visible: int):
    full_rows = build_full_period(
        date.fromisoformat(period["start_date"]),
        period["partner_share"],
        period["num"],
        period["label"],
    )
    visible = full_rows[:n_visible]

    # Load existing daily_data.json (so we keep prior periods 1-6)
    client_dir = CLIENTS_DIR / slug
    daily_path = client_dir / "daily_data.json"
    config_path = client_dir / "config.js"

    existing = json.loads(daily_path.read_text()) if daily_path.exists() else []
    # Strip any rows for this period_num then re-append visible
    pruned = [r for r in existing if r.get("period_num") != period["num"]]
    combined = pruned + visible
    combined.sort(key=lambda r: r["date"])
    daily_path.write_text(json.dumps(combined, indent=2))

    # Update config.js — only DASHBOARD_DATA changes; keep DASHBOARD_CONFIG intact
    if not config_path.exists():
        print(f"  [skip] {slug}: no config.js yet", file=sys.stderr)
        return 0
    text = config_path.read_text()
    # Replace the DASHBOARD_DATA assignment
    marker = "window.DASHBOARD_DATA = "
    idx = text.find(marker)
    if idx < 0:
        print(f"  [warn] {slug}: DASHBOARD_DATA marker not found", file=sys.stderr)
        return 0
    new_text = (
        text[:idx]
        + marker
        + json.dumps(combined, indent=2)
        + ";\n"
    )
    config_path.write_text(new_text)
    return len(visible)


def main():
    cfg = load_config()
    period = cfg["active_period"]
    today = date.today()
    start = date.fromisoformat(period["start_date"])
    end = date.fromisoformat(period["end_date"])
    n_visible = days_visible(start, end, today)

    print(f"== Daily release {today.isoformat()} ==")
    print(f"   Active period: {period['label']} (P{period['num']})")
    print(f"   Release mode: {period.get('release_mode', 'daily')}")
    print(f"   Visible days: {n_visible} / {(end - start).days + 1}")

    if period.get("release_mode") == "backfilled":
        print("   Period is in backfilled mode — no daily updates needed. Exiting.")
        return

    if n_visible == 0:
        print("   No days to release yet (period hasn't started). Exiting.")
        return

    for slug, meta in cfg["clients"].items():
        n = update_client(slug, meta, period, n_visible)
        print(f"   {slug}: wrote {n} rows for P{period['num']}")

    print("== Done ==")


if __name__ == "__main__":
    main()
