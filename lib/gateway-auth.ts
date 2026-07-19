import { timingSafeEqual } from 'node:crypto';
import { env } from '@/config/env';

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function authorizeGatewayRequest(request: Request) {
  const configuredKey = env.UNIVERSAL_GATEWAY_API_KEY;
  if (!configuredKey) {
    return process.env.NODE_ENV === 'production'
      ? { ok: false as const, status: 503, error: 'Universal Gateway is not configured.' }
      : { ok: true as const };
  }

  const authHeader = request.headers.get('authorization') ?? '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const suppliedKey = request.headers.get('x-api-key')?.trim() || bearerToken;
  if (!suppliedKey || !secureEqual(suppliedKey, configuredKey)) {
    return { ok: false as const, status: 401, error: 'Unauthorized' };
  }

  return { ok: true as const };
}
