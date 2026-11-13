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

async function chooseFirst(page, selectLocator) {
  await page.keyboard.press("Escape");
  await selectLocator.scrollIntoViewIfNeeded();
  await selectLocator.click();
  const dropdown = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)").last();
  await dropdown.locator(".ant-select-item-option").first().waitFor({ state: "visible" });
  await dropdown.locator(".ant-select-item-option").first().click();
}

async function selectLast(page, selectLocator) {
  await page.keyboard.press("Escape");
  await selectLocator.scrollIntoViewIfNeeded();
  await selectLocator.click();
  const dropdown = page.locator(".ant-select-dropdown:not(.ant-select-dropdown-hidden)").last();
  const holder = dropdown.locator(".rc-virtual-list-holder").first();
  await dropdown.locator(".ant-select-item-option").first().waitFor({ state: "visible" });
  const options = dropdown.locator(".ant-select-item-option");
  if (await holder.count()) {
    // The list is virtualised, so keep scrolling until the last option stops changing.
    let previous = "";
    for (let i = 0; i < 20; i += 1) {
      await holder.evaluate((element) => { element.scrollTop = element.scrollHeight; });
      await page.waitForTimeout(400);
      const current = (await options.last().innerText()).trim();
      if (current === previous) break;
      previous = current;
    }
  }
  const last = options.last();
  await last.scrollIntoViewIfNeeded();
  const picked = (await last.innerText()).replace(/\s+/g, " ").trim();
  await last.click();
  await page.waitForTimeout(1200);
  return picked;
}

async function fillDirectJobs(page, year, value) {
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
  expect(best, `direct jobs input for ${year}`).toBeGreaterThanOrEqual(0);
  await inputs.nth(best).fill(value);
}

const STRATEGY = "Mining & Metal Industry Comprehensive Strategy";
// Fills a field, or checks it has a value when the platform has pre-filled and locked it.
async function fillOrVerify(page, input, value) {
  const isSelect = await input.evaluate((element) => element.classList.contains("ant-select-selection-search-input"));
  if (isSelect) {
    const select = input.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' ant-select ')][1]");
    if (await input.isDisabled()) {
      await expect(select.locator(".ant-select-selection-item")).not.toHaveText("");
    } else if (!(await select.locator(".ant-select-selection-item").count())) {
      await chooseFirst(page, select);
    }
    return;
  }
  if (await input.isDisabled()) {
    await expect(input).not.toHaveValue("");
  } else if (!(await input.inputValue())) {
    await input.fill(value);
  }
}

// Clicks Submit, confirms the "Are you sure" dialog, and returns the server's reply.
async function submitAndConfirm(page) {
  const saved = page.waitForResponse(
    (response) => response.url().includes("/submission/update-submission") && response.request().method() === "POST",
    { timeout: 120000 }
  );
  await page.getByRole("button", { name: /^submit$/i }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: /are you sure you want to submit this form/i }).last();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: /^yes$/i }).click();
  const response = await saved;
  const body = await response.json();
  expect(response.status(), JSON.stringify(body).slice(0, 500)).toBe(200);
  await dialog.waitFor({ state: "hidden", timeout: 120000 });
  return body;
}

