import { expect, test } from "@playwright/test"

const smokeEnabled = process.env.E2E_SMOKE_ENABLED === "1"

test.describe("intake and locale smoke flow", () => {
  test.skip(!smokeEnabled, "Set E2E_SMOKE_ENABLED=1 with a runnable local instance to execute smoke tests.")

  test("unsorted and settings surfaces render the intake review and locale controls", async ({ page }) => {
    await page.goto("/unsorted")
    const unsortedBody = page.locator("body")
    await expect(unsortedBody).toContainText(
      /Analyze with AI|Met AI analyseren|Everything is clear\.|Alles is verwerkt\.|Document saved|Document opgeslagen|Cloud Edition|Self-Hosted Edition/
    )
    await expect(unsortedBody).toContainText(
      /Review summary|Controleoverzicht|Amount|Bedrag|Issue date|Factuurdatum|Type/
    )

    await page.goto("/settings")
    const settingsBody = page.locator("body")
    await expect(settingsBody).toContainText(/Interface Language|Interfacetaal|Cloud Edition|Self-Hosted Edition/)
    await expect(settingsBody).toContainText(/English|Engels/)
    await expect(settingsBody).toContainText(/Dutch|Nederlands/)
    await expect(settingsBody).toContainText(/Default Currency|Standaardvaluta/)
  })
})
