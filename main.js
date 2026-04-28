// Bagh Chal entry point.
//
// All application logic lives under app/. This file's only job is to grab the
// Firebase compat SDK loaded by index.html (it's exposed on window.firebase)
// and hand it to the bootstrap so feature modules can be wired up.
//
// The previous main.js was a 3,300-line monolith mixing Firebase glue, social
// UI, multiplayer lobby, game state, AI, canvas drawing, and DOM event
// binding all at module top-level. See app/bootstrap.js for the new layout.

import { initBrowserSentry } from './app/monitoring/sentry.js';
import { bootstrap } from './app/bootstrap.js';

initBrowserSentry();

if (typeof window !== 'undefined' && window.firebase) {
  bootstrap({ firebase: window.firebase });
} else {
  console.error('[boot] Firebase compat SDK not present on window. Check the script tags in index.html.');
}
