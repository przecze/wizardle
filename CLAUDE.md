# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Wizardle** — a Wordle-like game where you identify the exact Harry Potter book and chapter from a minimal text fragment (bigram). The puzzle is date-seeded so everyone plays the same puzzle daily.

## Tech Stack

- **Preprocessing**: Python, `uv run preprocessing/preprocess.py` (inline deps header)
- **Backend**: Python FastAPI, served by uvicorn
- **Frontend**: React + TypeScript, Vite
- **Infrastructure**: Docker Compose (dev + prod), Nginx, Ansible → `bluh`

## Commands

```bash
# Preprocessing
uv run preprocessing/preprocess.py          # regenerates preprocessing/bigrams.pkl

# Dev stack
docker compose build                         # build backend + frontend images
docker compose up -d                         # start backend, frontend (Vite), nginx on :8090
docker compose logs --tail=50 backend        # check backend startup / bigram load
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

`harry_potter_books.csv` → `preprocessing/preprocess.py` → `preprocessing/bigrams.pkl`
`bigrams.pkl` is loaded into memory by the backend at startup (payload: `{bigrams: DataFrame, chapter_tokens: dict}`).

### Puzzle selection

Date string → SHA-256 → integer seed → `seed % len(valid_openers)` → row in `valid_openers` DataFrame.
`valid_openers` = bigrams that are unique across the entire series AND ≥15 tokens from either chapter boundary.

### API endpoints (all under `/api/` prefix via nginx)

- `GET /puzzle?date=` — returns initial bigram + full books/chapters metadata
- `POST /word` — `{date, direction, revealed_words[]}` → validates client's revealed_words against ground truth, returns next token; max 15 each direction
- `POST /guess` — `{date, book, chapter}` → correct/wrong + context fragment on correct

### Tokenization rules (preprocessing)

- `,;.?!:` → suffix (attached to previous word)
- `` ` ( [ " `` → prefix (attached to next word)
- `' ) ] " ¨` → suffix
- `-` `--` `—` → standalone token, **skipped when generating bigrams** (bigram spans words on each side)

### Nginx / CSP

Single `nginx.conf.template` with `DEV_MODE` env var:
- `DEV_MODE=true` (dev nginx service): adds `unsafe-inline unsafe-eval` to CSP for Vite HMR
- `DEV_MODE=false` (prod site service): strict CSP

### Docker Compose services

| Service | Port | Purpose |
|---------|------|---------|
| `backend` | internal :8000 | FastAPI + uvicorn --reload |
| `frontend` | internal :3000 | Vite dev server |
| `nginx` | `:8090` | Dev reverse proxy (DEV_MODE=true) |
| `site` | `:3080` | Prod: built frontend + API proxy (profile=production) |

Note: port 8080 is taken by Cursor IDE locally — use 8090 for dev nginx.
