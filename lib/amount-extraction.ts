/**
 * ApprovalRecord has no stored numeric amount/currency column - only
 * UnifiedEvidenceRecord does (populated by real correlation, so most
 * ApprovalRecords never get one). When a dollar figure exists at all for a
 * given approval, it typically only lives embedded in ApprovalRecord.subject
 * as free text (e.g. "Q4 infrastructure budget $850K"), because that's what
 * the classifier's own summary happened to include.
 *
 * This is real-data extraction, not fabrication: it re-presents a number
 * that is already present in already-selected text (`subject`, which the
 * list query fetches regardless) into a structured column, rather than
 * inventing one. It intentionally never touches the database - it's a pure
 * function over a string the list already has.
 *
 * Callers should prefer a real UnifiedEvidenceRecord.amount when one exists
 * (services/evidence/records.ts's getUnifiedSourceSummariesForApprovals) and
 * only fall back to this when it doesn't.
 */
export type ExtractedAmount = { title: string; amount: number | null };

const AMOUNT_PATTERN = /\$\s?([\d,]+(?:\.\d+)?)\s*([kKmMbB])?\b/;
const TRAILING_CONNECTOR = /\s+(?:to|for|of|at|totaling|totalling)$/i;

export function extractAmountFromSubject(subject: string): ExtractedAmount {
  const match = AMOUNT_PATTERN.exec(subject);
  if (!match || match.index === undefined) return { title: subject, amount: null };

  const numeric = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return { title: subject, amount: null };

  const suffix = match[2]?.toLowerCase();
  const multiplier = suffix === 'k' ? 1_000 : suffix === 'm' ? 1_000_000 : suffix === 'b' ? 1_000_000_000 : 1;
  const amount = Math.round(numeric * multiplier);

  const withoutAmount = (subject.slice(0, match.index) + subject.slice(match.index + match[0].length))
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(TRAILING_CONNECTOR, '')
    .trim();

  return { title: withoutAmount || subject, amount };
}

/** Em dash when there is no amount at all - never a fabricated "$0". */
export function formatAmount(amount: number | null, currency?: string | null): string {
  if (amount === null) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency ?? 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `$${amount.toLocaleString('en-US')}`;
  }
}
