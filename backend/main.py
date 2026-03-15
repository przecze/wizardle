"""
Pensievely API — FastAPI backend.

Loads nothing at startup. For each request, reads the relevant chapter TSV
from preprocessing/chapters/ on demand.

TSV format (preprocessing/chapters/bookN_chapNN.tsv):
  valid_start<TAB>token
  valid_start = 1 if (this token + next non-dash token) is a unique bigram
                ≥15 tokens from either chapter boundary; 0 otherwise.
"""
import hashlib
import json
import re
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from loguru import logger
from pydantic import BaseModel

CHAPTERS_DIR       = Path(__file__).parent.parent / "preprocessing" / "chapters"
CHAPTER_NAMES_PATH = Path(__file__).parent.parent / "preprocessing" / "chapter_names.json"
MAX_WORDS_EACH_DIRECTION = 15
CONTEXT_WORDS_EACH_SIDE  = 20

# Dash/ellipsis tokens skipped when generating bigrams (must match build_chapters.py)
DASH_TOKENS = {"—", "..."}

BOOK_NAMES = [
    "Book 1: Philosopher's Stone",
    "Book 2: Chamber of Secrets",
    "Book 3: Prisoner of Azkaban",
    "Book 4: Goblet of Fire",
    "Book 5: Order of the Phoenix",
    "Book 6: Half Blood Prince",
    "Book 7: Deathly Hallows",
]

app = FastAPI(title="Pensievely API")

# ---------------------------------------------------------------------------
# Lazy books metadata (tiny JSON, loaded once on first use)
# ---------------------------------------------------------------------------
_books_meta: dict | None = None


def _get_books_meta() -> dict:
    global _books_meta
    if _books_meta is None:
        with open(CHAPTER_NAMES_PATH, encoding="utf-8") as f:
            raw = json.load(f)
        _books_meta = {}
        for book in BOOK_NAMES:
            chapters_raw = raw.get(book, {})
            chaps = [f"chap-{n}" for n in sorted(int(k) for k in chapters_raw)]
            chap_names = {f"chap-{k}": v for k, v in chapters_raw.items()}
            _books_meta[book] = {"chapters": chaps, "chapter_names": chap_names}
    return _books_meta


# ---------------------------------------------------------------------------
# Chapter file helpers
# ---------------------------------------------------------------------------

def _chap_file(book_name: str, chapter_id: str) -> Path:
    """Return the TSV path for a given book name and chapter ID like 'chap-3'."""
    book_num = BOOK_NAMES.index(book_name) + 1
    chap_num = int(chapter_id.split("-")[1])
    return CHAPTERS_DIR / f"book{book_num}_chap{chap_num:02d}.tsv"


