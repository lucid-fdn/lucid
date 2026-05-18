import { describe, expect, it } from 'vitest'

import { matchNamedAgentBinding as matchAppNamedAgentBinding } from '../agent-routing'
import { matchNamedAgentBinding as matchWorkerNamedAgentBinding } from '../../../../worker/src/channels/shared-agent-routing'

const bindings = [
  {
    id: 'general',
    assistant_id: 'assistant-general',
    assistant_name: 'General',
    assistantId: 'assistant-general',
    assistantName: 'General',
    aliases: ['general'],
  },
  {
    id: 'sales',
    assistant_id: 'assistant-sales',
    assistant_name: 'Sales',
    assistantId: 'assistant-sales',
    assistantName: 'Sales',
    aliases: ['sales', 'rev ops'],
  },
]

describe('named agent matcher parity', () => {
  it.each(['sales', 'sa', 'rev', 'general', 'unknown'])(
    'keeps app and worker matcher behavior aligned for "%s"',
    (target) => {
      const appResult = matchAppNamedAgentBinding(bindings, target)
      const workerResult = matchWorkerNamedAgentBinding(bindings, target)

      expect(workerResult).toEqual(appResult)
    },
  )
})
