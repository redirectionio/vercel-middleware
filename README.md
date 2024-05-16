# Vercel Edge Middleware for redirection.io

This package allow to use redirection.io within a Vercel Edge Middleware.

Look at our documentation about our Vercel Edge Middleware integration here: [https://redirection.io/documentation/developer-documentation/vercel-middleware-integration](https://redirection.io/documentation/developer-documentation/vercel-middleware-integration)

## Installation

```bash
npm install @redirection.io/vercel-middleware

// or with yarn
yarn add @redirection.io/vercel-middleware
```

## Usage

Create a `middleware.ts` file in the root of your Vercel application (at the same level as the `app` or `pages` folders, possibly in a `src` folder if your project uses one) with the following content:

```typescript
import redirectionioMiddleware from '@redirection.io/vercel-middleware';

export default redirectionioMiddleware;

export const config = {
  unstable_allowDynamic: [
    '/node_modules/@redirection.io/**',
  ],
}
```

Set the `REDIRECTIONIO_TOKEN` environment variable in your vercel project settings.

Then, deploy your project to Vercel.

```bash
vercel deploy
```
