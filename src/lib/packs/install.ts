import type { LucidPackInstall, LucidPackManagedResource } from '@contracts/lucid-pack'

export interface LucidPackInstallHealth {
  status: 'ready' | 'needs_review' | 'archived' | 'paused'
  active: number
  drifted: number
  forked: number
  archived: number
  message: string
}

export function summarizeLucidPackInstallHealth(input: {
  install: Pick<LucidPackInstall, 'status'>
  resources: Array<Pick<LucidPackManagedResource, 'status'>>
}): LucidPackInstallHealth {
  const active = input.resources.filter((resource) => resource.status === 'active').length
  const drifted = input.resources.filter((resource) => resource.status === 'drifted').length
  const forked = input.resources.filter((resource) => resource.status === 'forked').length
  const archived = input.resources.filter((resource) => resource.status === 'archived').length

  if (input.install.status === 'archived') {
    return { status: 'archived', active, drifted, forked, archived, message: 'Pack is archived. Managed resources are preserved for audit.' }
  }
  if (input.install.status === 'paused') {
    return { status: 'paused', active, drifted, forked, archived, message: 'Pack is paused. Reconcile before relying on it for setup guidance.' }
  }
  if (drifted > 0 || forked > 0) {
    return { status: 'needs_review', active, drifted, forked, archived, message: 'Pack has drifted or forked resources that need operator review.' }
  }
  return { status: 'ready', active, drifted, forked, archived, message: 'Pack resources match the managed manifest.' }
}
