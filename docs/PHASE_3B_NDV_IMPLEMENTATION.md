# Phase 3B: Node Detail View (NDV) Implementation

**Status:** 🚀 Ready to Start  
**Date:** October 17, 2025  
**Duration:** Weeks 3-4 (2 weeks)  
**Prerequisites:** ✅ Phase 3A Complete (Backend + Basic Frontend)

---

## 🎯 Objective

Build n8n's **PRIMARY UI component** - the Node Detail View (NDV). This is the side panel that opens when you select a node and is where users spend 70% of their time.

---

## 🚨 Why NDV is Critical

According to n8n analysis:
- **70% of user time** is spent in NDV
- **30% of user time** is spent on canvas
- NDV is THE main interface for node configuration
- Our current config panel is too basic

---

## 📋 What We're Building

### NDV Overview

```
┌────────────────────────────────────────────────────┐
│  HTTP Request                            [✕]       │
├────────────────────────────────────────────────────┤
│  [Input] [Output] [Settings]                      │
├────────────────────────────────────────────────────┤
│                                                    │
│  Parameters                                        │
│  ┌──────────────────────────────────────────────┐│
│  │                                              ││
│  │  URL *                                       ││
│  │  https://api.example.com/users               ││
│  │                                              ││
│  │  Method                                      ││
│  │  [GET ▼]                                     ││
│  │                                              ││
│  │  Authentication                              ││
│  │  [None ▼]                                    ││
│  │                                              ││
│  │  Headers                                     ││
│  │  ┌──────────────┬─────────────────────────┐││
│  │  │ Name         │ Value                   │││
│  │  ├──────────────┼─────────────────────────┤││
│  │  │ Content-Type │ application/json        │││
│  │  └──────────────┴─────────────────────────┘││
│  │  [+ Add Header]                            ││
│  │                                              ││
│  │  Body                                        ││
│  │  {                                           ││
│  │    "query": "{{ $json.searchTerm }}"        ││
│  │  }                                           ││
│  │                                              ││
│  │  [Test Node] [Execute Node]                 ││
│  │                                              ││
│  └──────────────────────────────────────────────┘│
│                                                    │
│  ┌──────────────────────────────────────────────┐│
│  │ Input Data (1 item)                         ││
│  │─────────────────────────────────────────────││
│  │ {                                            ││
│  │   "id": 1,                                   ││
│  │   "searchTerm": "n8n"                        ││
│  │ }                                            ││
│  └──────────────────────────────────────────────┘│
│                                                    │
│  ┌──────────────────────────────────────────────┐│
│  │ Output Data (after execution)               ││
│  │─────────────────────────────────────────────││
│  │ {                                            ││
│  │   "status": 200,                             ││
│  │   "data": [...]                              ││
│  │ }                                            ││
│  └──────────────────────────────────────────────┘│
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## 🏗️ Implementation Plan

### Week 1: NDV Foundation & Structure

#### Day 1-2: Component Structure
- [ ] Create NDV component
- [ ] Create tabs system (Input/Output/Settings)
- [ ] Build data viewer component
- [ ] Add expand/collapse animations
- [ ] Integrate with canvas selection

#### Day 3-4: Input Tab
- [ ] Display input data from previous node
- [ ] Handle multiple items
- [ ] JSON viewer with syntax highlighting
- [ ] Expand/collapse sections
- [ ] Copy data button

#### Day 5: Output Tab
- [ ] Display output data after execution
- [ ] Show execution result
- [ ] Error display
- [ ] Success/failure indicators
- [ ] Execution time display

### Week 2: Functionality & Polish

#### Day 6-7: Test Node Feature
- [ ] Test node button
- [ ] Execute single node
- [ ] Show loading state
- [ ] Display results in Output tab
- [ ] Error handling

#### Day 8-9: Settings Tab & Polish
- [ ] Node settings UI
- [ ] Always output data option
- [ ] Retry on fail settings
- [ ] Continue on fail settings
- [ ] Node notes/description

#### Day 10: Testing & Integration
- [ ] Test all tabs
- [ ] Test data flow
- [ ] Test execution
- [ ] Responsive design
- [ ] Performance optimization

---

## 📐 Detailed Component Design

### 1. NDV Container

**File:** `src/components/workflow/ndv/node-detail-view.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { NDVInputTab } from './ndv-input-tab';
import { NDVOutputTab } from './ndv-output-tab';
import { NDVSettingsTab } from './ndv-settings-tab';
import { NDVParametersPanel } from './ndv-parameters-panel';

