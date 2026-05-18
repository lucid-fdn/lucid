# Lucid Flows Transformation
## From Graph-First to Prompt-First Apple Experience

**Date:** October 20, 2025  
**Status:** Planning → Implementation  
**Goal:** Transform workflow creation into an Apple-inspired, prompt-first experience

---

## 📋 Executive Summary

### Vision
Transform LucidMerged's workflow builder from a traditional node-based editor into a **prompt-first, Apple-inspired experience** where users describe what they want in natural language, and the system generates beautiful, readable workflows.

### Key Principles
1. **Prompt-First**: Natural language is the primary interface
2. **Apple Design**: Calm, confident, breathing interactions
3. **Progressive Disclosure**: Complexity revealed only when needed
4. **Story View**: Workflows read like prose ("When X, If Y, Do Z")
5. **Trust Without Friction**: Proofs optional, speed never compromised

### Success Metrics
- ⏱️ Time to first workflow: <2 minutes (target)
- 📊 Story View engagement: >70% users prefer over graph
- ✍️ Edit-in-English usage: >50% of edits via natural language
- ⚡ Performance: <100ms for all interactions (hot path)
- 🎯 Confidence meter accuracy: >85% correct readiness assessments

---

## 🔍 Current State Analysis

### What We Have Now

**AI Dialog Component** (`src/components/workflow/ai-workflow-dialog.tsx`)
- Template cards front and center (4 visible templates)
- Basic textarea for workflow description (500 char limit)
- Two-tab result view (Preview/Reasoning)
- "Load to Canvas" immediately shows graph
- Traditional graph-first mindset

**Technical Issues**
- Toast API incorrectly used (`.error()`, `.success()`, `.info()`)
- No streaming support (complete response only)
- No progressive disclosure
- No Apple-level polish

### What Needs to Change

**Interface Transformation**
- ❌ Templates as hero → ✅ Prompt as hero
- ❌ Small textarea → ✅ Large, breathing input
- ❌ Tabs (Preview/Reasoning) → ✅ Story View → Structure View
- ❌ Immediate graph → ✅ Progressive disclosure
- ❌ Generic design → ✅ Apple aesthetics

**Technical Debt**
- Fix toast bug in `use-ai-workflow.ts`
- Add streaming support to `/api/ai/generate-workflow`
- Implement Story View renderer
- Add confidence meter
- Add proof sparkles (Thought Epochs)

---

## 🎨 Vision: The Lucid Flows Experience

### The User Journey

#### 1. Entry Point: Hero Prompt
```
┌─────────────────────────────────────────────┐
│  ✨ Create Your Automation                  │
├─────────────────────────────────────────────┤
│                                             │
│  [Large, breathing prompt input]            │
│  "Describe what you want to automate..."    │
│                                             │
│  💡 Try:                                    │
│  [Customer support agent]                   │
│  [Weekly revenue digest]                    │
│  [Slack payment alerts]                     │
│                                             │
│  🎤 [Voice input button]                    │
└─────────────────────────────────────────────┘
```

**Key Features:**
- Minimum 140px tall input
- Ghost text suggestions
- Example chips below (one-click populate)
- Voice input for mobile
- Character counter (subtle, bottom-right)

#### 2. Story View: Readable Prose
```
┌─────────────────────────────────────────────┐
│  Your Automation Plan                       │
├─────────────────────────────────────────────┤
│                                             │
│  ● When: New Stripe payment arrives         │
│    Trigger on successful payment events     │
│                                             │
│  ● If: Amount is greater than $0            │
│    Validate payment has value               │
│                                             │
│  ● Do: Post message to #sales in Slack      │
│    Notify team of new customer              │
│                                             │
│  ● And: Append row to 'Customers' sheet     │
│    Log customer details                     │
│                                             │
│  ● And: Save receipt for audit              │
│    Store Thought Epoch proof                │
│                                             │
│  [Confidence: 95% Ready]  ✨ Proof enabled  │
│                                             │
│  [Load to Canvas]    [Reveal Structure →]   │
└─────────────────────────────────────────────┘
```

**Key Features:**
- Each line is a tappable card
- Click to edit in natural language
- Confidence meter shows readiness
- Proof sparkle if Thought Epochs enabled
- "Reveal Structure" morphs to graph

