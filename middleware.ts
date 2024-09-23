import {next, RequestContext} from "@vercel/edge";
import {ipAddress} from '@vercel/functions';
import * as redirectionio from '@redirection.io/redirectionio';
import type {NextRequest} from "next/server";

const REDIRECTIONIO_TOKEN = process.env.REDIRECTIONIO_TOKEN || '';
const REDIRECTIONIO_INSTANCE_NAME = process.env.REDIRECTIONIO_INSTANCE_NAME || 'redirection-io-vercel-middleware';
const REDIRECTIONIO_VERSION = 'redirection-io-vercel-middleware/0.3.5';
const REDIRECTIONIO_ADD_HEADER_RULE_IDS = process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS ? process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS === 'true' : false;
const REDIRECTIONIO_TIMEOUT = process.env.REDIRECTIONIO_TIMEOUT ? parseInt(process.env.REDIRECTIONIO_TIMEOUT, 10) : 500;

type Middleware = (request: Request | NextRequest, context: RequestContext) => Response | Promise<Response>;

type FetchResponse = (request: Request, useFetch: boolean) => Promise<Response>;

type CreateMiddlewareConfig = {
    previousMiddleware?: Middleware;
    nextMiddleware?: Middleware;
}

export const createRedirectionIoMiddleware = (config: CreateMiddlewareConfig): Middleware => {
    return async (request, context) => {
        // Avoid infinite loop
        if (request.headers.get('x-redirectionio-middleware') === 'true') {
            return next();
        }

        const body = request.body ? await request.arrayBuffer() : null;

        let middlewareRequest = new Request(request.url, {
            method: request.method,
            headers: request.headers,
            body,
        });

        if (config.previousMiddleware) {
            const response = await config.previousMiddleware(middlewareRequest, context);

            if (response.status !== 200) {
                return response;
            }

            middlewareRequest = middlewareResponseToRequest(middlewareRequest, response, body);
        }

        return handler(middlewareRequest, context, async (request, useFetch): Promise<Response> => {
            let response: Response | null = null;

            if (config.nextMiddleware) {
                response = await config.nextMiddleware(request, context);

                if (response.status !== 200) {
                    return response;
                }

                request = middlewareResponseToRequest(request, response, body);
            }

            if (!useFetch) {
                return response ?? next();
            }

            const fetchResponse = await fetch(request, {
                redirect: 'manual',
            });
            const backendResponse = new Response(fetchResponse.body, fetchResponse);

            if (response) {
                response.headers.forEach((value, key) => {
                    if (!key.startsWith('x-middleware-')) {
                        backendResponse.headers.set(key, value);
                    }
                });
            }

            return backendResponse;
        });
    }
}

const defaultMiddleware = createRedirectionIoMiddleware({});

export default defaultMiddleware;

async function handler(request: Request, context: RequestContext, fetchResponse: FetchResponse): Promise<Response> {
    if (!REDIRECTIONIO_TOKEN) {
        console.warn('No REDIRECTIONIO_TOKEN environment variable found. Skipping redirection.io middleware.');

        return fetchResponse(request, false);
    }

    const startTimestamp = Date.now();

    await redirectionio.init();

    const ip = ipAddress(request);
    const redirectionIORequest = createRedirectionIORequest(request, ip);
    const action = await fetchRedirectionIOAction(redirectionIORequest);
    const [response, backendStatusCode] = await proxy(request, action, (request) => {
        request.headers.set('x-redirectionio-middleware', 'true');

        return fetchResponse(request, true);
    });

    const url = new URL(request.url);
    const location = response.headers.get("Location");

    if (location && location.startsWith('/')) {
        response.headers.set("Location", url.origin + location);
    }

    context.waitUntil(async function () {
        await log(response, backendStatusCode, redirectionIORequest, startTimestamp, action, ip);
    }());

    return response;
}

