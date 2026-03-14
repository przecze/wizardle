#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "pandas>=2.0",
# ]
# ///
"""
Wizardle preprocessing pipeline.

Loads harry_potter_books.csv, extracts chapter names, tokenizes text,
builds bigram series with metadata, and outputs stats + bigrams.pkl.
"""

import re
import sys
import pickle
import collections
import argparse
from pathlib import Path

import pandas as pd

CSV_PATH = Path(__file__).parent.parent / "harry_potter_books.csv"
OUTPUT_PATH = Path(__file__).parent / "bigrams.pkl"

# Canonical chapter names, keyed by (book_key, chapter_number).
# book_key matches the "Book N: ..." column in the CSV.
# Source: HP wiki chapter list.
CHAPTER_NAMES: dict[tuple[str, int], str] = {
    # Book 1: Philosopher's Stone
    ("Book 1: Philosopher's Stone", 1): "The Boy Who Lived",
    ("Book 1: Philosopher's Stone", 2): "The Vanishing Glass",
    ("Book 1: Philosopher's Stone", 3): "The Letters from No One",
    ("Book 1: Philosopher's Stone", 4): "The Keeper of the Keys",
    ("Book 1: Philosopher's Stone", 5): "Diagon Alley",
    ("Book 1: Philosopher's Stone", 6): "The Journey from Platform Nine and Three-Quarters",
    ("Book 1: Philosopher's Stone", 7): "The Sorting Hat",
    ("Book 1: Philosopher's Stone", 8): "The Potions Master",
    ("Book 1: Philosopher's Stone", 9): "The Midnight Duel",
    ("Book 1: Philosopher's Stone", 10): "Hallowe'en",
    ("Book 1: Philosopher's Stone", 11): "Quidditch",
    ("Book 1: Philosopher's Stone", 12): "The Mirror of Erised",
    ("Book 1: Philosopher's Stone", 13): "Nicolas Flamel",
    ("Book 1: Philosopher's Stone", 14): "Norbert the Norwegian Ridgeback",
    ("Book 1: Philosopher's Stone", 15): "The Forbidden Forest",
    ("Book 1: Philosopher's Stone", 16): "Through the Trapdoor",
    ("Book 1: Philosopher's Stone", 17): "The Man with Two Faces",
    # Book 2: Chamber of Secrets
    ("Book 2: Chamber of Secrets", 1): "The Worst Birthday",
    ("Book 2: Chamber of Secrets", 2): "Dobby's Warning",
    ("Book 2: Chamber of Secrets", 3): "The Burrow",
    ("Book 2: Chamber of Secrets", 4): "At Flourish and Blotts",
    ("Book 2: Chamber of Secrets", 5): "The Whomping Willow",
    ("Book 2: Chamber of Secrets", 6): "Gilderoy Lockhart",
    ("Book 2: Chamber of Secrets", 7): "Mudbloods and Murmurs",
    ("Book 2: Chamber of Secrets", 8): "The Deathday Party",
    ("Book 2: Chamber of Secrets", 9): "The Writing on the Wall",
    ("Book 2: Chamber of Secrets", 10): "The Rogue Bludger",
    ("Book 2: Chamber of Secrets", 11): "The Duelling Club",
    ("Book 2: Chamber of Secrets", 12): "The Polyjuice Potion",
    ("Book 2: Chamber of Secrets", 13): "The Very Secret Diary",
    ("Book 2: Chamber of Secrets", 14): "Cornelius Fudge",
    ("Book 2: Chamber of Secrets", 15): "Aragog",
    ("Book 2: Chamber of Secrets", 16): "The Chamber of Secrets",
    ("Book 2: Chamber of Secrets", 17): "The Heir of Slytherin",
    ("Book 2: Chamber of Secrets", 18): "Dobby's Reward",
    # Book 3: Prisoner of Azkaban
    ("Book 3: Prisoner of Azkaban", 1): "Owl Post",
    ("Book 3: Prisoner of Azkaban", 2): "Aunt Marge's Big Mistake",
    ("Book 3: Prisoner of Azkaban", 3): "The Knight Bus",
    ("Book 3: Prisoner of Azkaban", 4): "The Leaky Cauldron",
    ("Book 3: Prisoner of Azkaban", 5): "The Dementor",
    ("Book 3: Prisoner of Azkaban", 6): "Talons and Tea Leaves",
    ("Book 3: Prisoner of Azkaban", 7): "The Boggart in the Wardrobe",
    ("Book 3: Prisoner of Azkaban", 8): "Flight of the Fat Lady",
    ("Book 3: Prisoner of Azkaban", 9): "Grim Defeat",
    ("Book 3: Prisoner of Azkaban", 10): "The Marauder's Map",
    ("Book 3: Prisoner of Azkaban", 11): "The Firebolt",
    ("Book 3: Prisoner of Azkaban", 12): "The Patronus",
    ("Book 3: Prisoner of Azkaban", 13): "Gryffindor versus Ravenclaw",
    ("Book 3: Prisoner of Azkaban", 14): "Snape's Grudge",
    ("Book 3: Prisoner of Azkaban", 15): "The Quidditch Final",
    ("Book 3: Prisoner of Azkaban", 16): "Professor Trelawney's Prediction",
    ("Book 3: Prisoner of Azkaban", 17): "Cat, Rat, and Dog",
    ("Book 3: Prisoner of Azkaban", 18): "Moony, Wormtail, Padfoot and Prongs",
    ("Book 3: Prisoner of Azkaban", 19): "The Servant of Lord Voldemort",
    ("Book 3: Prisoner of Azkaban", 20): "The Dementor's Kiss",
    ("Book 3: Prisoner of Azkaban", 21): "Hermione's Secret",
    ("Book 3: Prisoner of Azkaban", 22): "Owl Post Again",
    # Book 4: Goblet of Fire
    ("Book 4: Goblet of Fire", 1): "The Riddle House",
    ("Book 4: Goblet of Fire", 2): "The Scar",
    ("Book 4: Goblet of Fire", 3): "The Invitation",
    ("Book 4: Goblet of Fire", 4): "Back to the Burrow",
    ("Book 4: Goblet of Fire", 5): "Weasleys' Wizard Wheezes",
    ("Book 4: Goblet of Fire", 6): "The Portkey",
    ("Book 4: Goblet of Fire", 7): "Bagman and Crouch",
    ("Book 4: Goblet of Fire", 8): "The Quidditch World Cup",
    ("Book 4: Goblet of Fire", 9): "The Dark Mark",
    ("Book 4: Goblet of Fire", 10): "Mayhem at the Ministry",
    ("Book 4: Goblet of Fire", 11): "Aboard the Hogwarts Express",
    ("Book 4: Goblet of Fire", 12): "The Triwizard Tournament",
    ("Book 4: Goblet of Fire", 13): "Mad-Eye Moody",
    ("Book 4: Goblet of Fire", 14): "The Unforgivable Curses",
    ("Book 4: Goblet of Fire", 15): "Beauxbatons and Durmstrang",
    ("Book 4: Goblet of Fire", 16): "The Goblet of Fire",
    ("Book 4: Goblet of Fire", 17): "The Four Champions",
    ("Book 4: Goblet of Fire", 18): "The Weighing of the Wands",
    ("Book 4: Goblet of Fire", 19): "The Hungarian Horntail",
    ("Book 4: Goblet of Fire", 20): "The First Task",
    ("Book 4: Goblet of Fire", 21): "The House-Elf Liberation Front",
    ("Book 4: Goblet of Fire", 22): "The Unexpected Task",
    ("Book 4: Goblet of Fire", 23): "The Yule Ball",
    ("Book 4: Goblet of Fire", 24): "Rita Skeeter's Scoop",
    ("Book 4: Goblet of Fire", 25): "The Egg and the Eye",
    ("Book 4: Goblet of Fire", 26): "The Second Task",
    ("Book 4: Goblet of Fire", 27): "Padfoot Returns",
    ("Book 4: Goblet of Fire", 28): "The Madness of Mr Crouch",
    ("Book 4: Goblet of Fire", 29): "The Dream",
    ("Book 4: Goblet of Fire", 30): "The Pensieve",
    ("Book 4: Goblet of Fire", 31): "The Third Task",
    ("Book 4: Goblet of Fire", 32): "Flesh, Blood, and Bone",
    ("Book 4: Goblet of Fire", 33): "The Death Eaters",
    ("Book 4: Goblet of Fire", 34): "Priori Incantatem",
    ("Book 4: Goblet of Fire", 35): "Veritaserum",
    ("Book 4: Goblet of Fire", 36): "The Parting of the Ways",
    ("Book 4: Goblet of Fire", 37): "The Beginning",
    # Book 5: Order of the Phoenix
    ("Book 5: Order of the Phoenix", 1): "Dudley Demented",
    ("Book 5: Order of the Phoenix", 2): "A Peck of Owls",
    ("Book 5: Order of the Phoenix", 3): "The Advance Guard",
    ("Book 5: Order of the Phoenix", 4): "Number Twelve, Grimmauld Place",
    ("Book 5: Order of the Phoenix", 5): "The Order of the Phoenix",
    ("Book 5: Order of the Phoenix", 6): "The Noble and Most Ancient House of Black",
    ("Book 5: Order of the Phoenix", 7): "The Ministry of Magic",
    ("Book 5: Order of the Phoenix", 8): "The Hearing",
    ("Book 5: Order of the Phoenix", 9): "The Woes of Mrs Weasley",
    ("Book 5: Order of the Phoenix", 10): "Luna Lovegood",
    ("Book 5: Order of the Phoenix", 11): "The Sorting Hat's New Song",
    ("Book 5: Order of the Phoenix", 12): "Professor Umbridge",
    ("Book 5: Order of the Phoenix", 13): "Detention with Dolores",
    ("Book 5: Order of the Phoenix", 14): "Percy and Padfoot",
    ("Book 5: Order of the Phoenix", 15): "The Hogwarts High Inquisitor",
    ("Book 5: Order of the Phoenix", 16): "In the Hog's Head",
    ("Book 5: Order of the Phoenix", 17): "Educational Decree Number Twenty-four",
    ("Book 5: Order of the Phoenix", 18): "Dumbledore's Army",
    ("Book 5: Order of the Phoenix", 19): "The Lion and the Serpent",
    ("Book 5: Order of the Phoenix", 20): "Hagrid's Tale",
    ("Book 5: Order of the Phoenix", 21): "The Eye of the Snake",
    ("Book 5: Order of the Phoenix", 22): "St Mungo's Hospital for Magical Maladies and Injuries",
    ("Book 5: Order of the Phoenix", 23): "Christmas on the Closed Ward",
    ("Book 5: Order of the Phoenix", 24): "Occlumency",
    ("Book 5: Order of the Phoenix", 25): "The Beetle at Bay",
    ("Book 5: Order of the Phoenix", 26): "Seen and Unforeseen",
    ("Book 5: Order of the Phoenix", 27): "The Centaur and the Sneak",
    ("Book 5: Order of the Phoenix", 28): "Snape's Worst Memory",
    ("Book 5: Order of the Phoenix", 29): "Career Advice",
    ("Book 5: Order of the Phoenix", 30): "Grawp",
    ("Book 5: Order of the Phoenix", 31): "O.W.L.S",
    ("Book 5: Order of the Phoenix", 32): "Out of the Fire",
    ("Book 5: Order of the Phoenix", 33): "Fight and Flight",
    ("Book 5: Order of the Phoenix", 34): "The Department of Mysteries",
    ("Book 5: Order of the Phoenix", 35): "Beyond the Veil",
    ("Book 5: Order of the Phoenix", 36): "The Only One He Ever Feared",
    ("Book 5: Order of the Phoenix", 37): "The Lost Prophecy",
    ("Book 5: Order of the Phoenix", 38): "The Second War Begins",
    # Book 6: Half-Blood Prince
    ("Book 6: Half Blood Prince", 1): "The Other Minister",
    ("Book 6: Half Blood Prince", 2): "Spinner's End",
    ("Book 6: Half Blood Prince", 3): "Will and Won't",
    ("Book 6: Half Blood Prince", 4): "Horace Slughorn",
    ("Book 6: Half Blood Prince", 5): "An Excess of Phlegm",
    ("Book 6: Half Blood Prince", 6): "Draco's Detour",
    ("Book 6: Half Blood Prince", 7): "The Slug Club",
    ("Book 6: Half Blood Prince", 8): "Snape Victorious",
    ("Book 6: Half Blood Prince", 9): "The Half-Blood Prince",
    ("Book 6: Half Blood Prince", 10): "The House of Gaunt",
    ("Book 6: Half Blood Prince", 11): "Hermione's Helping Hand",
    ("Book 6: Half Blood Prince", 12): "Silver and Opals",
    ("Book 6: Half Blood Prince", 13): "The Secret Riddle",
    ("Book 6: Half Blood Prince", 14): "Felix Felicis",
    ("Book 6: Half Blood Prince", 15): "The Unbreakable Vow",
    ("Book 6: Half Blood Prince", 16): "A Very Frosty Christmas",
    ("Book 6: Half Blood Prince", 17): "A Sluggish Memory",
    ("Book 6: Half Blood Prince", 18): "Birthday Surprises",
    ("Book 6: Half Blood Prince", 19): "Elf Tails",
    ("Book 6: Half Blood Prince", 20): "Lord Voldemort's Request",
    ("Book 6: Half Blood Prince", 21): "The Unknowable Room",
    ("Book 6: Half Blood Prince", 22): "After the Burial",
    ("Book 6: Half Blood Prince", 23): "Horcruxes",
    ("Book 6: Half Blood Prince", 24): "Sectumsempra",
    ("Book 6: Half Blood Prince", 25): "The Seer Overheard",
    ("Book 6: Half Blood Prince", 26): "The Cave",
    ("Book 6: Half Blood Prince", 27): "The Lightning Struck Tower",
    ("Book 6: Half Blood Prince", 28): "Flight of the Prince",
    ("Book 6: Half Blood Prince", 29): "The Phoenix Lament",
    ("Book 6: Half Blood Prince", 30): "The White Tomb",
    # Book 7: Deathly Hallows
    ("Book 7: Deathly Hallows", 1): "The Dark Lord Ascending",
    ("Book 7: Deathly Hallows", 2): "In Memoriam",
    ("Book 7: Deathly Hallows", 3): "The Dursleys Departing",
    ("Book 7: Deathly Hallows", 4): "The Seven Potters",
    ("Book 7: Deathly Hallows", 5): "Fallen Warrior",
    ("Book 7: Deathly Hallows", 6): "The Ghoul in Pyjamas",
    ("Book 7: Deathly Hallows", 7): "The Will of Albus Dumbledore",
    ("Book 7: Deathly Hallows", 8): "The Wedding",
    ("Book 7: Deathly Hallows", 9): "A Place to Hide",
    ("Book 7: Deathly Hallows", 10): "Kreacher's Tale",
    ("Book 7: Deathly Hallows", 11): "The Bribe",
    ("Book 7: Deathly Hallows", 12): "Magic is Might",
    ("Book 7: Deathly Hallows", 13): "The Muggle-Born Registration Commission",
    ("Book 7: Deathly Hallows", 14): "The Thief",
    ("Book 7: Deathly Hallows", 15): "The Goblin's Revenge",
    ("Book 7: Deathly Hallows", 16): "Godric's Hollow",
    ("Book 7: Deathly Hallows", 17): "Bathilda's Secret",
    ("Book 7: Deathly Hallows", 18): "The Life and Lies of Albus Dumbledore",
    ("Book 7: Deathly Hallows", 19): "The Silver Doe",
    ("Book 7: Deathly Hallows", 20): "Xenophilius Lovegood",
    ("Book 7: Deathly Hallows", 21): "The Tale of the Three Brothers",
    ("Book 7: Deathly Hallows", 22): "The Deathly Hallows",
    ("Book 7: Deathly Hallows", 23): "Malfoy Manor",
    ("Book 7: Deathly Hallows", 24): "The Wandmaker",
    ("Book 7: Deathly Hallows", 25): "Shell Cottage",
    ("Book 7: Deathly Hallows", 26): "Gringotts",
    ("Book 7: Deathly Hallows", 27): "The Final Hiding Place",
    ("Book 7: Deathly Hallows", 28): "The Missing Mirror",
    ("Book 7: Deathly Hallows", 29): "The Lost Diadem",
    ("Book 7: Deathly Hallows", 30): "The Sacking of Severus Snape",
    ("Book 7: Deathly Hallows", 31): "The Battle of Hogwarts",
    ("Book 7: Deathly Hallows", 32): "The Elder Wand",
    ("Book 7: Deathly Hallows", 33): "The Prince's Tale",
    ("Book 7: Deathly Hallows", 34): "The Forest Again",
    ("Book 7: Deathly Hallows", 35): "King's Cross",
    ("Book 7: Deathly Hallows", 36): "The Flaw in the Plan",
    ("Book 7: Deathly Hallows", 37): "Epilogue",
}

