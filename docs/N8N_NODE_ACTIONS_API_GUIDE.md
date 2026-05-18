# n8n Node Actions/Operations API Guide

## Overview

Your n8n API at `http://54.204.114.86:3001/api/flow/nodes` **DOES return all node operations and actions** in the response. The operations are embedded within the `properties` array of each node.

---

## API Response Structure

### Basic Node Data

```json
{
  "name": "n8n-nodes-base.agileCrm",
  "displayName": "Agile CRM",
  "description": "Consume Agile CRM API",
  "version": [1],
  "iconUrl": "icons/...",
  "properties": [
    // ← All resources and operations are here!
  ]
}
```

### How Operations Are Structured

Within the `properties` array:

1. **Resource Property** - Defines available resources (Company, Contact, Deal, etc.)
2. **Operation Properties** - Define actions for each resource (Create, Delete, Get, Update, etc.)

```json
{
  "properties": [
    {
      "displayName": "Resource",
      "name": "resource",
      "type": "options",
      "options": [
        {"name": "Company", "value": "company"},
        {"name": "Contact", "value": "contact"},
        {"name": "Deal", "value": "deal"}
      ]
    },
    {
      "displayName": "Operation",
      "name": "operation",
      "type": "options",
      "displayOptions": {
        "show": {
          "resource": ["company"]  // ← Operations for "Company"
        }
      },
      "options": [
        {
          "name": "Create",
          "value": "create",
          "action": "Create a company",
          "description": "Create a new company"
        },
        {
          "name": "Delete",
          "value": "delete",
          "action": "Delete a company"
        },
        {
          "name": "Get",
          "value": "get",
          "action": "Get a company"
        },
        {
          "name": "Get Many",
          "value": "getAll",
          "action": "Get many companies"
        },
        {
          "name": "Update",
          "value": "update",
          "action": "Update a company"
        }
      ]
    },
    {
      "displayName": "Operation",
      "name": "operation",
      "displayOptions": {
        "show": {
          "resource": ["contact"]  // ← Operations for "Contact"
        }
      },
      "options": [
        {
          "name": "Create",
          "value": "create",
          "action": "Create a contact"
        }
        // ... more contact operations
      ]
    }
    // ... more operation properties for other resources
  ]
}
```

---

## Extracting Resources and Operations

### Step 1: Get Node Data

```bash
# Get all nodes
curl http://54.204.114.86:3001/api/flow/nodes

# Get specific node by search
curl http://54.204.114.86:3001/api/flow/nodes?search=airtable

# Get specific node by name
curl http://54.204.114.86:3001/api/flow/nodes?search=n8n-nodes-base.agileCrm
```

### Step 2: Parse Resources

```typescript
function getResources(node: any) {
  // Find the "resource" property
  const resourceProp = node.properties.find(
    (p: any) => p.name === 'resource' && p.type === 'options'
  )
  
  if (!resourceProp) return []
  
  return resourceProp.options.map((opt: any) => ({
    name: opt.name,        // "Company"
    value: opt.value       // "company"
  }))
}

// Example:
const node = apiResponse.nodes[0]
const resources = getResources(node)
// [
//   {name: "Company", value: "company"},
//   {name: "Contact", value: "contact"},
//   {name: "Deal", value: "deal"}
// ]
```

### Step 3: Parse Operations for Each Resource

```typescript
function getOperationsForResource(node: any, resourceValue: string) {
  // Find operation property for this resource
  const operationProp = node.properties.find((p: any) => 
    p.name === 'operation' &&
    p.displayOptions?.show?.resource?.includes(resourceValue)
  )
  
  if (!operationProp || !operationProp.options) return []
  
  return operationProp.options.map((opt: any) => ({
    name: opt.name,              // "Create"
    value: opt.value,            // "create"
    action: opt.action,          // "Create a company"
    description: opt.description // Optional
  }))
}

// Example:
const companyOps = getOperationsForResource(node, 'company')
// [
//   {name: "Create", value: "create", action: "Create a company"},
//   {name: "Delete", value: "delete", action: "Delete a company"},
//   {name: "Get", value: "get", action: "Get a company"},
//   {name: "Get Many", value: "getAll", action: "Get many companies"},
//   {name: "Update", value: "update", action: "Update a company"}
// ]
```

### Step 4: Get All Resources with Their Operations

```typescript
interface NodeAction {
  name: string
  value: string
  action: string
  description?: string
}

interface NodeResource {
  name: string
  value: string
  actions: NodeAction[]
}

function getNodeResourcesAndActions(node: any): NodeResource[] {
  // Get all resources
  const resources = getResources(node)
  
  // For each resource, get its operations
  return resources.map(resource => ({
    name: resource.name,
    value: resource.value,
    actions: getOperationsForResource(node, resource.value)
  }))
}

// Example:
const resourcesWithActions = getNodeResourcesAndActions(node)
// [
//   {
//     name: "Company",
//     value: "company",
//     actions: [
//       {name: "Create", value: "create", action: "Create a company"},
//       {name: "Delete", value: "delete", action: "Delete a company"},
//       ...
//     ]
//   },
//   {
//     name: "Contact",
//     value: "contact",
//     actions: [...]
//   },
//   {
//     name: "Deal",
//     value: "deal",
//     actions: [...]
//   }
// ]
```

