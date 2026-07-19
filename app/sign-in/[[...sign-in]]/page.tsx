import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { clerkAuthAppearance } from '@/components/auth/clerkAppearance';

export default function SignInPage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    return (
      <AuthShell
        cardTitle="Authentication is not configured"
        cardSubtitle="Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to this environment before signing in."
        footer={
          <Link href="/" className="auth-link">
            Return to ApprovLine
          </Link>
        }
      >
        <div className="auth-configuration-notice" role="alert">
          Sign-in is temporarily unavailable in this environment.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      cardTitle="Sign in"
      cardSubtitle="Use email/password, email OTP, Google, or Microsoft 365. Phone login is disabled."
      footer={
        <>
          New to ApprovLine?{' '}
          <Link href="/sign-up" className="auth-link">
            Create account
          </Link>
        </>
      }
    >
      <SignIn
        appearance={clerkAuthAppearance}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        forceRedirectUrl="/get-started"
        fallbackRedirectUrl="/get-started"
        oauthFlow="redirect"
        transferable={false}
      />
    </AuthShell>
  );
}