test("SPOC submits a national strategy and the JCI reviewer shares feedback", async ({ page }) => {
  test.setTimeout(600000);
  page.setDefaultTimeout(30000);
  const email = process.env.USER_EMAIL;
  const password = process.env.USER_PASSWORD;
  expect(email, "USER_EMAIL is set").toBeTruthy();
  expect(password, "USER_PASSWORD is set").toBeTruthy();
  expect(process.env.REVIEWER_EMAIL, "REVIEWER_EMAIL is set").toBeTruthy();
  expect(process.env.REVIEWER_PASSWORD, "REVIEWER_PASSWORD is set").toBeTruthy();
  // 1. Sign into the SPOC platform.
  await page.goto("https://mjn-staging-app.vproj.com/user/login", { waitUntil: "domcontentloaded" });
  await page.getByPlaceholder("Enter Email").fill(email);
  await page.getByPlaceholder("Enter Password").fill(password);
  const loginResponse = page.waitForResponse(
    (response) => response.url().includes("/api/v1/user/login") && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: /sign in/i }).click();
  expect((await loginResponse).status()).toBe(200);
  await page.waitForURL(/dashboard/);

  // 2. Open the Submissions tab.
  await page.getByText("Submission", { exact: true }).first().click();

  // 3. Create a new National Strategy submission.
  await page.getByRole("button", { name: /new submission/i }).click();
  await page.waitForURL(/submission\/add/);
  await chooseExact(page, page.locator(".ant-select").first(), "National Strategy");
  await chooseExact(page, page.locator(".ant-select").nth(1), STRATEGY);
  await page.getByRole("button", { name: /^continue$/i }).click();
  const continueDialog = page.getByRole("dialog").last();
  await continueDialog.waitFor();
  // Staging can take longer than the default step timeout to create the submission.
  const created = page.waitForResponse(
    (response) => response.url().includes("/submission/create") && response.request().method() === "POST",
    { timeout: 120000 }
  );
  await continueDialog.getByRole("button", { name: /^yes$/i }).click();
  expect((await created).status()).toBe(200);

  // 4. Fill every Strategy Information field, with Makkah at 100%.
  await page.getByText("Strategy Information").first().waitFor();
  const description = page.getByPlaceholder("Type a description or add notes here (text only)");
  await description.waitFor({ timeout: 60000 });
  // Fields 1, 3 and 4 are filled here unless the platform has pre-filled and locked them.
  const strategyName = page.getByPlaceholder("Type in Strategy name (text only)");
  await fillOrVerify(page, strategyName, STRATEGY);
  await expect(strategyName).toHaveValue(STRATEGY);
  await description.fill(
    "The Mining and Metal Industry Comprehensive Strategy creates direct sustainable jobs in mining, mineral processing, and metal manufacturing, concentrated in the Makkah region."
  );
  const executingEntity = page.getByText("3. Executing entity").first().locator("xpath=following::input[1]");
  await fillOrVerify(page, executingEntity, "SPOC MDSS");
  const status = page.getByText(/status of strategy/i).first().locator("xpath=following::input[1]");
  await fillOrVerify(page, status, "Under development/refresh by strategy owner");
  const jobCreator = page.getByText(/is this strategy a job creator/i).first();
  await chooseExact(page, jobCreator.locator("xpath=following::*[contains(@class,'ant-select')][1]"), "Yes");
  await page.getByPlaceholder("0-100").nth(0).fill("80");
  await page.getByPlaceholder("0-100").nth(1).fill("30");
  const optionalJobs = page.getByPlaceholder(/type a number greater than/i);
  await optionalJobs.nth(0).fill("400");
  await optionalJobs.nth(1).fill("300");
  await optionalJobs.nth(2).fill("300");
  const dependencies = page.getByText(/external dependencies/i).first();
  await chooseFirst(page, dependencies.locator("xpath=following::*[contains(@class,'ant-select')][1]"));
  const makkah = page.getByText("Makkah", { exact: true }).first();
  await makkah.scrollIntoViewIfNeeded();
  await makkah.click();
  await page.locator("xpath=//*[normalize-space()='Makkah']/following::input[1]").first().fill("100");
  await page.getByRole("button", { name: /next step/i }).click();
  // 5. Enter more than 1000 direct jobs on Job Creation Estimates.
  await page.getByText("Direct Jobs (Mandatory)").first().waitFor();
  await fillDirectJobs(page, "2028", "1200");
  await page.getByRole("button", { name: /next step/i }).click();
  // 6. ISIC: choose the last option in the last dropdown. The other levels fill themselves.
  await page.getByText(/ISIC4 Mapping/i).first().waitFor();
  const emptyLevels = page.locator(".ant-select").filter({ hasText: /select option/i });
  await emptyLevels.first().waitFor();
  const isicPicked = await selectLast(page, emptyLevels.last());
  console.log("ISIC picked:", isicPicked);
  await expect(emptyLevels, "every ISIC level is filled").toHaveCount(0, { timeout: 15000 });
  const isicDone = page.getByRole("button", { name: /^done$/i });
  if (await isicDone.count()) await isicDone.first().click();
  await page.getByRole("button", { name: /next step/i }).click();
  // 6. ISCO: choose the last option in the last dropdown. The other groups fill themselves.
  await page.getByText("Major Group", { exact: true }).waitFor();
  await emptyLevels.first().waitFor();
  const iscoJobs = page.getByText(/number of jobs in this isco/i).locator("xpath=following::input[1]").first();
  if (await iscoJobs.count()) await iscoJobs.fill("1200");
  const iscoPicked = await selectLast(page, emptyLevels.last());
  console.log("ISCO picked:", iscoPicked);
  await expect(emptyLevels, "every ISCO group is filled").toHaveCount(0, { timeout: 15000 });
  const iscoDone = page.getByRole("button", { name: /^done$/i });
  if (await iscoDone.count()) await iscoDone.first().click();
  await page.getByRole("button", { name: /next step/i }).click();
  // 7. Send the submission to the JCI reviewer.
  // The Submit on Supporting Documents only saves the form and opens the Review Submission
  // summary. The Submit on that summary is the one that sends it to the JCI reviewer.
  const savedBody = await submitAndConfirm(page);
  expect(String(savedBody.status).toLowerCase()).toBe("success");
  await page.getByText("Total direct sustainable jobs").first().waitFor();
  await expect(page.getByText("Review Submission").first()).toBeVisible();
  const body = await submitAndConfirm(page);
  expect(String(body.status).toLowerCase()).toBe("success");
  const submissionId = JSON.stringify(body).match(/NS-\d+/)?.[0];
  expect(submissionId, JSON.stringify(body.data || body)).toBeTruthy();
  const submitted = {
    submissionNo: body.data?.submissionNo,
    version: body.data?.version,
    status: body.data?.status,
    spocStatus: body.data?.spocStatus,
    reviewerStatus: body.data?.reviewerStatus,
  };
  console.log("SPOC submit result:", JSON.stringify(submitted));
  test.info().annotations.push({ type: "SPOC submit result", description: JSON.stringify(submitted) });
  expect(submitted.spocStatus, `${submissionId} was sent to the JCI reviewer`).toBe("Submitted to JCI");

  // Reviewer 1. Sign in.
  const reviewer = await page.context().browser().newPage();
  reviewer.setDefaultTimeout(30000);
  await reviewer.goto("https://mjn-staging-app.vproj.com/admin/login", { waitUntil: "domcontentloaded" });
  await reviewer.locator('input[placeholder*="mail" i], input[type="email"]').first().fill(process.env.REVIEWER_EMAIL);
  await reviewer.locator('input[type="password"]').first().fill(process.env.REVIEWER_PASSWORD);
  await reviewer.getByRole("button", { name: /sign\s*in|log\s*in/i }).first().click();
  await reviewer.waitForURL(/dashboard/);
  await reviewer.locator("span").filter({ hasText: /^Submission$/ }).locator("visible=true").last().click();
  const reviewRow = reviewer.locator("tr").filter({ hasText: submissionId }).first();
  await reviewRow.waitFor();

  // 2. Verify the submission id in the list (the View page does not show the id), then view it.
  await expect(reviewRow).toContainText(submissionId);
  const listedRow = (await reviewRow.innerText()).replace(/\s+/g, " ").trim();
  console.log("Reviewer list row:", listedRow);
  await reviewRow.locator("img").click();
  await reviewer.locator(".ant-dropdown-menu-item").filter({ hasText: /^View$/ }).click();
  await expect(reviewer.getByText(`Strategy/${STRATEGY}`).first()).toBeVisible();

  // 3. In the reviewer's list, this submission id has the status Pending JCI-R Review.
  //    (The View page shows the SPOC-side status, "Submitted to JCI".)
  await reviewer.locator("span").filter({ hasText: /^Submission$/ }).locator("visible=true").last().click();
  const openRow = reviewer.locator("tr").filter({ hasText: submissionId }).first();
  await openRow.waitFor();
  await expect(openRow).toContainText("Pending JCI-R Review");

  // 4. Review the submission and open its detail page.
  await openRow.locator("img").click();
  await reviewer.locator(".ant-dropdown-menu-item").filter({ hasText: /^Review$/ }).click();
  await reviewer.getByRole("button", { name: /open submission/i }).click();

  // 5. Add an observation.
  await reviewer.getByRole("button", { name: /add observation/i }).click();
  await reviewer.getByPlaceholder("Please enter your observation").fill("I approve this submission.");
  await reviewer.getByRole("button", { name: /save observation/i }).click();

  // 6. Open Feedback and assign the confidence level.
  await reviewer.getByText("Feedback", { exact: true }).click();
  await reviewer.getByText(/estimate confidence level/i).waitFor();
  const confidence = reviewer.getByText(/estimate confidence level/i).first();
  await chooseExact(reviewer, confidence.locator("xpath=following::*[contains(@class,'ant-select')][1]"), "L4");

  // 7. Map ISIC and ISCO, and answer Yes for relevancy.
  const mapped = reviewer.getByText("Activities mapped to the right sub-sector/submission?");
  await chooseExact(reviewer, mapped.nth(0).locator("xpath=following::*[contains(@class,'ant-select')][1]"), "Yes");
  await chooseExact(reviewer, mapped.nth(1).locator("xpath=following::*[contains(@class,'ant-select')][1]"), "Yes");
  const relevant = reviewer.getByText(/is this isco relevant/i).first();
  await relevant.scrollIntoViewIfNeeded();
  await chooseExact(reviewer, relevant.locator("xpath=following::*[contains(@class,'ant-select')][1]"), "Yes");
  await reviewer.getByRole("button", { name: /^done$/i }).click();

  // 8. Submit the review.
  const submitReview = reviewer.getByRole("button", { name: /submit review/i });
  await submitReview.waitFor();
  await reviewer.waitForFunction(() => {
    const match = [...document.querySelectorAll("button")].find((button) => /submit review/i.test(button.innerText));
    return match && !match.disabled;
  });
  const approved = reviewer.waitForResponse(
    (result) => result.url().includes("/submission/approve") && result.request().method() === "POST",
    { timeout: 120000 }
  );
  await submitReview.click();
  const confirm = reviewer.getByRole("dialog").last();
  await confirm.waitFor();
  await confirm.getByRole("button", { name: /^yes$/i }).click();
  await confirm.waitFor({ state: "hidden", timeout: 60000 });
  const approval = await approved;
  expect(approval.status()).toBe(200);

  // 9. Approval leaves the submission as JCI Feedback Shared.
  await reviewer.locator("span").filter({ hasText: /^Submission$/ }).locator("visible=true").last().click();
  const reviewed = reviewer.locator("tr").filter({ hasText: submissionId }).first();
  await expect(reviewed).toContainText(submissionId);
  await expect(reviewed).toContainText("JCI Feedback Shared");
  await reviewer.close();
});
