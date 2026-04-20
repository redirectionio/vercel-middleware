import { test, expect } from "@playwright/test";

const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";

test.describe("Basic redirection", () => {
    test("should redirect to the target URL", async ({ page }) => {
        const response = await page.goto(`${baseUrl}/test-redirect`);

        await page.waitForURL(`${baseUrl}/result-redirect`);

        expect(response).not.toBe(null);

        if (response) {
            expect(response.status()).toBe(404);
        }
    });
});
