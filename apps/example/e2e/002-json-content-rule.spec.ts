import test, { expect } from "@playwright/test";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";

test.describe("JSON content rule", () => {
    test('should contain "hello": "world" JSON response', async ({ page }) => {
        const response = await page.goto(`${baseUrl}/test-new-body`);

        expect(response).not.toBe(null);

        if (response) {
            const json = await response.json();
            expect(json).toEqual({ hello: "world" });
        }
    });
});