#### 3. Structure View: Optional Graph
```
┌─────────────────────────────────────────────┐
│  ← Back to Story View                       │
├─────────────────────────────────────────────┤
│                                             │
│       [React Flow Canvas]                   │
│                                             │
│     ┌─────┐                                 │
│     │Start│─┐                               │
│     └─────┘ │                               │
│             ├──→[Check]──→[Slack]           │
│             │                                │
│             └──→[Sheet]──→[Save]            │
│                                             │
└─────────────────────────────────────────────┘
```

**Key Features:**
- Smooth morph transition (240ms)
- Graph always in sync with Story View
- Can edit in either view
- "Back to Story View" button

---

## 🏗️ Technical Architecture

### Technology Stack

**Foundation**
```
Vercel AI SDK (ai package)
    ├─ useChat() hook
    ├─ streamText() API
    └─ Response streaming
    ↓
Prompt Kit Components
    ├─ <PromptInput>
    ├─ <PromptSuggestion>
    ├─ <Message>
    └─ <Steps>
    ↓
shadcn/ui Components (existing)
    ├─ Button, Dialog, Card
    └─ All UI primitives
    ↓
Framer Motion (animations)
    └─ View transitions, sparkles
```

**Custom Layer**
```
Story View Renderer (~300 LOC)
Confidence Meter (~100 LOC)
Proof Sparkles (~50 LOC)
Progressive Disclosure (~150 LOC)
Apple Design Tokens (~100 LOC)
```

### Data Flow Architecture

```typescript
// 1. User Input
Prompt Input
    ↓
    
// 2. Streaming Generation
useChat() → /api/ai/generate-workflow → CrewAI
    ↓
    
// 3. Response Parsing
FlowSpec JSON
    ↓
    
// 4. Dual Rendering
├─→ Story View (FlowSpec → Prose)
└─→ Structure View (FlowSpec → React Flow)
    ↓
    
// 5. User Edits
Edit in English → Update FlowSpec → Sync Both Views
```

### Component Architecture

#### Core Components

**1. ApplePromptInput** (New - ~150 LOC)
```tsx
// src/components/ai/apple-prompt-input.tsx

interface ApplePromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  suggestions?: string[];
  placeholder?: string;
  maxLength?: number;
}

// Features:
// - Large, breathing textarea (min 140px)
// - Ghost text with suggested prompts
// - Character counter
// - Voice input button
// - Submit on Enter (with Shift+Enter for newline)
// - 8pt spacing, Inter font, porcelain background
```

**2. StoryView** (New - ~300 LOC)
```tsx
// src/components/ai/story-view.tsx

interface StoryViewProps {
  flowspec: FlowSpec;
  onEdit?: (nodeId: string, newText: string) => void;
  confidence?: number;
  proofEnabled?: boolean;
}

// Features:
// - Parse FlowSpec → readable prose
// - Render as step cards (When/If/Do)
// - Click to edit inline
// - Confidence meter display
// - Proof sparkle if enabled
// - Smooth animations
```

**3. ConfidenceMeter** (New - ~100 LOC)
```tsx
// src/components/ai/confidence-meter.tsx

interface ConfidenceMeterProps {
  workflow: FlowSpec;
  onAnalyze?: () => ConfidenceResult;
}

interface ConfidenceResult {
  percentage: number;
  status: 'needs-review' | 'ready' | 'excellent';
  issues: string[];
  suggestions: string[];
}

// Checks:
// - All nodes have required parameters
// - Authentication configured
// - Fields properly mapped
// - No circular dependencies
// - Valid triggers
```

**4. ProofSparkles** (New - ~50 LOC)
```tsx
// src/components/ai/proof-sparkles.tsx

interface ProofSparklesProps {
  show: boolean;
  position?: 'top-right' | 'bottom-right';
}

// Features:
// - Tiny animated dot (Lottie or CSS keyframes)
// - Appears when Thought Epoch receipt lands
// - 1s sparkle animation
// - Tooltip: "Proof saved to LucidScan"
```

**5. ProgressiveDisclosure** (New - ~150 LOC)
```tsx
// src/components/ai/progressive-disclosure.tsx

type ViewMode = 'prompt' | 'story' | 'structure';

interface ProgressiveDisclosureProps {
  mode: ViewMode;
  onModeChange: (mode: ViewMode) => void;
  flowspec: FlowSpec | null;
  children: React.ReactNode;
}

// Features:
// - Smooth morphing transitions (240ms)
// - Framer Motion AnimatePresence
// - State management
// - Breadcrumb-style mode switcher
```

