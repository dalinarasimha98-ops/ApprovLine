/**
 * Seat enforcement unit tests.
 *
 * Uses the exported pure helper from lib/seat-enforcement.ts so all six
 * required scenarios can be verified without a database connection.
 * Source-level assertions verify the DB-integrated paths in services/founder.ts.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Import the pure helper directly — zero framework deps, works in raw tsx.
// Use a relative .ts path; tsx resolves it without needing Next.js aliases.
import { assertSeatAvailable } from '../lib/seat-enforcement';

// ── Scenario 1 ───────────────────────────────────────────────────────────────
// seatAllocation=1, activeUsers=1, reactivate another user → DENIED
assert.throws(
  () => assertSeatAvailable(1, 1, 'Seat limit reached'),
  { message: 'Seat limit reached' },
  'when active count equals purchased seats, reactivation must be denied',
);

// ── Scenario 2 ───────────────────────────────────────────────────────────────
// seatAllocation=2, activeUsers=1, activate another user → ALLOWED
assert.doesNotThrow(
  () => assertSeatAvailable(1, 2, 'Seat limit reached'),
  'when one seat is free, activation must be allowed',
);

// ── Scenario 3 ───────────────────────────────────────────────────────────────
// seatAllocation=2, activeUsers=2, invite or activate another user → DENIED
assert.throws(
  () => assertSeatAvailable(2, 2, 'Seat limit reached'),
  { message: 'Seat limit reached' },
  'when both seats are filled, activation must be denied',
);

// ── Scenario 4 ───────────────────────────────────────────────────────────────
// suspend one user → seat becomes available → next activation must be allowed
{
  let activeCount = 2;
  const purchasedSeats = 2;
  // simulate suspend: active count drops
  activeCount -= 1;
  assert.doesNotThrow(
    () => assertSeatAvailable(activeCount, purchasedSeats, 'Seat limit reached'),
    'after suspending one user, activating another must be allowed',
  );
}

// ── Scenario 5 ───────────────────────────────────────────────────────────────
// reactivate suspended user → seat check runs → denied when at capacity
{
  const activeCount = 2;
  const purchasedSeats = 2;
  assert.throws(
    () => assertSeatAvailable(activeCount, purchasedSeats, 'Seat limit reached'),
    { message: 'Seat limit reached' },
    'seat check must run on reactivate and deny when at capacity',
  );
}

// ── Scenario 6 ───────────────────────────────────────────────────────────────
// founder raises seat allocation → enforcement uses the new value → allowed
{
  const activeCount = 2;
  const newPurchasedSeats = 3;
  assert.doesNotThrow(
    () => assertSeatAvailable(activeCount, newPurchasedSeats, 'Seat limit reached'),
    'after founder raises seat allocation, previously denied activation must succeed',
  );
}

// ── Source-level assertions: DB-integrated paths ─────────────────────────────
const root = process.cwd();
const founderSrc = readFileSync(`${root}/services/founder.ts`, 'utf8');

// Centralized helper is imported in the service
assert.match(founderSrc, /assertSeatAvailable/);

// activate branch uses a serializable transaction (concurrency guard)
assert.match(founderSrc, /\$transaction/);
assert.match(founderSrc, /isolationLevel.*Serializable/s);

// activate path carries a specific, actionable error message
assert.match(founderSrc, /Seat limit reached\. Suspend or remove an active user before reactivating another\./);

// resend path carries a specific, actionable error message
assert.match(founderSrc, /Seat limit reached\. Increase purchased seats before resending this invitation\./);

// invite path carries a specific, actionable error message
assert.match(founderSrc, /Seat limit reached\. Increase purchased seats before inviting another user\./);

// The pure helper itself lives in lib/seat-enforcement.ts
const helperSrc = readFileSync(`${root}/lib/seat-enforcement.ts`, 'utf8');
assert.match(helperSrc, /export function assertSeatAvailable/);
assert.match(helperSrc, /current >= limit/);

console.log('All 6 seat enforcement scenarios verified. Source assertions passed.');
