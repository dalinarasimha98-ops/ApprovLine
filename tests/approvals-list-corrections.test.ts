/**
 * Real, executed unit tests for the pure logic behind the Approvals History
 * list corrections: the shared risk ramp (fixing the Critical/High label
 * collapse) and the subject-text amount extractor. Both are pure functions,
 * so these run the actual code, not a regex over source text.
 */
import assert from 'node:assert/strict';
import { riskBand, riskLabel, riskBadgeClass, riskDotClass } from '../lib/risk-ramp';
import { extractAmountFromSubject, formatAmount } from '../lib/amount-extraction';

// --- riskBand/riskLabel: the actual bug (item 3) -----------------------
// Critical and High must be genuinely distinct - the old bug collapsed
// both into the single label "High" sharing one color.
assert.equal(riskLabel('critical'), 'Critical');
assert.equal(riskLabel('high'), 'High');
assert.notEqual(riskLabel('critical'), riskLabel('high'), 'Critical and High must never share a label again');

assert.equal(riskBand('critical'), 'critical');
assert.equal(riskBand('high'), 'high');
assert.equal(riskBand('medium'), 'medium');
assert.equal(riskBand('low'), 'low');
assert.equal(riskBand(null), 'low', 'unknown/missing riskLevel defaults to the least-alarming band, never fabricates a higher one');
assert.equal(riskBand('CRITICAL'), 'critical', 'case-insensitive against the stored label');

// --- riskBadgeClass: one red-to-green ramp, no blue anywhere (item 2) ---
const bands = ['critical', 'high', 'medium', 'low'] as const;
const classes = bands.map((band) => riskBadgeClass(band));
assert.equal(new Set(classes).size, 4, 'all four bands must be visually distinct from each other');
for (const cls of classes) {
  assert.ok(!/\bblue\b/i.test(cls), `risk badge class must never use blue: "${cls}"`);
}
assert.match(riskBadgeClass('critical'), /red/);
assert.match(riskBadgeClass('high'), /orange/);
assert.match(riskBadgeClass('medium'), /amber/);
assert.match(riskBadgeClass('low'), /emerald/);
assert.notEqual(riskDotClass('critical'), riskDotClass('high'));

// --- extractAmountFromSubject: real subjects from scripts/seed-demo-approvals.ts ---
assert.deepEqual(extractAmountFromSubject('Q4 infrastructure budget $850K'), { title: 'Q4 infrastructure budget', amount: 850_000 });
assert.deepEqual(extractAmountFromSubject('Purchase Order — Office Equipment $125,000'), { title: 'Purchase Order — Office Equipment', amount: 125_000 });
assert.deepEqual(extractAmountFromSubject('Q3 marketing budget increase to $250K'), { title: 'Q3 marketing budget increase', amount: 250_000 });
assert.deepEqual(extractAmountFromSubject('Series B legal spend $1.2M'), { title: 'Series B legal spend', amount: 1_200_000 });
assert.deepEqual(extractAmountFromSubject('Vendor Access Exception — AWS Root Credentials — CISO approval'), {
  title: 'Vendor Access Exception — AWS Root Credentials — CISO approval',
  amount: null,
}, 'a subject with no dollar amount must be returned unchanged, with a null amount, never a fabricated number');

// --- formatAmount: em dash for null, real currency formatting otherwise ---
assert.equal(formatAmount(null), '—');
assert.equal(formatAmount(850_000), '$850,000');
assert.equal(formatAmount(1_200_000, 'USD'), '$1,200,000');

console.log('Validated the shared risk ramp (Critical and High are now genuinely distinct, one red-to-green scale, no blue) and the subject-text amount extractor (real seed-data titles, em dash when no amount exists).');
