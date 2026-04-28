import * as Sentry from '@sentry/browser';

function readSampleRate(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getCommonOptions() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;

  if (!dsn) {
    return null;
  }

  return {
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    sendDefaultPii: false
  };
}

export function initBrowserSentry() {
  const commonOptions = getCommonOptions();

  if (!commonOptions) {
    console.info('[sentry] VITE_SENTRY_DSN not set; browser monitoring disabled.');
    return false;
  }

  Sentry.init({
    ...commonOptions,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: readSampleRate(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE, 0.2),
    tracePropagationTargets: [
      /^\//,
      /^https?:\/\/localhost(:\d+)?\//,
      /^https?:\/\/127\.0\.0\.1(:\d+)?\//
    ]
  });

  Sentry.setTag('app_surface', 'web');
  return true;
}

export function initWorkerSentry() {
  const commonOptions = getCommonOptions();

  if (!commonOptions) {
    return false;
  }

  Sentry.init(commonOptions);
  Sentry.setTag('app_surface', 'ai-worker');
  return true;
}

export function setSentryUser(user) {
  if (!user) {
    Sentry.setUser(null);
    return;
  }

  Sentry.setUser({
    id: user.uid,
    email: user.email || undefined,
    username: user.displayName || undefined
  });
}

export function captureSentryException(error, context = {}) {
  Sentry.captureException(error, {
    extra: context
  });
}
