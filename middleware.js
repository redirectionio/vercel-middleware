"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMiddleware = void 0;
var edge_1 = require("@vercel/edge");
var redirectionio = require("@redirection.io/redirectionio");
var REDIRECTIONIO_TOKEN = process.env.REDIRECTIONIO_TOKEN || '';
var REDIRECTIONIO_INSTANCE_NAME = process.env.REDIRECTIONIO_INSTANCE_NAME || 'redirection-io-vercel-middleware';
var REDIRECTIONIO_VERSION = 'redirection-io-vercel-middleware/0.1.0';
var REDIRECTIONIO_ADD_HEADER_RULE_IDS = process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS ? process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS === 'true' : false;
var REDIRECTIONIO_TIMEOUT = process.env.REDIRECTIONIO_TIMEOUT ? parseInt(process.env.REDIRECTIONIO_TIMEOUT, 10) : 500;
var createMiddleware = function (config) {
    return function (request, context) { return __awaiter(void 0, void 0, void 0, function () {
        var middlewareRequest, response;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    middlewareRequest = request;
                    if (!config.previousMiddleware) return [3 /*break*/, 2];
                    return [4 /*yield*/, config.previousMiddleware(request, context)];
                case 1:
                    response = _a.sent();
                    if (response.status !== 200) {
                        return [2 /*return*/, response];
                    }
                    middlewareRequest = nextResponseToRequest(request, response);
                    _a.label = 2;
                case 2: return [2 /*return*/, handler(middlewareRequest, context, function (request) { return __awaiter(void 0, void 0, void 0, function () {
                        var response, backendResponse;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    response = null;
                                    if (!config.nextMiddleware) return [3 /*break*/, 2];
                                    return [4 /*yield*/, config.nextMiddleware(request, context)];
                                case 1:
                                    response = _a.sent();
                                    if (response.status !== 200) {
                                        return [2 /*return*/, response];
                                    }
                                    request = nextResponseToRequest(request, response);
                                    _a.label = 2;
                                case 2: return [4 /*yield*/, fetch(request)];
                                case 3:
                                    backendResponse = _a.sent();
                                    if (response) {
                                        response.headers.forEach(function (value, key) {
                                            if (!key.startsWith('x-middleware-')) {
                                                backendResponse.headers.set(key, value);
                                            }
                                        });
                                    }
                                    return [2 /*return*/, backendResponse];
                            }
                        });
                    }); })];
            }
        });
    }); };
};
exports.createMiddleware = createMiddleware;
var defaultMiddleware = (0, exports.createMiddleware)({});
exports.default = defaultMiddleware;
function handler(request, context, fetchResponse) {
    return __awaiter(this, void 0, void 0, function () {
        var startTimestamp, ip, redirectionIORequest, action, _a, response, backendStatusCode;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    if (!REDIRECTIONIO_TOKEN) {
                        console.warn('No REDIRECTIONIO_TOKEN environment variable found. Skipping redirection.io middleware.');
                        return [2 /*return*/, (0, edge_1.next)()];
                    }
                    startTimestamp = Date.now();
                    return [4 /*yield*/, redirectionio.init()];
                case 1:
                    _b.sent();
                    ip = (0, edge_1.ipAddress)(request);
                    redirectionIORequest = createRedirectionIORequest(request, ip);
                    return [4 /*yield*/, fetchRedirectionIOAction(redirectionIORequest)];
                case 2:
                    action = _b.sent();
                    return [4 /*yield*/, proxy(request, action, fetchResponse)];
                case 3:
                    _a = _b.sent(), response = _a[0], backendStatusCode = _a[1];
                    context.waitUntil(function () {
                        return __awaiter(this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, log(response, backendStatusCode, redirectionIORequest, startTimestamp, action, ip)];
                                    case 1:
                                        _a.sent();
                                        return [2 /*return*/];
                                }
                            });
                        });
                    }());
                    return [2 /*return*/, response];
            }
        });
    });
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
    var urlObject = new URL(request.url);
    var redirectionioRequest = new redirectionio.Request(urlObject.pathname + urlObject.search, urlObject.host, urlObject.protocol.replace(":", ""), request.method);
    request.headers.forEach(function (value, key) {
        redirectionioRequest.add_header(key, value);
    });
    if (ip) {
        redirectionioRequest.set_remote_ip(ip);
    }
    return redirectionioRequest;
}
function nextResponseToRequest(originalRequest, nextResponse) {
    var nextRequest = originalRequest;
    if (nextResponse.headers.has('x-middleware-rewrite')) {
        var newUrl = nextResponse.headers.get('x-middleware-rewrite');
        if (newUrl) {
            nextRequest = new Request(__assign(__assign({}, nextRequest), { url: newUrl }));
        }
    }
    if (nextResponse.headers.has('x-middleware-override-headers')) {
        var headersToOverride = nextResponse.headers.get('x-middleware-override-headers');
        if (headersToOverride) {
            headersToOverride.split(',').forEach(function (header) {
                var value = nextResponse.headers.get('x-middleware-request-' + header);
                if (value) {
                    nextRequest.headers.set(header, value);
                }
            });
        }
    }
    return nextRequest;
}
function fetchRedirectionIOAction(redirectionIORequest) {
    return __awaiter(this, void 0, void 0, function () {
        var response, actionStr, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, Promise.race([
                            fetch('https://agent.redirection.io/' + REDIRECTIONIO_TOKEN + '/action', {
                                method: 'POST',
                                body: redirectionIORequest.serialize().toString(),
                                headers: {
                                    'User-Agent': 'vercel-edge-middleware/' + REDIRECTIONIO_VERSION,
                                    'x-redirectionio-instance-name': REDIRECTIONIO_INSTANCE_NAME,
                                },
                            }),
                            new Promise(function (_, reject) {
                                return setTimeout(function () { return reject(new Error('Timeout')); }, REDIRECTIONIO_TIMEOUT);
                            }),
                        ])];
                case 1:
                    response = _a.sent();
                    return [4 /*yield*/, response.text()];
                case 2:
                    actionStr = _a.sent();
                    if (actionStr === "") {
                        return [2 /*return*/, redirectionio.Action.empty()];
                    }
                    return [2 /*return*/, new redirectionio.Action(actionStr)];
                case 3:
                    e_1 = _a.sent();
                    console.error(e_1);
                    return [2 /*return*/, redirectionio.Action.empty()];
                case 4: return [2 /*return*/];
            }
        });
    });
}
/* Redirection.io logic */
function proxy(request, action, fetchResponse) {
    return __awaiter(this, void 0, void 0, function () {
        var statusCodeBeforeResponse, response, backendStatusCode, statusCodeAfterResponse, status_1, headerMap_1, newHeaderMap, newHeaders, i, bodyFilter, _a, readable, writable, err_1, response;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 4, , 6]);
                    statusCodeBeforeResponse = action.get_status_code(0);
                    response = void 0;
                    if (!(statusCodeBeforeResponse === 0)) return [3 /*break*/, 2];
                    return [4 /*yield*/, fetchResponse(request)];
                case 1:
                    response = _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    response = new Response('', {
                        status: Number(statusCodeBeforeResponse),
                    });
                    _b.label = 3;
                case 3:
                    backendStatusCode = response.status;
                    statusCodeAfterResponse = action.get_status_code(backendStatusCode);
                    status_1 = response.status;
                    if (statusCodeAfterResponse !== 0) {
                        status_1 = Number(statusCodeAfterResponse);
                    }
                    headerMap_1 = new redirectionio.HeaderMap();
                    response.headers.forEach(function (value, key) {
                        if (key === "set-cookie") {
                            var cookies = splitSetCookies(value);
                            for (var _i = 0, cookies_1 = cookies; _i < cookies_1.length; _i++) {
                                var cookie = cookies_1[_i];
                                headerMap_1.add_header("set-cookie", cookie);
                            }
                        }
                        else {
                            headerMap_1.add_header(key, value);
                        }
                    });
                    newHeaderMap = action.filter_headers(headerMap_1, backendStatusCode, REDIRECTIONIO_ADD_HEADER_RULE_IDS);
                    newHeaders = new Headers();
                    for (i = 0; i < newHeaderMap.len(); i++) {
                        newHeaders.append(newHeaderMap.get_header_name(i), newHeaderMap.get_header_value(i));
                    }
                    response = new Response(response.body, {
                        status: status_1,
                        statusText: response.statusText,
                        headers: newHeaders,
                    });
                    newHeaderMap.remove_header("content-encoding");
                    bodyFilter = action.create_body_filter(backendStatusCode, newHeaderMap);
                    // Skip body filtering
                    if (bodyFilter.is_null()) {
                        return [2 /*return*/, [response, response.status]];
                    }
                    _a = new TransformStream(), readable = _a.readable, writable = _a.writable;
                    createBodyFilter(response.body, writable, bodyFilter);
                    return [2 /*return*/, [new Response(readable, response), backendStatusCode]];
                case 4:
                    err_1 = _b.sent();
                    console.error(err_1);
                    return [4 /*yield*/, fetchResponse(request)];
                case 5:
                    response = _b.sent();
                    return [2 /*return*/, [response, response.status]];
                case 6: return [2 /*return*/];
            }
        });
    });
}
function createBodyFilter(readable, writable, bodyFilter) {
    return __awaiter(this, void 0, void 0, function () {
        var writer, reader, filteredData, lastData_1, data, filteredData, lastData;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    writer = writable.getWriter();
                    reader = readable === null || readable === void 0 ? void 0 : readable.getReader();
                    if (!!reader) return [3 /*break*/, 6];
                    filteredData = bodyFilter.filter(new Uint8Array());
                    if (!filteredData) return [3 /*break*/, 2];
                    return [4 /*yield*/, writer.write(filteredData)];
                case 1:
                    _a.sent();
                    _a.label = 2;
                case 2:
                    lastData_1 = bodyFilter.end();
                    if (!lastData_1) return [3 /*break*/, 4];
                    return [4 /*yield*/, writer.write(lastData_1)];
                case 3:
                    _a.sent();
                    _a.label = 4;
                case 4: return [4 /*yield*/, writer.close()];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
                case 6: return [4 /*yield*/, reader.read()];
                case 7:
                    data = _a.sent();
                    _a.label = 8;
                case 8:
                    if (!!data.done) return [3 /*break*/, 12];
                    filteredData = bodyFilter.filter(data.value);
                    if (!filteredData) return [3 /*break*/, 10];
                    return [4 /*yield*/, writer.write(filteredData)];
                case 9:
                    _a.sent();
                    _a.label = 10;
                case 10: return [4 /*yield*/, reader.read()];
                case 11:
                    data = _a.sent();
                    return [3 /*break*/, 8];
                case 12:
                    lastData = bodyFilter.end();
                    if (!lastData) return [3 /*break*/, 14];
                    return [4 /*yield*/, writer.write(lastData)];
                case 13:
                    _a.sent();
                    _a.label = 14;
                case 14: return [4 /*yield*/, writer.close()];
                case 15:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function log(response, backendStatusCode, redirectionioRequest, startTimestamp, action, clientIP) {
    return __awaiter(this, void 0, void 0, function () {
        var responseHeaderMap, logAsJson, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (response === null) {
                        return [2 /*return*/];
                    }
                    responseHeaderMap = new redirectionio.HeaderMap();
                    response.headers.forEach(function (value, key) {
                        responseHeaderMap.add_header(key, value);
                    });
                    if (action && !action.should_log_request(backendStatusCode)) {
                        return [2 /*return*/];
                    }
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    logAsJson = redirectionio.create_log_in_json(redirectionioRequest, response.status, responseHeaderMap, action, 'vercel-edge-middleware/' + REDIRECTIONIO_VERSION, BigInt(startTimestamp), clientIP !== null && clientIP !== void 0 ? clientIP : '');
                    return [4 /*yield*/, fetch('https://agent.redirection.io/' + REDIRECTIONIO_TOKEN + '/log', {
                            method: 'POST',
                            body: logAsJson,
                            headers: {
                                'User-Agent': 'vercel-edge-middleware/' + REDIRECTIONIO_VERSION,
                                'x-redirectionio-instance-name': REDIRECTIONIO_INSTANCE_NAME,
                            },
                        })];
                case 2: return [2 /*return*/, _a.sent()];
                case 3:
                    err_2 = _a.sent();
                    console.error(err_2);
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
