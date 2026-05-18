export const MAX_PROJECT_LEARNING_CONTEXT_CHARS = 6_000

export interface ProjectLearningPromptContextItem {
  type: string
  trustLevel: string
  title: string
  body: string
  confidence: number
}

export function formatProjectLearningForPrompt(input: ProjectLearningPromptContextItem): string {
  const safeTitle = stripProjectLearningBoundaryText(input.title)
  const safeBody = stripProjectLearningBoundaryText(input.body)
  const confidence = Math.round(input.confidence * 100)
  return `[project_learning:${input.type}/${input.trustLevel}/${confidence}%] ${safeTitle}: ${safeBody}`
}

export function buildProjectLearningPromptContext(
  learnings: ProjectLearningPromptContextItem[],
  maxChars = MAX_PROJECT_LEARNING_CONTEXT_CHARS,
): string[] {
  const result: string[] = []
  let totalChars = 0

  for (const learning of learnings) {
    const formatted = formatProjectLearningForPrompt(learning)
    if (!formatted || totalChars + formatted.length > maxChars) break
    result.push(formatted)
    totalChars += formatted.length
  }

  return result
}

function stripProjectLearningBoundaryText(value: string): string {
  return value
    .replace(/<\/org_knowledge>/gi, '')
    .replace(/<\/untrusted_content>/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}