---

## 🎯 Implementation Plan

### Phase 1: Foundation (Estimated: 2 hours)

**Goals:**
- Install dependencies
- Fix existing bugs
- Set up streaming infrastructure

**Tasks:**
1. **Install Vercel AI SDK**
   ```bash
   npm install ai
   ```

2. **Install Prompt Kit Components**
   ```bash
   npx shadcn@latest add "https://prompt-kit.com/c/prompt-input.json"
   npx shadcn@latest add "https://prompt-kit.com/c/prompt-suggestion.json"
   npx shadcn@latest add "https://prompt-kit.com/c/message.json"
   npx shadcn@latest add "https://prompt-kit.com/c/steps.json"
   ```

3. **Fix Toast Bug** (`src/hooks/use-ai-workflow.ts`)
   ```typescript
   // Line 51: Change from
   toast.info('Generating Workflow', 'AI is analyzing...');
   
   // To
   toast({
     title: 'Generating Workflow',
     description: 'AI is analyzing your request...',
   });
   
   // Line 73: Change from
   toast.success('Workflow Generated!', `${data.complexity}...`);
   
   // To
   toast({
     title: 'Workflow Generated!',
     description: `${data.complexity} - ${data.rateLimit.remaining}/${data.rateLimit.limit} remaining`,
   });
   
   // Line 83: Change from
   toast.error('Generation Failed', errorMessage);
   
   // To
   toast({
     title: 'Generation Failed',
     description: errorMessage,
     variant: 'destructive',
   });
   ```

4. **Update API for Streaming** (`src/app/api/ai/generate-workflow/route.ts`)
   ```typescript
   import { streamText } from 'ai';
   
   export async function POST(req: Request) {
     const { messages, goal } = await req.json();
     
     const result = await streamText({
       model: yourModel,
       messages,
       onFinish: async ({ text }) => {
         // Generate FlowSpec from final response
         const flowspec = await generateFlowSpec(text);
         return flowspec;
       }
     });
     
     return result.toDataStreamResponse();
   }
   ```

5. **Create useAIWorkflow Hook Wrapper**
   ```typescript
   // src/hooks/use-ai-workflow-streaming.ts
   import { useChat } from 'ai/react';
   
   export function useAIWorkflowStreaming() {
     const { messages, input, handleSubmit, isLoading } = useChat({
       api: '/api/ai/generate-workflow',
       onFinish: (message) => {
         // Parse FlowSpec from final message
         const flowspec = parseFlowSpec(message.content);
         return flowspec;
       }
     });
     
     return { messages, input, handleSubmit, isLoading };
   }
   ```

**Deliverables:**
- ✅ All dependencies installed
- ✅ Toast bug fixed
- ✅ Streaming API working
- ✅ Test streaming with simple prompt

---

### Phase 2: Prompt-First UI (Estimated: 3 hours)

**Goals:**
- Replace template cards with hero prompt
- Implement basic Story View
- Add suggestion chips

**Tasks:**

1. **Create Apple Prompt Input** (`src/components/ai/apple-prompt-input.tsx`)
   ```typescript
   export function ApplePromptInput({ 
     value, 
     onChange, 
     onSubmit,
     suggestions = [],
     placeholder = "Describe what you want to automate..."
   }: ApplePromptInputProps) {
     return (
       <div className="relative">
         {/* Large breathing textarea */}
         <textarea
           value={value}
           onChange={(e) => onChange(e.target.value)}
           placeholder={placeholder}
           className="
             min-h-[140px] w-full
             rounded-xl
             border-2 border-mist
             focus:border-lucid-blue
             bg-porcelain/50 backdrop-blur
             px-6 py-5
             text-base leading-relaxed
             placeholder:text-graphite-400
             resize-none outline-none
             transition-all duration-200
           "
           onKeyDown={(e) => {
             if (e.key === 'Enter' && !e.shiftKey) {
               e.preventDefault();
               onSubmit();
             }
           }}
         />
         
         {/* Character counter */}
         <div className="absolute bottom-4 right-4 text-xs text-graphite-400">
           {value.length}/500
         </div>
         
         {/* Voice input button (mobile) */}
         <button className="absolute bottom-4 left-4 md:hidden">
           <MicIcon className="w-5 h-5 text-graphite-600" />
         </button>
       </div>
     );
   }
   ```

