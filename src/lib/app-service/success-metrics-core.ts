export type AppServiceSuccessMetricCategory = 'activation' | 'quality' | 'business' | 'north_star'
export type AppServiceSuccessMetricDirection = 'gte' | 'lte'
export type AppServiceSuccessMetricUnit = 'count' | 'rate' | 'days' | 'usd'

export interface AppServiceSuccessMetricDefinition {
  id: string
  category: AppServiceSuccessMetricCategory
  label: string
  unit: AppServiceSuccessMetricUnit
  direction: AppServiceSuccessMetricDirection
  betaThreshold: number
  eventSources: string[]
}

export interface AppServiceSuccessMetricObservation {
  value?: number
  evidence?: string[]
}

export interface AppServiceSuccessMetricResult {
  id: string
  category: AppServiceSuccessMetricCategory
  label: string
  status: 'pass' | 'fail' | 'missing'
  value?: number
  threshold: number
  direction: AppServiceSuccessMetricDirection
  missingEvidence: string[]
}

export const APP_SERVICE_SUCCESS_METRICS = [
  {
    id: 'generated_specs_per_week',
    category: 'activation',
    label: 'Generated specs per week',
    unit: 'count',
    direction: 'gte',
    betaThreshold: 25,
    eventSources: ['generation_run_created', 'generation_planner_ai_completed', 'generation_planner_deterministic'],
  },
  {
    id: 'preview_opened_rate',
    category: 'activation',
    label: 'Preview opened rate',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.75,
    eventSources: ['generation_preview_deployed', 'public_runtime_config_read'],
  },
  {
    id: 'deploy_conversion_rate',
    category: 'activation',
    label: 'Deploy conversion rate',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.35,
    eventSources: ['generation_preview_deployed', 'app_service_generation_approved'],
  },
  {
    id: 'integration_connected_72h_rate',
    category: 'activation',
    label: 'Integration connected within 72h',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.45,
    eventSources: ['operator_runtime_integrations_listed', 'app_secret_requirement_connected'],
  },
  {
    id: 'first_external_visitor_rate',
    category: 'activation',
    label: 'Public app received first external visitor',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.50,
    eventSources: ['public_runtime_session_created', 'public_runtime_config_read'],
  },
  {
    id: 'first_useful_agent_conversation_rate',
    category: 'activation',
    label: 'Public app received first useful agent conversation',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.40,
    eventSources: ['public_runtime_chat_completed', 'public_runtime_feedback_submitted'],
  },
  {
    id: 'generation_success_rate',
    category: 'quality',
    label: 'Generation success rate',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.90,
    eventSources: ['generation_run_created', 'generation_preview_deployed', 'generation_run_failed'],
  },
  {
    id: 'eval_pass_rate',
    category: 'quality',
    label: 'Eval pass rate',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.85,
    eventSources: ['v0_frontend_source_validated', 'generated_code_build_validated'],
  },
  {
    id: 'public_chat_positive_feedback_rate',
    category: 'quality',
    label: 'Public chat CSAT or thumbs up/down',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.70,
    eventSources: ['public_runtime_feedback_submitted'],
  },
  {
    id: 'human_escalation_correctness_rate',
    category: 'quality',
    label: 'Human escalation correctness',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.80,
    eventSources: ['public_runtime_action_requested', 'public_lead_submitted'],
  },
  {
    id: 'unsafe_response_report_rate',
    category: 'quality',
    label: 'Hallucination/unsafe response reports',
    unit: 'rate',
    direction: 'lte',
    betaThreshold: 0.02,
    eventSources: ['public_runtime_feedback_reported', 'public_feedback_reported'],
  },
  {
    id: 'trial_to_paid_after_deploy_rate',
    category: 'business',
    label: 'Trial-to-paid conversion after app deploy',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.12,
    eventSources: ['app_service_generation_approved', 'billing_upgrade_started'],
  },
  {
    id: 'apps_retained_7d_rate',
    category: 'business',
    label: 'Apps retained after 7 days',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.40,
    eventSources: ['public_runtime_session_created', 'public_runtime_chat_completed'],
  },
  {
    id: 'apps_retained_30d_rate',
    category: 'business',
    label: 'Apps retained after 30 days',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.25,
    eventSources: ['public_runtime_session_created', 'public_runtime_chat_completed'],
  },
  {
    id: 'marketplace_remix_rate',
    category: 'business',
    label: 'Marketplace remix rate',
    unit: 'rate',
    direction: 'gte',
    betaThreshold: 0.10,
    eventSources: ['app_blueprint_remixed', 'generation_planner_platform_blueprint'],
  },
  {
    id: 'creator_template_installs',
    category: 'business',
    label: 'Creator template installs',
    unit: 'count',
    direction: 'gte',
    betaThreshold: 10,
    eventSources: ['app_blueprint_installed', 'generation_planner_platform_blueprint'],
  },
  {
    id: 'built_with_lucid_referral_traffic',
    category: 'business',
    label: 'Public Built with Lucid referral traffic',
    unit: 'count',
    direction: 'gte',
    betaThreshold: 100,
    eventSources: ['built_with_lucid_referral_clicked', 'public_runtime_config_read'],
  },
  {
    id: 'activated_generated_ai_services_7d',
    category: 'north_star',
    label: 'Generated AI services with real external usage within 7 days',
    unit: 'count',
    direction: 'gte',
    betaThreshold: 10,
    eventSources: ['generation_preview_deployed', 'public_runtime_session_created', 'public_runtime_chat_completed'],
  },
] as const satisfies readonly AppServiceSuccessMetricDefinition[]

export type AppServiceSuccessMetricId = typeof APP_SERVICE_SUCCESS_METRICS[number]['id']

export function evaluateAppServiceSuccessMetrics(
  observations: Partial<Record<AppServiceSuccessMetricId, AppServiceSuccessMetricObservation | number>>,
): AppServiceSuccessMetricResult[] {
  return APP_SERVICE_SUCCESS_METRICS.map((metric) => {
    const raw = observations[metric.id]
    const observation = typeof raw === 'number' ? { value: raw } : raw
    const value = observation?.value
    const evidence = observation?.evidence ?? []
    const missingEvidence = metric.eventSources.filter((source) => !evidence.includes(source))
    const hasValue = typeof value === 'number' && Number.isFinite(value)
    const passed = hasValue && (
      metric.direction === 'gte'
        ? value >= metric.betaThreshold
        : value <= metric.betaThreshold
    )

    return {
      id: metric.id,
      category: metric.category,
      label: metric.label,
      status: !hasValue ? 'missing' : passed ? 'pass' : 'fail',
      value,
      threshold: metric.betaThreshold,
      direction: metric.direction,
      missingEvidence: passed ? [] : missingEvidence,
    }
  })
}

export function summarizeAppServiceSuccessMetrics() {
  return {
    metricCount: APP_SERVICE_SUCCESS_METRICS.length,
    activationMetricCount: APP_SERVICE_SUCCESS_METRICS.filter((metric) => metric.category === 'activation').length,
    qualityMetricCount: APP_SERVICE_SUCCESS_METRICS.filter((metric) => metric.category === 'quality').length,
    businessMetricCount: APP_SERVICE_SUCCESS_METRICS.filter((metric) => metric.category === 'business').length,
    northStarMetricId: 'activated_generated_ai_services_7d' as AppServiceSuccessMetricId,
    metricIds: APP_SERVICE_SUCCESS_METRICS.map((metric) => metric.id),
  }
}
