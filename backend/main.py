"""
Wizardle API — FastAPI backend.

Loads nothing at startup. Chapter TSVs are read from preprocessing/chapters/
on demand per request. Books/chapters metadata (chapter_names.json) is read
once, lazily, on first request and cached in-process for the process lifetime.

TSV format (preprocessing/chapters/bookN_chapNN.tsv):
  valid_start<TAB>token
  valid_start = 1 if (this token + next non-dash token) is a unique bigram
                ≥15 tokens from either chapter boundary; 0 otherwise.
"""
import hashlib
import json
import os
import re
import urllib.request
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from loguru import logger
from pydantic import BaseModel

CHAPTERS_DIR       = Path(__file__).parent.parent / "preprocessing" / "chapters"
CHAPTER_NAMES_PATH = Path(__file__).parent.parent / "preprocessing" / "chapter_names.json"
PUZZLE_OVERRIDES_PATH = Path(__file__).parent / "daily_puzzle_position_overrides.json"
FRAGMENT_CONTEXT_CACHE_DIR = Path("/fragment_context_cache")
OPENROUTER_KEY_PATH        = Path("/run/secrets/openrouter_key")
MAX_WORDS_EACH_DIRECTION   = 15
FRAGMENT_WORDS_EACH_SIDE    = 20

# Wedding special puzzle. Defaults to the actual wedding date so a deploy with
# no WEDDING_DATE env var set is always locked to it; set WEDDING_DATE to
# today's date locally (e.g. in docker-compose.yml) to preview it early.
WEDDING_DATE  = os.environ.get("WEDDING_DATE") or "2026-07-25"
WEDDING_CHAPTER_FILE = "book7_chap08.tsv"
WEDDING_START_POS    = 2392  # "you bonded"

FRAGMENT_CONTEXT_MODEL = "google/gemini-3.6-flash"
FRAGMENT_CONTEXT_SYSTEM_PROMPT = (
    "You are a Harry Potter books' expert writing a brief context note shown after a player "
    "correctly guesses a fragment's chapter in a Harry Potter guessing game. "
    "The player has already seen the full text fragment — do not summarise or quote it. "
    "Write 1–2 short sentences (under 40 words total)"
    "It needs to help the reader 'place' the scene. "
    "Reader only seen this fragment and knows which chapter (number and title) it is. "
    "If the fragment captures a minor sub-plot or a brief transition, provide the bridging context connecting it to the main events of the chapter, act or book. "
    "If from fragment alone it's unclear who is speaking, or to who, or who the pronouns refer to or who else is in the scene your note should make it clear. "
    "Don't say 'this fragment is' or 'this describes' start right away with context / scene explaination"
    "Example input fragment: ...'re a TOOL' he said and left for upstrairs leaving him alone in the classrom... "
    "Example good context note: Harry argues with Ron during potions class before he leaves for his first private lesson with Dumbledore"
)

# Dash/ellipsis tokens skipped when generating bigrams (must match build_chapters.py)
DASH_TOKENS = {"—", "..."}

app = FastAPI(title="Wizardle API")

# ---------------------------------------------------------------------------
# Lazy books metadata (tiny JSON, loaded once on first use)
#
# chapter_names.json is the single source of truth for book order + titles:
#   [{"book": "Book 1: ...", "chapters": {"1": "The Boy Who Lived", ...}}, ...]
# ---------------------------------------------------------------------------
_book_names: list[str] | None = None
_books_meta: dict | None = None


def _ensure_books_loaded() -> None:
    global _book_names, _books_meta
    if _books_meta is not None:
        return
    with open(CHAPTER_NAMES_PATH, encoding="utf-8") as f:
        entries = json.load(f)
    _book_names = [entry["book"] for entry in entries]
    _books_meta = {}
    for entry in entries:
        chaps = sorted(int(k) for k in entry["chapters"])
        chap_names = {int(k): v for k, v in entry["chapters"].items()}
        _books_meta[entry["book"]] = {"chapters": chaps, "chapter_names": chap_names}


def _get_book_names() -> list[str]:
    _ensure_books_loaded()
    return _book_names


def _get_books_meta() -> dict:
    _ensure_books_loaded()
    return _books_meta


def _validate_book_num(book_num: int) -> None:
    if not (1 <= book_num <= len(_get_book_names())):
        raise HTTPException(status_code=400, detail=f"Invalid book_num: {book_num}")


# ---------------------------------------------------------------------------
# Chapter file helpers
# ---------------------------------------------------------------------------


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