2. **Add Suggestion Chips** (using Prompt Kit)
   ```tsx
   <div className="flex gap-2 mt-4">
     <PromptSuggestion onClick={() => setValue("Customer support agent...")}>
       Customer support agent
     </PromptSuggestion>
     <PromptSuggestion onClick={() => setValue("Weekly revenue digest...")}>
       Weekly revenue digest
     </PromptSuggestion>
     <PromptSuggestion onClick={() => setValue("Slack payment alerts...")}>
       Slack payment alerts
     </PromptSuggestion>
   </div>
   ```

3. **Create Basic Story View** (`src/components/ai/story-view.tsx`)
   ```typescript
   export function StoryView({ flowspec }: StoryViewProps) {
     const steps = parseFlowSpecToSteps(flowspec);
     
     return (
       <div className="space-y-4">
         <h3 className="text-lg font-semibold">Your Automation Plan</h3>
         
         <Steps>
           {steps.map((step, index) => (
             <Step key={index} title={step.title}>
               {step.description}
             </Step>
           ))}
         </Steps>
         
         <div className="flex gap-3 mt-6">
           <Button onClick={loadToCanvas}>
             Load to Canvas
           </Button>
           <Button variant="ghost" onClick={revealStructure}>
             Reveal Structure →
           </Button>
         </div>
       </div>
     );
   }
   
   function parseFlowSpecToSteps(flowspec: FlowSpec) {
     const steps = [];
     
     // Trigger
     if (flowspec.trigger) {
       steps.push({
         title: `When: ${formatTrigger(flowspec.trigger)}`,
         description: getTriggerDescription(flowspec.trigger)
       });
     }
     
     // Conditions
     flowspec.nodes
       .filter(n => n.type.includes('condition'))
       .forEach(node => {
         steps.push({
           title: `If: ${formatCondition(node)}`,
           description: getConditionDescription(node)
         });
       });
     
     // Actions
     flowspec.nodes
       .filter(n => n.type.includes('action'))
       .forEach(node => {
         steps.push({
           title: `Do: ${formatAction(node)}`,
           description: getActionDescription(node)
         });
       });
     
     return steps;
   }
   ```

4. **Rebuild AI Dialog** (`src/components/workflow/ai-workflow-dialog.tsx`)
   ```tsx
   export function AIWorkflowDialog({ open, onOpenChange }: Props) {
     const [input, setInput] = useState('');
     const [viewMode, setViewMode] = useState<'prompt' | 'story'>('prompt');
     const { messages, handleSubmit, isLoading } = useAIWorkflowStreaming();
     
     return (
       <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="max-w-3xl">
           {viewMode === 'prompt' ? (
             <>
               <DialogHeader>
                 <DialogTitle>✨ Create Your Automation</DialogTitle>
               </DialogHeader>
               
               <ApplePromptInput
                 value={input}
                 onChange={setInput}
                 onSubmit={handleSubmit}
                 suggestions={EXAMPLE_PROMPTS}
               />
               
               <div className="flex gap-2">
                 {EXAMPLE_PROMPTS.map(prompt => (
                   <PromptSuggestion 
                     key={prompt}
                     onClick={() => setInput(prompt)}
                   >
                     {prompt}
                   </PromptSuggestion>
                 ))}
               </div>
             </>
           ) : (
             <StoryView 
               flowspec={parseFlowSpec(messages[messages.length - 1])}
               onLoadToCanvas={() => {/* ... */}}
               onRevealStructure={() => {/* ... */}}
             />
           )}
         </DialogContent>
       </Dialog>
     );
   }
   ```

**Deliverables:**
- ✅ Hero prompt input working
- ✅ Suggestion chips functional
- ✅ Basic Story View rendering
- ✅ Load to canvas integration

---

### Phase 3: Apple Aesthetics (Estimated: 3 hours)

**Goals:**
- Apply design tokens
- Implement motion library
- Polish all interactions

**Tasks:**

