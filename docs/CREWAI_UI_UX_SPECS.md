# CrewAI UI/UX Specifications

**Complete UI/UX Design for AI Workflow Generation**

---

## 🎨 Visual Design System

### Color Palette

**AI Theme Colors:**
```css
--ai-primary: #8B5CF6;      /* Purple 600 - Main AI actions */
--ai-primary-dark: #7C3AED; /* Purple 700 - Hover states */
--ai-accent: #3B82F6;        /* Blue 600 - Secondary actions */
--ai-success: #10B981;       /* Green 500 - Success states */
--ai-warning: #F59E0B;       /* Amber 500 - Warnings */
--ai-error: #EF4444;         /* Red 500 - Errors */
--ai-bg: #F9FAFB;            /* Gray 50 - Background */
--ai-border: #E5E7EB;        /* Gray 200 - Borders */
```

### Typography

```css
--font-heading: 'Inter', system-ui;
--font-body: 'Inter', system-ui;
--font-mono: 'JetBrains Mono', monospace;

/* Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
```

---

## 📱 Component Specifications

### 1. AI Dialog Container

**Type:** Slide-over panel (right side)

**Dimensions:**
- Width: 480px (mobile: 100vw)
- Height: 100vh
- Padding: 24px
- Animation: Slide from right (300ms ease-out)

**Structure:**
```tsx
<Dialog>
  <DialogOverlay className="backdrop-blur-sm bg-black/20" />
  <DialogContent className="fixed right-0 top-0 h-full w-[480px]">
    <DialogHeader>
      <DialogTitle>Generate with AI</DialogTitle>
      <DialogClose />
    </DialogHeader>
    <DialogBody>{/* Content */}</DialogBody>
    <DialogFooter>{/* Actions */}</DialogFooter>
  </DialogContent>
</Dialog>
```

---

### 2. Prompt Input Area

**Component:** Enhanced Textarea with Smart Features

```
┌────────────────────────────────────────────────────────┐
│  Describe your workflow                          0/500  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Monitor Ethereum gas prices every 10 minutes    │  │
│  │ and send Slack alert if over 50 gwei           │  │
│  │                                                  │  │
│  │ [AI Suggestion Dropdown appears here]          │  │
│  │                                                  │  │
│  └──────────────────────────────────────────────────┘  │
│  💡 Try: "Fetch BTC price hourly and log to DB"       │
└────────────────────────────────────────────────────────┘
```

**Features:**
- Real-time character count
- Auto-suggestions dropdown (debounced 300ms)
- Validation indicators (green checkmark / red x)
- Placeholder with animated examples
- Smart paste handling

**Implementation:**
```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <Label htmlFor="prompt">Describe your workflow</Label>
    <span className={cn(
      "text-sm",
      prompt.length > 450 ? "text-red-500" : "text-gray-500"
    )}>
      {prompt.length}/500
    </span>
  </div>
  
  <Textarea
    id="prompt"
    value={prompt}
    onChange={handlePromptChange}
    placeholder="Example: Monitor SOL price every hour..."
    rows={6}
    maxLength={500}
    className="resize-none"
  />
  
  {suggestions.length > 0 && (
    <DropdownMenu>
      {suggestions.map(s => (
        <DropdownMenuItem onClick={() => setPrompt(s)}>
          {s}
        </DropdownMenuItem>
      ))}
    </DropdownMenu>
  )}
  
  {validation.issues.length > 0 && (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertDescription>
        {validation.issues[0]}
      </AlertDescription>
    </Alert>
  )}
</div>
```

---

### 3. Example Templates

**Layout:** Card Grid with Categories

