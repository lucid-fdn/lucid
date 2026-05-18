import type { HermesToolAdapter, HermesToolMount } from './types.js'
import { buildAgentToolAwarenessPrompt } from '../../contracts/tool-runtime.js'

class DefaultHermesToolAdapter implements HermesToolAdapter {
  mount(input: Parameters<typeof buildAgentToolAwarenessPrompt>[0]): HermesToolMount {
    const toolPrompt = buildAgentToolAwarenessPrompt(input) || undefined
    return { toolPrompt }
  }
}

export const defaultHermesToolAdapter: HermesToolAdapter =
  new DefaultHermesToolAdapter()
