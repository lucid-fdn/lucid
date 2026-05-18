'use client';

import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, RefreshCw, RotateCcw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { notificationCopy } from '@/lib/notifications/copy'

interface WebhookLog {
  id: string;
  request_method: string;
  request_headers: Record<string, unknown>;
  request_body: unknown;
  request_query: Record<string, unknown>;
  response_status: number;
  response_body: unknown;
  error: string | null;
  ip_address: string;
  user_agent: string;
  execution_time_ms: number;
  executed_at: string;
  workflow_execution_id: string | null;
}

interface WebhookLogsProps {
  webhookId: string;
  workflowId: string;
}

export function WebhookLogs({ webhookId, workflowId }: WebhookLogsProps) {
  const toast = useToast();
  const [logs, setLogs] = useState<WebhookLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | 'success' | 'error'>('all');
  const [retryingLog, setRetryingLog] = useState<string | null>(null);

  useEffect(() => {
    fetchLogs();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once on mount
  }, [webhookId]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/workflows/${workflowId}/webhooks/${webhookId}/logs`);
      if (response.ok) {
        const data = await response.json();
        setLogs(data.data || []);
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleLogExpanded = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'default';
    if (status >= 400 && status < 500) return 'destructive';
    if (status >= 500) return 'destructive';
    return 'secondary';
  };

  const getStatusLabel = (status: number) => {
    if (status >= 200 && status < 300) return 'Success';
    if (status === 401) return 'Unauthorized';
    if (status === 404) return 'Not Found';
    if (status === 405) return 'Method Not Allowed';
    if (status >= 400 && status < 500) return 'Client Error';
    if (status >= 500) return 'Server Error';
    return 'Unknown';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const handleRetry = async (logId: string) => {
    setRetryingLog(logId);
    try {
      const response = await fetch(
        `/api/workflows/${workflowId}/webhooks/${webhookId}/logs/${logId}/retry`,
        { method: 'POST' }
      );
      const result = await response.json();
      
      if (result.success) {
        toast.success('Webhook retried successfully');
        fetchLogs(); // Refresh logs
      } else {
        toast.error(result.error || 'Retry failed');
      }
    } catch (error) {
      console.error('Failed to retry webhook:', error);
      toast.error(notificationCopy.common.unexpectedError);
    } finally {
      setRetryingLog(null);
    }
  };

  const filteredLogs = logs.filter(log => {
    if (filter === 'success') {
      return log.response_status >= 200 && log.response_status < 300 && !log.error;
    }
    if (filter === 'error') {
      return log.error || log.response_status >= 400;
    }
    return true; // 'all'
  });

  if (loading) {
    return (
      <Card className="p-6 text-center text-muted-foreground">
        Loading logs...
      </Card>
    );
  }

  if (logs.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-muted-foreground">No webhook calls yet</p>
        <p className="text-xs text-muted-foreground mt-2">
          Logs will appear here when this webhook receives requests
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Filters */}
      <div className="flex items-center justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'success' | 'error')} className="w-auto">
          <TabsList>
            <TabsTrigger value="all">All ({logs.length})</TabsTrigger>
            <TabsTrigger value="success">
              Success ({logs.filter(l => l.response_status >= 200 && l.response_status < 300 && !l.error).length})
            </TabsTrigger>
            <TabsTrigger value="error">
              Errors ({logs.filter(l => l.error || l.response_status >= 400).length})
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <Button variant="outline" size="sm" onClick={fetchLogs}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Logs List */}
      <ScrollArea className="h-[500px]">
        <div className="space-y-3">
          {filteredLogs.map((log) => {
            const isExpanded = expandedLogs.has(log.id);
            
            return (
              <Card key={log.id} className="p-4">
                <Collapsible open={isExpanded} onOpenChange={() => toggleLogExpanded(log.id)}>
                  {/* Log Header */}
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between cursor-pointer hover:bg-muted/50 -m-4 p-4 rounded-lg">
                      <div className="flex items-center gap-3 flex-1">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                        
                        <Badge variant="outline">{log.request_method}</Badge>
                        
                        <Badge variant={getStatusColor(log.response_status)}>
                          {log.response_status} {getStatusLabel(log.response_status)}
                        </Badge>

                        {log.error && (
                          <Badge variant="destructive">Error</Badge>
                        )}

                        <span className="text-xs text-muted-foreground">
                          {log.execution_time_ms}ms
                        </span>

                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDate(log.executed_at)}
                        </span>
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  {/* Log Details */}
                  <CollapsibleContent>
                    <div className="mt-4 space-y-4">
                      <Separator />

                      <Tabs defaultValue="request" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                          <TabsTrigger value="request">Request</TabsTrigger>
                          <TabsTrigger value="response">Response</TabsTrigger>
                          <TabsTrigger value="metadata">Metadata</TabsTrigger>
                        </TabsList>

                        {/* Request Tab */}
                        <TabsContent value="request" className="space-y-3">
                          {/* Request Headers */}
                          <div className="space-y-2">
                            <span className="text-xs font-medium text-muted-foreground">
                              Headers
                            </span>
                            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                              {JSON.stringify(log.request_headers, null, 2)}
                            </pre>
                          </div>

                          {/* Request Body */}
                          {!!log.request_body && (
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Body
                              </span>
                              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                                {JSON.stringify(log.request_body, null, 2)}
                              </pre>
                            </div>
                          )}

                          {/* Query Parameters */}
                          {log.request_query && Object.keys(log.request_query).length > 0 && (
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Query Parameters
                              </span>
                              <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                                {JSON.stringify(log.request_query, null, 2)}
                              </pre>
                            </div>
                          )}
                        </TabsContent>

                        {/* Response Tab */}
                        <TabsContent value="response" className="space-y-3">
                          {/* Retry Button */}
                          {(log.error || log.response_status >= 400) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleRetry(log.id)}
                              disabled={retryingLog === log.id}
                              className="w-full"
                            >
                              <RotateCcw className="h-3 w-3 mr-2" />
                              {retryingLog === log.id ? 'Retrying...' : 'Retry Request'}
                            </Button>
                          )}

                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-muted-foreground">
                                Status: {log.response_status}
                              </span>
                              <Badge variant={getStatusColor(log.response_status)}>
                                {getStatusLabel(log.response_status)}
                              </Badge>
                            </div>
                            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                              {JSON.stringify(log.response_body, null, 2)}
                            </pre>
                          </div>

                          {log.error && (
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-destructive">
                                Error
                              </span>
                              <div className="text-xs bg-destructive/10 text-destructive p-3 rounded">
                                {log.error}
                              </div>
                            </div>
                          )}

                          {log.workflow_execution_id && (
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Workflow Execution ID
                              </span>
                              <code className="text-xs bg-muted p-2 rounded block">
                                {log.workflow_execution_id}
                              </code>
                            </div>
                          )}
                        </TabsContent>

                        {/* Metadata Tab */}
                        <TabsContent value="metadata" className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                IP Address
                              </span>
                              <code className="text-xs bg-muted p-2 rounded block">
                                {log.ip_address}
                              </code>
                            </div>

                            <div className="space-y-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Execution Time
                              </span>
                              <code className="text-xs bg-muted p-2 rounded block">
                                {log.execution_time_ms}ms
                              </code>
                            </div>

                            <div className="space-y-2 col-span-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                User Agent
                              </span>
                              <code className="text-xs bg-muted p-2 rounded block break-all">
                                {log.user_agent}
                              </code>
                            </div>

                            <div className="space-y-2 col-span-2">
                              <span className="text-xs font-medium text-muted-foreground">
                                Executed At
                              </span>
                              <code className="text-xs bg-muted p-2 rounded block">
                                {formatDate(log.executed_at)}
                              </code>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
