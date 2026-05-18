'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/animate-ui/primitives/radix/tooltip';
import { Plus, Copy, MoreVertical, Trash2, RefreshCw, ExternalLink, TestTube } from 'lucide-react';
import { CreateWebhookDialog } from './create-webhook-dialog';
import { WebhookLogs } from './webhook-logs';
import { 
  updateWebhookAction, 
  deleteWebhookAction, 
  regenerateWebhookApiKeyAction 
} from '@/lib/forms/actions';
import { useToast } from '@/hooks/use-toast';
import { notificationCopy } from '@/lib/notifications/copy'

interface Webhook {
  id: string;
  path: string;
  method: string;
  api_key: string;
  enabled: boolean;
  description: string | null;
  url?: string;
  created_at: string;
  success_count: number;
  error_count: number;
  last_triggered_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
}

interface WebhookAnalytics {
  overview: {
    totalCalls: number;
    successCalls: number;
    errorCalls: number;
    successRate: number;
    healthStatus: 'healthy' | 'warning' | 'error';
  };
  performance: {
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
  };
}

interface WebhookSettingsPanelProps {
  workflowId: string;
}

export function WebhookSettingsPanel({ workflowId }: WebhookSettingsPanelProps) {
  const toast = useToast();
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [analytics, setAnalytics] = useState<Record<string, WebhookAnalytics>>({});
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);

  useEffect(() => {
    fetchWebhooks();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [workflowId]);

  const fetchWebhooks = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/workflows/${workflowId}/webhooks`);
      const data = await response.json();
      if (data.success) {
        setWebhooks(data.data);
        // Fetch analytics for each webhook
        data.data.forEach((webhook: Webhook) => {
          fetchWebhookAnalytics(webhook.id);
        });
      }
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchWebhookAnalytics = async (webhookId: string) => {
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/webhooks/${webhookId}/analytics`
      );
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.log('[webhook-analytics] Endpoint not available yet');
        return;
      }
      
      const data = await response.json();
      if (data.success) {
        setAnalytics(prev => ({
          ...prev,
          [webhookId]: data.data,
        }));
      }
    } catch (error) {
      // Silently fail - analytics are optional
      console.log('[webhook-analytics] Not available:', error);
    }
  };

  const handleToggleEnabled = async (webhookId: string, enabled: boolean) => {
    try {
      const result = await updateWebhookAction(workflowId, webhookId, { enabled });
      
      if (result.success) {
        setWebhooks(prev => 
          prev.map(w => w.id === webhookId ? { ...w, enabled } : w)
        );
        toast.success(enabled ? 'Webhook enabled' : 'Webhook disabled');
      } else {
        toast.error(result.error || 'Failed to update webhook');
      }
    } catch (error) {
      console.error('Failed to toggle webhook:', error);
      toast.error(notificationCopy.common.unexpectedError);
    }
  };

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const handleRegenerateApiKey = async (webhookId: string) => {
    if (!confirm('Are you sure? This will invalidate the current API key.')) return;
    
    try {
      const result = await regenerateWebhookApiKeyAction(workflowId, webhookId);
      
      if (result.success) {
        toast.success('API key regenerated successfully');
        fetchWebhooks();
      } else {
        toast.error(result.error || 'Failed to regenerate API key');
      }
    } catch (error) {
      console.error('Failed to regenerate API key:', error);
      toast.error(notificationCopy.common.unexpectedError);
    }
  };

  const handleDelete = async (webhookId: string) => {
    if (!confirm('Delete this webhook? This action cannot be undone.')) return;
    
    try {
      const result = await deleteWebhookAction(workflowId, webhookId);
      
      if (result.success) {
        toast.success('Webhook deleted successfully');
        setWebhooks(prev => prev.filter(w => w.id !== webhookId));
      } else {
        toast.error(result.error || 'Failed to delete webhook');
      }
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      toast.error(notificationCopy.common.unexpectedError);
    }
  };

  const handleTestWebhook = async (webhookId: string) => {
    setTestingWebhook(webhookId);
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/webhooks/${webhookId}/test`,
        { method: 'POST' }
      );
      
      // Check if response is JSON
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        toast.error('Test endpoint not configured yet. Please run the migration first.');
        setTestingWebhook(null);
        return;
      }
      
      const result = await response.json();
      
      if (result.success) {
        toast.success(`Test successful! Response: ${result.data.status}`);
        fetchWebhooks(); // Refresh to update stats
      } else {
        toast.error(result.error || 'Test failed');
      }
    } catch (error) {
      console.error('Failed to test webhook:', error);
      toast.error('Test feature requires database migration. Run migrations/012_webhook_system.sql');
    } finally {
      setTestingWebhook(null);
    }
  };

  const handleViewLogs = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setShowLogsDialog(true);
  };

  const _getHealthBadge = (webhook: Webhook) => {
    const stats = analytics[webhook.id];
    if (!stats) return null;

    const { healthStatus, successRate } = stats.overview;
    
    const variants = {
      healthy: 'default',
      warning: 'secondary',
      error: 'destructive',
    } as const;

    return (
      <Badge variant={variants[healthStatus]}>
        {successRate}% success
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Webhooks</h3>
          <p className="text-sm text-muted-foreground">
            Trigger this workflow via HTTP requests
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Webhook
        </Button>
      </div>

      {/* Webhooks List */}
      {loading ? (
        <Card className="p-6 text-center text-muted-foreground">
          Loading webhooks...
        </Card>
      ) : webhooks.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="text-muted-foreground mb-4">No webhooks created yet</p>
          <Button onClick={() => setShowCreateDialog(true)} variant="outline">
            <Plus className="h-4 w-4 mr-2" />
            Create your first webhook
          </Button>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-3">
            {webhooks.map((webhook) => (
              <Card key={webhook.id} className="p-4">
                <div className="space-y-3">
                  {/* Header Row */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline">{webhook.method}</Badge>
                        <Badge variant={webhook.enabled ? 'default' : 'secondary'}>
                          {webhook.enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                      {webhook.description && (
                        <p className="text-sm text-muted-foreground mb-2">
                          {webhook.description}
                        </p>
                      )}
                      {/* Stats Display */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1">
                          <span className="text-green-600">✓</span> {webhook.success_count} success
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="text-red-600">✗</span> {webhook.error_count} errors
                        </span>
                        {analytics[webhook.id] && (
                          <>
                            <span>⚡ {analytics[webhook.id].performance.avgResponseTime}ms avg</span>
                            <Badge variant={
                              analytics[webhook.id].overview.healthStatus === 'healthy' ? 'default' :
                              analytics[webhook.id].overview.healthStatus === 'warning' ? 'secondary' :
                              'destructive'
                            } className="text-xs">
                              {analytics[webhook.id].overview.successRate}% success
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Active</span>
                              <Switch
                                checked={webhook.enabled}
                                onCheckedChange={(checked) => 
                                  handleToggleEnabled(webhook.id, checked)
                                }
                              />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            {webhook.enabled ? 'Disable webhook' : 'Enable webhook'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestWebhook(webhook.id)}
                        disabled={testingWebhook === webhook.id || !webhook.enabled}
                      >
                        <TestTube className="h-3 w-3 mr-1" />
                        {testingWebhook === webhook.id ? 'Testing...' : 'Test'}
                      </Button>

                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewLogs(webhook)}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            View Logs
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleRegenerateApiKey(webhook.id)}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Regenerate API Key
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(webhook.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  <Separator />

                  {/* URL Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Webhook URL
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyToClipboard(webhook.url || '', 'URL')}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <code className="block text-xs bg-muted p-2 rounded break-all">
                      {webhook.url}
                    </code>
                  </div>

                  {/* API Key Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        API Key
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyToClipboard(webhook.api_key, 'API Key')}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                    <code className="block text-xs bg-muted p-2 rounded break-all">
                      {webhook.api_key}
                    </code>
                  </div>

                  {/* Usage Example */}
                  <div className="space-y-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Example Usage
                    </span>
                    <code className="block text-xs bg-muted p-2 rounded overflow-x-auto">
                      {`curl -X ${webhook.method} ${webhook.url} \\
  -H "X-API-Key: ${webhook.api_key}" \\
  -H "Content-Type: application/json" \\
  -d '{"data": "your data"}'`}
                    </code>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Create Webhook Dialog */}
      <CreateWebhookDialog
        workflowId={workflowId}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onWebhookCreated={fetchWebhooks}
      />

      {/* Webhook Logs Dialog */}
      {selectedWebhook && (
        <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
          <DialogContent className="max-w-4xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>
                Webhook Logs - {selectedWebhook.method} {selectedWebhook.description || 'Untitled'}
              </DialogTitle>
            </DialogHeader>
            <WebhookLogs webhookId={selectedWebhook.id} workflowId={workflowId} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
