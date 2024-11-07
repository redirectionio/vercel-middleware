## 0.4.0 - Unreleased

-   Add light mode support
-   [Skip redirectionio for server actions and components](https://github.com/redirectionio/vercel-middleware/pull/8)

## 0.3.12 - 05/10/2024

-   It is now recommended to avoid using this middleware on `/api`, `/_next`, `/_static` or `/_vercel` paths to avoid
    buggy behavior from vercel
-   Allow to configure a specific matcher to avoid executing this middleware on same paths, by default this middleware
    will not be executed on `/api`, `/_next`, `/_static` or `/_vercel` paths

## 0.3.11 - 16/10/2024

-   Avoid sending empty header name to libredirectionio
-   Update libredirectionio dependency

## 0.3.10 - 16/10/2024

-   Add prettier to format code
-   Add cache no store for middleware requests
-   Skip middleware for "Vercel Edge Functions" user agent

## 0.3.9 - 09/10/2024

-   Set next.js as an optional peer dependency

## 0.3.8 - 16/08/2024

-   Fix infinite loop on some cases
-   Avoid following redirections on middleware requests

## 0.3.7 - 02/08/2024

-   Fix next and previous middleware skipped if there is no token

## 0.3.5 - 30/05/2024

-   Fix creating a new request when using a next js request

## 0.3.0 - 28/05/2024

-   Add support for next.js

## 0.2.1 - 28/05/2024

-   Rebuild js files to fix an issue with the package

## 0.2.0 - 28/05/2024

-   Initial release
