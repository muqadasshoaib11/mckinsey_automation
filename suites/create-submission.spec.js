const { test, expect } = require("@playwright/test");

async function chooseExact(page, selectLocator, optionText) {
  await page.keyboard.press("Escape");
  await selectLocator.scrollIntoViewIfNeeded();
  await selectLocator.click();
  const dropdown = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)").last();
  await dropdown.locator(".ant-select-item-option").first().waitFor({ state: "visible" });
  const option = dropdown.locator(".ant-select-item-option").filter({
    hasText: new RegExp(`^\\s*${optionText}\\s*$`),
  });
  await option.first().click();
}

async function pickPreferred(page, selectLocator, pattern) {
  await page.keyboard.press("Escape");
  await selectLocator.scrollIntoViewIfNeeded();
  await selectLocator.click();
  const dropdown = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)").last();
  await dropdown.locator(".ant-select-item-option").first().waitFor({ state: "visible" });
  let option = dropdown.locator(".ant-select-item-option").filter({ hasText: pattern }).first();
  if (!(await option.count())) option = dropdown.locator(".ant-select-item-option").first();
  await option.click();
  await page.waitForTimeout(700);
}

async function fillYear(page, year, value) {
  const label = page.getByText(year, { exact: true }).first();
  await label.scrollIntoViewIfNeeded();
  const labelBox = await label.boundingBox();
  const inputs = page.getByPlaceholder("Enter a number");
  let best = -1;
  let bestDx = Infinity;
  for (let i = 0; i < await inputs.count(); i += 1) {
    const box = await inputs.nth(i).boundingBox();
    if (!box || !labelBox) continue;
    if (Math.abs(box.y - labelBox.y) < 16 && box.x > labelBox.x && box.x - labelBox.x < bestDx) {
      best = i;
      bestDx = box.x - labelBox.x;
    }
  }
  expect(best, `jobs input for ${year}`).toBeGreaterThanOrEqual(0);
  const input = inputs.nth(best);
  if ((await input.inputValue()) !== value) await input.fill(value);
}

