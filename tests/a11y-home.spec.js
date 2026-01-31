const { test, expect } = require("@playwright/test");
const { AxeBuilder } = require("@axe-core/playwright");

test("HOME a11y smoke (run scan and print)", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"]) // po želji, za phase 1
    .analyze();

  console.table(
    results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
    })),
  );

  expect(results.violations).toBeDefined();
});
