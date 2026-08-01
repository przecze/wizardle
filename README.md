# Wizardle

**[Play at wizardle.net](https://wizardle.net)**

A daily puzzle game for hardcore Potterheads. You're shown a two-word fragment from somewhere in the Harry Potter series — can you guess the exact book and chapter?

The opening two word fragment is always unique across the entire series, so you could guess immediately. Or reveal more words, one at a time in either direction, to narrow it down. Everyone gets the same puzzle each day.

Similar to Wordle, the game allows easy sharing of your daily result, represented by a set of emojis:
```
wizardle.net
August 1st 2026
'...blown away,"...'
➕➕➕➕➕❌➕➕✅
```

## Tech Stack

- **Preprocessing** — Python + pandas: tokenizes the text, finds unique bigrams ≥15 tokens from chapter boundaries, outputs per-chapter TSVs
- **Backend** — FastAPI (Python), date-seeded puzzle selection, word-reveal and guess endpoints
- **Frontend** — React + TypeScript, Vite
- **Infrastructure** — Docker Compose (dev + prod), Nginx, deployed via Ansible

## Getting started

See `preprocessing/build_chapters.py` for the input data it expects.
Once the inputs are available, run preprocessing (dockerized) via:

```
make chapters
```

Then start the full development stack (Vite dev server, FastAPI backend, nginx):

```
docker compose up
```

The app is now available at http://localhost:8090.

### AI-generated context for revealed fragment

To enable this feature you need an [OpenRouter](https://openrouter.ai) API key saved as:

```
openrouter_prod_api_key.txt
```
