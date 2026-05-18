'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Play, 
} from 'lucide-react';
import { useExecutionStore, type Execution } from '@/stores/workflow/execution.store';
import { cn } from '@/lib/utils';

interface ExecutionHistoryProps {
  workflowId: string;
  onExecute?: () => void;
}

export function ExecutionHistory({ workflowId, onExecute }: ExecutionHistoryProps) {
  const executionHistory = useExecutionStore((state) => state.executionHistory);
  const currentExecution = useExecutionStore((state) => state.currentExecution);
  const [loading, setLoading] = useState(true);
  const [dbExecutions, setDbExecutions] = useState<Execution[]>([]);
  
  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };
  
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
  };
  
  const getStatusIcon = (status: Execution['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'running':
        return <Clock className="h-4 w-4 text-blue-600 animate-spin" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };
  
  const getModeLabel = (mode: Execution['mode']) => {
    switch (mode) {
      case 'manual':
        return 'Manual';
      case 'webhook':
        return 'Webhook';
      case 'schedule':
        return 'Scheduled';
      case 'test':
        return 'Test';
    }
  };
  
  // Load executions from database on mount
  useEffect(() => {
    const loadExecutions = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/workflows/${workflowId}/executions`);
        const result = await response.json();
        
        if (result.success && result.data) {
          // Convert database executions to Execution format
          const formatted: Execution[] = result.data.map((exec: { id: string; workflow_id: string; status: string; started_at: string; finished_at?: string; duration?: number; error?: string; mode?: string }) => ({
            id: exec.id,
            workflowId: exec.workflow_id,
            status: exec.status,
            startTime: new Date(exec.started_at).getTime(),
            endTime: exec.finished_at ? new Date(exec.finished_at).getTime() : undefined,
            duration: exec.duration,
            error: exec.error,
            mode: exec.mode || 'manual'
          }));
          setDbExecutions(formatted);
        }
      } catch {
        // Silently fail - executions will show as empty
      } finally {
        setLoading(false);
      }
    };
    
    loadExecutions();
  }, [workflowId]);
  
  // Combine current execution, in-memory history, and database executions
  // Avoid duplicates by using a Map keyed by execution id
  const executionsMap = new Map<string, Execution>();
  
  // Add database executions first
  dbExecutions.forEach(exec => executionsMap.set(exec.id, exec));
  
  // Add in-memory history (overwrites if newer)
  executionHistory.forEach(exec => executionsMap.set(exec.id, exec));
  
  // Add current execution (always most recent)
  if (currentExecution) {
    executionsMap.set(currentExecution.id, currentExecution);
  }
  
  // Convert back to array and sort by start time (newest first)
  const allExecutions = Array.from(executionsMap.values())
    .sort((a, b) => b.startTime - a.startTime);
  
  if (loading) {
    return (
      <Card className="p-4 space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-md bg-muted/30">
            <div className="h-4 w-4 rounded-full bg-muted animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 rounded bg-muted animate-pulse" />
              <div className="h-2 w-16 rounded bg-muted animate-pulse" />
            </div>
            <div className="h-3 w-12 rounded bg-muted animate-pulse" />
          </div>
        ))}
        <span className="sr-only">Loading execution history</span>
      </Card>
    );
  }
  
  if (allExecutions.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="font-medium mb-2">No Executions Yet</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Execute your workflow to see the history here
        </p>
        <Button 
          size="sm" 
          variant="outline"
          onClick={onExecute}
          disabled={!onExecute}
        >
          <Play className="h-4 w-4 mr-2" />
          Execute Workflow
        </Button>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Execution History</h3>
        <span className="text-sm text-muted-foreground">
          {allExecutions.length} executions
        </span>
      </div>
      
      <ScrollArea className="h-[600px]">
        <div className="space-y-2">
          {allExecutions.map((execution) => (
            <Card
              key={execution.id}
              className={cn(
                'p-4 cursor-pointer hover:shadow-md transition-shadow',
                execution.status === 'running' && 'border-blue-500'
              )}
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(execution.status)}
                    <div>
                      <div className="font-medium text-sm">
                        {execution.status === 'running' ? 'Executing...' :
                         execution.status === 'success' ? 'Execution Successful' :
                         execution.status === 'error' ? 'Execution Failed' :
                         'Execution Cancelled'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatTime(execution.startTime)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                      {getModeLabel(execution.mode)}
                    </span>
                    {execution.duration && (
                      <span className="text-xs text-muted-foreground">
                        {formatDuration(execution.duration)}
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Error message */}
                {execution.error && (
                  <div className="text-xs text-red-600 bg-red-50 dark:bg-red-950 p-2 rounded">
                    {execution.error}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
