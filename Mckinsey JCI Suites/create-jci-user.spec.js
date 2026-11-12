const { test, expect } = require("@playwright/test");

const runId = String(process.env.GITHUB_RUN_ID || Date.now()).slice(-6);
const letters = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
const nameSuffix = [...runId].map((digit) => letters[Number(digit)]).join("");
const USER = {
  name: `JCI ${nameSuffix}`,
  email: `jci.ci.${runId}@gmail.com`,
  phone: `5${runId}27`,
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
  test.setTimeout(180000);
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

  await expect(page.locator(".ant-select").filter({ hasText: USER.role }).first()).toBeVisible();
  const invited = page.waitForResponse(
    (response) => /\/api\/v1\/user/.test(response.url()) && response.request().method() === "POST" && !response.url().includes("/login"),
    { timeout: 30000 }
  );
  await page.getByRole("button", { name: /invite user/i }).click();
  const confirm = page.getByRole("dialog");
  if (await confirm.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false)) {
    await confirm.getByRole("button", { name: /yes|ok|confirm|invite/i }).first().click();
  }
  const response = await invited;
  const body = await response.json();

  expect(response.status(), JSON.stringify(body)).toBe(200);
  expect(String(body.status).toLowerCase()).toBe("success");
  await page.locator("span").filter({ hasText: /^JCI Users$/ }).locator("visible=true").last().click();
  await expect(page.getByText(USER.email).first()).toBeVisible();
  await expect(page.getByText(USER.name).first()).toBeVisible();
});
