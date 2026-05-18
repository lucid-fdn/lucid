/**
 * Centralized Workflow Configuration
 * Single source of truth for all workflow-related constants
 * Modify here for app-wide changes
 */

// ============================================
// EXECUTION STATUS CONFIGURATION
// ============================================

export const EXECUTION_STATUS = {
  WAITING: 'waiting',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  SKIPPED: 'skipped',
  CANCELLED: 'cancelled',
} as const;

export type ExecutionStatus = typeof EXECUTION_STATUS[keyof typeof EXECUTION_STATUS];

// Status colors - modify here to change app-wide status colors
export const STATUS_COLORS = {
  [EXECUTION_STATUS.WAITING]: {
    text: 'text-gray-400',
    bg: 'bg-gray-100 dark:bg-gray-800',
    border: 'border-gray-300',
    icon: 'text-gray-500',
  },
  [EXECUTION_STATUS.RUNNING]: {
    text: 'text-blue-500',
    bg: 'bg-blue-50 dark:bg-blue-950',
    border: 'border-blue-500',
    icon: 'text-blue-600',
  },
  [EXECUTION_STATUS.SUCCESS]: {
    text: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-950',
    border: 'border-green-500',
    icon: 'text-green-600',
  },
  [EXECUTION_STATUS.ERROR]: {
    text: 'text-red-500',
    bg: 'bg-red-50 dark:bg-red-950',
    border: 'border-red-500',
    icon: 'text-red-600',
  },
  [EXECUTION_STATUS.SKIPPED]: {
    text: 'text-gray-300',
    bg: 'bg-gray-50 dark:bg-gray-900',
    border: 'border-border',
    icon: 'text-gray-400',
  },
  [EXECUTION_STATUS.CANCELLED]: {
    text: 'text-muted-foreground',
    bg: 'bg-gray-100 dark:bg-gray-800',
    border: 'border-border',
    icon: 'text-muted-foreground',
  },
} as const;

// Status labels - modify here to change display text
export const STATUS_LABELS = {
  [EXECUTION_STATUS.WAITING]: 'Waiting',
  [EXECUTION_STATUS.RUNNING]: 'Running',
  [EXECUTION_STATUS.SUCCESS]: 'Success',
  [EXECUTION_STATUS.ERROR]: 'Failed',
  [EXECUTION_STATUS.SKIPPED]: 'Skipped',
  [EXECUTION_STATUS.CANCELLED]: 'Cancelled',
} as const;

// ============================================
// NODE TYPE CONFIGURATION
// ============================================

export const NODE_CATEGORIES = {
  TRIGGER: 'trigger',
  ACTION: 'action',
  CONDITION: 'condition',
  TRANSFORM: 'transform',
} as const;

export type NodeCategory = typeof NODE_CATEGORIES[keyof typeof NODE_CATEGORIES];

// Node colors - modify here to change node colors app-wide
export const NODE_COLORS = {
  [NODE_CATEGORIES.TRIGGER]: '#10b981',   // Green
  [NODE_CATEGORIES.ACTION]: '#3b82f6',    // Blue
  [NODE_CATEGORIES.CONDITION]: '#f59e0b', // Amber
  [NODE_CATEGORIES.TRANSFORM]: '#8b5cf6', // Purple
} as const;

// Node icons - modify here to change node icons
export const NODE_ICONS = {
  [NODE_CATEGORIES.TRIGGER]: 'Zap',
  [NODE_CATEGORIES.ACTION]: 'Play',
  [NODE_CATEGORIES.CONDITION]: 'GitBranch',
  [NODE_CATEGORIES.TRANSFORM]: 'Repeat',
} as const;

// Node labels - modify here to change display names
export const NODE_LABELS = {
  [NODE_CATEGORIES.TRIGGER]: 'Trigger',
  [NODE_CATEGORIES.ACTION]: 'Action',
  [NODE_CATEGORIES.CONDITION]: 'Condition',
  [NODE_CATEGORIES.TRANSFORM]: 'Transform',
} as const;

