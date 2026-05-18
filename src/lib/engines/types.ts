export type AgentEngine =
  | 'openclaw'
  | 'hermes'
  | 'langchain'
  | 'crewai'
  | 'autogen'
  | 'smolagents'
  | 'lucid'

export type RuntimeFlavor = 'shared' | 'c1_managed' | 'c2a_autonomous'

export type ChannelOwnership = 'lucid_relay' | 'runtime_native'

export type RuntimeProtocol = 'lucid-runtime-v1' | 'lucid-runtime-v2'

export type EngineSupportLevel = 'stable' | 'experimental' | 'planned' | 'unsupported'
