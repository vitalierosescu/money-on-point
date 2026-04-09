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

    // The Verzendmethode selector was a <select> dropdown until 2026-04-09;
    // it's now two side-by-side toggle buttons ("PEPPOL" and "Email + PDF")
    // that flex-wrap on narrow cards. Click the PEPPOL option to activate it.
    await page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Verzendmethode" }) })
      .getByRole("button", { name: "PEPPOL", exact: true })
      .click()

    // The environment chip no longer repeats the "PEPPOL environment:"
    // prefix (redundant next to the Verzendmethode heading). It shows
    // just the label: "Playground" or "Production".
    await expect(page.locator("body")).toContainText(/Playground|Production/i)
    // The save section footer still surfaces the active environment
    // in a sentence below the send button for the manual-creation flow.
    await expect(page.locator("body")).toContainText(/Active PEPPOL environment:/i)
    await expect(page.locator("body")).toContainText(/Factuur verzenden via PEPPOL/i)
  })
})
