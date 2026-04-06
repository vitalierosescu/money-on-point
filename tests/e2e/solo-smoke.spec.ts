import { expect, test } from "@playwright/test"

const smokeEnabled = process.env.E2E_SMOKE_ENABLED === "1"

test.describe("solo freelancer smoke flow", () => {
  test.skip(!smokeEnabled, "Set E2E_SMOKE_ENABLED=1 with a runnable local instance to execute smoke tests.")

  test("core routes render for daily bookkeeping", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/dashboard|enter|self-hosted/)

    await page.goto("/invoices")
    await expect(page.locator("body")).toContainText(/Invoices|Facturen|Cloud Edition|Self-Hosted Edition/)

    await page.goto("/expenses")
    const expensesBody = page.locator("body")
    await expect(expensesBody).toContainText(/Expenses|Uitgaven|Cloud Edition|Self-Hosted Edition/)
    await expect(expensesBody).toContainText(
      /Open|Openstaand|Overdue|Achterstallig|Paid|Betaald|No expenses yet\.|Nog geen uitgaven\./
    )

    await page.goto("/files")
    await expect(page.locator("body")).toContainText(/Files|documents|Cloud Edition|Self-Hosted Edition/)

    await page.goto("/reports")
    await expect(page.locator("body")).toContainText(/Reports|Cloud Edition|Self-Hosted Edition/)
  })
})
