import 'server-only'

import { runImageGeneration } from '@/lib/ai/images/provider'
import type { ImageGenerationRequest, ImageGenerationResult } from '@/lib/ai/images/types'

export async function imageGenerationAdapter(
  input: ImageGenerationRequest & { model?: string },
): Promise<ImageGenerationResult> {
  return runImageGeneration(input)
}
