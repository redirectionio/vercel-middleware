#!/usr/bin/env node
// Explicit extension required: tsup does not bundle, and this file is run directly by Node.
import { getSyncFirewallOptionsFromEnv, syncRedirectionIoFirewallRule } from "./firewall.js";

syncRedirectionIoFirewallRule(getSyncFirewallOptionsFromEnv())
    .then((result) => {
        console.info(
            `Firewall rule ${result.status} (${result.ruleId ?? "no id"}) with ${result.ips.length} redirection.io IPs`,
        );
    })
    .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
    });
