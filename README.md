# Wizardle

**[Play at wizardle.janczechowski.com](https://wizardle.janczechowski.com)**

A daily puzzle game for hardcore Potterheads. You're shown a two-word fragment from somewhere in the Harry Potter series — can you guess the exact book and chapter?

The opening two word fragment is always unique across the entire series, so you could guess immediately. Or reveal more words, one at a time in either direction, to narrow it down. Everyone gets the same puzzle each day.

## Tech Stack

- **Preprocessing** — Python + pandas: tokenizes the text, finds unique bigrams ≥15 tokens from chapter boundaries, outputs per-chapter TSVs
- **Backend** — FastAPI (Python), date-seeded puzzle selection, word-reveal and guess endpoints
- **Frontend** — React + TypeScript, Vite
- **Infrastructure** — Docker Compose (dev + prod), Nginx, deployed via Ansible