@dataclass(frozen=True)
class Puzzle:
    """The day's puzzle. Numbers only — book/chapter titles are not this
    layer's concern; the only place that needs them is the AI fragment-context
    feature, which resolves them itself from book_num/chapter_num."""
    book_num: int
    chapter_num: int
    word1: str
    word2: str
    start_pos: int      # token index of word1 in chapter
    position_pct: float
    file_path: Path


def _build_puzzle(chosen_file: Path, rows: list[tuple[int, str]], start_pos: int) -> Puzzle:
    """Assemble the Puzzle for a chosen chapter file + start position."""
    m = re.match(r"book(\d+)_chap(\d+)\.tsv$", chosen_file.name)
    if not m:
        raise HTTPException(status_code=500, detail=f"Bad filename: {chosen_file.name}")
    book_num    = int(m.group(1))
    chapter_num = int(m.group(2))

    word1 = rows[start_pos][1]

    # Find next non-dash token for word2
    word2 = None
    for j in range(start_pos + 1, len(rows)):
        if rows[j][1] not in DASH_TOKENS:
            word2 = rows[j][1]
            break
    if word2 is None:
        raise HTTPException(status_code=500, detail="Could not find word2 for puzzle")

    position_pct = round(start_pos / max(len(rows) - 1, 1) * 100, 2)

    return Puzzle(
        book_num=book_num,
        chapter_num=chapter_num,
        word1=word1,
        word2=word2,
        start_pos=start_pos,
        position_pct=position_pct,
        file_path=chosen_file,
    )


def _get_puzzle(date_str: str) -> Puzzle:
    """
    Deterministically pick a chapter and valid-opener position for a date.

    Strategy:
      1. Use date seed to select a chapter file (uniform across all chapters).
      2. Load that chapter's TSV.
      3. Use seed to select one valid_start=1 position within the chapter.
      4. Derive word1 and word2 (next non-dash token after word1).

    If daily_puzzle_position_overrides.json contains an entry for date_str,
    the chapter file and start_pos from that entry are used directly instead
    of the seeding logic.
    """
    if date_str == WEDDING_DATE:
        chosen_file = CHAPTERS_DIR / WEDDING_CHAPTER_FILE
        rows = _load_chapter_tsv(chosen_file)
        return _build_puzzle(chosen_file, rows, WEDDING_START_POS)

    # Check for manual override (used when token IDs shift after reprocessing)
    if PUZZLE_OVERRIDES_PATH.exists():
        with open(PUZZLE_OVERRIDES_PATH, encoding="utf-8") as f:
            overrides = json.load(f)
        if date_str in overrides:
            ov = overrides[date_str]
            chosen_file = CHAPTERS_DIR / ov["chapter_file"]
            rows = _load_chapter_tsv(chosen_file)
            return _build_puzzle(chosen_file, rows, ov["start_pos"])

    seed = _date_seed(date_str)
    files = _all_chapter_files()
    if not files:
        raise HTTPException(status_code=500, detail="No chapter files found")

    chosen_file = files[seed % len(files)]
    rows = _load_chapter_tsv(chosen_file)
    valid_positions = [i for i, (flag, _) in enumerate(rows) if flag == 1]

    if not valid_positions:
        raise HTTPException(
            status_code=500,
            detail=f"No valid openers in {chosen_file.name}",
        )

    inner_seed = seed // len(files)
    start_pos = valid_positions[inner_seed % len(valid_positions)]

    return _build_puzzle(chosen_file, rows, start_pos)


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
    book_num: int
    chapter_num: int


class FragmentContextRequest(BaseModel):
    date: str
    book_num: int
    chapter_num: int


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

def _today_str() -> str:
    """Must match frontend/src/utils.ts todayStr() (new Date().toISOString().slice(0, 10))."""
    return datetime.now(timezone.utc).date().isoformat()


def _puzzle_payload(date_str: str, puzzle: Puzzle) -> dict:
    """Shape shared by GET /puzzle and the "/" data island — the only two
    places that hand the day's bigram to the client."""
    return {"date": date_str, "words": [puzzle.word1, puzzle.word2]}


