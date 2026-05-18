export type AppRuntimeHttpMethod = 'get' | 'post' | 'patch' | 'delete'

export interface AppRuntimeEndpoint {
  method: AppRuntimeHttpMethod
  path: string
  operationId: string
  audience: 'public' | 'operator' | 'sdk'
}

export const APP_RUNTIME_ENDPOINTS = [
  { method: 'get', path: '/sdk/openapi.json', operationId: 'getAppRuntimeOpenApi', audience: 'sdk' },
  { method: 'get', path: '/public/apps/{slug}/config', operationId: 'getPublicAppConfig', audience: 'public' },
  { method: 'get', path: '/public/apps/{slug}/discovery', operationId: 'getPublicAppDiscovery', audience: 'public' },
  { method: 'post', path: '/public/apps/{slug}/sessions', operationId: 'createVisitorSession', audience: 'public' },
  { method: 'get', path: '/public/apps/{slug}/status', operationId: 'getPublicAppStatus', audience: 'public' },
  { method: 'post', path: '/public/apps/{slug}/chat', operationId: 'sendPublicChat', audience: 'public' },
  { method: 'post', path: '/public/apps/{slug}/lead', operationId: 'submitPublicLead', audience: 'public' },
  { method: 'post', path: '/public/apps/{slug}/leads', operationId: 'submitPublicLeadLegacy', audience: 'public' },
  { method: 'post', path: '/public/apps/{slug}/feedback', operationId: 'submitPublicFeedback', audience: 'public' },
  { method: 'post', path: '/public/apps/{slug}/actions/{action}', operationId: 'runPublicAction', audience: 'public' },
  { method: 'get', path: '/operator/apps/{appId}/summary', operationId: 'getOperatorSummary', audience: 'operator' },
  { method: 'get', path: '/operator/apps/{appId}/usage', operationId: 'getOperatorUsage', audience: 'operator' },
  { method: 'patch', path: '/operator/apps/{appId}/settings', operationId: 'updateOperatorAppSettings', audience: 'operator' },
  { method: 'post', path: '/operator/apps/{appId}/pause', operationId: 'pauseOperatorApp', audience: 'operator' },
  { method: 'post', path: '/operator/apps/{appId}/resume', operationId: 'resumeOperatorApp', audience: 'operator' },
  { method: 'get', path: '/operator/apps/{appId}/integrations', operationId: 'listOperatorIntegrations', audience: 'operator' },
  { method: 'get', path: '/operator/apps/{appId}/discovery', operationId: 'getOperatorDiscovery', audience: 'operator' },
  { method: 'patch', path: '/operator/apps/{appId}/discovery', operationId: 'updateOperatorDiscovery', audience: 'operator' },
  { method: 'get', path: '/operator/apps/{appId}/tokens', operationId: 'listOperatorPublicTokens', audience: 'operator' },
  { method: 'post', path: '/operator/apps/{appId}/tokens', operationId: 'createOperatorPublicToken', audience: 'operator' },
  { method: 'post', path: '/operator/apps/{appId}/tokens/{tokenId}/revoke', operationId: 'revokeOperatorPublicToken', audience: 'operator' },
  { method: 'post', path: '/operator/apps/{appId}/tokens/{tokenId}/rotate', operationId: 'rotateOperatorPublicToken', audience: 'operator' },
  { method: 'get', path: '/operator/apps/{appId}/origins', operationId: 'listOperatorAllowedOrigins', audience: 'operator' },
  { method: 'post', path: '/operator/apps/{appId}/origins', operationId: 'addOperatorAllowedOrigin', audience: 'operator' },
  { method: 'delete', path: '/operator/apps/{appId}/origins/{originId}', operationId: 'removeOperatorAllowedOrigin', audience: 'operator' },
  { method: 'get', path: '/operator/apps/{appId}/agentops/feed', operationId: 'listOperatorAgentOpsFeed', audience: 'operator' },
  { method: 'post', path: '/operator/apps/{appId}/agents/{agentId}/control', operationId: 'controlOperatorAgent', audience: 'operator' },
  { method: 'post', path: '/operator/apps/{appId}/teams/run', operationId: 'runOperatorTeam', audience: 'operator' },
  { method: 'post', path: '/operator/apps/{appId}/workflows/run', operationId: 'runOperatorWorkflow', audience: 'operator' },
] as const satisfies readonly AppRuntimeEndpoint[]