// ============================================
// EXECUTION MODE CONFIGURATION
// ============================================

export const EXECUTION_MODES = {
  MANUAL: 'manual',
  WEBHOOK: 'webhook',
  SCHEDULE: 'schedule',
  TEST: 'test',
} as const;

export type ExecutionMode = typeof EXECUTION_MODES[keyof typeof EXECUTION_MODES];

// Mode labels - modify here to change display text
export const MODE_LABELS = {
  [EXECUTION_MODES.MANUAL]: 'Manual',
  [EXECUTION_MODES.WEBHOOK]: 'Webhook',
  [EXECUTION_MODES.SCHEDULE]: 'Scheduled',
  [EXECUTION_MODES.TEST]: 'Test',
} as const;

// ============================================
// PIN DATA CONFIGURATION
// ============================================

export const PIN_DATA_CONFIG = {
  // Pin indicator color
  indicatorColor: 'bg-blue-600',
  indicatorTextColor: 'text-white',
  
  // Button colors
  buttonActiveColor: 'bg-blue-600 hover:bg-blue-700',
  
  // Sample templates
  templates: {
    'Single Item': [
      {
        id: 1,
        name: 'Sample Item',
        email: 'sample@example.com',
        status: 'active'
      }
    ],
    'Multiple Items': [
      { id: 1, name: 'Item 1', value: 100 },
      { id: 2, name: 'Item 2', value: 200 },
      { id: 3, name: 'Item 3', value: 300 }
    ],
    'API Response': [
      {
        status: 200,
        data: {
          users: [
            { id: 1, username: 'john_doe' },
            { id: 2, username: 'jane_smith' }
          ]
        },
        timestamp: '2025-10-17T10:00:00Z'
      }
    ],
    'Empty Array': []
  }
} as const;

// ============================================
// UI CONFIGURATION
// ============================================

export const UI_CONFIG = {
  // Sidebar widths
  nodePaletteWidth: 'w-64',
  nodeConfigWidth: 'w-96',
  
  // Panel sizes
  executionHistoryWidth: 'w-[400px] sm:w-[540px]',
  
  // Timeouts
  autoSaveDelay: 3000, // ms
  nodeExecutionDelay: 500, // ms
  
  // Limits
  maxExecutionHistoryItems: 20,
  maxExecutionHistoryDisplay: 10,
  
  // Animation durations
  nodeAnimationDuration: 'duration-200',
  statusTransitionDuration: 'transition-all duration-240',
} as const;

// ============================================
// TOAST MESSAGES
// ============================================

export const TOAST_MESSAGES = {
  // Workflow
  workflowSaved: 'Workflow saved',
  workflowSaveError: 'Failed to save workflow',
  workflowExecuteSuccess: 'Workflow executed successfully',
  workflowExecuteError: 'Failed to execute workflow',
  
  // Pin Data
  pinDataSaved: 'Pin data saved',
  pinDataCleared: 'Pin data cleared',
  pinDataError: 'Failed to save pin data',
  usingPinnedData: (nodeName: string) => `Using pinned data for ${nodeName}`,
  
  // Execution
  executionStarted: 'Execution started',
  executionComplete: 'Execution complete',
  executionFailed: 'Execution failed',
} as const;

// ============================================
// VALIDATION RULES
// ============================================

export const VALIDATION = {
  // Pin data validation
  pinData: {
    mustBeArray: 'Pin data must be an array of items',
    invalidJson: 'Invalid JSON format',
  },
  
  // Node validation
  node: {
    nameRequired: 'Node name is required',
    nameMaxLength: 100,
  },
  
  // Workflow validation
  workflow: {
    nameRequired: 'Workflow name is required',
    nameMaxLength: 200,
    minNodes: 1,
  },
} as const;
