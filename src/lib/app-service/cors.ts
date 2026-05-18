import 'server-only'

import { supabase } from '@/lib/db/client'
export { withGeneratedAppCorsHeaders } from './cors-core'

export async function isGeneratedAppOriginAllowed(
  appDeploymentId: string,
  origin: string | null,
): Promise<boolean> {
  if (!origin) return false

  const { data, error } = await supabase
    .from('app_allowed_origins')
    .select('id')
    .eq('app_deployment_id', appDeploymentId)
    .eq('origin', origin)
    .maybeSingle()

  if (error) return false
  return Boolean(data)
}
