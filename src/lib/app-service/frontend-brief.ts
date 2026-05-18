import {
  AppFrontendSpecSchema,
  AppServiceSpecSchema,
  FrontendBuildBriefSchema,
  PUBLIC_APP_RUNTIME_OPENAPI_PATH,
  type AppFrontendSpec,
  type AppServiceSpec,
  type FrontendBuildBrief,
} from '@contracts/app-service'
import { sanitizeGeneratedAppManifest } from './manifest-sanitizer'

export { PUBLIC_APP_RUNTIME_OPENAPI_PATH }

function buildProviderSafeFrontendSpec(parsed: AppServiceSpec): AppFrontendSpec {
  const sanitized = sanitizeGeneratedAppManifest({
    schema_version: parsed.schema_version,
    kind: parsed.kind,
    name: parsed.name,
    slug: parsed.slug,
    description: parsed.description,
    category: parsed.category,
    audience: parsed.audience,
    outcome: parsed.outcome,
    theme: parsed.frontend.theme,
    pages: parsed.frontend.pages,
    required_states: parsed.frontend.required_states,
  }, {
    name: parsed.name,
    slug: parsed.slug,
  })

  return AppFrontendSpecSchema.parse({
    strategy: parsed.frontend.strategy,
    theme: sanitized.theme,
    pages: sanitized.pages,
    required_states: sanitized.required_states,
  })
}

export function buildFrontendBriefFromSpec(
  spec: AppServiceSpec,
  publicApiContractUrl = PUBLIC_APP_RUNTIME_OPENAPI_PATH,
): FrontendBuildBrief {
  const parsed = AppServiceSpecSchema.parse(spec)

  return FrontendBuildBriefSchema.parse({
    schema_version: '1.0',
    app_name: parsed.name,
    app_slug: parsed.slug,
    purpose: parsed.description,
    audience: parsed.audience,
    outcome: parsed.outcome,
    frontend: buildProviderSafeFrontendSpec(parsed),
    public_api_contract_url: publicApiContractUrl,
  })
}
