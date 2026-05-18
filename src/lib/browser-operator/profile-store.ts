import type {
  BrowserOperatorAccount,
  BrowserOperatorProfile,
  BrowserOperatorProviderKind,
} from '@contracts/browser-operator'

export type BrowserOperatorProfileAffinity = {
  provider: BrowserOperatorProviderKind
  profileRef?: string
  contextRef?: string
  artifactRef?: string
  usable: boolean
  reason: string
}

export function resolveBrowserOperatorProfileAffinity(input: {
  account: BrowserOperatorAccount
  profiles: BrowserOperatorProfile[]
}): BrowserOperatorProfileAffinity {
  const active = input.profiles.find((profile) =>
    profile.browser_account_id === input.account.id
    && profile.provider === input.account.provider
    && profile.status === 'active')

  if (active) {
    return {
      provider: active.provider,
      profileRef: active.provider_profile_ref,
      contextRef: active.provider_context_ref,
      artifactRef: active.profile_artifact_ref,
      usable: true,
      reason: 'active_profile',
    }
  }

  const degraded = input.profiles.find((profile) =>
    profile.browser_account_id === input.account.id
    && profile.provider === input.account.provider
    && ['degraded', 'expired', 'migration_required'].includes(profile.status))

  if (degraded) {
    return {
      provider: degraded.provider,
      profileRef: degraded.provider_profile_ref,
      contextRef: degraded.provider_context_ref,
      artifactRef: degraded.profile_artifact_ref,
      usable: false,
      reason: `profile_${degraded.status}`,
    }
  }

  return {
    provider: input.account.provider,
    profileRef: input.account.provider_profile_ref,
    contextRef: input.account.provider_context_ref,
    usable: input.account.auth_state === 'connected',
    reason: input.account.auth_state === 'connected'
      ? 'legacy_account_profile_ref'
      : 'connect_required',
  }
}
