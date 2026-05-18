import type { RuntimeFlavor } from '@/lib/engines/types'

export const RUNTIME_FLAVOR_LABELS: Record<RuntimeFlavor, string> = {
  shared: 'Shared',
  c1_managed: 'C1 Managed',
  c2a_autonomous: 'C2a Autonomous',
}

export const RUNTIME_FLAVOR_DESCRIPTIONS: Record<RuntimeFlavor, string> = {
  shared: 'Fastest setup. Runs on Lucid shared infrastructure.',
  c1_managed: 'Dedicated runtime operated by Lucid with Lucid-managed control plane.',
  c2a_autonomous: 'Self-sovereign runtime on your chosen infrastructure.',
}
