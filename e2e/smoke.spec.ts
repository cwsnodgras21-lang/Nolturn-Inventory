import { test, expect } from "@playwright/test";

test("home page renders product brand", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Nolt Inventory" })).toBeVisible();
  await expect(page.getByText("Phase 3.3 — Lot and expiration tracking")).toBeVisible();
});

test("inventory counts route requires authentication", async ({ page }) => {
  await page.goto("/inventory/counts");
  await expect(page).toHaveURL(/\/login/);
});

test("inventory lots route requires authentication", async ({ page }) => {
  await page.goto("/inventory/lots");
  await expect(page).toHaveURL(/\/login/);
});

test("purchasing orders route requires authentication", async ({ page }) => {
  await page.goto("/purchasing/orders");
  await expect(page).toHaveURL(/\/login/);
});

test("login page accepts credentials form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeEnabled();
});

test("protected dashboard redirects anonymous users to login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("health endpoint responds", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.ok).toBe(true);
  expect(body.service).toBe("Nolt Inventory");
});

test("catalog units route requires authentication", async ({ page }) => {
  await page.goto("/administration/catalog/units");
  await expect(page).toHaveURL(/\/login/);
});

test("catalog categories route requires authentication", async ({ page }) => {
  await page.goto("/administration/catalog/categories");
  await expect(page).toHaveURL(/\/login/);
});

test("catalog items route requires authentication", async ({ page }) => {
  await page.goto("/administration/catalog/items");
  await expect(page).toHaveURL(/\/login/);
});

test("storage route requires authentication", async ({ page }) => {
  await page.goto("/administration/storage");
  await expect(page).toHaveURL(/\/login/);
});

test("inventory route requires authentication", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/login/);
});
