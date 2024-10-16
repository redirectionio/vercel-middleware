import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { createRedirectionIoMiddleware as createEdgeMiddleware } from "./middleware";
import { RequestContext } from "@vercel/edge";

type Middleware = (request: NextRequest, context: NextFetchEvent) => NextResponse | Promise<NextResponse>;

type CreateMiddlewareConfig = {
    previousMiddleware?: Middleware;
    nextMiddleware?: Middleware;
};

export const createRedirectionIoMiddleware = (config: CreateMiddlewareConfig): Middleware => {
    let previousMiddleware;
    let nextMiddleware;

    const configPreviousMiddleware = config.previousMiddleware;
    const configNextMiddleware = config.nextMiddleware;

    if (configPreviousMiddleware) {
        previousMiddleware = (req: Request, context: RequestContext) => {
            return configPreviousMiddleware(new NextRequest(req.url, req), context as any as NextFetchEvent);
        };
    }

    if (configNextMiddleware) {
        nextMiddleware = (req: Request, context: RequestContext) => {
            return configNextMiddleware(new NextRequest(req.url, req), context as any as NextFetchEvent);
        };
    }

    const edgeMiddleware = createEdgeMiddleware({
        previousMiddleware,
        nextMiddleware,
    });

    return async (req: NextRequest, context: NextFetchEvent) => {
        const response = await edgeMiddleware(req, context);

        return new NextResponse(response.body, response);
    };
};