1. **Create Design Tokens** (`src/lib/design/tokens.ts`)
   ```typescript
   export const tokens = {
     space: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
     
     font: {
       family: {
         sans: 'Inter, system-ui, sans-serif',
         mono: 'JetBrains Mono, monospace'
       },
       size: { xs: 12, sm: 14, base: 16, lg: 20, xl: 24, xxl: 34 },
       weight: { regular: 400, medium: 500, semibold: 600, bold: 700 }
     },
     
     color: {
       neutral: {
         porcelain: '#F7F8FA',
         mist: '#ECEEF2',
         graphite: { 400: '#9CA3AF', 600: '#5E6673' },
         ink: { 900: '#14191F' }
       },
       accent: { lucid: '#0B84F3', purple: '#8B5CF6' },
       semantic: { success: '#2AB673', warning: '#F5B84B', danger: '#E05252' }
     },
     
     motion: {
       duration: { instant: 120, reveal: 200, morph: 240, slow: 400 },
       easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'
     },
     
     shadow: {
       sm: '0 1px 2px rgba(0,0,0,0.05)',
       md: '0 4px 6px rgba(0,0,0,0.07)',
       lg: '0 10px 15px rgba(0,0,0,0.1)'
     }
   };
   ```

2. **Create Motion Library** (`src/lib/design/motion.ts`)
   ```typescript
   export const animations = {
     breathe: {
       initial: { scale: 1 },
       whileHover: { scale: 1.02 },
       transition: { duration: 0.12, ease: [0.2, 0.8, 0.2, 1] }
     },
     
     fadeIn: {
       initial: { opacity: 0 },
       animate: { opacity: 1 },
       exit: { opacity: 0 },
       transition: { duration: 0.2 }
     },
     
     slideUp: {
       initial: { opacity: 0, y: 8 },
       animate: { opacity: 1, y: 0 },
       transition: { duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }
     },
     
     morph: {
       transition: { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }
     },
     
     sparkle: {
       keyframes: {
         '0%, 100%': { opacity: 0, scale: 0.5 },
         '50%': { opacity: 1, scale: 1 }
       },
       duration: '1s',
       timingFunction: 'ease-in-out'
     }
   };
   ```

3. **Apply Tokens to Components**
   - Update ApplePromptInput with tokens
   - Update StoryView cards with tokens
   - Add breathing animations
   - Polish spacing (8pt grid)

4. **Add Focus Rings**
   ```css
   /* globals.css */
   *:focus-visible {
     outline: 2px solid var(--lucid-blue);
     outline-offset: 2px;
   }
   
   @media (prefers-contrast: high) {
     *:focus-visible {
       outline-width: 3px;
     }
   }
   ```

**Deliverables:**
- ✅ Design tokens implemented
- ✅ Motion library created
- ✅ All components use tokens
- ✅ Breathing animations working
- ✅ 8pt spacing grid applied

---

### Phase 4: Story View Logic (Estimated: 3 hours)

**Goals:**
- Complete Story View parser
- Implement inline editing
- Add step card interactions

**Tasks:**

1. **Complete FlowSpec Parser** (`src/lib/ai/flowspec-parser.ts`)
   ```typescript
   export function parseFlowSpecToStorySteps(flowspec: FlowSpec): StoryStep[] {
     const steps: StoryStep[] = [];
     
     // Parse trigger
     steps.push({
       id: 'trigger',
       type: 'when',
       title: formatTrigger(flowspec.trigger),
       description: describeTrigger(flowspec.trigger),
       icon: getTriggerIcon(flowspec.trigger),
       editable: true
     });
     
     // Parse conditions
     flowspec.nodes
       .filter(node => isConditionNode(node))
       .forEach((node, index) => {
         steps.push({
           id: node.id,
           type: 'if',
           title: formatCondition(node),
           description: describeCondition(node),
           icon: 'filter',
           editable: true
         });
       });
     
     // Parse actions
     flowspec.nodes
       .filter(node => isActionNode(node))
       .forEach((node, index) => {
         steps.push({
           id: node.id,
           type: 'do',
           title: formatAction(node),
           description: describeAction(node),
           icon: getActionIcon(node.type),
           editable: true
         });
       });
     
     return steps;
   }
   
   function formatTrigger(trigger: TriggerNode): string {
     switch (trigger.type) {
       case 'webhook':
         return 'Webhook is called';
       case 'schedule':
         return `On schedule: ${trigger.config.schedule}`;
       case 'manual':
         return 'Manual trigger';
       default:
         return 'Unknown trigger';
     }
   }
   
   function formatAction(node: FlowNode): string {
     const actionMap = {
       'tool.http': 'Make HTTP request',
       'llm.chat': 'Get AI response',
       'solana.write': 'Write to blockchain',
       // ... more mappings
     };
     
     return actionMap[node.type] || node.type;
   }
   ```

