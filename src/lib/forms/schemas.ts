import { z } from 'zod'

/**
 * Reusable validation patterns
 */

// URL validation - must be http(s)
const urlSchema = z
  .string()
  .refine(
    (s) => !s || s.startsWith('http://') || s.startsWith('https://'),
    {
      message: 'Must be a valid URL starting with http:// or https://',
    }
  )
  .optional()
  .or(z.literal(''))

// Handle/slug validation - lowercase alphanumeric + underscore
const handleSchema = z
  .string()
  .min(3, 'Minimum 3 characters')
  .max(32, 'Maximum 32 characters')
  .regex(
    /^[a-z0-9_]+$/,
    'Only lowercase letters, numbers, and underscores allowed'
  )
  .transform((s) => s.toLowerCase())

// Interests array - max 10 tags, each max 32 chars
const interestsSchema = z
  .array(z.string().max(32, 'Each tag must be 32 characters or less'))
  .max(10, 'Maximum 10 interests')
  .optional()

/**
 * Profile Settings Schema
 * Uses .partial() to allow updating individual fields (e.g., just avatar_url)
 */
export const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  avatar_url: z.union([z.string().url(), z.literal(''), z.null()]),
  bio: z.union([z.string().max(280), z.literal(''), z.null()]),
  homepage: z.union([z.string().url(), z.literal(''), z.null()]),
  interests: z.array(z.string().max(32)).max(10),
  github_username: z.union([z.string().max(39), z.literal(''), z.null()]), // GitHub max username length
  twitter_username: z.union([z.string().max(15), z.literal(''), z.null()]), // Twitter max username length
  linkedin_url: z.union([z.string().url(), z.literal(''), z.null()]),
  profile_public: z.boolean(), // Privacy setting - default true
}).partial()

export type ProfileData = z.infer<typeof profileSchema>

/**
 * Account Settings Schema (Profile Information)
 */
export const accountInfoSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(50, 'Maximum 50 characters'),
  last_name: z.string().min(1, 'Last name is required').max(50, 'Maximum 50 characters'),
  handle: handleSchema,
})

export type AccountInfoData = z.infer<typeof accountInfoSchema>

/**
 * Organization Schema
 */
export const organizationSchema = z.object({
  slug: handleSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Maximum 100 characters'),
  type: z
    .enum(['company', 'lab', 'university', 'nonprofit', 'community', 'other'])
    .optional(),
  logo_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  bio: z.string().max(280, 'Maximum 280 characters').optional().or(z.literal('')),
  homepage: urlSchema,
  interests: interestsSchema,
  github_username: z.string().max(100).optional().or(z.literal('')),
  twitter_username: z.string().max(100).optional().or(z.literal('')),
  linkedin_url: urlSchema,
})

export type OrganizationData = z.infer<typeof organizationSchema>

/**
 * Workspace Schema (MVP - Simplified)
 * For quick workspace creation without all the extra fields
 * 
 * NOTE: 'personal' type is NOT allowed in manual creation
 * Personal workspaces are ONLY auto-created on user signup
 */
export const workspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required').max(100, 'Maximum 100 characters'),
  slug: handleSchema,
  type: z.enum(['team', 'company']), // Removed 'personal' - auto-created only
  logo_url: z.string().url('Invalid URL').optional().or(z.literal('')),
})

export type WorkspaceData = z.infer<typeof workspaceSchema>

/**
 * Onboarding Schema - combines required profile fields + optional workspace fields
 */
export const onboardingSchema = z.object({
  // User Profile Fields
  handle: handleSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Maximum 100 characters'),
  avatar_url: z.string().url('Invalid URL').optional().or(z.literal('')),
  bio: z.string().max(280, 'Maximum 280 characters').optional().or(z.literal('')),
  homepage: urlSchema,
  interests: interestsSchema,
  github_username: z.string().max(100).optional().or(z.literal('')),
  twitter_username: z.string().max(100).optional().or(z.literal('')),
  linkedin_url: urlSchema,
  work_preference: z.enum(['solo', 'team']),
  agree_terms: z.boolean().refine((val) => val === true, {
    message: 'You must agree to the Terms of Service and Code of Conduct',
  }),
  // Workspace Fields (conditional - only when work_preference === 'team')
  workspace_name: z.string().min(1).max(100).optional(),
  workspace_slug: handleSchema.optional(),
  workspace_logo_url: z.string().url().optional().or(z.literal('')),
  workspace_description: z.string().max(280).optional().or(z.literal('')),
  purpose: z.array(z.string()).optional(),
  team_size: z.enum(['solo', 'small_team', 'medium_team', 'enterprise']).optional(),
  invites: z.array(z.object({
    email: z.string().email(),
    role: z.enum(['owner', 'admin', 'developer', 'viewer']),
  })).optional(),
})

