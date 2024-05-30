import { NextRequest, NextResponse } from "next/server";
import { createRedirectionIoMiddleware as createEdgeMiddleware } from "./middleware";
export const createRedirectionIoMiddleware = (config) => {
    let previousMiddleware;
    let nextMiddleware;
    const configPreviousMiddleware = config.previousMiddleware;
    const configNextMiddleware = config.nextMiddleware;
    if (configPreviousMiddleware) {
        previousMiddleware = (req, context) => {
            return configPreviousMiddleware(new NextRequest(req), context);
        };
    }
    if (configNextMiddleware) {
        nextMiddleware = (req, context) => {
            return configNextMiddleware(new NextRequest(req), context);
        };
    }
    const edgeMiddleware = createEdgeMiddleware({
        previousMiddleware,
        nextMiddleware,
    });
    return async (req, context) => {
        const response = await edgeMiddleware(req, context);
        return new NextResponse(response.body, response);
    };
};
