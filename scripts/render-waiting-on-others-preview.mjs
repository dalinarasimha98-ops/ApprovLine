#!/usr/bin/env node
/**
 * Renders the real, live components/dashboard/WaitingOnOthersView.tsx (not
 * a mock) with real data from getWaitingOnOthersOverview() to static HTML,
 * for visual/responsive verification when no live Clerk session is
 * available - the same pattern scripts/render-awaiting-response-preview.mjs
 * already established.
 *
 * Usage (needs a reachable Postgres matching DATABASE_URL, and a completed
 * `npm run build` so .next/static/css has real compiled Tailwind output):
 *   TSX_TSCONFIG_PATH=tsconfig.test-render.json \
 *     node --import tsx scripts/render-waiting-on-others-preview.mjs \
 *     <organizationId> <userId> <email> <role> <outFile.html> [paramsJson]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { WaitingOnOthersView } from '../components/dashboard/WaitingOnOthersView.tsx';

const [organizationId, userId, email, role, outFile, paramsJson] = process.argv.slice(2);
if (!organizationId || !userId || !email || !role || !outFile) {
  console.error('Usage: render-waiting-on-others-preview.mjs <organizationId> <userId> <email> <role> <outFile.html> [paramsJson]');
  process.exit(1);
}

const mockRouter = { push() {}, replace() {}, refresh() {}, back() {}, forward() {}, prefetch() {} };
const rawParams = paramsJson ? JSON.parse(paramsJson) : {};

function loadCompiledCss() {
  const cssDir = join(process.cwd(), '.next/static/css');
  try {
    return readdirSync(cssDir)
      .filter((f) => f.endsWith('.css'))
      .map((f) => readFileSync(join(cssDir, f), 'utf8'))
      .join('\n');
  } catch {
    console.warn('[render-waiting-on-others-preview] no .next/static/css found - run `npm run build` first for real styling.');
    return '';
  }
}

async function main() {
  const resolvedElement = await WaitingOnOthersView({
    viewer: { organizationId, userId, email, role },
    rawParams,
  });

  const markup = renderToStaticMarkup(
    React.createElement(AppRouterContext.Provider, { value: mockRouter }, resolvedElement),
  );

  const css = loadCompiledCss();
  const html = `<!doctype html>
<html lang="en" data-theme="${process.env.PREVIEW_THEME ?? 'dark'}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Waiting on Others preview</title>
<style>${css}</style>
<style>body { background: rgb(var(--al-bg-rgb)); margin: 0; padding: 16px; }</style>
</head>
<body>
${markup}
</body>
</html>`;

  writeFileSync(outFile, html, 'utf8');
  console.log(`Wrote ${outFile} (${html.length} bytes)`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
