import * as redirectionio from "@redirection.io/redirectionio";
import { next, RequestContext } from "@vercel/edge";
import { ipAddress } from "@vercel/functions";
import {
    createRedirectionIORequest,
    REDIRECTIONIO_ACTION_HEADER,
    REDIRECTIONIO_MATCH_TIME_TIME_HEADER,
    REDIRECTIONIO_PROXY_RESPONSE_TIME_HEADER,
    REDIRECTIONIO_START_TIME_HEADER,
} from "./common";
import { getEnv } from "./env";
import { Middleware } from "./types";

const {
    REDIRECTIONIO_TOKEN,
    REDIRECTIONIO_INSTANCE_NAME,
    REDIRECTIONIO_VERSION,
    REDIRECTIONIO_ADD_HEADER_RULE_IDS,
    REDIRECTIONIO_TIMEOUT,
} = getEnv();

const DEFAULT_CONFIG = {
    matcherRegex: "^/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)$",
    logged: true,
} as const;

type FetchResponse = (request: Request, useFetch: boolean) => Promise<Response>;

type CreateMiddlewareConfig<R extends Request = Request, C extends RequestContext = RequestContext> = {
    previousMiddleware?: Middleware<R, C>;
    nextMiddleware?: Middleware<R, C>;
    matcherRegex?: string | null;
    logged?: boolean;
    includedRequestHeadersInResponse?: string[];
};

export const createRedirectionIoMiddleware = <R extends Request = Request, C extends RequestContext = RequestContext>(
    config: CreateMiddlewareConfig<R, C>,
): Middleware<R, C> => {
    return async (request, context) => {
        const pathname = new URL(request.url).pathname;

        config = {
            ...DEFAULT_CONFIG,
            ...config,
        };

        if (config.matcherRegex && !pathname.match(config.matcherRegex)) {
            return next();
        }

        // Avoid infinite loop
        if (
            request.headers.get("x-redirectionio-middleware") === "true" ||
            request.headers.get("User-Agent") === "Vercel Edge Functions" ||
            request.headers.get("Accept") === "text/x-component" ||
            request.headers.get("Next-Action")?.length
        ) {
            return next();
        }

        const body = request.body ? await request.arrayBuffer() : null;

        let middlewareRequest = request.clone();

        if (config.previousMiddleware) {
            const response = await config.previousMiddleware(middlewareRequest as R, context);

            if (response.status !== 200) {
                return response;
            }

            middlewareRequest = middlewareResponseToRequest(middlewareRequest, response, body);
        }

        return handler(
            middlewareRequest,
            config.includedRequestHeadersInResponse,
            async (request, useFetch): Promise<Response> => {
                let response: Response | null = null;

                if (config.nextMiddleware) {
                    response = await config.nextMiddleware(request as R, context);

                    if (response.status !== 200) {
                        return response;
                    }

                    request = middlewareResponseToRequest(request, response, body);
                }

                if (!useFetch) {
                    return response ?? next();
                }

                // Disable for server-actions and components.
                if (
                    request.headers.get("Next-Action")?.length ||
                    request.headers.get("Accept") === "text/x-component"
                ) {
                    return response ?? next();
                }

                const fetchResponse = await fetch(request, {
                    redirect: "manual",
                    cache: "no-store",
                });

                const backendResponse = new Response(fetchResponse.body, fetchResponse);

                if (response) {
                    response.headers.forEach((value, key) => {
                        if (!key.startsWith("x-middleware-")) {
                            backendResponse.headers.set(key, value);
                        }
                    });
                }

                return backendResponse;
            },
        );
    };
};

const defaultMiddleware = createRedirectionIoMiddleware({});

export default defaultMiddleware;

