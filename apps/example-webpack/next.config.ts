import type { NextConfig } from "next";
import { redirectionIoWebpackWasmRule } from "@redirection.io/vercel-middleware/webpack";

const nextConfig: NextConfig = {
    webpack: (config, { isServer }) => {
        if (isServer) {
            config.module.rules.push(redirectionIoWebpackWasmRule);
        }

        return config;
    },
};

export default nextConfig;