export type OnboardingData = z.infer<typeof onboardingSchema>

/**
 * Notification Preferences Schema
 * Must match DB table: notification_preferences
 */
export const notificationPreferencesSchema = z.object({
  // Master Channel Controls
  channel_web: z.boolean(),
  channel_email: z.boolean(),
  
  // Posts & Activity
  posts_email: z.boolean(),
  posts_web: z.boolean(),
  watched_activity_email: z.boolean(),
  watched_activity_web: z.boolean(),
  
  // Organization
  org_join_requests: z.boolean(),
  org_suggestions: z.boolean(),
  
  // Social
  follow_web: z.boolean(),
  follow_email: z.boolean(),
  new_followers: z.boolean(),
  
  // Asset Interactions
  interactions_web: z.boolean(),
  interactions_email: z.boolean(),
  
  // System & Features
  features_announcements: z.boolean(),
  gated_repo_requests: z.boolean(),
  billing_notifications: z.boolean(),
})

export type NotificationPreferencesData = z.infer<typeof notificationPreferencesSchema>

/**
 * Webhook Schema
 * For creating and updating workflow webhooks
 */
export const webhookSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
  description: z.string().max(280, 'Maximum 280 characters').optional().or(z.literal('')),
  enabled: z.boolean().default(true),
})

export type WebhookData = z.infer<typeof webhookSchema>

/**
 * Webhook Update Schema
 * For partial updates to existing webhooks
 */
export const webhookUpdateSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  description: z.string().max(280, 'Maximum 280 characters').optional().or(z.literal('')),
  enabled: z.boolean().optional(),
}).partial()

export type WebhookUpdateData = z.infer<typeof webhookUpdateSchema>

/**
 * Variable Schema
 * For creating and updating workflow variables
 */
export const variableSchema = z.object({
  key: z.string()
    .min(1, 'Variable name is required')
    .max(50, 'Maximum 50 characters')
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Must start with letter or underscore, contain only letters, numbers, and underscores'),
  value: z.string().max(5000, 'Maximum 5000 characters'),
  type: z.enum(['string', 'number', 'boolean', 'secret']).default('string'),
  description: z.string().max(280, 'Maximum 280 characters').optional().or(z.literal('')),
})

export type VariableData = z.infer<typeof variableSchema>

/**
 * Variable Update Schema
 * For partial updates to existing variables
 */
export const variableUpdateSchema = z.object({
  value: z.string().max(5000).optional(),
  type: z.enum(['string', 'number', 'boolean', 'secret']).optional(),
  description: z.string().max(280).optional().or(z.literal('')),
}).partial()

export type VariableUpdateData = z.infer<typeof variableUpdateSchema>

/**
 * Credential Schemas
 * For creating and managing secure credentials
 */

// API Key Credential
export const apiKeyCredentialSchema = z.object({
  key: z.string().min(1, 'API key is required'),
  headerName: z.string().default('Authorization'),
  prefix: z.string().default('Bearer '),
})

export type ApiKeyCredentialData = z.infer<typeof apiKeyCredentialSchema>

// Basic Auth Credential
export const basicAuthCredentialSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

export type BasicAuthCredentialData = z.infer<typeof basicAuthCredentialSchema>

// OAuth2 Credential
export const oauth2CredentialSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  refreshToken: z.string().optional(),
  expiresAt: z.number().optional(),
  tokenType: z.string().default('Bearer'),
})

export type OAuth2CredentialData = z.infer<typeof oauth2CredentialSchema>

// Custom Headers Credential
export const customHeadersCredentialSchema = z.object({
  headers: z.record(z.string(), z.string()).refine(
    (headers) => Object.keys(headers).length > 0,
    { message: 'At least one header is required' }
  ),
})

export type CustomHeadersCredentialData = z.infer<typeof customHeadersCredentialSchema>

// Unified Credential Schema
export const credentialSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Maximum 100 characters'),
  type: z.enum(['api_key', 'basic_auth', 'oauth2', 'custom_headers']),
  data: z.union([
    apiKeyCredentialSchema,
    basicAuthCredentialSchema,
    oauth2CredentialSchema,
    customHeadersCredentialSchema,
  ]),
})

export type CredentialData = z.infer<typeof credentialSchema>

// Credential Update Schema
export const credentialUpdateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  data: z.union([
    apiKeyCredentialSchema,
    basicAuthCredentialSchema,
    oauth2CredentialSchema,
    customHeadersCredentialSchema,
  ]).optional(),
}).partial()

export type CredentialUpdateData = z.infer<typeof credentialUpdateSchema>
