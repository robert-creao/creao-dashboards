"""Roll the active period forward in period_config.json.

Usage:
    python scripts/start_next_period.py --num 8 --start 2026-05-16 --end 2026-05-30 \\
        --label "May 16-30" --share 874

Sets release_mode to 'daily' so the GitHub Action begins extending the
visible window each morning.
"""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / "period_config.json"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--num", type=int, required=True, help="Period number, e.g. 8")
    p.add_argument("--start", required=True, help="Start date YYYY-MM-DD")
    p.add_argument("--end", required=True, help="End date YYYY-MM-DD")
    p.add_argument("--label", required=True, help='Display label, e.g. "May 16-30"')
    p.add_argument("--share", type=float, required=True, help="Partner payout per client (USD)")
    p.add_argument("--mode", default="daily", choices=["daily", "backfilled"])
    args = p.parse_args()

    cfg = json.loads(CONFIG.read_text())
    cfg["active_period"] = {
        "num": args.num,
        "label": args.label,
        "start_date": args.start,
        "end_date": args.end,
        "partner_share": round(args.share, 2),
        "weights_profile": "healthy",
        "release_mode": args.mode,
    }
    CONFIG.write_text(json.dumps(cfg, indent=2, ensure_ascii=False) + "\n")
    print(f"Active period set to P{args.num} ({args.label}), {args.start} \u2192 {args.end}, "
          f"${args.share:.2f}/client, mode={args.mode}")


if __name__ == "__main__":
    main()
