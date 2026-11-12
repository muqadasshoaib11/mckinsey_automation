const { test, expect } = require("@playwright/test");

const runId = String(process.env.GITHUB_RUN_ID || Date.now()).slice(-6);
const ENTITY_USER = {
  name: `Entity CI ${runId}`,
  email: `entity.ci.${runId}@gmail.com`,
  phone: `5${runId}18`,
  role: "Entity User",
};

async function signIn(page, url, email, password) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.locator('input[placeholder*="mail" i], input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.getByRole("button", { name: /sign\s*in|log\s*in/i }).first().click();
  await page.waitForURL(/dashboard/);
}

async function chooseRole(page, role) {
  const select = page.locator(".ant-select").filter({ hasText: /select role/i }).first();
  await select.click();
  const dropdown = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)").last();
  await dropdown.locator(".ant-select-item-option").first().waitFor({ state: "visible" });
  await dropdown.locator(".ant-select-item-option").filter({
    hasText: new RegExp(`^\\s*${role}\\s*$`),
  }).first().click();
}

test("SPOC requests an entity user and the admin approves it", async ({ page }) => {
  test.setTimeout(180000);
  const spocEmail = process.env.USER_EMAIL;
  const spocPassword = process.env.USER_PASSWORD;
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;
  expect(spocEmail, "USER_EMAIL is set").toBeTruthy();
  expect(spocPassword, "USER_PASSWORD is set").toBeTruthy();
  expect(adminEmail, "ADMIN_EMAIL is set").toBeTruthy();
  expect(adminPassword, "ADMIN_PASSWORD is set").toBeTruthy();

  await signIn(page, "https://mjn-staging-app.vproj.com/user/login", spocEmail, spocPassword);
  await page.locator("span").filter({ hasText: /^Entity Users$/ }).locator("visible=true").last().click();
  await page.getByRole("button", { name: /create user/i }).click();
  await page.waitForURL(/\/user\/users\/add/);

  await page.getByPlaceholder("Enter User Name").fill(ENTITY_USER.name);
  await page.getByPlaceholder("Enter User Email").fill(ENTITY_USER.email);
  const phone = page.getByPlaceholder("Enter Mobile Number");
  await phone.click();
  await phone.fill("");
  await phone.pressSequentially(ENTITY_USER.phone, { delay: 40 });
  await chooseRole(page, ENTITY_USER.role);

  await expect(page.locator(".ant-select").filter({ hasText: ENTITY_USER.role }).first()).toBeVisible();
  const created = page.waitForResponse(
    (response) => /\/api\/v1\/user\/create/.test(response.url()) && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /submit request/i }).click();
  const createResponse = await created;
  const createBody = await createResponse.json();
  expect(createResponse.status(), JSON.stringify(createBody)).toBe(200);
  expect(String(createBody.status).toLowerCase()).toBe("success");

  const added = page.getByRole("dialog").filter({ hasText: "User Added" });
  await expect(added).toBeVisible();
  await added.getByRole("button", { name: "Done" }).click();

  const admin = await page.context().browser().newPage({ viewport: { width: 1280, height: 860 } });
  await signIn(admin, "https://mjn-staging-app.vproj.com/admin/login", adminEmail, adminPassword);
  await admin.locator("span").filter({ hasText: /^Users List$/ }).locator("visible=true").last().click();
  await admin.waitForURL(/usersRequest/);

  const search = admin.getByPlaceholder(/search/i).first();
  await search.fill(ENTITY_USER.email);
  await search.press("Enter");
  await admin.waitForURL(/Search=/);

  const row = admin.getByText(ENTITY_USER.email).first().locator("xpath=ancestor::tr[1]");
  await expect(row).toContainText(ENTITY_USER.name);
  await expect(row).toContainText("Pending");
  await row.getByRole("button", { name: "Action" }).click();
  await admin.getByRole("menuitem", { name: "View" }).click();
  await admin.waitForURL(/viewUserRequest/);

  await expect(admin.getByRole("paragraph").filter({ hasText: "Request Detail" })).toBeVisible();
  await expect(admin.getByPlaceholder("Enter User Name")).toHaveValue(ENTITY_USER.name);
  await expect(admin.getByPlaceholder("Enter User Email")).toHaveValue(ENTITY_USER.email);
  await expect(admin.locator("body")).toContainText(ENTITY_USER.role);

  const approved = admin.waitForResponse(
    (response) => /\/api\/v1\/user\/change-status/.test(response.url()) && response.request().method() === "POST"
  );
  await admin.getByRole("button", { name: /^Approve$/ }).click();
  const approveResponse = await approved;
  const approveBody = await approveResponse.json();
  expect(approveResponse.status()).toBe(200);
  expect(String(approveBody.status).toLowerCase()).toBe("success");

  const updated = admin.getByRole("dialog").filter({ hasText: "Status Updated" });
  await expect(updated).toBeVisible();
  await updated.getByRole("button", { name: "Done" }).click();

  await admin.goto("https://mjn-staging-app.vproj.com/admin/usersRequest", { waitUntil: "domcontentloaded" });
  await admin.getByPlaceholder(/search/i).first().fill(ENTITY_USER.email);
  await admin.getByPlaceholder(/search/i).first().press("Enter");
  await admin.waitForURL(/Search=/);
  await expect(admin.locator("tr").filter({ hasText: ENTITY_USER.email })).toHaveCount(0);
  await admin.close();
});