# Tokens that are skipped when generating bigrams (dashes act as transparent separators)
DASH_TOKENS = {"-", "--", "—", "..."}  # dashes and ellipsis are skipped in bigrams

# Punctuation attachment rules (for chars that appear standalone after splitting on whitespace)
# These are handled inside the tokenizer.

def _chap_num(chapter: str) -> int:
    """Parse chapter number from 'chap-N' string."""
    try:
        return int(chapter.split("-")[1])
    except (IndexError, ValueError):
        return 0


def extract_chapter_names(df: pd.DataFrame) -> pd.DataFrame:
    """
    Assign chapter names using the hardcoded CHAPTER_NAMES table.
    For any chapter not found there, fall back to OCR extraction
    (double-space separator in the first CSV row for that chapter).
    """
    df = df.copy()
    df["chapter_name"] = ""

    ocr_names: dict = {}
    first_indices: dict = {}

    for idx, row in df.iterrows():
        key = (row["book"], row["chapter"])
        if key in first_indices:
            continue
        first_indices[key] = idx
        # Try OCR extraction as fallback
        text = row["text"].strip()
        name = ""
        if "  " in text:
            parts = text.split("  ", 1)
            candidate = parts[0].strip()
            if candidate and candidate.isupper() and len(candidate.split()) <= 8:
                name = candidate
                df.at[idx, "text"] = parts[1].strip()
            elif not candidate and "  " in parts[1]:
                inner_parts = parts[1].split("  ", 1)
                c2 = inner_parts[0].strip()
                if c2 and c2.isupper() and len(c2.split()) <= 8:
                    name = c2
                    df.at[idx, "text"] = inner_parts[1].strip()
        ocr_names[key] = name

    def assign_name(row):
        book = row["book"]
        chapter = row["chapter"]
        # Hardcoded table wins
        canonical = CHAPTER_NAMES.get((book, _chap_num(chapter)))
        if canonical:
            return canonical
        return ocr_names.get((book, chapter), "")

    df["chapter_name"] = df.apply(assign_name, axis=1)
    return df


