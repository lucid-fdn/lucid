import type {
  BrowserOperatorAccount,
  BrowserOperatorByoRuntime,
} from '@contracts/browser-operator'

export type BrowserOperatorProviderAuthRef = {
  source: 'nango' | 'lucid_vault' | 'none'
  orgConnectionId?: string
  authProvider?: string
  authConnectionId?: string
  secretRef?: string
  usable: boolean
  reason: string
}

export function resolveBrowserOperatorProviderAuthRef(
  input: BrowserOperatorAccount | BrowserOperatorByoRuntime,
): BrowserOperatorProviderAuthRef {
  if (input.auth_provider && input.auth_connection_id) {
    return {
      source: 'nango',
      orgConnectionId: input.org_connection_id,
      authProvider: input.auth_provider,
      authConnectionId: input.auth_connection_id,
      usable: true,
      reason: 'nango_connection_ref',
    }
  }

  if ('session_secret_ref' in input && input.session_secret_ref) {
    return {
      source: 'lucid_vault',
      secretRef: input.session_secret_ref,
      usable: true,
      reason: 'lucid_session_secret_ref',
    }
  }

  if ('token_ref' in input && input.token_ref) {
    return {
      source: 'lucid_vault',
      secretRef: input.token_ref,
      usable: true,
      reason: 'lucid_runtime_token_ref',
    }
  }

  return {
    source: 'none',
    usable: false,
    reason: 'provider_auth_not_configured',
  }
}