```
┌─────────────────────────────────────────────────────────┐
│  Quick Start Templates                                   │
│  ┌─────────────┬─────────────┬─────────────┐           │
│  │  Monitoring │   Alerts    │    DeFi     │  ... →    │
│  └─────────────┴─────────────┴─────────────┘           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  📊 ETH Gas Monitor               [Beginner]     │  │
│  │  Check gas prices and alert on spikes            │  │
│  │  ──────────────────────────────────────────────  │  │
│  │  🏷️ ethereum, monitoring, slack                  │  │
│  │  [Use Template →]                                │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  💰 BTC Price Alert            [Beginner]        │  │
│  │  Get notified when Bitcoin hits target price     │  │
│  │  ──────────────────────────────────────────────  │  │
│  │  🏷️ bitcoin, alerts, email                       │  │
│  │  [Use Template →]                                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

**Template Card Component:**
```tsx
<Card className="hover:border-purple-300 transition-colors cursor-pointer">
  <CardHeader>
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-2">
        <span className="text-2xl">{template.icon}</span>
        <CardTitle className="text-base">{template.name}</CardTitle>
      </div>
      <Badge variant={getDifficultyVariant(template.difficulty)}>
        {template.difficulty}
      </Badge>
    </div>
    <CardDescription>{template.description}</CardDescription>
  </CardHeader>
  <CardFooter className="flex items-center justify-between">
    <div className="flex gap-1 flex-wrap">
      {template.tags.slice(0, 3).map(tag => (
        <Badge key={tag} variant="outline" className="text-xs">
          {tag}
        </Badge>
      ))}
    </div>
    <Button 
      size="sm" 
      variant="ghost"
      onClick={() => handleUseTemplate(template)}
    >
      Use Template →
    </Button>
  </CardFooter>