# CSV anomalies: OCR mis-identified page breaks as chapter breaks in some books.
# Maps (book, wrong_chapter) -> correct_chapter so rows get merged into the right chapter.
CSV_CHAPTER_REMAPS: dict[tuple[str, str], str] = {
    # Book 2 chap-19 is a page-break split of chap-18 (sentence continues across the boundary)
    ("Book 2: Chamber of Secrets", "chap-19"): "chap-18",
}


def fix_csv_anomalies(df: pd.DataFrame) -> pd.DataFrame:
    """Remap rows whose (book, chapter) are known OCR mis-splits into the correct chapter."""
    df = df.copy()
    for (book, wrong_chap), correct_chap in CSV_CHAPTER_REMAPS.items():
        mask = (df["book"] == book) & (df["chapter"] == wrong_chap)
        df.loc[mask, "chapter"] = correct_chap
    return df


ELLIPSIS = "..."  # canonical ellipsis token


def _is_period_only(t: str) -> bool:
    """True if token consists only of periods (standalone period punctuation)."""
    return bool(t) and all(c == '.' for c in t)


def tokenize_text(text: str) -> list[str]:
    """
    Tokenize a text string into a list of tokens applying these rules:
      - ,;.?!: attached to previous word (suffix punctuation)
      - Dashes (-, --, —): standalone token, skipped when generating bigrams
      - Opening ` ( [ " : attached to next word (prefix punctuation)
      - Closing ' ) ] " ¨ : attached to previous word (suffix punctuation)
      - Apostrophes within words (it's, Harry's): kept as part of the word
      - Ellipsis (… or . . . or ...) → single '...' token (standalone, skipped in bigrams)

    Other punctuation encountered:
      - * ~ = / \\ : treated as standalone tokens
      - ¨ (diaeresis, OCR artifact): attached to previous word as suffix
      - : (colon) attached to previous word
    """
    raw = text.split()

    tokens = []
    for chunk in raw:
        # Normalise Unicode ellipsis to our canonical form before split_chunk
        chunk = chunk.replace('\u2026', ELLIPSIS)
        subtokens = split_chunk(chunk)
        tokens.extend(subtokens)

    # Merge adjacent period-only tokens (e.g. `. . .` from OCR) into single '...'
    merged: list[str] = []
    for tok in tokens:
        if _is_period_only(tok):
            if merged and _is_period_only(merged[-1]):
                merged[-1] = ELLIPSIS   # collapse run into one ellipsis
            else:
                merged.append(ELLIPSIS)
        else:
            merged.append(tok)

    return merged


