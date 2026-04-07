import { UI_LOCALES } from "@/lib/locale"
import { normalizeFieldOptionsInput } from "@/lib/fields"
import { randomHexColor } from "@/lib/utils"
import { RECOMMAND_ENVIRONMENTS } from "@/lib/recommand-settings"
import { z } from "zod"

export const settingsFormSchema = z.object({
  ui_locale: z.enum(UI_LOCALES).optional(),
  default_currency: z.string().max(5).optional(),
  default_type: z.string().optional(),
  default_category: z.string().optional(),
  default_project: z.string().optional(),
  openai_api_key: z.string().optional(),
  openai_model_name: z.string().default('gpt-4o-mini'),
  google_api_key: z.string().optional(),
  google_model_name: z.string().default("gemini-2.5-flash"),
  mistral_api_key: z.string().optional(),
  mistral_model_name: z.string().default("mistral-medium-latest"),
  openai_compatible_api_key: z.string().optional(),
  openai_compatible_model_name: z.string().optional(),
  openai_compatible_base_url: z.string().optional(),
  llm_providers: z.string().default('openai,google,mistral,openai_compatible'),
  prompt_analyse_new_file: z.string().optional(),
  is_welcome_message_hidden: z.string().optional(),
  invoice_starting_number: z.string().optional(),
  invoice_default_payment_terms: z.string().optional(),
  business_enterprise_number: z.string().optional(),
  business_vat_number: z.string().optional(),
  business_country_code: z.string().max(2).optional(),
  business_postal_code: z.string().optional(),
  business_city: z.string().optional(),
  business_street_line1: z.string().optional(),
  business_street_line2: z.string().optional(),
  business_iban: z.string().optional(),
  recommand_environment: z.enum(RECOMMAND_ENVIRONMENTS).optional(),
  recommand_team_id: z.string().optional(),
  recommand_company_id: z.string().optional(),
  recommand_api_key: z.string().optional(),
  recommand_api_secret: z.string().optional(),
  recommand_playground_team_id: z.string().optional(),
  recommand_playground_company_id: z.string().optional(),
  recommand_playground_api_key: z.string().optional(),
  recommand_playground_api_secret: z.string().optional(),
  recommand_production_team_id: z.string().optional(),
  recommand_production_company_id: z.string().optional(),
  recommand_production_api_key: z.string().optional(),
  recommand_production_api_secret: z.string().optional(),
  archie_enabled: z.string().optional(),
  archie_client_id: z.string().optional(),
  archie_client_secret: z.string().optional(),
  archie_webhook_secret: z.string().optional(),
  archie_webhook_target_url: z.string().optional(),
  archie_space_domain: z.string().optional(),
  archie_group_uuids: z.string().optional(),
})

export const currencyFormSchema = z.object({
  code: z.string().max(5),
  name: z.string().max(32),
})

export const projectFormSchema = z.object({
  name: z.string().max(128),
  llm_prompt: z.string().max(512).nullable().optional(),
  color: z.string().max(7).default(randomHexColor()).nullable().optional(),
})

export const categoryFormSchema = z.object({
  name: z.string().max(128),
  llm_prompt: z.string().max(512).nullable().optional(),
  color: z.string().max(7).default(randomHexColor()).nullable().optional(),
})

export const fieldFormSchema = z
  .object({
    name: z.string().max(128),
    type: z.enum(["string", "number", "boolean", "single_select"]).default("string"),
    llm_prompt: z.string().max(512).nullable().optional(),
    options: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    isVisibleInList: z.boolean().optional(),
    isVisibleInAnalysis: z.boolean().optional(),
    isRequired: z.boolean().optional(),
  })
  .transform((data) => ({
    ...data,
    options: normalizeFieldOptionsInput(data.type, data.options),
  }))
  .refine((data) => data.type !== "single_select" || (data.options && data.options.length > 0), {
    message: "Single-select fields need at least one option.",
    path: ["options"],
  })
