// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://40fa2a3198b794a795bedec14e392e65@o4510352079192064.ingest.us.sentry.io/4510352080044032",

  // Set the environment (development, staging, production)
  environment: process.env.NEXT_PUBLIC_ENVIRONMENT || process.env.NODE_ENV || 'development',

  // Sample 10% of traces in production, 100% in development
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Disable sending user PII by default (GDPR compliance)
  sendDefaultPii: false,

  // @ts-ignore - Disable telemetry (types may not reflect this option)
  telemetry: false,
});