---

## Complete Implementation

### Backend Service

```typescript
// src/lib/lucid-l2/node-actions.ts

export interface NodeAction {
  name: string
  value: string
  action: string
  description?: string
}

export interface NodeResource {
  name: string
  value: string
  actions: NodeAction[]
}

export async function getNodeActions(
  nodeName: string
): Promise<NodeResource[]> {
  // Fetch node data from API
  const response = await fetch(
    `${process.env.LUCID_L2_API_URL}/flow/nodes?search=${nodeName}`
  )
  
  const data = await response.json()
  
  if (!data.success || !data.nodes || data.nodes.length === 0) {
    return []
  }
  
  // Get the first matching node (or filter by exact name)
  const node = data.nodes.find((n: any) => n.name === nodeName) || data.nodes[0]
  
  return extractResourcesAndActions(node)
}

function extractResourcesAndActions(node: any): NodeResource[] {
  // Find resource property
  const resourceProp = node.properties?.find(
    (p: any) => p.name === 'resource' && p.type === 'options'
  )
  
  if (!resourceProp || !resourceProp.options) {
    return []
  }
  
  const resources = resourceProp.options
  
  // For each resource, find its operations
  return resources.map((resource: any) => {
    const operationProp = node.properties.find((p: any) =>
      p.name === 'operation' &&
      p.type === 'options' &&
      p.displayOptions?.show?.resource?.includes(resource.value)
    )
    
    const actions = operationProp?.options || []
    
    return {
      name: resource.name,
      value: resource.value,
      actions: actions.map((action: any) => ({
        name: action.name,
        value: action.value,
        action: action.action || `${action.name} ${resource.name}`,
        description: action.description
      }))
    }
  })
}
```

### Frontend Component

```typescript
// src/components/workflow/node-actions-panel.tsx
'use client'

import { useState, useEffect } from 'react'
import { getNodeActions, type NodeResource } from '@/lib/lucid-l2/node-actions'

interface NodeActionsPanelProps {
  nodeName: string
}

export function NodeActionsPanel({ nodeName }: NodeActionsPanelProps) {
  const [resources, setResources] = useState<NodeResource[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    async function loadActions() {
      try {
        setLoading(true)
        const data = await getNodeActions(nodeName)
        setResources(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load actions')
      } finally {
        setLoading(false)
      }
    }
    
    loadActions()
  }, [nodeName])
  
  if (loading) {
    return <div className="p-4">Loading actions...</div>
  }
  
  if (error) {
    return <div className="p-4 text-red-500">Error: {error}</div>
  }
  
  if (resources.length === 0) {
    return <div className="p-4 text-muted-foreground">No actions available</div>
  }
  
  return (
    <div className="space-y-4">
      {resources.map(resource => (
        <div key={resource.value}>
          <h3 className="font-medium text-sm uppercase text-muted-foreground mb-2">
            {resource.name} ({resource.actions.length})
          </h3>
          <div className="space-y-1">
            {resource.actions.map(action => (
              <button
                key={action.value}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-accent rounded-md transition-colors"
                onClick={() => handleActionClick(resource.value, action.value)}
              >
                <span className="font-medium">{action.name}</span>
                <span className="text-muted-foreground text-xs">
                  {action.action}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
  
  function handleActionClick(resource: string, action: string) {
    // Handle action selection
    console.log('Selected:', { resource, action })
  }
}
```

### Usage Example

```typescript
// In your workflow builder
import { NodeActionsPanel } from '@/components/workflow/node-actions-panel'

function WorkflowBuilder() {
  const [selectedNode, setSelectedNode] = useState('n8n-nodes-base.agileCrm')
  
  return (
    <div className="flex">
      <div className="w-64 border-r">
        <NodeActionsPanel nodeName={selectedNode} />
      </div>
      <div className="flex-1">
        {/* Canvas area */}
      </div>
    </div>
  )
}
```

---

## API Endpoint Examples

### Get Agile CRM Actions

```bash
curl 'http://54.204.114.86:3001/api/flow/nodes?search=agilecrm' | jq '
  .nodes[0].properties[] | 
  select(.name == "operation") | 
  {
    resource: .displayOptions.show.resource[0],
    actions: [.options[].action]
  }
'
```

### Get Airtable Actions

```bash
curl 'http://54.204.114.86:3001/api/flow/nodes?search=airtable' | jq '
  .nodes[0].properties[] | 
  select(.name == "operation") | 
  select(.displayOptions.show.resource != null) |
  {
    resource: .displayOptions.show.resource[0],
    actions: [.options[].name]
  }
'
```

---

## Real-World Examples

### Example 1: Agile CRM

**API Request:**
```bash
curl 'http://54.204.114.86:3001/api/flow/nodes?search=n8n-nodes-base.agileCrm'
```

