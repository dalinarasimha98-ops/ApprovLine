import { SignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { clerkAuthAppearance } from '@/components/auth/clerkAppearance';

export default function SignUpPage() {
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
