import { AIChatInterface } from '@/components/ai-chat/ai-chat-interface';
import { buildSystemPrompt } from '@/lib/ai/context';
import { fetchModels } from '@/lib/ai/models';
import { getBYOKModels } from '@/lib/ai/byok-models';
import { getWorkspaceWithAccess } from '@/lib/workspace';
import { getUserId } from '@/lib/auth/server-utils';
import { getAssistants } from '@/lib/db';
import { notFound, redirect } from 'next/navigation';

interface ChatPageProps {
  params: Promise<{ 'workspace-slug': string }>;
}

/**
 * AI Chat Page
 * Streaming chat interface using Vercel AI SDK and Lucid-L2 backend
 * Route: /[workspace-slug]/ai/chat
 */
export default async function AIChatPage({ params }: ChatPageProps) {
  const { 'workspace-slug': workspaceSlug } = await params;
  
  // Auth check
  const userId = await getUserId();
  if (!userId) redirect('/login');
  
  // Get workspace (already validated by parent layout, but we need the data)
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId);
  
  if (!workspace) {
    notFound();
  }

  // Prefetch models + assistants in parallel
  const [platformModels, byokModels, assistants] = await Promise.all([
    fetchModels().catch(() => []),
    getBYOKModels(workspace.id).catch(() => []),
    getAssistants(workspace.id).catch(() => []),
  ])

  const platformIds = new Set(platformModels.map(m => m.id))
  const allModels = [...platformModels, ...byokModels.filter(m => !platformIds.has(m.id))]

  // Group by provider for ModelSelector
  type FetchedModel = (typeof allModels)[number]
  const grouped: Record<string, FetchedModel[]> = {}
  for (const model of allModels) {
    const p = model.provider || 'Other'
    if (!grouped[p]) grouped[p] = []
    grouped[p].push(model)
  }
  const modelGroups = Object.entries(grouped).map(([provider, providerModels]) => ({
    provider,
    models: providerModels,
  }))

  // Build system prompt with workspace context
  const systemPrompt = buildSystemPrompt(
    {
      orgName: workspace.name,
      orgSlug: workspace.slug,
      projectName: 'Default',
      envName: 'Production',
      userRole: workspace.role || 'member',
      planName: workspace.plan_name || 'Free',
    },
    {
      capabilities: [
        'Search the marketplace for models, datasets, and agents',
        'Suggest and generate AI workflows',
        'Access the organization knowledge base (when RAG is enabled)',
      ],
    },
  );

  return (
    <div className="h-[calc(100vh-64px)]">
      <AIChatInterface
        orgId={workspace.id}
        systemPrompt={systemPrompt}
        initialModels={modelGroups}
        initialAssistants={assistants
          .filter((a) => a.is_active)
          .map((a) => ({ id: a.id, name: a.name }))}
      />
    </div>
  );
}

export const metadata = {
  title: 'AI Chat | Lucid',
  description: 'Chat with AI using 100+ models',
};
