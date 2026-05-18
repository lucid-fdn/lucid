import type { ComponentType } from 'react'
import { z } from 'zod'
import type { MultiStepFormStep, StepComponentProps } from '@/types/multi-step'
import { StepBasicProfile } from '@/components/user-onboarding/step-basic-profile'
import { StepWorkPreference } from '@/components/user-onboarding/step-work-preference'
import { StepComplete } from '@/components/user-onboarding/step-complete'
// Import workspace onboarding steps
import { StepDetails } from '@/components/workspace-onboarding/step-details'
import { StepTeamInvites } from '@/components/workspace-onboarding/step-team-invites'

/**
 * Multi-Step User Profile Onboarding Schemas
 * Progressive disclosure for user profile setup
 */

// Reusable validators
const handleSchema = z
  .string()
  .min(3, 'Minimum 3 characters')
  .max(32, 'Maximum 32 characters')
  .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, numbers, and underscores')
  .transform((s) => s.toLowerCase())

const urlSchema = z
  .string()
  .url('Invalid URL')
  .optional()
  .or(z.literal(''))

const slugSchema = z
  .string()
  .min(3, 'Minimum 3 characters')
  .max(32, 'Maximum 32 characters')
  .regex(
    /^[a-z0-9_]+$/,
    'Only lowercase letters, numbers, and underscores allowed'
  )
  .transform((s) => s.toLowerCase())

// Workspace schemas (duplicated here to avoid circular dependency)
const workspaceDetailsSchema = z.object({
  workspace_name: z
    .string()
    .min(1, 'Workspace name is required')
    .max(100, 'Maximum 100 characters'),
  workspace_slug: slugSchema,
  workspace_logo_url: urlSchema,
  workspace_description: z
    .string()
    .max(280, 'Maximum 280 characters')
    .default(''),
})

const purposeSchema = z.object({
  purpose: z.array(
    z.enum(['ai_development', 'blockchain', 'defi', 'data_analytics', 'general'])
  ).min(1, 'Select at least one purpose'),
})

const teamSizeSchema = z.object({
  team_size: z.enum(['solo', 'small_team', 'medium_team', 'enterprise'], {
    message: 'Please select your team size',
  }),
})

const teamInvitesSchema = z.object({
  invites: z
    .array(
      z.object({
        email: z.string().email('Invalid email address'),
        role: z.enum(['owner', 'admin', 'developer', 'viewer']).default('developer'),
      })
    )
    .max(10, 'Maximum 10 invites at once')
    .optional(),
  skip_invites: z.boolean().default(false),
})

// Step 1: Basic Profile (Required)
export const basicProfileSchema = z.object({
  handle: handleSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Maximum 100 characters'),
  avatar_url: urlSchema,
})

export type BasicProfileData = z.infer<typeof basicProfileSchema>

// Step 2: About You (Optional)
export const aboutYouSchema = z.object({
  bio: z.string().max(280, 'Maximum 280 characters').optional().or(z.literal('')),
  homepage: urlSchema,
  interests: z.array(z.string()).max(10, 'Maximum 10 interests').optional(),
})

export type AboutYouData = z.infer<typeof aboutYouSchema>

// Step 3: Social Links (Optional)
export const socialLinksSchema = z.object({
  github_username: z
    .string()
    .max(39, 'Maximum 39 characters')
    .regex(/^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i, 'Invalid GitHub username')
    .optional()
    .or(z.literal('')),
  twitter_username: z
    .string()
    .max(15, 'Maximum 15 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores')
    .optional()
    .or(z.literal('')),
  linkedin_url: urlSchema,
})

export type SocialLinksData = z.infer<typeof socialLinksSchema>

// Step 4: Work Preference (Required)
export const workPreferenceSchema = z.object({
  work_preference: z.enum(['solo', 'team'], {
    message: 'Please select how you plan to work',
  }),
})

export type WorkPreferenceData = z.infer<typeof workPreferenceSchema>

// Step 5: Terms & Complete (Required)
export const termsSchema = z.object({
  agree_terms: z.boolean().refine((val) => val === true, {
    message: 'You must agree to the terms to continue',
  }),
})

export type TermsData = z.infer<typeof termsSchema>

// Combined Schema - All Steps (includes optional workspace fields)
export const userOnboardingSchema = z.object({
  // User Profile Steps
  handle: basicProfileSchema.shape.handle,
  name: basicProfileSchema.shape.name,
  avatar_url: basicProfileSchema.shape.avatar_url,
  bio: aboutYouSchema.shape.bio,
  homepage: aboutYouSchema.shape.homepage,
  interests: aboutYouSchema.shape.interests,
  github_username: socialLinksSchema.shape.github_username,
  twitter_username: socialLinksSchema.shape.twitter_username,
  linkedin_url: socialLinksSchema.shape.linkedin_url,
  work_preference: workPreferenceSchema.shape.work_preference,
  agree_terms: termsSchema.shape.agree_terms,
  // Workspace Steps (conditional - only if work_preference === 'team')
  workspace_name: workspaceDetailsSchema.shape.workspace_name.optional(),
  workspace_slug: workspaceDetailsSchema.shape.workspace_slug.optional(),
  workspace_logo_url: workspaceDetailsSchema.shape.workspace_logo_url.optional(),
  workspace_description: workspaceDetailsSchema.shape.workspace_description.optional(),
  purpose: purposeSchema.shape.purpose.optional(),
  team_size: teamSizeSchema.shape.team_size.optional(),
  invites: teamInvitesSchema.shape.invites.optional(),
})

export type UserOnboardingData = z.infer<typeof userOnboardingSchema>

// Export for use in MultiStepWizard with Conditional Workspace Steps
export const USER_ONBOARDING_STEPS: readonly MultiStepFormStep<UserOnboardingData>[] = [
  // User Profile Steps
  {
    id: '1',
    path: 'basic',
    title: 'Basic Profile',
    description: 'Your identity on Lucid',
    schema: basicProfileSchema,
    component: StepBasicProfile,
  },
  {
    id: '2',
    path: 'work-preference',
    title: 'Work Preference',
    description: 'How do you plan to work?',
    schema: workPreferenceSchema,
    component: StepWorkPreference,
  },
  // Conditional Workspace Steps (only if work_preference === 'team')
  {
    id: '3',
    path: 'workspace-details',
    title: 'Workspace Details',
    description: 'Name your workspace',
    schema: workspaceDetailsSchema,
    component: StepDetails as unknown as ComponentType<StepComponentProps<UserOnboardingData>>,
    showIf: (data) => data.work_preference === 'team',
  },
  {
    id: '4',
    path: 'workspace-invites',
    title: 'Invite Team',
    description: 'Collaborate with your team (optional)',
    schema: teamInvitesSchema,
    component: StepTeamInvites as unknown as ComponentType<StepComponentProps<UserOnboardingData>>,
    optional: true,
    showIf: (data) => data.work_preference === 'team',
  },
  // Review & Complete Step (triggers server action)
  {
    id: '5',
    path: 'complete',
    title: 'Complete',
    description: 'Finish setup',
    schema: termsSchema,
    component: StepComplete,
    isFinalStep: true, // This triggers the server action
  },
] as const

export type UserOnboardingStep = typeof USER_ONBOARDING_STEPS[number]
