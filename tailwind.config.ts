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
      },
    },
  },
  plugins: [],
};

export default config;
