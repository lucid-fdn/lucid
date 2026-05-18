function envFlag(name: string, defaultValue = false): boolean {
  const value = process.env[name]
  if (value == null || value.trim() === '') return defaultValue
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase())
}

export const knowledgeFeatureFlags = Object.freeze({
  semanticAssistantRecall: envFlag('LUCID_KNOWLEDGE_SEMANTIC_RECALL_ENABLED'),
  promptPackets: envFlag('LUCID_KNOWLEDGE_PROMPT_PACKETS_ENABLED'),
  durableExtractionJobs: envFlag('LUCID_KNOWLEDGE_DURABLE_EXTRACTION_ENABLED'),
  retrievalEvalCapture: envFlag('LUCID_KNOWLEDGE_RETRIEVAL_CAPTURE_ENABLED'),
  l2Projection: envFlag('LUCID_KNOWLEDGE_L2_PROJECTION_ENABLED'),
})
