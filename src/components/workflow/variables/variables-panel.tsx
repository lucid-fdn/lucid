'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, MoreVertical, Trash2, Edit2, Eye, EyeOff, Copy } from 'lucide-react';
import { CreateVariableDialog } from './create-variable-dialog';
import { EditVariableDialog } from './edit-variable-dialog';
import { deleteVariableAction } from '@/lib/forms/actions';
import { useToast } from '@/hooks/use-toast';
import { notificationCopy } from '@/lib/notifications/copy'
import { summarizeError } from '@/lib/logging/safe-log'

interface Variable {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'secret';
  is_secret: boolean;
  description: string | null;
  created_at: string;
}

interface VariablesPanelProps {
  workflowId: string;
}

export function VariablesPanel({ workflowId }: VariablesPanelProps) {
  const toast = useToast();
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingVariable, setEditingVariable] = useState<Variable | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchVariables();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [workflowId]);

  const fetchVariables = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/workflows/${workflowId}/variables`);
      const data = await response.json();
      if (data.success) {
        setVariables(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch variables:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (variableId: string) => {
    if (!confirm('Delete this variable? This action cannot be undone.')) return;
    
    try {
      const result = await deleteVariableAction(workflowId, variableId);
      
      if (result.success) {
        toast.success('Variable deleted successfully');
        setVariables(prev => prev.filter(v => v.id !== variableId));
      } else {
        toast.error(result.error || 'Failed to delete variable');
      }
    } catch (error) {
      console.error('Failed to delete variable:', error);
      toast.error(notificationCopy.common.unexpectedError);
    }
  };

  const handleCopyUsage = (key: string) => {
    const usage = `{{$vars.${key}}}`;
    navigator.clipboard.writeText(usage);
    toast.success(notificationCopy.common.copiedToClipboard);
  };

  const toggleSecretVisibility = async (variableId: string) => {
    if (revealedSecrets.has(variableId)) {
      // Hide
      setRevealedSecrets(prev => {
        const next = new Set(prev);
        next.delete(variableId);
        return next;
      });
    } else {
      // Reveal - fetch actual value
      try {
        const response = await fetch(`/api/workflows/${workflowId}/variables/${variableId}`);
        const data = await response.json();
        if (data.success) {
          // Update variable with real value
          setVariables(prev => prev.map(v => 
            v.id === variableId ? { ...v, value: data.data.value } : v
          ));
          setRevealedSecrets(prev => new Set(prev).add(variableId));
        }
      } catch (error) {
        console.error('Failed to reveal secret:', summarizeError(error));
      }
    }
  };

  const getTypeBadge = (type: string) => {
    const colors = {
      string: 'default',
      number: 'secondary',
      boolean: 'outline',
      secret: 'destructive',
    } as const;

    return (
      <Badge variant={colors[type as keyof typeof colors] || 'default'} className="text-xs">
        {type}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Variables</h3>
          <p className="text-sm text-muted-foreground">
            Reusable values accessible as {'{{$vars.key}}'}
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Variable
        </Button>
      </div>

      {/* Variables List */}
      {loading ? (
        <Card className="p-6 text-center text-muted-foreground">
          Loading variables...
        </Card>
      ) : variables.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground mb-4">No variables created yet</p>
          <Button onClick={() => setShowCreateDialog(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create your first variable
          </Button>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-3">
            {variables.map((variable) => (
              <Card key={variable.id} className="p-4">
                <div className="space-y-3">
                  {/* Header Row */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="font-mono text-sm font-semibold">
                          {variable.key}
                        </code>
                        {getTypeBadge(variable.type)}
                      </div>
                      {variable.description && (
                        <p className="text-sm text-muted-foreground">
                          {variable.description}
                        </p>
                      )}
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditingVariable(variable)}>
                          <Edit2 className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleCopyUsage(variable.key)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Usage
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDelete(variable.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <Separator />

                  {/* Value Display */}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Value</p>
                    <div className="flex items-center gap-2">
                      {variable.is_secret ? (
                        <>
                          <code className="flex-1 text-sm bg-muted px-2 py-1 rounded font-mono">
                            {revealedSecrets.has(variable.id) ? variable.value : '••••••••'}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleSecretVisibility(variable.id)}
                          >
                            {revealedSecrets.has(variable.id) ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      ) : (
                        <code className="flex-1 text-sm bg-muted px-2 py-1 rounded font-mono">
                          {variable.value}
                        </code>
                      )}
                    </div>
                  </div>

                  {/* Usage Example */}
                  <div className="bg-muted/50 p-2 rounded">
                    <p className="text-xs text-muted-foreground mb-1">Usage in nodes:</p>
                    <code className="text-xs font-mono">
                      {`{{$vars.${variable.key}}}`}
                    </code>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Create Variable Dialog */}
      <CreateVariableDialog
        workflowId={workflowId}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onVariableCreated={fetchVariables}
      />

      {/* Edit Variable Dialog */}
      {editingVariable && (
        <EditVariableDialog
          workflowId={workflowId}
          variable={editingVariable}
          open={!!editingVariable}
          onOpenChange={(open) => !open && setEditingVariable(null)}
          onVariableUpdated={fetchVariables}
        />
      )}
    </div>
  );
}
