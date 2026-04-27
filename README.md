# Bagh Chal

Bagh Chal is a browser-based Nepali board game built with Vite, vanilla JavaScript, Firebase auth/social features, and a fully client-side AI. The current MVP does not require any backend server for gameplay AI.

## What it includes

- Single-player vs AI
- Multiple AI difficulty levels
- Browser-side AI using a Web Worker plus local fallback
- Firebase sign-in, stats, friends, and notifications
- Responsive board/game UI

## Tech stack

- Vite
- Vanilla JavaScript
- Firebase Auth + Firestore

## Local development

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
```

## Project structure

- `index.html` – app shell
- `main.js` – game flow, UI, AI orchestration
- `style.css` – styling
- `ai-worker.js` – off-thread AI computation
- `app/ai/BaghchalAI.js` – AI engine
- `app/game/` – board rules and core game logic
- `app/auth/`, `app/social/`, `app/multiplayer/` – Firebase-powered features
- `public/assets/` – images and media

## Deployment notes

- The AI runs entirely in the browser.
- No backend service is required for the MVP.
- If Firebase features are enabled, valid Firebase project credentials are still required.

## Docs

- `FIREBASE_SETUP.md` – Firebase configuration
- `README_AI.md` – AI architecture and behavior
- `DATASET_DOCUMENTATION.md` – dataset generation format
