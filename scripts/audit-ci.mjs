import { spawnSync } from "node:child_process";

const allowedHighAdvisories = new Map([
  [
    "@eslint/config-array",
    "Dev-only ESLint dependency chain; npm fix currently requires an incompatible ESLint release.",
  ],
  [
    "@eslint/eslintrc",
    "Dev-only ESLint dependency chain; npm fix currently requires an incompatible ESLint release.",
  ],
  [
    "@prisma/config",
    "Depends on deepmerge-ts (GHSA-ggr8-5vv4-36mx); the patched version only exists on the Prisma 7.x major line, deferred as its own upgrade rather than forced here.",
  ],
  [
    "brace-expansion",
    "Dev-only ESLint/minimatch dependency chain; production runtime is not affected.",
  ],
  [
    "deepmerge-ts",
    "Transitive dep of @prisma/config (stack exhaustion, GHSA-ggr8-5vv4-36mx); the patched 8.x release only exists on the Prisma 7.x line, which is a separate major-version upgrade, not a same-major patch.",
  ],
  [
    "eslint",
    "Dev-only linting dependency; npm fix currently requires an incompatible ESLint release.",
  ],
  [
    "eslint-config-next",
    "Dev-only Next lint config dependency; npm fix currently suggests an incompatible package change.",
  ],
  ["eslint-plugin-import", "Dev-only linting dependency chain."],
  ["eslint-plugin-jsx-a11y", "Dev-only linting dependency chain."],
  ["eslint-plugin-react", "Dev-only linting dependency chain."],
  [
    "minimatch",
    "Dev-only ESLint dependency chain; production runtime is not affected.",
  ],
  [
    "next",
    "Tracked upstream Next/Image dependency advisory; npm's suggested fix path is not safe for the current Next 15 app.",
  ],
  [
    "prisma",
    "Depends on @prisma/config -> deepmerge-ts (GHSA-ggr8-5vv4-36mx); fixed only on the Prisma 7.x major line, deferred as its own upgrade rather than forced here.",
  ],
  [
    "sharp",
    "Tracked upstream Next/Image optional dependency advisory until Next exposes a compatible patched dependency chain.",
  ],
]);

const result = spawnSync("npm", ["audit", "--json"], {
  encoding: "utf8",
});

const output = result.stdout?.trim() || result.stderr?.trim() || "{}";
let audit;

try {
  audit = JSON.parse(output);
} catch {
  console.error("Could not parse npm audit JSON output.");
  if (output) {
    console.error(output.slice(0, 2000));
  }
  process.exit(1);
}

const vulnerabilities = Object.values(audit.vulnerabilities ?? {});
const allowed = [];
const blocking = [];

for (const vulnerability of vulnerabilities) {
  if (!["high", "critical"].includes(vulnerability.severity)) {
    continue;
  }

  const note = allowedHighAdvisories.get(vulnerability.name);
  if (note) {
    allowed.push({
      name: vulnerability.name,
      severity: vulnerability.severity,
      note,
    });
  } else {
    blocking.push(vulnerability);
  }
}

if (allowed.length > 0) {
  console.log("Allowed tracked high-severity audit advisories:");
  for (const item of allowed) {
    console.log(`- ${item.name} (${item.severity}): ${item.note}`);
  }
}

if (blocking.length > 0) {
  console.error("Blocking unapproved high/critical audit advisories:");
  for (const vulnerability of blocking) {
    const via = (vulnerability.via ?? [])
      .map((entry) => (typeof entry === "string" ? entry : entry.title))
      .join(", ");
    console.error(`- ${vulnerability.name} (${vulnerability.severity}) via ${via}`);
  }
  process.exit(1);
}

console.log("Audit gate passed: no unapproved high/critical vulnerabilities.");
