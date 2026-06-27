'use client';

import { useSignIn } from '@clerk/nextjs';
import { useState } from 'react';

type SignInMode = 'password' | 'email_code';

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error && 'errors' in error) {
    const clerkError = error as { errors?: Array<{ longMessage?: string; message?: string }> };
    return clerkError.errors?.[0]?.longMessage ?? clerkError.errors?.[0]?.message ?? 'Unable to sign in.';
  }
  return error instanceof Error ? error.message : 'Unable to sign in.';
}

export function EmailSignInForm() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const [mode, setMode] = useState<SignInMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function activate(createdSessionId: string | null) {
    if (!setActive) return;
    if (!createdSessionId) {
      setStatus('Sign-in needs another verification step. Email-only first factor is required for this app.');
      return;
    }
    await setActive({ session: createdSessionId });
    window.location.assign('/get-started');
  }

  async function submitPassword() {
    if (!signIn) return;
    const result = await signIn.create({
      strategy: 'password',
      identifier: email.trim().toLowerCase(),
      password,
    });
    await activate(result.createdSessionId);
  }

  async function sendEmailCode() {
    if (!signIn) return;
    const signInAttempt = await signIn.create({ identifier: email.trim().toLowerCase() });
    const emailFactor = signInAttempt.supportedFirstFactors?.find(
      (factor) => factor.strategy === 'email_code',
    );

    if (!emailFactor || emailFactor.strategy !== 'email_code') {
      setStatus('Email code sign-in is not enabled in Clerk. Enable email OTP or use email/password.');
      return;
    }

    await signInAttempt.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: emailFactor.emailAddressId,
    });
    setCodeSent(true);
    setStatus('Check your email for the sign-in code.');
  }

  async function verifyEmailCode() {
    if (!signIn) return;
    const result = await signIn.attemptFirstFactor({
      strategy: 'email_code',
      code: code.trim(),
    });
    await activate(result.createdSessionId);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isLoaded || !signIn || !setActive) return;
    setStatus(null);
    setIsSubmitting(true);
    try {
      if (mode === 'password') {
        await submitPassword();
      } else if (codeSent) {
        await verifyEmailCode();
      } else {
        await sendEmailCode();
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
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-slate-200 px-3 py-2"
        />
      </div>
      {mode === 'password' ? (
        <div className="grid gap-2">
          <label htmlFor="password" className="text-sm font-bold text-slate-900">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2"
          />
        </div>
      ) : null}
      {mode === 'email_code' && codeSent ? (
        <div className="grid gap-2">
          <label htmlFor="code" className="text-sm font-bold text-slate-900">
            Email code
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
      ) : null}
      {status ? <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">{status}</p> : null}
      <button
        type="submit"
        disabled={!isLoaded || isSubmitting}
        className="rounded-md bg-[#2155d9] px-4 py-2 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? 'Please wait...' : mode === 'email_code' && !codeSent ? 'Send email code' : 'Continue'}
      </button>
      <button
        type="button"
        onClick={() => {
          setMode(mode === 'password' ? 'email_code' : 'password');
          setCodeSent(false);
          setStatus(null);
        }}
        className="text-sm font-bold text-[#2155d9]"
      >
        {mode === 'password' ? 'Use email code instead' : 'Use password instead'}
      </button>
    </form>
  );
}
