'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/radix-tabs';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  CheckCircle, 
  XCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { useExecutionStore } from '@/stores/workflow/execution.store';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ExecutionPanelProps {
  nodeId: string;
}

export function ExecutionPanel({ nodeId }: ExecutionPanelProps) {
  const [activeTab, setActiveTab] = useState('input');
  const [inputExpanded, setInputExpanded] = useState(true);
  const [outputExpanded, setOutputExpanded] = useState(true);
  
  const { nodes, edges } = useCanvasStore();
  const getNodeInputData = useExecutionStore((state) => state.getNodeInputData);
  const getNodeOutputData = useExecutionStore((state) => state.getNodeOutputData);
  const getNodeExecutionStatus = useExecutionStore((state) => state.getNodeExecutionStatus);
  
  const node = nodes.find(n => n.id === nodeId);
  const inputData = getNodeInputData(nodeId);
  const outputData = getNodeOutputData(nodeId);
  const executionStatus = getNodeExecutionStatus(nodeId);
  
  // Find input nodes (nodes connected to this one)
  const inputConnections = edges.filter(e => e.target === nodeId);
  const inputNodes = nodes.filter(n => inputConnections.some(conn => conn.source === n.id));
  
  const handleCopyInput = () => {
    navigator.clipboard.writeText(JSON.stringify(inputData, null, 2));
    toast.success('Input data copied to clipboard');
  };
  
  const handleCopyOutput = () => {
    navigator.clipboard.writeText(JSON.stringify(outputData, null, 2));
    toast.success('Output data copied to clipboard');
  };
  
  if (!node) return null;
  
  return (
    <div className="h-full flex flex-col">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
        </TabsList>
        
        <div className="flex-1 overflow-y-auto p-4">
          {/* Input Tab */}
          <TabsContent value="input" className="mt-0 space-y-4">
            {/* Execution Status */}
            {executionStatus && (
              <Card className={cn(
                'p-3',
                executionStatus.status === 'success' && 'bg-green-50 dark:bg-green-950 border-green-200',
                executionStatus.status === 'error' && 'bg-red-50 dark:bg-red-950 border-red-200',
                executionStatus.status === 'running' && 'bg-blue-50 dark:bg-blue-950 border-blue-200'
              )}>
                <div className="flex items-center gap-2">
                  {executionStatus.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : executionStatus.status === 'error' ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : executionStatus.status === 'running' ? (
                    <Clock className="h-4 w-4 text-blue-600 animate-spin" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {executionStatus.status === 'success' ? 'Executed successfully' :
                     executionStatus.status === 'error' ? 'Execution failed' :
                     executionStatus.status === 'running' ? 'Executing...' :
                     'Not executed yet'}
                  </span>
                  {executionStatus.duration && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {executionStatus.duration}ms
                    </span>
                  )}
                </div>
              </Card>
            )}

            {/* Connected Nodes */}
            {inputNodes.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Connected Nodes</h4>
                <div className="space-y-1">
                  {inputNodes.map(inputNode => (
                    <Card key={inputNode.id} className="p-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{inputNode.data.label}</span>
                        <span className="text-xs text-muted-foreground">{inputNode.type}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
            
            {/* Input Data */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Input Data</h4>
                {!!inputData && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {Array.isArray(inputData) ? inputData.length : 1} items
                    </span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleCopyInput}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setInputExpanded(!inputExpanded)}
                    >
                      {inputExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
              
              {inputNodes.length === 0 ? (
                <Card className="p-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No input connections</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Connect nodes to see input data
                  </p>
                </Card>
              ) : !inputData ? (
                <Card className="p-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No data available</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Execute the workflow to see input data
                  </p>
                </Card>
              ) : inputExpanded ? (
                <Card className="p-4 bg-muted">
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(inputData, null, 2)}
                  </pre>
                </Card>
              ) : null}
            </div>
          </TabsContent>
          
          {/* Output Tab */}
          <TabsContent value="output" className="mt-0 space-y-4">
            {/* Execution Status */}
            {executionStatus && (
              <Card className={cn(
                'p-3',
                executionStatus.status === 'success' && 'bg-green-50 dark:bg-green-950 border-green-200',
                executionStatus.status === 'error' && 'bg-red-50 dark:bg-red-950 border-red-200',
                executionStatus.status === 'running' && 'bg-blue-50 dark:bg-blue-950 border-blue-200'
              )}>
                <div className="flex items-center gap-2">
                  {executionStatus.status === 'success' ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : executionStatus.status === 'error' ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : executionStatus.status === 'running' ? (
                    <Clock className="h-4 w-4 text-blue-600 animate-spin" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">
                    {executionStatus.status === 'success' ? 'Executed successfully' :
                     executionStatus.status === 'error' ? 'Execution failed' :
                     executionStatus.status === 'running' ? 'Executing...' :
                     'Not executed yet'}
                  </span>
                  {executionStatus.duration && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {executionStatus.duration}ms
                    </span>
                  )}
                </div>
              </Card>
            )}

            {/* Output Data */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium">Output Data</h4>
                {!!outputData && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {Array.isArray(outputData) ? outputData.length : 1} items
                    </span>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={handleCopyOutput}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOutputExpanded(!outputExpanded)}
                    >
                      {outputExpanded ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
              
              {!executionStatus || executionStatus.status === 'waiting' ? (
                <Card className="p-8 text-center">
                  <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No output data</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Execute the node to see output data
                  </p>
                </Card>
              ) : executionStatus.status === 'running' ? (
                <Card className="p-8 text-center">
                  <Clock className="h-8 w-8 text-blue-600 mx-auto mb-2 animate-spin" />
                  <p className="text-sm text-muted-foreground">Executing...</p>
                </Card>
              ) : !outputData ? (
                <Card className="p-8 text-center">
                  <XCircle className="h-8 w-8 text-red-600 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No output data</p>
                </Card>
              ) : outputExpanded ? (
                <Card className="p-4 bg-muted">
                  <pre className="text-xs overflow-x-auto">
                    {JSON.stringify(outputData, null, 2)}
                  </pre>
                </Card>
              ) : null}
            </div>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
