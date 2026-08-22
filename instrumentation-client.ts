import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  // Vercel's injected preview/collaboration overlay (served from
  // _next-live/feedback/*.js, not anything in this repo's bundle) walks the
  // DOM with Range.selectNode() to highlight elements for comments. If a
  // React re-render removes that node first, selectNode throws
  // InvalidNodeTypeError - a bug in that third-party overlay script, not in
  // app code (grepped the whole repo: no first-party selectNode/createRange
  // usage exists). Denying its URL and message keeps it from being reported
  // as an app error.
  denyUrls: [/_next-live\/feedback/],
  ignoreErrors: ["Failed to execute 'selectNode' on 'Range'"],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
