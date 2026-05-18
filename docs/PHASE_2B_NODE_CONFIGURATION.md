# Phase 2B: Node Configuration Panel (CRITICAL)

**Priority:** HIGH - Required before backend  
**Timeline:** 1-2 days  
**Status:** Recommended Next Step

---

## Why This Phase?

To reproduce n8n exactly, we need the **Node Configuration Panel** - this is n8n's most important UX feature. Without it, users can't:
- Configure node parameters
- Set credentials
- Test nodes
- See node documentation

---

## n8n's Node Configuration System

### What n8n Has

```
┌─────────────────┬────────────────────────────────┐
│                 │                                │
│   Node Palette  │         Canvas                 │
│                 │                                │
│   [Trigger]     │     [Node] ──→ [Node]         │
│   [Action]      │                                │
│   [Condition]   │                                │
│                 │                                │
└─────────────────┴────────────────────────────────┘
                  │                                │
                  │   Node Configuration Panel     │
                  │   (Opens when node selected)   │
                  │                                │
                  │   ┌──────────────────────┐    │
                  │   │ HTTP Request         │    │
                  │   ├──────────────────────┤    │
                  │   │ Parameters           │    │
                  │   │ • URL: [_______]     │    │
                  │   │ • Method: [GET ▼]    │    │
                  │   │ • Headers: [+Add]    │    │
                  │   │                      │    │
                  │   │ [Test] [Execute]     │    │
                  │   └──────────────────────┘    │
                  └────────────────────────────────┘
```

---

## What We Need to Add

### 1. Node Configuration Panel ⭐ CRITICAL

**Right sidebar that opens when node is selected**

Features:
- Node name input
- Node type display
- Parameter forms (dynamic based on node type)
- Test button
- Execute button
- Close button

### 2. Node Parameter System

**Dynamic forms based on node type**

Examples:
```typescript
// Trigger Node Parameters
{
  schedule: { type: 'cron', label: 'Schedule' },
  timezone: { type: 'select', options: [...] }
}

// HTTP Action Parameters
{
  url: { type: 'string', label: 'URL', required: true },
  method: { type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] },
  headers: { type: 'collection', label: 'Headers' }
}

// Condition Node Parameters
{
  conditions: { 
    type: 'array', 
    items: {
      field: 'string',
      operator: 'select',
      value: 'string'
    }
  }
}
```

### 3. Parameter Input Types

n8n has many input types:
- String input
- Number input
- Boolean toggle
- Select dropdown
- Multi-select
- Collection (key-value pairs)
- JSON editor
- Code editor
- Credential selector
- Expression editor

**For Phase 2B, we implement:**
- ✅ String input (text field)
- ✅ Number input
- ✅ Boolean toggle (switch)
- ✅ Select dropdown
- ✅ Textarea
- ⏳ JSON editor (Phase 3)
- ⏳ Expression editor (Phase 3)
- ⏳ Credentials (Phase 3)

---

## Implementation Plan

### Step 1: Create Configuration Panel Component

```tsx
// components/workflow/config/node-config-panel.tsx
'use client';

import { useCanvasStore } from '@/stores/workflow/canvas.store';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export function NodeConfigPanel() {
  const { selectedNodeId, nodes, updateNode, setSelectedNode } = useCanvasStore();
  
  const selectedNode = nodes.find(n => n.id === selectedNodeId);
  
  if (!selectedNode) return null;
  
  return (
    <div className="w-96 border-l bg-background p-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Node Configuration</h3>
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => setSelectedNode(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Node Name */}
      <div className="space-y-2 mb-4">
        <Label>Node Name</Label>
        <Input 
          value={selectedNode.data.label}
          onChange={(e) => updateNode(selectedNode.id, {
            data: { ...selectedNode.data, label: e.target.value }
          })}
        />
      </div>
      
      {/* Node Type Badge */}
      <div className="mb-4">
        <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
          {selectedNode.data.type}
        </span>
      </div>
      
      {/* Parameters */}
      <NodeParameters 
        nodeType={selectedNode.data.type}
        config={selectedNode.data.config || {}}
        onChange={(config) => updateNode(selectedNode.id, {
          data: { ...selectedNode.data, config }
        })}
      />
      
      {/* Actions */}
      <div className="flex gap-2 mt-6">
        <Button variant="outline" className="flex-1">
          Test
        </Button>
        <Button className="flex-1">
          Execute
        </Button>
      </div>
    </div>
  );
}
```

