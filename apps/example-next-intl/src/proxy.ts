import { routing } from "@/i18n/routing";
import { createRedirectionIoMiddleware } from "@redirection.io/vercel-middleware/next";
import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";

const routingMiddleware = createMiddleware(routing);

function middleware(request: Request) {
    const response = routingMiddleware(request as NextRequest);
    return response;
}

export default createRedirectionIoMiddleware({
    nextMiddleware: middleware,
});

// export default middleware;

export const config = {
    unstable_allowDynamic: ["/node_modules/@redirection.io/**"],
    matcher: [
        // Match all pathnames except for
        // - … if they start with `/api`, `/_next` or `/_vercel`
        // - … the ones containing a dot (e.g. `favicon.ico`)
        "/((?!api|_next/static|_next/image|.*\\.png$).*)?",
    ],
};
