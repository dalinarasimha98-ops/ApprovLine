/**
 * The founder console (/founder) is a single-operator internal tool, not a
 * multi-admin product surface. Access is gated solely by identity (Clerk
 * user ID or email) read from env vars - never by role tables, org
 * membership, or anything a customer could ever satisfy. Deliberately has
 * no imports (no Prisma, no Clerk SDK) so it is cheap to pull into
 * middleware.ts, which runs on every request.
 */

export function founderIdentityConfigured(): boolean {
  return Boolean(process.env.FOUNDER_USER_ID?.trim() || process.env.FOUNDER_EMAIL?.trim());
}

export function isFounderUserId(userId: string | null | undefined): boolean {
  const expected = process.env.FOUNDER_USER_ID?.trim();
  return Boolean(expected && userId && userId === expected);
}

export function isFounderEmail(email: string | null | undefined): boolean {
  const expected = process.env.FOUNDER_EMAIL?.trim().toLowerCase();
  return Boolean(expected && email && email.trim().toLowerCase() === expected);
}

export function isFounderIdentity(userId: string | null | undefined, email: string | null | undefined): boolean {
  return isFounderUserId(userId) || isFounderEmail(email);
}