### Step 2: Define Node Parameter Schemas

```typescript
// lib/workflow/node-schemas.ts
export const NODE_SCHEMAS = {
  trigger: {
    parameters: [
      {
        name: 'schedule',
        type: 'string',
        label: 'Schedule (Cron)',
        placeholder: '*/5 * * * *',
        required: true,
      },
      {
        name: 'enabled',
        type: 'boolean',
        label: 'Enabled',
        default: true,
      }
    ]
  },
  
  action: {
    parameters: [
      {
        name: 'url',
        type: 'string',
        label: 'URL',
        placeholder: 'https://api.example.com',
        required: true,
      },
      {
        name: 'method',
        type: 'select',
        label: 'Method',
        options: ['GET', 'POST', 'PUT', 'DELETE'],
        default: 'GET',
      },
      {
        name: 'body',
        type: 'textarea',
        label: 'Request Body',
        placeholder: '{ "key": "value" }',
      }
    ]
  },
  
  condition: {
    parameters: [
      {
        name: 'field',
        type: 'string',
        label: 'Field',
        required: true,
      },
      {
        name: 'operator',
        type: 'select',
        label: 'Operator',
        options: ['equals', 'contains', 'greater_than', 'less_than'],
        default: 'equals',
      },
      {
        name: 'value',
        type: 'string',
        label: 'Value',
        required: true,
      }
    ]
  },
  
  transform: {
    parameters: [
      {
        name: 'operation',
        type: 'select',
        label: 'Operation',
        options: ['map', 'filter', 'reduce', 'sort'],
        default: 'map',
      },
      {
        name: 'expression',
        type: 'textarea',
        label: 'Expression',
        placeholder: 'item.value * 2',
      }
    ]
  }
} as const;
```

### Step 3: Create Parameter Components

```tsx
// components/workflow/config/parameter-input.tsx
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

export function ParameterInput({ param, value, onChange }) {
  switch (param.type) {
    case 'string':
      return (
        <div className="space-y-2">
          <Label>{param.label} {param.required && '*'}</Label>
          <Input 
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={param.placeholder}
          />
        </div>
      );
      
    case 'number':
      return (
        <div className="space-y-2">
          <Label>{param.label} {param.required && '*'}</Label>
          <Input 
            type="number"
            value={value || ''}
            onChange={(e) => onChange(parseFloat(e.target.value))}
          />
        </div>
      );
      
    case 'boolean':
      return (
        <div className="flex items-center justify-between">
          <Label>{param.label}</Label>
          <Switch 
            checked={value || false}
            onCheckedChange={onChange}
          />
        </div>
      );
      
    case 'select':
      return (
        <div className="space-y-2">
          <Label>{param.label} {param.required && '*'}</Label>
          <Select value={value || param.default} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {param.options.map(opt => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );
      
    case 'textarea':
      return (
        <div className="space-y-2">
          <Label>{param.label} {param.required && '*'}</Label>
          <Textarea 
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={param.placeholder}
            rows={4}
          />
        </div>
      );
      
    default:
      return null;
  }
}
```

### Step 4: Update Canvas Store

```typescript
// stores/workflow/canvas.store.ts - Add selection
export const useCanvasStore = create<CanvasState>()(
  devtools(
    immer((set) => ({
      // ... existing state
      selectedNodeId: null,
      
      // ... existing actions
      
      setSelectedNode: (id) => set({ selectedNodeId: id }),
      
      updateNode: (id, updates) =>
        set((state) => {
          const node = state.nodes.find((n) => n.id === id);
          if (node) {
            Object.assign(node, updates);
          }
        }),
    }))
  )
);
```

