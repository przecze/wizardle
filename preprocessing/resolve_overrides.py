"""
Resolve puzzle position overrides for the last 7 days.

For each date, reproduce the seeding logic against chapters.bak to find the
exact token at the puzzle position, then locate that same context in the new
chapters dir and emit a daily_puzzle_position_overrides.json.
"""
import hashlib
import json
from pathlib import Path
from datetime import date, timedelta

REPO = Path(__file__).parent.parent
OLD_DIR = REPO / "preprocessing" / "chapters.bak"
NEW_DIR = REPO / "preprocessing" / "chapters"
OUT_FILE = REPO / "backend" / "daily_puzzle_position_overrides.json"

DASH_TOKENS = {"—", "..."}


def date_seed(date_str: str) -> int:
    h = hashlib.sha256(date_str.encode()).digest()
    return int.from_bytes(h[:8], "big")


def load_tsv(path: Path) -> list[tuple[int, str]]:
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        flag_str, token = line.split("\t", 1)
        rows.append((int(flag_str), token))
    return rows


def all_chapter_files(d: Path) -> list[Path]:
    return sorted(d.glob("book*_chap*.tsv"))


def _non_dash(rows) -> list[tuple[int, str]]:
    return [(i, tok) for i, (_, tok) in enumerate(rows) if tok not in DASH_TOKENS]


def tokens_compatible(old_tok: str, new_tok: str) -> bool:
    """True if old and new token are compatible (exact match or one starts with the other)."""
    return old_tok == new_tok or new_tok.startswith(old_tok) or old_tok.startswith(new_tok)


def find_context_in_new(old_rows, old_pos, new_rows, window=8, min_window=4):
    """
    Find the position in new_rows corresponding to old_pos in old_rows.

    Strategy: extract window of non-dash tokens starting at old_pos from old;
    search new file for matching subsequence using compatible token comparison
    (handles cases where tokenizer merged adjacent tokens).
    """
    old_nd = _non_dash(old_rows)
    new_nd = _non_dash(new_rows)

    # Find nd index of old_pos
    old_nd_start = next((ni for ni, (ri, _) in enumerate(old_nd) if ri >= old_pos), None)
    if old_nd_start is None:
        return None

    # Extract anchor context (prefer tokens AFTER the puzzle pos to avoid boundary issues)
    # Use tokens from old_nd_start to old_nd_start+window
    old_ctx = [tok for _, tok in old_nd[old_nd_start: old_nd_start + window]]

    # Try decreasing window sizes
    for w in range(len(old_ctx), min_window - 1, -1):
        sub = old_ctx[:w]
        for start in range(len(new_nd) - w + 1):
            if all(tokens_compatible(sub[j], new_nd[start + j][1]) for j in range(w)):
                return new_nd[start][0]

    return None


today = date(2026, 3, 18)
dates = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]

old_files = all_chapter_files(OLD_DIR)
new_files = all_chapter_files(NEW_DIR)

print(f"Old chapter files: {len(old_files)}")
print(f"New chapter files: {len(new_files)}")
print()

overrides = {}
errors = []

for date_str in dates:
    seed = date_seed(date_str)

    chosen_old = old_files[seed % len(old_files)]
    inner_seed = seed // len(old_files)

    old_rows = load_tsv(chosen_old)
    valid_positions = [i for i, (flag, _) in enumerate(old_rows) if flag == 1]

    if not valid_positions:
        print(f"  ERROR: no valid positions in {chosen_old.name}")
        errors.append(date_str)
        continue

    old_pos = valid_positions[inner_seed % len(valid_positions)]
    old_token = old_rows[old_pos][1]

    word2 = None
    for j in range(old_pos + 1, len(old_rows)):
        if old_rows[j][1] not in DASH_TOKENS:
            word2 = old_rows[j][1]
            break

    new_file = NEW_DIR / chosen_old.name
    if not new_file.exists():
        print(f"  ERROR: {new_file} not found in new dir")
        errors.append(date_str)
        continue

    new_rows = load_tsv(new_file)

    new_pos = find_context_in_new(old_rows, old_pos, new_rows)

    if new_pos is None:
        print(f"{date_str}: FAILED to locate token in new file {chosen_old.name}")
        print(f"  old token='{old_token}', old_pos={old_pos}")
        errors.append(date_str)
        continue

    new_token = new_rows[new_pos][1]
    is_valid = new_rows[new_pos][0] == 1

    status = "" if is_valid else " [WARNING: new pos not valid_start=1!]"
    print(f"{date_str}: {chosen_old.name}")
    print(f"  old pos={old_pos} token='{old_token}' word2='{word2}'")
    print(f"  new pos={new_pos} token='{new_token}' valid_start={is_valid}{status}")

    overrides[date_str] = {
        "chapter_file": chosen_old.name,
        "start_pos": new_pos,
    }

print()
if errors:
    print(f"ERRORS for dates: {errors}")

print(f"Writing {OUT_FILE}")
with open(OUT_FILE, "w", encoding="utf-8") as f:
    json.dump(overrides, f, indent=2)
    f.write("\n")

print("Done.")
print(json.dumps(overrides, indent=2))
