import { z } from "zod";

const REDIRECTIONIO_IPS_URL = "https://api.redirection.io/ips";
const VERCEL_FIREWALL_CONFIG_URL = "https://api.vercel.com/v1/security/firewall/config";
const DEFAULT_RULE_NAME = "redirection.io managed instances";
const MAX_IPS_PER_CONDITION = 75;
const MAX_CONDITION_GROUPS = 25;

export type SyncFirewallOptions = {
    vercelToken: string;
    projectId: string;
    teamId?: string;
    ruleName?: string;
    bypassSystem?: boolean;
};

export type SyncFirewallResult = {
    status: "created" | "updated" | "unchanged";
    ruleId?: string;
    ips: string[];
};

const redirectionIoIpsSchema = z.array(z.object({ ipV4: z.string().min(1) }));

const firewallConditionSchema = z.object({
    type: z.string(),
    op: z.string(),
    value: z.union([z.string(), z.array(z.string()), z.number()]).optional(),
});

const firewallRuleSchema = z.object({
    id: z.string(),
    name: z.string(),
    active: z.boolean(),
    conditionGroup: z.array(z.object({ conditions: z.array(firewallConditionSchema) })),
    action: z.object({
        mitigate: z.object({ action: z.string(), bypassSystem: z.boolean().nullish() }).nullish(),
    }),
});

const activeFirewallConfigSchema = z.object({
    rules: z.array(firewallRuleSchema).default([]),
});

type FirewallRule = z.infer<typeof firewallRuleSchema>;

const firewallEnvSchema = z.object({
    VERCEL_TOKEN: z.string().min(1),
    VERCEL_PROJECT_ID: z.string().min(1),
    VERCEL_TEAM_ID: z.string().min(1).optional(),
    REDIRECTIONIO_FIREWALL_RULE_NAME: z.string().min(1).max(160).optional(),
    REDIRECTIONIO_FIREWALL_BYPASS_SYSTEM: z.enum(["true", "false"]).optional(),
});

export function getSyncFirewallOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): SyncFirewallOptions {
    const parsedEnv = firewallEnvSchema.parse(env);

    return {
        vercelToken: parsedEnv.VERCEL_TOKEN,
        projectId: parsedEnv.VERCEL_PROJECT_ID,
        teamId: parsedEnv.VERCEL_TEAM_ID,
        ruleName: parsedEnv.REDIRECTIONIO_FIREWALL_RULE_NAME,
        bypassSystem: parsedEnv.REDIRECTIONIO_FIREWALL_BYPASS_SYSTEM === "true",
    };
}

export async function fetchRedirectionIoIps(): Promise<string[]> {
    const response = await fetch(REDIRECTIONIO_IPS_URL, {
        headers: { Accept: "application/json" },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch redirection.io IPs: ${response.status} ${await response.text()}`);
    }

    const ips = redirectionIoIpsSchema.parse(await response.json()).map(({ ipV4 }) => ipV4);

    return [...new Set(ips)].sort();
}

function buildFirewallUrl(options: SyncFirewallOptions, path = "") {
    const url = new URL(VERCEL_FIREWALL_CONFIG_URL + path);
    url.searchParams.set("projectId", options.projectId);

    if (options.teamId) {
        url.searchParams.set("teamId", options.teamId);
    }

    return url;
}

async function callVercelApi(options: SyncFirewallOptions, url: URL, init: RequestInit = {}) {
    const response = await fetch(url, {
        ...init,
        headers: {
            Authorization: `Bearer ${options.vercelToken}`,
            "Content-Type": "application/json",
        },
        cache: "no-store",
    });

    if (!response.ok) {
        throw new Error(
            `Vercel API ${init.method ?? "GET"} ${url.pathname} failed: ${response.status} ${await response.text()}`,
        );
    }

    return response;
}

async function fetchActiveFirewallRules(options: SyncFirewallOptions) {
    const url = buildFirewallUrl(options, "/active");
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${options.vercelToken}` },
        cache: "no-store",
    });

    // A project that never had a firewall configuration has no active version yet.
    if (response.status === 404) {
        return [];
    }

    if (!response.ok) {
        throw new Error(`Vercel API GET ${url.pathname} failed: ${response.status} ${await response.text()}`);
    }

    return activeFirewallConfigSchema.parse(await response.json()).rules;
}

