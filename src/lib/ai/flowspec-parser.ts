/**
 * FlowSpec Parser
 * Converts technical FlowSpec into narrative "When/If/Do" story format
 * 
 * Transforms:
 * - Trigger nodes → "When X happens"
 * - Condition nodes → "If Y is true"
 * - Action nodes → "Do Z"
 */

import type { FlowSpec, FlowNode } from '@/lib/lucid-l2/types'
import { Zap, GitBranch, Play, Database, Mail, MessageSquare, Calendar } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/** Extended node shape used in parsing (may carry extra fields from AI output) */
interface ParseableNode {
  id: string
  type: string
  name?: string
  label?: string
  parameters?: Record<string, unknown>
}

export interface StoryStep {
  id: string
  type: 'when' | 'if' | 'do'
  title: string
  description: string
  icon: LucideIcon
  nodeType: string
  originalNode?: FlowNode
}

/**
 * Parse FlowSpec to narrative story steps
 */
export function parseFlowSpecToStory(flowSpec: FlowSpec): StoryStep[] {
  const steps: StoryStep[] = []
  
  if (!flowSpec?.nodes) return steps

  // Cast nodes to parseable shape (may carry extra fields from AI output)
  const nodes = flowSpec.nodes as unknown as ParseableNode[]

  // 1. Find trigger (start) nodes
  const triggers = nodes.filter(node =>
    node.type === 'trigger' || node.type === 'start'
  )

  triggers.forEach((trigger, index) => {
    steps.push({
      id: trigger.id || `trigger-${index}`,
      type: 'when',
      title: formatTrigger(trigger),
      description: describeTrigger(trigger),
      icon: getIconForNodeType(trigger.type),
      nodeType: trigger.type,
      originalNode: trigger as unknown as FlowNode
    })
  })

  // 2. Find condition nodes
  const conditions = nodes.filter(node =>
    node.type === 'condition' || node.type === 'if'
  )

  conditions.forEach((condition, index) => {
    steps.push({
      id: condition.id || `condition-${index}`,
      type: 'if',
      title: formatCondition(condition),
      description: describeCondition(condition),
      icon: getIconForNodeType(condition.type),
      nodeType: condition.type,
      originalNode: condition as unknown as FlowNode
    })
  })

  // 3. Find action nodes
  const actions = nodes.filter(node =>
    node.type === 'action' || node.type === 'do'
  )

  actions.forEach((action, index) => {
    steps.push({
      id: action.id || `action-${index}`,
      type: 'do',
      title: formatAction(action),
      description: describeAction(action),
      icon: getIconForNodeType(action.type),
      nodeType: action.type,
      originalNode: action as unknown as FlowNode
    })
  })

  return steps
}

/**
 * Format trigger node as "When X"
 */
function formatTrigger(node: ParseableNode): string {
  const name = node.name || node.label || 'Unknown Trigger'
  
  // Common trigger patterns
  if (name.toLowerCase().includes('webhook')) {
    return 'When a webhook is received'
  }
  if (name.toLowerCase().includes('schedule')) {
    return 'When the scheduled time arrives'
  }
  if (name.toLowerCase().includes('email')) {
    return 'When an email is received'
  }
  if (name.toLowerCase().includes('message')) {
    return 'When a message arrives'
  }
  
  return `When ${name.toLowerCase()}`
}

/**
 * Describe trigger in detail
 */
function describeTrigger(node: ParseableNode): string {
  const params = node.parameters || {}
  
  if (params.url) {
    return `Listens for HTTP requests at ${params.url}`
  }
  if (params.schedule) {
    return `Runs on schedule: ${params.schedule}`
  }
  if (params.email) {
    return `Monitors email account: ${params.email}`
  }
  
  return 'Starts the workflow when triggered'
}

/**
 * Format condition node as "If X"
 */
