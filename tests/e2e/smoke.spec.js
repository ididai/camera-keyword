import { expect, test } from "@playwright/test";

test("home loads on mobile viewport without horizontal overflow", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByText("CAMERA", { exact: false })).toBeVisible();
  await expect(page.getByText("KEYWORD", { exact: false })).toBeVisible();

  const hasOverflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > window.innerWidth + 1;
  });

  expect(hasOverflow).toBe(false);
});