def _load_chapter_tsv(path: Path) -> list[tuple[int, str]]:
    """Return list of (valid_start_flag, token) from a chapter TSV file."""
    rows: list[tuple[int, str]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line:
            continue
        flag_str, token = line.split("\t", 1)
        rows.append((int(flag_str), token))
    return rows


def _chapter_tokens(path: Path) -> list[str]:
    """Return just the token list from a chapter TSV file."""
    return [tok for _, tok in _load_chapter_tsv(path)]


def _all_chapter_files() -> list[Path]:
    """Sorted list of all chapter TSV files."""
    return sorted(CHAPTERS_DIR.glob("book*_chap*.tsv"))


# ---------------------------------------------------------------------------
# Puzzle selection
# ---------------------------------------------------------------------------

def _date_seed(date_str: str) -> int:
    """Deterministic integer seed from a date string."""
    h = hashlib.sha256(date_str.encode()).digest()
    return int.from_bytes(h[:8], "big")


def _get_puzzle(date_str: str) -> dict:
    """
    Deterministically pick a chapter and valid-opener position for a date.

    Strategy:
      1. Use date seed to select a chapter file (uniform across all chapters).
      2. Load that chapter's TSV.
      3. Use seed to select one valid_start=1 position within the chapter.
      4. Derive word1 and word2 (next non-dash token after word1).
    """
    seed = _date_seed(date_str)
    files = _all_chapter_files()
    if not files:
        raise HTTPException(status_code=500, detail="No chapter files found")

    chosen_file = files[seed % len(files)]

    # Parse book/chapter from filename (e.g. book1_chap03.tsv)
    m = re.match(r"book(\d+)_chap(\d+)\.tsv$", chosen_file.name)
    if not m:
        raise HTTPException(status_code=500, detail=f"Bad filename: {chosen_file.name}")
    book_num  = int(m.group(1))
    chap_num  = int(m.group(2))
    book_name = BOOK_NAMES[book_num - 1]
    chapter_id = f"chap-{chap_num}"

    rows = _load_chapter_tsv(chosen_file)
    valid_positions = [i for i, (flag, _) in enumerate(rows) if flag == 1]

    if not valid_positions:
        raise HTTPException(
            status_code=500,
            detail=f"No valid openers in {chosen_file.name}",
        )

    inner_seed = seed // len(files)
    start_pos = valid_positions[inner_seed % len(valid_positions)]

    word1 = rows[start_pos][1]

    # Find next non-dash token for word2
    word2 = None
    for j in range(start_pos + 1, len(rows)):
        if rows[j][1] not in DASH_TOKENS:
            word2 = rows[j][1]
            break

    if word2 is None:
        raise HTTPException(status_code=500, detail="Could not find word2 for puzzle")

    chapter_name = (
        _get_books_meta()
        .get(book_name, {})
        .get("chapter_names", {})
        .get(chapter_id, "")
    )
    position_pct = round(start_pos / max(len(rows) - 1, 1) * 100, 2)

    return {
        "book":         book_name,
        "chapter":      chapter_id,
        "chapter_name": chapter_name,
        "word1":        word1,
        "word2":        word2,
        "start_pos":    start_pos,   # token index of word1 in chapter
        "position_pct": position_pct,
        "file_path":    chosen_file,
    }


# ---------------------------------------------------------------------------
# Token navigation helpers
# ---------------------------------------------------------------------------

def _find_token_positions(tokens: list[str], words: list[str]) -> int | None:
    """
    Find the starting index in tokens where the words sequence appears
    (as a contiguous run, skipping DASH_TOKENS).
    Returns the index of the first word, or None if not found.
    """
    non_dash = [(i, t) for i, t in enumerate(tokens) if t not in DASH_TOKENS]
    for start in range(len(non_dash) - len(words) + 1):
        if all(non_dash[start + j][1] == words[j] for j in range(len(words))):
            return non_dash[start][0]
    return None


def _extend_fragment(
    tokens: list[str],
    start_pos: int,
    n_words: int,
    direction: str,
) -> str | None:
    """
    Return the next token to reveal in the given direction.
    start_pos: token index of the first revealed word.
    n_words: count of already-revealed words (excluding dash tokens).
    """
    if direction == "right":
        count = 0
        pos = start_pos
        while pos < len(tokens):
            if tokens[pos] not in DASH_TOKENS:
                count += 1
            if count == n_words:
                break
            pos += 1
        pos += 1
        while pos < len(tokens) and tokens[pos] in DASH_TOKENS:
            pos += 1
        return tokens[pos] if pos < len(tokens) else None

    else:  # left
        pos = start_pos - 1
        while pos >= 0 and tokens[pos] in DASH_TOKENS:
            pos -= 1
        return tokens[pos] if pos >= 0 else None


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------

class WordRequest(BaseModel):
    date: str
    direction: Literal["left", "right"]
    revealed_words: list[str]


class GuessRequest(BaseModel):
    date: str
    book: str
    chapter: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/puzzle")
def get_puzzle(date: str):
    """Return the initial 2-word bigram for a given date plus books metadata."""
    logger.info(f"GET /puzzle date={date}")
    try:
        puzzle = _get_puzzle(date)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    books_meta = _get_books_meta()
    return {
        "date":       date,
        "words":      [puzzle["word1"], puzzle["word2"]],
        "books":      list(books_meta.keys()),
        "books_meta": books_meta,
    }


@app.post("/word")
def get_next_word(req: WordRequest):
    """Return the next word to reveal (left or right)."""
    logger.info(f"POST /word date={req.date} dir={req.direction}")
    puzzle = _get_puzzle(req.date)
    tokens = _chapter_tokens(puzzle["file_path"])

    start_pos = _find_token_positions(tokens, req.revealed_words)
    if start_pos is None:
        raise HTTPException(
            status_code=400,
            detail="revealed_words do not match puzzle for this date",
        )

    orig_pos = puzzle["start_pos"]

    if req.direction == "left":
        non_dash_added = sum(
            1 for t in tokens[start_pos:orig_pos] if t not in DASH_TOKENS
        )
        if non_dash_added >= MAX_WORDS_EACH_DIRECTION:
            return {"word": None, "limit_reached": True}
        new_word = _extend_fragment(tokens, start_pos, len(req.revealed_words), "left")
    else:
        non_dash_right = sum(
            1 for t in tokens[orig_pos : start_pos + len(req.revealed_words) + 1]
            if t not in DASH_TOKENS
        )
        words_added_right = non_dash_right - 2
        if words_added_right >= MAX_WORDS_EACH_DIRECTION:
            return {"word": None, "limit_reached": True}
        new_word = _extend_fragment(tokens, start_pos, len(req.revealed_words), "right")

    if new_word is None:
        return {"word": None, "limit_reached": True}

    return {"word": new_word, "limit_reached": False}


@app.post("/guess")
def submit_guess(req: GuessRequest):
    """Check if the guess (book + chapter) is correct for the date."""
    logger.info(f"POST /guess date={req.date} book={req.book!r} chapter={req.chapter!r}")
    puzzle = _get_puzzle(req.date)

    correct      = req.book == puzzle["book"] and req.chapter == puzzle["chapter"]
    book_correct = req.book == puzzle["book"]

    if not correct:
        return {"correct": False, "book_correct": book_correct, "answer": None}

    tokens   = _chapter_tokens(puzzle["file_path"])
    orig_pos = puzzle["start_pos"]

    # Collect up to CONTEXT_WORDS_EACH_SIDE non-dash tokens in each direction
    left_tokens: list[str] = []
    pos = orig_pos - 1
    nd_count = 0
    while pos >= 0 and nd_count < CONTEXT_WORDS_EACH_SIDE:
        if tokens[pos] not in DASH_TOKENS:
            nd_count += 1
        left_tokens.insert(0, tokens[pos])
        pos -= 1

    mid_tokens = tokens[orig_pos : orig_pos + 2]

    right_tokens: list[str] = []
    pos = orig_pos + 2
    nd_count = 0
    while pos < len(tokens) and nd_count < CONTEXT_WORDS_EACH_SIDE:
        if tokens[pos] not in DASH_TOKENS:
            nd_count += 1
        right_tokens.append(tokens[pos])
        pos += 1

    context = left_tokens + mid_tokens + right_tokens

    return {
        "correct":      True,
        "book_correct": True,
        "answer": {
            "book":             puzzle["book"],
            "chapter":          puzzle["chapter"],
            "chapter_name":     puzzle["chapter_name"],
            "position_pct":     puzzle["position_pct"],
            "context_fragment": " ".join(context),
            "bigram_start":     len(left_tokens),
            "bigram_len":       len(mid_tokens),
        },
    }
