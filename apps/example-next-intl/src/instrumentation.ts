import { registerRedirectionIoInstrumentation } from "@redirection.io/vercel-middleware/instrumentation";

export const register = async () => {
    registerRedirectionIoInstrumentation();
};
