import { RequestContext } from "@vercel/edge";
import type { NextRequest } from "next/server";
type Middleware = (request: Request | NextRequest, context: RequestContext) => Response | Promise<Response>;
type CreateMiddlewareConfig = {
    previousMiddleware?: Middleware;
    nextMiddleware?: Middleware;
};
export declare const createRedirectionIoMiddleware: (config: CreateMiddlewareConfig) => Middleware;
declare const defaultMiddleware: Middleware;
export default defaultMiddleware;
