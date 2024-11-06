# Vercel Edge Middleware for redirection.io

This package allows to use redirection.io within
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
import redirectionioMiddleware from "@redirection.io/vercel-middleware";

export default redirectionioMiddleware;

export const config = {
    unstable_allowDynamic: ["/node_modules/@redirection.io/**"],
};
```

Set the `REDIRECTIONIO_TOKEN` environment variable in your vercel project settings.

Then, deploy your project to Vercel.

```bash
vercel deploy
```

## Usage with an existing middleware

You may have an existing middleware in your Vercel project. In this case, you can use
the `createRedirectionIoMiddleware` function which allows to chain existing middleware with redirection.io middleware.

```typescript
import { createRedirectionIoMiddleware } from "@redirection.io/vercel-middleware";

const myExistingMiddleware = (request: Request) => {
    // Your existing middleware logic

    return next();
};

const middleware = createRedirectionIoMiddleware({
    previousMiddleware: myExistingMiddleware, // In this case your middleware is executed before redirection.io middleware
    nextMiddleware: myExistingMiddleware, // In this case your middleware is executed after redirection.io middleware
    // Optional: matcher to specify which routes should be ignored by redirection.io middleware
    // Default: "^/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)$"
    matcherRegex: "^/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)$",
    // Optional: If light, redirection.io middleware will only redirect and not override the response
    // Default: "full"
    mode: "light",
    // Optional: If true, redirection.io middleware will log information in Redirection.io
    // Default: true
    logged: true,
});

export default middleware;
```

By default, our middleware ignores certain routes even if there's an exported configuration. The ignored routes are:

-   `/api/*` routes
-   `/next/*` (Next.js internals)
-   `/static/*` (inside `/public`)
-   all root files inside /public (e.g. /favicon.ico)

If you want the middleware to handle all routes without any exclusions, you can set the `matcherRegex` option to `null`:

```typescript
createRedirectionIoMiddleware({ matcherRegex: null });
```

Here's a summary of the middleware options:

| Option               | Type              | Description                                                                                              |
| -------------------- | ----------------- | -------------------------------------------------------------------------------------------------------- |
| `previousMiddleware` | Function          | Middleware to be executed before redirection.io middleware                                               |
| `nextMiddleware`     | Function          | Middleware to be executed after redirection.io middleware                                                |
| `matcherRegex`       | String or null    | Regex to specify which routes should be handled by redirection.io middleware                             |
| `mode`               | `full` or `light` | If `light`, redirection.io middleware will only redirect and not override the response (default: `full`) |
| `logged`             | Boolean           | If true, redirection.io middleware will log information in Redirection.io (default: `true`)              |

## Light mode

The response rewriting features (e.g., SEO overrides, custom body, etc.) of redirection.io are currently not compatible with React Server Components (RSC). This is due to the fact that Vercel’s middleware implementation does not follow standard middleware protocols, requiring us to fetch requests, which is incompatible with both RSC and Vercel’s implementation.

However, we provide a light mode that supports RSC by offering only the redirection functionality. To enable this mode, simply set the `mode` option to `light`.

This allows you to implement redirection behavior without modifying response content, ensuring smooth operation with RSC.

```typescript
const middleware = createRedirectionIoMiddleware({
    // …
    mode: "light",
});
```

## Next.js

If you are using next.js middlewares, you can use the `createRedirectionIoMiddleware` method
from `@redirection.io/vercel-middleware/next` which is compatible with `NextRequest` type.

```diff
- import { createRedirectionIoMiddleware } from "@redirection.io/vercel-middleware";
+ import { createRedirectionIoMiddleware } from "@redirection.io/vercel-middleware/next";
+ import { NextRequest } from "next/server";

- const myExistingMiddleware = (request: Request) => {
+ const myExistingMiddleware = (request: NextRequest) => {
    return next();
};

```

### Development

Build

```bash
yarn run tsc
```
