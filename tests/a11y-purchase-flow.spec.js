const { test, expect } = require("@playwright/test");

const {
  createA11yRun,
  scanCheckpoint,
  finalizeA11yRun,
} = require("./helpers/a11y");

test("E2E complete purchase flow", async ({ page }, testInfo) => {
  const EMAIL = process.env.PW_USER_EMAIL;
  const PASS = process.env.PW_ADMIN_PASSWORD;

  // 0) Start run (agregacija kroz ceo test)
  const a11y = createA11yRun({
    testName: testInfo.title,
    // ako želiš da smanjiš output:
    // dedupeMode: "global", // "none" | "perCheckpoint" | "global"
    dedupeMode: "perCheckpoint",
  });

  // Go to sign in page
  await page.goto("/signin", { waitUntil: "domcontentloaded" });

  // Fonts ready (izbegava random kontrast/layout razlike)
  await page.evaluate(async () => {
    if (document.fonts?.ready) await document.fonts.ready;
  });

  if (EMAIL && PASS) {
    await page.getByRole("textbox", { name: "Email" }).fill(EMAIL);
    await page.getByRole("textbox", { name: "Password" }).fill(PASS);
  } else {
    // Ako nema env var, bar nemoj da puca test nego preskoči login ili koristi test user
    console.warn(
      "⚠️ TEST_EMAIL/TEST_PASS nisu setovani. Preskačem popunjavanje kredencijala.",
    );
  }

  // Submit go to homepage

  await page.getByRole("button", { name: /Sign In/i }).click();
  await expect(page.getByText("davorSalt Maalat")).toBeVisible();
  await scanCheckpoint(page, a11y, "homepage_after_login", {
    screenshot: true,
    testInfo,
  });

  // ---------------------------
  // 3) Select product
  // ---------------------------
  await page.locator("#main-content img").nth(2).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);
  await scanCheckpoint(page, a11y, "product_page", {
    screenshot: true,
    testInfo,
  });

  await page
    .locator("div")
    .filter({ hasText: /^--Select Size--$/ })
    .nth(2)
    .click();
  await page.getByText("50 mm", { exact: true }).click();

  await page
    .locator("div")
    .filter({ hasText: /^Choose Color$/ })
    .locator("div")
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Add To Basket" }).click();
  await page.waitForTimeout(500);
  await scanCheckpoint(page, a11y, "after_add_to_basket", {
    screenshot: true,
    testInfo,
  });

  // ---------------------------
  // 4) Basket modal / cart
  // ---------------------------
  await page.getByRole("button", { name: "shopping" }).click();
  await page.waitForTimeout(500);
  await scanCheckpoint(page, a11y, "basket_modal", {
    screenshot: true,
    testInfo,
  });

  // ---------------------------
  // 5) Checkout steps (shipping -> payment)
  // ---------------------------
  await page.getByRole("button", { name: "Check Out" }).click();

  await page.waitForTimeout(500);
  await scanCheckpoint(page, a11y, "checkout_summary", {
    screenshot: true,
    testInfo,
  });

  await page.getByRole("button", { name: /Next Step/i }).click();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(500);
  await scanCheckpoint(page, a11y, "checkout_shipping_blank", {
    screenshot: true,
    testInfo,
  });

  // Popuni shipping (primer)
  await page.getByRole("textbox", { name: "* Full Name" }).fill("Pera Peric");
  await page
    .getByRole("textbox", { name: "* Shipping Address" })
    .fill("Pere Perica 5");

  await page.getByRole("button", { name: "Philippines: +" }).click();
  await page.getByRole("option", { name: "Serbia+" }).click();

  await page
    .getByRole("textbox", { name: "09254461351" })
    .fill("+381 652 234 222");

  await scanCheckpoint(page, a11y, "checkout_shipping_filled", {
    screenshot: true,
    testInfo,
  });

  await page.getByRole("button", { name: /Next Step/i }).click();
  const confirmBtn = page.getByRole("button", { name: /Confirm/i });
  await page.waitForTimeout(500);
  await scanCheckpoint(page, a11y, "checkout_paymentLoad", {
    screenshot: true,
    testInfo,
  });

  // Payment (primer)
  await page
    .locator("label")
    .filter({ hasText: /Credit Card/i })
    .click();
  await page
    .getByRole("textbox", { name: "* Name on Card" })
    .fill("Pera Peric");
  await page
    .getByRole("textbox", { name: "* Card Number" })
    .fill("1234567812345678");
  await page.getByRole("textbox", { name: "* CCV" }).fill("123");
  await page.getByRole("textbox", { name: "* Expiry Date" }).fill("2026-02-19");
  await scanCheckpoint(page, a11y, "before_confirm", {
    screenshot: true,
    testInfo,
  });

  // Confirm (ako postoji)

  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
    await expect(page.getByText("Feature not ready yet :)")).toBeVisible();
    await scanCheckpoint(page, a11y, "after_confirm", {
      screenshot: true,
      testInfo,
    });
  }

  const { blockingAll } = finalizeA11yRun(a11y, { writeBacklog: true });

  // Gate condition (global)
  expect(blockingAll).toEqual([]);
});
