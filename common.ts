import * as redirectionio from "@redirection.io/redirectionio";
import { getEnv } from "./env";

const { REDIRECTIONIO_TOKEN, REDIRECTIONIO_INSTANCE_NAME, REDIRECTIONIO_VERSION, REDIRECTIONIO_TIMEOUT } = getEnv();

export const REDIRECTIONIO_PROXY_RESPONSE_TIME_HEADER = "x-redirectionio-proxy-response-time";
export const REDIRECTIONIO_START_TIME_HEADER = "x-redirectionio-start-time";
export const REDIRECTIONIO_MATCH_TIME_TIME_HEADER = "x-redirectionio-action-match-time";
export const REDIRECTIONIO_ACTION_HEADER = "x-redirectionio-action";

export async function fetchRedirectionIOAction(redirectionIORequest: redirectionio.Request) {
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

type CreateRedirectionIORequestParams = {
    url: URL;
    method: string;
    headers: Record<string, string>;
    ip?: string;
};

export function createRedirectionIORequest({ url, method, headers, ip }: CreateRedirectionIORequestParams) {
    const redirectionioRequest = new redirectionio.Request(
        url.pathname + url.search,
        url.host,
        url.protocol.replace(":", ""),
        method,
    );

    Object.entries(headers).forEach(([key, value]) => {
        redirectionioRequest.add_header(key, value as string);
    });

    if (ip) {
        redirectionioRequest.set_remote_ip(ip);
    }

    return redirectionioRequest;
}
