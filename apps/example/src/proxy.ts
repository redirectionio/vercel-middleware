import { createRedirectionIoMiddleware } from "@redirection.io/vercel-middleware/next";
import { NextResponse } from "next/server";

function previousMiddleware() {
    return NextResponse.next({
        headers: {
            "prev-header": "foobar",
        },
    });
}

function nextMiddleware(req: Request) {
    return NextResponse.next({
        headers: {
            "next-header": "foobar",
            ...Object.fromEntries(req.headers.entries()),
        },
    });
}

const rioMiddleware = createRedirectionIoMiddleware({
    previousMiddleware,
    nextMiddleware,
});

export default async function (request: Request) {
    // @ts-expect-error
    const response = await rioMiddleware(request);

    // prev-header and next-header are available in the response headers
    console.log(response.headers);

    return response;
}

export const config = {
    unstable_allowDynamic: ["/node_modules/@redirection.io/**"],
    matcher: [
        // Match all pathnames except for
        // - … if they start with `/api`, `/_next` or `/_vercel`
        // - … the ones containing a dot (e.g. `favicon.ico`)
        "/((?!api|_next/static|_next/image|.*\\.png$).*)?",
    ],
};