@app.get("/puzzle-island", response_class=HTMLResponse)
def puzzle_island():
    """Today's puzzle as a literal <script> data island, spliced into the
    served index.html by nginx SSI (see nginx.conf.template's `ssi on;` and
    the `<!--#include virtual="/api/puzzle-island" -->` marker in
    frontend/index.html). Keeps the client from needing a round-trip to
    /api/puzzle on first load, without the app shell itself passing through
    the backend — Vite's own dev/build asset handling stays untouched."""
    date_str = _today_str()
    try:
        puzzle = _get_puzzle(date_str)
        puzzle_json = json.dumps(_puzzle_payload(date_str, puzzle))
    except Exception as e:
        logger.error(f"Failed to build puzzle data island for {date_str}: {e}")
        puzzle_json = "null"

    # Escape "</" so the fragment can never prematurely close the script tag.
    puzzle_json = puzzle_json.replace("</", "<\\/")

    return f'<script id="__puzzle_data__" type="application/json">{puzzle_json}</script>'


@app.get("/puzzle")
def get_puzzle(date: str):
    """Return the initial 2-word bigram for a given date."""
    logger.info(f"GET /puzzle date={date}")
    try:
        puzzle = _get_puzzle(date)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return _puzzle_payload(date, puzzle)


@app.post("/word")
def get_next_word(req: WordRequest):
    """Return the next word to reveal (left or right)."""
    logger.info(f"POST /word date={req.date} dir={req.direction}")
    puzzle = _get_puzzle(req.date)
    tokens = _chapter_tokens(puzzle.file_path)

    start_pos = _find_token_positions(tokens, req.revealed_words)
    if start_pos is None:
        raise HTTPException(
            status_code=400,
            detail="revealed_words do not match puzzle for this date",
        )

    orig_pos = puzzle.start_pos

    if req.direction == "left":
        non_dash_added = sum(
            1 for t in tokens[start_pos:orig_pos] if t not in DASH_TOKENS
        )
        if non_dash_added >= MAX_WORDS_EACH_DIRECTION:
            return {"word": None, "limit_reached": True}
        new_word = _extend_fragment(tokens, start_pos, len(req.revealed_words), "left")
        limit_reached = non_dash_added + 1 >= MAX_WORDS_EACH_DIRECTION
    else:
        non_dash_right = sum(
            1 for t in tokens[orig_pos : start_pos + len(req.revealed_words) + 1]
            if t not in DASH_TOKENS
        )
        words_added_right = non_dash_right - 2
        if words_added_right >= MAX_WORDS_EACH_DIRECTION:
            return {"word": None, "limit_reached": True}
        new_word = _extend_fragment(tokens, start_pos, len(req.revealed_words), "right")
        limit_reached = words_added_right + 1 >= MAX_WORDS_EACH_DIRECTION

    if new_word is None:
        return {"word": None, "limit_reached": True}

    return {"word": new_word, "limit_reached": limit_reached}


def _fragment_window(tokens: list[str], orig_pos: int) -> tuple[list[str], list[str], list[str]]:
    """Collect up to FRAGMENT_WORDS_EACH_SIDE non-dash tokens on each side of the bigram at orig_pos."""
    left_tokens: list[str] = []
    pos = orig_pos - 1
    nd_count = 0
    while pos >= 0 and nd_count < FRAGMENT_WORDS_EACH_SIDE:
        if tokens[pos] not in DASH_TOKENS:
            nd_count += 1
        left_tokens.insert(0, tokens[pos])
        pos -= 1

    mid_tokens = tokens[orig_pos : orig_pos + 2]

    right_tokens: list[str] = []
    pos = orig_pos + 2
    nd_count = 0
    while pos < len(tokens) and nd_count < FRAGMENT_WORDS_EACH_SIDE:
        if tokens[pos] not in DASH_TOKENS:
            nd_count += 1
        right_tokens.append(tokens[pos])
        pos += 1

    return left_tokens, mid_tokens, right_tokens


@app.post("/guess")
def submit_guess(req: GuessRequest):
    """Check if the guess (book + chapter) is correct for the date."""
    logger.info(f"POST /guess date={req.date} book_num={req.book_num} chapter_num={req.chapter_num}")
    _validate_book_num(req.book_num)
    puzzle = _get_puzzle(req.date)

    correct      = req.book_num == puzzle.book_num and req.chapter_num == puzzle.chapter_num
    book_correct = req.book_num == puzzle.book_num

    if not correct:
        return {"correct": False, "book_correct": book_correct, "answer": None}

    tokens   = _chapter_tokens(puzzle.file_path)
    orig_pos = puzzle.start_pos
    left_tokens, mid_tokens, right_tokens = _fragment_window(tokens, orig_pos)
    fragment_tokens = left_tokens + mid_tokens + right_tokens

    return {
        "correct":      True,
        "book_correct": True,
        "answer": {
            "full_fragment": " ".join(fragment_tokens),
            "position_pct":  puzzle.position_pct,
            "bigram_start":  len(left_tokens),
            "bigram_len":    len(mid_tokens),
        },
    }


