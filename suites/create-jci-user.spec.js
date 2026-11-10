const { test, expect } = require("@playwright/test");

const runId = String(process.env.GITHUB_RUN_ID || Date.now()).slice(-6);
const USER = {
  name: `JCI CI ${runId}`,
  email: `jci.ci.${runId}@gmail.com`,
  phone: `7${runId}19`,
  role: "Admin",
};

async function chooseRole(page, role) {
  const select = page.locator(".ant-select").filter({ hasText: /select role/i }).first();
  await select.click();
  const dropdown = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)").last();
  await dropdown.locator(".ant-select-item-option").filter({
    hasText: new RegExp(`^\\s*${role}\\s*$`),
  }).first().click();
}

test("admin creates and invites a JCI user", async ({ page }) => {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  expect(email, "ADMIN_EMAIL is set").toBeTruthy();
  expect(password, "ADMIN_PASSWORD is set").toBeTruthy();

  await page.goto("https://mjn-staging-app.vproj.com/admin/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder*="mail" i], input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign\s*in|log\s*in/i }).first().click();
  await page.waitForURL(/dashboard/);

  await page.locator("span").filter({ hasText: /^JCI Users$/ }).locator("visible=true").last().click();
  await page.waitForURL(/userListing/);
  await page.getByRole("button", { name: /create user/i }).click();
  await page.waitForURL(/users\/add/);

  await page.getByPlaceholder("Enter User Name").fill(USER.name);
  await page.getByPlaceholder("Enter User Email").fill(USER.email);
  const phone = page.getByPlaceholder("Enter Mobile Number");
  await phone.click();
  await phone.fill("");
  await phone.pressSequentially(USER.phone, { delay: 40 });
  await chooseRole(page, USER.role);

  const invited = page.waitForResponse(
    (response) => /\/api\/v1\/user\//.test(response.url()) && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /invite user/i }).click();
  const response = await invited;
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(String(body.status).toLowerCase()).toBe("success");
  await page.locator("span").filter({ hasText: /^JCI Users$/ }).locator("visible=true").last().click();
  await expect(page.getByText(USER.email).first()).toBeVisible();
  await expect(page.getByText(USER.name).first()).toBeVisible();
});
