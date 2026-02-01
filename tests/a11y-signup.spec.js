const { test, expect } = require("@playwright/test");
const {
  runA11yScan,
  splitByImpact,
  summarizeViolations,
  writeA11yArtifacts,
} = require("./helpers/a11y");

test("SIGNUP a11y (Phase 2: fail on critical+serious+moderate)", async ({
  page,
}, testInfo) => {
  await page.goto("/signup", { waitUntil: "domcontentloaded" });

  const results = await runA11yScan(page, {
    tags: ["wcag2a", "wcag2aa"],
    disableRules: [], // Phase 2: ništa ne gasimo (ni color-contrast)
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

  if (blocking.length) {
    console.log(`❌ SIGNUP blockers found. See: ${prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ No blockers on SIGNUP.");
  }

  if (backlog.length) {
    console.log(`ℹ️ SIGNUP minor (backlog). See: ${summaryPath}`);
    console.table(summarizeViolations(backlog));
  }

  expect(blocking).toEqual([]);
});
