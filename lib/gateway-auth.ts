import { timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Core authorization logic extracted for testability. Callers should use
 * authorizeGatewayRequest() in production code; this overload is exported so
 * unit tests can inject controlled config without environment manipulation.
 *
 * Security contract (enforced here, not at the call site):
 *  - orgSlug MUST be present. Without it the server has no way to determine
 *    which organization this credential belongs to → fail closed (503).
 *    Client-supplied tenant_slug is NEVER the authorization source.
 *  - apiKey is optional only in non-production environments (easier local dev).
 *    In production, both apiKey and orgSlug must be configured or the request
 *    is rejected before it reaches any business logic.
 */
export function authorizeGatewayRequestWithConfig(
  request: Request,
  config: { apiKey: string | undefined; orgSlug: string | undefined; isProduction: boolean },
): { ok: true; orgSlug: string } | { ok: false; status: number; error: string } {
  // Org binding is always required — fail closed rather than fall back to
  // client-supplied tenant_slug. If this env var is not set, the operator
  // has not completed the gateway configuration.
  if (!config.orgSlug) {
    return {
      ok: false,
      status: 503,
      error: 'Universal Gateway organization binding is not configured.',
    };
  }

  if (!config.apiKey) {
    // Production: API key not set means the gateway is entirely unconfigured.
    // Non-production: allow keyless requests so local dev doesn't need secrets;
    // the org binding is still enforced above.
    return config.isProduction
      ? { ok: false, status: 503, error: 'Universal Gateway is not configured.' }
      : { ok: true, orgSlug: config.orgSlug };
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const suppliedKey = request.headers.get('x-api-key')?.trim() || bearerToken;
  if (!suppliedKey || !secureEqual(suppliedKey, config.apiKey)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true, orgSlug: config.orgSlug };
}

/**
 * Authorizes an inbound Gateway request using env-configured credentials.
 * Returns the server-authoritative orgSlug on success. Routes MUST pass
 * orgSlug to ingestUniversalApproval/ingestGatewayArtifact and MUST NOT
 * use any tenant_slug supplied by the client body.
 */
export function authorizeGatewayRequest(request: Request) {
  return authorizeGatewayRequestWithConfig(request, {
    apiKey: env.UNIVERSAL_GATEWAY_API_KEY,
    orgSlug: env.UNIVERSAL_GATEWAY_ORG_SLUG,
    isProduction: process.env.NODE_ENV === 'production',
  });
}
