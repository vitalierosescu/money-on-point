"use server"

import { ActionState } from "@/lib/actions"
import { updateFile } from "@/models/files"
import { getLLMSettings, getSettings } from "@/models/settings"
import { AnalyzeAttachment } from "./attachments"
import { requestLLM } from "./providers/llmProvider"

export type AnalysisResult = {
  output: Record<string, string>
  tokensUsed: number
}

export async function analyzeTransaction(
  prompt: string,
  schema: Record<string, unknown>,
  attachments: AnalyzeAttachment[],
  fileId: string,
  userId: string
): Promise<ActionState<AnalysisResult>> {
  const settings = await getSettings(userId)
  const llmSettings = getLLMSettings(settings)

  try {
    const response = await requestLLM(llmSettings, {
      prompt,
      schema,
      attachments,
    })

    if (response.error) {
      throw new Error(response.error)
    }

    const result = response.output
    const tokensUsed = response.tokensUsed || 0

    console.log("LLM response:", result)
    console.log("LLM tokens used:", tokensUsed)

    // Defensive: langchain's structured output can return undefined / null / {}
    // when the model fails to produce a valid JSON match. Without this check,
    // updateFile would be called with `cachedParseResult: undefined`, which
    // Prisma silently treats as a no-op — the file ends up with NULL cache
    // even though analyzeTransaction reported success.
    const isUsable =
      result !== null &&
      result !== undefined &&
      typeof result === "object" &&
      Object.keys(result).length > 0
    if (!isUsable) {
      return {
        success: false,
        error: "AI returned no usable fields. The document may be unreadable or unsupported.",
      }
    }

    await updateFile(fileId, userId, { cachedParseResult: result })

    return {
      success: true,
      data: {
        output: result,
        tokensUsed: tokensUsed,
      },
    }
  } catch (error) {
    console.error("AI Analysis error:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to analyze invoice",
    }
  }
}