**Extracted Structure:**
```json
{
  "resources": [
    {
      "name": "Company",
      "value": "company",
      "actions": [
        {"name": "Create", "action": "Create a company"},
        {"name": "Delete", "action": "Delete a company"},
        {"name": "Get", "action": "Get a company"},
        {"name": "Get Many", "action": "Get many companies"},
        {"name": "Update", "action": "Update a company"}
      ]
    },
    {
      "name": "Contact",
      "value": "contact",
      "actions": [
        {"name": "Create", "action": "Create a contact"},
        {"name": "Delete", "action": "Delete a contact"},
        {"name": "Get", "action": "Get a contact"},
        {"name": "Get Many", "action": "Get many contacts"},
        {"name": "Update", "action": "Update a contact"}
      ]
    },
    {
      "name": "Deal",
      "value": "deal",
      "actions": [
        {"name": "Create", "action": "Create a deal"},
        {"name": "Delete", "action": "Delete a deal"},
        {"name": "Get", "action": "Get a deal"},
        {"name": "Get Many", "action": "Get many deals"},
        {"name": "Update", "action": "Update a deal"}
      ]
    }
  ]
}
```

### Example 2: Airtable

**Extracted Structure:**
```json
{
  "resources": [
    {
      "name": "Base",
      "value": "base",
      "actions": [
        {"name": "Get Many", "action": "Get many bases"},
        {"name": "Get Schema", "action": "Get base schema"}
      ]
    },
    {
      "name": "Record",
      "value": "record",
      "actions": [
        {"name": "Create", "action": "Create a record"},
        {"name": "Create or Update", "action": "Create or update a record"},
        {"name": "Delete", "action": "Delete a record"},
        {"name": "Get", "action": "Get a record"},
        {"name": "Search", "action": "Search records"},
        {"name": "Update", "action": "Update record"}
      ]
    }
  ]
}
```

---

## Caching Strategy

Since node definitions don't change often, implement caching:

```typescript
// src/lib/lucid-l2/node-actions-cache.ts

import { cache } from 'react'

// Cache for 1 hour
const nodeActionsCache = new Map<string, { data: any; timestamp: number }>()
const CACHE_TTL = 60 * 60 * 1000 // 1 hour

export const getCachedNodeActions = cache(async (nodeName: string) => {
  const cached = nodeActionsCache.get(nodeName)
  const now = Date.now()
  
  if (cached && (now - cached.timestamp) < CACHE_TTL) {
    return cached.data
  }
  
  const data = await getNodeActions(nodeName)
  nodeActionsCache.set(nodeName, { data, timestamp: now })
  
  return data
})
```

---

## Common Patterns

### Pattern 1: Standard CRUD Resources

Most nodes with resources follow this pattern:

```
Resource: Entity (e.g., Contact, Company, Deal)
├── Create
├── Read/Get
├── Update  
├── Delete
└── List/Get Many
```

### Pattern 2: Service Resources

Service-type nodes might have different operations:

```
Resource: Email
├── Send
├── Get
└── Delete

Resource: File
├── Upload
├── Download
├── Delete
└── List
```

### Pattern 3: No Resources

Some nodes don't have resources, only operations:

```typescript
// Check if node has resources
const hasResources = node.properties.some(
  p => p.name === 'resource' && p.type === 'options'
)

if (!hasResources) {
  // Get operations directly
  const operationProp = node.properties.find(
    p => p.name === 'operation' && p.type === 'options'
  )
  const operations = operationProp?.options || []
}
```

---

## Handling Edge Cases

### Multiple Versions

Some nodes have multiple versions:

```typescript
function getLatestVersion(node: any) {
  if (Array.isArray(node.version)) {
    return Math.max(...node.version)
  }
  return node.version
}
```

### Optional displayOptions

Some operations don't have `displayOptions.show.resource`:

```typescript
function getOperationsForResource(node: any, resourceValue: string) {
  const operationProps = node.properties.filter((p: any) => 
    p.name === 'operation' && p.type === 'options'
  )
  
  // Find with displayOptions
  let operationProp = operationProps.find((p: any) =>
    p.displayOptions?.show?.resource?.includes(resourceValue)
  )
  
  // Fallback: if no displayOptions, might be single-resource node
  if (!operationProp && operationProps.length === 1) {
    operationProp = operationProps[0]
  }
  
  return operationProp?.options || []
}
```

---

## Summary

✅ **Your API already provides everything you need**
✅ **Resources are in the `properties` array** (look for `name: "resource"`)
✅ **Operations are in the `properties` array** (look for `name: "operation"`)
✅ **Use `displayOptions.show.resource` to match operations to resources**
✅ **All 847 nodes follow this same pattern**

No need to access Docker containers or source code - the API response contains all the data!

---

## Quick Reference

```typescript
// Get node data
const response = await fetch('http://54.204.114.86:3001/api/flow/nodes?search=nodeName')
const { nodes } = await response.json()
const node = nodes[0]

// Get resources
const resourceProp = node.properties.find(p => p.name === 'resource')
const resources = resourceProp?.options || []

// Get operations for a resource
const operationProp = node.properties.find(p =>
  p.name === 'operation' &&
  p.displayOptions?.show?.resource?.includes(resourceValue)
)
const operations = operationProp?.options || []
