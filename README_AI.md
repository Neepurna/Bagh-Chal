# AI Guide

The game AI is fully client-side.

## Runtime behavior

- `Easy` and standard move logic run in the browser.
- `Hard` AI uses `ai-worker.js` first so heavy calculations do not block the UI.
- If the worker is unavailable, the app falls back to local in-thread hard AI.

## Main files

- `app/ai/BaghchalAI.js` – core AI engine
- `ai-worker.js` – worker wrapper for off-thread execution
- `main.js` – AI orchestration and move application

## Current approach

- Heuristic evaluation
- Move ordering
- Transposition-table caching
- Minimax-style search for local hard mode
- Time-budgeted computation for responsive play

## Why no backend is needed

- All move generation and evaluation happen in the frontend.
- Netlify/static hosting is enough for AI gameplay.
- A backend is only needed if you later want remote compute, analytics jobs, or training infrastructure.

## Tuning areas

The most relevant tuning points are:

- AI think time
- search depth
- move-ordering heuristics
- evaluation weights

These are controlled in the AI config and local AI logic inside `main.js` and `app/ai/BaghchalAI.js`.

## Worker flow

1. Player move is applied.
2. The UI schedules AI computation.
3. `ai-worker.js` evaluates the position off-thread.
4. The best move is returned and applied.
5. If the worker fails, local hard AI is used instead.
