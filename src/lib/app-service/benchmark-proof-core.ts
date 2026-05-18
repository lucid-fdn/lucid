import { APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS } from './platform-blueprints-core'

export interface AppServiceBenchmarkProof {
  schema_version: '1.0'
  generated_at: string
  benchmark_set: 'platform_blueprint_static_readiness'
  summary: {
    blueprint_count: number
    eval_scenario_count: number
    proof_metric_count: number
    public_action_blueprint_count: number
    integration_requirement_count: number
  }
  blueprints: Array<{
    slug: string
    version: string
    category: string
    eval_scenario_count: number
    proof_metrics: string[]
    required_states: string[]
    public_actions: string[]
    integrations: string[]
  }>
}

export function buildAppServiceBenchmarkProof(now = new Date()): AppServiceBenchmarkProof {
  const blueprints = APP_SERVICE_FIRST_PLATFORM_BLUEPRINTS.map((blueprint) => ({
    slug: blueprint.slug,
    version: blueprint.version,
    category: blueprint.spec.category,
    eval_scenario_count: blueprint.spec.eval_pack.length,
    proof_metrics: blueprint.proofMetrics,
    required_states: blueprint.spec.frontend.required_states,
    public_actions: blueprint.spec.workflows
      .filter((workflow) => workflow.trigger === 'public_action')
      .flatMap((workflow) => workflow.public_action_key ? [workflow.public_action_key] : []),
    integrations: blueprint.spec.integrations.map((integration) => integration.provider),
  }))

  return {
    schema_version: '1.0',
    generated_at: now.toISOString(),
    benchmark_set: 'platform_blueprint_static_readiness',
    summary: {
      blueprint_count: blueprints.length,
      eval_scenario_count: blueprints.reduce((sum, blueprint) => sum + blueprint.eval_scenario_count, 0),
      proof_metric_count: blueprints.reduce((sum, blueprint) => sum + blueprint.proof_metrics.length, 0),
      public_action_blueprint_count: blueprints.filter((blueprint) => blueprint.public_actions.length > 0).length,
      integration_requirement_count: blueprints.reduce((sum, blueprint) => sum + blueprint.integrations.length, 0),
    },
    blueprints,
  }
}