# ---------------------------------------------------------------------------
# Fragment context helpers
# ---------------------------------------------------------------------------

def _book_and_chapter_name(book_num: int, chapter_num: int) -> tuple[str, str]:
    """Resolve titles for the LLM prompt — the only place the backend needs them."""
    book_name = _get_book_names()[book_num - 1]
    chapter_name = _get_books_meta().get(book_name, {}).get("chapter_names", {}).get(chapter_num, "")
    return book_name, chapter_name


def _build_full_fragment(date_str: str) -> tuple[str, str, str]:
    """Return (full_fragment, book_name, chapter_name) for a date."""
    puzzle = _get_puzzle(date_str)
    tokens = _chapter_tokens(puzzle.file_path)
    left_tokens, mid_tokens, right_tokens = _fragment_window(tokens, puzzle.start_pos)
    full_fragment = " ".join(left_tokens + mid_tokens + right_tokens)
    book_name, chapter_name = _book_and_chapter_name(puzzle.book_num, puzzle.chapter_num)
    return full_fragment, book_name, chapter_name


def _call_llm_with_chapter(
    full_fragment: str, book: str, chapter_name: str, full_chapter_text: str
) -> str:
    """Call the fragment-context LLM (via OpenRouter) with full chapter text included."""
    api_key = OPENROUTER_KEY_PATH.read_text().strip()
    user_msg = (
        f'Book: {book}\n'
        f'Chapter: {chapter_name}\n'
        f'Fragment: "{full_fragment}"\n'
        f'Full chapter text: {full_chapter_text}\n\n'
        f'Context note (1–2 short sentences, under 40 words):'
    )

    payload = json.dumps({
        "model": FRAGMENT_CONTEXT_MODEL,
        "messages": [
            {"role": "system", "content": FRAGMENT_CONTEXT_SYSTEM_PROMPT},
            {"role": "user",   "content": user_msg},
        ],
        "max_tokens": 2000,
        "temperature": 0.3,
        "reasoning": {"effort": "minimal"}
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://openrouter.ai/api/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://wizardle.net",
            "X-Title": "Wizardle",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        logger.error(f"Fragment-context API error body: {err_body}")
        raise

    logger.info(f"Fragment-context full API response: {json.dumps(body)}")

    return body["choices"][0]["message"]["content"].strip()


# ---------------------------------------------------------------------------
# /fragment-context endpoint
# ---------------------------------------------------------------------------

@app.post("/fragment-context")
def get_fragment_context(req: FragmentContextRequest):
    """
    Return an AI-generated context note for the day's puzzle fragment.
    Requires the correct book + chapter (from /guess success) as proof of win.
    Result is cached per date so the model is only called once per day.
    """
    logger.info(f"POST /fragment-context date={req.date} book_num={req.book_num} chapter_num={req.chapter_num}")
    _validate_book_num(req.book_num)

    # Verify book + chapter match ground truth (proof of win)
    try:
        puzzle = _get_puzzle(req.date)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    if req.book_num != puzzle.book_num or req.chapter_num != puzzle.chapter_num:
        raise HTTPException(status_code=403, detail="Incorrect book or chapter")

    try:
        full_fragment, book, chapter_name = _build_full_fragment(req.date)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Return cached result if available
    FRAGMENT_CONTEXT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = FRAGMENT_CONTEXT_CACHE_DIR / f"{req.date}.txt"
    if cache_file.exists():
        logger.info(f"Fragment context cache hit for {req.date}")
        return {"context": cache_file.read_text(encoding="utf-8"), "model": FRAGMENT_CONTEXT_MODEL, "cached": True}

    # Fetch full chapter text for the model
    full_chapter_text = " ".join(_chapter_tokens(puzzle.file_path))

    try:
        context = _call_llm_with_chapter(
            full_fragment, book, chapter_name, full_chapter_text
        )
    except Exception as e:
        logger.error(f"Fragment-context LLM call failed: {e}")
        raise HTTPException(status_code=502, detail=f"AI fragment context unavailable: {e}")

    cache_file.write_text(context, encoding="utf-8")
    logger.info(f"Fragment context generated and cached for {req.date}")

    return {"context": context, "model": FRAGMENT_CONTEXT_MODEL, "cached": False}
