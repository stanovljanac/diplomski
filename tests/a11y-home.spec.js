const { test, expect } = require("@playwright/test");

const {
  runA11yScan,
  splitByImpact,
  summarizeViolations,
  writeA11yArtifacts,
  appendToMinorBacklog,
  appendToMinorBacklogMarkdown,
} = require("./helpers/a11y");

test("HOME a11y (Phase 2: fail on critical+serious+moderate)", async ({
  page,
}, testInfo) => {
  // 1) Otvori HOME stranicu
  await page.goto("/");
  await page.screenshot({
    path: `test-results/a11y/${testInfo.title}.png`,
    fullPage: true,
  });

  // 2) Pokreni axe scan (Phase 2 = uključujemo sve, i contrast)
  const results = await runA11yScan(page, {
    tags: ["wcag2a", "wcag2aa"],
    disableRules: [], // ništa ne ignorišemo
  });

  // 3) Podeli rezultate:
  // blocking = fail
  // backlog = minor (samo zapis)
  const { blocking, backlog } = splitByImpact(results.violations, {
    blockingImpacts: ["critical", "serious", "moderate"],
    backlogImpacts: ["minor"],
  });

  // 4) Sačuvaj artefakte (summary + pretty json)
  const { summaryPath, prettyPath } = writeA11yArtifacts({
    testName: testInfo.title,
    results,
    writeRaw: false,
  });

  // 5) BLOCKING problemi → fail + konzola
  if (blocking.length) {
    console.log(`❌ BLOCKERS found on HOME!`);
    console.log(`Detailed report: ${prettyPath}`);

    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ No blockers on HOME page.");
  }

  // 6) MINOR problemi → backlog export (ne ruši pipeline)
  if (backlog.length) {
    console.log(`ℹ️ Minor issues found (saved to backlog).`);

    // JSON backlog
    const { backlogPath } = appendToMinorBacklog({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    // Markdown backlog (lep za diplomski)
    const { mdPath } = appendToMinorBacklogMarkdown({
      testName: testInfo.title,
      minorViolations: backlog,
    });

    console.log("Minor backlog JSON:", backlogPath);
    console.log("Minor backlog Markdown:", mdPath);

    console.table(summarizeViolations(backlog));
  }

  // 7) Pipeline fail uslov: blocking mora biti prazan
  expect(blocking).toEqual([]);
});
