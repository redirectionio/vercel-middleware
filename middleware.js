import { ipAddress, next } from "@vercel/edge";
import * as redirectionio from '@redirection.io/redirectionio';
const REDIRECTIONIO_TOKEN = process.env.REDIRECTIONIO_TOKEN || '';
const REDIRECTIONIO_INSTANCE_NAME = process.env.REDIRECTIONIO_INSTANCE_NAME || 'redirection-io-vercel-middleware';
const REDIRECTIONIO_VERSION = 'redirection-io-vercel-middleware/0.1.0';
const REDIRECTIONIO_ADD_HEADER_RULE_IDS = process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS ? process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS === 'true' : false;
const REDIRECTIONIO_TIMEOUT = process.env.REDIRECTIONIO_TIMEOUT ? parseInt(process.env.REDIRECTIONIO_TIMEOUT, 10) : 500;
export const createMiddleware = (config) => {
    return async (request, context) => {
        let middlewareRequest = request;
        if (config.previousMiddleware) {
            const response = await config.previousMiddleware(request, context);
            if (response.status !== 200) {
                return response;
            }
            middlewareRequest = nextResponseToRequest(request, response);
        }
        return handler(middlewareRequest, context, async (request) => {
            let response = null;
            if (config.nextMiddleware) {
                response = await config.nextMiddleware(request, context);
                if (response.status !== 200) {
                    return response;
                }
                request = nextResponseToRequest(request, response);
            }
            const backendResponse = await fetch(request);
            if (response) {
                response.headers.forEach((value, key) => {
                    if (!key.startsWith('x-middleware-')) {
                        backendResponse.headers.set(key, value);
                    }
                });
            }
            return backendResponse;
        });
    };
};
const defaultMiddleware = createMiddleware({});
export default defaultMiddleware;
async function handler(request, context, fetchResponse) {
    if (!REDIRECTIONIO_TOKEN) {
        console.warn('No REDIRECTIONIO_TOKEN environment variable found. Skipping redirection.io middleware.');
        return next();
    }
    const startTimestamp = Date.now();
    await redirectionio.init();
    const ip = ipAddress(request);
    const redirectionIORequest = createRedirectionIORequest(request, ip);
    const action = await fetchRedirectionIOAction(redirectionIORequest);
    const [response, backendStatusCode] = await proxy(request, action, fetchResponse);
    context.waitUntil(async function () {
        await log(response, backendStatusCode, redirectionIORequest, startTimestamp, action, ip);
    }());
    return response;
}
function splitSetCookies(cookiesString) {
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
                }
                else {
                    // in param ',' or param separator ';',
                    // we continue from that comma
                    pos = lastComma + 1;
                }
            }
            else {
                pos += 1;
            }
        }
        if (!cookiesSeparatorFound || pos >= cookiesString.length) {
            cookiesStrings.push(cookiesString.substring(start, cookiesString.length));
        }
    }
    return cookiesStrings;
}
function createRedirectionIORequest(request, ip) {
    const urlObject = new URL(request.url);
    const redirectionioRequest = new redirectionio.Request(urlObject.pathname + urlObject.search, urlObject.host, urlObject.protocol.replace(":", ""), request.method);
    request.headers.forEach((value, key) => {
        redirectionioRequest.add_header(key, value);
    });
    if (ip) {
        redirectionioRequest.set_remote_ip(ip);
    }
    return redirectionioRequest;
}
function nextResponseToRequest(originalRequest, nextResponse) {
    let nextRequest = originalRequest;
    if (nextResponse.headers.has('x-middleware-rewrite')) {
        const newUrl = nextResponse.headers.get('x-middleware-rewrite');
        if (newUrl) {
            nextRequest = new Request({
                ...nextRequest,
                url: newUrl,
            });
        }
    }
    if (nextResponse.headers.has('x-middleware-override-headers')) {
        const headersToOverride = nextResponse.headers.get('x-middleware-override-headers');
        if (headersToOverride) {
            headersToOverride.split(',').forEach(header => {
                const value = nextResponse.headers.get('x-middleware-request-' + header);
                if (value) {
                    nextRequest.headers.set(header, value);
                }
            });
        }
    }
    return nextRequest;
}
async function fetchRedirectionIOAction(redirectionIORequest) {
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
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), REDIRECTIONIO_TIMEOUT)),
        ]);
        const actionStr = await response.text();
        if (actionStr === "") {
            return redirectionio.Action.empty();
        }
        return new redirectionio.Action(actionStr);
    }
    catch (e) {
        console.error(e);
        return redirectionio.Action.empty();
    }
}
/* Redirection.io logic */
async function proxy(request, action, fetchResponse) {
    try {
        const statusCodeBeforeResponse = action.get_status_code(0);
        let response;
        if (statusCodeBeforeResponse === 0) {
            response = await fetchResponse(request);
        }
        else {
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
            }
            else {
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
        const { readable, writable } = new TransformStream();
        createBodyFilter(response.body, writable, bodyFilter);
        return [new Response(readable, response), backendStatusCode];
    }
    catch (err) {
        console.error(err);
        const response = await fetchResponse(request);
        return [response, response.status];
    }
}
async function createBodyFilter(readable, writable, bodyFilter) {
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
async function log(response, backendStatusCode, redirectionioRequest, startTimestamp, action, clientIP) {
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
        const logAsJson = redirectionio.create_log_in_json(redirectionioRequest, response.status, responseHeaderMap, action, 'vercel-edge-middleware/' + REDIRECTIONIO_VERSION, BigInt(startTimestamp), clientIP ?? '');
        return await fetch('https://agent.redirection.io/' + REDIRECTIONIO_TOKEN + '/log', {
            method: 'POST',
            body: logAsJson,
            headers: {
                'User-Agent': 'vercel-edge-middleware/' + REDIRECTIONIO_VERSION,
                'x-redirectionio-instance-name': REDIRECTIONIO_INSTANCE_NAME,
            },
        });
    }
    catch (err) {
        console.error(err);
    }
}