export function NodeDetailView() {
  const { selectedNodeId, nodes, setSelectedNodeId } = useCanvasStore();
  const [activeTab, setActiveTab] = useState('input');
  
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  
  if (!selectedNode) return null;
  
  const handleClose = () => {
    setSelectedNodeId(null);
  };
  
  return (
    <div className="fixed right-0 top-0 bottom-0 w-[600px] bg-background border-l shadow-lg z-50 flex flex-col">
      {/* Header */}
      <div className="border-b p-4 flex items-center justify-between">
        <div>
          <h3 className="font-semibold">{selectedNode.data.label}</h3>
          <p className="text-sm text-muted-foreground">{selectedNode.type}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
        <TabsList className="border-b rounded-none w-full justify-start px-4">
          <TabsTrigger value="input">Input</TabsTrigger>
          <TabsTrigger value="output">Output</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Parameters always visible */}
          <div className="border-b p-4">
            <NDVParametersPanel node={selectedNode} />
          </div>
          
          {/* Tab content */}
          <div className="flex-1 overflow-y-auto">
            <TabsContent value="input" className="mt-0">
              <NDVInputTab nodeId={selectedNode.id} />
            </TabsContent>
            
            <TabsContent value="output" className="mt-0">
              <NDVOutputTab nodeId={selectedNode.id} />
            </TabsContent>
            
            <TabsContent value="settings" className="mt-0">
              <NDVSettingsTab node={selectedNode} />
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </div>
  );
}
```

### 2. Input Tab Component

**File:** `src/components/workflow/ndv/ndv-input-tab.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { useExecutionStore } from '@/stores/workflow/execution.store';
import { toast } from 'sonner';

interface NDVInputTabProps {
  nodeId: string;
}

export function NDVInputTab({ nodeId }: NDVInputTabProps) {
  const { edges, nodes } = useCanvasStore();
  const { getNodeInputData } = useExecutionStore();
  
  // Find input nodes (nodes connected to this one)
  const inputConnections = edges.filter(e => e.target === nodeId);
  const inputNodeIds = inputConnections.map(e => e.source);
  const inputNodes = nodes.filter(n => inputNodeIds.includes(n.id));
  
  // Get input data
  const inputData = getNodeInputData(nodeId);
  
  const [expanded, setExpanded] = useState(true);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(inputData, null, 2));
    toast.success('Input data copied to clipboard');
  };
  
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Input Data</h4>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {inputData?.length || 0} items
          </span>
          <Button variant="ghost" size="sm" onClick={handleCopy}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      
      {inputNodes.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No input connections</p>
          <p className="text-sm">Connect nodes to see input data</p>
        </div>
      ) : expanded && inputData ? (
        <div className="bg-muted rounded-lg p-4">
          <pre className="text-xs overflow-x-auto">
            {JSON.stringify(inputData, null, 2)}
          </pre>
        </div>
      ) : null}
      
      {/* Input nodes list */}
      <div>
        <h5 className="text-sm font-medium mb-2">Connected Nodes</h5>
        <div className="space-y-1">
          {inputNodes.map(node => (
            <div
              key={node.id}
              className="text-sm p-2 bg-muted rounded flex items-center justify-between"
            >
              <span>{node.data.label}</span>
              <span className="text-xs text-muted-foreground">{node.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### 3. Output Tab Component

**File:** `src/components/workflow/ndv/ndv-output-tab.tsx`

```typescript
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExecutionStore } from '@/stores/workflow/execution.store';
import { toast } from 'sonner';

interface NDVOutputTabProps {
  nodeId: string;
}

export function NDVOutputTab({ nodeId }: NDVOutputTabProps) {
  const { getNodeOutputData, getNodeExecutionStatus } = useExecutionStore();
  
  const outputData = getNodeOutputData(nodeId);
  const executionStatus = getNodeExecutionStatus(nodeId);
  
  const [expanded, setExpanded] = useState(true);
  
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(outputData, null, 2));
    toast.success('Output data copied to clipboard');
  };
  
  return (
    <div className="p-4 space-y-4">
      {/* Execution Status */}
      {executionStatus && (
        <div className={`p-3 rounded-lg flex items-center gap-2 ${
          executionStatus.status === 'success' ? 'bg-green-50 text-green-900' :
          executionStatus.status === 'error' ? 'bg-red-50 text-red-900' :
          'bg-gray-50 text-gray-900'
        }`}>
          {executionStatus.status === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : executionStatus.status === 'error' ? (
            <XCircle className="h-4 w-4" />
          ) : null}
          <span className="text-sm font-medium">
            {executionStatus.status === 'success' ? 'Executed successfully' :
             executionStatus.status === 'error' ? 'Execution failed' :
             'Not executed yet'}
          </span>
          {executionStatus.duration && (
            <span className="text-xs ml-auto">
              {executionStatus.duration}ms
            </span>
          )}
        </div>
      )}
      
      {/* Output Data */}
      <div className="flex items-center justify-between">
        <h4 className="font-medium">Output Data</h4>
        {outputData && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {Array.isArray(outputData) ? outputData.length : 1} items
            </span>
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>
      
      {!executionStatus || executionStatus.status === 'waiting' ? (
        <div className="text-center py-8 text-muted-foreground">
          <p>No output data