const slugParameter = { name: 'slug', in: 'path', required: true, schema: { type: 'string' } }
const actionParameter = { name: 'action', in: 'path', required: true, schema: { type: 'string' } }
const appIdParameter = { name: 'appId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
const agentIdParameter = { name: 'agentId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
const tokenIdParameter = { name: 'tokenId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
const originIdParameter = { name: 'originId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }
const orgIdParameter = {
  name: 'orgId',
  in: 'query',
  required: false,
  schema: { type: 'string', format: 'uuid' },
  description: 'Workspace/org scope used by generated operator UIs.',
}

function success(description: string, schema?: Record<string, unknown>) {
  return {
    description,
    content: schema
      ? { 'application/json': { schema } }
      : undefined,
  }
}

function error(description: string) {
  return {
    description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiErrorEnvelope' },
      },
    },
  }
}

function jsonBody(schema: Record<string, unknown>, description?: string, required = true) {
  return {
    required,
    description,
    content: {
      'application/json': {
        schema,
      },
    },
  }
}

function envelope(schema: Record<string, unknown>) {
  return {
    allOf: [
      { $ref: '#/components/schemas/ApiSuccessEnvelope' },
      {
        type: 'object',
        required: ['data'],
        properties: {
          data: schema,
        },
      },
    ],
  }
}

const commonErrors = {
  '400': error('Validation failed.'),
  '401': error('Authentication required.'),
  '403': error('Forbidden or origin not allowed.'),
  '404': error('Feature disabled or resource not found.'),
  '429': error('Rate limited.'),
  '500': error('Internal error.'),
}

const publicErrors = {
  '400': error('Validation failed.'),
  '402': error('Cost cap reached.'),
  '403': error('Origin not allowed.'),
  '404': error('Generated app not found or runtime disabled.'),
  '409': error('App is paused or requires setup.'),
  '429': error('Rate limited.'),
  '503': error('Provider unavailable.'),
}

export const APP_RUNTIME_OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Lucid App Runtime API',
    version: 'v1',
    description: 'Stable public and operator API consumed by generated AI agent service apps.',
  },
  servers: [
    {
      url: '/api/app-runtime/v1',
      description: 'Lucid App Runtime API',
    },
  ],
  tags: [
    { name: 'SDK', description: 'Runtime contract discovery.' },
    { name: 'Public Runtime', description: 'Visitor-safe generated app APIs.' },
    { name: 'Operator Runtime', description: 'Authenticated owner/operator APIs for generated apps.' },
  ],
  paths: {
    '/sdk/openapi.json': {
      get: {
        operationId: 'getAppRuntimeOpenApi',
        tags: ['SDK'],
        summary: 'Read the App Runtime OpenAPI contract.',
        responses: {
          '200': success('OpenAPI contract.', { type: 'object' }),
          '404': error('Runtime API is disabled.'),
        },
      },
    },
    '/public/apps/{slug}/config': {
      get: {
        operationId: 'getPublicAppConfig',
        tags: ['Public Runtime'],
        summary: 'Read generated app public configuration.',
        parameters: [slugParameter],
        security: [{ publicAppToken: [] }, {}],
        responses: {
          '200': success('Public app configuration.', envelope({
            type: 'object',
            required: ['config'],
            properties: { config: { $ref: '#/components/schemas/PublicAppConfig' } },
          })),
          ...publicErrors,
        },
      },
    },
    '/public/apps/{slug}/discovery': {
      get: {
        operationId: 'getPublicAppDiscovery',
        tags: ['Public Runtime'],
        summary: 'Read generated app MCP/A2A discovery descriptors.',
        parameters: [slugParameter],
        security: [{ publicAppToken: [] }, {}],
        responses: {
          '200': success('Discovery manifest.', envelope({
            type: 'object',
            required: ['discovery'],
            properties: { discovery: { $ref: '#/components/schemas/AppDiscoveryManifest' } },
          })),
          ...publicErrors,
        },
      },
    },
    '/public/apps/{slug}/sessions': {
      post: {
        operationId: 'createVisitorSession',
        tags: ['Public Runtime'],
        summary: 'Create an anonymous visitor session for a generated app.',
        parameters: [slugParameter],
        security: [{ publicAppToken: [] }, {}],
        requestBody: jsonBody({ $ref: '#/components/schemas/VisitorSessionCreateRequest' }),
        responses: {
          '201': success('Visitor session created.', envelope({
            type: 'object',
            required: ['session'],
            properties: { session: { $ref: '#/components/schemas/VisitorSession' } },
          })),
          ...publicErrors,
        },
      },
    },
    '/public/apps/{slug}/status': {
      get: {
        operationId: 'getPublicAppStatus',
        tags: ['Public Runtime'],
        summary: 'Read public app availability and setup status.',
        parameters: [slugParameter],
        security: [{ publicAppToken: [] }, {}],
        responses: {
          '200': success('Public app status.', envelope({
            type: 'object',
            required: ['app_id', 'slug', 'status'],
            properties: {
              app_id: { type: 'string', format: 'uuid' },
              slug: { type: 'string' },
              status: { enum: ['active', 'paused', 'maintenance', 'setup_required'] },
              public_url: { type: ['string', 'null'] },
              preview_url: { type: ['string', 'null'] },
            },
          })),
          ...publicErrors,
        },
      },
    },
    '/public/apps/{slug}/chat': {
      post: {
        operationId: 'sendPublicChat',
        tags: ['Public Runtime'],
        summary: 'Send a visitor chat turn to the generated app agent service.',
        parameters: [slugParameter],
        security: [{ publicAppToken: [] }, {}],
        requestBody: jsonBody({ $ref: '#/components/schemas/PublicChatRequest' }),
        responses: {
          '200': success('Chat completed.', envelope({
            type: 'object',
            required: ['chat'],
            properties: { chat: { $ref: '#/components/schemas/PublicChatResponse' } },
          })),
          '202': success('Chat accepted or queued.', envelope({
            type: 'object',
            required: ['chat'],
            properties: { chat: { $ref: '#/components/schemas/PublicChatResponse' } },
          })),
          ...publicErrors,
        },
      },
    },
    '/public/apps/{slug}/lead': {
      post: {
        operationId: 'submitPublicLead',
        tags: ['Public Runtime'],
        summary: 'Submit a generated app lead or intake form.',
        parameters: [slugParameter],
        security: [{ publicAppToken: [] }, {}],
        requestBody: jsonBody({ $ref: '#/components/schemas/PublicLeadRequest' }),
        responses: {
          '202': success('Lead received.', envelope({
            type: 'object',
            required: ['lead'],
            properties: { lead: { $ref: '#/components/schemas/PublicLead' } },
          })),
          ...publicErrors,
        },
      },
    },
    '/public/apps/{slug}/leads': {
      post: {
        operationId: 'submitPublicLeadLegacy',
        tags: ['Public Runtime'],
        deprecated: true,
        summary: 'Compatibility alias for lead submission.',
        parameters: [slugParameter],
        security: [{ publicAppToken: [] }, {}],
        requestBody: jsonBody({ $ref: '#/components/schemas/PublicLeadRequest' }),
        responses: {
          '202': success('Lead received.', envelope({
            type: 'object',
            required: ['lead'],
            properties: { lead: { $ref: '#/components/schemas/PublicLead' } },
          })),
          ...publicErrors,
        },
      },
    },
    '/public/apps/{slug}/feedback': {
      post: {
        operationId: 'submitPublicFeedback',
        tags: ['Public Runtime'],
        summary: 'Submit visitor feedback or unsafe-answer report.',
        parameters: [slugParameter],
        security: [{ publicAppToken: [] }, {}],
        requestBody: jsonBody({ $ref: '#/components/schemas/PublicFeedbackRequest' }),
        responses: {
          '200': success('Feedback received.', envelope({
            type: 'object',
            required: ['status'],
            properties: { status: { const: 'received' } },
          })),
          ...publicErrors,
        },
      },
    },
    '/public/apps/{slug}/actions/{action}': {
      post: {
        operationId: 'runPublicAction',
        tags: ['Public Runtime'],
        summary: 'Run a public whitelisted generated app action.',
        parameters: [slugParameter, actionParameter],
        security: [{ publicAppToken: [] }, {}],
        requestBody: jsonBody({ $ref: '#/components/schemas/PublicActionRequest' }),
        responses: {
          '202': success('Action accepted.', envelope({
            type: 'object',
            required: ['action'],
            properties: { action: { $ref: '#/components/schemas/PublicActionResult' } },
          })),
          ...publicErrors,
          '402': {
            description: 'Machine payment required or public usage cap reached.',
            content: {
              'application/json': {
                schema: {
                  oneOf: [
                    { $ref: '#/components/schemas/MachinePaymentRequired' },
                    { $ref: '#/components/schemas/ApiErrorEnvelope' },
                  ],
                },
              },
            },
          },
        },
      },
    },
    '/operator/apps/{appId}/summary': {
      get: {
        operationId: 'getOperatorSummary',
        tags: ['Operator Runtime'],
        summary: 'Read owner/operator cockpit summary for a generated app.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        responses: {
          '200': success('Operator summary.', envelope({
            type: 'object',
            required: ['summary'],
            properties: { summary: { $ref: '#/components/schemas/OperatorSummary' } },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/usage': {
      get: {
        operationId: 'getOperatorUsage',
        tags: ['Operator Runtime'],
        summary: 'Read public usage buckets, abuse signals, quota state, and launch readiness for a generated app.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        responses: {
          '200': success('Operator usage summary.', envelope({
            type: 'object',
            required: ['usage', 'abuse'],
            properties: {
              usage: { $ref: '#/components/schemas/OperatorUsage' },
              abuse: { $ref: '#/components/schemas/OperatorAbuseSummary' },
              launch_readiness: { $ref: '#/components/schemas/OperatorLaunchReadiness' },
            },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/settings': {
      patch: {
        operationId: 'updateOperatorAppSettings',
        tags: ['Operator Runtime'],
        summary: 'Update generated app name, slug, visibility, theme, consent, and limits.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/OperatorAppSettingsPatch' }),
        responses: {
          '200': success('Settings updated.', envelope({
            type: 'object',
            required: ['app'],
            properties: { app: { type: 'object', additionalProperties: true } },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/pause': {
      post: {
        operationId: 'pauseOperatorApp',
        tags: ['Operator Runtime'],
        summary: 'Pause public access for a generated app.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/OperatorLifecycleRequest' }, undefined, false),
        responses: {
          '200': success('App paused.', envelope({
            type: 'object',
            required: ['app'],
            properties: { app: { type: 'object', additionalProperties: true } },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/resume': {
      post: {
        operationId: 'resumeOperatorApp',
        tags: ['Operator Runtime'],
        summary: 'Resume public access for a generated app.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/OperatorResumeRequest' }, undefined, false),
        responses: {
          '200': success('App resumed.', envelope({
            type: 'object',
            required: ['app'],
            properties: { app: { type: 'object', additionalProperties: true } },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/integrations': {
      get: {
        operationId: 'listOperatorIntegrations',
        tags: ['Operator Runtime'],
        summary: 'List app-scoped integration connection states.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        responses: {
          '200': success('Integration statuses.', envelope({
            type: 'object',
            required: ['integrations'],
            properties: {
              integrations: {
                type: 'array',
                items: { $ref: '#/components/schemas/AppIntegrationStatus' },
              },
            },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/discovery': {
      get: {
        operationId: 'getOperatorDiscovery',
        tags: ['Operator Runtime'],
        summary: 'Read generated app discovery descriptors as the operator.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        responses: {
          '200': success('Discovery manifest.', envelope({
            type: 'object',
            required: ['discovery'],
            properties: { discovery: { $ref: '#/components/schemas/AppDiscoveryManifest' } },
          })),
          ...commonErrors,
        },
      },
      patch: {
        operationId: 'updateOperatorDiscovery',
        tags: ['Operator Runtime'],
        summary: 'Update generated app MCP/A2A discovery metadata.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/OperatorDiscoveryPatchRequest' }),
        responses: {
          '200': success('Discovery metadata updated.', envelope({
            type: 'object',
            required: ['app', 'discovery'],
            properties: {
              app: { type: 'object', additionalProperties: true },
              discovery: { $ref: '#/components/schemas/AppDiscoveryManifest' },
            },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/tokens': {
      get: {
        operationId: 'listOperatorPublicTokens',
        tags: ['Operator Runtime'],
        summary: 'List redacted public runtime tokens for a generated app.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        responses: {
          '200': success('Public runtime tokens.', envelope({
            type: 'object',
            required: ['tokens'],
            properties: {
              tokens: { type: 'array', items: { $ref: '#/components/schemas/OperatorPublicToken' } },
            },
          })),
          ...commonErrors,
        },
      },
      post: {
        operationId: 'createOperatorPublicToken',
        tags: ['Operator Runtime'],
        summary: 'Create a scoped public runtime token for embeds and SDK clients.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/OperatorPublicTokenCreateRequest' }),
        responses: {
          '201': success('Public runtime token created.', envelope({
            type: 'object',
            required: ['token'],
            properties: { token: { $ref: '#/components/schemas/CreatedOperatorPublicToken' } },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/tokens/{tokenId}/revoke': {
      post: {
        operationId: 'revokeOperatorPublicToken',
        tags: ['Operator Runtime'],
        summary: 'Revoke a public runtime token.',
        parameters: [appIdParameter, tokenIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        responses: {
          '200': success('Public runtime token revoked.', envelope({
            type: 'object',
            required: ['token'],
            properties: {
              token: {
                type: 'object',
                required: ['id', 'revoked'],
                properties: { id: { type: 'string', format: 'uuid' }, revoked: { const: true } },
              },
            },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/tokens/{tokenId}/rotate': {
      post: {
        operationId: 'rotateOperatorPublicToken',
        tags: ['Operator Runtime'],
        summary: 'Rotate a public runtime token and return the new secret once.',
        parameters: [appIdParameter, tokenIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/OperatorPublicTokenCreateRequest' }, undefined, false),
        responses: {
          '201': success('Public runtime token rotated.', envelope({
            type: 'object',
            required: ['token', 'revoked_token_id'],
            properties: {
              token: { $ref: '#/components/schemas/CreatedOperatorPublicToken' },
              revoked_token_id: { type: 'string', format: 'uuid' },
            },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/origins': {
      get: {
        operationId: 'listOperatorAllowedOrigins',
        tags: ['Operator Runtime'],
        summary: 'List CORS origins allowed to call the public runtime.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        responses: {
          '200': success('Allowed origins.', envelope({
            type: 'object',
            required: ['origins'],
            properties: {
              origins: { type: 'array', items: { $ref: '#/components/schemas/OperatorAllowedOrigin' } },
            },
          })),
          ...commonErrors,
        },
      },
      post: {
        operationId: 'addOperatorAllowedOrigin',
        tags: ['Operator Runtime'],
        summary: 'Allow a public runtime CORS origin.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/OperatorAllowedOriginCreateRequest' }),
        responses: {
          '201': success('Allowed origin added.', envelope({
            type: 'object',
            required: ['origin'],
            properties: { origin: { $ref: '#/components/schemas/OperatorAllowedOrigin' } },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/origins/{originId}': {
      delete: {
        operationId: 'removeOperatorAllowedOrigin',
        tags: ['Operator Runtime'],
        summary: 'Remove a public runtime CORS origin.',
        parameters: [appIdParameter, originIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        responses: {
          '200': success('Allowed origin removed.', envelope({
            type: 'object',
            required: ['origin'],
            properties: {
              origin: {
                type: 'object',
                required: ['id', 'removed'],
                properties: { id: { type: 'string', format: 'uuid' }, removed: { const: true } },
              },
            },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/agentops/feed': {
      get: {
        operationId: 'listOperatorAgentOpsFeed',
        tags: ['Operator Runtime'],
        summary: 'List app-scoped AgentOps feed events.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        responses: {
          '200': success('AgentOps feed.', envelope({
            type: 'object',
            required: ['feed'],
            properties: {
              feed: { type: 'array', items: { $ref: '#/components/schemas/AgentOpsFeedItem' } },
            },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/agents/{agentId}/control': {
      post: {
        operationId: 'controlOperatorAgent',
        tags: ['Operator Runtime'],
        summary: 'Send a scoped control action to one app agent.',
        parameters: [appIdParameter, agentIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/AgentControlRequest' }),
        responses: {
          '202': success('Control action accepted.', envelope({
            type: 'object',
            required: ['control'],
            properties: { control: { type: 'object', additionalProperties: true } },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/teams/run': {
      post: {
        operationId: 'runOperatorTeam',
        tags: ['Operator Runtime'],
        summary: 'Queue an app-scoped team run.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/AppTeamRunRequest' }),
        responses: {
          '202': success('Team run queued.', envelope({
            type: 'object',
            required: ['team_run'],
            properties: { team_run: { $ref: '#/components/schemas/QueuedRunResult' } },
          })),
          ...commonErrors,
        },
      },
    },
    '/operator/apps/{appId}/workflows/run': {
      post: {
        operationId: 'runOperatorWorkflow',
        tags: ['Operator Runtime'],
        summary: 'Queue an app-scoped workflow run.',
        parameters: [appIdParameter, orgIdParameter],
        security: [{ lucidSession: [] }],
        requestBody: jsonBody({ $ref: '#/components/schemas/AppWorkflowRunRequest' }),
        responses: {
          '202': success('Workflow run queued.', envelope({
            type: 'object',
            required: ['workflow_run'],
            properties: { workflow_run: { $ref: '#/components/schemas/PublicActionResult' } },
          })),
          ...commonErrors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      publicAppToken: {
        type: 'http',
        scheme: 'bearer',
        description: 'Optional app-scoped public runtime token.',
      },
      lucidSession: {
        type: 'apiKey',
        in: 'cookie',
        name: 'lucid_session',
      },
    },
    schemas: {
      ApiSuccessEnvelope: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'object' },
          meta: { $ref: '#/components/schemas/RequestMeta' },
        },
      },
      RequestMeta: {
        type: 'object',
        required: ['request_id', 'app_runtime_api_version'],
        properties: {
          request_id: { type: 'string' },
          app_runtime_api_version: { const: 'v1' },
          next_cursor: { type: ['string', 'null'] },
          has_more: { type: 'boolean' },
          agentops_trace_id: { type: ['string', 'null'] },
        },
      },
      ApiErrorEnvelope: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message', 'request_id', 'retryable'],
            properties: {
              code: { type: 'string' },
              message: { type: 'string' },
              details: true,
              request_id: { type: 'string' },
              retryable: { type: 'boolean' },
            },
          },
        },
      },
      AppDiscoveryManifest: {
        type: 'object',
        required: ['schema_version', 'generated_at', 'app', 'runtime', 'protocols'],
        properties: {
          schema_version: { const: '1.0' },
          generated_at: { type: 'string', format: 'date-time' },
          app: {
            type: 'object',
            required: ['id', 'slug', 'name', 'status', 'visibility'],
            properties: {
              id: { type: 'string' },
              slug: { type: 'string' },
              name: { type: 'string' },
              description: { type: ['string', 'null'] },
              status: { enum: ['active', 'paused', 'maintenance', 'setup_required'] },
              visibility: { enum: ['unlisted', 'public'] },
            },
          },
          runtime: {
            type: 'object',
            required: ['api_version', 'openapi_url', 'public_base_path', 'endpoints'],
            properties: {
              api_version: { const: 'v1' },
              openapi_url: { type: 'string' },
              public_base_path: { type: 'string' },
              endpoints: { type: 'object', additionalProperties: { type: 'string' } },
            },
          },
          protocols: {
            type: 'object',
            additionalProperties: true,
            description: 'MCP and A2A descriptor metadata. Descriptor-only until a concrete protocol bridge is enabled.',
          },
        },
      },
      OperatorDiscoveryPatchRequest: {
        type: 'object',
        required: ['discovery_metadata'],
        properties: {
          discovery_metadata: {
            type: 'object',
            required: ['schema_version', 'protocols', 'mcp', 'a2a'],
            properties: {
              schema_version: { type: 'string' },
              protocols: { type: 'array', items: { enum: ['mcp', 'a2a'] } },
              mcp: { type: 'array', items: { type: 'object', additionalProperties: true } },
              a2a: { type: 'array', items: { type: 'object', additionalProperties: true } },
            },
          },
        },
      },
      PublicAppConfig: {
        type: 'object',
        required: ['app_id', 'slug', 'name', 'status', 'visibility', 'capabilities', 'theme', 'public_endpoints', 'commerce', 'consent'],
        properties: {
          app_id: { type: 'string', format: 'uuid' },
          slug: { type: 'string' },
          name: { type: 'string' },
          description: { type: ['string', 'null'] },
          status: { enum: ['active', 'paused', 'maintenance', 'setup_required'] },
          visibility: { enum: ['unlisted', 'public'] },
          capabilities: {
            type: 'array',
            items: { enum: ['chat', 'lead', 'feedback', 'status', 'uploads', 'public_actions', 'paid_actions'] },
          },
          theme: { type: 'object', additionalProperties: true },
          public_endpoints: { type: 'object', additionalProperties: { type: 'string' } },
          commerce: { $ref: '#/components/schemas/PublicAppCommerce' },
          consent: { $ref: '#/components/schemas/PublicConsent' },
        },
      },
      PublicActionCommerceAmount: {
        type: 'object',
        required: ['amount', 'currency'],
        properties: {
          amount: { type: 'integer', minimum: 1, description: 'Minor-unit amount, for example cents for USD.' },
          currency: { type: 'string', minLength: 3, maxLength: 12 },
        },
      },
      PublicActionCommerceConfig: {
        type: 'object',
        required: ['mode', 'resource_type', 'refund_policy'],
        properties: {
          mode: { enum: ['off', 'shadow', 'enforce'] },
          amount: { $ref: '#/components/schemas/PublicActionCommerceAmount' },
          provider: { type: 'string', maxLength: 120 },
          rail: { type: 'string', maxLength: 120 },
          resource_type: { enum: ['generated_app_action', 'generated_app_api', 'mcp_resource'] },
          resource_id: { type: 'string', maxLength: 240 },
          label: { type: 'string', maxLength: 120 },
          description: { type: 'string', maxLength: 500 },
          free_quota_per_session: { type: 'integer', minimum: 0, maximum: 1000 },
          refund_policy: { enum: ['none', 'manual_review', 'provider_supported'] },
        },
      },
      PublicAppCommerce: {
        type: 'object',
        required: ['paid_actions'],
        properties: {
          paid_actions: {
            type: 'object',
            additionalProperties: { $ref: '#/components/schemas/PublicActionCommerceConfig' },
          },
        },
      },
      PublicConsent: {
        type: 'object',
        properties: {
          privacy_url: { type: 'string', format: 'uri' },
          terms_url: { type: 'string', format: 'uri' },
          transcript_retention_days: { type: 'integer', minimum: 0 },
        },
      },
      VisitorSessionCreateRequest: {
        type: 'object',
        properties: {
          external_session_id: { type: 'string', minLength: 1, maxLength: 160 },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      VisitorSession: {
        type: 'object',
        required: ['id', 'external_session_id', 'expires_at'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          external_session_id: { type: 'string' },
          expires_at: { type: 'string', format: 'date-time' },
        },
      },
      PublicChatMessage: {
        type: 'object',
        required: ['role', 'content'],
        properties: {
          role: { enum: ['user', 'assistant'] },
          content: { type: 'string', minLength: 1, maxLength: 20000 },
        },
      },
      PublicChatRequest: {
        type: 'object',
        required: ['messages'],
        properties: {
          visitor_session_id: { type: 'string', format: 'uuid' },
          messages: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: { $ref: '#/components/schemas/PublicChatMessage' },
          },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      PublicChatResponse: {
        type: 'object',
        required: ['agentops_trace_id', 'status'],
        properties: {
          conversation_id: { type: 'string', format: 'uuid' },
          agentops_trace_id: { type: 'string' },
          status: { enum: ['completed', 'accepted', 'streaming', 'queued', 'setup_required'] },
          message: { $ref: '#/components/schemas/PublicChatMessage' },
        },
      },
      PublicLeadRequest: {
        type: 'object',
        properties: {
          visitor_session_id: { type: 'string', format: 'uuid' },
          name: { type: 'string', maxLength: 160 },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', maxLength: 80 },
          company: { type: 'string', maxLength: 160 },
          message: { type: 'string', maxLength: 5000 },
          fields: { type: 'object', additionalProperties: true },
        },
      },
      PublicLead: {
        type: 'object',
        required: ['id', 'status'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { enum: ['received', 'routed', 'requires_setup'] },
        },
      },
      PublicFeedbackRequest: {
        type: 'object',
        properties: {
          visitor_session_id: { type: 'string', format: 'uuid' },
          agentops_trace_id: { type: 'string' },
          rating: { enum: ['up', 'down'] },
          report_type: { enum: ['unsafe', 'incorrect', 'unhelpful', 'other'] },
          comment: { type: 'string', maxLength: 2000 },
        },
      },
      PublicActionRequest: {
        type: 'object',
        properties: {
          visitor_session_id: { type: 'string', format: 'uuid' },
          input: { type: 'object', additionalProperties: true },
          idempotency_key: { type: 'string', maxLength: 160 },
        },
      },
      PublicActionResult: {
        type: 'object',
        required: ['action', 'status'],
        properties: {
          action: { type: 'string' },
          status: { enum: ['accepted', 'completed', 'queued', 'setup_required'] },
          run_id: { type: 'string', format: 'uuid' },
          result: true,
          commerce: {
            type: 'object',
            required: ['required', 'status'],
            properties: {
              required: { type: 'boolean' },
              status: { enum: ['not_required', 'shadow', 'proof_claimed'] },
              provider: { type: 'string', maxLength: 120 },
              rail: { type: 'string', maxLength: 120 },
              challenge_id: { type: 'string', format: 'uuid' },
              resource_type: { type: 'string', maxLength: 80 },
              resource_id: { type: 'string', maxLength: 240 },
            },
          },
        },
      },
      MachinePaymentRequired: {
        type: 'object',
        required: ['error', 'request_id'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { const: 'payment_required' },
              message: { type: 'string' },
            },
          },
          challenge: {
            type: 'object',
            additionalProperties: true,
            description: 'Provider-neutral machine-payment challenge produced by Agent Commerce.',
          },
          request_id: { type: 'string' },
        },
      },
      OperatorUsageMetric: {
        type: 'object',
        required: ['bucket_start', 'current', 'limit', 'remaining', 'percent'],
        properties: {
          bucket_start: { type: 'string', format: 'date-time' },
          current: { type: 'integer', minimum: 0 },
          limit: { type: ['integer', 'null'], minimum: 0 },
          remaining: { type: ['integer', 'null'], minimum: 0 },
          percent: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
        },
      },
      OperatorUsage: {
        type: 'object',
        required: ['daily_public_requests', 'monthly_chat_cost_cents', 'monthly_chat_completions'],
        properties: {
          daily_public_requests: { $ref: '#/components/schemas/OperatorUsageMetric' },
          monthly_chat_cost_cents: { $ref: '#/components/schemas/OperatorUsageMetric' },
          monthly_chat_completions: {
            type: 'object',
            required: ['bucket_start', 'current'],
            properties: {
              bucket_start: { type: 'string', format: 'date-time' },
              current: { type: 'integer', minimum: 0 },
            },
          },
        },
      },
      OperatorAbuseMetric: {
        type: 'object',
        required: ['current_24h', 'last_event_at'],
        properties: {
          current_24h: { type: 'integer', minimum: 0 },
          last_event_at: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      OperatorAbuseSummary: {
        type: 'object',
        required: [
          'status',
          'window_start',
          'denied_origins_24h',
          'rate_limited_24h',
          'cost_cap_hits_24h',
          'unsafe_feedback_24h',
          'blocked_public_runtime_24h',
          'recommended_actions',
        ],
        properties: {
          status: { enum: ['clear', 'watch', 'blocked'] },
          window_start: { type: 'string', format: 'date-time' },
          denied_origins_24h: { $ref: '#/components/schemas/OperatorAbuseMetric' },
          rate_limited_24h: { $ref: '#/components/schemas/OperatorAbuseMetric' },
          cost_cap_hits_24h: { $ref: '#/components/schemas/OperatorAbuseMetric' },
          unsafe_feedback_24h: { $ref: '#/components/schemas/OperatorAbuseMetric' },
          blocked_public_runtime_24h: { type: 'integer', minimum: 0 },
          recommended_actions: { type: 'array', items: { type: 'string' } },
        },
      },
      OperatorLaunchReadiness: {
        type: 'object',
        required: ['status', 'blockers', 'warnings'],
        properties: {
          status: { enum: ['ready', 'warning', 'blocked'] },
          blockers: { type: 'array', items: { $ref: '#/components/schemas/OperatorLaunchReadinessIssue' } },
          warnings: { type: 'array', items: { $ref: '#/components/schemas/OperatorLaunchReadinessIssue' } },
        },
      },
      OperatorLaunchReadinessIssue: {
        type: 'object',
        required: ['code', 'label', 'detail'],
        properties: {
          code: { type: 'string' },
          label: { type: 'string' },
          detail: { type: 'string' },
        },
      },
      OperatorPublicTokenCreateRequest: {
        type: 'object',
        properties: {
          label: { type: 'string', maxLength: 120 },
          capabilities: { type: 'array', items: { type: 'string', maxLength: 80 } },
          expires_at: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      OperatorPublicToken: {
        type: 'object',
        required: ['id', 'label', 'token_preview', 'capabilities', 'expires_at', 'revoked_at', 'created_at'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          label: { type: ['string', 'null'] },
          token_preview: { type: ['string', 'null'] },
          capabilities: { type: 'array', items: { type: 'string' } },
          expires_at: { type: ['string', 'null'], format: 'date-time' },
          revoked_at: { type: ['string', 'null'], format: 'date-time' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      CreatedOperatorPublicToken: {
        type: 'object',
        required: ['id', 'token', 'token_preview', 'capabilities', 'expires_at'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          token: { type: 'string' },
          token_preview: { type: 'string' },
          capabilities: { type: 'array', items: { type: 'string' } },
          expires_at: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      OperatorAllowedOriginCreateRequest: {
        type: 'object',
        required: ['origin'],
        properties: {
          origin: { type: 'string', maxLength: 500 },
        },
      },
      OperatorAllowedOrigin: {
        type: 'object',
        required: ['id', 'origin', 'source', 'created_by', 'created_at'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          origin: { type: 'string' },
          source: { type: 'string' },
          created_by: { type: ['string', 'null'], format: 'uuid' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      OperatorSummary: {
        type: 'object',
        required: ['app', 'setup', 'metrics', 'health'],
        properties: {
          app: {
            type: 'object',
            required: ['id', 'name', 'slug', 'status', 'visibility'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
              status: { type: 'string' },
              visibility: { type: 'string' },
            },
          },
          setup: {
            type: 'object',
            required: ['complete', 'missing_integrations', 'required_actions'],
            properties: {
              complete: { type: 'boolean' },
              missing_integrations: { type: 'array', items: { type: 'string' } },
              required_actions: { type: 'array', items: { type: 'string' } },
            },
          },
          metrics: { type: 'object', additionalProperties: true },
          health: {
            type: 'object',
            required: ['status', 'active_incidents'],
            properties: {
              status: { enum: ['healthy', 'degraded', 'unhealthy', 'unknown'] },
              active_incidents: { type: 'integer', minimum: 0 },
            },
          },
          launch_readiness: { $ref: '#/components/schemas/OperatorLaunchReadiness' },
          abuse: { $ref: '#/components/schemas/OperatorAbuseSummary' },
        },
      },
      OperatorAppSettingsPatch: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          slug: { type: 'string', pattern: '^[a-z0-9-]+$', minLength: 1, maxLength: 120 },
          visibility: { enum: ['private', 'unlisted', 'public'] },
          theme: { type: 'object', additionalProperties: true },
          limits: { type: 'object', additionalProperties: true },
          consent: { $ref: '#/components/schemas/PublicConsent' },
          commerce: { $ref: '#/components/schemas/PublicAppCommerce' },
        },
      },
      OperatorLifecycleRequest: {
        type: 'object',
        properties: { note: { type: 'string', maxLength: 2000 } },
      },
      OperatorResumeRequest: {
        allOf: [
          { $ref: '#/components/schemas/OperatorLifecycleRequest' },
          {
            type: 'object',
            properties: { status: { enum: ['preview', 'active'] } },
          },
        ],
      },
      AppIntegrationStatus: {
        type: 'object',
        required: ['provider', 'status', 'required'],
        properties: {
          provider: { type: 'string' },
          status: { enum: ['connected', 'missing', 'requires_action'] },
          required: { type: 'boolean' },
        },
      },
      AgentOpsFeedItem: {
        type: 'object',
        required: ['id', 'type', 'severity', 'message', 'created_at'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          severity: { enum: ['debug', 'info', 'warning', 'error'] },
          message: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
          metadata: { type: 'object', additionalProperties: true },
        },
      },
      AgentControlRequest: {
        type: 'object',
        required: ['action'],
        properties: {
          action: { enum: ['pause', 'resume', 'kill', 'escalate', 'nudge'] },
          message: { type: 'string', maxLength: 2000 },
        },
      },
      AppTeamRunRequest: {
        type: 'object',
        properties: {
          teamKey: { type: 'string', maxLength: 80 },
          input: { type: 'object', additionalProperties: true },
          idempotencyKey: { type: 'string', maxLength: 160 },
        },
      },
      AppWorkflowRunRequest: {
        type: 'object',
        required: ['workflowKey'],
        properties: {
          workflowKey: { type: 'string', minLength: 1, maxLength: 80 },
          input: { type: 'object', additionalProperties: true },
          idempotencyKey: { type: 'string', maxLength: 160 },
        },
      },
      QueuedRunResult: {
        type: 'object',
        required: ['status'],
        properties: {
          status: { enum: ['queued', 'accepted'] },
          run_id: { type: ['string', 'null'], format: 'uuid' },
        },
      },
    },
  },
} as const

interface OpenApiLike {
  openapi?: unknown
  paths?: Record<string, Record<string, unknown>>
  components?: {
    securitySchemes?: Record<string, unknown>
    schemas?: Record<string, unknown>
  }
}

export function validateAppRuntimeOpenApiContract(contract: OpenApiLike = APP_RUNTIME_OPENAPI): string[] {
  const errors: string[] = []
  const operationIds = new Set<string>()

  if (contract.openapi !== '3.1.0') {
    errors.push('App Runtime OpenAPI contract must use OpenAPI 3.1.0.')
  }

  if (!contract.components?.securitySchemes?.publicAppToken) {
    errors.push('Missing publicAppToken security scheme.')
  }

  if (!contract.components?.securitySchemes?.lucidSession) {
    errors.push('Missing lucidSession security scheme.')
  }

  if (!contract.components?.schemas?.ApiErrorEnvelope) {
    errors.push('Missing ApiErrorEnvelope schema.')
  }

  for (const endpoint of APP_RUNTIME_ENDPOINTS) {
    const operation = contract.paths?.[endpoint.path]?.[endpoint.method] as {
      operationId?: unknown
      responses?: Record<string, unknown>
      security?: unknown
    } | undefined

    if (!operation) {
      errors.push(`Missing ${endpoint.method.toUpperCase()} ${endpoint.path}.`)
      continue
    }

    if (operation.operationId !== endpoint.operationId) {
      errors.push(`Operation id mismatch for ${endpoint.method.toUpperCase()} ${endpoint.path}.`)
    }

    if (typeof operation.operationId === 'string') {
      if (operationIds.has(operation.operationId)) {
        errors.push(`Duplicate operationId "${operation.operationId}".`)
      }
      operationIds.add(operation.operationId)
    }

    if (!operation.responses || Object.keys(operation.responses).length === 0) {
      errors.push(`Missing responses for ${endpoint.method.toUpperCase()} ${endpoint.path}.`)
    }

    if (endpoint.audience === 'operator' && !Array.isArray(operation.security)) {
      errors.push(`Missing operator security for ${endpoint.method.toUpperCase()} ${endpoint.path}.`)
    }
  }

  for (const [path, pathItem] of Object.entries(contract.paths ?? {})) {
    for (const method of Object.keys(pathItem)) {
      const isKnown = APP_RUNTIME_ENDPOINTS.some((endpoint) => endpoint.path === path && endpoint.method === method)
      if (!isKnown) {
        errors.push(`Unexpected OpenAPI operation ${method.toUpperCase()} ${path}.`)
      }
    }
  }

  return errors
}

export function appRuntimeEndpointInventoryMarkdown(endpoints: readonly AppRuntimeEndpoint[] = APP_RUNTIME_ENDPOINTS): string {
  const lines = [
    '# App Runtime API Inventory',
    '',
    'Generated from `src/lib/app-service/public-api-contract.ts`.',
    '',
    '| Method | Path | Operation | Audience |',
    '| --- | --- | --- | --- |',
    ...endpoints.map((endpoint) => (
      `| ${endpoint.method.toUpperCase()} | \`${endpoint.path}\` | \`${endpoint.operationId}\` | ${endpoint.audience} |`
    )),
    '',
  ]

  return `${lines.join('\n')}\n`
}
