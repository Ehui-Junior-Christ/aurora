import { expect, test } from "@playwright/test";

test.describe("AURORA smoke", () => {
  test("affiche la page d'accueil et l'onboarding", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/AURORA/);
    await expect(page.getByText("Chaque piste")).toBeVisible();
  });

  test("l'onboarding se lance au premier passage et se ferme", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByText("Bienvenue dans AURORA")).toBeVisible();
    await page.getByRole("button", { name: "Passer" }).click();
    await expect(page.getByText("Bienvenue dans AURORA")).toBeHidden();
  });

  test("le bouton dossier est présent", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Dossier" })).toBeVisible();
  });
});
