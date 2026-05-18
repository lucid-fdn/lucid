import { z } from 'zod'
import type { MultiStepFormStep } from '@/types/multi-step'
import { StepDetails } from '@/components/workspace-onboarding/step-details'
import { StepPurpose } from '@/components/workspace-onboarding/step-purpose'
import { StepTeamSize } from '@/components/workspace-onboarding/step-team-size'
import { StepUseCases } from '@/components/workspace-onboarding/step-use-cases'
import { StepTeamInvites } from '@/components/workspace-onboarding/step-team-invites'
import { StepComplete } from '@/components/user-onboarding/step-complete' // Reuse review component

/**
 * Multi-Step Workspace Onboarding Schemas
 * Industry-standard progressive disclosure pattern
 */

// Reusable slug validation
const slugSchema = z
  .string()
  .min(3, 'Minimum 3 characters')
  .max(32, 'Maximum 32 characters')
  .regex(
    /^[a-z0-9_]+$/,
    'Only lowercase letters, numbers, and underscores allowed'
  )
  .transform((s) => s.toLowerCase())

// Step 1: Purpose Selection (Multi-select)
export const purposeSchema = z.object({
  purpose: z.array(
    z.enum(['ai_development', 'blockchain', 'defi', 'data_analytics', 'general'])
  ).min(1, 'Select at least one purpose'),
})

export type PurposeData = z.infer<typeof purposeSchema>

// Step 2: Team Size
export const teamSizeSchema = z.object({
  team_size: z.enum(['solo', 'small_team', 'medium_team', 'enterprise'], {
    message: 'Please select your team size',
  }),
})

export type TeamSizeData = z.infer<typeof teamSizeSchema>

// Step 3: Use Cases (multi-select)
export const useCasesSchema = z.object({
  use_cases: z.array(
    z.enum([
      'agent_development',
      'smart_contracts',
      'data_pipelines',
      'api_integration',
      'monitoring',
      'collaboration',
    ])
  ).min(1, 'Select at least one use case'),
})

export type UseCasesData = z.infer<typeof useCasesSchema>

// Step 4: Workspace Details
export const workspaceDetailsSchema = z.object({
  name: z
    .string()
    .min(1, 'Workspace name is required')
    .max(100, 'Maximum 100 characters'),
  slug: slugSchema,
  logo_url: z
    .string()
    .url('Invalid URL')
    .optional()
    .or(z.literal('')),
  homepage: z
    .string()
    .url('Invalid URL')
    .optional()
    .or(z.literal('')),
  description: z
    .string()
    .max(280, 'Maximum 280 characters')
    .optional()
    .or(z.literal(''))
    .default(''),
})

export type WorkspaceDetailsData = z.infer<typeof workspaceDetailsSchema>

// Step 5: Team Invites (optional)
export const teamInvitesSchema = z.object({
  invites: z
    .array(
      z.object({
        email: z.string().email('Invalid email address'),
        role: z.enum(['owner', 'admin', 'developer', 'viewer']),
      })
    )
    .max(10, 'Maximum 10 invites at once')
    .optional(),
  skip_invites: z.boolean().default(false),
})

export type TeamInvitesData = z.infer<typeof teamInvitesSchema>

// Combined Schema - All Steps
export const workspaceOnboardingSchema = z.object({
  // Step 1
  purpose: purposeSchema.shape.purpose.optional(),
  // Step 2
  team_size: teamSizeSchema.shape.team_size,
  // Step 3
  use_cases: useCasesSchema.shape.use_cases,
  // Step 4
  name: workspaceDetailsSchema.shape.name,
  slug: workspaceDetailsSchema.shape.slug,
  logo_url: workspaceDetailsSchema.shape.logo_url,
  homepage: workspaceDetailsSchema.shape.homepage,
  description: workspaceDetailsSchema.shape.description,
  // Step 5
  invites: teamInvitesSchema.shape.invites,
})

export type WorkspaceOnboardingData = z.infer<typeof workspaceOnboardingSchema>

// Step metadata for routing and progress
// INDUSTRY STANDARD: Name/Identity first, then context questions
// Now includes component references for reusable MultiStepWizard
export const ONBOARDING_STEPS: readonly MultiStepFormStep<WorkspaceOnboardingData>[] = [
  {
    id: '1',
    path: 'details',
    title: 'Workspace Details',
    description: 'Name your workspace',
    schema: workspaceDetailsSchema,
    component: StepDetails,
  },
  {
    id: '2',
    path: 'purpose',
    title: 'Purpose',
    description: 'How will you use Lucid? (Select all that apply)',
    schema: purposeSchema,
    component: StepPurpose,
  },
  {
    id: '3',
    path: 'team',
    title: 'Team Size',
    description: 'Who will be working with you?',
    schema: teamSizeSchema,
    component: StepTeamSize,
  },
  {
    id: '4',
    path: 'use-cases',
    title: 'Use Cases',
    description: 'What will you build?',
    schema: useCasesSchema,
    component: StepUseCases,
  },
  {
    id: '5',
    path: 'team-invites',
    title: 'Invite Team',
    description: 'Collaborate with your team (optional)',
    schema: teamInvitesSchema,
    component: StepTeamInvites,
    optional: true,
  },
  {
    id: '6',
    path: 'review',
    title: 'Review & Confirm',
    description: 'Review your workspace',
    schema: z.object({}), // No validation - just review
    component: StepComplete as unknown as MultiStepFormStep<WorkspaceOnboardingData>['component'], // Reuse the review component from user onboarding
    isFinalStep: true, // This step triggers the server action
  },
] as const

export type OnboardingStep = typeof ONBOARDING_STEPS[number]
