import { defineConfig } from "@rslib/core";
import { glob } from "glob";

export default defineConfig({
    lib: [
        {
            format: "esm",
            output: { filename: { js: "[name].mjs" } },
            bundle: false,
            dts: {
                bundle: false,
                abortOnError: false,
            },
        },
        {
            format: "cjs",
            output: { filename: { js: "[name].js" } },
            bundle: false,
        },
    ],
    source: {
        entry: {
            index: glob.sync("src/**/*.{ts,tsx}", {
                ignore: ["**/tests/*", "**/*.test.{ts,tsx}"],
            }),
        },
    },
});