</Card>
```

---

### 4. Generation Progress

**Type:** Multi-Stage Progress with Animations

```
┌────────────────────────────────────────────────────────┐
│  ✨ Generating your workflow...                        │
│                                                         │
│  ████████████████░░░░░░░░░░░░  60%                    │
│                                                         │
│  ✓ Analyzing your request                             │
│  ✓ Planning workflow structure                        │
│  ⟳ Generating FlowSpec with AI...                    │
│  ○ Validating workflow                                │
│                                                         │
│  ⏱️ ~15 seconds remaining                              │
└────────────────────────────────────────────────────────┘
```

**Implementation:**
```tsx
<div className="space-y-4 py-6">
  <div className="flex items-center gap-3">
    <Loader2 className="h-6 w-6 animate-spin text-purple-600" />
    <div>
      <p className="font-medium">Generating your workflow...</p>
      <p className="text-sm text-gray-500">
        Powered by GPT-4 via CrewAI
      </p>
    </div>
  </div>
  
  <Progress value={progress} className="h-2" />
  
  <div className="space-y-2">
    {stages.map((stage, i) => (
      <div key={i} className="flex items-center gap-2 text-sm">
        {stage.status === 'complete' && (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        {stage.status === 'loading' && (
          <Loader2 className="h-4 w-4 animate-spin text-purple-600" />
        )}
        {stage.status === 'pending' && (
          <Circle className="h-4 w-4 text-gray-300" />
        )}
        <span className={stage.status === 'complete' ? 'text-gray-500' : ''}>
          {stage.label}
        </span>
      </div>
    ))}
  </div>
  
  {estimatedTime && (
    <p className="text-sm text-gray-500 flex items-center gap-2">
      <Clock className="h-4 w-4" />
      ~{estimatedTime} seconds remaining
    </p>
  )}
</div>
```

---

### 5. Result Preview

**Type:** Tabbed Interface with Multiple Views

```
┌────────────────────────────────────────────────────────┐
│  ✓ Workflow Generated Successfully!                    │
│                                                         │
│  [Preview] [FlowSpec] [Reasoning]                      │
│  ────────────────────────────────────────────────────  │
│                                                         │
│  ┌──────────────────────────────────────────────────┐ │
│  │                                                    │ │
│  │    [Trigger]  →  [HTTP]  →  [Slack]              │ │
│  │                                                    │ │
│  │    3 nodes, 2 connections                         │ │
│  │    Estimated complexity: Simple                   │ │
│  │                                                    │ │
│  └──────────────────────────────────────────────────┘ │
│                                                         │
│  💡 AI Reasoning:                                       │
│  This workflow monitors gas prices using Etherscan     │
│  API every 10 minutes. When prices exceed 50 gwei,    │
│  it sends a formatted alert to your Slack channel.     │
│                                                         │
│  ⚡ Suggested Improvements:                             │
│  • Add data persistence to track price trends          │
│  • Include average gas price in alert                  │
│                                                         │
│  [Load to Canvas]  [Edit & Load]  [Try Again]         │
└────────────────────────────────────────────────────────┘
```

**Implementation:**
```tsx
<Tabs defaultValue="preview" className="w-full">
  <TabsList className="grid w-full grid-cols-3">
    <TabsTrigger value="preview">Preview</TabsTrigger>
    <TabsTrigger value="flowspec">FlowSpec</TabsTrigger>
    <TabsTrigger value="reasoning">Reasoning</TabsTrigger>
  </TabsList>
  
  <TabsContent value="preview" className="space-y-4">
    <Card>
      <CardContent className="p-6">
        <WorkflowGraphPreview nodes={nodes} edges={edges} />
        <div className="mt-4 text-sm text-gray-500">
          {nodes.length} nodes, {edges.length} connections
          <br />
          Complexity: {result.estimatedComplexity}
        </div>
      </CardContent>
    </Card>
  </TabsContent>
  
  <TabsContent value="flowspec">
    <Card>
      <CardContent className="p-0">
        <pre className="p-4 overflow-auto max-h-96 text-xs">
          <code className="language-json">
            {JSON.stringify(result.flowspec, null, 2)}
          </code>
        </pre>
      </CardContent>
    </Card>
  </TabsContent>
  
  <TabsContent value="reasoning" className="space-y-4">
    <Alert>
      <Sparkles className="h-4 w-4" />
      <AlertTitle>AI Reasoning</AlertTitle>
      <AlertDescription className="mt-2 whitespace-pre-wrap">
        {result.reasoning}
      </AlertDescription>
    </Alert>
    
    {result.suggestedImprovements && (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Suggested Improvements</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {result.suggestedImprovements.map((suggestion, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-purple-600">•</span>
                {suggestion}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    )}
  </TabsContent>
</Tabs>
```

---

### 6. Action Buttons

**Layout:** Primary + Secondary Actions

```
┌────────────────────────────────────────────────────────┐
│  [✨ Load to Canvas]  (Primary CTA)                    │
│  [✏️ Edit & Load]  [🔄 Try Again]  [💾 Save Template] │
│                                                         │
│  Rate Limit: 7 remaining this hour                     │
└────────────────────────────────────────────────────────┘
```

**Implementation:**
```tsx
<div className="space-y-3">
  <Button 
    size="lg" 
    className="w-full bg-gradient-to-r from-purple-600 to-blue-600"
    onClick={handleLoadToCanvas}
  >
    <Sparkles className="mr-2 h-5 w-5" />
    Load to Canvas
  </Button>
  
  <div className="grid grid-cols-3 gap-2">
    <Button variant="outline" onClick={handleEditAndLoad}>
      <Edit className="mr-2 h-4 w-4" />
      Edit
    </Button>
    <Button variant="outline" onClick={handleRegenerate}>
      <RefreshCw className="mr-2 h-4 w-4" />
      Retry
    </Button>
    <Button variant="outline" onClick={handleSaveTemplate}>
      <Save className="mr-2 h-4 w-4" />
      Save
    </Button>
  </div>
  
  {rateLimit && (
    <p className="text-xs text-center text-gray-500">
      {rateLimit.remaining} generations remaining this hour
    </p>
  )}
</div>
```

---

## 🎭 Animations & Transitions

### Entry Animation
```css
@keyframes slideInRight {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.ai-dialog-enter {
  animation: slideInRight 300ms ease-out;
}
```

### Loading States
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.loading-stage {
  animation: pulse 2s ease-in-out infinite;
}
```

### Success Celebration
```tsx
// Confetti on successful generation
import confetti from 'canvas-confetti';

confetti({
  particleCount: 100,
  spread: 70,
  origin: { y: 0.6 }
});
```

---

## 📊 User Flow

### Happy Path
```
1. User clicks "Generate with AI" button
   ↓
2. AI Dialog slides in from right
   ↓
3. User types prompt OR selects template
   ↓
4. Real-time validation (green checkmark)
   ↓
5. Click "Generate" button
   ↓
6. Progress indicator shows stages
   ↓
7. Success! Preview shows workflow
   ↓
8. User reviews reasoning & preview
   ↓
9. Click "Load to Canvas"
   ↓
10. Workflow animates into canvas
    ↓
11. User can edit and save
```

### Error Handling
```
Rate Limit Hit:
  → Show remaining time
  → Suggest manual creation
  → Offer template library

Invalid Prompt:
  → Show specific issues
  → Provide suggestions
  → Link to examples

Generation Failed:
  → Clear error message
  → Retry button
  → Option to contact support

Network Error:
  → Offline indicator
  → Retry with backoff
  → Cache last attempt
```

---

## 🔐 Security Indicators

### Trust Signals
```
┌────────────────────────────────────────────────────────┐
│  🔒 Your data is secure                                │
│  • Prompts are not stored permanently                  │
│  • Generated workflows are private                     │
│  • Rate limited to prevent abuse                       │
│                                                         │
│  Powered by GPT-4 via Lucid-L2 CrewAI                 │
└────────────────────────────────────────────────────────┘
```

---

## 📱 Responsive Design

### Mobile (<640px)
- Full-screen modal
- Stacked action buttons
- Simplified template cards
- Bottom sheet for results

### Tablet (640-1024px)
- Slide-over panel (400px wide)
- Grid template layout (2 cols)
- Inline results

### Desktop (>1024px)
- Slide-over panel (480px wide)
- Grid template layout (3 cols)
- Side-by-side results

---

## ♿ Accessibility

### ARIA Labels
```tsx
<Dialog
  role="dialog"
  aria-labelledby="ai-dialog-title"
  aria-describedby="ai-dialog-description"
>
  <DialogTitle id="ai-dialog-title">
    AI Workflow Generator
  </DialogTitle>
  <DialogDescription id="ai-dialog-description">
    Generate workflows from natural language using AI
  </DialogDescription>
</Dialog>
```

### Keyboard Navigation
- `Escape` - Close dialog
- `Tab` - Navigate through inputs
- `Enter` - Submit/Generate
- `Ctrl+K` - Open AI dialog (global shortcut)

### Screen Reader Support
- Announce loading states
- Describe progress stages
- Read generated reasoning
- Confirm actions

---

## 🎯 Success Metrics

### User Engagement
- % of users who try AI generation
- Average prompts per user
- Template vs custom prompt ratio
- Regeneration rate

### Quality Metrics
- % workflows loaded to canvas
- % workflows saved after generation
- % workflows executed successfully
- User satisfaction ratings

### Performance
- Time to first result (<20s target)
- API error rate (<1% target)
- Rate limit hit rate (<5% users)

---

## 🚀 Implementation Checklist

- [ ] Create AI helper libraries (validation, templates, rate-limit)
- [ ] Extend Lucid-L2 client with AI methods
- [ ] Create API route with centralized patterns
- [ ] Apply database migration
- [ ] Build UI components (dialog, input, preview)
- [ ] Add animations and transitions
- [ ] Implement error handling
- [ ] Add accessibility features
- [ ] Test on all devices
- [ ] Monitor metrics

---

**This design provides:**
✅ Production-grade architecture
✅ Scalable and secure implementation
✅ Excellent user experience
✅ Industry-standard patterns
✅ Complete accessibility
✅ Comprehensive error handling
