import 'server-only'

const DEFAULT_STREAMING_IMAGE_MODELS = new Set(['gpt-image-2'])

function parseModelList(value: string | undefined): Set<string> {
  return new Set(
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

export function supportsImageStreaming(model: string): boolean {
  const normalized = model.trim()
  if (DEFAULT_STREAMING_IMAGE_MODELS.has(normalized)) return true
  return parseModelList(process.env.AI_IMAGE_STREAMING_MODELS).has(normalized)
}
