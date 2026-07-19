import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
  '/approvals(.*)',
  '/audit-logs(.*)',
  '/integrations(.*)',
  '/settings(.*)',
  '/playbooks(.*)',
  '/copilot(.*)',
  '/analytics(.*)',
  '/investigations(.*)',
  '/memory(.*)',
  '/trust(.*)',
  '/founder(.*)',
  '/api/copilot(.*)',
  '/api/debug(.*)',
  '/api/playbooks(.*)',
  '/api/export/analytics(.*)',
  '/api/export/investigations(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    const { userId } = await auth();

    if (!userId) {
      const signInUrl = new URL('/sign-in', req.url);
      signInUrl.searchParams.set('redirect_url', req.nextUrl.pathname + req.nextUrl.search);
      return NextResponse.redirect(signInUrl);
    }
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
