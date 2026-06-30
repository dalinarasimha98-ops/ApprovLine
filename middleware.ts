import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/onboarding(.*)',
  '/approvals(.*)',
  '/audit-logs(.*)',
  '/integrations(.*)',
  '/settings(.*)',
  '/playbooks(.*)',
  '/analytics(.*)',
  '/investigations(.*)',
  '/api/playbooks(.*)',
  '/api/export/analytics(.*)',
  '/api/export/investigations(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect({ unauthenticatedUrl: '/sign-in' });
  }
});

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