function chunk<T>(items: T[], size: number) {
    const chunks: T[][] = [];

    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }

    return chunks;
}

function buildBypassRule(ruleName: string, ips: string[], shouldBypassSystem: boolean) {
    const ipChunks = chunk(ips, MAX_IPS_PER_CONDITION);

    if (ipChunks.length > MAX_CONDITION_GROUPS) {
        throw new Error(
            `Too many redirection.io IPs (${ips.length}) to fit in a single Vercel firewall rule (max ${MAX_IPS_PER_CONDITION * MAX_CONDITION_GROUPS})`,
        );
    }

    return {
        name: ruleName,
        description: "Managed by @redirection.io/vercel-middleware. Allows redirection.io managed instances IPs.",
        active: true,
        conditionGroup: ipChunks.map((ipChunk) => ({
            conditions: [{ type: "ip_address", op: "inc", value: ipChunk }],
        })),
        action: {
            mitigate: {
                action: "bypass",
                ...(shouldBypassSystem ? { bypassSystem: true } : {}),
            },
        },
    };
}

function getRuleIps(rule: FirewallRule) {
    return rule.conditionGroup
        .flatMap(({ conditions }) => conditions)
        .filter((condition) => condition.type === "ip_address")
        .flatMap((condition) => condition.value ?? [])
        .map(String)
        .sort();
}

function isRuleUpToDate(rule: FirewallRule, ips: string[], shouldBypassSystem: boolean) {
    const mitigate = rule.action.mitigate;
    const ruleIps = getRuleIps(rule);

    return (
        rule.active &&
        mitigate?.action === "bypass" &&
        Boolean(mitigate.bypassSystem) === shouldBypassSystem &&
        ruleIps.length === ips.length &&
        ruleIps.every((ip, index) => ip === ips[index])
    );
}

async function patchFirewallConfig(options: SyncFirewallOptions, body: unknown) {
    await callVercelApi(options, buildFirewallUrl(options), {
        method: "PATCH",
        body: JSON.stringify(body),
    });
}

export async function syncRedirectionIoFirewallRule(options: SyncFirewallOptions): Promise<SyncFirewallResult> {
    const ruleName = options.ruleName ?? DEFAULT_RULE_NAME;
    const shouldBypassSystem = options.bypassSystem ?? false;
    const ips = await fetchRedirectionIoIps();

    if (ips.length === 0) {
        throw new Error("redirection.io returned an empty IP list, refusing to update the firewall rule");
    }

    const existingRule = (await fetchActiveFirewallRules(options)).find((rule) => rule.name === ruleName);
    const rule = buildBypassRule(ruleName, ips, shouldBypassSystem);

    if (existingRule) {
        if (isRuleUpToDate(existingRule, ips, shouldBypassSystem)) {
            return { status: "unchanged", ruleId: existingRule.id, ips };
        }

        await patchFirewallConfig(options, { action: "rules.update", id: existingRule.id, value: rule });

        return { status: "updated", ruleId: existingRule.id, ips };
    }

    await patchFirewallConfig(options, { action: "rules.insert", id: null, value: rule });

    const insertedRule = (await fetchActiveFirewallRules(options)).find((activeRule) => activeRule.name === ruleName);

    if (!insertedRule) {
        throw new Error(`Firewall rule "${ruleName}" was inserted but could not be found in the active configuration`);
    }

    // Bypass only skips the custom rules evaluated after it, so the rule must come first.
    await patchFirewallConfig(options, { action: "rules.priority", id: insertedRule.id, value: 0 });

    return { status: "created", ruleId: insertedRule.id, ips };
}

export function createFirewallSyncRouteHandler(options?: Partial<SyncFirewallOptions>) {
    return async (request: Request): Promise<Response> => {
        const cronSecret = process.env.CRON_SECRET;

        if (!cronSecret) {
            return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
        }

        if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        try {
            const result = await syncRedirectionIoFirewallRule({ ...getSyncFirewallOptionsFromEnv(), ...options });

            return Response.json(result);
        } catch (error) {
            console.error(error);

            return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
        }
    };
}
