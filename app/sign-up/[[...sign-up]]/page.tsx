import Link from 'next/link';
import { AuthShell } from '@/components/auth/AuthShell';
import { EmailSignUpForm } from '@/components/auth/EmailSignUpForm';

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      subtitle="Start with your work email and verify by email code. No phone number is required."
      footer={
        <>
          Already registered?{' '}
          <Link href="/sign-in" className="font-bold text-[#2155d9]">
            Sign in
          </Link>
        </>
      }
    >
      <EmailSignUpForm />
    </AuthShell>
  );
}
