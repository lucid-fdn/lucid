import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { WorkflowsClient } from './workflows-client';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function WorkflowsPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>;
}) {
  // Await params (Next.js 15 requirement)
  const { 'workspace-slug': workspaceSlug } = await params;
  
  // Server-side auth (redirects to /login if not authenticated)
  const { user } = await requireServerAuth();
  
  // Server-side data fetch
  const { data: workflows, error } = await getSupabase()
    .from('workflows')
    .select('id, name, description, nodes, edges, status, created_at, updated_at')
    .eq('user_id', user.id)
    .is('organization_id', null) // Personal workflows only for now
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('[workflows] Error fetching workflows:', error);
  }

  // Pass to client component
  return (
    <WorkflowsClient
      initialWorkflows={workflows || []}
      workspaceSlug={workspaceSlug}
      user={user}
    />
  );
}
