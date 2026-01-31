const { test, expect } = require("@playwright/test");
const {
  runA11yScan,
  filterByImpact,
  summarizeViolations,
  writeA11yArtifacts,
  prettyViolations,
} = require("./helpers/a11y");

test("HOME a11y (Phase 2: fail on critical+serious+moderate)", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  const results = await runA11yScan(page);

  const blockers = filterByImpact(results.violations, [
    "critical",
    "serious",
    "moderate",
  ]);
  const minor = filterByImpact(results.violations, ["minor"]);

  // 1) Upisi fajlove na disk
  const { prettyPath } = writeA11yArtifacts({
    testName: testInfo.title,
    results,
  });

  // 2) Prikaži u konzoli kratak rezime (da ne bude 200+ linija)
  console.log("BLOCKERS summary:");
  console.table(summarizeViolations(blockers));

  // 3) Minor u backlog: samo rezime
  if (minor.length) {
    console.log("MINOR (backlog) summary:");
    console.table(summarizeViolations(minor));
  }

  // 4) Ako padne, ispiši gde tačno puca (targets + failureSummary)
  if (blockers.length) {
    console.log(`Detailed blockers written to: ${prettyPath}`);
    // ovo zna da bude duže, ali je super za debug kad ti treba:
    // console.log(JSON.stringify(prettyViolations(blockers), null, 2));
  }

  expect(blockers).toEqual([]);
});
