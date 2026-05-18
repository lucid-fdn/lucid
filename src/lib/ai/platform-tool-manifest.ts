export const PLATFORM_TOOL_NAMES = [
  'searchMarketplace',
  'getPopularModels',
  'suggestWorkflow',
  'getCurrentTime',
] as const

export type PlatformToolName = typeof PLATFORM_TOOL_NAMES[number]
