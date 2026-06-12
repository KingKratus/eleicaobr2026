import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Provider OpenAI-compatible para NVIDIA Build (build.nvidia.com). */
export function createNvidiaProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "nvidia",
    baseURL: "https://integrate.api.nvidia.com/v1",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
}