# Prefix chars that attach to the NEXT word
PREFIX_CHARS = set("`([\u201c")  # backtick, open-paren, open-bracket, left double curly quote

# Suffix chars that attach to the PREVIOUS word
SUFFIX_CHARS = set(",;.?!:)]\u201d\u00a8\u2019\u0027")  # standard suffix + right double curly quote + diaeresis + right single curly quote + apostrophe

# Dash chars that become standalone tokens
DASH_CHARS = set("-\u2014")  # hyphen-minus + em dash


def split_chunk(chunk: str) -> list[str]:
    """
    Split a whitespace-separated chunk into tokens applying attachment rules.
    Returns a list of tokens (each token is a non-empty string).

    Strategy:
    1. Strip leading prefix chars (they attach to next word = current chunk body)
    2. Strip trailing suffix chars (they attach to prev word = current chunk body)
    3. Handle inline dashes: split on dash sequences, making dashes standalone
    4. Reassemble with attached punctuation
    """
    if not chunk:
        return []

    # Collect leading prefix chars
    prefix = []
    i = 0
    while i < len(chunk) and chunk[i] in PREFIX_CHARS:
        prefix.append(chunk[i])
        i += 1

    # Collect trailing suffix chars
    suffix = []
    j = len(chunk) - 1
    while j >= i and chunk[j] in SUFFIX_CHARS:
        suffix.append(chunk[j])
        j -= 1
    suffix.reverse()

    body = chunk[i:j+1]

    if not body:
        # Only punctuation chars — emit them individually
        return [c for c in prefix + suffix if c]

    # Split body on dashes (em-dash or multiple hyphens mean standalone token)
    # Hyphens within words (e.g. "three-quarters", "well-known") are split to
    # produce: "three", "-", "quarters" — dash is standalone, bigram spans it.
    # Double-dash and em-dash also become standalone.
    dash_pattern = re.compile(r'(\u2014|--|-)')
    body_parts = dash_pattern.split(body)
    # body_parts alternates [word, dash, word, dash, ...] or just [word]

    result = []
    for k, part in enumerate(body_parts):
        if not part:
            continue
        if dash_pattern.fullmatch(part):
            # It's a dash — standalone
            result.append(part)
        else:
            # It's a word fragment
            if k == 0:
                # First fragment: attach leading prefix chars
                token = "".join(prefix) + part
            else:
                token = part
            if k == len(body_parts) - 1:
                # Last fragment: attach trailing suffix chars
                token = token + "".join(suffix)
            result.append(token)

    # Edge case: only dashes in body (no word fragments)
    if all(dash_pattern.fullmatch(p) or not p for p in body_parts):
        # Attach prefix/suffix to surrounding — just emit them
        if prefix:
            result = ["".join(prefix)] + result
        if suffix:
            result = result + ["".join(suffix)]

    return [t for t in result if t]


