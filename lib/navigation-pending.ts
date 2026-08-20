/**
 * Module-level (not React state) tracker for "is a PendingLink transition
 * currently in flight anywhere on this page". Exists so background
 * polling like AutoRetryOnDegraded's router.refresh() can skip a cycle
 * while a user-initiated navigation is actively resolving, instead of
 * potentially racing it - a concurrent router.refresh() and an in-flight
 * Link push both go through Next's client router, and a refresh firing
 * mid-transition can interrupt the push, leaving PendingLink's spinner
 * showing while the browser never actually lands on the new route (the
 * server-side request completes fine in this case, which is why this
 * looks like a data/timeout problem in logs but isn't one).
 *
 * A plain module-level counter, not React state or context: every
 * PendingLink instance needs to read/write this on every mount across the
 * whole app, and this is cheaper and simpler than threading a context
 * provider through every layout for a value nothing ever renders from.
 */
let pendingCount = 0;

export function markNavigationPending() {
  pendingCount += 1;
}

export function markNavigationSettled() {
  pendingCount = Math.max(0, pendingCount - 1);
}

export function isNavigationPending() {
  return pendingCount > 0;
}
