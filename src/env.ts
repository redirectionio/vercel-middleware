export const getEnv = () => {
    const REDIRECTIONIO_TOKEN = process.env.REDIRECTIONIO_TOKEN || "";
    const REDIRECTIONIO_INSTANCE_NAME = process.env.REDIRECTIONIO_INSTANCE_NAME || "redirection-io-vercel-middleware";
    const REDIRECTIONIO_VERSION = "redirection-io-vercel-middleware/0.3.12";
    const REDIRECTIONIO_ADD_HEADER_RULE_IDS = process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS
        ? process.env.REDIRECTIONIO_ADD_HEADER_RULE_IDS === "true"
        : false;
    const REDIRECTIONIO_TIMEOUT = process.env.REDIRECTIONIO_TIMEOUT
        ? parseInt(process.env.REDIRECTIONIO_TIMEOUT, 10)
        : 500;

    return {
        REDIRECTIONIO_TOKEN,
        REDIRECTIONIO_INSTANCE_NAME,
        REDIRECTIONIO_VERSION,
        REDIRECTIONIO_ADD_HEADER_RULE_IDS,
        REDIRECTIONIO_TIMEOUT,
    };
};
