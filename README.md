# ApprovLine

Universal approval intelligence landing page and AI classification demo.

## What is included

- `public/index.html` - deployed landing page
- `api/classify.js` - Vercel serverless approval classifier powered by Anthropic
- `api/health.js` - Vercel health check endpoint
- `vercel.json` - rewrites for static pages and API routes

## Required Vercel environment variable

Set this in Vercel Project Settings -> Environment Variables:

```bash
ANTHROPIC_API_KEY=sk-ant-your_key_here
```

Without this key, the landing page still works, but the live AI demo will show a configuration warning.

## Local checks

```bash
npm run check
npm run build
```

## Deployment

Push to `main`. Vercel will serve `public/index.html` and expose:

- `/api/health`
- `/api/classify`
