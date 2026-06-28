import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { clerkAuthAppearance } from '@/components/auth/clerkAppearance';

export default function SignInPage() {
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
