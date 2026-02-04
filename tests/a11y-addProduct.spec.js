const { test, expect } = require("@playwright/test");

const {
  runA11yTwoPass,
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
  summarizeViolations,
} = require("./helpers/a11y");

test("ADMIN ADD a11y (Phase 3)", async ({ page }, testInfo) => {
  // 1) Open signin
  await page.goto("/signin", { waitUntil: "domcontentloaded" });
  await expect(page.locator("nav")).toBeVisible();

  // --- LOGIN CREDS ---
  const email = process.env.PW_ADMIN_EMAIL;
  const pass = process.env.PW_ADMIN_PASSWORD;

  if (!email || !pass) {
    throw new Error(
      "Missing PW_ADMIN_EMAIL / PW_ADMIN_PASSWORD. Load .env or set env vars.",
    );
  }

  // Fill login form
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(pass);
  await page.getByRole("button", { name: /sign in/i }).click();

  // 2) Go directly to admin/add
  await page.goto("/admin/add", { waitUntil: "domcontentloaded" });

  // Stable UI check
  await expect(page.locator("nav")).toBeVisible();
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  await page.waitForTimeout(1500);

  // Screenshot evidence
  await page.screenshot({
    path: `test-results/a11y/${testInfo.title}.png`,
    fullPage: true,
  });

  // Hard login validation
  const stillOnSignin = await page
    .getByRole("button", { name: /sign in/i })
    .isVisible()
    .catch(() => false);

  if (stillOnSignin) {
    throw new Error(
      "Login failed: still seeing Sign In button. Check admin role + credentials.",
    );
  }

  // 3) Run 2-pass scan
  const { resultsGate, resultsAudit, blocking, backlog, promoted } =
    await runA11yTwoPass(page);

  // 4) Save artifacts
  const gateArtifacts = writeA11yArtifacts({
    testName: `${testInfo.title}__gate`,
    results: resultsGate,
    mode: "gate",
    gateBlockers: blocking,
  });

  writeA11yArtifacts({
    testName: `${testInfo.title}__audit`,
    results: resultsAudit,
    mode: "audit",
    promoted,
  });

  // 5) Output
  if (blocking.length) {
    console.log("❌ ADMIN/ADD blockers found.");
    console.log(`Gate report: ${gateArtifacts.prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ ADMIN/ADD: no gate blockers.");
  }

  // 6) Backlog export
  if (backlog.length) {
    const { backlogPath } = appendToMinorBacklog({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    const { mdPath } = appendToMinorBacklogMarkdown({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    console.log("ℹ️ ADMIN/ADD: minor backlog saved:", backlogPath);
    console.log("ℹ️ ADMIN/ADD: minor backlog md:", mdPath);
    console.table(summarizeViolations(backlog));
  }

  // 7) Gate condition
  expect(blocking).toEqual([]);
});
