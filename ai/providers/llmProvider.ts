import { ChatOpenAI } from "@langchain/openai"
import { ChatGoogleGenerativeAI } from "@langchain/google-genai"
import { ChatMistralAI } from "@langchain/mistralai"
import { BaseMessage, HumanMessage } from "@langchain/core/messages"

export type LLMProvider = "openai" | "google" | "mistral" | "openai_compatible"

export interface LLMConfig {
  provider: LLMProvider
  apiKey: string
  model: string
  baseUrl?: string
}

export interface LLMSettings {
  providers: LLMConfig[]
}

export interface LLMRequest {
  prompt: string
  schema?: Record<string, unknown>
  attachments?: any[]
}

export interface LLMResponse {
  output: Record<string, string>
  tokensUsed?: number
  provider: LLMProvider
  error?: string
}

async function requestLLMUnified(config: LLMConfig, req: LLMRequest): Promise<LLMResponse> {
  try {
    const temperature = 0
    let model: any
    if (config.provider === "openai") {
      model = new ChatOpenAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature: temperature,
      })
    } else if (config.provider === "google") {
      model = new ChatGoogleGenerativeAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature: temperature,
      })
    } else if (config.provider === "mistral") {
      model = new ChatMistralAI({
        apiKey: config.apiKey,
        model: config.model,
        temperature: temperature,
      })
    } else if (config.provider === "openai_compatible") {
      model = new ChatOpenAI({
        apiKey: config.apiKey || "not-needed",
        model: config.model,
        temperature: temperature,
        configuration: {
          baseURL: config.baseUrl?.trim(),
        },
      })
    } else {
      return {
        output: {},
        provider: config.provider,
        error: "Unknown provider",
      }
    }

    let message_content: any = [{ type: "text", text: req.prompt }]
    if (req.attachments && req.attachments.length > 0) {
      const images = req.attachments.map((att) => ({
        type: "image_url",
        image_url: {
          url: `data:${att.contentType};base64,${att.base64}`,
        },
      }))
      message_content.push(...images)
    }
    const messages: BaseMessage[] = [new HumanMessage({ content: message_content })]

    let response: any
    if (config.provider === "openai_compatible") {
      const raw = await model.invoke(messages)
      const text = typeof raw.content === "string" ? raw.content : raw.content.map((c: any) => c.text || "").join("")
      response = JSON.parse(text.replace(/```(?:json)?\s*/g, "").trim())
    } else {
      const structuredModel = model.withStructuredOutput(req.schema, { name: "transaction" })
      response = await structuredModel.invoke(messages)
    }

    return {
      output: response,
      provider: config.provider,
    }
  } catch (error: any) {
    return {
      output: {},
      provider: config.provider,
      error: error instanceof Error ? error.message : `${config.provider} request failed`,
    }
  }
}

export async function requestLLM(settings: LLMSettings, req: LLMRequest): Promise<LLMResponse> {
  const skipped: string[] = []
  const failed: Array<{ provider: LLMProvider; error: string }> = []

  for (const config of settings.providers) {
    if (!config.model) {
      console.info("Skipping provider:", config.provider, "(no model)")
      skipped.push(`${config.provider} (no model)`)
      continue
    }
    if (config.provider === "openai_compatible" ? !config.baseUrl : !config.apiKey) {
      console.info("Skipping provider:", config.provider, "(not configured)")
      skipped.push(`${config.provider} (not configured)`)
      continue
    }
    console.info("Use provider:", config.provider)

    const response = await requestLLMUnified(config, req)

    if (!response.error) {
      return response
    }

    console.error(`${config.provider} error:`, response.error)
    failed.push({ provider: config.provider, error: response.error })
  }

  // Build a useful error message. When at least one provider was actually
  // tried, surface the real underlying errors so users can diagnose. When
  // nothing was tried at all, say so explicitly and point to Settings.
  let error: string
  if (failed.length > 0) {
    const failureDetail = failed.map(({ provider, error }) => `${provider}: ${error}`).join(" | ")
    const skippedDetail = skipped.length > 0 ? ` Skipped: ${skipped.join(", ")}.` : ""
    error = `LLM request failed. ${failureDetail}.${skippedDetail}`
  } else if (skipped.length > 0) {
    error = `No LLM provider is usable. ${skipped.join(", ")}. Configure a provider in Settings → LLM.`
  } else {
    error = "No LLM providers defined. Configure at least one in Settings → LLM."
  }

  return {
    output: {},
    provider: settings.providers[0]?.provider || "openai",
    error,
  }
}
