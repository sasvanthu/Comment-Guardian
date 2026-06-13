import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Server-only AI Gateway provider.
 * Reads AI_API_KEY from env inside a server function handler.
 */
export function createAiGatewayProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "ai-gateway",
    baseURL: process.env.AI_BASE_URL || "https://api.openai.com/v1",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
}
