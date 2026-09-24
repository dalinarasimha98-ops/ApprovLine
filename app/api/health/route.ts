import { NextResponse } from 'next/server';

// Vercel automatically injects these System Environment Variables at build
// and runtime for every deployment (no secret, no manual configuration) -
// see https://vercel.com/docs/projects/environment-variables/system-environment-variables.
// None of this is sensitive: the commit SHA and branch are already public in
// the GitHub repository's own history, and the deployment URL/environment
// are informational, not credentials. Exposed here specifically so "is the
// live site actually running the latest merged commit?" is answerable by
// hitting this endpoint, without needing hosting-platform dashboard access.
function deploymentInfo() {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  return {
    commitSha,
    commitShaShort: commitSha ? commitSha.slice(0, 7) : null,
    commitRef: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    environment: process.env.VERCEL_ENV ?? null,
    deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  };
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'ApprovLine',
    timestamp: new Date().toISOString(),
    deployment: deploymentInfo(),
  });
}
