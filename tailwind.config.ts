import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        approvline: {
          blue: '#2155d9',
          ink: '#090b12',
          soft: '#f5f7fb',
        },
        // Theme-aware application tokens - backed by the --al-*-rgb CSS
        // custom properties in app/globals.css, which flip per [data-theme]/
        // prefers-color-scheme. The rgb(var(...) / <alpha-value>) pattern is
        // what lets opacity modifiers (bg-al-warning/10, border-al-border/60)
        // keep working on a CSS-variable-backed color. Only the customer app
        // shell/pages consume these - the public marketing site keeps its
        // own fixed colors untouched.
        al: {
          bg: 'rgb(var(--al-bg-rgb) / <alpha-value>)',
          'bg-sidebar': 'rgb(var(--al-bg-sidebar-rgb) / <alpha-value>)',
          surface: 'rgb(var(--al-surface-rgb) / <alpha-value>)',
          'surface-elevated': 'rgb(var(--al-surface-elevated-rgb) / <alpha-value>)',
          'surface-sunken': 'rgb(var(--al-surface-sunken-rgb) / <alpha-value>)',
          border: 'rgb(var(--al-border-rgb) / <alpha-value>)',
          'border-strong': 'rgb(var(--al-border-strong-rgb) / <alpha-value>)',
          text: 'rgb(var(--al-text-primary-rgb) / <alpha-value>)',
          'text-secondary': 'rgb(var(--al-text-secondary-rgb) / <alpha-value>)',
          'text-muted': 'rgb(var(--al-text-muted-rgb) / <alpha-value>)',
          accent: 'rgb(var(--al-accent-rgb) / <alpha-value>)',
          'accent-hover': 'rgb(var(--al-accent-hover-rgb) / <alpha-value>)',
          'accent-text': 'rgb(var(--al-accent-text-rgb) / <alpha-value>)',
          success: 'rgb(var(--al-success-rgb) / <alpha-value>)',
          warning: 'rgb(var(--al-warning-rgb) / <alpha-value>)',
          danger: 'rgb(var(--al-danger-rgb) / <alpha-value>)',
          info: 'rgb(var(--al-info-rgb) / <alpha-value>)',
          focus: 'rgb(var(--al-focus-rgb) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};

export default config;