2. **Implement Inline Editing**
   ```tsx
   function StoryStepCard({ step, onEdit }: StoryStepCardProps) {
     const [isEditing, setIsEditing] = useState(false);
     const [editText, setEditText] = useState('');
     
     const handleEdit = async () => {
       // Send edit request in natural language
       const updatedFlowSpec = await updateWithNaturalLanguage(
         step.id,
         editText
       );
       onEdit(updatedFlowSpec);
       setIsEditing(false);
     };
     
     return (
       <motion.div
         {...animations.breathe}
         className="p-4 rounded-lg bg-white border border-mist hover:border-lucid-blue"
         onClick={() => step.editable && setIsEditing(true)}
       >
         {isEditing ? (
           <div className="space-y-2">
             <input
               value={editText}
               onChange={(e) => setEditText(e.target.value)}
               placeholder={`Edit: "${step.title}"`}
               className="w-full px-3 py-2 border border-mist rounded"
               autoFocus
             />
             <div className="flex gap-2">
               <Button size="sm" onClick={handleEdit}>Save</Button>
               <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)}>
                 Cancel
               </Button>
             </div>
           </div>
         ) : (
           <div className="flex items-start gap-3">
             <div className="w-8 h-8 rounded-full bg-lucid-blue/10 flex items-center justify-center">
               <Icon name={step.icon} className="w-4 h-4 text-lucid-blue" />
             </div>
             <div>
               <h4 className="text-sm font-medium text-ink-900">
                 {step.type}: {step.title}
               </h4>
               <p className="text-sm text-graphite-600 mt-1">
                 {step.description}
               </p>
             </div>
           </div>
         )}
       </motion.div>
     );
   }
   ```

3. **Add "+" Button Between Steps**
   ```tsx
   function AddStepButton({ afterStep, onAdd }: AddStepButtonProps) {
     const [prompt, setPrompt] = useState('');
     
     return (
       <div className="relative h-8 flex items-center justify-center">
         <button
           className="w-8 h-8 rounded-full bg-mist hover:bg-lucid-blue/10 
                      flex items-center justify-center
                      transition-colors duration-120"
           onClick={() => setPrompt('')}
         >
           <Plus className="w-4 h-4 text-graphite-600" />
         </button>
         
         {prompt !== null && (
           <Popover>
             <input
               value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
               placeholder="What should happen next?"
               className="w-full px-3 py-2"
             />
             <Button onClick={() => onAdd(afterStep, prompt)}>
               Add Step
             </Button>
           </Popover>
         )}
       </div>
     );
   }
   ```

**Deliverables:**
- ✅ FlowSpec parser complete
- ✅ Inline editing working
- ✅ Add/remove steps functional
- ✅ Natural language updates

---

### Phase 5: Unique Features (Estimated: 2 hours)

**Goals:**
- Implement confidence meter
- Add proof sparkles
- Complete progressive disclosure

**Tasks:**

1. **Confidence Meter** (`src/components/ai/confidence-meter.tsx`)
   ```tsx
   export function ConfidenceMeter({ workflow }: ConfidenceMeterProps) {
     const confidence = analyzeWorkflowConfidence(workflow);
     
     return (
       <div className="flex items-center gap-3 p-3 bg-porcelain rounded-lg">
         {/* Progress ring */}
         <svg className="w-10 h-10" viewBox="0 0 36 36">
           <circle
             cx="18" cy="18" r="16"
             fill="none"
             stroke="#ECEEF2"
             strokeWidth="3"
           />
           <circle
             cx="18" cy="18" r="16"
             fill="none"
             stroke={getStatusColor(confidence.status)}
             strokeWidth="3"
             strokeDasharray="100"
             strokeDashoffset={100 - confidence.percentage}
             className="transition-all duration-400"
           />
         </svg>
         
         {/* Status text */}
         <div>
           <div className="text-sm font-medium text-ink-900">
             {getStatusLabel(confidence.status)}
           </div>
           {confidence.issues.length > 0 && (
             <Popover>
               <PopoverTrigger className="text-xs text-graphite-600 hover:text-lucid-blue">
                 {confidence.issues.length} issue{confidence.issues.length > 1 ? 's' : ''}
               </PopoverTrigger>
               <PopoverContent>
                 <ul className="space-y-1">
                   {confidence.issues.map((issue, i) => (
                     <li key={i} className="text-sm">{issue}</li>
                   ))}
                 </ul>
               </PopoverContent>
             </Popover