async function handler(
    request: Request,
    includedRequestHeadersInResponse: string[] | undefined,
    fetchResponse: FetchResponse,
): Promise<Response> {
    if (!REDIRECTIONIO_TOKEN) {
        console.warn("No REDIRECTIONIO_TOKEN environment variable found. Skipping redirection.io middleware.");

        return fetchResponse(request, false);
    }

    const startTimestamp = Date.now();

    await redirectionio.init();

    const ip = ipAddress(request);
    const redirectionIORequest = createRedirectionIORequest({
        url: new URL(request.url),
        headers: Object.fromEntries(Object.entries(request.headers)) as Record<string, string>,
        method: request.method,
        ip,
    });
    const action = await fetchRedirectionIOAction(redirectionIORequest);
    const actionMatchTime = Date.now();
    const [response] = await proxy(request, action, includedRequestHeadersInResponse, (request) => {
        request.headers.set("x-redirectionio-middleware", "true");

        // skip fetch if we are in light mode
        return fetchResponse(request, action.need_proxification());
    });

    const proxyResponseTime = Date.now();

    response.headers.set(REDIRECTIONIO_PROXY_RESPONSE_TIME_HEADER, proxyResponseTime.toString());
    response.headers.set(REDIRECTIONIO_START_TIME_HEADER, startTimestamp.toString());
    response.headers.set(REDIRECTIONIO_MATCH_TIME_TIME_HEADER, actionMatchTime.toString());
    response.headers.set(REDIRECTIONIO_ACTION_HEADER, action.serialize());

    const url = new URL(request.url);
    const location = response.headers.get("Location");

    // Fix relative location header
    if (location && location.startsWith("/")) {
        response.headers.set("Location", url.origin + location);
    }

    return response;
}

function splitSetCookies(cookiesString: string) {
    const cookiesStrings = [];
    let pos = 0;
    let start;
    let ch;
    let lastComma;
    let nextStart;
    let cookiesSeparatorFound;

    function skipWhitespace() {
        while (pos < cookiesString.length && /\s/.test(cookiesString.charAt(pos))) {
            pos += 1;
        }
        return pos < cookiesString.length;
    }

    function notSpecialChar() {
        ch = cookiesString.charAt(pos);

        return ch !== "=" && ch !== ";" && ch !== ",";
    }

    while (pos < cookiesString.length) {
        start = pos;
        cookiesSeparatorFound = false;

        while (skipWhitespace()) {
            ch = cookiesString.charAt(pos);
            if (ch === ",") {
                // ',' is a cookie separator if we have later first '=', not ';' or ','
                lastComma = pos;
                pos += 1;

                skipWhitespace();
                nextStart = pos;

                while (pos < cookiesString.length && notSpecialChar()) {
                    pos += 1;
                }

                // currently special character
                if (pos < cookiesString.length && cookiesString.charAt(pos) === "=") {
                    // we found cookies separator
                    cookiesSeparatorFound = true;
                    // pos is inside the next cookie, so back up and return it.
                    pos = nextStart;
                    cookiesStrings.push(cookiesString.substring(start, lastComma));
                    start = pos;
                } else {
                    // in param ',' or param separator ';',
                    // we continue from that comma
                    pos = lastComma + 1;
                }
            } else {
                pos += 1;
            }
        }

        if (!cookiesSeparatorFound || pos >= cookiesString.length) {
            cookiesStrings.push(cookiesString.substring(start, cookiesString.length));
        }
    }

    return cookiesStrings;
}

function middlewareResponseToRequest(originalRequest: Request, response: Response, body: ArrayBuffer | null): Request {
    let request = originalRequest;

    if (response.headers.has("x-middleware-rewrite")) {
        const newUrl = response.headers.get("x-middleware-rewrite");

        if (newUrl) {
            request = new Request(newUrl, {
                method: request.method,
                headers: request.headers,
                body,
            });
        }
    }

    if (response.headers.has("x-middleware-override-headers")) {
        const headersToOverride = response.headers.get("x-middleware-override-headers");

        if (headersToOverride) {
            headersToOverride.split(",").forEach((header) => {
                const value = response.headers.get("x-middleware-request-" + header);

                if (value) {
                    request.headers.set(header, value);
                }
            });
        }
    }

    return request;
}

