// Bagh Chal entry point.
//
// All application logic lives under app/. This file initializes monitoring,
// analytics, and hands control to the modular bootstrap.
//
// The previous main.js was a 3,300-line monolith mixing backend glue, social
// UI, multiplayer lobby, game state, AI, canvas drawing, and DOM event
// binding all at module top-level. See app/bootstrap.js for the new layout.

import { initBrowserSentry } from './app/monitoring/sentry.js';
import { inject as injectVercelAnalytics } from '@vercel/analytics';
import { bootstrap } from './app/bootstrap.js';

initBrowserSentry();
injectVercelAnalytics();
bootstrap();
