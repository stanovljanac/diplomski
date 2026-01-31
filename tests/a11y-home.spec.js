const { test, expect } = require("@playwright/test");
const {
  runA11yScan,
  splitByImpact,
  summarizeViolations,
  writeA11yArtifacts,
} = require("./helpers/a11y");

test("HOME a11y (Phase 2: fail on critical+serious+moderate)", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  const results = await runA11yScan(page, {
    tags: ["wcag2a", "wcag2aa"],
    // Phase 2: NE ignorišemo color-contrast
    disableRules: [],
  });

  const { blocking, backlog } = splitByImpact(results.violations, {
    blockingImpacts: ["critical", "serious", "moderate"],
    backlogImpacts: ["minor"],
  });

  // pišemo samo summary + pretty (raw ne)
  const { summaryPath, prettyPath } = writeA11yArtifacts({
    testName: testInfo.title,
    results,
    writeRaw: false,
  });

  // kratko u konzoli
  if (blocking.length) {
    console.log(`❌ BLOCKERS found. See: ${prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ No blockers on HOME.");
  }

  if (backlog.length) {
    console.log(`ℹ️ MINOR (backlog) found. See: ${summaryPath}`);
    console.table(summarizeViolations(backlog));
  }

  expect(blocking).toEqual([]);
});
