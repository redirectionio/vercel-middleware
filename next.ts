import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { createRedirectionIoMiddleware as createEdgeMiddleware } from "./middleware";
import { NextMiddleware } from "./types";

type CreateMiddlewareConfig = {
    previousMiddleware?: NextMiddleware;
    nextMiddleware?: NextMiddleware;
    matcherRegex?: string | null;
    logged?: boolean;
    includedRequestHeadersInResponse?: string[];
};

export const createRedirectionIoMiddleware = (config: CreateMiddlewareConfig): NextMiddleware => {
    let previousMiddleware: NextMiddleware | undefined;
    let nextMiddleware: NextMiddleware | undefined;

    const configPreviousMiddleware = config.previousMiddleware;
    const configNextMiddleware = config.nextMiddleware;
    const configMatcherRegex = config.matcherRegex;

    if (configPreviousMiddleware) {
        previousMiddleware = (req: Request, evt?: NextFetchEvent) => {
            return configPreviousMiddleware(new NextRequest(req), evt);
        };
    }

    if (configNextMiddleware) {
        nextMiddleware = (req: Request, evt?: NextFetchEvent) => {
            return configNextMiddleware(new NextRequest(req), evt);
        };
    }

    const edgeMiddleware = createEdgeMiddleware<NextRequest, NextFetchEvent>({
        previousMiddleware,
        nextMiddleware,
        ...(configMatcherRegex ? { matcherRegex: configMatcherRegex } : {}),
        logged: config.logged ?? true,
        // By default, handle next intl headers
        includedRequestHeadersInResponse: ["x-next-intl-locale", ...(config.includedRequestHeadersInResponse ?? [])],
    });

    return async (req: NextRequest, evt?: NextFetchEvent) => {
        const response = await edgeMiddleware(req, evt);

        return new NextResponse(response.body, response);
    };
};
