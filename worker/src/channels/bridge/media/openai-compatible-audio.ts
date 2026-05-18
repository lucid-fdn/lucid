export function buildOpenAiCompatibleAudioUrl(baseUrl: string, capabilityPath: 'audio/transcriptions' | 'audio/speech'): string {
  return baseUrl.endsWith('/v1')
    ? `${baseUrl}/${capabilityPath}`
    : `${baseUrl}/v1/${capabilityPath}`
}

export async function postOpenAiCompatibleAudioForm(params: {
  baseUrl: string
  apiKey: string
  capabilityPath: 'audio/transcriptions'
  form: FormData
}): Promise<Response> {
  return fetch(buildOpenAiCompatibleAudioUrl(params.baseUrl, params.capabilityPath), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: params.form,
  })
}

export async function postOpenAiCompatibleAudioJson(params: {
  baseUrl: string
  apiKey: string
  capabilityPath: 'audio/speech'
  body: Record<string, unknown>
}): Promise<Response> {
  return fetch(buildOpenAiCompatibleAudioUrl(params.baseUrl, params.capabilityPath), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params.body),
  })
}
