import { requireServerAuth } from '@/lib/auth/server-utils';
import { createClient } from '@supabase/supabase-js';
import { notFound } from 'next/navigation';
import { WorkflowEditor } from './workflow-editor';

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export default async function WorkflowEditorPage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string; workflowId: string }>;
}) {
  // Await params (Next.js 15 requirement)
  const { 'workspace-slug': workspaceSlug, workflowId } = await params;
  
  // Server-side auth
  const { user } = await requireServerAuth();
  
  // Fetch workflow server-side
  const { data: workflow, error } = await getSupabase()
    .from('workflows')
    .select('id, name, description, nodes, edges, pin_data, settings, status, created_at, updated_at')
    .eq('id', workflowId)
    .eq('user_id', user.id) // Must be owner
    .single();

  if (error || !workflow) {
    notFound();
  }

  // Pass to client component
  return (
    <WorkflowEditor
      initialWorkflow={workflow}
      workspaceSlug={workspaceSlug}
      user={user}
    />
  );
}
