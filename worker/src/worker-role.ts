import type { Config } from './config.js'

export type WorkerRole = Config['WORKER_ROLE']
export type WorkerMode = Config['WORKER_MODE']

export function isInteractiveRole(role: WorkerRole): boolean {
  return role === 'interactive' || role === 'interactive_gateway' || role === 'all'
}

export function isAutomationRole(role: WorkerRole): boolean {
  return role === 'automation' || role === 'all'
}

export function isGatewayRole(role: WorkerRole): boolean {
  return role === 'gateway' || role === 'interactive_gateway' || role === 'all'
}

export function isMaintenanceRole(role: WorkerRole): boolean {
  return role === 'automation' || role === 'all'
}

export function isDagStepRole(role: WorkerRole): boolean {
  return isMaintenanceRole(role)
}

export function isPulseRecoveryRole(role: WorkerRole): boolean {
  return isMaintenanceRole(role)
}

export function isPulseSweepRole(role: WorkerRole): boolean {
  return isMaintenanceRole(role)
}

export function isWorkerHttpMode(mode: WorkerMode): boolean {
  return mode === 'worker' || mode === 'all'
}

export function isChannelAdminHttpMode(mode: WorkerMode): boolean {
  return mode === 'channels' || mode === 'discord' || mode === 'slack' || mode === 'worker' || mode === 'all'
}

export function shouldStartDiscordGateway(mode: WorkerMode, role: WorkerRole): boolean {
  return (mode === 'discord' || mode === 'channels' || mode === 'all') && isGatewayRole(role)
}

export function shouldStartSlackGateway(mode: WorkerMode, role: WorkerRole): boolean {
  return (mode === 'slack' || mode === 'channels' || mode === 'all') && isGatewayRole(role)
}

export function shouldRegisterBrowserGateway(mode: WorkerMode, role: WorkerRole): boolean {
  void role
  return mode === 'browser' || mode === 'all'
}

export function isProductionAllMode(mode: WorkerMode, nodeEnv: string | undefined): boolean {
  return mode === 'all' && nodeEnv === 'production'
}

export function describeWorkerRole(role: WorkerRole): string {
  switch (role) {
    case 'interactive':
      return 'interactive (inbound/outbound low-latency traffic)'
    case 'interactive_gateway':
      return 'interactive_gateway (channel gateways + inbound/outbound low-latency traffic)'
    case 'automation':
      return 'automation (scheduled/background work)'
    case 'gateway':
      return 'gateway (long-lived channel socket processes)'
    case 'all':
    default:
      return 'all (development / mixed mode)'
  }
}
