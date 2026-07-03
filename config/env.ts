import { z } from 'zod';

const optionalEnvString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

const envSchema = z.object({
  DATABASE_URL: optionalEnvString,
  ANTHROPIC_API_KEY: optionalEnvString,
  ANTHROPIC_MODEL: optionalEnvString,
  OPENAI_API_KEY: optionalEnvString,
  REDIS_URL: optionalEnvString,
  CLERK_SECRET_KEY: optionalEnvString,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: optionalEnvString,
  ENCRYPTION_KEY: optionalEnvString,
  APP_URL: optionalEnvString,
  SLACK_CLIENT_ID: optionalEnvString,
  SLACK_CLIENT_SECRET: optionalEnvString,
  SLACK_SIGNING_SECRET: optionalEnvString,
  GOOGLE_CLIENT_ID: optionalEnvString,
  GOOGLE_CLIENT_SECRET: optionalEnvString,
  GMAIL_SYNC_INTERVAL_MINUTES: optionalEnvString,
  MICROSOFT_CLIENT_ID: optionalEnvString,
  MICROSOFT_CLIENT_SECRET: optionalEnvString,
  MICROSOFT_TENANT_ID: optionalEnvString,
  JIRA_CLIENT_ID: optionalEnvString,
  JIRA_CLIENT_SECRET: optionalEnvString,
  SERVICENOW_CLIENT_ID: optionalEnvString,
  SERVICENOW_CLIENT_SECRET: optionalEnvString,
  SERVICENOW_INSTANCE_URL: optionalEnvString,
  ZOOM_CLIENT_ID: optionalEnvString,
  ZOOM_CLIENT_SECRET: optionalEnvString,
});

export const env = envSchema.parse(process.env);
