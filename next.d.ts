import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
type Middleware = (request: NextRequest, context: NextFetchEvent) => NextResponse | Promise<NextResponse>;
type CreateMiddlewareConfig = {
    previousMiddleware?: Middleware;
    nextMiddleware?: Middleware;
    matcherRegex?: string | null;
    mode?: "full" | "light";
    logged?: boolean;
};
export declare const createRedirectionIoMiddleware: (config: CreateMiddlewareConfig) => Middleware;
export {};
