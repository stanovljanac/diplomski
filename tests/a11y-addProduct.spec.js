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
  await page.goto("/signin", { waitUntil: "domcontentloaded" });

  // 1) fill creds (mora da postoje)
  const email = process.env.PW_ADMIN_EMAIL;
  const pass = process.env.PW_ADMIN_PASSWORD;

  if (!email || !pass) {
    throw new Error(
      "Missing PW_ADMIN_EMAIL / PW_ADMIN_PASSWORD. Load .env (dotenv) or set env vars.",
    );
  }

  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(pass);
  await page.getByRole("button", { name: /sign in/i }).click();

  // 2) Umesto waitForURL (koji ti ne radi), idi kao pre na admin/add:
  await page.goto("/admin/add", { waitUntil: "domcontentloaded" });

  // 3) Hard check: ako i dalje vidiš Sign In formu, login nije uspeo
  // (prilagodi selector ako treba)
  const stillOnSignin = await page
    .getByRole("button", { name: /sign in/i })
    .isVisible()
    .catch(() => false);
  if (stillOnSignin) {
    throw new Error(
      "Login failed: still seeing Sign In button after navigation to /admin/add. Check credentials/admin role.",
    );
  }

  const results = await runA11yScan(page);

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
