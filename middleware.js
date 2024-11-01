import { next } from "@vercel/edge";
import { ipAddress } from "@vercel/functions";
import * as redirectionio from "@redirection.io/redirectionio";
import { NextResponse } from "next/server";
const REDIRECTIONIO_TOKEN = process.env.REDIRECTIONIO_TOKEN || "";
const REDIRECTIONIO_INSTANCE_NAME = process.env.REDIRECTIONIO_INSTANCE_NAME || "redirection-io-vercel-middleware";
const REDIRECTIONIO_VERSION = "redirection-io-vercel-middleware/0.3.12";
const REDIRECTIONIO_ADD_HEADER_RULE_IDS = process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS
    ? process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS === "true"
    : false;
const REDIRECTIONIO_TIMEOUT = process.env.REDIRECTIONIO_TIMEOUT ? parseInt(process.env.REDIRECTIONIO_TIMEOUT, 10) : 500;
const DEFAULT_CONFIG = {
    matcherRegex: "^/((?!api/|_next/|_static/|_vercel|[\\w-]+\\.\\w+).*)$",
    mode: "full",
    logged: true,
};
export const createRedirectionIoMiddleware = (config) => {
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
            request.headers.get("User-Agent") === "Vercel Edge Functions"
        ) {
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
        return handler(middlewareRequest, context, config, async (request, useFetch) => {
            let response = null;
            if (config.nextMiddleware) {
                response = await config.nextMiddleware(request, context);
                if (response.status !== 200) {
                    return response;
                }
                // If light mode, only return the response
                if (config.mode === "light") {
                    return response;
                }
                request = middlewareResponseToRequest(request, response, body);
            }
            if (!useFetch) {
                return response ?? next();
            }
            // Disable for server-actions and components.
            if (request.headers.get('Next-Action')?.length || request.headers.get('Accept') === "text/x-component") {
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
        });
    };
};
const defaultMiddleware = createRedirectionIoMiddleware({});
export default defaultMiddleware;
async function handler(request, context, config, fetchResponse) {
    if (!REDIRECTIONIO_TOKEN) {
        console.warn("No REDIRECTIONIO_TOKEN environment variable found. Skipping redirection.io middleware.");
        return fetchResponse(request, false);
    }
    const startTimestamp = Date.now();
    await redirectionio.init();
    const ip = ipAddress(request);
    const redirectionIORequest = createRedirectionIORequest(request, ip);
    const action = await fetchRedirectionIOAction(redirectionIORequest);
    const [response, backendStatusCode] = await proxy(request, action, (request) => {
        request.headers.set("x-redirectionio-middleware", "true");
        return fetchResponse(request, true);
    });
    const url = new URL(request.url);
    const location = response.headers.get("Location");
    const hasLocation = location && location.startsWith("/");
    if (hasLocation) {
        response.headers.set("Location", url.origin + location);
    }
    if (config.logged) {
        context.waitUntil(
            (async function () {
                await log(response, backendStatusCode, redirectionIORequest, startTimestamp, action, ip);
            })(),
        );
    }
    if (config.mode === "light" && hasLocation) {
        return NextResponse.redirect(url.origin + location, response.status);
    }
    return response;
}
function splitSetCookies(cookiesString) {
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
function createRedirectionIORequest(request, ip) {
    const urlObject = new URL(request.url);
    const redirectionioRequest = new redirectionio.Request(
        urlObject.pathname + urlObject.search,
        urlObject.host,
        urlObject.protocol.replace(":", ""),
        request.method,
    );
    request.headers.forEach((value, key) => {
        redirectionioRequest.add_header(key, value);
    });
    if (ip) {
        redirectionioRequest.set_remote_ip(ip);
    }
    return redirectionioRequest;
}
function middlewareResponseToRequest(originalRequest, response, body) {
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
async function fetchRedirectionIOAction(redirectionIORequest) {
    try {
        const response = await Promise.race([
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
        ]);
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
async function proxy(request, action, fetchResponse) {
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
async function createBodyFilter(readable, writable, bodyFilter) {
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
        const logAsJson = redirectionio.create_log_in_json(
            redirectionioRequest,
            response.status,
            responseHeaderMap,
            action,
            "vercel-edge-middleware/" + REDIRECTIONIO_VERSION,
            BigInt(startTimestamp),
            clientIP ?? "",
        );
        return await fetch("https://agent.redirection.io/" + REDIRECTIONIO_TOKEN + "/log", {
            method: "POST",
            body: logAsJson,
            headers: {
                "User-Agent": "vercel-edge-middleware/" + REDIRECTIONIO_VERSION,
                "x-redirectionio-instance-name": REDIRECTIONIO_INSTANCE_NAME,
            },
            cache: "no-store",
        });
    } catch (err) {
        console.error(err);
    }
}