function splitSetCookies(cookiesString: string) {
    var cookiesStrings = [];
    var pos = 0;
    var start;
    var ch;
    var lastComma;
    var nextStart;
    var cookiesSeparatorFound;

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

function createRedirectionIORequest(request: Request, ip?: string) {
    const urlObject = new URL(request.url);
    const redirectionioRequest = new redirectionio.Request(
        urlObject.pathname + urlObject.search,
        urlObject.host,
        urlObject.protocol.replace(":", ""),
        request.method
    );

    request.headers.forEach((value, key) => {
        redirectionioRequest.add_header(key, value);
    });

    if (ip) {
        redirectionioRequest.set_remote_ip(ip);
    }

    return redirectionioRequest;
}

function middlewareResponseToRequest(originalRequest: Request, response: Response, body: ArrayBuffer | null): Request {
    let request = originalRequest;

    if (response.headers.has('x-middleware-rewrite')) {
        const newUrl = response.headers.get('x-middleware-rewrite');

        if (newUrl) {
            request = new Request(newUrl, {
                method: request.method,
                headers: request.headers,
                body,
            });
        }
    }

    if (response.headers.has('x-middleware-override-headers')) {
        const headersToOverride = response.headers.get('x-middleware-override-headers');

        if (headersToOverride) {
            headersToOverride.split(',').forEach(header => {
                const value = response.headers.get('x-middleware-request-' + header);

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
        const response = await Promise.race([
            fetch('https://agent.redirection.io/' + REDIRECTIONIO_TOKEN + '/action', {
                method: 'POST',
                body: redirectionIORequest.serialize().toString(),
                headers: {
                    'User-Agent': 'vercel-edge-middleware/' + REDIRECTIONIO_VERSION,
                    'x-redirectionio-instance-name': REDIRECTIONIO_INSTANCE_NAME,
                },
            }),
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout')), REDIRECTIONIO_TIMEOUT)
            ),
        ]) as Response;

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
async function proxy(request: Request, action: redirectionio.Action, fetchResponse: FetchResponse): Promise<[Response, number]> {
    try {
        const statusCodeBeforeResponse = action.get_status_code(0);

        let response;

        if (statusCodeBeforeResponse === 0) {
            response = await fetchResponse(request, true);
        } else {
            response = new Response('', {
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

        const newHeaderMap = action.filter_headers(headerMap, backendStatusCode, REDIRECTIONIO_ADD_HEADER_RULE_IDS);
        const newHeaders = new Headers();

        for (let i = 0; i < newHeaderMap.len(); i++) {
            newHeaders.append(newHeaderMap.get_header_name(i), newHeaderMap.get_header_value(i));
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

        const {readable, writable} = new TransformStream();

        createBodyFilter(response.body, writable, bodyFilter);

        return [new Response(readable, response), backendStatusCode];
    } catch (err) {
        console.error(err);
        const response = await fetchResponse(request, true);

        return [response, response.status];
    }
}

async function createBodyFilter(readable: ReadableStream<Uint8Array> | null, writable: WritableStream, bodyFilter: redirectionio.BodyFilter) {
    let writer = writable.getWriter();
    let reader = readable?.getReader();

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

async function log(response: Response, backendStatusCode: number, redirectionioRequest: redirectionio.Request, startTimestamp: number, action: redirectionio.Action, clientIP: string | undefined) {
    if (response === null) {
        return;
    }

    const responseHeaderMap = new redirectionio.HeaderMap();

    response.headers.forEach((value, key) => {
        responseHeaderMap.add_header(key, value);
    });

    if (action && !action.should_log_request(backendStatusCode)) {
        return;
    }

    try {
        const logAsJson = redirectionio.create_log_in_json(
            redirectionioRequest,
            response.status,
            responseHeaderMap,
            action,
            'vercel-edge-middleware/' + REDIRECTIONIO_VERSION,
            BigInt(startTimestamp),
            clientIP ?? '',
        );

        return await fetch(
            'https://agent.redirection.io/' + REDIRECTIONIO_TOKEN + '/log',
            {
                method: 'POST',
                body: logAsJson,
                headers: {
                    'User-Agent': 'vercel-edge-middleware/' + REDIRECTIONIO_VERSION,
                    'x-redirectionio-instance-name': REDIRECTIONIO_INSTANCE_NAME,
                },
            }
        );
    } catch (err) {
        console.error(err);
    }
}
