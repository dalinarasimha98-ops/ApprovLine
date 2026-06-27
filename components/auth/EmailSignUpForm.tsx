'use client';

import { useSignUp } from '@clerk/nextjs';
import { useState } from 'react';

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'errors' in error) {
    const clerkError = error as { errors?: Array<{ longMessage?: string; message?: string }> };
    return clerkError.errors?.[0]?.longMessage ?? clerkError.errors?.[0]?.message ?? 'Unable to create account.';
  }
  return error instanceof Error ? error.message : 'Unable to create account.';
}

export function EmailSignUpForm() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsVerification, setNeedsVerification] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function activate(createdSessionId: string | null) {
    if (!setActive) return;
    if (!createdSessionId) {
      setStatus('Account created. Complete email verification to continue.');
      setNeedsVerification(true);
      return;
    }
    await setActive({ session: createdSessionId });
    window.location.assign('/onboarding');
  }

  async function createAccount() {
    if (!signUp) return;
    const result = await signUp.create({
      emailAddress: email.trim().toLowerCase(),
      password,
    });

    if (result.status === 'complete') {
      await activate(result.createdSessionId);
      return;
    }

    await result.prepareEmailAddressVerification({ strategy: 'email_code' });
    setNeedsVerification(true);
    setStatus('Check your email for the verification code.');
  }

  async function verifyEmail() {
    if (!signUp) return;
    const result = await signUp.attemptEmailAddressVerification({ code: code.trim() });
    if (result.status === 'complete') {
      await activate(result.createdSessionId);
      return;
    }
    setStatus('Email verification is still pending. Enter the latest code from your inbox.');
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signUp || !setActive) return;
    setStatus(null);
    setIsSubmitting(true);
    try {
      if (needsVerification) {
        await verifyEmail();
      } else {
        await createAccount();
      }
    } catch (error) {
      setStatus(errorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <label htmlFor="email" className="text-sm font-bold text-slate-900">
          Work email
        </label>
        <input
          id="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          disabled={needsVerification}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-slate-200 px-3 py-2 disabled:bg-slate-50"
        />
      </div>
      {!needsVerification ? (
        <div className="grid gap-2">
          <label htmlFor="password" className="text-sm font-bold text-slate-900">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2"
          />
        </div>
      ) : (
        <div className="grid gap-2">
          <label htmlFor="code" className="text-sm font-bold text-slate-900">
            Email verification code
          </label>
          <input
            id="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(event) => setCode(event.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2"
          />
        </div>
      )}
      {status ? <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{status}</p> : null}
      <button
        type="submit"
        disabled={!isLoaded || isSubmitting}
        className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Please wait...' : needsVerification ? 'Verify email' : 'Create account'}
      </button>
    </form>
  );
}
