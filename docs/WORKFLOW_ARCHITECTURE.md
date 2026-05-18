# Workflow System Architecture
**Industry-Standard Centralized & Scalable Design**

## 🏗️ Architecture Overview

Our workflow system follows **industry-standard patterns** for scalability, maintainability, and code reuse.

### ✅ Design Principles Applied

1. **Single Source of Truth** - Centralized constants
2. **Separation of Concerns** - Clear layer boundaries
3. **DRY (Don't Repeat Yourself)** - Reusable hooks & utilities
4. **Type Safety** - TypeScript throughout
5. **Component Composition** - Small, focused components
6. **State Management** - Zustand for global state
7. **API Layer** - Consistent error handling

---

## 📁 File Structure (Centralized)

```
src/
├── lib/workflow/                    # 🎯 CENTRALIZED CONFIGURATION
│   ├── constants.ts                 # ✅ Single source for ALL constants
│   ├── hooks.ts                     # ✅ Reusable custom hooks
│   ├── node-types.ts                # Node type definitions
│   └── node-schemas.ts              # Node parameter schemas
│
├── stores/workflow/                 # 🎯 STATE MANAGEMENT
│   ├── canvas.store.ts              # Canvas & nodes state
│   └── execution.store.ts           # Execution state
│
├── components/workflow/             # 🎯 UI COMPONENTS
│   ├── canvas/                      # Canvas components
│   ├── nodes/                       # Node components
│   ├── config/                      # Configuration panels
│   ├── execution/                   # Execution UI
│   └── pin-data/                    # Pin data UI
│
└── app/api/workflows/               # 🎯 API LAYER
    └── [id]/                        # Workflow endpoints
```

---

## 🎨 Centralized UI Management

### One-Click Theme Changes

All colors, labels, and UI config in **ONE FILE**: `lib/workflow/constants.ts`

#### Example: Change Status Colors App-Wide

```typescript
// In lib/workflow/constants.ts
export const STATUS_COLORS = {
  success: {
    text: 'text-green-500',      // Change to text-emerald-500
    bg: 'bg-green-50',            // Change to bg-emerald-50
    icon: 'text-green-600',       // Change to text-emerald-600
  },
  // ... changes apply EVERYWHERE instantly
}
```

**Affected everywhere:**
- ✅ Node status indicators
- ✅ Execution history cards
- ✅ Execution panel
- ✅ Toast notifications
- ✅ All status displays

#### Example: Change Node Colors

```typescript
// In lib/workflow/constants.ts
export const NODE_COLORS = {
  trigger: '#10b981',   // Change to #00ff00 → affects ALL triggers
  action: '#3b82f6',    // Change to #0000ff → affects ALL actions
}
```

**Affected everywhere:**
- ✅ Node palette
- ✅ Node visuals on canvas
- ✅ Node config panel
- ✅ Node type badges

#### Example: Change UI Sizes

```typescript
// In lib/workflow/constants.ts
export const UI_CONFIG = {
  nodePaletteWidth: 'w-64',         // Change to w-80
  nodeConfigWidth: 'w-96',          // Change to w-[500px]
  autoSaveDelay: 3000,              // Change to 5000ms
  nodeExecutionDelay: 500,          // Change to 1000ms
}
```

---

## 🔧 Reusable Hooks Pattern

### Custom Hooks (lib/workflow/hooks.ts)

Promotes code reuse across components:

```typescript
// ✅ GOOD: Reusable hook
import { useNodeStatus } from '@/lib/workflow/hooks';

function MyComponent({ nodeId }) {
  const { status, isRunning, updateStatus } = useNodeStatus(nodeId);
  // Clean, reusable, consistent
}

// ❌ BAD: Duplicated logic
function MyComponent({ nodeId }) {
  const store = useExecutionStore();
  const status = store.nodeStatuses.get(nodeId);
  const isRunning = status === 'running';
  // Repeated everywhere = maintenance nightmare
}
```

### Available Reusable Hooks

1. **useNodeStatus(nodeId)** - Node execution status
2. **useNodeOutput(nodeId)** - Node output data
3. **useWorkflowExecution()** - Workflow execution
4. **useExecutionFormatters()** - Time/duration formatting
5. **usePinData(node)** - Pin data utilities

---

## 🎯 Component Composition

### Small, Focused Components

Each component has ONE responsibility:

```
WorkflowEditor (Orchestrator)
├── NodePalette (Node list)
├── WorkflowCanvas (Canvas)
├── NodeConfigPanel (Config)
│   ├── ParameterInput (Input)
│   ├── PinDataButton (Button)
│   └── ExecutionPanel (Tabs)
│       ├── Input Tab
│       └── Output Tab
└── ExecutionHistory (History)
```

### Component Reusability

```typescript
// ✅ Reusable components
<PinDataButton nodeId={node.id} />
<ExecutionPanel nodeId={node.id} />
<ParameterInput param={param} value={value} />

// Can be used anywhere in the app
// No duplication, consistent behavior
```

---

## 💾 State Management Pattern

### Zustand Stores (Centralized)

Two focused stores:

1. **canvas.store.ts** - Canvas & nodes
   - Nodes, edges
   - Selection
   - CRUD operations

2. **execution.store.ts** - Execution
   - Current execution
   - Node statuses
   - Execution history
   - Node data (I/O)

### Why Zustand?

- ✅ Simple API
- ✅ No boilerplate
- ✅ TypeScript support
- ✅ DevTools integration
- ✅ Performant (React outside)

```typescript
// Clean, simple usage
const nodes = useCanvasStore(state => state.nodes);
const updateNode = useCanvasStore(state => state.updateNode);
```

---

## 🔌 API Layer Pattern

### Consistent API Structure

```typescript
// All APIs follow same pattern
export async function GET(request, { params }) {
  try {
    // 1. Auth check
    const { user } = await requireServerAuth();
    
    // 2. Validation
    const { id } = await params;
    
    // 3. Database operation
    const data = await supabase.from('table').select();
    
    // 4.
