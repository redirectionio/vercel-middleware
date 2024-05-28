# Vercel Edge Middleware for redirection.io

This package allow to use redirection.io within
a [Vercel Edge Middleware](https://vercel.com/docs/functions/edge-middleware).

Look at our documentation about our Vercel Edge Middleware integration
here: [https://redirection.io/documentation/developer-documentation/vercel-middleware-integration](https://redirection.io/documentation/developer-documentation/vercel-middleware-integration)

## Installation

```bash
npm install @redirection.io/vercel-middleware

// or with yarn
yarn add @redirection.io/vercel-middleware
```

## Usage

Create a `middleware.ts` file in the root of your Vercel application (at the same level as the `app` or `pages` folders,
possibly in a `src` folder if your project uses one) with the following content:

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

## Usage with an existing middleware

You may have an existing middleware in your Vercel project. In this case, you can use the `createMiddleware` function
which allows to chain existing middleware with redirection.io middleware.

```typescript
import {createRedirectionIoMiddleware} from '@redirection.io/vercel-middleware';

const myExistingMiddleware = (request: Request) => {
    // Your existing middleware logic

    return next();
}

const middleware = createRedirectionIoMiddleware({
    previousMiddleware: myExistingMiddleware, // In this case your middleware is executed before redirection.io middleware
    nextMiddleware: myExistingMiddleware, // In this case your middleware is executed after redirection.io middleware
});

export default middleware;
```

### Next.js

If you are using next.js middlewares, you can use the `createRedirectionIoMiddleware` method
from `@redirection.io/vercel-middleware/next` which is compatible with `NextRequest` type.

```typescript
import {createRedirectionIoMiddleware} from '@redirection.io/vercel-middleware/next';
import {NextRequest} from "next/server";

const myExistingMiddleware = (request: NextRequest) => {
    // Your existing middleware logic

    return next();
}

const middleware = createRedirectionIoMiddleware({
    previousMiddleware: myExistingMiddleware, // In this case your middleware is executed before redirection.io middleware
    nextMiddleware: myExistingMiddleware, // In this case your middleware is executed after redirection.io middleware
});

export default middleware;
```
