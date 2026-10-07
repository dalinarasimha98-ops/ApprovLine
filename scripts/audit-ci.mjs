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
    "@next/eslint-plugin-next",
    "Dev-only Next lint plugin; transitive dep of fast-glob (GHSA-vfj7-8cjw-p6xm via braces), never shipped to the runtime bundle.",
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
    "braces",
    "Stack-exhaustion DoS in glob-pattern matching (GHSA-vfj7-8cjw-p6xm), only ever invoked by dev/build tooling (Tailwind's file watcher, ESLint) against this repo's own trusted source tree, never against untrusted runtime input.",
  ],
  [
    "chokidar",
    "Dev-only file-watcher; transitive dep of braces (GHSA-vfj7-8cjw-p6xm), used only by Tailwind's build-time watch mode.",
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
    "fast-glob",
    "Dev/build-time glob matching; transitive dep of micromatch (GHSA-vfj7-8cjw-p6xm via braces), used by Tailwind's content-file scanning, not the runtime bundle.",
  ],
  [
    "micromatch",
    "Transitive dep of braces (GHSA-vfj7-8cjw-p6xm), used only by Tailwind's build-time content scanning.",
  ],
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
  [
    "source-map-js",
    "Event-loop DoS via crafted source-map offsets (GHSA-68fv-2mgg-jv7q), only ever processing this repo's own build-time generated source maps, never untrusted input.",
  ],
  [
    "tailwindcss",
    "Build-time CSS tooling (devDependency, never shipped to the runtime bundle); flagged only via its chokidar/fast-glob/micromatch/postcss-nested/postcss-selector-parser dependency chain (GHSA-vfj7-8cjw-p6xm), not its own code.",
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
