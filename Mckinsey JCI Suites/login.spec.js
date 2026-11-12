const { test, expect } = require("@playwright/test");

const APP_URL = "https://mjn-staging-app.vproj.com/admin/login";
const LOGIN_API = "/api/v1/admin/login";

test("admin login", async ({ page }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  expect(email, "ADMIN_EMAIL is set").toBeTruthy();
  expect(password, "ADMIN_PASSWORD is set").toBeTruthy();

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"], input[placeholder*="mail" i]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);

  const loginResponse = page.waitForResponse(
    (response) => response.url().includes(LOGIN_API) && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /sign\s*in|log\s*in/i }).first().click();
  const response = await loginResponse;
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(String(body.status).toLowerCase()).toBe("success");
  expect(body.data.userAuth).toBeTruthy();
  await expect(page).toHaveURL(/dashboard\/entities/);
  await expect(page.getByText("Entities Listing").first()).toBeVisible();
});
