'use client'

import * as React from 'react'
import { AlertCircle, ArrowRight, Check, Info, Loader2, Mail, Plus, Search, Sparkles } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/ui/components/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/radix-tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/animate-ui/primitives/radix/tooltip'

// Semantic color tokens defined in src/styles/tailwind.css
const SEMANTIC_TOKENS = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'secondary',
  'muted',
  'accent',
  'destructive',
  'border',
  'input',
  'ring',
] as const

const CHART_TOKENS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'] as const

const BUTTON_VARIANTS = ['default', 'secondary', 'outline', 'ghost', 'link', 'destructive'] as const
const BUTTON_SIZES = ['xs', 'sm', 'default', 'lg'] as const

const MOTION = [
  { name: 'state-enter', class: 'animate-state-enter', desc: '240ms cubic-bezier — soft entry' },
  { name: 'success-flash', class: 'animate-success-flash', desc: '600ms — confirm action' },
  { name: 'error-shake', class: 'animate-error-shake', desc: '400ms — invalid input' },
  { name: 'bell-shake', class: 'animate-bell-shake', desc: '500ms — notification nudge' },
  { name: 'recovery-bounce', class: 'animate-recovery-bounce', desc: '500ms — restore state' },
]

export default function StyleguidePage() {
  const [progress, setProgress] = React.useState(60)

  return (
    <div className="mx-auto max-w-6xl px-6 py-12 space-y-16">
      {/* Header */}
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-mono">
          <Sparkles className="size-3.5" /> Internal · design reference
        </div>
        <h1 className="text-4xl font-semibold tracking-tight">Lucid Styleguide</h1>
        <p className="text-muted-foreground max-w-2xl">
          Canonical primitives, semantic tokens, and motion used across the product. Keep this
          in sync with <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">src/components/ui/</code>{' '}
          and the design doctrine in{' '}
          <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted">CLAUDE.md</code>.
        </p>
      </header>

      {/* Tokens */}
      <Section id="tokens" title="Color tokens" description="Semantic tokens reference CSS vars defined in tailwind.css. Always prefer semantic tokens over raw colors.">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {SEMANTIC_TOKENS.map((token) => (
            <div key={token} className="rounded-lg border overflow-hidden">
              <div
                className="h-16 border-b"
                style={{ backgroundColor: `var(--${token})` }}
                aria-label={token}
              />
              <div className="px-3 py-2">
                <div className="text-xs font-mono">{token}</div>
                <div className="text-[10px] text-muted-foreground font-mono">--{token}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono mb-2">Chart palette</div>
          <div className="grid grid-cols-5 gap-3">
            {CHART_TOKENS.map((token) => (
              <div key={token} className="rounded-lg border overflow-hidden">
                <div className="h-12" style={{ backgroundColor: `var(--${token})` }} />
                <div className="px-2 py-1.5 text-[10px] font-mono">{token}</div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Typography */}
      <Section id="typography" title="Typography" description="Sentence case. Monospace for data, numbers, identifiers.">
        <div className="space-y-4">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">display / 4xl</div>
            <div className="text-4xl font-semibold tracking-tight">Your agents are alive.</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">heading / 2xl</div>
            <div className="text-2xl font-semibold">Fleet overview</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">title / lg</div>
            <div className="text-lg font-medium">Recent activity</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">body / base</div>
            <div className="text-base text-muted-foreground">
              Agents run across channels, skills, and runtimes. Keep an eye on health, cost, and approvals.
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">caption / xs</div>
            <div className="text-xs text-muted-foreground">Last sync 30s ago</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">mono / data</div>
            <div className="text-sm font-mono">0x742d35Cc6634C0532925a3b844Bc9e7595f0b2E5</div>
          </div>
        </div>
      </Section>

      {/* Buttons */}
      <Section id="buttons" title="Buttons" description="Primary actions use default. Destructive only for irreversible actions. Ghost for subtle.">
        <div className="space-y-6">
          <Row label="Variants">
            {BUTTON_VARIANTS.map((v) => (
              <Button key={v} variant={v}>
                {capitalize(v)}
              </Button>
            ))}
          </Row>
          <Row label="Sizes">
            {BUTTON_SIZES.map((s) => (
              <Button key={s} size={s}>
                {capitalize(s)}
              </Button>
            ))}
            <Button size="icon" aria-label="Add">
              <Plus />
            </Button>
          </Row>
          <Row label="States">
            <Button>Default</Button>
            <Button disabled>Disabled</Button>
            <Button>
              <Loader2 className="animate-spin" />
              Loading
            </Button>
            <Button>
              <Check />
              With icon
            </Button>
            <Button variant="outline">
              Continue <ArrowRight />
            </Button>
          </Row>
        </div>
      </Section>

      {/* Form controls */}
      <Section id="forms" title="Form controls" description="Labels always visible. Use helper text instead of placeholder-only.">
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="sg-email">Email</Label>
            <Input id="sg-email" type="email" placeholder="you@lucid.ai" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sg-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input id="sg-search" className="pl-9" placeholder="Agents, skills, runs…" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sg-textarea">Notes</Label>
            <Textarea id="sg-textarea" placeholder="Describe what this agent does…" rows={3} />
          </div>
          <div className="space-y-2">
            <Label>Model</Label>
            <Select defaultValue="gpt-4.1">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4.1">gpt-4.1</SelectItem>
                <SelectItem value="gpt-4.1-mini">gpt-4.1-mini</SelectItem>
                <SelectItem value="claude-opus-4">claude-opus-4</SelectItem>
                <SelectItem value="claude-sonnet-4">claude-sonnet-4</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-3">
            <Label>Channels</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox defaultChecked /> Telegram
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox /> Discord
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox /> Slack
              </label>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Runtime</Label>
            <RadioGroup defaultValue="shared">
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="shared" /> Shared
              </label>
              <label className="flex items-center gap-2 text-sm">
                <RadioGroupItem value="dedicated" /> Dedicated
              </label>
            </RadioGroup>
          </div>
          <div className="space-y-3">
            <Label>Toggles</Label>
            <div className="flex items-center gap-3 text-sm">
              <Switch defaultChecked id="sg-notif" />
              <Label htmlFor="sg-notif" className="font-normal">
                Slack alerts on approvals
              </Label>
            </div>
          </div>
          <div className="space-y-3">
            <Label>Cost limit (USD / day)</Label>
            <Slider defaultValue={[25]} max={100} step={1} />
          </div>
        </div>
      </Section>

      {/* Feedback */}
      <Section id="feedback" title="Feedback" description="Color maps to state. Never use color alone — always pair with icon or label.">
        <div className="space-y-6">
          <Row label="Badges">
            <Badge>Active</Badge>
            <Badge variant="secondary">Draft</Badge>
            <Badge variant="outline">Idle</Badge>
            <Badge variant="destructive">Error</Badge>
          </Row>
          <div className="grid md:grid-cols-2 gap-4">
            <Alert>
              <Info />
              <AlertTitle>Heads up</AlertTitle>
              <AlertDescription>
                You can edit channels and skills from the agent detail page.
              </AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertCircle />
              <AlertTitle>Runtime offline</AlertTitle>
              <AlertDescription>
                No heartbeat in the last 5 minutes. Check Railway logs.
              </AlertDescription>
            </Alert>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Context used</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <Progress value={progress} />
            <div className="flex gap-2">
              <Button size="xs" variant="outline" onClick={() => setProgress((p) => Math.max(0, p - 10))}>
                −10
              </Button>
              <Button size="xs" variant="outline" onClick={() => setProgress((p) => Math.min(100, p + 10))}>
                +10
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">Skeleton (loading)</div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </div>
        </div>
      </Section>

      {/* Overlays */}
      <Section id="overlays" title="Overlays" description="Dialog for confirmation, Popover for inline edits, Tooltip for labels only.">
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Open dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Pause this agent?</DialogTitle>
                <DialogDescription>
                  Inbound events will be held until you resume. No messages are lost.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="ghost">Cancel</Button>
                <Button>Pause agent</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Popover</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <div className="space-y-2">
                <div className="text-sm font-medium">Quick edit</div>
                <Input placeholder="Agent name" />
                <Button size="sm" className="w-full">Save</Button>
              </div>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Info">
                <Info />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Tooltip: short, labels only</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Menu</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>Open</DropdownMenuItem>
              <DropdownMenuItem>Duplicate</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive">
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Section>

      {/* Data display */}
      <Section id="data" title="Data display" description="Cards, tabs, and avatars. Tabs use sentence case — no icons in tab labels.">
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Fleet health</CardTitle>
              <CardDescription>Last 24h across all agents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Healthy</span>
                <span className="font-mono">8</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Needs attention</span>
                <span className="font-mono">1</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Offline</span>
                <span className="font-mono">0</span>
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm">
                View all
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Team</CardTitle>
              <CardDescription>Avatars in multiple sizes</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarImage src="" alt="" />
                <AvatarFallback>LC</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>KW</AvatarFallback>
              </Avatar>
              <Avatar className="size-8">
                <AvatarFallback>AM</AvatarFallback>
              </Avatar>
              <Avatar className="size-6 text-[10px]">
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
            </CardContent>
          </Card>
        </div>

        <Separator className="my-6" />

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="skills">Skills</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="text-sm text-muted-foreground mt-4">
            Agent summary, health, and cost live here.
          </TabsContent>
          <TabsContent value="activity" className="text-sm text-muted-foreground mt-4">
            Live event feed and run timeline.
          </TabsContent>
          <TabsContent value="skills" className="text-sm text-muted-foreground mt-4">
            Installed skills, integrations, and core tools.
          </TabsContent>
        </Tabs>
      </Section>

      {/* Motion */}
      <Section id="motion" title="Motion" description="Durations: 120 / 200 / 240ms. Never above 300ms. All animations respect prefers-reduced-motion.">
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {MOTION.map((m) => (
            <MotionDemo key={m.name} label={m.name} animationClass={m.class} desc={m.desc} />
          ))}
        </div>
      </Section>

      <footer className="pt-8 border-t text-xs text-muted-foreground font-mono">
        Styleguide · renders canonical primitives from <code>@/components/ui</code>
      </footer>
    </div>
  )
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="rounded-xl border bg-card p-6">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-mono">{label}</div>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
}

function MotionDemo({ label, animationClass, desc }: { label: string; animationClass: string; desc: string }) {
  const [key, setKey] = React.useState(0)
  return (
    <button
      type="button"
      onClick={() => setKey((k) => k + 1)}
      className="group text-left rounded-lg border p-4 hover:bg-accent transition-colors"
    >
      <div
        key={key}
        className={`${animationClass} size-10 rounded-md bg-primary mb-3`}
        aria-hidden
      />
      <div className="font-mono text-xs">{label}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{desc}</div>
      <div className="text-[10px] text-muted-foreground/70 mt-2 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
        click to replay
      </div>
    </button>
  )
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
