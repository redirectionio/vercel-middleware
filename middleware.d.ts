import { RequestContext } from "@vercel/edge";
import type { NextRequest } from "next/server";
type Middleware = (request: Request | NextRequest, context: RequestContext) => Response | Promise<Response>;
type CreateMiddlewareConfig = {
    previousMiddleware?: Middleware;
    nextMiddleware?: Middleware;
    matcherRegex?: string | null;
    mode?: "full" | "light";
    logged?: boolean;
};
export declare const createRedirectionIoMiddleware: (config: CreateMiddlewareConfig) => Middleware;
declare const defaultMiddleware: Middleware;
export default defaultMiddleware;
