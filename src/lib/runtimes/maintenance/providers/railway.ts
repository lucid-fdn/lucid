import 'server-only'

import type { DedicatedRuntime } from '@/lib/mission-control/types'

const RAILWAY_GRAPHQL_URL = 'https://backboard.railway.app/graphql/v2'

interface RailwayGraphqlResponse<T> {
  data?: T
  errors?: Array<{ message?: string }>
}

interface RailwayServiceMetaResponse {
  service: {
    id: string
    project: {
      id: string
      environments: {
        edges: Array<{
          node: {
            id: string
            name: string
          }
        }>
      }
    } | null
  } | null
}

interface RailwayProjectServicesResponse {
  project: {
    id: string
    environments: {
      edges: Array<{
        node: {
          id: string
          name: string
        }
      }>
    }
    services: {
      edges: Array<{
        node: {
          id: string
          name: string
        }
      }>
    }
  } | null
}

interface RailwayDeployResponse {
  serviceInstanceDeployV2: string | null
}

export interface RailwaySourceDeployResult {
  serviceId: string
  projectId: string | null
  environmentId: string | null
  image: string
  deploymentId: string | null
  status: string | null
  url: string | null
}

async function railwayGraphql<TData>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<TData> {
  const response = await fetch(RAILWAY_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Railway API returned ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  const payload = (await response.json()) as RailwayGraphqlResponse<TData>
  if (payload.errors?.length) {
    throw new Error(payload.errors[0]?.message || 'Railway GraphQL error')
  }
  if (!payload.data) {
    throw new Error('Railway GraphQL returned no data')
  }
  return payload.data
}

function pickRailwayEnvironmentId(
  environments: Array<{ node: { id: string; name: string } }> | undefined,
): string | null {
  if (!environments?.length) return null
  const production = environments.find((edge) => edge.node.name.toLowerCase() === 'production')
  return production?.node.id ?? environments[0]?.node.id ?? null
}

function getRailwayProjectId(): string | null {
  return (
    process.env.RAILWAY_AGENT_DEPLOYMENT_PROJECT_ID ||
    process.env.RAILWAY_RUNTIME_PROJECT_ID ||
    process.env.RAILWAY_PROJECT_ID ||
    null
  )
}

function deriveRailwayServiceName(runtime: DedicatedRuntime): string | null {
  if (!runtime.l2PassportId || !runtime.l2PassportId.startsWith('passport_')) return null
  return `agent-passport_${runtime.l2PassportId.slice('passport_'.length, 'passport_'.length + 11)}`
}

async function resolveRailwayService(
  token: string,
  runtime: DedicatedRuntime,
): Promise<{ id: string; projectId: string | null; environmentId: string | null } | null> {
  if (runtime.l2DeploymentId) {
    const serviceMeta = await railwayGraphql<RailwayServiceMetaResponse>(
      token,
      `
        query RuntimeServiceMeta($id: String!) {
          service(id: $id) {
            id
            project {
              id
              environments {
                edges {
                  node {
                    id
                    name
                  }
                }
              }
            }
          }
        }
      `,
      { id: runtime.l2DeploymentId },
    )

    const service = serviceMeta.service
    if (service) {
      return {
        id: service.id,
        projectId: service.project?.id ?? null,
        environmentId: pickRailwayEnvironmentId(service.project?.environments?.edges),
      }
    }
  }

  const projectId = getRailwayProjectId()
  const serviceName = deriveRailwayServiceName(runtime)
  if (!projectId || !serviceName) return null

  const projectMeta = await railwayGraphql<RailwayProjectServicesResponse>(
    token,
    `
      query RuntimeProjectServices($projectId: String!) {
        project(id: $projectId) {
          id
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
          services {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `,
    { projectId },
  )

  const project = projectMeta.project
  if (!project) return null

  const service = project.services.edges.find((edge) => edge.node.name === serviceName)?.node
  if (!service) return null

  return {
    id: service.id,
    projectId: project.id,
    environmentId: pickRailwayEnvironmentId(project.environments.edges),
  }
}

export async function deployRailwayServiceFromCurrentSource(
  runtime: DedicatedRuntime,
  targetImageRef: string,
): Promise<RailwaySourceDeployResult | null> {
  const token = process.env.RAILWAY_API_TOKEN || process.env.RAILWAY_TOKEN || ''
  if (!token) return null
  if (runtime.provider !== 'railway') return null

  const service = await resolveRailwayService(token, runtime)
  if (!service) {
    throw new Error(`Railway service could not be resolved for runtime ${runtime.id}`)
  }

  const environmentId = service.environmentId
  if (!environmentId) {
    throw new Error(`Railway service ${service.id} has no environment to deploy into`)
  }

  await railwayGraphql<{ serviceInstanceUpdate: boolean | null }>(
    token,
    `
      mutation UpdateRuntimeServiceSource($serviceId: String!, $input: ServiceInstanceUpdateInput!) {
        serviceInstanceUpdate(serviceId: $serviceId, input: $input)
      }
    `,
    {
      serviceId: service.id,
      input: {
        source: {
          image: targetImageRef,
        },
      },
    },
  )

  const deploy = await railwayGraphql<RailwayDeployResponse>(
    token,
    `
      mutation DeployRuntimeServiceFromSource($serviceId: String!, $environmentId: String!) {
        serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId)
      }
    `,
    {
      serviceId: service.id,
      environmentId,
    },
  )

  return {
    serviceId: service.id,
    projectId: service.projectId,
    environmentId,
    image: targetImageRef,
    deploymentId: deploy.serviceInstanceDeployV2 ?? null,
    status: 'queued',
    url: runtime.deploymentUrl ?? null,
  }
}