def build_token_series(df: pd.DataFrame) -> pd.DataFrame:
    """
    Explode the DataFrame into a series of tokens with metadata.
    Returns a DataFrame with columns:
      token, book, chapter, chapter_name, row_idx, token_pos_in_row
    Also computes per-chapter token position index.
    """
    records = []
    chapter_token_counter = {}

    for idx, row in df.iterrows():
        key = (row["book"], row["chapter"])
        if key not in chapter_token_counter:
            chapter_token_counter[key] = 0

        tokens = tokenize_text(str(row["text"]))
        for tp, tok in enumerate(tokens):
            records.append({
                "token": tok,
                "book": row["book"],
                "chapter": row["chapter"],
                "chapter_name": row["chapter_name"],
                "source_row": idx,
                "chapter_token_pos": chapter_token_counter[key],
            })
            chapter_token_counter[key] += 1

    return pd.DataFrame(records)


def build_bigrams(tokens_df: pd.DataFrame) -> pd.DataFrame:
    """
    Build bigrams from the token series.
    - Dash tokens (-, --, —) are transparent: skipped for bigram pairing
      but do NOT cross chapter boundaries.
    - Cross-chapter bigrams are removed.
    Returns DataFrame with:
      bigram, word1, word2, book, chapter, chapter_name,
      chapter_token_pos (position of word1), position_pct
    """
    records = []

    # Group by (book, chapter) to avoid cross-chapter bigrams
    for (book, chapter), grp in tokens_df.groupby(["book", "chapter"], sort=False):
        grp = grp.reset_index(drop=True)
        chapter_name = grp["chapter_name"].iloc[0]
        total_tokens = len(grp)

        # Build list of non-dash tokens with their positions
        non_dash = [(i, row["token"], row["chapter_token_pos"])
                    for i, row in grp.iterrows()
                    if row["token"] not in DASH_TOKENS]

        for bi in range(len(non_dash) - 1):
            idx1, w1, pos1 = non_dash[bi]
            idx2, w2, pos2 = non_dash[bi + 1]

            # Only pair adjacent non-dash tokens (or with dash(es) between them)
            # Check that between idx1 and idx2 there are only dash tokens
            between = grp.loc[idx1+1:idx2-1, "token"].tolist()
            if all(t in DASH_TOKENS for t in between):
                bigram = f"{w1} {w2}"
                pct = round(pos1 / max(total_tokens - 1, 1) * 100, 2) if total_tokens > 1 else 0.0
                records.append({
                    "bigram": bigram,
                    "word1": w1,
                    "word2": w2,
                    "book": book,
                    "chapter": chapter,
                    "chapter_name": chapter_name,
                    "chapter_token_pos": pos1,
                    "position_pct": pct,
                })

    return pd.DataFrame(records)


