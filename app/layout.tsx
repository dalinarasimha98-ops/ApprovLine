import type { Metadata } from 'next';
import { ClerkProvider } from '@clerk/nextjs';
import { ThemeProvider } from '@/components/system/ThemeProvider';
import { readThemeCookie } from '@/lib/theme-cookie';
import './globals.css';

export const metadata: Metadata = {
  title: 'ApprovLine - Universal Approval Intelligence Platform',
  description:
    'AI-powered approval intelligence for compliance, audit trails, and business decision records.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  // Read BEFORE any markup renders, so the very first byte of HTML already
  // carries the correct theme - this (not a client-side correction after
  // hydration) is what actually prevents a flash of the wrong theme.
  // 'system' intentionally omits the attribute entirely: the CSS media
  // query in app/globals.css then resolves it purely from
  // prefers-color-scheme, before any JavaScript runs.
  const theme = await readThemeCookie();
  const htmlDataTheme = theme === 'system' ? undefined : theme;
  const content = (
    <html lang="en" data-theme={htmlDataTheme}>
      <body>
        <ThemeProvider initialTheme={theme}>{children}</ThemeProvider>
      </body>
    </html>
  );

  if (!publishableKey) {
    return content;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/get-started"
      afterSignUpUrl="/onboarding"
      signInFallbackRedirectUrl="/get-started"
      signUpFallbackRedirectUrl="/onboarding"
      localization={{
        formFieldLabel__emailAddress: 'Work email',
        formFieldInputPlaceholder__emailAddress: 'you@company.com',
        formFieldInput__emailAddress_format: 'Enter a valid work email.',
        formFieldInputPlaceholder__password: 'Enter your password',
        socialButtonsBlockButton: 'Continue with {{provider|titleize}}',
        dividerText: 'or use work email',
        signIn: {
          start: {
            title: 'Sign in to ApprovLine',
            subtitle: 'Use your work email, Google, or Microsoft. Phone-number login is disabled.',
            actionText: 'New to ApprovLine?',
            actionLink: 'Create account',
          },
          password: {
            title: 'Enter your password',
            subtitle: 'Incorrect password. Please try again, or use email OTP if enabled.',
          },
          emailCode: {
            title: 'Check your email',
            subtitle: 'Enter the verification code sent to your work email.',
            formTitle: 'Email verification code',
            resendButton: 'Send a new code',
          },
        },
        signUp: {
          start: {
            title: 'Create your ApprovLine account',
            subtitle: 'Start with work email, Google, or Microsoft 365. No phone number is required.',
            actionText: 'Already have an account?',
            actionLink: 'Sign in',
          },
          emailCode: {
            title: 'Verify your email',
            subtitle: 'Please verify your email before continuing.',
            formTitle: 'Email verification code',
            formSubtitle: 'Enter the code sent to your work email.',
            resendButton: 'Send a new code',
          },
        },
      }}
    >
      {content}
    </ClerkProvider>
  );
}
