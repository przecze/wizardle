#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Wizardle preprocessing pipeline (all-in-one).

Reads harrypotter.txt, parses books/chapters with OCR fixes,
tokenizes, computes bigram validity, and writes one TSV per chapter to
preprocessing/chapters/.

TSV format — tab-separated, no header:
  valid_start<TAB>token

  valid_start = 1 if (this token + next non-dash token) forms a valid
                opener bigram (unique across entire series AND ≥15 tokens
                from either chapter boundary); 0 otherwise.

Dash/ellipsis tokens (-, --, —, ...) are never valid_start=1.

Run with:  uv run preprocessing/build_chapters.py
"""

import re
import json
import sys
import collections
from pathlib import Path

# ── Paths ──────────────────────────────────────────────────────────────────────
INPUT_PATH         = Path(__file__).parent.parent / "harrypotter.txt"
OUTPUT_DIR         = Path(__file__).parent / "chapters"
CHAPTER_NAMES_PATH = Path(__file__).parent / "chapter_names.json"

BOUNDARY_MARGIN = 15  # tokens from chapter boundary

# ── Book / chapter header constants (from convert_txt.py) ─────────────────────
BOOK_NAMES = [
    "Book 1: Philosopher's Stone",
    "Book 2: Chamber of Secrets",
    "Book 3: Prisoner of Azkaban",
    "Book 4: Goblet of Fire",
    "Book 5: Order of the Phoenix",
    "Book 6: Half Blood Prince",
    "Book 7: Deathly Hallows",
]

_ORDINAL_LIST = [
    'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN',
    'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN',
    'EIGHTEEN', 'NINETEEN', 'TWENTY', 'TWENTY-ONE', 'TWENTY-TWO', 'TWENTY-THREE',
    'TWENTY-FOUR', 'TWENTY-FIVE', 'TWENTY-SIX', 'TWENTY-SEVEN', 'TWENTY-EIGHT',
    'TWENTY-NINE', 'THIRTY', 'THIRTY-ONE', 'THIRTY-TWO', 'THIRTY-THREE', 'THIRTY-FOUR',
    'THIRTY-FIVE', 'THIRTY-SIX', 'THIRTY-SEVEN', 'THIRTY-EIGHT',
]
ORDINAL_WORDS       = set(_ORDINAL_LIST)
CHAPTER_NUMBER_MAP  = {word: i + 1 for i, word in enumerate(_ORDINAL_LIST)}

# Chapters where the first letter is a genuine standalone word, not a drop-cap.
SKIP_FIX_TITLES: set[str] = {
    "THE GOBLET OF FIRE",  # Book 4 ch-16: starts with "I don't"
}


# ── TXT parsing helpers (from convert_txt.py) ─────────────────────────────────

def parse_chapter_header(line: str) -> int | None:
    m = re.match(r'^CHAPTER\s+(.+)$', line)
    if m:
        return CHAPTER_NUMBER_MAP.get(m.group(1).strip())
    return None


def is_toc_line(line: str) -> bool:
    first_word = line.split()[0] if line.split() else ''
    return first_word in ORDINAL_WORDS or line == 'CONTENTS'


def fix_split_letter(line: str, chapter_title: str) -> str:
    """Merge OCR drop-cap artifact: 'M r. and Mrs.' -> 'Mr. and Mrs.'"""
    if chapter_title in SKIP_FIX_TITLES:
        return line
    m = re.match(r'^([A-Z]) ([A-Za-z\'])', line)
    if m:
        tokens = line.split()
        word1 = tokens[0]
        word2 = tokens[1] if len(tokens) > 1 else ''
        merged = word1 + word2
        return merged + line[len(word1) + 1 + len(word2):]
    return line


# ── Tokenizer (from preprocess.py) ────────────────────────────────────────────

DASH_TOKENS  = {"—", "..."}   # standalone tokens skipped in bigrams
ELLIPSIS     = "..."
PREFIX_CHARS = set("`([\u201c")
SUFFIX_CHARS = set(",;.?!:)]\u201d\u00a8\u2019\u0027")
_DASH_RE     = re.compile(r'(\u2014)')  # only split on em-dash; hyphens stay in word


def _is_period_only(t: str) -> bool:
    return bool(t) and all(c == '.' for c in t)


def split_chunk(chunk: str) -> list[str]:
    if not chunk:
        return []

    prefix: list[str] = []
    i = 0
    while i < len(chunk) and chunk[i] in PREFIX_CHARS:
        prefix.append(chunk[i])
        i += 1

    suffix: list[str] = []
    j = len(chunk) - 1
    while j >= i and chunk[j] in SUFFIX_CHARS:
        suffix.append(chunk[j])
        j -= 1
    suffix.reverse()

    body = chunk[i:j + 1]
    if not body:
        return [c for c in prefix + suffix if c]

    body_parts = _DASH_RE.split(body)

    result: list[str] = []
    for k, part in enumerate(body_parts):
        if not part:
            continue
        if _DASH_RE.fullmatch(part):
            result.append(part)
        else:
            token = ("".join(prefix) + part) if k == 0 else part
            if k == len(body_parts) - 1:
                token = token + "".join(suffix)
            result.append(token)

    if all(_DASH_RE.fullmatch(p) or not p for p in body_parts):
        if prefix:
            result = ["".join(prefix)] + result
        if suffix:
            result = result + ["".join(suffix)]

    return [t for t in result if t]


def tokenize_text(text: str) -> list[str]:
    raw = text.split()
    tokens: list[str] = []
    for chunk in raw:
        chunk = chunk.replace('\u2026', ELLIPSIS)
        tokens.extend(split_chunk(chunk))

    # Collapse period runs and merge standalone "--" onto preceding token
    merged: list[str] = []
    for tok in tokens:
        if _is_period_only(tok):
            if merged and _is_period_only(merged[-1]):
                merged[-1] = ELLIPSIS
            else:
                merged.append(ELLIPSIS)
        elif tok == "--" and merged:
            merged[-1] = merged[-1] + "--"
        else:
            merged.append(tok)
    return merged


# ── TXT → chapters ─────────────────────────────────────────────────────────────

def load_chapter_names() -> dict[tuple[str, int], str]:
    if not CHAPTER_NAMES_PATH.exists():
        return {}
    with open(CHAPTER_NAMES_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    return {(book, int(chap)): name for book, chapters in raw.items()
            for chap, name in chapters.items()}


def parse_txt(path: Path) -> list[dict]:
    """
    Parse harrypotter.txt into a list of chapter dicts:
      {book_name, book_num, chapter_num, chapter_title, tokens: list[str]}
    """
    CHAPTER_NAMES = load_chapter_names()

    lines = path.read_text(encoding='latin-1').splitlines()

    book_idx       = -1
    chapter_num: int | None = None
    chapter_title  = ''
    skip_title_lines = 0
    is_first_content = False
    current_lines: list[str] = []
    chapters: list[dict] = []

    def flush() -> None:
        if book_idx >= 0 and chapter_num is not None and current_lines:
            text = ' '.join(current_lines)
            tokens = tokenize_text(text)
            # Canonical name wins; fall back to txt title
            canonical = CHAPTER_NAMES.get((BOOK_NAMES[book_idx], chapter_num))
            name = canonical if canonical else chapter_title
            chapters.append({
                "book_name":     BOOK_NAMES[book_idx],
                "book_num":      book_idx + 1,
                "chapter_num":   chapter_num,
                "chapter_title": name,
                "tokens":        tokens,
            })

    for raw_line in lines:
        line = raw_line.lstrip('\x0c').strip()
        if not line:
            continue

        chap_num = parse_chapter_header(line)
        if chap_num is not None:
            flush()
            current_lines = []
            if chap_num == 1:
                book_idx += 1
                if book_idx >= len(BOOK_NAMES):
                    print("ERROR: more books than expected", file=sys.stderr)
                    break
            chapter_num      = chap_num
            chapter_title    = ''
            skip_title_lines = 1
            is_first_content = True
            continue

        # Epilogue of Book 7
        if line == 'NINETEEN YEARS LATER' and book_idx == 6 and chapter_num == 36:
            flush()
            current_lines    = []
            chapter_num      = 37
            chapter_title    = 'NINETEEN YEARS LATER'
            skip_title_lines = 2
            is_first_content = True
            continue

        if book_idx < 0 or chapter_num is None:
            continue

        if skip_title_lines > 0:
            if skip_title_lines == 1:
                chapter_title = line
            skip_title_lines -= 1
            continue

        if is_toc_line(line):
            continue

        if is_first_content:
            line = fix_split_letter(line, chapter_title)
            is_first_content = False

        current_lines.append(line)

    flush()
    return chapters


# ── Bigram validity ────────────────────────────────────────────────────────────

def non_dash_pairs(tokens: list[str]) -> list[tuple[int, int]]:
    """
    Return list of (i, j) where tokens[i] and tokens[j] are adjacent
    non-dash tokens (only dash/ellipsis tokens may appear between them).
    """
    nd_indices = [i for i, t in enumerate(tokens) if t not in DASH_TOKENS]
    pairs = []
    for k in range(len(nd_indices) - 1):
        i, j = nd_indices[k], nd_indices[k + 1]
        between = tokens[i + 1:j]
        if all(t in DASH_TOKENS for t in between):
            pairs.append((i, j))
    return pairs


def compute_valid_starts(chapters: list[dict]) -> list[set[int]]:
    """
    For each chapter (by index in `chapters`), return the set of token
    positions that are valid_start=1.

    A bigram at position i is valid if:
      1. The bigram string appears exactly once across all chapters.
      2. i >= BOUNDARY_MARGIN and i <= len(tokens) - BOUNDARY_MARGIN - 1.
    """
    # Step 1: count all bigrams across all chapters
    bigram_counter: collections.Counter = collections.Counter()
    for ch in chapters:
        tokens = ch["tokens"]
        for i, j in non_dash_pairs(tokens):
            bigram = f"{tokens[i]} {tokens[j]}"
            bigram_counter[bigram] += 1

    unique_bigrams = {b for b, c in bigram_counter.items() if c == 1}

    # Step 2: for each chapter, find valid start positions
    valid_sets: list[set[int]] = []
    for ch in chapters:
        tokens  = ch["tokens"]
        n       = len(tokens)
        valid_p: set[int] = set()
        for i, j in non_dash_pairs(tokens):
            bigram = f"{tokens[i]} {tokens[j]}"
            if bigram in unique_bigrams:
                if i >= BOUNDARY_MARGIN and i <= n - BOUNDARY_MARGIN - 1:
                    valid_p.add(i)
        valid_sets.append(valid_p)

    return valid_sets


# ── Output ─────────────────────────────────────────────────────────────────────

def write_chapter_tsv(ch: dict, valid_positions: set[int], out_dir: Path) -> Path:
    fname = out_dir / f"book{ch['book_num']}_chap{ch['chapter_num']:02d}.tsv"
    lines = []
    for pos, tok in enumerate(ch["tokens"]):
        flag = 1 if pos in valid_positions else 0
        lines.append(f"{flag}\t{tok}")
    fname.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return fname


# ── Main ───────────────────────────────────────────────────────────────────────

def main() -> None:
    if not INPUT_PATH.exists():
        print(f"ERROR: input not found: {INPUT_PATH}", file=sys.stderr)
        sys.exit(1)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Parsing {INPUT_PATH} ...", flush=True)
    chapters = parse_txt(INPUT_PATH)
    print(f"  {len(chapters)} chapters across {chapters[-1]['book_num']} books")

    total_tokens = sum(len(ch["tokens"]) for ch in chapters)
    print(f"  {total_tokens:,} tokens total")

    print("Computing bigram validity ...", flush=True)
    valid_sets = compute_valid_starts(chapters)

    total_valid = sum(len(v) for v in valid_sets)
    print(f"  {total_valid:,} valid opener positions")

    print(f"Writing TSVs to {OUTPUT_DIR}/ ...", flush=True)
    for ch, valid_pos in zip(chapters, valid_sets):
        write_chapter_tsv(ch, valid_pos, OUTPUT_DIR)

    print(f"Done. {len(chapters)} files written.")


if __name__ == "__main__":
    main()
