'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Workflow as WorkflowIcon, Play, Edit, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { CachedUser } from '@/lib/auth/cache';

interface Workflow {
  id: string;
  name: string;
  description: string | null;
  nodes: unknown[];
  edges: unknown[];
  status: string;
  created_at: string;
  updated_at: string;
}

interface WorkflowsClientProps {
  initialWorkflows: Workflow[];
  workspaceSlug: string;
  user: CachedUser;
}

export function WorkflowsClient({ initialWorkflows, workspaceSlug, user: _user }: WorkflowsClientProps) {
  const [workflows, setWorkflows] = useState<Workflow[]>(initialWorkflows);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  const createWorkflow = async () => {
    setCreating(true);

    // Optimistic update
    const tempWorkflow: Workflow = {
      id: 'temp-' + Date.now(),
      name: 'New Workflow',
      description: null,
      nodes: [],
      edges: [],
      status: 'draft',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setWorkflows((prev) => [tempWorkflow, ...prev]);

    try {
      const response = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Workflow',
          description: 'Start building your workflow',
          nodes: [],
          edges: [],
          pin_data: {},
          status: 'draft',
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to create workflow');
      }

      // Replace temp with real workflow
      setWorkflows((prev) =>
        prev.map((w) => (w.id === tempWorkflow.id ? result.data : w))
      );

      toast.success('Workflow created');

      // Navigate to editor
      router.push(`/${workspaceSlug}/workflows/${result.data.id}`);
    } catch (error) {
      // Rollback optimistic update
      setWorkflows((prev) => prev.filter((w) => w.id !== tempWorkflow.id));

      console.error('[workflows-client] Create error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create workflow'
      );
    } finally {
      setCreating(false);
    }
  };

  const deleteWorkflow = async (id: string) => {
    setDeleting(id);

    // Optimistic delete
    const original = workflows;
    setWorkflows((prev) => prev.filter((w) => w.id !== id));

    try {
      const response = await fetch(`/api/workflows/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete workflow');
      }

      toast.success('Workflow deleted');
    } catch (error) {
      // Rollback
      setWorkflows(original);

      console.error('[workflows-client] Delete error:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to delete workflow'
      );
    } finally {
      setDeleting(null);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="container mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">Workflows</h1>
          <p className="text-muted-foreground">
            Automate your processes with visual workflows
          </p>
        </div>

        <Button onClick={createWorkflow} disabled={creating} className="gap-2">
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New Workflow
        </Button>
      </div>

      {/* Workflows Grid */}
      {workflows.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {workflows.map((workflow) => (
            <Card
              key={workflow.id}
              className="hover:shadow-lg transition-shadow"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <WorkflowIcon className="h-8 w-8 text-primary" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      router.push(`/${workspaceSlug}/workflows/${workflow.id}`)
                    }
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
                <CardTitle>{workflow.name}</CardTitle>
                <CardDescription>
                  {workflow.description || 'No description'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Nodes:</span>
                    <span className="font-medium">
                      {workflow.nodes?.length || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Updated:</span>
                    <span className="font-medium">
                      {formatDate(workflow.updated_at)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className="font-medium capitalize">
                      {workflow.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={() =>
                      router.push(`/${workspaceSlug}/workflows/${workflow.id}`)
                    }
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Open
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={deleting === workflow.id}
                    onClick={() => deleteWorkflow(workflow.id)}
                  >
                    {deleting === workflow.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 min-h-[400px]">
          <WorkflowIcon className="h-16 w-16 text-muted-foreground mb-4" />
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">No workflows yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Get started by creating your first workflow
            </p>
            <Button
              onClick={createWorkflow}
              disabled={creating}
              className="gap-2"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create Workflow
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