def compute_chapter_lengths(tokens_df: pd.DataFrame) -> dict:
    """Return total token count per (book, chapter)."""
    return (
        tokens_df.groupby(["book", "chapter"])["token"]
        .count()
        .to_dict()
    )


def mark_valid_openers(bigrams_df: pd.DataFrame, chapter_lengths: dict,
                       boundary_margin: int = 15) -> pd.DataFrame:
    """
    Mark bigrams as is_valid_opener=True if:
      1. The bigram is unique across the entire series (appears exactly once)
      2. The bigram's position is >= boundary_margin tokens from either chapter boundary
         (i.e., chapter_token_pos >= boundary_margin AND
               chapter_token_pos <= chapter_length - boundary_margin - 1)
    """
    bigrams_df = bigrams_df.copy()

    # Count occurrences of each bigram across entire series
    counts = bigrams_df["bigram"].value_counts()
    unique_bigrams = set(counts[counts == 1].index)

    def is_valid(row):
        if row["bigram"] not in unique_bigrams:
            return False
        key = (row["book"], row["chapter"])
        chap_len = chapter_lengths.get(key, 0)
        pos = row["chapter_token_pos"]
        return pos >= boundary_margin and pos <= chap_len - boundary_margin - 1

    bigrams_df["is_valid_opener"] = bigrams_df.apply(is_valid, axis=1)
    return bigrams_df


