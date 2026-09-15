import { env } from '@/config/env';

/**
 * Thrown by requireOAuthStateSecret() when neither ENCRYPTION_KEY nor
 * CLERK_SECRET_KEY is configured. Every OAuth connector's stateSecret()
 * helper calls this instead of duplicating the same fail-closed check —
 * one source of truth for "no valid signing secret is configured" across
 * all 7 providers, not a new signing/encryption system.
 *
 * The message is deliberately generic: it names neither env var, no
 * secret value, and no implementation detail, so it is always safe to
 * surface to an end user via a redirect reason or a caught-error message.
 */
export class OAuthStateConfigurationError extends Error {
  constructor(provider: string) {
    super(`OAuth connection is temporarily unavailable because secure state signing is not configured for ${provider}.`);
    this.name = 'OAuthStateConfigurationError';
  }
}

/**
 * Returns the one server-only secret used to sign/verify OAuth CSRF-state
 * tokens (ENCRYPTION_KEY, falling back to CLERK_SECRET_KEY), or throws
 * OAuthStateConfigurationError if neither is configured. Fails closed:
 * there is no hardcoded fallback, no generated-per-request secret, and no
 * empty/whitespace-only secret (config/env.ts's Zod schema already
 * normalizes an empty or whitespace-only env var to `undefined` before it
 * ever reaches this function).
 */
export function requireOAuthStateSecret(provider: string): string {
  const secret = env.ENCRYPTION_KEY ?? env.CLERK_SECRET_KEY;
  if (!secret) {
    throw new OAuthStateConfigurationError(provider);
  }
  return secret;
}

/** The stable, safe reason slug every OAuth install/callback route uses in its redirect when state signing is unavailable — never the raw error message, and never an env var name. */
export const OAUTH_STATE_UNAVAILABLE_REASON = 'oauth_state_signing_unavailable';

export function oauthStateFailureReason(error: unknown, fallback: string): string {
  return error instanceof OAuthStateConfigurationError ? OAUTH_STATE_UNAVAILABLE_REASON : error instanceof Error ? error.message : fallback;
}
