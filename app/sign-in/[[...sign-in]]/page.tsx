import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { EmailSignInForm } from '@/components/auth/EmailSignInForm';

export default function SignInPage() {
  return (
    <AuthShell
      title="Sign in with email"
      subtitle="Use your work email. ApprovLine does not require phone-number authentication."
      footer={
        <>
          Need an account?{' '}
          <Link href="/sign-up" className="font-bold text-[#2155d9]">
            Start free
          </Link>
        </>
      }
    >
      <EmailSignInForm />
    </AuthShell>
  );
}
