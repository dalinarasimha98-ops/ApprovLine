import { clerkClient, clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { founderIdentityConfigured, isFounderEmail, isFounderUserId } from '@/lib/founder-identity';

const isFounderRoute = createRouteMatcher(['/founder(.*)']);

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

    // /founder is Dali's personal operations console, never a customer or
    // team-member surface. Gate it purely on identity (fail closed if the
    // env vars aren't set) and redirect silently - never a 404 or a
    // "forbidden" page, so a customer never learns the route exists.
    if (isFounderRoute(req)) {
      const allowed = await isFounderRequest(userId);
      if (!allowed) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }
    }
  }
});

async function isFounderRequest(userId: string): Promise<boolean> {
  if (!founderIdentityConfigured()) return false;
  if (isFounderUserId(userId)) return true;
  if (!process.env.FOUNDER_EMAIL) return false;

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null;
    return isFounderEmail(email);
  } catch (error) {
    console.error('[middleware] founder identity lookup failed', error);
    return false;
  }
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'],
};
