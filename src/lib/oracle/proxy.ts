import { ORACLE_API_URL, ORACLE_API_KEY } from './config'

export async function proxyToOracle(path: string, revalidate = 15): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (ORACLE_API_KEY) headers['x-api-key'] = ORACLE_API_KEY
  return fetch(`${ORACLE_API_URL}${path}`, { headers, next: { revalidate } })
}