def print_weird_char_examples(df: pd.DataFrame):
    """Print sample rows containing unusual characters for review."""
    WEIRD = {
        '¨': 'diaeresis (OCR artifact)',
        '—': 'em dash',
        '…': 'ellipsis char (U+2026)',
        '*': 'asterisk',
        '~': 'tilde',
        '=': 'equals',
        '/': 'slash',
        '\\': 'backslash',
        '\u2018': 'left single curly quote',
        '\u2019': 'right single curly quote (used as apostrophe)',
        '\u201c': 'left double curly quote',
        '\u201d': 'right double curly quote',
    }
    print(f"\n{'='*70}")
    print("WEIRD / SPECIAL CHARACTER EXAMPLES:")
    print(f"{'='*70}")
    for char, label in WEIRD.items():
        mask = df['text'].str.contains(re.escape(char), regex=True, na=False)
        rows = df[mask]
        if rows.empty:
            continue
        print(f"\n  [{label!r}]  char={char!r}  occurrences in {len(rows)} rows")
        for _, row in rows.head(3).iterrows():
            snippet = row['text'][:120].replace('\n', ' ')
            print(f"    {row['book']} {row['chapter']}: {snippet!r}")
    print(f"\n{'='*70}")


def print_stats(bigrams_df: pd.DataFrame, tokens_df: pd.DataFrame):
    """Print all required statistics."""
    total = len(bigrams_df)
    print(f"\n{'='*70}")
    print(f"BIGRAM STATISTICS")
    print(f"{'='*70}")
    print(f"Total bigrams: {total:,}")

    unique_series = bigrams_df["bigram"].nunique()
    print(f"Unique bigrams in series: {unique_series:,}")

    valid = bigrams_df["is_valid_opener"].sum()
    print(f"Valid opener bigrams (unique + ≥15 tokens from boundary): {valid:,}")

    # Top-20 most popular bigrams series-wide
    counts = bigrams_df["bigram"].value_counts()
    print(f"\n{'─'*70}")
    print("TOP 20 MOST POPULAR BIGRAMS (series-wide):")
    print(f"{'─'*70}")
    for bigram, count in counts.head(20).items():
        print(f"  {count:>6}x  {bigram!r}")

    # Top-10 most popular bigrams per book
    print(f"\n{'─'*70}")
    print("TOP 10 MOST POPULAR BIGRAMS PER BOOK:")
    print(f"{'─'*70}")
    for book, grp in bigrams_df.groupby("book"):
        book_short = book.split(":")[0]
        top = grp["bigram"].value_counts().head(10)
        print(f"\n  {book_short}:")
        for bigram, count in top.items():
            print(f"    {count:>5}x  {bigram!r}")

    # Valid opener count per book
    print(f"\n{'─'*70}")
    print("VALID OPENER BIGRAMS PER BOOK:")
    print(f"{'─'*70}")
    for book, grp in bigrams_df.groupby("book"):
        book_short = book.split(":")[0]
        n = grp["is_valid_opener"].sum()
        print(f"  {book_short}: {n:,}")

    # Sample unique bigrams per book (≥5 per book) with chapter and position %
    print(f"\n{'─'*70}")
    print("SAMPLE UNIQUE BIGRAMS PER BOOK (unique across whole series):")
    print(f"{'─'*70}")
    unique_bigrams_set = set(counts[counts == 1].index)
    for book, grp in bigrams_df.groupby("book"):
        book_short = book.split(":", 1)[0]
        unique_in_book = grp[grp["bigram"].isin(unique_bigrams_set)]
        sample = unique_in_book.sample(min(8, len(unique_in_book)))
        print(f"\n  {book_short} ({len(unique_in_book):,} unique bigrams):")
        for _, row in sample.iterrows():
            print(f"    {row['bigram']!r:40s}  {row['chapter']}  {row['position_pct']:.1f}%")

    # Other punctuation handling transparency
    print(f"\n{'─'*70}")
    print("PUNCTUATION HANDLING NOTES:")
    print(f"{'─'*70}")
    print("  Suffix (attached to previous word): , ; . ? ! : ) ] ¨ ' \u201d")
    print("  Prefix (attached to next word):    ` ( [ \u201c")
    print("  Standalone (skipped in bigrams):   - -- — ... (dashes + ellipsis)")
    print("  … (U+2026) and `. . .` runs → normalised to single '...' token")
    print("  Other chars found in data: * ~ = / \\ treated as standalone tokens")
    print("  ¨ (OCR diaeresis artifact): treated as suffix")
    print("  ' \u2019 (curly apostrophe): suffix when standalone, part of word when internal")

    # Show a sample of other punctuation tokens
    other_punct = tokens_df[tokens_df["token"].apply(
        lambda t: any(c in t for c in "*~=/…\\") and not any(c.isalnum() for c in t)
    )]
    if len(other_punct):
        print(f"\n  Other punctuation tokens (sample up to 10):")
        for tok in other_punct["token"].unique()[:10]:
            print(f"    {tok!r}")

    # First 10 rows of output bigrams
    print(f"\n{'─'*70}")
    print("FIRST 10 ROWS OF OUTPUT BIGRAMS DATAFRAME:")
    print(f"{'─'*70}")
    display_cols = ["bigram", "book", "chapter", "chapter_name", "position_pct", "is_valid_opener"]
    print(bigrams_df[display_cols].head(10).to_string(index=False))

    print(f"\n{'='*70}")


