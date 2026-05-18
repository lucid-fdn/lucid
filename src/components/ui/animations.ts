/**
 * Unified Animation Component Exports
 * GLOBALLY ACTIVATED: All components use Animate UI by default
 * 
 * Components that exist in codebase (13/17):
 * ✅ Dialog, Sheet, Dropdown Menu, Tooltip, Popover
 * ✅ Alert Dialog, Checkbox, Collapsible, Hover Card
 * ✅ Progress, Radio Group, Switch, Tabs
 * 
 * Usage: import { Dialog, Sheet } from '@/components/ui/animations'
 */

// ====================
// ANIMATE UI (Radix Components - 13 components we have)
// ====================

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/animate-ui/primitives/radix/dialog'

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
} from '@/components/animate-ui/primitives/radix/sheet'

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuRadioGroup,
} from '@/components/animate-ui/primitives/radix/dropdown-menu'

export {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from '@/components/animate-ui/primitives/radix/tooltip'

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
} from '@/components/animate-ui/primitives/radix/popover'

// Accordion - NOT in codebase, skipped

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/animate-ui/primitives/radix/alert-dialog'

export {
  Checkbox,
} from '@/components/animate-ui/primitives/radix/checkbox'

export {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/animate-ui/primitives/radix/collapsible'

export {
  HoverCard,
  HoverCardTrigger,
  HoverCardContent,
} from '@/components/animate-ui/primitives/radix/hover-card'

export {
  Progress,
} from '@/components/animate-ui/primitives/radix/progress'

export {
  RadioGroup,
  RadioGroupItem,
} from '@/components/animate-ui/primitives/radix/radio-group'

export {
  Switch,
} from '@/components/animate-ui/primitives/radix/switch'

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/animate-ui/primitives/radix/tabs'

// Toggle, Toggle Group, Files - NOT in codebase, skipped

// ====================
// MAGIC UI (Special Effects)
// ====================

export { TypingAnimation } from '@/ui/components/typing-animation'
export { ShineBorder } from '@/ui/components/shine-border'
export { AnimatedList } from '@/ui/components/animated-list'
