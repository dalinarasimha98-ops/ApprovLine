import type { Appearance } from '@clerk/types';

export const clerkAuthAppearance: Appearance = {
  variables: {
    colorPrimary: '#2155d9',
    colorText: '#090b12',
    colorTextSecondary: '#5c6370',
    colorBackground: '#ffffff',
    colorInputBackground: '#ffffff',
    colorInputText: '#090b12',
    borderRadius: '8px',
    fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  elements: {
    rootBox: {
      width: '100%',
    },
    cardBox: {
      width: '100%',
      boxShadow: 'none',
      border: '0',
      background: 'transparent',
    },
    card: {
      width: '100%',
      padding: '0',
      boxShadow: 'none',
      border: '0',
      background: 'transparent',
    },
    header: {
      display: 'none',
    },
    footer: {
      display: 'none',
    },
    socialButtonsBlockButton: {
      borderColor: '#d9dde5',
      borderRadius: '8px',
      minHeight: '46px',
      color: '#101828',
      fontSize: '14px',
      fontWeight: '800',
      boxShadow: '0 1px 2px rgba(16, 24, 40, .05)',
    },
    socialButtonsBlockButtonText: {
      fontWeight: '800',
    },
    dividerLine: {
      background: '#e5e7eb',
    },
    dividerText: {
      color: '#6b7280',
      fontSize: '12px',
      fontWeight: '700',
      textTransform: 'uppercase',
    },
    formFieldLabel: {
      color: '#111827',
      fontSize: '13px',
      fontWeight: '800',
    },
    formFieldInput: {
      borderColor: '#d9dde5',
      borderRadius: '8px',
      minHeight: '46px',
      boxShadow: 'none',
      fontSize: '15px',
      fontWeight: '650',
    },
    formFieldInputShowPasswordButton: {
      color: '#2155d9',
    },
    formButtonPrimary: {
      minHeight: '46px',
      borderRadius: '8px',
      background: 'linear-gradient(180deg, #2f68f5, #1f53d8)',
      boxShadow: '0 14px 30px rgba(33, 85, 217, .28)',
      fontSize: '15px',
      fontWeight: '800',
    },
    formFieldErrorText: {
      color: '#be123c',
      fontWeight: '700',
    },
    alert: {
      borderRadius: '8px',
      borderColor: '#fecdd3',
      background: '#fff1f2',
      color: '#9f1239',
    },
    alertText: {
      color: '#9f1239',
      fontWeight: '700',
    },
    identityPreview: {
      borderRadius: '8px',
      borderColor: '#d9dde5',
    },
    footerActionText: {
      color: '#5c6370',
    },
    footerActionLink: {
      color: '#2155d9',
      fontWeight: '800',
    },
  },
};
