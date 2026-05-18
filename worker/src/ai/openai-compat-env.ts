export interface OpenAICompatEnvConfig {
  baseUrl: string
  apiKey: string
}

let openAICompatEnvApplied = false

export function applyOpenAICompatEnv(config: OpenAICompatEnvConfig): void {
  if (openAICompatEnvApplied) return

  process.env.OPENAI_API_KEY = config.apiKey
  process.env.OPENAI_API_BASE = config.baseUrl
  openAICompatEnvApplied = true
}