test("SPOC submits and the JCI reviewer reviews NS-0948", async ({ page }) => {
  test.setTimeout(360000);
  const email = process.env.USER_EMAIL;
  const password = process.env.USER_PASSWORD;
  expect(email, "USER_EMAIL is set").toBeTruthy();
  expect(password, "USER_PASSWORD is set").toBeTruthy();

  await page.goto("https://mjn-staging-app.vproj.com/user/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Enter Email").fill(email);
  await page.getByPlaceholder("Enter Password").fill(password);
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes("/api/v1/user/login") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.waitForURL(/dashboard/);

  await page.getByText("Submission", { exact: true }).first().click();
  await page.getByRole("button", { name: /new submission/i }).click();
  await page.waitForURL(/submission\/add/);

  await chooseExact(page, page.locator(".ant-select").first(), "National Strategy");
  await chooseExact(page, page.locator(".ant-select").nth(1), "National Agriculture Strategy");
  await page.getByRole("button", { name: /^continue$/i }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Yes" }).click();

  const description = page.getByPlaceholder("Type a description or add notes here (text only)");
  await description.waitFor();
  await description.fill(
    "The National Agriculture Strategy creates direct sustainable jobs in farming, food production, and agricultural services, concentrated in the Makkah region."
  );
  await chooseExact(page, page.locator(".ant-select").filter({ hasText: "Select option" }).first(), "Yes");
  await page.getByPlaceholder("0-100").nth(0).fill("80");
  await page.getByPlaceholder("0-100").nth(1).fill("30");
  await chooseExact(page, page.locator(".ant-select").filter({ hasText: "Select option" }).last(), "Yes");
  const makkah = page.getByText("Makkah", { exact: true }).first();
  await makkah.scrollIntoViewIfNeeded();
  await makkah.click();
  await page.locator("xpath=//*[normalize-space()='Makkah']/following::input[1]").first().fill("100");
  await page.getByRole("button", { name: /next step/i }).click();

  await page.getByText("Operational Phase").first().waitFor();
  await fillYear(page, "2028", "600");
  await fillYear(page, "2029", "1200");
  await page.getByRole("button", { name: /next step/i }).click();

  await page.getByText(/ISIC4 Mapping|Activity Level 1/i).first().waitFor();
  const isicEmpty = page.locator(".ant-select:not(.ant-select-disabled)").filter({ hasText: /select option/i });
  for (let i = 0; i < 6 && await isicEmpty.count(); i += 1) {
    await pickPreferred(page, isicEmpty.first(), /agricultur|crop|farm|fishing/i);
  }
  await page.getByRole("button", { name: /next step/i }).click();

  const jobsInput = page.locator("input:not(.ant-select-selection-search-input):not([type='checkbox']):not([type='radio'])").first();
  await jobsInput.waitFor();
  await jobsInput.fill("100");
  await jobsInput.press("Tab");
  await page.getByText("Major Group", { exact: true }).waitFor();
  for (let i = 0; i < 4; i += 1) {
    const pending = page.locator(".ant-select:not(.ant-select-disabled)").filter({ hasText: /select option/i });
    if (!(await pending.count())) break;
    await pickPreferred(page, pending.first(), /skilled agricultural|agricultur|farm|fisher/i);
  }
  const done = page.getByRole("button", { name: /^done$/i });
  if (await done.count()) await done.first().click();
  await page.getByRole("button", { name: /next step/i }).click();

  const saved = page.waitForResponse(
    (response) => response.url().includes("/submission/update-submission") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /^submit$/i }).click();
  const dialog = page.getByRole("dialog").last();
  await dialog.waitFor();
  await expect(dialog).toContainText(/are you sure you want to submit this form/i);
  await dialog.locator("button").last().click();
  await dialog.waitFor({ state: "hidden", timeout: 90000 });
  const response = await saved;
  const body = await response.json();

  expect(response.status()).toBe(200);
  expect(String(body.status).toLowerCase()).toBe("success");
  await expect(page.getByText("Submitted to JCI").first()).toBeVisible();

  const reviewer = await page.context().browser().newPage();
  await reviewer.goto("https://mjn-staging-app.vproj.com/admin/login", { waitUntil: "domcontentloaded" });
  await reviewer.locator('input[placeholder*="mail" i], input[type="email"]').first().fill(process.env.REVIEWER_EMAIL);
  await reviewer.locator('input[type="password"]').first().fill(process.env.REVIEWER_PASSWORD);
  await reviewer.getByRole("button", { name: /sign\s*in|log\s*in/i }).first().click();
  await reviewer.waitForURL(/dashboard/);
  await reviewer.locator("span").filter({ hasText: /^Submission$/ }).locator("visible=true").last().click();
  await reviewer.getByText("NS-0948").first().waitFor();
  const reviewRow = reviewer.getByText("NS-0948").first().locator("xpath=ancestor::tr[1]");
  await reviewRow.locator("img").click();
  await reviewer.locator(".ant-dropdown-menu-item").filter({ hasText: /^Review$/ }).click();
  await reviewer.getByRole("button", { name: /open submission/i }).click();
  await reviewer.getByRole("button", { name: /add observation/i }).click();
  const observation = reviewer.getByPlaceholder("Please enter your observation");
  await observation.fill("I approve this submission.");
  await reviewer.getByRole("button", { name: /save observation/i }).click();
  await reviewer.getByText("Feedback", { exact: true }).click();
  await reviewer.getByText(/estimate confidence level/i).waitFor();

  const confidence = reviewer.getByText(/estimate confidence level/i).first();
  await chooseExact(reviewer, confidence.locator("xpath=following::*[contains(@class,'ant-select')][1]"), "L4");
  const mapped = reviewer.getByText("Activities mapped to the right sub-sector/submission?");
  await chooseExact(reviewer, mapped.nth(0).locator("xpath=following::*[contains(@class,'ant-select')][1]"), "Yes");
  await chooseExact(reviewer, mapped.nth(1).locator("xpath=following::*[contains(@class,'ant-select')][1]"), "Yes");
  const relevant = reviewer.getByText(/is this isco relevant/i).first();
  await relevant.scrollIntoViewIfNeeded();
  await chooseExact(reviewer, relevant.locator("xpath=following::*[contains(@class,'ant-select')][1]"), "Yes");
  await reviewer.getByRole("button", { name: /^done$/i }).click();

  const submitReview = reviewer.getByRole("button", { name: /submit review/i });
  await submitReview.waitFor();
  await reviewer.waitForFunction(() => {
    const match = [...document.querySelectorAll("button")].find((button) => /submit review/i.test(button.innerText));
    return match && !match.disabled;
  });
  const approved = reviewer.waitForResponse(
    (result) => result.url().includes("/submission/approve") && result.request().method() === "POST"
  );
  await submitReview.click();
  const confirm = reviewer.getByRole("dialog").last();
  await confirm.waitFor();
  await confirm.getByRole("button", { name: /^yes$/i }).click();
  await confirm.waitFor({ state: "hidden", timeout: 60000 });
  const approval = await approved;
  expect(approval.status()).toBe(200);

  await reviewer.locator("span").filter({ hasText: /^Submission$/ }).locator("visible=true").last().click();
  const reviewed = reviewer.getByText("NS-0948").first().locator("xpath=ancestor::tr[1]");
  await expect(reviewed).toContainText("JCI Feedback Shared");
  await reviewer.close();
});
