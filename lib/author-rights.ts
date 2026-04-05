export type InvoiceMode = "standard" | "author_rights"
export type AuthorRightsSplitPreset = "manual" | "creative_70_30"

export type AuthorRightsData = {
  regimeCountry: "BE"
  sourceRuleYear: number
  splitMode: AuthorRightsSplitPreset
  contractReference: string
  agreementDate: string | null
  specialConditions: string
  eligibilityAcknowledged: boolean
  professionalSharePct: number
  authorRightsSharePct: number
  serviceVatRate: number
  rightsVatRate: number
  withholdingRate: number
  professionalGrossCents: number
  authorRightsGrossCents: number
  serviceVatAmountCents: number
  rightsVatAmountCents: number
  totalVatAmountCents: number
  withholdingAmountCents: number
  rightsNetAmountCents: number
  netPayableCents: number
}

export type BelgianAuthorRightsRule = {
  incomeYear: number
  maxAuthorRightsCompensationCents: number
  firstCostBracketCents: number
  secondCostBracketCents: number
  firstCostRatePct: number
  secondCostRatePct: number
}

const BELGIAN_AUTHOR_RIGHTS_RULES: Record<number, BelgianAuthorRightsRule> = {
  2025: {
    incomeYear: 2025,
    maxAuthorRightsCompensationCents: 7_536_000,
    firstCostBracketCents: 2_010_000,
    secondCostBracketCents: 4_019_000,
    firstCostRatePct: 50,
    secondCostRatePct: 25,
  },
}

function clampPercentage(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

function roundCents(value: number): number {
  return Math.round(value)
}

export function getBelgianAuthorRightsRule(incomeYear: number): BelgianAuthorRightsRule | null {
  return BELGIAN_AUTHOR_RIGHTS_RULES[incomeYear] ?? null
}

export function getSupportedBelgianAuthorRightsYears(): number[] {
  return Object.keys(BELGIAN_AUTHOR_RIGHTS_RULES)
    .map(Number)
    .sort((a, b) => a - b)
}

export function calculateBelgianAuthorRightsAmounts(input: {
  subtotalCents: number
  professionalSharePct: number
  authorRightsSharePct: number
  serviceVatRate: number
  rightsVatRate: number
  withholdingRate: number
}): Pick<
  AuthorRightsData,
  | "professionalSharePct"
  | "authorRightsSharePct"
  | "professionalGrossCents"
  | "authorRightsGrossCents"
  | "serviceVatAmountCents"
  | "rightsVatAmountCents"
  | "totalVatAmountCents"
  | "withholdingAmountCents"
  | "rightsNetAmountCents"
  | "netPayableCents"
  | "serviceVatRate"
  | "rightsVatRate"
  | "withholdingRate"
> {
  const subtotalCents = Math.max(0, roundCents(input.subtotalCents))
  const requestedRightsShare = clampPercentage(input.authorRightsSharePct)
  const requestedProfessionalShare = clampPercentage(input.professionalSharePct)

  const authorRightsSharePct =
    requestedRightsShare > 0 || requestedProfessionalShare === 0
      ? requestedRightsShare
      : clampPercentage(100 - requestedProfessionalShare)
  const professionalSharePct = clampPercentage(100 - authorRightsSharePct)

  const professionalGrossCents = roundCents((subtotalCents * professionalSharePct) / 100)
  const authorRightsGrossCents = subtotalCents - professionalGrossCents
  const serviceVatRate = clampPercentage(input.serviceVatRate)
  const rightsVatRate = clampPercentage(input.rightsVatRate)
  const withholdingRate = clampPercentage(input.withholdingRate)
  const serviceVatAmountCents = roundCents((professionalGrossCents * serviceVatRate) / 100)
  const rightsVatAmountCents = roundCents((authorRightsGrossCents * rightsVatRate) / 100)
  const totalVatAmountCents = serviceVatAmountCents + rightsVatAmountCents
  const withholdingAmountCents = roundCents((authorRightsGrossCents * withholdingRate) / 100)
  const rightsNetAmountCents = authorRightsGrossCents - withholdingAmountCents
  const netPayableCents = subtotalCents + totalVatAmountCents - withholdingAmountCents

  return {
    professionalSharePct,
    authorRightsSharePct,
    professionalGrossCents,
    authorRightsGrossCents,
    serviceVatRate,
    rightsVatRate,
    withholdingRate,
    serviceVatAmountCents,
    rightsVatAmountCents,
    totalVatAmountCents,
    withholdingAmountCents,
    rightsNetAmountCents,
    netPayableCents,
  }
}

export function isAuthorRightsMode(mode: string | null | undefined): mode is "author_rights" {
  return mode === "author_rights"
}
