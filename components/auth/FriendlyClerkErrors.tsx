'use client';

import { useEffect } from 'react';

const friendlyMessages = [
  {
    patterns: ["couldn't find your account", 'could not find your account', 'identifier not found', 'account not found'],
    message: 'No account exists for this email. Create a free account.',
  },
  {
    patterns: ['password is incorrect', 'incorrect password', 'invalid password'],
    message: 'Incorrect password. Please try again.',
  },
  {
    patterns: ['is not a valid email', 'invalid email', 'email address is invalid'],
    message: 'Enter a valid work email.',
  },
  {
    patterns: ['verification required', 'verify your email', 'email address must be verified'],
    message: 'Please verify your email before continuing.',
  },
];

function friendlyMessageFor(text: string) {
  const normalized = text.toLowerCase();
  return friendlyMessages.find((item) => item.patterns.some((pattern) => normalized.includes(pattern)))?.message;
}

export function FriendlyClerkErrors() {
  useEffect(() => {
    const root = document.querySelector('.auth-card');
    if (!root) return;

    const rewrite = () => {
      root.querySelectorAll('[role="alert"], .cl-formFieldErrorText, .cl-alertText').forEach((element) => {
        const replacement = friendlyMessageFor(element.textContent ?? '');
        if (replacement && element.textContent !== replacement) {
          element.textContent = replacement;
        }
      });
    };

    rewrite();
    const observer = new MutationObserver(rewrite);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