def main():
    print(f"Loading {CSV_PATH} ...", flush=True)
    df = pd.read_csv(CSV_PATH)
    df = fix_csv_anomalies(df)
    print(f"Loaded {len(df):,} rows. Columns: {list(df.columns)}")

    # Step 1: Extract chapter names
    print("\nExtracting chapter names...", flush=True)
    df = extract_chapter_names(df)
    named = df.groupby(["book", "chapter"])["chapter_name"].first()
    n_named = (named != "").sum()
    n_total_chaps = len(named)
    print(f"  {n_named}/{n_total_chaps} chapters have extracted names")

    # Step 2: Tokenize
    print("\nTokenizing text...", flush=True)
    tokens_df = build_token_series(df)
    print(f"  Total tokens: {len(tokens_df):,}")
    total_rows = len(df)
    print(f"  Average tokens per row: {len(tokens_df)/total_rows:.1f}")

    # Step 3: Build bigrams (cross-chapter already excluded by per-chapter grouping)
    print("\nBuilding bigrams...", flush=True)
    bigrams_df = build_bigrams(tokens_df)
    print(f"  Total bigrams: {len(bigrams_df):,}")

    # Step 4: Compute chapter lengths and mark valid openers
    print("\nMarking valid opener bigrams...", flush=True)
    chapter_lengths = compute_chapter_lengths(tokens_df)
    bigrams_df = mark_valid_openers(bigrams_df, chapter_lengths, boundary_margin=15)
    print(f"  Valid openers: {bigrams_df['is_valid_opener'].sum():,}")

    # Step 5a: Print weird char examples (before stats, for review)
    print_weird_char_examples(df)

    # Step 5b: Print stats
    print_stats(bigrams_df, tokens_df)

    # Step 6: Build chapter token lists for API context extension
    print("\nBuilding chapter token lists...", flush=True)
    chapter_tokens: dict = {}
    for (book, chapter), grp in tokens_df.groupby(["book", "chapter"], sort=False):
        chapter_name = grp["chapter_name"].iloc[0]
        chapter_tokens[(book, chapter)] = {
            "tokens": grp["token"].tolist(),
            "chapter_name": chapter_name,
        }
    print(f"  {len(chapter_tokens)} chapters indexed")

    # Step 7: Save
    print(f"\nSaving to {OUTPUT_PATH} ...", flush=True)
    payload = {
        "bigrams": bigrams_df,
        "chapter_tokens": chapter_tokens,
    }
    with open(OUTPUT_PATH, "wb") as f:
        pickle.dump(payload, f)
    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Saved {size_kb:.1f} KB")
    print("\nDone.")


def print_chapter_names(df: pd.DataFrame):
    """Print all extracted chapter names for debugging."""
    # First show raw first-row text for chapters that fail extraction
    first_rows = df.groupby(["book", "chapter"])["text"].first()

    df2 = extract_chapter_names(df)
    print(f"\n{'='*70}")
    print("ALL EXTRACTED CHAPTER NAMES:")
    print(f"{'='*70}")
    named = df2.groupby(["book", "chapter"])["chapter_name"].first()
    for (book, chapter), name in named.items():
        status = "OK " if name else "---"
        print(f"  [{status}] {book} / {chapter}: {name!r}")
        if not name:
            raw = first_rows.get((book, chapter), "")
            print(f"         raw: {str(raw)[:120]!r}")
    n_named = (named != "").sum()
    print(f"\n{n_named}/{len(named)} chapters have extracted names")
    print(f"{'='*70}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--print-chapters", action="store_true",
                        help="Print all extracted chapter names and exit")
    args = parser.parse_args()

    df = pd.read_csv(CSV_PATH)
    df = fix_csv_anomalies(df)
    if args.print_chapters:
        print_chapter_names(df)
        sys.exit(0)

    main()
