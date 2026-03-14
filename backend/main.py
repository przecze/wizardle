"""
Wizardle API — FastAPI backend.

Loads preprocessed bigrams.pkl on startup.
Deterministic daily puzzle selection based on date.
"""
import hashlib
import pickle
from datetime import date
from pathlib import Path
from typing import Literal

import pandas as pd
from fastapi import FastAPI, HTTPException
from loguru import logger
from pydantic import BaseModel

PICKLE_PATH = Path(__file__).parent.parent / "preprocessing" / "bigrams.pkl"
MAX_WORDS_EACH_DIRECTION = 15

app = FastAPI(title="Wizardle API")

# ---------------------------------------------------------------------------
# Startup: load dataset
# ---------------------------------------------------------------------------
bigrams_df: pd.DataFrame = None
chapter_tokens: dict = None
valid_openers: pd.DataFrame = None
books_meta: dict = {}  # book_name -> sorted list of chapters


@app.on_event("startup")
def load_data():
    global bigrams_df, chapter_tokens, valid_openers, books_meta

    logger.info(f"Loading dataset from {PICKLE_PATH}...")
    with open(PICKLE_PATH, "rb") as f:
        payload = pickle.load(f)

    bigrams_df = payload["bigrams"]
    chapter_tokens = payload["chapter_tokens"]

    valid_openers = (
        bigrams_df[bigrams_df["is_valid_opener"]]
        .reset_index(drop=True)
    )
    logger.info(
        f"Loaded {len(bigrams_df):,} bigrams, "
        f"{len(valid_openers):,} valid openers, "
        f"{len(chapter_tokens)} chapters"
    )

    # Build books/chapters metadata for frontend
    for book in sorted(bigrams_df["book"].unique()):
        chaps = (
            bigrams_df[bigrams_df["book"] == book]["chapter"]
            .unique()
            .tolist()
        )
        # Sort chapters numerically (chap-1, chap-2, ...)
        chaps.sort(key=lambda c: int(c.split("-")[1]))
        first_chap = chaps[0]
        chap_names = {}
        for ch in chaps:
            name = bigrams_df[
                (bigrams_df["book"] == book) & (bigrams_df["chapter"] == ch)
            ]["chapter_name"].iloc[0]
            chap_names[ch] = name
        books_meta[book] = {"chapters": chaps, "chapter_names": chap_names}

    logger.info("Application startup complete.")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _date_seed(date_str: str) -> int:
    """Deterministic integer seed from a date string."""
    date_str = date_str # + 'x' # primitive seed override to try a different puzzle
    h = hashlib.sha256(date_str.encode()).digest()
    return int.from_bytes(h[:8], "big")


def _get_puzzle(date_str: str) -> pd.Series:
    """Pick the valid opener bigram for a given date."""
    seed = _date_seed(date_str)
    idx = seed % len(valid_openers)
    return valid_openers.iloc[idx]


def _get_context_tokens(book: str, chapter: str) -> list[str]:
    """Return full token list for a chapter."""
    key = (book, chapter)
    if key not in chapter_tokens:
        return []
    return chapter_tokens[key]["tokens"]


