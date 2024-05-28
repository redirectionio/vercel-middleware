import { RequestContext } from "@vercel/edge";
export type Middleware = (request: Request, context: RequestContext) => Promise<Response>;
export type CreateMiddlewareConfig = {
    previousMiddleware?: Middleware;
    nextMiddleware?: Middleware;
};
export declare const createMiddleware: (config: CreateMiddlewareConfig) => Middleware;
declare const defaultMiddleware: Middleware;
export default defaultMiddleware;
