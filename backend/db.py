"""
SQLite storage for state that must outlive preprocessing changes.

- puzzles: a frozen snapshot of every puzzle that has ever been served. Once a
  date is here it is served from here forever, so re-tokenizing the chapters
  never changes a puzzle someone may already have played (or saved progress
  for in localStorage).
- fragment_contexts: the AI context note generated for a date's puzzle.

A connection is opened per call; the backend runs a single uvicorn worker and
writes are rare (at most a couple per day), so no pooling is needed.
"""
import json
import sqlite3
from contextlib import closing
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path("/data/wizardle.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS puzzles (
    date          TEXT PRIMARY KEY,   -- YYYY-MM-DD
    book_num      INTEGER NOT NULL,
    chapter_num   INTEGER NOT NULL,
    chapter_file  TEXT    NOT NULL,   -- TSV the snapshot was cut from
    start_pos     INTEGER NOT NULL,   -- token index of word1 in chapter_file at freeze time
    position_pct  REAL    NOT NULL,
    tokens        TEXT    NOT NULL,   -- JSON list: the fragment window around the bigram
    anchor        INTEGER NOT NULL,   -- index of word1 within tokens
    created_at    TEXT    NOT NULL
);
CREATE TABLE IF NOT EXISTS fragment_contexts (
    date        TEXT PRIMARY KEY REFERENCES puzzles(date),
    model       TEXT NOT NULL,
    context     TEXT NOT NULL,
    created_at  TEXT NOT NULL
);
"""


@dataclass(frozen=True)
class Puzzle:
    """A day's puzzle, as frozen. Numbers only — book/chapter titles are not
    this layer's concern; the only place that needs them is the AI
    fragment-context feature, which resolves them itself."""
    book_num: int
    chapter_num: int
    chapter_file: str
    start_pos: int
    position_pct: float
    tokens: list[str]   # fragment window: left context + bigram + right context
    anchor: int         # index of word1 within tokens


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(_SCHEMA)
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_puzzle(date_str: str) -> Puzzle | None:
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT book_num, chapter_num, chapter_file, start_pos, position_pct, tokens, anchor "
            "FROM puzzles WHERE date = ?",
            (date_str,),
        ).fetchone()
    if row is None:
        return None
    book_num, chapter_num, chapter_file, start_pos, position_pct, tokens, anchor = row
    return Puzzle(book_num, chapter_num, chapter_file, start_pos, position_pct, json.loads(tokens), anchor)


def freeze_puzzle(date_str: str, puzzle: Puzzle) -> Puzzle:
    """Store the puzzle unless the date is already frozen; return whichever
    snapshot is stored (so concurrent first requests agree)."""
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT OR IGNORE INTO puzzles "
            "(date, book_num, chapter_num, chapter_file, start_pos, position_pct, tokens, anchor, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (date_str, puzzle.book_num, puzzle.chapter_num, puzzle.chapter_file, puzzle.start_pos,
             puzzle.position_pct, json.dumps(puzzle.tokens, ensure_ascii=False), puzzle.anchor, _now()),
        )
    return get_puzzle(date_str)


def get_fragment_context(date_str: str) -> tuple[str, str] | None:
    """Return (context, model) for a date, if one was generated."""
    with closing(_connect()) as conn:
        return conn.execute(
            "SELECT context, model FROM fragment_contexts WHERE date = ?", (date_str,)
        ).fetchone()


def save_fragment_context(date_str: str, context: str, model: str) -> None:
    with closing(_connect()) as conn, conn:
        conn.execute(
            "INSERT OR IGNORE INTO fragment_contexts (date, model, context, created_at) VALUES (?, ?, ?, ?)",
            (date_str, model, context, _now()),
        )
