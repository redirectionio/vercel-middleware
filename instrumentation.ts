import * as redirectionio from "@redirection.io/redirectionio";
import { getEnv } from "./env";
import { IncomingMessage, ServerResponse } from "http";
import {
    createRedirectionIORequest,
    fetchRedirectionIOAction,
    REDIRECTIONIO_ACTION_HEADER,
    REDIRECTIONIO_MATCH_TIME_TIME_HEADER,
    REDIRECTIONIO_PROXY_RESPONSE_TIME_HEADER,
    REDIRECTIONIO_START_TIME_HEADER,
} from "./common";
const { REDIRECTIONIO_TOKEN, REDIRECTIONIO_INSTANCE_NAME, REDIRECTIONIO_VERSION } = getEnv();

export const registerRedirectionIoInstrumentation = async () => {
    if (process.env.NEXT_RUNTIME !== "edge") {
        if (!REDIRECTIONIO_TOKEN) {
            console.warn("No REDIRECTIONIO_TOKEN environment variable found. Skipping redirection.io instrumentation.");

            return;
        }

        await redirectionio.init();

        const diagnostics = require("diagnostics_channel");
        const channel = diagnostics.channel("http.server.response.finish");

        channel.subscribe(async (message: { request: IncomingMessage; response: ServerResponse }) => {
            const { request, response } = message;
            const url = request.url || "";

            if (
                url.startsWith("/_next/") ||
                url.includes("/__nextjs") ||
                /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json)(\?|$)/i.test(url)
            ) {
                return; // Skip logging
            }

            const isRioMiddlewareRequest = request.headers["x-redirectionio-middleware"] === "true";

            if (isRioMiddlewareRequest) {
                return;
            }

            const statusCode = response.statusCode;

            const proxyResponseTime = Number(request.headers[REDIRECTIONIO_PROXY_RESPONSE_TIME_HEADER]) || Date.now();
            const actionMatchTime = Number(request.headers[REDIRECTIONIO_MATCH_TIME_TIME_HEADER]) || Date.now();
            const startTimestamp = Number(request.headers[REDIRECTIONIO_START_TIME_HEADER]) || Date.now();
            const actionStr = (request.headers[REDIRECTIONIO_ACTION_HEADER] as string) || "";

            const ip = (request.headers["x-real-ip"] as string) || request.socket.remoteAddress;
            const redirectionIORequest = createRedirectionIORequest({
                url: new URL(request.url!, `${request.headers["x-forwarded-proto"]}://${request.headers.host}`),
                headers: request.headers as Record<string, string>,
                method: request.method!,
                ip,
            });

            let action: redirectionio.Action;

            if (!actionStr) {
                action = await fetchRedirectionIOAction(redirectionIORequest);
            } else {
                action = new redirectionio.Action(actionStr);
            }

            await log(
                response,
                statusCode,
                redirectionIORequest,
                startTimestamp,
                actionMatchTime,
                proxyResponseTime,
                action,
                ip,
            );
        });
    }
};

async function log(
    response: ServerResponse,
    backendStatusCode: number,
    redirectionioRequest: redirectionio.Request,
    startTimestamp: number,
    actionMatchTime: number,
    proxyResponseTime: number,
    action: redirectionio.Action,
    clientIP: string | undefined,
) {
    if (response === null) {
        return;
    }

    const responseHeaderMap = new redirectionio.HeaderMap();

    Object.entries(response.getHeaders()).forEach(([key, value]) => {
        if (value) {
            responseHeaderMap.add_header(key, value.toString());
        }
    });

    if (action && !action.should_log_request(backendStatusCode)) {
        return;
    }

    try {
        const logAsJson = redirectionio.create_log_in_json(
            redirectionioRequest,
            response.statusCode,
            responseHeaderMap,
            action,
            "vercel-edge-middleware/" + REDIRECTIONIO_VERSION,
            BigInt(startTimestamp),
            BigInt(actionMatchTime),
            BigInt(proxyResponseTime),
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
