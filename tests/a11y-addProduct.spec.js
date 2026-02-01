const { test, expect } = require("@playwright/test");

const {
  runA11yScan,
  splitByImpact,
  summarizeViolations,
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
} = require("./helpers/a11y");

test("ADMIN ADD a11y (Phase 3 login fail)", async ({ page }, testInfo) => {
  await page.goto("/signin", { waitUntil: "domcontentloaded" });

  // --- LOGIN CREDS ---
  const email = process.env.PW_ADMIN_EMAIL;
  const pass = process.env.PW_ADMIN_PASSWORD;

  if (!email || !pass) {
    throw new Error(
      "Missing PW_ADMIN_EMAIL / PW_ADMIN_PASSWORD. Load .env or set env vars.",
    );
  }

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(pass);
  await page.getByRole("button", { name: /sign in/i }).click();

  // Direktno idi na admin/add (stabilnije nego waitForURL)
  await page.goto("/admin/add", { waitUntil: "domcontentloaded" });
  await page.screenshot({
    path: `test-results/a11y/${testInfo.title}.png`,
    fullPage: true,
  });

  // Hard check: ako vidiš Sign In dugme → login nije uspeo
  const stillOnSignin = await page
    .getByRole("button", { name: /sign in/i })
    .isVisible()
    .catch(() => false);

  if (stillOnSignin) {
    throw new Error(
      "Login failed: still seeing Sign In button. Check admin role + credentials.",
    );
  }

  // --- RUN AXE SCAN ---
  const results = await runA11yScan(page, {
    tags: ["wcag2a", "wcag2aa"],
    disableRules: [],
  });

  const { blocking, backlog } = splitByImpact(results.violations, {
    blockingImpacts: ["critical", "serious", "moderate"],
    backlogImpacts: ["minor"],
  });

  const { summaryPath, prettyPath } = writeA11yArtifacts({
    testName: testInfo.title,
    results,
    writeRaw: false,
  });

  // --- BLOCKERS ---
  if (blocking.length) {
    console.log(`❌ ADMIN/ADD blockers found. See: ${prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ No blockers on ADMIN/ADD.");
  }

  // --- MINOR BACKLOG ---
  if (backlog.length) {
    console.log("ℹ️ ADMIN/ADD minor issues found → writing backlog.");

    const { backlogPath } = appendToMinorBacklog({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    const { mdPath } = appendToMinorBacklogMarkdown({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    console.log("Minor backlog JSON:", backlogPath);
    console.log("Minor backlog Markdown:", mdPath);

    console.table(summarizeViolations(backlog));
  } else {
    console.log(`ℹ️ No minor issues on ADMIN/ADD. Summary: ${summaryPath}`);
  }

  expect(blocking).toEqual([]);
});
