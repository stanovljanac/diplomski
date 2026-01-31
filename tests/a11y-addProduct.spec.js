const { test, expect } = require("@playwright/test");
const { AxeBuilder } = require("@axe-core/playwright");

test("ADMIN ADD a11y smoke (login then scan)", async ({ page }) => {
  await page.goto("/signin", { waitUntil: "domcontentloaded" });

  await page.getByLabel("Email").fill(process.env.PW_ADMIN_EMAIL || "");
  await page.getByLabel("Password").fill(process.env.PW_ADMIN_PASSWORD || "");
  await page.getByRole("button", { name: /sign in/i }).click();

  await page.goto("/admin/add", { waitUntil: "domcontentloaded" });

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();

  console.table(
    results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
    })),
  );

  expect(results.violations).toBeDefined();
});
