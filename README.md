# Vercel Edge Middleware for redirection.io

This package allow to use redirection.io with Vercel Edge Middleware.

## Installation

```bash
npm install @redirectionio/vercel-middleware
```

## Usage

Create a `middleware.ts` file in your project with the following content:

```typescript
import redirectionioMiddleware from '@redirectionio/vercel-middleware';

export default middleware = redirectionioMiddleware;
```

Set the `REDIRECTIONIO_TOKEN` environment variable in your vercel project settings.

Then deploy your project to Vercel.

```bash
vercel deploy
```
