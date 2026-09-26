#!/usr/bin/env node
/**
 * Renders the real, live components/dashboard/IndividualDashboardView.tsx
 * (not a mock) with real data from getIndividualDashboardOverview() to
 * static HTML, for visual/responsive verification when no live Clerk
 * session is available - the same pattern
 * scripts/render-dashboard-preview.mjs already established for the
 * Organization Dashboard.
 *
 * This is NOT a substitute for an authenticated browser check of the full
 * app (DashboardShell's sidebar/header, real Clerk session, real
 * navigation clicks) - it verifies the dashboard's own real component tree,
 * real Tailwind design tokens, and real computed data against an actual
 * browser engine, which static source review alone cannot.
 *
 * Usage (needs a reachable Postgres matching DATABASE_URL, and a completed
 * `npm run build` so .next/static/css has real compiled Tailwind output):
 *   TSX_TSCONFIG_PATH=tsconfig.test-render.json \
 *     node --import tsx scripts/render-individual-dashboard-preview.mjs \
 *     <organizationId> <userId> <email> <role> <outFile.html> [range] [from] [to]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { IndividualDashboardView } from '../components/dashboard/IndividualDashboardView.tsx';
import { getIndividualDashboardOverview, resolveIndividualDashboardRange } from '../services/individualDashboard.ts';

const [organizationId, userId, email, role, outFile, rangeKey, from, to] = process.argv.slice(2);
if (!organizationId || !userId || !email || !role || !outFile) {
  console.error('Usage: render-individual-dashboard-preview.mjs <organizationId> <userId> <email> <role> <outFile.html> [range] [from] [to]');
  process.exit(1);
}

const mockRouter = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };

function loadCompiledCss() {
  const cssDir = join(process.cwd(), '.next/static/css');
  try {
    return readdirSync(cssDir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(cssDir, f), 'utf8'))
      .join('\n');
  } catch {
    console.warn('[render-individual-dashboard-preview] no .next/static/css found - run `npm run build` first for real styling.');
    return '';
  }
}

async function main() {
  const range = resolveIndividualDashboardRange(rangeKey, from, to);
  const overview = await getIndividualDashboardOverview({ organizationId, userId, email, role, name: null }, range);

  const markup = renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: mockRouter },
      React.createElement(IndividualDashboardView, {
        overview,
        userName: 'John Doe',
        userEmail: email,
        role,
        rawParams: rangeKey ? { range: rangeKey, from, to } : {},
      }),
    ),
  );

  const css = loadCompiledCss();
  const html = `<!doctype html>
<html lang="en" data-theme="${process.env.PREVIEW_THEME ?? 'dark'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Individual Dashboard preview</title>
<style>${css}</style>
<style>body { background: rgb(var(--al-bg-rgb)); margin: 0; padding: 16px; }</style>
</head>
<body>
${markup}
</body>
</html>`;

  writeFileSync(outFile, html, 'utf8');
  console.log(`Wrote ${outFile} (${html.length} bytes, degraded=${JSON.stringify(overview.degraded)})`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
