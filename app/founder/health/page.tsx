import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

// Superseded by /founder/customer-health (the full operational Customer
// Health command center). Kept as a redirect — not deleted — so any
// existing bookmark or external link to this URL still resolves, and so
// there is exactly one Customer Health page rather than two independently
// maintained views of the same authoritative data.
export default function FounderHealthRedirectPage() {
  redirect('/founder/customer-health');
}
