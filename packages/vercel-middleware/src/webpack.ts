/**
 * This file is intended to be used only for Webpack in a Next.js application.
 *
 * It's used to fix errors appearing while loading the Redirection IO WASM module.
 */
import path from "path";

export const redirectionIoWebpackWasmRule = {
    test: /\.wasm$/,
    resourceQuery: /module/,
    type: "javascript/auto",
    use: [
        {
            loader: path.resolve(path.join(__dirname, "wasm-module-loader.cjs")),
        },
    ],
};
