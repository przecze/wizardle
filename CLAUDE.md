# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Wizardle** — a Wordle-like game where you identify the exact Harry Potter book and chapter from a minimal text fragment (bigram). The puzzle is date-seeded so everyone plays the same puzzle daily.

## Tech Stack

- **Preprocessing**: Python, `uv run preprocessing/preprocess.py` (inline deps header)
- **Backend**: Python FastAPI, served by uvicorn
- **Frontend**: React + TypeScript, Vite — components in `frontend/src/components/`
- **Infrastructure**: Docker Compose (dev + prod), Nginx, Ansible → `bluh`

## Commands

```bash
# Preprocessing
uv run preprocessing/build_chapters.py      # regenerates preprocessing/chapters/*.tsv

# Dev stack
docker compose build                         # build backend + frontend images
docker compose up -d                         # start backend, frontend (Vite), nginx on :8090
docker compose logs --tail=50 backend        # check backend startup
docker compose logs --tail=50 frontend       # check Vite HMR
docker compose logs --tail=50 nginx

# Curl API (dev)
curl 'http://127.0.0.1:8090/api/puzzle?date=YYYY-MM-DD'
curl -X POST http://127.0.0.1:8090/api/word -H 'Content-Type: application/json' \
  -d '{"date":"YYYY-MM-DD","direction":"right","revealed_words":["w1","w2"]}'
curl -X POST http://127.0.0.1:8090/api/guess -H 'Content-Type: application/json' \
  -d '{"date":"YYYY-MM-DD","book":"Book N: ...","chapter":"chap-N"}'

# Prod site (builds frontend, serves static + API proxy)
docker compose --profile production up -d --build site   # serves on :3080
curl -sv http://127.0.0.1:3080/ 2>&1 | grep -iE '(HTTP/|CSP|X-Frame)'

# Ansible (deploy to bluh)
cd ansible && ansible-playbook deploy.yml --check --diff  # dry-run
cd ansible && ansible-playbook deploy.yml                  # actual deploy

# Generate backend/requirements.txt (run from backend/)
cd backend && make reqs
```

## Architecture

### Data flow

`harrypotter.txt` → `preprocessing/build_chapters.py` → `preprocessing/chapters/bookN_chapNN.tsv`

TSV format (tab-separated, no header): `valid_start<TAB>token`
- `valid_start = 1` if this position starts a unique bigram ≥15 tokens from either chapter boundary; `0` otherwise.

The backend loads **nothing at startup**. Chapter TSVs are read on demand per request.

### Puzzle selection

Date string → SHA-256 → integer seed →
1. `seed % len(chapter_files)` → pick chapter TSV
2. `(seed // len(chapter_files)) % len(valid_positions)` → pick valid_start=1 position within chapter

`valid_openers` = positions where (this token + next non-dash token) is unique across entire series AND ≥15 tokens from either chapter boundary.

### API endpoints (all under `/api/` prefix via nginx)

- `GET /puzzle?date=` — returns initial bigram + full books/chapters metadata
- `POST /word` — `{date, direction, revealed_words[]}` → validates client's revealed_words against ground truth, returns next token; max 15 each direction
- `POST /guess` — `{date, book, chapter}` → correct/wrong + context fragment on correct

### Tokenization rules (build_chapters.py)

- `,;.?!:` → suffix (attached to previous word)
- `` ` ( [ " `` → prefix (attached to next word)
- `' ) ] " ¨` → suffix
- `—` (em-dash) → standalone token, **skipped when generating bigrams**
- `-` and `--` → stay attached to surrounding word (not standalone)
- `--` standalone chunks → merged onto preceding token
- `...` / `…` / `. . .` → normalised to `...` token, skipped in bigrams

### Nginx / CSP

Single `nginx.conf.template` with `DEV_MODE` env var:
- `DEV_MODE=true` (dev nginx service): adds `unsafe-inline unsafe-eval` to CSP for Vite HMR
- `DEV_MODE=false` (prod site service): strict CSP

### Frontend component structure

`frontend/src/` shared modules:
- `types.ts` — all shared TypeScript interfaces (`BookMeta`, `PuzzleResponse`, `MoveEntry`, `SplashData`, etc.)
- `utils.ts` — `ROMANS`, `todayStr`, `apiFetch`, `moveEmoji`, `parseChapterNum`
- `index.css` — global reset, body font, shared `.btn-primary` / `.btn-ghost` / `.word-token` / `.word-placeholder`

`frontend/src/components/` — each component has a co-located `.css` file:

| Component | Responsibility |
|---|---|
| `Game.tsx` | Orchestrator — all state and API calls, renders everything below |
| `TitleBar.tsx` | Title heading + prev/next date navigation |
| `TextArea.tsx` | Revealed fragment display, +/- word buttons, `AnimatedWord` |
| `GuessButtons.tsx` | Book icon buttons (ruled-out / confirmed / normal states) |
| `ProgressLog.tsx` | Move history list |
| `GuessDialog.tsx` | Chapter picker modal (search, highlight, guessed state) |
| `GuessAnimation.tsx` | Hourglass → result emoji splash overlay |
| `SuccessDialog.tsx` | Win panel with context fragment + copy-result button |

### Docker Compose services

| Service | Port | Purpose |
|---------|------|---------|
| `backend` | internal :8000 | FastAPI + uvicorn --reload |
| `frontend` | internal :3000 | Vite dev server |
| `nginx` | `:8090` | Dev reverse proxy (DEV_MODE=true) |
| `site` | `:3080` | Prod: built frontend + API proxy (profile=production) |

Note: port 8080 is taken by Cursor IDE locally — use 8090 for dev nginx.
