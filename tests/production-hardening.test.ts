import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { isPlanEntitled } from "../lib/entitlements";
import { publicLeadSchema, sanitizeLeadText } from "../lib/public-leads";
import { rateLimit } from "../lib/rate-limit";

const validLead = {
  kind: "demo" as const,
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  company: "Analytical Engines Ltd",
  companySize: "201-500",
  industry: "Technology",
  department: "Engineering",
  tools: "Slack and Jira",
  interest: "Approval intelligence",
  message: "We need an enterprise pilot for approval evidence.",
  consent: true as const,
  website: "",
  idempotencyKey: randomUUID(),
};

assert.equal(publicLeadSchema.safeParse(validLead).success, true);
assert.equal(
  publicLeadSchema.safeParse({ ...validLead, email: "not-an-email" }).success,
  false,
);
assert.equal(
  publicLeadSchema.safeParse({ ...validLead, companySize: "" }).success,
  false,
);
assert.equal(
  publicLeadSchema.safeParse({ ...validLead, department: "" }).success,
  false,
);
assert.equal(
  publicLeadSchema.safeParse({ ...validLead, interest: "" }).success,
  false,
);
assert.equal(
  publicLeadSchema.safeParse({ ...validLead, consent: false }).success,
  false,
);
assert.equal(
  sanitizeLeadText("<script>alert(1)</script> Need a demo\u0000"),
  "alert(1) Need a demo",
);

const limiterKey = `hardening:${randomUUID()}`;
assert.equal(rateLimit(limiterKey, 2, 60_000).allowed, true);
assert.equal(rateLimit(limiterKey, 2, 60_000).allowed, true);
const blocked = rateLimit(limiterKey, 2, 60_000);
assert.equal(blocked.allowed, false);
assert.equal(blocked.remaining, 0);

assert.equal(isPlanEntitled("STARTER", "copilot"), false);
assert.equal(isPlanEntitled("STARTER", "playbook_ai"), false);
assert.equal(isPlanEntitled("STARTER", "executive_roi"), true);
assert.equal(isPlanEntitled("GROWTH", "copilot"), true);
assert.equal(isPlanEntitled("GROWTH", "universal_gateway"), false);
assert.equal(isPlanEntitled("ENTERPRISE", "universal_gateway"), true);
assert.equal(isPlanEntitled("FREE_TRIAL", "copilot"), true);

console.log("Production hardening regression tests passed.");
