/**
 * Shared notification copy.
 *
 * Keep repeated user-facing notification strings here so the app uses
 * consistent wording across flows and we avoid string drift.
 */

export const notificationCopy = {
  title: {
    error: 'Error',
    success: 'Success',
  },
  common: {
    unexpectedError: 'An unexpected error occurred',
    networkError: 'Network error',
    failedToUpdate: 'Failed to update',
    deleteFailed: 'Delete failed',
    accountConnected: 'Account connected',
    failedToDisconnect: 'Failed to disconnect',
    copiedToClipboard: 'Copied to clipboard',
  },
  team: {
    runStarted: 'Team run started',
    failedToStartRun: 'Failed to start team run',
    createdFromGroup: 'Team created from group',
    dissolved: 'Team dissolved',
    failedToDissolve: 'Failed to dissolve team',
    updated: 'Team updated',
    failedToUpdate: 'Failed to update team',
  },
  agent: {
    deleted: 'Agent deleted',
    failedToDelete: 'Failed to delete agent',
  },
  wallet: {
    privateKeyExported: 'Private key exported',
    cannotRemoveWallet: 'Cannot remove wallet',
  },
  upload: {
    logoUploaded: 'Logo uploaded',
  },
  profile: {
    updatedSuccessfully: 'Profile updated successfully',
  },
  validation: {
    enterValue: 'Please enter a value',
    enterVariableName: 'Please enter a variable name',
  },
} as const

export type NotificationCopy = typeof notificationCopy
