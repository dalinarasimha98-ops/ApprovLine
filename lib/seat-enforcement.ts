/**
 * Pure seat-limit guard — no DB, no framework dependencies.
 *
 * `current`  — count of users already consuming a seat slot for this customer
 *              (ACTIVE only for reactivation; ACTIVE+INVITED for invite/resend)
 * `limit`    — purchasedSeats from CustomerSeatAllocation (default: 5)
 * `message`  — caller-supplied error message so each code path can be precise
 *
 * Throws if adding one more user would exceed the limit.
 * Exported so unit tests can exercise the logic without a DB connection.
 */
export function assertSeatAvailable(current: number, limit: number, message: string): void {
  if (current >= limit) {
    throw new Error(message);
  }
}
