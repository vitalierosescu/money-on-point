import { expect, test } from "@playwright/test"

const smokeEnabled = process.env.E2E_SMOKE_ENABLED === "1"

test.describe("peppol settings and invoice environment UI", () => {
  test.skip(!smokeEnabled, "Set E2E_SMOKE_ENABLED=1 with a runnable local instance to execute smoke tests.")

  test("business settings shows sender sync controls and invoice form shows active PEPPOL environment", async ({
    page,
  }) => {
    await page.goto("/settings/business")

    await expect(page.getByRole("heading", { name: "PEPPOL Sender Setup" })).toBeVisible()
    await expect(page.getByText(/Active PEPPOL environment/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /Sync Active .* Company/i })).toBeVisible()
    await expect(page.getByText(/Sender profile to mirror in Recommand/i)).toBeVisible()

    await page.goto("/invoices/new")

    await page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Verzendmethode" }) })
      .locator("select")
      .selectOption("peppol")

    await expect(page.locator("body")).toContainText(/PEPPOL environment:/i)
    await expect(page.locator("body")).toContainText(/Active PEPPOL environment:/i)
    await expect(page.locator("body")).toContainText(/Factuur verzenden via PEPPOL/i)
  })
})
