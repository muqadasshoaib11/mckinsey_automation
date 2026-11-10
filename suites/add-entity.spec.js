const { test, expect } = require("@playwright/test");

const ENTITY = {
  name: "SPOC MDSS",
  spocName: "WSM",
  email: "wsm12@gmail.com",
  phone: "674532111",
};

async function chooseOption(page, selectLocator, optionText) {
  await page.keyboard.press("Escape");
  await selectLocator.scrollIntoViewIfNeeded();
  await selectLocator.click();
  const dropdown = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)").last();
  await dropdown.locator(".ant-select-item-option").first().waitFor({ state: "visible" });
  const search = selectLocator.locator("input:not([readonly])");
  if (await search.count()) await search.first().fill(optionText);
  const option = dropdown.locator(".ant-select-item-option").filter({
    hasText: new RegExp(`^\\s*${optionText}\\s*$`),
  });
  await option.first().click();
}

test("add entity and invite SPOC", async ({ page }) => {
  test.setTimeout(120000);
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  expect(email, "ADMIN_EMAIL is set").toBeTruthy();
  expect(password, "ADMIN_PASSWORD is set").toBeTruthy();

  await page.goto("https://mjn-staging-app.vproj.com/admin/login", { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder*="mail" i], input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign\s*in|log\s*in/i }).first().click();
  await page.waitForURL(/dashboard|entities/);

  await page.getByRole("button", { name: /add entity/i }).first().click();
  await page.waitForURL(/entity\/add/);

  await page.getByPlaceholder("Enter Entity Name").fill(ENTITY.name);
  await page.getByPlaceholder("Enter SPOC Name").fill(ENTITY.spocName);
  await page.getByPlaceholder("Enter SPOC Email Address").fill(ENTITY.email);
  await page.getByPlaceholder("Enter Mobile Number").fill(ENTITY.phone);

  await chooseOption(page, page.locator(".ant-select").first(), "VRP");
  await chooseOption(page, page.locator(".ant-select").nth(1), "Housing Program");
  await page.getByRole("button", { name: /^add new$/i }).click();
  await chooseOption(page, page.locator(".ant-select").filter({ hasText: /Select Entity Type/ }).last(), "National Strategy");
  await chooseOption(page, page.locator(".ant-select").last(), "National Agriculture Strategy");

  const phone = page.getByPlaceholder("Enter Mobile Number");
  await phone.click();
  await phone.fill("");
  await phone.pressSequentially(ENTITY.phone, { delay: 40 });
  await page.getByText("Add Entity", { exact: true }).first().click();

  const bulkCreate = page.waitForResponse(
    (response) => response.url().includes("/entity/bulk-create") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /save\s*&\s*invite entities/i }).click();
  const popup = page.locator(".ant-modal, [role='dialog']").last();
  await expect(popup).toContainText(/entities added/i);
  await popup.getByRole("button", { name: /done|ok/i }).click();
  const response = await bulkCreate;
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(String(body.status).toLowerCase()).toBe("success");
});