async function fetchRedirectionIOAction(redirectionIORequest: redirectionio.Request) {
    try {
        const response = (await Promise.race([
            fetch("https://agent.redirection.io/" + REDIRECTIONIO_TOKEN + "/action", {
                method: "POST",
                body: redirectionIORequest.serialize().toString(),
                headers: {
                    "User-Agent": "vercel-edge-middleware/" + REDIRECTIONIO_VERSION,
                    "x-redirectionio-instance-name": REDIRECTIONIO_INSTANCE_NAME,
                },
                cache: "no-store",
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), REDIRECTIONIO_TIMEOUT)),
        ])) as Response;

        const actionStr = await response.text();

        if (actionStr === "") {
            return redirectionio.Action.empty();
        }

        return new redirectionio.Action(actionStr);
    } catch (e) {
        console.error(e);

        return redirectionio.Action.empty();
    }
}

/* Redirection.io logic */
async function proxy(
    request: Request,
    action: redirectionio.Action,
    includedRequestHeadersInResponse: string[] | undefined,
    fetchResponse: FetchResponse,
): Promise<[Response, number]> {
    try {
        const statusCodeBeforeResponse = action.get_status_code(0);

        let response;

        if (statusCodeBeforeResponse === 0) {
            response = await fetchResponse(request, true);
        } else {
            response = new Response("", {
                status: Number(statusCodeBeforeResponse),
            });
        }

        const backendStatusCode = response.status;
        const statusCodeAfterResponse = action.get_status_code(backendStatusCode);
        let status = response.status;

        if (statusCodeAfterResponse !== 0) {
            status = Number(statusCodeAfterResponse);
        }

        const headerMap = new redirectionio.HeaderMap();

        response.headers.forEach((value, key) => {
            if (key === "set-cookie") {
                const cookies = splitSetCookies(value);

                for (const cookie of cookies) {
                    headerMap.add_header("set-cookie", cookie);
                }
            } else {
                headerMap.add_header(key, value);
            }
        });

        request.headers.forEach((value, key) => {
            if (includedRequestHeadersInResponse?.includes(key)) {
                headerMap.add_header(key, value);
            }
        });

        const newHeaderMap = action.filter_headers(headerMap, backendStatusCode, REDIRECTIONIO_ADD_HEADER_RULE_IDS);
        const newHeaders = new Headers();

        for (let i = 0; i < newHeaderMap.len(); i++) {
            const headerName = newHeaderMap.get_header_name(i);

            if (headerName && headerName.length > 0) {
                newHeaders.append(headerName, newHeaderMap.get_header_value(i));
            }
        }

        response = new Response(response.body, {
            status: status,
            statusText: response.statusText,
            headers: newHeaders,
        });

        newHeaderMap.remove_header("content-encoding");
        const bodyFilter = action.create_body_filter(backendStatusCode, newHeaderMap);

        // Skip body filtering
        if (bodyFilter.is_null()) {
            return [response, response.status];
        }

        const { readable, writable } = new TransformStream();

        createBodyFilter(response.body, writable, bodyFilter);

        return [new Response(readable, response), backendStatusCode];
    } catch (err) {
        console.error(err);
        const response = await fetchResponse(request, true);

        return [response, response.status];
    }
}

async function createBodyFilter(
    readable: ReadableStream<Uint8Array> | null,
    writable: WritableStream,
    bodyFilter: redirectionio.BodyFilter,
) {
    const writer = writable.getWriter();
    const reader = readable?.getReader();

    if (!reader) {
        const filteredData = bodyFilter.filter(new Uint8Array());

        if (filteredData) {
            await writer.write(filteredData);
        }

        const lastData = bodyFilter.end();

        if (lastData) {
            await writer.write(lastData);
        }

        await writer.close();

        return;
    }

    let data = await reader.read();

    while (!data.done) {
        const filteredData = bodyFilter.filter(data.value);

        if (filteredData) {
            await writer.write(filteredData);
        }

        data = await reader.read();
    }

    const lastData = bodyFilter.end();

    if (lastData) {
        await writer.write(lastData);
    }

    await writer.close();
}
