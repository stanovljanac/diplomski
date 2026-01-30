const { test, expect } = require("@playwright/test");
const { AxeBuilder } = require("@axe-core/playwright");
const fs = require("fs");
const path = require("path");

function saveReport(name, results) {
  const outPath = path.join(process.cwd(), "a11y-reports", `${name}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), "utf-8");
  console.log("Saved a11y report:", outPath);
}

test("HOME a11y (phase 1: structure rules, ignore color-contrast)", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"]) // phase 1
    .analyze();

  saveReport("home-phase1", results);

  const seriousOrCritical = results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );

  // sažetak u konzoli (čitljivo)
  if (seriousOrCritical.length) {
    console.table(
      seriousOrCritical.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
      })),
    );
  }

  expect(seriousOrCritical).toEqual([]);
});