function formatCondition(node: ParseableNode): string {
  const name = node.name || node.label || 'Unknown Condition'
  
  // Common condition patterns
  if (name.toLowerCase().includes('contains')) {
    return 'If the data contains specific text'
  }
  if (name.toLowerCase().includes('equals')) {
    return 'If the value equals something'
  }
  if (name.toLowerCase().includes('greater')) {
    return 'If the value is greater than'
  }
  
  return `If ${name.toLowerCase()}`
}

/**
 * Describe condition in detail
 */
function describeCondition(node: ParseableNode): string {
  const params = node.parameters || {}
  
  if (params.field && params.value) {
    return `Checks if ${params.field} equals "${params.value}"`
  }
  if (params.condition) {
    return `Evaluates: ${params.condition}`
  }
  
  return 'Checks a condition before continuing'
}

/**
 * Format action node as "Do X"
 */
function formatAction(node: ParseableNode): string {
  const name = node.name || node.label || 'Unknown Action'
  
  // Common action patterns
  if (name.toLowerCase().includes('send')) {
    return 'Do send a message'
  }
  if (name.toLowerCase().includes('create')) {
    return 'Do create a record'
  }
  if (name.toLowerCase().includes('update')) {
    return 'Do update data'
  }
  if (name.toLowerCase().includes('delete')) {
    return 'Do delete an item'
  }
  
  return `Do ${name.toLowerCase()}`
}

/**
 * Describe action in detail
 */
function describeAction(node: ParseableNode): string {
  const params = node.parameters || {}
  
  if (params.to && params.message) {
    return `Sends "${params.message}" to ${params.to}`
  }
  if (params.channel) {
    return `Posts to channel: ${params.channel}`
  }
  if (params.url) {
    return `Makes HTTP request to ${params.url}`
  }
  
  return 'Performs an action with the data'
}

/**
 * Get icon for node type
 */
function getIconForNodeType(type: string): LucideIcon {
  const iconMap: Record<string, LucideIcon> = {
    trigger: Zap,
    start: Zap,
    webhook: Zap,
    schedule: Calendar,
    condition: GitBranch,
    if: GitBranch,
    action: Play,
    do: Play,
    database: Database,
    email: Mail,
    message: MessageSquare,
    slack: MessageSquare,
  }
  
  return iconMap[type.toLowerCase()] || Play
}

/**
 * Get color for step type
 */
export function getColorForStepType(type: 'when' | 'if' | 'do'): string {
  const colors = {
    when: 'text-green-600 bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
    if: 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800',
    do: 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
  }
  
  return colors[type]
}

/**
 * Validate FlowSpec completeness
 */
export function validateFlowSpec(flowSpec: FlowSpec): {
  isValid: boolean
  issues: string[]
  confidence: number
} {
  const issues: string[] = []
  
  if (!flowSpec?.nodes || flowSpec.nodes.length === 0) {
    issues.push('No nodes defined')
    return { isValid: false, issues, confidence: 0 }
  }

  // Check for trigger
  const hasTrigger = flowSpec.nodes.some(n => n.type === 'trigger' || n.type === 'start')
  if (!hasTrigger) {
    issues.push('Missing trigger node')
  }

  // Check for actions
  const hasActions = flowSpec.nodes.some(n => n.type === 'action' || n.type === 'do')
  if (!hasActions) {
    issues.push('No actions defined')
  }

  // Check node connections (if edges exist)
  if (flowSpec.edges) {
    const nodeIds = new Set(flowSpec.nodes.map(n => n.id))
    flowSpec.edges.forEach(edge => {
      if (!nodeIds.has(edge.from)) {
        issues.push(`Edge references missing source: ${edge.from}`)
      }
      if (!nodeIds.has(edge.to)) {
        issues.push(`Edge references missing target: ${edge.to}`)
      }
    })
  }

  // Calculate confidence (0-100)
  const totalChecks = 5
  const passedChecks = totalChecks - issues.length
  const confidence = Math.max(0, Math.min(100, (passedChecks / totalChecks) * 100))

  return {
    isValid: issues.length === 0,
    issues,
    confidence: Math.round(confidence)
  }
}
