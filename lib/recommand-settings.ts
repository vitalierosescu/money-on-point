import type { SettingsMap } from "@/models/settings"

export const RECOMMAND_ENVIRONMENTS = ["playground", "production"] as const

export type RecommandEnvironment = (typeof RECOMMAND_ENVIRONMENTS)[number]

type RecommandProfileField = "team_id" | "company_id" | "api_key" | "api_secret"

export type ResolvedRecommandCredentials = {
  environment: RecommandEnvironment
  teamId?: string
  companyId: string
  apiKey: string
  apiSecret: string
  usesLegacyKeys: boolean
}

export function normalizeRecommandEnvironment(value?: string | null): RecommandEnvironment {
  return value === "production" ? "production" : "playground"
}

export function getRecommandEnvironmentLabel(environment: RecommandEnvironment): string {
  return environment === "production" ? "Production" : "Playground"
}

function getProfileKey(environment: RecommandEnvironment, field: RecommandProfileField) {
  return `recommand_${environment}_${field}`
}

function getProfileValues(settings: SettingsMap, environment: RecommandEnvironment) {
  return {
    teamId: settings[getProfileKey(environment, "team_id")]?.trim() ?? "",
    companyId: settings[getProfileKey(environment, "company_id")]?.trim() ?? "",
    apiKey: settings[getProfileKey(environment, "api_key")]?.trim() ?? "",
    apiSecret: settings[getProfileKey(environment, "api_secret")]?.trim() ?? "",
  }
}

function hasCompleteProfile(settings: SettingsMap, environment: RecommandEnvironment) {
  const profile = getProfileValues(settings, environment)
  return Boolean(profile.companyId && profile.apiKey && profile.apiSecret)
}

export function hasLegacyRecommandCredentials(settings: SettingsMap) {
  return Boolean(
    settings.recommand_company_id?.trim() &&
      settings.recommand_api_key?.trim() &&
      settings.recommand_api_secret?.trim()
  )
}

export function getActiveRecommandEnvironment(settings: SettingsMap): RecommandEnvironment {
  return normalizeRecommandEnvironment(settings.recommand_environment)
}

export function hasConfiguredRecommandCredentials(
  settings: SettingsMap,
  environment: RecommandEnvironment = getActiveRecommandEnvironment(settings)
) {
  return hasCompleteProfile(settings, environment) || hasLegacyRecommandCredentials(settings)
}

export function getResolvedRecommandCredentials(
  settings: SettingsMap,
  environment: RecommandEnvironment = getActiveRecommandEnvironment(settings)
): ResolvedRecommandCredentials {
  const profile = getProfileValues(settings, environment)

  if (profile.companyId && profile.apiKey && profile.apiSecret) {
    return {
      environment,
      teamId: profile.teamId || undefined,
      companyId: profile.companyId,
      apiKey: profile.apiKey,
      apiSecret: profile.apiSecret,
      usesLegacyKeys: false,
    }
  }

  const legacyCompanyId = settings.recommand_company_id?.trim()
  const legacyApiKey = settings.recommand_api_key?.trim()
  const legacyApiSecret = settings.recommand_api_secret?.trim()

  if (legacyCompanyId && legacyApiKey && legacyApiSecret) {
    return {
      environment,
      teamId: settings.recommand_team_id?.trim() || undefined,
      companyId: legacyCompanyId,
      apiKey: legacyApiKey,
      apiSecret: legacyApiSecret,
      usesLegacyKeys: true,
    }
  }

  throw new Error(
    `Recommand credentials are incomplete for the active ${getRecommandEnvironmentLabel(environment)} environment.`
  )
}