### Step 5: Update Canvas to Show Panel

```tsx
// app/(workflow)/[workspace-slug]/workflows/[workflowId]/page.tsx
import { NodeConfigPanel } from '@/components/workflow/config/node-config-panel';

export default function WorkflowEditorPage() {
  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col">
      <div className="border-b p-3 flex items-center justify-between">
        {/* Toolbar */}
      </div>

      <div className="flex-1 flex overflow-hidden">
        <NodePalette />
        <div className="flex-1">
          <WorkflowCanvas />
        </div>
        {/* Configuration Panel */}
        <NodeConfigPanel />
      </div>
    </div>
  );
}
```

---

## Comparison: What We'll Have vs n8n

### After Phase 2B ✅

| Feature | n8n | Us | Status |
|---------|-----|-----|--------|
| Visual Canvas | ✅ | ✅ | Done |
| Node Palette | ✅ | ✅ | Done |
| Drag & Drop | ✅ | ✅ | Done |
| Node Connections | ✅ | ✅ | Done |
| **Config Panel** | ✅ | ✅ | **Phase 2B** |
| **Node Parameters** | ✅ | ✅ | **Phase 2B** |
| Basic Input Types | ✅ | ✅ | **Phase 2B** |
| Node Selection | ✅ | ✅ | **Phase 2B** |

### Still Missing (Phase 3+) ⏳

| Feature | Priority | Phase |
|---------|----------|-------|
| Expression Editor | Medium | 3 |
| Credentials System | High | 3 |
| Workflow Execution | High | 3 |
| Execution History | Medium | 3 |
| Node Versioning | Low | 4 |
| Sticky Notes | Low | 4 |
| Workflow Variables | Medium | 3 |
| Error Handling UI | Medium | 3 |

---

## Recommendation

### Do Phase 2B First (1-2 days)

**Why:**
1. Node configuration is CRITICAL for n8n UX
2. Backend won't be useful without it
3. Users need to configure nodes before execution
4. It's what makes n8n feel like n8n

**What we'll add:**
- ✅ Right sidebar config panel
- ✅ Dynamic parameter forms
- ✅ Node selection UI
- ✅ Basic input types
- ✅ Test/Execute buttons (UI only)

### Then Phase 3 (Backend)

**After 2B, we move to backend:**
- Database schema
- API routes
- Save/load workflows
- Execution engine

---

## Timeline

### Phase 2B: Node Configuration (1-2 days)
- Day 1: Config panel + parameter system
- Day 2: Polish + testing

### Phase 3: Backend Integration (3-5 days)
- Day 1-2: Database + API routes
- Day 3-4: Execution engine
- Day 5: Testing + polish

### Phase 4: Advanced Features (1-2 weeks)
- Expression editor
- Credentials
- Advanced node types
- Execution history

---

## Decision Point

### Option A: Phase 2B First ⭐ RECOMMENDED

**Pros:**
- Complete n8n-like UX before backend
- Users can design workflows fully
- Better testing of frontend
- More impressive demo

**Cons:**
- Delays backend by 1-2 days
- Can't execute workflows yet

### Option B: Skip to Phase 3

**Pros:**
- Get backend working faster
- Can execute simple workflows

**Cons:**
- Missing critical UX
- Doesn't feel like n8n
- Have to come back to frontend
- Harder to test

---

## My Recommendation

**Do Phase 2B first!** 

The node configuration panel is what makes n8n feel like n8n. Without it:
- Users can't configure nodes
- Workflows are just visual diagrams
- No way to set parameters
- Missing the core UX

With it:
- Complete n8n-like experience
- Users can design full workflows
- Better foundation for backend
- More professional product

**Timeline impact:** Only 1-2 days, well worth it!

---

## Ready to Start Phase 2B?

Let me know and I'll begin implementing:
1. Node configuration panel
2. Parameter system
3. Dynamic forms
4. Selection UI

This will give you a MUCH more complete n8n reproduction! 🎯
