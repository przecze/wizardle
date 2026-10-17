"""
One-off: freeze every puzzle from EARLIEST_PUZZLE_DATE through tomorrow with
the currently deployed chapter TSVs, and import the AI fragment contexts from
the old per-date file cache. Safe to re-run — already-stored dates are kept.

Run by the Ansible deploy right after the backend starts; by hand:
  docker compose exec backend python backfill.py
"""
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import db
from main import EARLIEST_PUZZLE_DATE, _get_puzzle, _today_str

LEGACY_FRAGMENT_CONTEXT_CACHE_DIR = Path("/fragment_context_cache")

# FRAGMENT_CONTEXT_MODEL over time, from the commits that changed it. The old
# cache never recorded which model wrote a note, so it's inferred from the
# file's mtime (= generation time). Prod only switched model at the next
# deploy after each commit, so notes written shortly after a switch are
# flagged as uncertain.
MODEL_HISTORY = [
    (datetime.fromisoformat("2026-03-16T18:02:39+01:00"), "deepseek/deepseek-v3.2"),   # ad0f4d0
    (datetime.fromisoformat("2026-07-10T23:10:41+02:00"), "google/gemini-3.5-flash"),  # 1d706d3
    (datetime.fromisoformat("2026-07-25T14:31:34+02:00"), "google/gemini-3.6-flash"),  # d053973
]
UNCERTAIN_AFTER_SWITCH = timedelta(hours=48)


def _infer_model(written: datetime) -> tuple[str, bool]:
    """(model active at `written`, whether `written` is close enough after a switch to be doubtful)."""
    model = MODEL_HISTORY[0][1]
    uncertain = False
    for switched_at, switched_to in MODEL_HISTORY[1:]:
        if written >= switched_at:
            model = switched_to
            uncertain = written - switched_at < UNCERTAIN_AFTER_SWITCH
    return model, uncertain


def main() -> None:
    day = date.fromisoformat(EARLIEST_PUZZLE_DATE)
    last = date.fromisoformat(_today_str()) + timedelta(days=1)
    frozen = 0
    while day <= last:
        _get_puzzle(day.isoformat())
        frozen += 1
        day += timedelta(days=1)
    print(f"Puzzles frozen through {last}: {frozen}")

    imported = 0
    for cache_file in sorted(LEGACY_FRAGMENT_CONTEXT_CACHE_DIR.glob("*.txt")):
        date_str = cache_file.stem
        if db.get_puzzle(date_str) is None:
            print(f"  skipping {cache_file.name}: no frozen puzzle for that date")
            continue
        written = datetime.fromtimestamp(cache_file.stat().st_mtime, timezone.utc)
        model, uncertain = _infer_model(written)
        if uncertain:
            print(f"  {date_str}: written {written:%Y-%m-%d %H:%M}Z, soon after a model switch — "
                  f"recorded as {model}, may have been the previous model")
        db.save_fragment_context(date_str, cache_file.read_text(encoding="utf-8"), model,
                                 written.isoformat(timespec="seconds"))
        imported += 1
    print(f"Fragment contexts imported: {imported}")


if __name__ == "__main__":
    main()
