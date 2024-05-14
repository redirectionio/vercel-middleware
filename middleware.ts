import {ipAddress, next, RequestContext} from "@vercel/edge";
import * as redirectionio from '@redirection.io/redirectionio/redirectionio_bg.js';
// @ts-ignore
import wasmModule from '@redirection.io/redirectionio/redirectionio_bg.wasm?module';

const REDIRECTIONIO_TOKEN = process.env.REDIRECTIONIO_TOKEN || '';
const REDIRECTIONIO_INSTANCE_NAME = process.env.INSTANCE_NAME || 'redirection-io-vercel-middleware'
const REDIRECTIONIO_VERSION = 'redirection-io-vercel-middleware/0.1.0';
const REDIRECTIONIO_ADD_HEADER_RULE_IDS = process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS ? process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS === 'true' : false;
const REDIRECTIONIO_TIMEOUT = process.env.REDIRECTIONIO_TIMEOUT ? parseInt(process.env.REDIRECTIONIO_TIMEOUT, 10) : 500;

let loadedModule;

async function initWebAssembly() {
    if (loadedModule) {
        return;
    }

    const imports = {"./redirectionio_bg.js": {}};

    for (const functionName of Object.keys(redirectionio)) {
        if (functionName.startsWith("__") && functionName !== "__wbg_set_wasm") {
            imports["./redirectionio_bg.js"][functionName] = redirectionio[functionName];
        }
    }

    const module = await WebAssembly.instantiate(wasmModule, imports) as unknown as WebAssembly.Instance;
    loadedModule = module.exports;
    redirectionio.__wbg_set_wasm(module.exports);

    // This must be done only once
    redirectionio.init_log();
}

export default async function middleware(request: Request, context: RequestContext) {
    if (!REDIRECTIONIO_TOKEN) {
        console.warn('No REDIRECTIONIO_TOKEN environment variable found. Skipping redirection.io middleware.');

        return next();
    }

    const startTimestamp = Date.now();

    await initWebAssembly();

    const ip = ipAddress(request);
    const redirectionIORequest = createRedirectionIORequest(request, ip);
    const action = await fetchRedirectionIOAction(redirectionIORequest);
    const [response, backendStatusCode] = await proxy(request, action);

    context.waitUntil(async function () {
        await log(response, backendStatusCode, redirectionIORequest, startTimestamp, action, ip || "");
    }());

    return response;
}

function splitSetCookies(cookiesString) {
    if (Array.isArray(cookiesString)) {
        return cookiesString;
    }
    if (typeof cookiesString !== "string") {
        return [];
    }

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

function createRedirectionIORequest(request: Request, ip: string) {
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

async function fetchRedirectionIOAction(redirectionIORequest: redirectionio.Request): Promise<redirectionio.Action> {
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
async function proxy(request: Request, action: redirectionio.Action) {
    try {
        const statusCodeBeforeResponse = action.get_status_code(0);

        let response;

        if (statusCodeBeforeResponse === 0) {
            response = await fetch(request);
        } else {
            response = new Response('', {
                status: Number(statusCodeBeforeResponse),
            });
        }

        const backendStatusCode = response.status;
        const statusCodeAfterResponse = action.get_status_code(backendStatusCode);

        if (statusCodeAfterResponse !== 0) {
            response.status = Number(statusCodeAfterResponse);
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
            status: response.status,
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
        const response = await fetch(request);

        return [response, response.status];
    }
}

async function createBodyFilter(readable: ReadableStream, writable: WritableStream, bodyFilter: redirectionio.BodyFilter) {
    let writer = writable.getWriter();
    let reader = readable.getReader();
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

async function log(response: Response, backendStatusCode: number, redirectionioRequest: redirectionio.Request, startTimestamp: number, action: redirectionio.Action, clientIP: string) {
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
            clientIP,
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
