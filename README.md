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

Create a `middleware.ts` (or `proxy.ts` depending on your Next.js version) file in the root of your Vercel application (at the same level as the `app` or `pages` folders,
possibly in a `src` folder if your project uses one) with the following content:

> For Next.js usage, see [the Next.js section](#nextjs)

```typescript
import redirectionioMiddleware from "@redirection.io/vercel-middleware";

export default redirectionioMiddleware;

export const config = {
    unstable_allowDynamic: ["/node_modules/@redirection.io/**"],
};
```

Set the `REDIRECTIONIO_TOKEN` environment variable in your vercel project settings.

Then create a `instrumentation.ts` file in the same folder as the `proxy.ts` file with the following content:

```typescript
import { registerRedirectionIoInstrumentation } from "@redirection.io/vercel-middleware/instrumentation";

export const register = async () => {
  registerRedirectionIoInstrumentation();
};
```

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

### Webpack

If you are using Webpack in your Next.js application, you will need to add the following in your Next config :

```typescript
import { redirectionIoWebpackWasmRule } from "@redirection.io/vercel-middleware/webpack";

const nextConfig: NextConfig = {
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.module.rules.push(redirectionIoWebpackWasmRule);
    }

    return config;
  },
};
```

## Vercel Firewall: allow redirection.io managed instances

Vercel's firewall may block the IPs of redirection.io managed instances. This package can keep a Vercel custom firewall rule (action `bypass`) in sync with the IP list published at `https://api.redirection.io/ips`. The rule is created at the top of the custom rules, then updated only when the IP list changes.

Environment variables:

| Variable                               | Required | Description                                                                         |
| -------------------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `VERCEL_TOKEN`                         | yes      | Vercel access token with access to the project                                      |
| `VERCEL_PROJECT_ID`                    | yes      | Vercel project id (`prj_...`)                                                       |
| `VERCEL_TEAM_ID`                       | no       | Vercel team id (`team_...`), required if the project belongs to a team              |
| `REDIRECTIONIO_FIREWALL_RULE_NAME`     | no       | Name of the managed rule, defaults to `redirection.io managed instances`            |
| `REDIRECTIONIO_FIREWALL_BYPASS_SYSTEM` | no       | `true` to also bypass Vercel system mitigations (beta feature, requires access)     |

### Periodic CI run

```yaml
name: Sync redirection.io IPs in Vercel firewall
on:
    schedule:
        - cron: "0 * * * *"
    workflow_dispatch:
jobs:
    sync:
        runs-on: ubuntu-latest
        steps:
            - uses: actions/setup-node@v4
              with:
                  node-version: 22
            - run: npx -p @redirection.io/vercel-middleware redirectionio-vercel-firewall-sync
              env:
                  VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
                  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
                  VERCEL_TEAM_ID: ${{ secrets.VERCEL_TEAM_ID }}
```

### Vercel Cron Job

Create a route handler (Next.js App Router example, `app/api/redirectionio-firewall/route.ts`):

```typescript
import { createFirewallSyncRouteHandler } from "@redirection.io/vercel-middleware/firewall";

export const GET = createFirewallSyncRouteHandler();
```

Then declare the cron in `vercel.json`:

```json
{
    "crons": [{ "path": "/api/redirectionio-firewall", "schedule": "0 * * * *" }]
}
```

The handler requires the `CRON_SECRET` environment variable: Vercel sends it as `Authorization: Bearer <CRON_SECRET>` when calling cron jobs. Make sure the redirection.io middleware does not handle this route (see `matcherRegex`).

You can also call `syncRedirectionIoFirewallRule(options)` directly from your own code.

### Development

Run the example apps and the lib compilation :

```bash
yarn dev
```

Before making a PR, run `yarn changeset` and select the packages to update. If your changes are not related to a lib update, simply run `yarn changeset add --empty`.
