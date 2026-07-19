import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { clerkAuthAppearance } from '@/components/auth/clerkAppearance';

export default function SignUpPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <AuthShell
        cardTitle="Authentication is not configured"
        cardSubtitle="Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to this environment before creating an account."
        footer={
          <Link href="/" className="auth-link">
            Return to ApprovLine
          </Link>
        }
      >
        <div className="auth-configuration-notice" role="alert">
          Account creation is temporarily unavailable in this environment.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      cardTitle="Create account"
      cardSubtitle="Start with work email, Google, or Microsoft 365. Email verification is required."
      footer={
        <>
          Already have an account?{' '}
          <Link href="/sign-in" className="auth-link">
            Sign in
          </Link>
        </>
      }
    >
      <SignUp
        appearance={clerkAuthAppearance}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        forceRedirectUrl="/onboarding"
        fallbackRedirectUrl="/onboarding"
        oauthFlow="redirect"
      />
    </AuthShell>
  );
}
