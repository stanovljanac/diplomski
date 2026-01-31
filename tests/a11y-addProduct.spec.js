const { test, expect } = require("@playwright/test");
const {
  runA11yScan,
  splitByImpact,
  summarizeViolations,
  writeA11yArtifacts,
} = require("./helpers/a11y");

test("ADMIN ADD a11y (Phase 2: login then fail on critical+serious+moderate)", async ({
  page,
}, testInfo) => {
  // 1) Login
  await page.goto("/signin", { waitUntil: "domcontentloaded" });

  await page.getByLabel("Email").fill(process.env.PW_ADMIN_EMAIL || "");
  await page.getByLabel("Password").fill(process.env.PW_ADMIN_PASSWORD || "");
  await page.getByRole("button", { name: /sign in/i }).click();

  // 2) Čekaj da login stvarno prođe (bar da URL nije više /signin)
  // Ako tvoja app prebacuje na / ili /admin, ovo je dovoljno stabilno:
  await page.waitForURL((url) => !url.pathname.includes("/signin"), {
    timeout: 15000,
  });

  // 3) Admin add strana
  await page.goto("/admin/add", { waitUntil: "domcontentloaded" });

  // (opciono) ako tu ima nekih async stvari, ovo pomaže da axe vidi final DOM
  await page.waitForTimeout(300);

  // 4) Axe scan
  const results = await runA11yScan(page, {
    tags: ["wcag2a", "wcag2aa"],
    disableRules: [], // Phase 2: ništa ne gasimo
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
    console.log(`❌ ADMIN/ADD blockers found. See: ${prettyPath}`);
    console.table(summarizeViolations(blocking));
  } else {
    console.log("✅ No blockers on ADMIN/ADD.");
  }

  if (backlog.length) {
    console.log(`ℹ️ ADMIN/ADD minor (backlog). See: ${summaryPath}`);
    console.table(summarizeViolations(backlog));
  }

  expect(blocking).toEqual([]);
});
