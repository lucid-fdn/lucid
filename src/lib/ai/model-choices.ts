import { fetchModels } from './models'

export type ModelChoice = {
  id: string
  name: string
  provider: string
}

export async function loadModelChoices(): Promise<ModelChoice[]> {
  const models = await fetchModels()
  return models.map((model) => ({
    id: model.modelId || model.id,
    name: model.name,
    provider: model.provider,
  }))
}

export function summarizeModelChoices(
  models: ReadonlyArray<ModelChoice>,
  options?: { limit?: number },
): string {
  const limit = options?.limit ?? 8
  return models
    .slice(0, limit)
    .map((model) => `- ${model.provider}: ${model.name} \`${model.id}\``)
    .join('\n')
}

export function findMatchingModels(
  models: ReadonlyArray<ModelChoice>,
  rawQuery: string,
): ModelChoice[] {
  const query = rawQuery.trim().toLowerCase()
  if (!query) return []

  const exact = models.find((model) => {
    const id = model.id.toLowerCase()
    const name = model.name.toLowerCase()
    return id === query || name === query
  })
  if (exact) return [exact]

  return models.filter((model) => {
    const id = model.id.toLowerCase()
    const name = model.name.toLowerCase()
    const provider = model.provider.toLowerCase()
    return id.includes(query) || name.includes(query) || provider.includes(query)
  })
}