def _find_token_positions(tokens: list[str], words: list[str]) -> int | None:
    """
    Find the starting index in tokens where the words sequence appears
    (as a contiguous run, skipping standalone dashes).
    Returns the index of the first word, or None if not found.
    """
    dash_tokens = {"-", "--", "\u2014"}
    non_dash = [(i, t) for i, t in enumerate(tokens) if t not in dash_tokens]

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
    Extend the revealed fragment by returning the next token in direction.
    start_pos: token index of first revealed word.
    n_words: count of already-revealed words (not counting dashes).
    direction: 'left' or 'right'.
    Returns the new token to reveal, or None if at boundary/limit.
    """
    dash_tokens = {"-", "--", "\u2014"}

    if direction == "right":
        # Find the (n_words - 1)-th non-dash token from start_pos
        count = 0
        pos = start_pos
        while pos < len(tokens):
            if tokens[pos] not in dash_tokens:
                count += 1
            if count == n_words:
                break
            pos += 1
        # pos is now at last revealed token; advance past dashes to next
        pos += 1
        while pos < len(tokens) and tokens[pos] in dash_tokens:
            pos += 1
        if pos >= len(tokens):
            return None
        return tokens[pos]

    else:  # left
        # Find token just before start_pos (skip dashes going left)
        pos = start_pos - 1
        while pos >= 0 and tokens[pos] in dash_tokens:
            pos -= 1
        if pos < 0:
            return None
        return tokens[pos]


# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class WordRequest(BaseModel):
    date: str
    direction: Literal["left", "right"]
    revealed_words: list[str]  # all currently revealed words, left-to-right


class GuessRequest(BaseModel):
    date: str
    book: str
    chapter: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/puzzle")
def get_puzzle(date: str):
    """
    Return the initial 2-word bigram for a given date.
    Also returns book list for the frontend UI.
    """
    try:
        puzzle = _get_puzzle(date)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {
        "date": date,
        "words": [puzzle["word1"], puzzle["word2"]],
        "books": list(books_meta.keys()),
        "books_meta": books_meta,
    }


@app.post("/word")
def get_next_word(req: WordRequest):
    """
    Return the next word to reveal (left or right).
    Validates that revealed_words matches the actual puzzle sequence.
    Enforces max 15 words in each direction from the original bigram.
    """
    puzzle = _get_puzzle(req.date)
    book = puzzle["book"]
    chapter = puzzle["chapter"]
    tokens = _get_context_tokens(book, chapter)

    if not tokens:
        raise HTTPException(status_code=500, detail="Chapter tokens not found")

    # Validate: find revealed_words in the token sequence
    start_pos = _find_token_positions(tokens, req.revealed_words)
    if start_pos is None:
        raise HTTPException(
            status_code=400,
            detail="revealed_words do not match puzzle for this date",
        )

    # Count words added left/right relative to original bigram
    original = [puzzle["word1"], puzzle["word2"]]
    orig_pos = _find_token_positions(tokens, original)
    if orig_pos is None:
        raise HTTPException(status_code=500, detail="Puzzle bigram not found in chapter")

    if req.direction == "left":
        words_added_left = orig_pos - start_pos  # how many tokens shifted left
        # Count non-dash tokens added to the left
        dash_tokens = {"-", "--", "\u2014"}
        non_dash_added = sum(
            1 for t in tokens[start_pos:orig_pos] if t not in dash_tokens
        )
        if non_dash_added >= MAX_WORDS_EACH_DIRECTION:
            return {"word": None, "limit_reached": True}
        new_word = _extend_fragment(tokens, start_pos, len(req.revealed_words), "left")
    else:
        dash_tokens = {"-", "--", "\u2014"}
        # Count non-dash words revealed to the right of and including orig_pos
        non_dash_right = sum(
            1 for t in tokens[orig_pos:start_pos + len(req.revealed_words) + 1]
            if t not in dash_tokens
        )
        # Words added right = total revealed non-dash minus original 2
        words_added_right = non_dash_right - 2
        if words_added_right >= MAX_WORDS_EACH_DIRECTION:
            return {"word": None, "limit_reached": True}
        new_word = _extend_fragment(tokens, start_pos, len(req.revealed_words), "right")

    if new_word is None:
        return {"word": None, "limit_reached": True}

    return {"word": new_word, "limit_reached": False}


@app.post("/guess")
def submit_guess(req: GuessRequest):
    """
    Check if the guess (book + chapter) is correct for the date.
    On correct: also returns extended context (up to 15 words each direction).
    """
    puzzle = _get_puzzle(req.date)

    correct = (req.book == puzzle["book"] and req.chapter == puzzle["chapter"])

    book_correct = req.book == puzzle["book"]

    if not correct:
        return {
            "correct": False,
            "book_correct": book_correct,
            "answer": None,
        }

    # Build extended context fragment (up to 15 words in each direction)
    book = puzzle["book"]
    chapter = puzzle["chapter"]
    chapter_name = puzzle["chapter_name"]
    tokens = _get_context_tokens(book, chapter)
    orig_pos = _find_token_positions(tokens, [puzzle["word1"], puzzle["word2"]])

    dash_tokens = {"-", "--", "\u2014"}

    context = []
    if orig_pos is not None:
        # Collect up to 15 non-dash tokens to the left
        left_tokens = []
        pos = orig_pos - 1
        non_dash_count = 0
        while pos >= 0 and non_dash_count < MAX_WORDS_EACH_DIRECTION:
            if tokens[pos] not in dash_tokens:
                non_dash_count += 1
            left_tokens.insert(0, tokens[pos])
            pos -= 1

        # Original bigram tokens (including any dashes between them)
        mid_tokens = tokens[orig_pos:orig_pos + 2]

        # Collect up to 15 non-dash tokens to the right
        right_tokens = []
        pos = orig_pos + 2
        non_dash_count = 0
        while pos < len(tokens) and non_dash_count < MAX_WORDS_EACH_DIRECTION:
            if tokens[pos] not in dash_tokens:
                non_dash_count += 1
            right_tokens.append(tokens[pos])
            pos += 1

        context = left_tokens + mid_tokens + right_tokens

    return {
        "correct": True,
        "book_correct": True,
        "answer": {
            "book": book,
            "chapter": chapter,
            "chapter_name": chapter_name,
            "position_pct": float(puzzle["position_pct"]),
            "context_fragment": " ".join(context),
        },
    }
