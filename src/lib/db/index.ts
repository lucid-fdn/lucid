/**
 * Database Operations Layer (Server-only)
 * Centralizes all Supabase operations in one place
 * Easy to swap or move to RPC later
 *
 * Domain modules split for maintainability:
 *   - client.ts        — Shared Supabase client
 *   - users.ts         — Profile CRUD
 *   - organizations.ts — Org CRUD, membership, follows, ratings
 *   - billing.ts       — Plans, subscriptions, usage, payments
 *   - notifications.ts — Notification preferences & inbox
 *   - marketing.ts     — Contacts, newsletter, waitinglist
 *   - favorites.ts     — Bookmarks & favorites
 *
 * Functions not yet split remain below and will be extracted in future iterations.
 */

import 'server-only'
import { supabase, ErrorService } from './client'
import { getFavorites } from './favorites'
import { getOrgSubscription } from './billing'
import { getOrganizationById } from './organizations'
import {
  getDefaultEnvironmentForProject,
  getPrimaryProjectForWorkspace,
  getProjectAgentCountsForWorkspace,
  getProjectsForWorkspace,
} from './projects'
import { listAssistantChannelAliasesByAssistantId } from './channel-routing'
import { encryptChannelSecrets, hashChannelSecret } from '@/lib/channels/secrets'
import { buildTelegramPersona } from '@/lib/telegram/entity-presence'
import type { AgentEngine, RuntimeFlavor } from '@/lib/engines/types'
import { resolveAgentModel } from '@/lib/agents/model-resolution'
import { shouldFallbackWalletSchemaQuery } from './postgrest-compat'

const IDENTITY_LINK_SELECT = 'id, user_id, provider, external_id, created_at' as const
const USER_WALLET_SELECT = 'id, user_id, wallet_address, wallet_type, chain_id, is_primary, created_at, updated_at' as const
const USER_PREFERENCES_SELECT = 'id, user_id, sidebar_collapsed, theme, language, compact_mode, show_onboarding, created_at, updated_at' as const
const AGENT_ROW_SELECT = `
  id,
  org_id,
  project_id,
  env_id,
  name,
  slug,
  description,
  persona,
  tools,
  router_mode,
  memory_scope_id,
  policy_pack_id,
  schedule_json,
  config,
  is_active,
  created_by,
  updated_by,
  created_at,
  updated_at
` as const
const APP_ROW_SELECT = `
  id,
  org_id,
  project_id,
  env_id,
  name,
  slug,
  description,
  surfaces,
  auth_mode,
  entry_route,
  pricing_plan_id,
  config,
  is_public,
  is_active,
  created_by,
  updated_by,
  created_at,
  updated_at
` as const
const ORG_INVITE_SELECT = 'id, org_id, email, role, inviter_id, token, status, expires_at, accepted_user_id, accepted_at, created_at, updated_at' as const
const AI_ASSISTANT_SELECT = `
  id,
  org_id,
  project_id,
  env_id,
  name,
  description,
  system_prompt,
  soul_content,
  lucid_model,
  engine,
  runtime_id,
  runtime_flavor,
  temperature,
	  max_tokens,
	  memory_enabled,
	  memory_window_size,
	  is_active,
	  policy_config,
	  passport_id,
	  wallet_enabled,
	  telegram_share_enabled,
	  telegram_display_name,
	  telegram_role_title,
	  telegram_essence,
	  telegram_starter_prompts,
	  telegram_voice_mode,
	  telegram_voice_id,
	  telegram_voice_instructions,
	  discord_share_enabled,
	  slack_share_enabled,
	  crew_id,
	  created_at,
	  updated_at
	` as const
const ORG_KEY_TEMPLATE_SELECT = 'id, org_id, template_name, description, config, created_by, created_at, updated_at' as const
const TRADING_POLICY_SELECT = `
  id,
  assistant_id,
  enabled,
  max_trade_value_usd,
  daily_limit_usd,
  allowed_chains,
  allowed_tokens,
  max_slippage_bps,
  require_confirmation_above_usd,
  blocked_protocols,
  onchain_capabilities,
  quorum_threshold_usd,
  transfer_mode,
  created_at,
  updated_at
` as const
const ASSISTANT_CHANNEL_WRITE_SELECT = 'id, assistant_id, channel_type, external_channel_id, channel_config, is_active, connection_mode, inbound_routing_config, encrypted_secrets_id, created_at, updated_at' as const
const TELEGRAM_CONNECT_TOKEN_SELECT = 'id, token, assistant_id, org_id, created_by, expires_at, used_at, created_at' as const

// ============================================================================
// RE-EXPORTS FROM DOMAIN MODULES
// ============================================================================

export * from './users'
export * from './organizations'
export * from './billing'
export * from './checkout-attempts'
export * from './notifications'
export * from './marketing'
export * from './favorites'
export * from './plugins'
export * from './skills'
export * from './launchpad'
export * from './mission-control'
export * from './board-memory'
export * from './assistant-memory'
export * from './knowledge'
export * from './knowledge-claims'
export * from './knowledge-external-clients'
export * from './knowledge-imports'
export * from './knowledge-graph'
export * from './knowledge-engine-home-projections'
export * from './knowledge-maintenance'
export * from './knowledge-operation-events'
export * from './knowledge-retrieval-evals'
export * from './knowledge-l2-projections'
export * from './eval-receipts'
export * from './lucid-packs'
export * from './system-notices'
export * from './human-work-items'
export * from './pm-external-refs'
export * from './pm-config'
export * from '@/lib/work-graph/db'
export * from './template-product-events'
export * from './projects'
export * from './channel-routing'
export * from './agent-ops-product'
export * from './agent-ops-browser-procedures'
export * from './agent-ops-browser-host-playbooks'
export * from './agent-ops-browser-security-events'
export * from './agent-ops-browser-session-events'
export * from './agent-ops-browser-session-shares'
export * from './browser-operator'
export * from './agent-ops-operator-profiles'
export * from './agent-ops-decision-events'
export {
  getAgentOpsRunForOrg,
  listAgentOpsBrowserQaSessionsForRun,
  listAgentOpsPerformanceAlertTimelineEvents,
  recordAgentOpsProjectTimelineEvent,
} from './agent-ops'

// ============================================================================
// OVERLAYS
// ============================================================================

export async function overlaysByExternalIds(externalIds: string[]) {
  if (externalIds.length === 0) return [];

  const { data, error } = await supabase
    .from('assets')
    .select('external_id, asset_row_id, rating, proven_runs, reliability, runs_count_30d, rating_avg, rating_count')
    .in('external_id', externalIds);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        table: 'assets',
        operation: 'SELECT',
        externalIdsCount: externalIds.length
      },
      tags: {
        layer: 'database',
        table: 'assets'
      }
    });
    return [];
  }

  return data || [];
}

// ============================================================================
// CONTRIBUTORS
// ============================================================================

export async function contributorByHandle(handle: string) {
  // Try to get from profiles table
  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, name, avatar_url, bio')
    .eq('handle', handle)
    .single();

  if (error) {
    // Return minimal if not found (no id means not in DB)
    return {
      id: null,
      handle,
      name: handle.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
    };
  }

  return data;
}

export async function followContributor(userId: string, handle: string) {
  // First get contributor's user_id
  const contributor = await contributorByHandle(handle);
  if (!contributor || !contributor.id) {
    throw new Error('Contributor not found in database');
  }

  const { error } = await supabase
    .from('follows_users')
    .insert({ follower_id: userId, following_id: contributor.id })

  if (error && error.code !== '23505') { // Ignore duplicate
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        handle,
        contributorId: contributor.id,
        table: 'follows_users',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'follows_users'
      }
    });
    throw error;
  }
}

export async function unfollowContributor(userId: string, handle: string) {
  const contributor = await contributorByHandle(handle);
  if (!contributor || !contributor.id) return;

  const { error } = await supabase
    .from('follows_users')
    .delete()
    .eq('follower_id', userId)
    .eq('following_id', contributor.id);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        handle,
        contributorId: contributor.id,
        table: 'follows_users',
        operation: 'DELETE'
      },
      tags: {
        layer: 'database',
        table: 'follows_users'
      }
    });
    throw error;
  }
}

export async function isFollowingContributor(userId: string, handle: string): Promise<boolean> {
  const contributor = await contributorByHandle(handle);
  if (!contributor || !contributor.id) return false;

  const { data, error } = await supabase
    .from('follows_users')
    .select('follower_id')
    .eq('follower_id', userId)
    .eq('following_id', contributor.id)
    .single();

  return !!data && !error;
}

export async function rateContributor(handle: string, userId: string, score: 1 | 2 | 3 | 4 | 5) {
  const contributor = await contributorByHandle(handle);
  if (!contributor || !contributor.id) {
    throw new Error('Contributor not found in database');
  }

  const { error } = await supabase
    .from('ratings')
    .upsert({
      contributor_id: contributor.id,
      user_id: userId,
      rating: score,
    }, {
      onConflict: 'user_id,contributor_id',
    });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        handle,
        userId,
        contributorId: contributor.id,
        score,
        table: 'ratings',
        operation: 'UPSERT'
      },
      tags: {
        layer: 'database',
        table: 'ratings'
      }
    });
    throw error;
  }
}

// ============================================================================
// ASSETS
// ============================================================================

export async function rateAsset(assetId: string, userId: string, score: 1 | 2 | 3 | 4 | 5) {
  const { error } = await supabase
    .from('ratings')
    .upsert({
      asset_id: assetId,
      user_id: userId,
      rating: score,
    }, {
      onConflict: 'user_id,asset_id',
    });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        assetId,
        userId,
        score,
        table: 'ratings',
        operation: 'UPSERT'
      },
      tags: {
        layer: 'database',
        table: 'ratings'
      }
    });
    throw error;
  }
}

export async function getUserRating(userId: string, assetId?: string, orgId?: string, contributorId?: string) {
  let query = supabase
    .from('ratings')
    .select('rating')
    .eq('user_id', userId);

  if (assetId) query = query.eq('asset_id', assetId);
  if (orgId) query = query.eq('org_id', orgId);
  if (contributorId) query = query.eq('contributor_id', contributorId);

  const { data, error } = await query.single();

  if (error || !data) return null;

  return data.rating as 1 | 2 | 3 | 4 | 5;
}

// ============================================================================
// IDENTITY LINKS (Multi-Provider Auth)
// ============================================================================

export async function lookupIdentityLink(provider: string, externalId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('identity_links')
    .select('user_id')
    .eq('provider', provider)
    .eq('external_id', externalId)
    .single();

  if (error || !data) return null;
  return (data as Record<string, unknown>).user_id as string;
}

export async function getIdentityLinks(userId: string) {
  const { data, error } = await supabase
    .from('identity_links')
    .select(IDENTITY_LINK_SELECT)
    .eq('user_id', userId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        table: 'identity_links',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'identity_links'
      }
    });
    return [];
  }

  return data || [];
}

export async function addIdentityLink(userId: string, provider: string, externalId: string) {
  const { error } = await supabase
    .from('identity_links')
    .insert({
      user_id: userId,
      provider,
      external_id: externalId,
    });

  const isDuplicateProviderExternal =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505' &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string' &&
    (error as { message: string }).message.includes('unique_provider_external_id')

  if (isDuplicateProviderExternal) {
    const existingUserId = await lookupIdentityLink(provider, externalId)
    if (existingUserId === userId) {
      return
    }
  }

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        provider,
        table: 'identity_links',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'identity_links'
      }
    });
    throw error;
  }
}

export async function removeIdentityLink(userId: string, provider: string) {
  const { error } = await supabase
    .from('identity_links')
    .delete()
    .eq('user_id', userId)
    .eq('provider', provider);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        provider,
        table: 'identity_links',
        operation: 'DELETE'
      },
      tags: {
        layer: 'database',
        table: 'identity_links'
      }
    });
    throw error;
  }
}

// ============================================================================
// USER WALLETS (Web3)
// ============================================================================

export async function getUserWallets(userId: string) {
  const { data, error } = await supabase
    .from('user_wallets')
    .select(USER_WALLET_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        table: 'user_wallets',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'user_wallets'
      }
    });
    return [];
  }

  return data || [];
}

export async function addUserWallet(wallet: {
  user_id: string;
  wallet_address: string;
  wallet_type: string;
  chain_id?: string;
  is_primary?: boolean;
}) {
  const { data, error } = await supabase
    .from('user_wallets')
    .insert(wallet)
    .select(USER_WALLET_SELECT)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId: wallet.user_id,
        walletType: wallet.wallet_type,
        table: 'user_wallets',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'user_wallets'
      }
    });
    throw error;
  }

  return data;
}

export async function setPrimaryWallet(userId: string, walletId: string, walletType: string) {
  // First, unset all primary wallets of this type
  await supabase
    .from('user_wallets')
    .update({ is_primary: false })
    .eq('user_id', userId)
    .eq('wallet_type', walletType);

  // Then set the new primary
  const { error } = await supabase
    .from('user_wallets')
    .update({ is_primary: true })
    .eq('id', walletId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        walletId,
        walletType,
        table: 'user_wallets',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'user_wallets'
      }
    });
    throw error;
  }
}

export async function removeUserWallet(walletId: string) {
  const { error } = await supabase
    .from('user_wallets')
    .delete()
    .eq('id', walletId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        walletId,
        table: 'user_wallets',
        operation: 'DELETE'
      },
      tags: {
        layer: 'database',
        table: 'user_wallets'
      }
    });
    throw error;
  }
}

export async function verifyWallet(walletId: string) {
  const { error } = await supabase
    .from('user_wallets')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', walletId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        walletId,
        table: 'user_wallets',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'user_wallets'
      }
    });
    throw error;
  }
}

// ============================================================================
// USER PREFERENCES (UI State & Settings)
// ============================================================================

/**
 * Get user preferences (with defaults)
 */
export async function getUserPreferences(userId: string) {
  const { data, error } = await supabase.rpc('get_user_preferences', {
    p_user_id: userId
  });

  if (error || !data?.organization) {
    // Return defaults if error
    return {
      sidebar_collapsed: false,
      theme: 'system',
      language: 'en',
      compact_mode: false,
      show_onboarding: true
    };
  }

  return data[0];
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(
  userId: string,
  preferences: {
    sidebar_collapsed?: boolean;
    theme?: 'light' | 'dark' | 'system';
    language?: string;
    compact_mode?: boolean;
    show_onboarding?: boolean;
  }
) {
  const { data, error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: userId,
      ...preferences,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })
    .select(USER_PREFERENCES_SELECT)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        userId,
        updateFields: Object.keys(preferences),
        table: 'user_preferences',
        operation: 'UPSERT'
      },
      tags: {
        layer: 'database',
        table: 'user_preferences'
      }
    });
    throw error;
  }

  return data;
}

// ============================================================================
// WORKSPACE (Org → Project → Environment)
// ============================================================================

/**
 * Set workspace scope for the current database session
 * MUST be called at the start of each request that accesses scoped resources
 * Uses transaction-local settings (safe with connection poolers)
 */
export async function setWorkspaceScope(orgId: string, projectId: string, envId: string) {
  const { error } = await supabase.rpc('set_workspace_scope', {
    p_org_id: orgId,
    p_project_id: projectId,
    p_env_id: envId
  });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId,
        projectId,
        envId,
        function: 'set_workspace_scope',
        operation: 'RPC'
      },
      tags: {
        layer: 'database',
        function: 'rpc'
      }
    });
    throw new Error('Failed to set workspace scope');
  }
}

/**
 * Get workspace for user (org + primary project/env when one exists + favorites + preferences + subscription)
 */
export async function getWorkspace(userId: string, orgId: string) {
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      role,
      organization:organizations!organization_members_organization_id_fkey!inner(
        id,
        slug,
        name
      )
    `)
    .eq('user_id', userId)
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error || !data?.organization) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: {
          userId,
          orgId,
          table: 'organization_members',
          operation: 'SELECT'
        },
        tags: {
          layer: 'database',
          table: 'organization_members'
        }
      });
    }
    return null;
  }

  const organization = Array.isArray(data.organization) ? data.organization[0] : data.organization;
  if (!organization) return null;

  const [favorites, preferences, subscription, orgDetails, projects, projectAgentCounts] = await Promise.all([
    getFavorites(userId, organization.id),
    getUserPreferences(userId),
    getOrgSubscription(organization.id),
    getOrganizationById(organization.id),
    getProjectsForWorkspace(organization.id),
    getProjectAgentCountsForWorkspace(organization.id),
  ]);

  const project = projects[0] ?? null;
  const env = project ? await getDefaultEnvironmentForProject(project.id) : null;

  return {
    org: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      ...(orgDetails || {})
    },
    project: project ? {
      id: project.id,
      org_id: project.org_id,
      name: project.name,
      slug: project.slug,
      is_default: project.is_default,
      agent_count: projectAgentCounts.get(project.id) ?? 0,
    } : null,
    projects: projects.map((item) => ({
      id: item.id,
      org_id: item.org_id,
      name: item.name,
      slug: item.slug,
      is_default: item.is_default,
      agent_count: projectAgentCounts.get(item.id) ?? 0,
    })),
    env: env ? {
      id: env.id,
      name: env.name,
      is_default: env.is_default
    } : null,
    role: data.role || 'member',
    favorites,
    preferences,
    subscription
  };
}

/**
 * Get the user's first workspace plus its primary project/env when one exists.
 * Useful for initializing workspace context.
 */
export async function getUserDefaultWorkspace(userId: string) {
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      organization_id,
      organization:organizations!organization_members_organization_id_fkey(
        id,
        name
      )
    `)
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: {
          userId,
          table: 'organization_members',
          operation: 'SELECT'
        },
        tags: {
          layer: 'database',
          table: 'organization_members'
        }
      });
    }
    return null;
  }

  const first = data[0];
  const organization = Array.isArray(first.organization) ? first.organization[0] : first.organization;
  if (!organization) return null;

  const project = await getPrimaryProjectForWorkspace(organization.id);
  const env = project ? await getDefaultEnvironmentForProject(project.id) : null;

  return {
    org: {
      id: organization.id,
      name: organization.name
    },
    project: project ? {
      id: project.id,
      name: project.name
    } : null,
    env: env ? {
      id: env.id,
      name: env.name
    } : null
  };
}
// ============================================================================
// AGENTS (Headless Workers)
// ============================================================================

export async function getAgents(projectId: string) {
  const { data, error } = await supabase
    .from('agents_active')  // Use active view
    .select(AGENT_ROW_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        projectId,
        table: 'agents_active',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'agents'
      }
    });
    return [];
  }

  return data || [];
}

export async function getAgent(agentId: string) {
  const { data, error } = await supabase
    .from('agents_active')  // Use active view
    .select(AGENT_ROW_SELECT)
    .eq('id', agentId)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        agentId,
        table: 'agents_active',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'agents'
      }
    });
    return null;
  }

  return data;
}

export async function createAgent(agent: {
  org_id: string;
  project_id: string;
  env_id: string;
  name: string;
  slug: string;
  description?: string;
  persona?: Record<string, unknown>;
  tools?: Record<string, unknown>[];
  router_mode?: 'pinned' | 'assist' | 'auto';
  memory_scope_id?: string;
  policy_pack_id?: string;
  schedule_json?: Record<string, unknown>;
  config?: Record<string, unknown>;
  created_by: string;
}) {
  const { data, error } = await supabase
    .from('agents')
    .insert(agent)
    .select(AGENT_ROW_SELECT)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        agentName: agent.name,
        projectId: agent.project_id,
        table: 'agents',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'agents'
      }
    });
    throw error;
  }

  return data;
}

export async function updateAgent(agentId: string, updates: {
  name?: string;
  description?: string;
  persona?: Record<string, unknown>;
  tools?: Record<string, unknown>[];
  router_mode?: 'pinned' | 'assist' | 'auto';
  memory_scope_id?: string;
  policy_pack_id?: string;
  schedule_json?: Record<string, unknown>;
  config?: Record<string, unknown>;
  is_active?: boolean;
  updated_by?: string;
}) {
  const { data, error } = await supabase
    .from('agents')
    .update(updates)
    .eq('id', agentId)
    .select(AGENT_ROW_SELECT)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        agentId,
        updateFields: Object.keys(updates),
        table: 'agents',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'agents'
      }
    });
    throw error;
  }

  return data;
}

export async function deleteAgent(agentId: string) {
  // Soft delete
  const { error } = await supabase
    .from('agents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', agentId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        agentId,
        table: 'agents',
        operation: 'DELETE'
      },
      tags: {
        layer: 'database',
        table: 'agents'
      }
    });
    throw error;
  }
}

// ============================================================================
// APPS (User-Facing Products)
// ============================================================================

export async function getApps(projectId: string) {
  const { data, error } = await supabase
    .from('apps_active')  // Use active view
    .select(APP_ROW_SELECT)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        projectId,
        table: 'apps_active',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'apps'
      }
    });
    return [];
  }

  return data || [];
}

export async function getApp(appId: string) {
  const { data, error } = await supabase
    .from('apps_active')  // Use active view
    .select(APP_ROW_SELECT)
    .eq('id', appId)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        appId,
        table: 'apps_active',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'apps'
      }
    });
    return null;
  }

  return data;
}

export async function createApp(app: {
  org_id: string;
  project_id: string;
  env_id: string;
  name: string;
  slug: string;
  description?: string;
  surfaces?: string[];
  auth_mode?: 'org' | 'end_user';
  entry_route?: string;
  pricing_plan_id?: string;
  config?: Record<string, unknown>;
  is_public?: boolean;
  created_by: string;
}) {
  const { data, error } = await supabase
    .from('apps')
    .insert(app)
    .select(APP_ROW_SELECT)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        appName: app.name,
        projectId: app.project_id,
        table: 'apps',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'apps'
      }
    });
    throw error;
  }

  return data;
}

export async function updateApp(appId: string, updates: {
  name?: string;
  description?: string;
  surfaces?: string[];
  auth_mode?: 'org' | 'end_user';
  entry_route?: string;
  pricing_plan_id?: string;
  config?: Record<string, unknown>;
  is_public?: boolean;
  is_active?: boolean;
  updated_by?: string;
}) {
  const { data, error } = await supabase
    .from('apps')
    .update(updates)
    .eq('id', appId)
    .select(APP_ROW_SELECT)
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        appId,
        updateFields: Object.keys(updates),
        table: 'apps',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'apps'
      }
    });
    throw error;
  }

  return data;
}

export async function deleteApp(appId: string) {
  // Soft delete
  const { error } = await supabase
    .from('apps')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', appId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        appId,
        table: 'apps',
        operation: 'DELETE'
      },
      tags: {
        layer: 'database',
        table: 'apps'
      }
    });
    throw error;
  }
}

// ============================================================================
// APP_AGENTS (Apps use Agents)
// ============================================================================

export async function linkAppAgent(appId: string, agentId: string, role: 'primary' | 'helper' | 'qa' = 'primary', orderIndex: number = 0) {
  const { error } = await supabase
    .from('app_agents')
    .insert({
      app_id: appId,
      agent_id: agentId,
      role,
      order_index: orderIndex
    });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        appId,
        agentId,
        role,
        table: 'app_agents',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'app_agents'
      }
    });
    throw error;
  }
}

export async function unlinkAppAgent(appId: string, agentId: string) {
  const { error } = await supabase
    .from('app_agents')
    .delete()
    .eq('app_id', appId)
    .eq('agent_id', agentId);

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        appId,
        agentId,
        table: 'app_agents',
        operation: 'DELETE'
      },
      tags: {
        layer: 'database',
        table: 'app_agents'
      }
    });
    throw error;
  }
}

export async function getAppAgents(appId: string) {
  const { data, error } = await supabase
    .from('app_agents')
    .select(`
      role,
      order_index,
      agent:agents_active(*)
    `)
    .eq('app_id', appId)
    .order('order_index', { ascending: true });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        appId,
        table: 'app_agents',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'app_agents'
      }
    });
    return [];
  }

  return data || [];
}

// ============================================================================
// ORGANIZATION INVITES
// ============================================================================

/**
 * Create an invite (returns token and URL)
 */
export async function createInvite(params: {
  org_id: string;
  email?: string;
  role: 'owner' | 'admin' | 'member' | 'guest' | 'developer' | 'analyst' | 'viewer' | 'billing';
  inviter_id: string;
}) {
  // Check for existing pending invite with same email
  if (params.email) {
    const { data: existing } = await supabase
      .from('org_invites')
      .select('id, token')
      .eq('org_id', params.org_id)
      .eq('email', params.email.toLowerCase())
      .eq('status', 'pending')
      .single();

    if (existing) {
      // Refresh existing invite (update expiry)
      const { data, error } = await supabase
        .from('org_invites')
        .update({
          role: params.role,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .eq('id', existing.id)
        .select('id, token')
        .single();

      if (error) {
        ErrorService.captureException(error, {
          severity: 'error',
          context: {
            orgId: params.org_id,
            email: params.email,
            inviteId: existing.id,
            table: 'org_invites',
            operation: 'UPDATE'
          },
          tags: {
            layer: 'database',
            table: 'org_invites'
          }
        });
        throw error;
      }

      return {
        invite_id: data.id,
        token: data.token,
        is_refresh: true
      };
    }
  }

  // Create new invite
  const { data, error } = await supabase
    .from('org_invites')
    .insert({
      org_id: params.org_id,
      email: params.email?.toLowerCase() || null,
      role: params.role,
      inviter_id: params.inviter_id
    })
    .select('id, token')
    .single();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId: params.org_id,
        email: params.email,
        role: params.role,
        table: 'org_invites',
        operation: 'INSERT'
      },
      tags: {
        layer: 'database',
        table: 'org_invites'
      }
    });
    throw error;
  }

  return {
    invite_id: data.id,
    token: data.token,
    is_refresh: false
  };
}

/**
 * Get invite details (for accept page)
 */
export async function getInviteDetails(token: string) {
  const { data, error } = await supabase.rpc('get_invite_details', {
    p_token: token
  });

  if (error || !data || data.length === 0) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: {
          function: 'get_invite_details',
          operation: 'RPC'
        },
        tags: {
          layer: 'database',
          function: 'rpc'
        }
      });
    }
    return null;
  }

  return data[0];
}

/**
 * Accept an invite (single-use, adds to org_members)
 */
export async function acceptInvite(params: {
  token: string;
  user_id: string;
}) {
  // 1. Get invite details
  const { data: invites, error: fetchError } = await supabase
    .from('org_invites')
    .select(ORG_INVITE_SELECT)
    .eq('token', params.token)
    .single();

  if (fetchError || !invites) {
    throw new Error('Invalid invite');
  }

  // 2. Validate
  if (invites.status !== 'pending') {
    throw new Error('Invite not available');
  }

  if (new Date(invites.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from('org_invites')
      .update({ status: 'expired' })
      .eq('id', invites.id);
    throw new Error('Invite expired');
  }

  // 3. Add to organization_members (upsert)
  const { error: memberError } = await supabase
    .from('organization_members')
    .upsert({
      organization_id: invites.org_id,
      user_id: params.user_id,
      role: invites.role
    }, {
      onConflict: 'organization_id,user_id'
    });

  if (memberError) {
    ErrorService.captureException(memberError, {
      severity: 'error',
      context: {
        orgId: invites.org_id,
        userId: params.user_id,
        table: 'organization_members',
        operation: 'UPSERT'
      },
      tags: {
        layer: 'database',
        table: 'organization_members'
      }
    });
    throw memberError;
  }

  // 4. Mark invite as accepted
  const { error: updateError } = await supabase
    .from('org_invites')
    .update({
      status: 'accepted',
      accepted_user_id: params.user_id,
      accepted_at: new Date().toISOString()
    })
    .eq('id', invites.id);

  if (updateError) {
    ErrorService.captureException(updateError, {
      severity: 'error',
      context: {
        inviteId: invites.id,
        userId: params.user_id,
        table: 'org_invites',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'org_invites'
      }
    });
    throw updateError;
  }

  // 5. Get workspace scope (org + primary project + environment)
  const { data: workspace, error: wsError } = await supabase.rpc('get_current_workspace', {
    p_user_id: params.user_id,
    p_org_id: invites.org_id
  });

  if (wsError || !workspace || workspace.length === 0) {
    if (wsError) {
      ErrorService.captureException(wsError, {
        severity: 'error',
        context: {
          userId: params.user_id,
          orgId: invites.org_id,
          function: 'get_current_workspace',
          operation: 'RPC'
        },
        tags: {
          layer: 'database',
          function: 'rpc'
        }
      });
    }
    return {
      org_id: invites.org_id,
      project_id: null,
      env_id: null
    };
  }

  const ws = workspace[0];
  return {
    org_id: ws.org_id,
    org_name: ws.org_name,
    project_id: ws.project_id,
    env_id: ws.env_id
  };
}

/**
 * Revoke an invite
 */
export async function revokeInvite(invite_id: string) {
  const { error } = await supabase
    .from('org_invites')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString()
    })
    .eq('id', invite_id)
    .eq('status', 'pending'); // Only revoke pending invites

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        inviteId: invite_id,
        table: 'org_invites',
        operation: 'UPDATE'
      },
      tags: {
        layer: 'database',
        table: 'org_invites'
      }
    });
    throw error;
  }
}

/**
 * Get all invites for an organization
 */
export async function getOrgInvites(org_id: string) {
  const { data, error } = await supabase
    .from('org_invites')
    .select(`
      id,
      email,
      role,
      status,
      expires_at,
      created_at,
      token,
      inviter:profiles!org_invites_inviter_id_fkey(name)
    `)
    .eq('org_id', org_id)
    .order('created_at', { ascending: false });

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId: org_id,
        table: 'org_invites',
        operation: 'SELECT'
      },
      tags: {
        layer: 'database',
        table: 'org_invites'
      }
    });
    return [];
  }

  return data || [];
}

/**
 * Mark expired invites (can be called periodically)
 */
export async function markExpiredInvites() {
  const { error } = await supabase.rpc('mark_expired_invites');

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        function: 'mark_expired_invites',
        operation: 'RPC'
      },
      tags: {
        layer: 'database',
        function: 'rpc'
      }
    });
  }
}

// ============================================================================
// AI ASSISTANTS (Lucid Personal)
// ============================================================================

/**
 * Get all assistants for an organization
 */
/**
 * Lean projection of agents for fleet-card list views. Only the four
 * columns a card needs — no `system_prompt`, no model settings, no
 * channel join. Sorted newest-first, capped at `limit` rows, and scoped
 * strictly by `org_id`. Used by the retail funnel fleet page; safe to
 * reuse for any other list view that wants a small payload.
 */
export async function getRetailFleetAssistantsSummary(
  orgId: string,
  limit: number,
): Promise<
  Array<{ id: string; name: string; created_at: string; is_active: boolean }>
> {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select('id, name, created_at, is_active')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, limit, operation: 'getRetailFleetAssistantsSummary' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    return []
  }

  return (data || []) as Array<{
    id: string
    name: string
    created_at: string
    is_active: boolean
  }>
}

export async function getAssistants(orgId: string) {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select(`
      id,
      org_id,
      project_id,
      name,
      description,
      system_prompt,
      lucid_model,
      temperature,
      max_tokens,
      memory_enabled,
      memory_window_size,
      is_active,
      created_at,
      updated_at,
      wallet_enabled,
      mc_status,
      passport_id,
      engine,
      runtime_id,
      runtime_flavor,
      crew_id,
      assistant_channels (
        id,
        channel_type,
        is_active,
        webhook_url
      ),
      assistant_plugin_activations (
        id,
        is_active,
        org_plugin_installations (
          plugin_catalog (
            slug
          )
        )
      ),
      assistant_skill_activations (
        id,
        is_active,
        org_skill_installations (
          skill_catalog (
            slug
          )
        )
      )
    `)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, operation: 'getAssistants' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    return []
  }

  const assistants = data || []
  if (assistants.length === 0) return assistants

  const projectIds = Array.from(
    new Set(
      assistants
        .map((assistant) => assistant.project_id)
        .filter((projectId): projectId is string => typeof projectId === 'string' && projectId.length > 0),
    ),
  )

  if (projectIds.length === 0) {
    return assistants.map((assistant) => ({
      ...assistant,
      projectSlug: null,
    }))
  }

  const { data: projects, error: projectsError } = await supabase
    .from('projects')
    .select('id, slug')
    .in('id', projectIds)

  if (projectsError) {
    ErrorService.captureException(projectsError, {
      severity: 'warning',
      context: { orgId, operation: 'getAssistants', step: 'loadProjectSlugs' },
      tags: { layer: 'database', table: 'projects' },
    })

    return assistants.map((assistant) => ({
      ...assistant,
      projectSlug: null,
    }))
  }

  const projectSlugById = new Map(
    (projects || []).map((project) => [project.id as string, project.slug as string]),
  )

  return assistants.map((assistant) => ({
    ...assistant,
    projectSlug: assistant.project_id ? (projectSlugById.get(assistant.project_id) ?? null) : null,
  }))
}

export async function getAssistantsByProject(orgId: string, projectId: string) {
  const { data, error } = await supabase
    .from('ai_assistants')
    .select(`
      id,
      org_id,
      project_id,
      name,
      description,
      system_prompt,
      lucid_model,
      temperature,
      max_tokens,
      memory_enabled,
      memory_window_size,
      is_active,
      created_at,
      updated_at,
      wallet_enabled,
      mc_status,
      passport_id,
      engine,
      runtime_id,
      runtime_flavor,
      crew_id,
      assistant_channels (
        id,
        channel_type,
        is_active,
        webhook_url
      ),
      assistant_plugin_activations (
        id,
        is_active,
        org_plugin_installations (
          plugin_catalog (
            slug
          )
        )
      ),
      assistant_skill_activations (
        id,
        is_active,
        org_skill_installations (
          skill_catalog (
            slug
          )
        )
      )
    `)
    .eq('org_id', orgId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, projectId, operation: 'getAssistantsByProject' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    return []
  }

  return data || []
}

/**
 * Get a single assistant by ID with channels
 */
export async function getAssistant(assistantId: string) {
  // Try with agent_wallets join first; fall back without if migration 079 hasn't been applied
  let { data, error } = await supabase
    .from('ai_assistants')
    .select(`
      id,
      org_id,
      project_id,
      name,
      description,
      system_prompt,
      lucid_model,
      temperature,
      max_tokens,
      memory_enabled,
      memory_window_size,
      is_active,
      created_at,
      updated_at,
      wallet_enabled,
      telegram_share_enabled,
      telegram_display_name,
      telegram_role_title,
      telegram_essence,
      telegram_starter_prompts,
      telegram_voice_mode,
      telegram_voice_id,
      telegram_voice_instructions,
      discord_share_enabled,
      slack_share_enabled,
      policy_config,
      engine,
      passport_id,
      runtime_id,
      runtime_flavor,
      crew_id,
      assistant_channels (
        id,
        channel_type,
        external_channel_id,
        channel_config,
        is_active,
        webhook_url,
        created_at
      ),
      agent_wallets (
        id,
        chain_type,
        address,
        privy_wallet_id,
        status,
        withdrawal_address
      )
    `)
    .eq('id', assistantId)
    .single()

  // Fallback: if the query fails (migration not yet applied), retry without wallet fields
  if (error && shouldFallbackWalletSchemaQuery(error)) {
    const fallback = await supabase
      .from('ai_assistants')
      .select(`
        id,
        org_id,
        project_id,
        name,
        description,
        system_prompt,
        lucid_model,
        temperature,
        max_tokens,
        memory_enabled,
        memory_window_size,
        is_active,
        created_at,
        updated_at,
        telegram_share_enabled,
        telegram_display_name,
        telegram_role_title,
        telegram_essence,
        telegram_starter_prompts,
        discord_share_enabled,
        slack_share_enabled,
        engine,
        passport_id,
        runtime_id,
        runtime_flavor,
        crew_id,
        assistant_channels (
          id,
          channel_type,
          external_channel_id,
          channel_config,
          is_active,
          webhook_url,
          created_at
        )
      `)
      .eq('id', assistantId)
      .single()

    if (fallback.error) {
      if (isPostgrestNoRowsError(fallback.error)) return null

      ErrorService.captureException(fallback.error, {
        severity: 'error',
        context: { assistantId, operation: 'getAssistant' },
        tags: { layer: 'database', table: 'ai_assistants' },
      })
      return null
    }

    return {
      ...fallback.data,
      wallet_enabled: false,
      agent_wallets: [],
      policy_config: null,
      telegram_share_enabled: fallback.data.telegram_share_enabled ?? false,
      telegram_display_name: fallback.data.telegram_display_name ?? null,
      telegram_role_title: fallback.data.telegram_role_title ?? null,
      telegram_essence: fallback.data.telegram_essence ?? null,
      telegram_starter_prompts: Array.isArray(fallback.data.telegram_starter_prompts)
        ? fallback.data.telegram_starter_prompts
        : [],
        telegram_voice_mode:
        (fallback.data as { telegram_voice_mode?: unknown }).telegram_voice_mode === 'auto' ||
        (fallback.data as { telegram_voice_mode?: unknown }).telegram_voice_mode === 'always'
          ? (fallback.data as { telegram_voice_mode?: 'auto' | 'always' }).telegram_voice_mode
          : 'off',
      telegram_voice_id:
        ((fallback.data as { telegram_voice_id?: unknown }).telegram_voice_id as string | null | undefined) ?? null,
      telegram_voice_instructions:
        ((fallback.data as { telegram_voice_instructions?: unknown }).telegram_voice_instructions as string | null | undefined) ?? null,
      discord_share_enabled: fallback.data.discord_share_enabled ?? false,
      slack_share_enabled: fallback.data.slack_share_enabled ?? false,
      }
  }

  if (error) {
    if (isPostgrestNoRowsError(error)) return null

    ErrorService.captureException(error, {
      severity: 'error',
      context: { assistantId, operation: 'getAssistant' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    return null
  }

  return data
}

function isPostgrestNoRowsError(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  return Boolean(
    error?.code === 'PGRST116' ||
    /cannot coerce the result to a single json object/i.test(error?.message ?? ''),
  )
}

/**
 * Create a new assistant
 */
export async function createAssistant(params: {
  orgId: string
  projectId: string
  envId: string
  name: string
  systemPrompt?: string
  lucidModel?: string
  temperature?: number
  maxTokens?: number
  memoryEnabled?: boolean
  runtimeId?: string
  runtimeFlavor?: RuntimeFlavor
  engine?: AgentEngine
}) {
  const { data, error } = await supabase
    .from('ai_assistants')
    .insert({
      org_id: params.orgId,
      project_id: params.projectId,
      env_id: params.envId,
      name: params.name,
      system_prompt: params.systemPrompt || 'You are a helpful AI agent.',
      lucid_model: resolveAgentModel(params.lucidModel),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 1024,
      memory_enabled: params.memoryEnabled ?? true,
      memory_window_size: 20,
      is_active: true,
      ...(params.runtimeId && { runtime_id: params.runtimeId }),
      ...(params.runtimeFlavor && { runtime_flavor: params.runtimeFlavor }),
      ...(params.engine && { engine: params.engine }),
    })
    .select(AI_ASSISTANT_SELECT)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: params.orgId, operation: 'createAssistant' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    throw error
  }

  return data
}

/**
 * Thrown when `updateAssistant` is called with `orgId` scoping and the
 * UPDATE matched 0 rows — either the assistant no longer exists, or it
 * was reassigned to another org between the caller's ownership check and
 * this write (TOCTOU). Callers should treat this as "not yours" and
 * collapse to 404 at the HTTP boundary.
 */
export class AssistantOrgMismatchError extends Error {
  constructor(
    public readonly assistantId: string,
    public readonly expectedOrgId: string,
  ) {
    super(
      `updateAssistant: no row matched id=${assistantId} org_id=${expectedOrgId} — cross-org write prevented`,
    )
    this.name = 'AssistantOrgMismatchError'
  }
}

/**
 * Update an assistant.
 *
 * When `orgId` is provided, the UPDATE is scoped by both `id` and
 * `org_id`. A 0-row result throws `AssistantOrgMismatchError` instead of
 * silently succeeding — this closes the TOCTOU window where an assistant
 * is reassigned between an ownership check and the write, and is the
 * preferred call shape for any handler that has an org context (retail
 * funnel, workspace studio routes). Legacy callers that don't pass
 * `orgId` get the old behavior.
 */
export async function updateAssistant(
  assistantId: string,
  updates: {
    name?: string
    description?: string | null
    system_prompt?: string
    soul_content?: string | null
    lucid_model?: string
    engine?: string | null
    runtime_flavor?: 'shared' | 'c1_managed' | 'c2a_autonomous' | null
    temperature?: number
    max_tokens?: number
    memory_enabled?: boolean
    memory_window_size?: number
    is_active?: boolean
    policy_config?: Record<string, unknown> | null
    passport_id?: string
    telegram_voice_mode?: 'off' | 'auto' | 'always'
    telegram_voice_id?: string | null
    telegram_voice_instructions?: string | null
  },
  orgId?: string,
) {
  let query = supabase
    .from('ai_assistants')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', assistantId)

  if (orgId) {
    query = query.eq('org_id', orgId)
  }

  const { data, error } = await query.select(AI_ASSISTANT_SELECT).maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { assistantId, orgId, operation: 'updateAssistant' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    throw error
  }

  if (!data) {
    if (orgId) {
      // Scoped update matched 0 rows — cross-org or non-existent.
      throw new AssistantOrgMismatchError(assistantId, orgId)
    }
    // Legacy path: id-only match also returned nothing. Preserve the
    // previous throw shape (`.single()` used to blow up with a PGRST116)
    // so existing callers don't silently see `null`.
    const notFound = new Error(
      `updateAssistant: assistant ${assistantId} not found`,
    )
    ErrorService.captureException(notFound, {
      severity: 'error',
      context: { assistantId, operation: 'updateAssistant' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    throw notFound
  }

  return data
}

/**
 * Delete an assistant (hard delete — all child rows cascade).
 */
export async function deleteAssistant(assistantId: string) {
  const { error } = await supabase
    .from('ai_assistants')
    .delete()
    .eq('id', assistantId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { assistantId, operation: 'deleteAssistant' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    throw error
  }
}

/**
 * Get assistant channel for webhook validation (service role)
 */
export async function getAssistantChannelForWebhook(channelId: string, channelType: string): Promise<{
  id: string
  assistant_id: string
  secret_token_hash: string | null
  connection_mode: string | null
  external_channel_id: string | null
  channel_config: Record<string, unknown> | null
  encrypted_secrets: { id: string; encrypted_data: string } | null
} | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select(`
      id,
      assistant_id,
      secret_token_hash,
      connection_mode,
      external_channel_id,
      channel_config,
      encrypted_secrets:encrypted_secrets_id (
        id,
        encrypted_data
      )
    `)
    .eq('id', channelId)
    .eq('channel_type', channelType)
    .eq('is_active', true)
    .single();

  if (error) {
    // Don't throw - channel not found is expected for invalid webhooks
    return null;
  }

  return data as unknown as {
    id: string
    assistant_id: string
    secret_token_hash: string | null
    connection_mode: string | null
    external_channel_id: string | null
    channel_config: Record<string, unknown> | null
    encrypted_secrets: { id: string; encrypted_data: string } | null
  };
}

async function persistEncryptedChannelSecrets(
  secrets: Record<string, string>,
): Promise<string | null> {
  if (Object.keys(secrets).length === 0) {
    return null
  }

  const encrypted = encryptChannelSecrets(secrets)
  const { data, error } = await supabase
    .from('encrypted_secrets')
    .insert({ encrypted_data: encrypted })
    .select('id')
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Failed to persist encrypted channel secrets'), {
      severity: 'error',
      context: { operation: 'persistEncryptedChannelSecrets' },
      tags: { layer: 'database', table: 'encrypted_secrets' },
    })
    throw error ?? new Error('Failed to persist encrypted channel secrets')
  }

  return data.id as string
}

async function replaceEncryptedChannelSecrets(
  channelId: string,
  secrets: Record<string, string>,
): Promise<string | null> {
  const encryptedSecretsId = await persistEncryptedChannelSecrets(secrets)

  const { error } = await supabase
    .from('assistant_channels')
    .update({ encrypted_secrets_id: encryptedSecretsId })
    .eq('id', channelId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { channelId, operation: 'replaceEncryptedChannelSecrets' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }

  return encryptedSecretsId
}

export async function reactivateAssistantChannelWithSecrets(params: {
  channelId: string
  secrets: Record<string, string>
}) {
  const encryptedSecretsId = await replaceEncryptedChannelSecrets(params.channelId, params.secrets)
  const { error } = await supabase
    .from('assistant_channels')
    .update({
      is_active: true,
      encrypted_secrets_id: encryptedSecretsId,
      metadata: {},
    })
    .eq('id', params.channelId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { channelId: params.channelId, operation: 'reactivateAssistantChannelWithSecrets' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }
}

/**
 * Replay-dedupe lookup for the hosted Telegram webhook.
 *
 * The default dedupe key on `assistant_inbound_events` is
 * `(channel_id, external_message_id)`, which is insufficient when the chat's
 * primary agent swaps between Telegram retries — the same `update_id` arrives
 * a second time, resolves to a different `channel_id`, and bypasses dedupe.
 *
 * This helper checks for ANY prior telegram inbound event matching the
 * `(external_chat_id, external_message_id)` pair, regardless of which channel
 * it was stored under. Backed by `idx_inbound_events_telegram_replay`.
 */
export async function hasTelegramInboundForChatMessage(
  chatId: string,
  externalMessageId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('assistant_inbound_events')
    .select('id')
    .eq('external_chat_id', chatId)
    .eq('external_message_id', externalMessageId)
    .limit(1)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { chatId, externalMessageId, operation: 'hasTelegramInboundForChatMessage' },
      tags: { layer: 'database', table: 'assistant_inbound_events' },
    })
    return false
  }

  return Array.isArray(data) && data.length > 0
}

export async function hasWhatsAppInboundForChatMessage(
  chatId: string,
  externalMessageId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('assistant_inbound_events')
    .select('id')
    .eq('external_chat_id', chatId)
    .eq('external_message_id', externalMessageId)
    .limit(1)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { chatId, externalMessageId, operation: 'hasWhatsAppInboundForChatMessage' },
      tags: { layer: 'database', table: 'assistant_inbound_events' },
    })
    return false
  }

  return Array.isArray(data) && data.length > 0
}

/**
 * Insert inbound event (idempotent - uses upsert)
 */
export async function insertAssistantInboundEvent(event: {
  channel_id: string;
  assistant_id: string;
  external_message_id: string;
  external_user_id: string;
  external_chat_id: string;
  message_text?: string | null;
  message_data?: Record<string, unknown>;
}) {
  const { data, error } = await supabase
    .from('assistant_inbound_events')
    .upsert(event, {
      onConflict: 'channel_id,external_message_id',
      ignoreDuplicates: true,
    })
    .select('id, assistant_id')
    .maybeSingle();

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        channelId: event.channel_id,
        externalMessageId: event.external_message_id,
        table: 'assistant_inbound_events',
        operation: 'UPSERT'
      },
      tags: {
        layer: 'database',
        table: 'assistant_inbound_events'
      }
    });
    throw error;
  }

  return data
    ? {
        id: data.id as string,
        assistant_id: data.assistant_id as string,
      }
    : null
}

// ─────────────────────────────────────────────────────────────────────────────
// Web Channel Helpers (Agent Test Chat)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Find or create an active web channel for an assistant.
 * Idempotent — returns existing channel if one exists.
 */
export async function ensureWebChannel(assistantId: string): Promise<{ id: string }> {
  // Use limit(1) to handle multiple existing web channels (maybeSingle errors on >1 row)
  const { data: existing } = await supabase
    .from('assistant_channels')
    .select('id')
    .eq('assistant_id', assistantId)
    .eq('channel_type', 'web')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  const secretToken = crypto.randomUUID()
  const { data, error } = await supabase
    .from('assistant_channels')
    .insert({
      assistant_id: assistantId,
      channel_type: 'web',
      secret_token_hash: secretToken,
      is_active: true,
    })
    .select('id')
    .single()

  if (error) {
    // Race condition: concurrent request already created the channel
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('assistant_channels')
        .select('id')
        .eq('assistant_id', assistantId)
        .eq('channel_type', 'web')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (retry) return retry
    }
    ErrorService.captureException(error, {
      severity: 'error',
      context: { assistantId, operation: 'ensureWebChannel' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }

  return data
}

/**
 * Find the most recent active web conversation for a user on a channel.
 */
export async function getWebConversation(
  channelId: string,
  userId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('assistant_conversations')
    .select('id')
    .eq('channel_id', channelId)
    .eq('external_user_id', userId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return data
}

/**
 * Read messages from assistant_messages for a conversation.
 */
export async function getAssistantConversationMessages(
  conversationId: string,
  limit = 100,
) {
  const { data, error } = await supabase
    .from('assistant_messages')
    .select('id, role, content, tool_name, tool_output, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { conversationId, operation: 'getAssistantConversationMessages' },
      tags: { layer: 'database', table: 'assistant_messages' },
    })
    return []
  }

  return data || []
}

/**
 * Check inbound event processing status.
 */
export async function getInboundEventStatus(
  eventId: string,
): Promise<{ status: string; last_error: string | null } | null> {
  const { data } = await supabase
    .from('assistant_inbound_events')
    .select('status, last_error')
    .eq('id', eventId)
    .maybeSingle()

  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// Org LucidGateway Key Management
// ─────────────────────────────────────────────────────────────────────────────

export type OrgLucidGatewayKeyAuditEventType =
  | 'created'
  | 'rotated'
  | 'revoked'
  | 'revocation_started'
  | 'rotation_started'
  | 'rotation_completed'
  | 'rotation_failed'
  | 'error'

export async function logOrgLucidGatewayKeyAuditEvent(params: {
  orgId: string
  keyId?: string | null
  eventType: OrgLucidGatewayKeyAuditEventType
  actorUserId?: string | null
  projectId?: string | null
  metadata?: Record<string, unknown>
}) {
  const { data, error } = await supabase
    .from('org_lucidgateway_key_audit_events')
    .insert({
      org_id: params.orgId,
      key_id: params.keyId || null,
      event_type: params.eventType,
      actor_user_id: params.actorUserId || null,
      project_id: params.projectId || null,
      metadata: params.metadata || {},
    })
    .select('id, org_id, key_id, event_type, actor_user_id, project_id, metadata, created_at')
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: {
        orgId: params.orgId,
        keyId: params.keyId || null,
        eventType: params.eventType,
        operation: 'logOrgLucidGatewayKeyAuditEvent',
      },
      tags: { layer: 'database', table: 'org_lucidgateway_key_audit_events' },
    })
  }

  return data
}

export async function listOrgLucidGatewayKeyAuditEvents(params: {
  orgId: string
  keyId?: string
  eventType?: OrgLucidGatewayKeyAuditEventType
  limit?: number
}) {
  let query = supabase
    .from('org_lucidgateway_key_audit_events')
    .select('id, org_id, key_id, event_type, actor_user_id, project_id, metadata, created_at')
    .eq('org_id', params.orgId)
    .order('created_at', { ascending: false })

  if (params.keyId) {
    query = query.eq('key_id', params.keyId)
  }
  if (params.eventType) {
    query = query.eq('event_type', params.eventType)
  }
  if (params.limit) {
    query = query.limit(params.limit)
  }

  const { data, error } = await query

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId: params.orgId,
        keyId: params.keyId,
        operation: 'listOrgLucidGatewayKeyAuditEvents',
      },
      tags: { layer: 'database', table: 'org_lucidgateway_key_audit_events' },
    })
    return []
  }

  return data || []
}

const KEY_SELECT_COLUMNS =
  'id, org_id, key_alias, key_preview, lucidgateway_key_id, rpm_limit, tpm_limit, max_budget, budget_duration, models, is_active, status, metadata, created_by, rotated_from_key_id, project_id, created_at, updated_at, revoked_at'

export async function listOrgLucidGatewayKeys(orgId: string) {
  const { data, error } = await supabase
    .from('org_lucidgateway_keys')
    .select(KEY_SELECT_COLUMNS)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, operation: 'listOrgLucidGatewayKeys' },
      tags: { layer: 'database', table: 'org_lucidgateway_keys' },
    })
    return []
  }

  return data || []
}

export async function getOrgLucidGatewayKey(orgId: string, keyId: string) {
  const { data, error } = await supabase
    .from('org_lucidgateway_keys')
    .select(KEY_SELECT_COLUMNS)
    .eq('org_id', orgId)
    .eq('id', keyId)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { orgId, keyId, operation: 'getOrgLucidGatewayKey' },
      tags: { layer: 'database', table: 'org_lucidgateway_keys' },
    })
    return null
  }

  return data
}

export async function createOrgLucidGatewayKey(params: {
  orgId: string
  keyAlias: string
  keyPreview: string
  lucidgatewayKeyId?: string | null
  rawVirtualKey: string
  rpmLimit?: number | null
  tpmLimit?: number | null
  maxBudget?: number | null
  budgetDuration?: string | null
  models?: string[]
  metadata?: Record<string, unknown>
  createdBy?: string | null
  rotatedFromKeyId?: string | null
  projectId?: string | null
}) {
  const { data, error } = await supabase
    .from('org_lucidgateway_keys')
    .insert({
      org_id: params.orgId,
      key_alias: params.keyAlias,
      key_preview: params.keyPreview,
      lucidgateway_key_id: params.lucidgatewayKeyId || null,
      encrypted_virtual_key: params.rawVirtualKey,
      rpm_limit: params.rpmLimit ?? null,
      tpm_limit: params.tpmLimit ?? null,
      max_budget: params.maxBudget ?? null,
      budget_duration: params.budgetDuration ?? null,
      models: params.models || [],
      status: 'active',
      is_active: true,
      metadata: params.metadata || {},
      created_by: params.createdBy || null,
      rotated_from_key_id: params.rotatedFromKeyId || null,
      project_id: params.projectId || null,
    })
    .select(KEY_SELECT_COLUMNS)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        orgId: params.orgId,
        keyAlias: params.keyAlias,
        operation: 'createOrgLucidGatewayKey',
      },
      tags: { layer: 'database', table: 'org_lucidgateway_keys' },
    })
    throw error
  }

  return data
}

export async function setOrgLucidGatewayKeyStatus(params: {
  orgId: string
  keyId: string
  status: string
  isActive: boolean
  metadata?: Record<string, unknown>
}) {
  const updatePayload: Record<string, unknown> = {
    status: params.status,
    is_active: params.isActive,
  }

  if (params.metadata) {
    updatePayload.metadata = params.metadata
  }

  if (params.status === 'revoked') {
    updatePayload.revoked_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('org_lucidgateway_keys')
    .update(updatePayload)
    .eq('org_id', params.orgId)
    .eq('id', params.keyId)
    .select(KEY_SELECT_COLUMNS)
    .single()

  if (error || !data) {
    ErrorService.captureException(error || new Error('Failed to update org_lucidgateway_keys row'), {
      severity: 'error',
      context: {
        orgId: params.orgId,
        keyId: params.keyId,
        status: params.status,
        operation: 'setOrgLucidGatewayKeyStatus',
      },
      tags: { layer: 'database', table: 'org_lucidgateway_keys' },
    })
    throw error || new Error('setOrgLucidGatewayKeyStatus returned no data')
  }

  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// Key Templates
// ─────────────────────────────────────────────────────────────────────────────

export async function createKeyTemplate(params: {
  orgId: string
  templateName: string
  description?: string
  config: Record<string, unknown>
  createdBy: string
}) {
  const { data, error } = await supabase
    .from('org_key_templates')
    .insert({
      org_id: params.orgId,
      template_name: params.templateName,
      description: params.description || null,
      config: params.config,
      created_by: params.createdBy,
    })
    .select(ORG_KEY_TEMPLATE_SELECT)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId: params.orgId, templateName: params.templateName, operation: 'createKeyTemplate' },
      tags: { layer: 'database', table: 'org_key_templates' },
    })
    throw error
  }

  return data
}

export async function listKeyTemplates(orgId: string) {
  const { data, error } = await supabase
    .from('org_key_templates')
    .select(ORG_KEY_TEMPLATE_SELECT)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { orgId, operation: 'listKeyTemplates' },
      tags: { layer: 'database', table: 'org_key_templates' },
    })
    return []
  }

  return data || []
}

export async function getKeyTemplate(templateId: string) {
  const { data, error } = await supabase
    .from('org_key_templates')
    .select(ORG_KEY_TEMPLATE_SELECT)
    .eq('id', templateId)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { templateId, operation: 'getKeyTemplate' },
      tags: { layer: 'database', table: 'org_key_templates' },
    })
    return null
  }

  return data
}

export async function deleteKeyTemplate(templateId: string) {
  const { error } = await supabase
    .from('org_key_templates')
    .delete()
    .eq('id', templateId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { templateId, operation: 'deleteKeyTemplate' },
      tags: { layer: 'database', table: 'org_key_templates' },
    })
    throw error
  }
}

// ============================================================================
// TRADING POLICY
// ============================================================================

/**
 * Get trading policy for an assistant. Returns null if none configured.
 */
export async function getTradingPolicy(assistantId: string) {
  const { data, error } = await supabase
    .from('trading_policies')
    .select(TRADING_POLICY_SELECT)
    .eq('assistant_id', assistantId)
    .single()

  if (error && error.code !== 'PGRST116') {
    // PGRST116 = no rows found — that's expected when no policy exists
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { assistantId },
      tags: { layer: 'database', table: 'trading_policies' },
    })
    return null
  }

  return data
}

export async function getAssistantOAuthBindings(assistantId: string) {
  const { data, error } = await supabase.rpc('get_assistant_oauth_bindings', {
    p_assistant_id: assistantId,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { assistantId },
      tags: { layer: 'database', table: 'assistant_oauth_bindings' },
    })
    return []
  }

  return data || []
}

// ============================================================================
// ASSISTANT CHANNELS (CRUD)
// ============================================================================

/**
 * List all channels for an assistant
 */
export async function listAssistantChannels(assistantId: string) {
  const { data, error } = await supabase
      .from('assistant_channels')
      .select('id, assistant_id, channel_type, external_channel_id, channel_config, is_active, connection_mode, inbound_routing_config, created_at, updated_at')
      .eq('assistant_id', assistantId)
      .order('created_at', { ascending: false })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { assistantId, operation: 'listAssistantChannels' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    return []
  }

  return data || []
}

/**
 * Create a new assistant channel
 * Generates a random secret_token_hash for webhook validation
 */
export async function createAssistantChannel(params: {
  assistantId: string
  channelType: string
  secrets?: Record<string, string>
  /**
   * External channel/chat/guild ID on the remote platform.
   *   - telegram: chat_id
   *   - discord BYOB: channel_id (v1)
   *   - discord hosted: guild_id (v2)
   *   - whatsapp: phone_number
   * Persisted to `assistant_channels.external_channel_id`.
   */
  externalChannelId?: string
  /**
   * 'byob' (tenant-owned credentials) or 'hosted' (Lucid-owned). Defaults to
   * whatever the DB default is (migration 068 sets a default).
   */
  connectionMode?: 'byob' | 'hosted'
  /**
   * Per-channel routing behaviour (prefix, dedicated_channel, respond_on_mention).
   * Persisted to `assistant_channels.inbound_routing_config`.
   */
  inboundRoutingConfig?: Record<string, unknown>
}) {
  // Generate a random secret token for webhook validation
  const secretToken = crypto.randomUUID()
  const encryptedSecretsId = await persistEncryptedChannelSecrets(params.secrets || {})

  // Build insert payload — only include optional columns when provided so we
  // don't overwrite DB defaults with undefined.
  const insertPayload: Record<string, unknown> = {
    assistant_id: params.assistantId,
    channel_type: params.channelType,
    secret_token_hash: hashChannelSecret(secretToken),
    is_active: true,
    channel_config: {},
    encrypted_secrets_id: encryptedSecretsId,
  }
  if (params.externalChannelId !== undefined) {
    insertPayload.external_channel_id = params.externalChannelId
  }
  if (params.connectionMode !== undefined) {
    insertPayload.connection_mode = params.connectionMode
  }
  if (params.inboundRoutingConfig !== undefined) {
    insertPayload.inbound_routing_config = params.inboundRoutingConfig
  }

  const { data, error } = await supabase
    .from('assistant_channels')
    .insert(insertPayload)
    .select(ASSISTANT_CHANNEL_WRITE_SELECT)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        assistantId: params.assistantId,
        channelType: params.channelType,
        operation: 'createAssistantChannel',
      },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }

  return { channel: data, secretToken }
}

/**
 * Delete an assistant channel
 */
export async function deleteAssistantChannel(channelId: string) {
  const { error } = await supabase
    .from('assistant_channels')
    .delete()
    .eq('id', channelId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { channelId, operation: 'deleteAssistantChannel' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }
}

export async function updateHostedDiscordChannelSettings(params: {
  channelId: string
  dedicatedChannelIds?: string[]
  prefix?: string | null
  respondOnMention?: boolean
  threadSupport?: boolean
  ignoreBots?: boolean
  allowedUserIds?: string[]
  ackReaction?: string | null
  typingReaction?: string | null
  streamingPreview?: boolean
  streamingMode?: 'off' | 'partial' | 'block' | 'progress'
  replyToMode?: 'off' | 'first' | 'all'
  threadHistoryScope?: 'thread' | 'channel'
  threadInheritParent?: boolean
  threadInitialHistoryLimit?: number | null
  maxLinesPerMessage?: number
  chunkMode?: 'length' | 'newline'
}) {
  const { data: current, error: fetchError } = await supabase
    .from('assistant_channels')
    .select('id, channel_type, connection_mode, channel_config, inbound_routing_config')
    .eq('id', params.channelId)
    .eq('channel_type', 'discord')
    .eq('connection_mode', 'hosted')
    .limit(1)
    .maybeSingle()

  if (fetchError || !current) {
    ErrorService.captureException(fetchError ?? new Error('Hosted Discord channel not found'), {
      severity: 'error',
      context: { channelId: params.channelId, operation: 'updateHostedDiscordChannelSettings.fetch' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw fetchError ?? new Error('Hosted Discord channel not found')
  }

  const nextConfig =
    current.channel_config && typeof current.channel_config === 'object'
      ? { ...(current.channel_config as Record<string, unknown>) }
      : {}

  if (params.dedicatedChannelIds) {
    nextConfig.discord_dedicated_channel_ids = params.dedicatedChannelIds
  }
  if (params.replyToMode) {
    nextConfig.discord_reply_to_mode = params.replyToMode
  }
  if (params.maxLinesPerMessage !== undefined) {
    nextConfig.discord_max_lines_per_message = params.maxLinesPerMessage
  }
  if (params.chunkMode) {
    nextConfig.discord_chunk_mode = params.chunkMode
  }
  if (params.allowedUserIds !== undefined) {
    nextConfig.discord_allowed_user_ids = params.allowedUserIds
  }
  if (params.ackReaction !== undefined) {
    nextConfig.discord_ack_reaction = params.ackReaction
  }
  if (params.typingReaction !== undefined) {
    nextConfig.discord_typing_reaction = params.typingReaction
  }
  if (params.streamingPreview !== undefined) {
    nextConfig.discord_streaming_preview = params.streamingPreview
  }
  if (params.streamingMode !== undefined) {
    nextConfig.discord_streaming_mode = params.streamingMode
    nextConfig.discord_streaming_preview = params.streamingMode !== 'off'
  }
  if (params.threadHistoryScope !== undefined) {
    nextConfig.discord_thread_history_scope = params.threadHistoryScope
  }
  if (params.threadInheritParent !== undefined) {
    nextConfig.discord_thread_inherit_parent = params.threadInheritParent
  }
  if (params.threadInitialHistoryLimit !== undefined) {
    nextConfig.discord_thread_initial_history_limit = params.threadInitialHistoryLimit
  }

  const nextRoutingConfig =
    current.inbound_routing_config && typeof current.inbound_routing_config === 'object'
      ? { ...(current.inbound_routing_config as Record<string, unknown>) }
      : {}

  if (params.prefix !== undefined) {
    nextRoutingConfig.prefix =
      typeof params.prefix === 'string' && params.prefix.trim().length > 0
        ? params.prefix.trim()
        : null
  }
  if (params.respondOnMention !== undefined) {
    nextRoutingConfig.respond_on_mention = params.respondOnMention
  }
  if (params.threadSupport !== undefined) {
    nextRoutingConfig.thread_support = params.threadSupport
  }
  if (params.ignoreBots !== undefined) {
    nextRoutingConfig.ignore_bots = params.ignoreBots
  }

  if (!Object.prototype.hasOwnProperty.call(nextRoutingConfig, 'respond_on_mention')) {
    nextRoutingConfig.respond_on_mention = true
  }
  if (!Object.prototype.hasOwnProperty.call(nextRoutingConfig, 'ignore_bots')) {
    nextRoutingConfig.ignore_bots = true
  }

  const { error: updateError } = await supabase
    .from('assistant_channels')
    .update({
      channel_config: nextConfig,
      inbound_routing_config: nextRoutingConfig,
    })
    .eq('id', params.channelId)

  if (updateError) {
    ErrorService.captureException(updateError, {
      severity: 'error',
      context: {
        channelId: params.channelId,
        dedicatedChannelIds: params.dedicatedChannelIds,
        prefix: params.prefix,
        respondOnMention: params.respondOnMention,
        threadSupport: params.threadSupport,
        ignoreBots: params.ignoreBots,
        allowedUserIds: params.allowedUserIds,
        ackReaction: params.ackReaction,
        typingReaction: params.typingReaction,
        streamingPreview: params.streamingPreview,
        streamingMode: params.streamingMode,
        replyToMode: params.replyToMode,
        threadHistoryScope: params.threadHistoryScope,
        threadInheritParent: params.threadInheritParent,
        threadInitialHistoryLimit: params.threadInitialHistoryLimit,
        maxLinesPerMessage: params.maxLinesPerMessage,
        chunkMode: params.chunkMode,
        operation: 'updateHostedDiscordChannelSettings.update',
      },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw updateError
  }
}

// ============================================================================
// TELEGRAM CONNECT TOKENS
// ============================================================================

/**
 * Create a one-time-use Telegram connect token for hosted bot linking
 */
export async function createTelegramConnectToken(params: {
  assistantId: string
  orgId: string
  createdBy: string
  ttlMinutes: number
}) {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + params.ttlMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('assistant_telegram_link_tokens')
    .insert({
      token,
      assistant_id: params.assistantId,
      org_id: params.orgId,
      created_by: params.createdBy,
      expires_at: expiresAt,
    })
    .select(TELEGRAM_CONNECT_TOKEN_SELECT)
    .single()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        assistantId: params.assistantId,
        orgId: params.orgId,
        operation: 'createTelegramConnectToken',
      },
      tags: { layer: 'database', table: 'assistant_telegram_link_tokens' },
    })
    throw error
  }

  return data
}

export async function createWhatsAppConnectToken(params: {
  assistantId: string
  orgId: string
  createdBy: string
  ttlMinutes: number
}) {
  const token = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + params.ttlMinutes * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('assistant_whatsapp_link_tokens')
    .insert({
      token,
      assistant_id: params.assistantId,
      org_id: params.orgId,
      created_by: params.createdBy,
      expires_at: expiresAt,
    })
    .select('token')
    .single()

  if (error || !data) {
    ErrorService.captureException(error ?? new Error('Failed to create WhatsApp connect token'), {
      severity: 'error',
      context: {
        assistantId: params.assistantId,
        orgId: params.orgId,
        operation: 'createWhatsAppConnectToken',
      },
      tags: { layer: 'database', table: 'assistant_whatsapp_link_tokens' },
    })
    throw error ?? new Error('Failed to create WhatsApp connect token')
  }

  return data.token as string
}

export async function consumeWhatsAppConnectToken(token: string): Promise<{
  assistantId: string
  orgId: string
} | null> {
  const { data: row, error } = await supabase
    .from('assistant_whatsapp_link_tokens')
    .select('id, assistant_id, org_id, expires_at, used_at')
    .eq('token', token)
    .maybeSingle()

  if (error) {
    ErrorService.captureException(error, {
      severity: 'warning',
      context: { token, operation: 'consumeWhatsAppConnectToken.lookup' },
      tags: { layer: 'database', table: 'assistant_whatsapp_link_tokens' },
    })
    return null
  }

  if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
    return null
  }

  const { error: consumeError } = await supabase
    .from('assistant_whatsapp_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id)
    .is('used_at', null)

  if (consumeError) {
    ErrorService.captureException(consumeError, {
      severity: 'warning',
      context: { token, operation: 'consumeWhatsAppConnectToken.consume' },
      tags: { layer: 'database', table: 'assistant_whatsapp_link_tokens' },
    })
    return null
  }

  return {
    assistantId: row.assistant_id as string,
    orgId: row.org_id as string,
  }
}

/**
 * Consume a one-time-use Telegram connect token.
 * Validates the token is not expired and not already used, then marks it consumed.
 * Returns { assistantId, orgId } on success, null otherwise.
 */
export async function consumeTelegramConnectToken(params: {
  token: string
  telegramUserId: string
  telegramChatId: string
}): Promise<{ assistantId: string; orgId: string } | null> {
  const { data: tokenRow, error: fetchError } = await supabase
    .from('assistant_telegram_link_tokens')
    .select('id, assistant_id, org_id, expires_at, used_at')
    .eq('token', params.token)
    .single()

  if (fetchError || !tokenRow) {
    return null
  }

  if (tokenRow.used_at) {
    return null
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return null
  }

  const { error: updateError } = await supabase
    .from('assistant_telegram_link_tokens')
    .update({
      used_at: new Date().toISOString(),
      telegram_user_id: params.telegramUserId,
      telegram_chat_id: params.telegramChatId,
    })
    .eq('id', tokenRow.id)

  if (updateError) {
    ErrorService.captureException(updateError, {
      severity: 'error',
      context: { tokenId: tokenRow.id, operation: 'consumeTelegramConnectToken' },
      tags: { layer: 'database', table: 'assistant_telegram_link_tokens' },
    })
    return null
  }

  return { assistantId: tokenRow.assistant_id, orgId: tokenRow.org_id }
}

/**
 * Peek a one-time-use Telegram connect token without consuming it.
 * Returns null if the token is invalid, expired, or already used.
 */
export async function peekTelegramConnectToken(params: {
  token: string
}): Promise<{ assistantId: string; orgId: string } | null> {
  const { data: tokenRow, error } = await supabase
    .from('assistant_telegram_link_tokens')
    .select('assistant_id, org_id, expires_at, used_at')
    .eq('token', params.token)
    .single()

  if (error || !tokenRow) {
    return null
  }

  if (tokenRow.used_at) {
    return null
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return null
  }

  return { assistantId: tokenRow.assistant_id, orgId: tokenRow.org_id }
}

/**
 * Upsert a hosted Telegram channel for an assistant.
 * Creates a new assistant_channels row or updates the existing one with the
 * Telegram chat ID. Always makes this row the primary speaker for the chat
 * (demotes any existing primary for the same chat in a single RPC).
 */
export async function upsertHostedTelegramChannel(params: {
  assistantId: string
  telegramChatId: string
  webhookSecret: string
  botToken: string
  /**
   * When true, the RPC additionally verifies
   * `ai_assistants.telegram_share_enabled = true` before mutating anything.
   * Used by the public deep-link bind path so a concurrent flip of the
   * share flag cannot leave a disabled agent as primary — or, worse,
   * move the hosted row across chats while the guarded swap rejects.
   */
  requireShareEnabled?: boolean
}) {
  // Everything (existing-row scan, row update/insert, share-flag check,
  // primary demote/promote) happens in one SECURITY DEFINER RPC that holds
  // an advisory lock on the chat + a FOR UPDATE lock on the assistant.
  // See supabase/migrations/20260407140000_telegram_multi_agent_atomic_bind.sql.
  const { data, error } = await supabase.rpc('bind_hosted_telegram_channel', {
    p_assistant_id: params.assistantId,
    p_chat_id: params.telegramChatId,
    p_secret_token: crypto.randomUUID(),
    p_require_share_enabled: params.requireShareEnabled === true,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        assistantId: params.assistantId,
        chatId: params.telegramChatId,
        operation: 'upsertHostedTelegramChannel',
      },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || !row.channel_id) {
    const err = new Error(
      `Failed to bind hosted telegram channel for assistant ${params.assistantId} / chat ${params.telegramChatId}`,
    )
    ErrorService.captureException(err, {
      severity: 'error',
      context: {
        assistantId: params.assistantId,
        chatId: params.telegramChatId,
        requireShareEnabled: params.requireShareEnabled === true,
        operation: 'upsertHostedTelegramChannel.emptyResult',
      },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw err
  }

  return { channelId: row.channel_id as string }
}

/**
 * Get the primary hosted Telegram channel for a given chat ID.
 * Returns the active channel that is currently marked is_primary=true.
 * Returns null if no row is primary (e.g. owner ran /leave) — caller should
 * surface "no active agent" instead of silently picking one.
 */
export async function getPrimaryTelegramChannelForChat(
  chatId: string,
): Promise<{ id: string; assistant_id: string } | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id')
    .eq('channel_type', 'telegram')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .eq('is_primary', true)
    .limit(1)

  if (error || !data || data.length === 0) {
    return null
  }

  return data[0]
}

export async function getTelegramVoiceSettingsForChat(
  chatId: string,
): Promise<{
  channelId: string
  assistantId: string
  assistantName: string
  mode: 'off' | 'auto' | 'always'
  voiceId: string | null
  instructions: string | null
} | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select(
      'id, assistant_id, channel_config, ai_assistants!inner(name, telegram_display_name, telegram_voice_mode, telegram_voice_id, telegram_voice_instructions)',
    )
    .eq('channel_type', 'telegram')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId, operation: 'getTelegramVoiceSettingsForChat' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return null
  }

  const ai = Array.isArray(data.ai_assistants) ? data.ai_assistants[0] : data.ai_assistants
  const channelConfig = data.channel_config && typeof data.channel_config === 'object'
    ? data.channel_config as Record<string, unknown>
    : {}
  const mode = channelConfig.telegram_voice_mode === 'auto' || channelConfig.telegram_voice_mode === 'always'
    ? channelConfig.telegram_voice_mode
    : channelConfig.telegram_voice_mode === 'off'
      ? 'off'
      : ai?.telegram_voice_mode === 'auto' || ai?.telegram_voice_mode === 'always'
        ? ai.telegram_voice_mode
        : 'auto'
  const voiceId = typeof channelConfig.telegram_voice_id === 'string' && channelConfig.telegram_voice_id.trim().length > 0
    ? channelConfig.telegram_voice_id.trim()
    : typeof ai?.telegram_voice_id === 'string' && ai.telegram_voice_id.trim().length > 0
      ? ai.telegram_voice_id.trim()
      : null
  const instructions = typeof channelConfig.telegram_voice_instructions === 'string' && channelConfig.telegram_voice_instructions.trim().length > 0
    ? channelConfig.telegram_voice_instructions.trim()
    : typeof ai?.telegram_voice_instructions === 'string' && ai.telegram_voice_instructions.trim().length > 0
      ? ai.telegram_voice_instructions.trim()
      : null

  return {
    channelId: data.id as string,
    assistantId: data.assistant_id as string,
    assistantName: (ai?.telegram_display_name || ai?.name || 'This agent') as string,
    mode,
    voiceId,
    instructions,
  }
}

export async function updateTelegramVoiceSettingsForChat(params: {
  chatId: string
  mode?: 'off' | 'auto' | 'always'
  voiceId?: string | null
  instructions?: string | null
}) {
  const primary = await getTelegramVoiceSettingsForChat(params.chatId)
  if (!primary) {
    return null
  }

  const { data: current, error: fetchError } = await supabase
    .from('assistant_channels')
    .select('channel_config')
    .eq('id', primary.channelId)
    .single()

  if (fetchError) {
    ErrorService.captureException(fetchError, {
      severity: 'error',
      context: { chatId: params.chatId, channelId: primary.channelId, operation: 'updateTelegramVoiceSettingsForChat.fetch' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw fetchError
  }

  const channelConfig = current?.channel_config && typeof current.channel_config === 'object'
    ? current.channel_config as Record<string, unknown>
    : {}
  const nextConfig: Record<string, unknown> = {
    ...channelConfig,
  }

  if (params.mode) {
    nextConfig.telegram_voice_mode = params.mode
  }
  if (params.voiceId !== undefined) {
    nextConfig.telegram_voice_id = params.voiceId
  }
  if (params.instructions !== undefined) {
    nextConfig.telegram_voice_instructions = params.instructions
  }

  const { error: updateError } = await supabase
    .from('assistant_channels')
    .update({ channel_config: nextConfig })
    .eq('id', primary.channelId)

  if (updateError) {
    ErrorService.captureException(updateError, {
      severity: 'error',
      context: { chatId: params.chatId, channelId: primary.channelId, operation: 'updateTelegramVoiceSettingsForChat.update' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw updateError
  }

  return getTelegramVoiceSettingsForChat(params.chatId)
}

/**
 * Resolve the active workspace/org scope for a Telegram chat.
 * The current primary binding owns the room. If no primary exists, fall back
 * to the most recently updated active binding so /agents and /switch remain
 * stable after /leave.
 */
export async function getTelegramChatScope(
  chatId: string,
): Promise<{ orgId: string; assistantId: string } | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('assistant_id, is_primary, updated_at, channel_config, ai_assistants!inner(org_id)')
    .eq('channel_type', 'telegram')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) {
    return null
  }

  const row = data[0] as {
    assistant_id: string
    channel_config?: { active_workspace_org_id?: string } | null
    ai_assistants: { org_id: string } | Array<{ org_id: string }>
  }
  const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
  const explicitOrgId = row.channel_config?.active_workspace_org_id
  const orgId = explicitOrgId || ai?.org_id
  if (!orgId) {
    return null
  }

  return { orgId, assistantId: row.assistant_id }
}

/**
 * List every active Telegram binding for a chat, joined with the assistant
 * display name + description. Used by /agents to render the inline keyboard
 * and by /whoami to describe the active agent.
 */
export async function listTelegramChannelsForChat(
  chatId: string,
): Promise<Array<{
  id: string
  assistant_id: string
  org_id?: string
  assistant_name: string
  assistant_description: string | null
  assistant_starter_prompts: string[]
  assistant_role_title: string
  assistant_essence: string
  is_primary: boolean
  aliases?: string[]
}>> {
  const scope = await getTelegramChatScope(chatId)
  if (!scope) {
    return []
  }

  const { data, error } = await supabase
    .from('assistant_channels')
    .select(
      'id, assistant_id, is_primary, ai_assistants!inner(org_id, name, description, telegram_display_name, telegram_role_title, telegram_essence, telegram_starter_prompts)',
    )
    .eq('channel_type', 'telegram')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .eq('ai_assistants.org_id', scope.orgId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true, referencedTable: 'ai_assistants' })
    // Hard cap — the inline keyboard is clipped to MAX_KEYBOARD_ROWS (10) and
    // /whoami only needs a name lookup. Unbounded was a footgun for pathological
    // chats with dozens of bindings.
    .limit(25)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId, operation: 'listTelegramChannelsForChat' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const aliasesByAssistantId = await listAssistantChannelAliasesByAssistantId({
    channelType: 'telegram',
    surfaceOwnerKind: 'org',
    surfaceOwnerId: scope.orgId,
    assistantIds: data.map((row: { assistant_id: string }) => row.assistant_id),
  })

  return data.map((row: {
    id: string
    assistant_id: string
    is_primary: boolean
    ai_assistants:
      | {
          name: string
          description: string | null
          telegram_display_name?: string | null
          telegram_role_title?: string | null
          telegram_essence?: string | null
          telegram_starter_prompts?: unknown
          org_id?: string | null
        }
      | {
          name: string
          description: string | null
          telegram_display_name?: string | null
          telegram_role_title?: string | null
          telegram_essence?: string | null
          telegram_starter_prompts?: unknown
          org_id?: string | null
        }[]
  }) => {
    const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
    const persona = buildTelegramPersona({
      name: ai?.name ?? 'Untitled agent',
      description: ai?.description ?? null,
      overrides: {
        displayName: ai?.telegram_display_name ?? null,
        roleTitle: ai?.telegram_role_title ?? null,
        essence: ai?.telegram_essence ?? null,
        starterPrompts: Array.isArray(ai?.telegram_starter_prompts)
          ? ai.telegram_starter_prompts.filter((value): value is string => typeof value === 'string')
          : null,
      },
    })
    return {
      id: row.id,
      assistant_id: row.assistant_id,
      org_id: ai?.org_id ?? undefined,
      assistant_name: persona.displayName,
      assistant_description: ai?.description ?? null,
      assistant_starter_prompts: persona.starterPrompts,
      assistant_role_title: persona.roleTitle,
      assistant_essence: persona.essence,
      is_primary: row.is_primary === true,
      aliases: aliasesByAssistantId[row.assistant_id] ?? [],
    }
  })
}

export async function persistTelegramChatScope(chatId: string, orgId: string): Promise<void> {
  const { data: rows, error: fetchError } = await supabase
    .from('assistant_channels')
    .select('id, channel_config')
    .eq('channel_type', 'telegram')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)

  if (fetchError) {
    ErrorService.captureException(fetchError, {
      severity: 'error',
      context: { chatId, orgId, operation: 'persistTelegramChatScope.fetch' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw fetchError
  }

  if (!rows || rows.length === 0) return

  for (const row of rows as Array<{ id: string; channel_config?: Record<string, unknown> | null }>) {
    const { error } = await supabase
      .from('assistant_channels')
      .update({
        channel_config: {
          ...(row.channel_config && typeof row.channel_config === 'object' ? row.channel_config : {}),
          active_workspace_org_id: orgId,
        },
      })
      .eq('id', row.id)

    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { chatId, orgId, channelId: row.id, operation: 'persistTelegramChatScope.update' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
      throw error
    }
  }
}

export async function listIMessageChannelsForChat(chatId: string): Promise<Array<{
  id: string
  assistant_id: string
  org_id?: string
  assistant_name: string
  assistant_description: string | null
  is_primary: boolean
  aliases?: string[]
}>> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, is_primary, ai_assistants!inner(org_id, name, description)')
    .eq('channel_type', 'imessage')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true, referencedTable: 'ai_assistants' })
    .limit(25)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId, operation: 'listIMessageChannelsForChat' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const aliasesByAssistantId = await listAssistantChannelAliasesByAssistantId({
    channelType: 'imessage',
    surfaceOwnerKind: 'chat',
    surfaceOwnerId: chatId,
    assistantIds: data.map((row: { assistant_id: string }) => row.assistant_id),
  })

  return data.map((row: {
    id: string
    assistant_id: string
    is_primary: boolean
    ai_assistants:
      | { org_id?: string | null; name: string; description: string | null }
      | Array<{ org_id?: string | null; name: string; description: string | null }>
  }) => {
    const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
    return {
      id: row.id,
      assistant_id: row.assistant_id,
      org_id: ai?.org_id ?? undefined,
      assistant_name: ai?.name ?? 'Untitled agent',
      assistant_description: ai?.description ?? null,
      is_primary: row.is_primary === true,
      aliases: aliasesByAssistantId[row.assistant_id] ?? [],
    }
  })
}

export async function setPrimaryIMessageChannel(params: {
  imessageChatId: string
  channelId: string
}): Promise<boolean> {
  const { error: demoteError } = await supabase
    .from('assistant_channels')
    .update({ is_primary: false })
    .eq('channel_type', 'imessage')
    .eq('is_active', true)
    .eq('external_channel_id', params.imessageChatId)

  if (demoteError) {
    ErrorService.captureException(demoteError, {
      severity: 'warning',
      context: { chatId: params.imessageChatId, channelId: params.channelId, operation: 'setPrimaryIMessageChannel.demote' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    return false
  }

  const { data, error } = await supabase
    .from('assistant_channels')
    .update({ is_primary: true })
    .eq('id', params.channelId)
    .eq('channel_type', 'imessage')
    .eq('is_active', true)
    .eq('external_channel_id', params.imessageChatId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId: params.imessageChatId, channelId: params.channelId, operation: 'setPrimaryIMessageChannel.promote' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return false
  }

  return true
}

export async function ensureHostedIMessageSurfaceChannel(params: {
  assistantId: string
  hostedSurfaceId: string
}) {
  const { data: existing, error: existingError } = await supabase
    .from('assistant_channels')
    .select('id, channel_config')
    .eq('assistant_id', params.assistantId)
    .eq('channel_type', 'imessage')
    .eq('connection_mode', 'hosted')
    .is('external_channel_id', null)
    .limit(1)
    .maybeSingle()

  if (existingError) {
    ErrorService.captureException(existingError, {
      severity: 'error',
      context: { assistantId: params.assistantId, operation: 'ensureHostedIMessageSurfaceChannel.lookup' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw existingError
  }

  const channelConfig = {
    ...(existing?.channel_config && typeof existing.channel_config === 'object' ? existing.channel_config : {}),
    hosted: true,
    hosted_surface_id: params.hostedSurfaceId,
  }

  if (existing?.id) {
    const { data: updated, error: updateError } = await supabase
      .from('assistant_channels')
      .update({
        is_active: true,
        channel_config: channelConfig,
      })
      .eq('id', existing.id)
      .select('id')
      .single()

    if (updateError || !updated) {
      ErrorService.captureException(updateError ?? new Error('Failed to update hosted iMessage surface channel'), {
        severity: 'error',
        context: { assistantId: params.assistantId, channelId: existing.id, operation: 'ensureHostedIMessageSurfaceChannel.update' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
      throw updateError ?? new Error('Failed to update hosted iMessage surface channel')
    }

    return { channelId: updated.id as string }
  }

  const secretToken = crypto.randomUUID()
  const { data: inserted, error: insertError } = await supabase
    .from('assistant_channels')
    .insert({
      assistant_id: params.assistantId,
      channel_type: 'imessage',
      secret_token_hash: hashChannelSecret(secretToken),
      external_channel_id: null,
      is_active: true,
      is_primary: false,
      channel_config: channelConfig,
      connection_mode: 'hosted',
      inbound_routing_config: {},
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    ErrorService.captureException(insertError ?? new Error('Failed to insert hosted iMessage surface channel'), {
      severity: 'error',
      context: { assistantId: params.assistantId, operation: 'ensureHostedIMessageSurfaceChannel.insert' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw insertError ?? new Error('Failed to insert hosted iMessage surface channel')
  }

  return { channelId: inserted.id as string }
}

export async function upsertHostedIMessageChannel(params: {
  assistantId: string
  imessageChatId: string
  hostedSurfaceId: string
  setPrimary?: boolean
}) {
  const shouldSetPrimary = params.setPrimary !== false
  const { data: existing, error: existingError } = await supabase
    .from('assistant_channels')
    .select('id, channel_config')
    .eq('assistant_id', params.assistantId)
    .eq('channel_type', 'imessage')
    .eq('connection_mode', 'hosted')
    .eq('external_channel_id', params.imessageChatId)
    .limit(1)
    .maybeSingle()

  if (existingError) {
    ErrorService.captureException(existingError, {
      severity: 'error',
      context: { assistantId: params.assistantId, chatId: params.imessageChatId, operation: 'upsertHostedIMessageChannel.lookup' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw existingError
  }

  const channelConfig = {
    ...(existing?.channel_config && typeof existing.channel_config === 'object' ? existing.channel_config : {}),
    hosted: true,
    hosted_surface_id: params.hostedSurfaceId,
  }

  let channelId: string
  if (existing?.id) {
    const { data: updated, error: updateError } = await supabase
      .from('assistant_channels')
      .update({
        is_active: true,
        is_primary: shouldSetPrimary,
        channel_config: channelConfig,
      })
      .eq('id', existing.id)
      .select('id')
      .single()

    if (updateError || !updated) {
      ErrorService.captureException(updateError ?? new Error('Failed to update hosted iMessage chat binding'), {
        severity: 'error',
        context: { assistantId: params.assistantId, channelId: existing.id, operation: 'upsertHostedIMessageChannel.update' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
      throw updateError ?? new Error('Failed to update hosted iMessage chat binding')
    }

    channelId = updated.id as string
  } else {
    const secretToken = crypto.randomUUID()
    const { data: inserted, error: insertError } = await supabase
      .from('assistant_channels')
      .insert({
        assistant_id: params.assistantId,
        channel_type: 'imessage',
        secret_token_hash: hashChannelSecret(secretToken),
        external_channel_id: params.imessageChatId,
        is_active: true,
        is_primary: shouldSetPrimary,
        channel_config: channelConfig,
        connection_mode: 'hosted',
        inbound_routing_config: {},
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      ErrorService.captureException(insertError ?? new Error('Failed to insert hosted iMessage chat binding'), {
        severity: 'error',
        context: { assistantId: params.assistantId, operation: 'upsertHostedIMessageChannel.insert' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
      throw insertError ?? new Error('Failed to insert hosted iMessage chat binding')
    }

    channelId = inserted.id as string
  }

  if (shouldSetPrimary) {
    await supabase
      .from('assistant_channels')
      .update({ is_primary: false })
      .eq('channel_type', 'imessage')
      .eq('connection_mode', 'hosted')
      .eq('external_channel_id', params.imessageChatId)
      .neq('id', channelId)

    await supabase
      .from('assistant_channels')
      .update({ is_primary: true })
      .eq('id', channelId)
  }

  return { channelId }
}

export async function getPrimaryHostedIMessageChannelForChat(
  chatId: string,
): Promise<{ id: string; assistant_id: string } | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id')
    .eq('channel_type', 'imessage')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data as { id: string; assistant_id: string }
}

export async function listHostedIMessageChannelsForChat(chatId: string): Promise<Array<{
  id: string
  assistant_id: string
  org_id?: string
  assistant_name: string
  assistant_description: string | null
  is_primary: boolean
  aliases?: string[]
}>> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, is_primary, ai_assistants!inner(org_id, name, description)')
    .eq('channel_type', 'imessage')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true, referencedTable: 'ai_assistants' })
    .limit(25)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId, operation: 'listHostedIMessageChannelsForChat' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const aliasesByAssistantId = await listAssistantChannelAliasesByAssistantId({
    channelType: 'imessage',
    surfaceOwnerKind: 'chat',
    surfaceOwnerId: chatId,
    assistantIds: data.map((row: { assistant_id: string }) => row.assistant_id),
  })

  return data.map((row: {
    id: string
    assistant_id: string
    is_primary: boolean
    ai_assistants:
      | { org_id?: string | null; name: string; description: string | null }
      | Array<{ org_id?: string | null; name: string; description: string | null }>
  }) => {
    const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
    return {
      id: row.id,
      assistant_id: row.assistant_id,
      org_id: ai?.org_id ?? undefined,
      assistant_name: ai?.name ?? 'Untitled agent',
      assistant_description: ai?.description ?? null,
      is_primary: row.is_primary === true,
      aliases: aliasesByAssistantId[row.assistant_id] ?? [],
    }
  })
}

export async function listHostedIMessageSurfaceChannels(surfaceId: string): Promise<Array<{
  id: string
  assistant_id: string
  org_id?: string
  assistant_name: string
  assistant_description: string | null
  aliases?: string[]
}>> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, channel_config, ai_assistants!inner(org_id, name, description)')
    .eq('channel_type', 'imessage')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .is('external_channel_id', null)
    .order('name', { ascending: true, referencedTable: 'ai_assistants' })
    .limit(50)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { surfaceId, operation: 'listHostedIMessageSurfaceChannels' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const scopedRows = (data as Array<{
    id: string
    assistant_id: string
    channel_config?: Record<string, unknown> | null
    ai_assistants:
      | { org_id?: string | null; name: string; description: string | null }
      | Array<{ org_id?: string | null; name: string; description: string | null }>
  }>).filter((row) => row.channel_config?.hosted_surface_id === surfaceId)

  const aliasesByAssistantId = await listAssistantChannelAliasesByAssistantId({
    channelType: 'imessage',
    surfaceOwnerKind: 'imessage_surface',
    surfaceOwnerId: surfaceId,
    assistantIds: scopedRows.map((row) => row.assistant_id),
  })

  return scopedRows.map((row) => {
    const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
    return {
      id: row.id,
      assistant_id: row.assistant_id,
      org_id: ai?.org_id ?? undefined,
      assistant_name: ai?.name ?? 'Untitled agent',
      assistant_description: ai?.description ?? null,
      aliases: aliasesByAssistantId[row.assistant_id] ?? [],
    }
  })
}

export async function setPrimaryHostedIMessageChannel(params: {
  imessageChatId: string
  channelId: string
}): Promise<boolean> {
  const { error: demoteError } = await supabase
    .from('assistant_channels')
    .update({ is_primary: false })
    .eq('channel_type', 'imessage')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', params.imessageChatId)

  if (demoteError) {
    ErrorService.captureException(demoteError, {
      severity: 'warning',
      context: { chatId: params.imessageChatId, channelId: params.channelId, operation: 'setPrimaryHostedIMessageChannel.demote' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    return false
  }

  const { data, error } = await supabase
    .from('assistant_channels')
    .update({ is_primary: true })
    .eq('id', params.channelId)
    .eq('channel_type', 'imessage')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', params.imessageChatId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId: params.imessageChatId, channelId: params.channelId, operation: 'setPrimaryHostedIMessageChannel.promote' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return false
  }

  return true
}

export async function upsertHostedWhatsAppChannel(params: {
  assistantId: string
  whatsappChatId: string
  hostedSurfaceId: string
  setPrimary?: boolean
}) {
  const shouldSetPrimary = params.setPrimary !== false
  const { data: existing, error: existingError } = await supabase
    .from('assistant_channels')
    .select('id, channel_config')
    .eq('assistant_id', params.assistantId)
    .eq('channel_type', 'whatsapp')
    .eq('connection_mode', 'hosted')
    .limit(1)
    .maybeSingle()

  if (existingError) {
    ErrorService.captureException(existingError, {
      severity: 'error',
      context: { assistantId: params.assistantId, operation: 'upsertHostedWhatsAppChannel.lookup' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw existingError
  }

  const channelConfig = {
    ...(existing?.channel_config && typeof existing.channel_config === 'object' ? existing.channel_config : {}),
    hosted: true,
    hosted_surface_id: params.hostedSurfaceId,
  }

  let channelId: string

  if (existing?.id) {
    const { data: updated, error: updateError } = await supabase
      .from('assistant_channels')
      .update({
        external_channel_id: params.whatsappChatId,
        is_active: true,
        is_primary: shouldSetPrimary,
        channel_config: channelConfig,
      })
      .eq('id', existing.id)
      .select('id')
      .single()

    if (updateError || !updated) {
      ErrorService.captureException(updateError ?? new Error('Failed to update hosted WhatsApp channel'), {
        severity: 'error',
        context: { assistantId: params.assistantId, channelId: existing.id, operation: 'upsertHostedWhatsAppChannel.update' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
      throw updateError ?? new Error('Failed to update hosted WhatsApp channel')
    }

    channelId = updated.id as string
  } else {
    const secretToken = crypto.randomUUID()
    const { data: inserted, error: insertError } = await supabase
      .from('assistant_channels')
      .insert({
        assistant_id: params.assistantId,
        channel_type: 'whatsapp',
        secret_token_hash: hashChannelSecret(secretToken),
        external_channel_id: params.whatsappChatId,
        is_active: true,
        is_primary: shouldSetPrimary,
        channel_config: channelConfig,
        connection_mode: 'hosted',
        inbound_routing_config: {},
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      ErrorService.captureException(insertError ?? new Error('Failed to insert hosted WhatsApp channel'), {
        severity: 'error',
        context: { assistantId: params.assistantId, operation: 'upsertHostedWhatsAppChannel.insert' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
      throw insertError ?? new Error('Failed to insert hosted WhatsApp channel')
    }

    channelId = inserted.id as string
  }

  if (shouldSetPrimary) {
    await supabase
      .from('assistant_channels')
      .update({ is_primary: false })
      .eq('channel_type', 'whatsapp')
      .eq('connection_mode', 'hosted')
      .eq('external_channel_id', params.whatsappChatId)
      .neq('id', channelId)

    await supabase
      .from('assistant_channels')
      .update({ is_primary: true })
      .eq('id', channelId)
  }

  return { channelId }
}

export async function getPrimaryWhatsAppChannelForChat(
  chatId: string,
): Promise<{ id: string; assistant_id: string } | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id')
    .eq('channel_type', 'whatsapp')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data as { id: string; assistant_id: string }
}

export async function listWhatsAppChannelsForChat(chatId: string): Promise<Array<{
  id: string
  assistant_id: string
  org_id?: string
  assistant_name: string
  assistant_description: string | null
  is_primary: boolean
  aliases?: string[]
}>> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, is_primary, ai_assistants!inner(org_id, name, description)')
    .eq('channel_type', 'whatsapp')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true, referencedTable: 'ai_assistants' })
    .limit(25)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId, operation: 'listWhatsAppChannelsForChat' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const aliasesByAssistantId = await listAssistantChannelAliasesByAssistantId({
    channelType: 'whatsapp',
    surfaceOwnerKind: 'chat',
    surfaceOwnerId: chatId,
    assistantIds: data.map((row: { assistant_id: string }) => row.assistant_id),
  })

  return data.map((row: {
    id: string
    assistant_id: string
    is_primary: boolean
    ai_assistants:
      | { org_id?: string | null; name: string; description: string | null }
      | Array<{ org_id?: string | null; name: string; description: string | null }>
  }) => {
    const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
    return {
      id: row.id,
      assistant_id: row.assistant_id,
      org_id: ai?.org_id ?? undefined,
      assistant_name: ai?.name ?? 'Untitled agent',
      assistant_description: ai?.description ?? null,
      is_primary: row.is_primary === true,
      aliases: aliasesByAssistantId[row.assistant_id] ?? [],
    }
  })
}

export async function setPrimaryWhatsAppChannel(params: {
  whatsappChatId: string
  channelId: string
}): Promise<boolean> {
  const { error: demoteError } = await supabase
    .from('assistant_channels')
    .update({ is_primary: false })
    .eq('channel_type', 'whatsapp')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', params.whatsappChatId)

  if (demoteError) {
    ErrorService.captureException(demoteError, {
      severity: 'warning',
      context: { chatId: params.whatsappChatId, channelId: params.channelId, operation: 'setPrimaryWhatsAppChannel.demote' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    return false
  }

  const { data, error } = await supabase
    .from('assistant_channels')
    .update({ is_primary: true })
    .eq('id', params.channelId)
    .eq('channel_type', 'whatsapp')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', params.whatsappChatId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId: params.whatsappChatId, channelId: params.channelId, operation: 'setPrimaryWhatsAppChannel.promote' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return false
  }

  return true
}

/**
 * Unbind an assistant from a hosted WhatsApp chat. Sets is_active=false and
 * is_primary=false on the matching row. Does not promote a sibling.
 */
export async function unbindWhatsAppChannel(
  chatId: string,
  assistantId: string,
): Promise<void> {
  const { error } = await supabase
    .from('assistant_channels')
    .update({ is_active: false, is_primary: false })
    .eq('channel_type', 'whatsapp')
    .eq('connection_mode', 'hosted')
    .eq('external_channel_id', chatId)
    .eq('assistant_id', assistantId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { chatId, assistantId, operation: 'unbindWhatsAppChannel' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }
}

export async function getWhatsAppVoiceSettingsForChat(
  chatId: string,
): Promise<{
  channelId: string
  assistantId: string
  assistantName: string
  mode: 'off' | 'auto' | 'always'
  voiceId: string | null
  instructions: string | null
} | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, channel_config, ai_assistants!inner(name)')
    .eq('channel_type', 'whatsapp')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId, operation: 'getWhatsAppVoiceSettingsForChat' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return null
  }

  const ai = Array.isArray(data.ai_assistants) ? data.ai_assistants[0] : data.ai_assistants
  const channelConfig = data.channel_config && typeof data.channel_config === 'object'
    ? data.channel_config as Record<string, unknown>
    : {}
  const mode =
    channelConfig.whatsapp_voice_mode === 'auto' || channelConfig.whatsapp_voice_mode === 'always'
      ? channelConfig.whatsapp_voice_mode
      : channelConfig.whatsapp_voice_mode === 'off'
        ? 'off'
        : 'auto'
  const voiceId =
    typeof channelConfig.whatsapp_voice_id === 'string' && channelConfig.whatsapp_voice_id.trim().length > 0
      ? channelConfig.whatsapp_voice_id.trim()
      : null
  const instructions =
    typeof channelConfig.whatsapp_voice_instructions === 'string' && channelConfig.whatsapp_voice_instructions.trim().length > 0
      ? channelConfig.whatsapp_voice_instructions.trim()
      : null

  return {
    channelId: data.id as string,
    assistantId: data.assistant_id as string,
    assistantName: (ai?.name || 'This agent') as string,
    mode,
    voiceId,
    instructions,
  }
}

export async function updateWhatsAppVoiceSettingsForChat(params: {
  chatId: string
  mode?: 'off' | 'auto' | 'always'
  voiceId?: string | null
  instructions?: string | null
}) {
  const primary = await getWhatsAppVoiceSettingsForChat(params.chatId)
  if (!primary) {
    return null
  }

  const { data: current, error: fetchError } = await supabase
    .from('assistant_channels')
    .select('channel_config')
    .eq('id', primary.channelId)
    .single()

  if (fetchError) {
    ErrorService.captureException(fetchError, {
      severity: 'error',
      context: { chatId: params.chatId, channelId: primary.channelId, operation: 'updateWhatsAppVoiceSettingsForChat.fetch' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw fetchError
  }

  const channelConfig = current?.channel_config && typeof current.channel_config === 'object'
    ? current.channel_config as Record<string, unknown>
    : {}
  const nextConfig: Record<string, unknown> = { ...channelConfig }

  if (params.mode) {
    nextConfig.whatsapp_voice_mode = params.mode
  }
  if (params.voiceId !== undefined) {
    nextConfig.whatsapp_voice_id = params.voiceId
  }
  if (params.instructions !== undefined) {
    nextConfig.whatsapp_voice_instructions = params.instructions
  }

  const { error: updateError } = await supabase
    .from('assistant_channels')
    .update({ channel_config: nextConfig })
    .eq('id', primary.channelId)

  if (updateError) {
    ErrorService.captureException(updateError, {
      severity: 'error',
      context: { chatId: params.chatId, channelId: primary.channelId, operation: 'updateWhatsAppVoiceSettingsForChat.update' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw updateError
  }

  return getWhatsAppVoiceSettingsForChat(params.chatId)
}

export async function getPrimaryTeamsChannelForConversation(
  conversationId: string,
): Promise<{ id: string; assistant_id: string } | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id')
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', conversationId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data as { id: string; assistant_id: string }
}

export async function listTeamsChannelsForConversation(conversationId: string): Promise<Array<{
  id: string
  assistant_id: string
  assistant_name: string
  assistant_description: string | null
  org_id: string | null
  is_primary: boolean
  aliases?: string[]
}>> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, is_primary, channel_config, ai_assistants!inner(name, description, org_id)')
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', conversationId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true, referencedTable: 'ai_assistants' })
    .limit(25)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { conversationId, operation: 'listTeamsChannelsForConversation' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const tenantId = data
    .map((row: { channel_config?: unknown }) =>
      row.channel_config && typeof row.channel_config === 'object'
        ? (row.channel_config as Record<string, unknown>).msteams_tenant_id
        : null,
    )
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)

  const aliasesByAssistantId = await listAssistantChannelAliasesByAssistantId(
    tenantId
      ? {
          channelType: 'msteams',
          surfaceOwnerKind: 'tenant',
          surfaceOwnerId: tenantId,
          assistantIds: data.map((row: { assistant_id: string }) => row.assistant_id),
        }
      : {
          channelType: 'msteams',
          surfaceOwnerKind: 'conversation',
          surfaceOwnerId: conversationId,
          assistantIds: data.map((row: { assistant_id: string }) => row.assistant_id),
        },
  )

  return data.map((row: {
    id: string
    assistant_id: string
    is_primary: boolean
    ai_assistants:
      | { name: string; description: string | null; org_id: string | null }
      | Array<{ name: string; description: string | null; org_id: string | null }>
  }) => {
    const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
    return {
      id: row.id,
      assistant_id: row.assistant_id,
      assistant_name: ai?.name ?? 'Untitled agent',
      assistant_description: ai?.description ?? null,
      org_id: ai?.org_id ?? null,
      is_primary: row.is_primary === true,
      aliases: aliasesByAssistantId[row.assistant_id] ?? [],
    }
  })
}

export async function listPendingTeamsChannelsForTenant(tenantId: string): Promise<Array<{
  id: string
  assistant_id: string
  assistant_name: string
  assistant_description: string | null
  org_id: string | null
  aliases?: string[]
}>> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, ai_assistants!inner(name, description, org_id)')
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('is_active', false)
    .is('external_channel_id', null)
    .contains('channel_config', {
      hosted: true,
      pending_bind: true,
      msteams_tenant_id: tenantId,
    })
    .order('updated_at', { ascending: false })
    .limit(25)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { tenantId, operation: 'listPendingTeamsChannelsForTenant' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const aliasesByAssistantId = await listAssistantChannelAliasesByAssistantId({
    channelType: 'msteams',
    surfaceOwnerKind: 'tenant',
    surfaceOwnerId: tenantId,
    assistantIds: data.map((row: { assistant_id: string }) => row.assistant_id),
  })

  return data.map((row: {
    id: string
    assistant_id: string
    ai_assistants:
      | { name: string; description: string | null; org_id: string | null }
      | Array<{ name: string; description: string | null; org_id: string | null }>
  }) => {
    const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
    return {
      id: row.id,
      assistant_id: row.assistant_id,
      assistant_name: ai?.name ?? 'Untitled agent',
      assistant_description: ai?.description ?? null,
      org_id: ai?.org_id ?? null,
      aliases: aliasesByAssistantId[row.assistant_id] ?? [],
    }
  })
}

export async function listTeamsChannelsForTenant(tenantId: string): Promise<Array<{
  id: string
  assistant_id: string
  assistant_name: string
  assistant_description: string | null
  org_id: string | null
  is_active: boolean
  is_primary: boolean
  external_channel_id: string | null
  aliases?: string[]
}>> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, is_active, is_primary, external_channel_id, ai_assistants!inner(name, description, org_id)')
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .contains('channel_config', {
      hosted: true,
      msteams_tenant_id: tenantId,
    })
    .order('is_active', { ascending: false })
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true, referencedTable: 'ai_assistants' })
    .limit(50)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { tenantId, operation: 'listTeamsChannelsForTenant' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const aliasesByAssistantId = await listAssistantChannelAliasesByAssistantId({
    channelType: 'msteams',
    surfaceOwnerKind: 'tenant',
    surfaceOwnerId: tenantId,
    assistantIds: data.map((row: { assistant_id: string }) => row.assistant_id),
  })

  return data.map((row: {
    id: string
    assistant_id: string
    is_active: boolean
    is_primary: boolean
    external_channel_id: string | null
    ai_assistants:
      | { name: string; description: string | null; org_id: string | null }
      | Array<{ name: string; description: string | null; org_id: string | null }>
  }) => {
    const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
    return {
      id: row.id,
      assistant_id: row.assistant_id,
      assistant_name: ai?.name ?? 'Untitled agent',
      assistant_description: ai?.description ?? null,
      org_id: ai?.org_id ?? null,
      is_active: row.is_active === true,
      is_primary: row.is_primary === true,
      external_channel_id:
        typeof row.external_channel_id === 'string' && row.external_channel_id.trim().length > 0
          ? row.external_channel_id
          : null,
      aliases: aliasesByAssistantId[row.assistant_id] ?? [],
    }
  })
}

export async function bindHostedTeamsChannel(params: {
  conversationId: string
  channelId: string
  serviceUrl?: string
}): Promise<boolean> {
  const { data: existing, error: existingError } = await supabase
    .from('assistant_channels')
    .select('id')
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', params.conversationId)
    .limit(1)

  if (existingError) {
    ErrorService.captureException(existingError, {
      severity: 'warning',
      context: { conversationId: params.conversationId, channelId: params.channelId, operation: 'bindHostedTeamsChannel.checkExisting' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    return false
  }

  if ((existing || []).length > 0) {
    return false
  }

  const { data: targetRow, error: targetError } = await supabase
    .from('assistant_channels')
    .select('channel_config')
    .eq('id', params.channelId)
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('is_active', false)
    .is('external_channel_id', null)
    .maybeSingle()

  if (targetError || !targetRow) {
    if (targetError) {
      ErrorService.captureException(targetError, {
        severity: 'warning',
        context: { conversationId: params.conversationId, channelId: params.channelId, operation: 'bindHostedTeamsChannel.loadTarget' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return false
  }

  const nextConfig = {
    ...((targetRow.channel_config as Record<string, unknown> | null) || {}),
    pending_bind: false,
    bound_via: 'chat_bind',
    bound_at: new Date().toISOString(),
    ...(params.serviceUrl ? { teams_service_url: params.serviceUrl } : {}),
  }

  const { data, error } = await supabase
    .from('assistant_channels')
    .update({
      external_channel_id: params.conversationId,
      is_active: true,
      is_primary: true,
      channel_config: nextConfig,
    })
    .eq('id', params.channelId)
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('is_active', false)
    .is('external_channel_id', null)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { conversationId: params.conversationId, channelId: params.channelId, operation: 'bindHostedTeamsChannel.promote' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return false
  }

  return true
}

export async function setPrimaryTeamsChannel(params: {
  conversationId: string
  channelId: string
}): Promise<boolean> {
  const { error: demoteError } = await supabase
    .from('assistant_channels')
    .update({ is_primary: false })
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', params.conversationId)

  if (demoteError) {
    ErrorService.captureException(demoteError, {
      severity: 'warning',
      context: {
        conversationId: params.conversationId,
        channelId: params.channelId,
        operation: 'setPrimaryTeamsChannel.demote',
      },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    return false
  }

  const { data, error } = await supabase
    .from('assistant_channels')
    .update({ is_primary: true })
    .eq('id', params.channelId)
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('is_active', true)
    .eq('external_channel_id', params.conversationId)
    .select('id')
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: {
          conversationId: params.conversationId,
          channelId: params.channelId,
          operation: 'setPrimaryTeamsChannel.promote',
        },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return false
  }

  return true
}

export async function unbindTeamsChannel(
  conversationId: string,
  assistantId: string,
): Promise<void> {
  const { error } = await supabase
    .from('assistant_channels')
    .update({ is_active: false, is_primary: false })
    .eq('channel_type', 'msteams')
    .eq('connection_mode', 'hosted')
    .eq('external_channel_id', conversationId)
    .eq('assistant_id', assistantId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { conversationId, assistantId, operation: 'unbindTeamsChannel' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }
}

export async function listTelegramWorkspacesForChat(
  chatId: string,
): Promise<Array<{ org_id: string; org_name: string; agent_count: number; is_current: boolean }>> {
  const [scope, rowsResult] = await Promise.all([
    getTelegramChatScope(chatId),
    supabase
      .from('assistant_channels')
      .select('assistant_id, ai_assistants!inner(org_id)')
      .eq('channel_type', 'telegram')
      .eq('is_active', true)
      .eq('external_channel_id', chatId),
  ])

  const { data, error } = rowsResult
  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { chatId, operation: 'listTelegramWorkspacesForChat' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const counts = new Map<string, number>()
  for (const row of data as Array<{ ai_assistants: { org_id: string } | Array<{ org_id: string }> }>) {
    const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
    if (!ai?.org_id) continue
    counts.set(ai.org_id, (counts.get(ai.org_id) ?? 0) + 1)
  }

  const orgIds = [...counts.keys()]
  const orgs = await Promise.all(orgIds.map(async (orgId) => [orgId, await getOrganizationById(orgId)] as const))
  return orgIds
    .map((orgId) => ({
      org_id: orgId,
      org_name: orgs.find(([id]) => id === orgId)?.[1]?.name ?? 'Workspace',
      agent_count: counts.get(orgId) ?? 0,
      is_current: scope?.orgId === orgId,
    }))
    .sort((a, b) => Number(b.is_current) - Number(a.is_current) || a.org_name.localeCompare(b.org_name))
}

export async function switchTelegramChatWorkspace(
  chatId: string,
  orgId: string,
): Promise<{ ok: boolean; assistantId?: string }> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('assistant_id, is_primary, updated_at, ai_assistants!inner(org_id)')
    .eq('channel_type', 'telegram')
    .eq('is_active', true)
    .eq('external_channel_id', chatId)
    .eq('ai_assistants.org_id', orgId)
    .order('is_primary', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'error',
        context: { chatId, orgId, operation: 'switchTelegramChatWorkspace' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return { ok: false }
  }

  const assistantId = (data[0] as { assistant_id: string }).assistant_id
  const result = await setPrimaryTelegramChannel(chatId, assistantId)
  if (!result.ok) {
    return { ok: false }
  }

  await persistTelegramChatScope(chatId, orgId)
  return { ok: true, assistantId }
}

export async function deactivateTelegramChannelBinding(channelId: string): Promise<void> {
  const { error } = await supabase
    .from('assistant_channels')
    .update({ is_active: false, is_primary: false })
    .eq('id', channelId)
    .eq('channel_type', 'telegram')

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { channelId, operation: 'deactivateTelegramChannelBinding' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }
}

/**
 * Atomically make the given assistant the primary speaker for a Telegram chat.
 * Backed by the set_telegram_chat_primary RPC.
 */
export async function setPrimaryTelegramChannel(
  chatId: string,
  assistantId: string,
  requireShareEnabled = false,
): Promise<{ ok: boolean; error?: 'not_bound' }> {
  const { data, error } = await supabase.rpc('set_telegram_chat_primary', {
    p_chat_id: chatId,
    p_assistant_id: assistantId,
    p_require_share_enabled: requireShareEnabled,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { chatId, assistantId, operation: 'setPrimaryTelegramChannel' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    return { ok: false, error: 'not_bound' }
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return { ok: false, error: 'not_bound' }
  }

  return { ok: true }
}

/**
 * Unbind an assistant from a Telegram chat. Sets is_active=false and
 * is_primary=false on the matching row. Does NOT promote a sibling — the next
 * inbound message will surface the "no primary" path and the user picks one
 * with /agents.
 */
export async function unbindTelegramChannel(
  chatId: string,
  assistantId: string,
): Promise<void> {
  const { error } = await supabase
    .from('assistant_channels')
    .update({ is_active: false, is_primary: false })
    .eq('channel_type', 'telegram')
    .eq('external_channel_id', chatId)
    .eq('assistant_id', assistantId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { chatId, assistantId, operation: 'unbindTelegramChannel' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }
}

/**
 * Update an assistant's telegram_share_enabled flag.
 * Used by the Studio share toggle on the Telegram channel card.
 */
export async function setAssistantTelegramShareEnabled(
  assistantId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('ai_assistants')
    .update({ telegram_share_enabled: enabled })
    .eq('id', assistantId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { assistantId, enabled, operation: 'setAssistantTelegramShareEnabled' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    throw error
  }
}

/**
 * Bind an assistant to a Telegram chat via a public deep link
 * (`t.me/<bot>?start=agent_<id>`). Verifies telegram_share_enabled on the
 * agent before doing anything. On success, the agent becomes the primary
 * speaker for the chat.
 */
export async function bindAgentToChatViaShare(params: {
  assistantId: string
  chatId: string
  webhookSecret: string
  botToken: string
}): Promise<
  | { ok: true; channelId: string; assistantId: string }
  | { ok: false; error: 'agent_not_found' | 'share_disabled' | 'bind_failed' }
> {
  // Pre-check: does the agent exist and is sharing enabled? The RPC inside
  // upsertHostedTelegramChannel re-verifies share_enabled atomically at
  // promote time (requireShareEnabled=true), so a concurrent flip of the
  // flag cannot leave a disabled agent as primary.
  //
  // Previously this path accepted an org-wide "has consumed any prior connect
  // token" fallback as proof of access. That was a share-flag bypass: any
  // Telegram user authorized for ONE assistant in an org could reach EVERY
  // other assistant in the org via deep link. Deleted — the public deep link
  // is gated exclusively by telegram_share_enabled.
  const { data: agent, error: lookupError } = await supabase
    .from('ai_assistants')
    .select('id, telegram_share_enabled')
    .eq('id', params.assistantId)
    .single()

  if (lookupError || !agent) {
    return { ok: false, error: 'agent_not_found' }
  }

  if (agent.telegram_share_enabled !== true) {
    return { ok: false, error: 'share_disabled' }
  }

  try {
    const { channelId } = await upsertHostedTelegramChannel({
      assistantId: params.assistantId,
      telegramChatId: params.chatId,
      webhookSecret: params.webhookSecret,
      botToken: params.botToken,
      requireShareEnabled: true,
    })
    return { ok: true, channelId, assistantId: params.assistantId }
  } catch {
    // Distinguish share_disabled (raced flip caught by the RPC) from a
    // generic bind_failed by re-reading the flag. The upsert has already
    // rolled back any inserted row on failure.
    const { data: recheck } = await supabase
      .from('ai_assistants')
      .select('telegram_share_enabled')
      .eq('id', params.assistantId)
      .maybeSingle()
    if (recheck && recheck.telegram_share_enabled !== true) {
      return { ok: false, error: 'share_disabled' }
    }
    return { ok: false, error: 'bind_failed' }
  }
}

// ============================================================================
// Discord Multi-Agent Shared Bot (mirrors the Telegram helpers above)
//
// See:
//   - supabase/migrations/20260408160000_discord_multi_agent.sql
//   - supabase/migrations/20260408170000_discord_multi_agent_atomic_bind.sql
//   - docs/plans/2026-04-08-discord-byob-and-shared-bot.md
// ============================================================================

/**
 * Upsert a hosted Discord channel for an assistant.
 * Creates a new assistant_channels row or reuses the existing hosted one for
 * this assistant, rebinds it to the given guild, and makes it the primary
 * speaker for the guild. Wraps bind_hosted_discord_channel RPC, which holds
 * an advisory lock on the guild + a FOR UPDATE lock on the assistant.
 */
export async function upsertHostedDiscordChannel(params: {
  assistantId: string
  discordGuildId: string
  /**
   * When true, the RPC additionally verifies
   * `ai_assistants.discord_share_enabled = true` before mutating anything.
   * Used by the OAuth install path so a concurrent flip of the share flag
   * cannot leave a disabled agent as primary.
   */
  requireShareEnabled?: boolean
}) {
  const { data, error } = await supabase.rpc('bind_hosted_discord_channel', {
    p_assistant_id: params.assistantId,
    p_guild_id: params.discordGuildId,
    p_secret_token: crypto.randomUUID(),
    p_require_share_enabled: params.requireShareEnabled === true,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: {
        assistantId: params.assistantId,
        guildId: params.discordGuildId,
        operation: 'upsertHostedDiscordChannel',
      },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row || !row.channel_id) {
    const err = new Error(
      `Failed to bind hosted discord channel for assistant ${params.assistantId} / guild ${params.discordGuildId}`,
    )
    ErrorService.captureException(err, {
      severity: 'error',
      context: {
        assistantId: params.assistantId,
        guildId: params.discordGuildId,
        requireShareEnabled: params.requireShareEnabled === true,
        operation: 'upsertHostedDiscordChannel.emptyResult',
      },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw err
  }

  return { channelId: row.channel_id as string }
}

/**
 * Get the primary hosted Discord channel for a given guild ID.
 * Returns null if no row is primary (e.g. owner ran /leave).
 */
export async function getPrimaryDiscordChannelForGuild(
  guildId: string,
): Promise<{ id: string; assistant_id: string } | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id')
    .eq('channel_type', 'discord')
    .eq('is_active', true)
    .eq('external_channel_id', guildId)
    .eq('is_primary', true)
    .limit(1)

  if (error || !data || data.length === 0) {
    return null
  }

  return data[0]
}

/**
 * List every active Discord binding for a guild, joined with the assistant
 * display name + description. Used by /agents to render the select menu and
 * by /whoami to describe the active agent.
 */
export async function listDiscordChannelsForGuild(
  guildId: string,
): Promise<
  Array<{
    id: string
    assistant_id: string
    org_id?: string
    assistant_name: string
    assistant_description: string | null
    is_primary: boolean
    aliases?: string[]
  }>
> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, is_primary, ai_assistants!inner(org_id, name, description)')
    .eq('channel_type', 'discord')
    .eq('is_active', true)
    .eq('external_channel_id', guildId)
    .order('is_primary', { ascending: false })
    .order('name', { ascending: true, referencedTable: 'ai_assistants' })
    .limit(25)

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { guildId, operation: 'listDiscordChannelsForGuild' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return []
  }

  const aliasesByAssistantId = await listAssistantChannelAliasesByAssistantId({
    channelType: 'discord',
    surfaceOwnerKind: 'guild',
    surfaceOwnerId: guildId,
    assistantIds: data.map((row: { assistant_id: string }) => row.assistant_id),
  })

  return data.map(
    (row: {
      id: string
      assistant_id: string
      is_primary: boolean
      ai_assistants:
        | { org_id?: string | null; name: string; description: string | null }
        | { org_id?: string | null; name: string; description: string | null }[]
    }) => {
      const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
      return {
        id: row.id,
        assistant_id: row.assistant_id,
        org_id: ai?.org_id ?? undefined,
        assistant_name: ai?.name ?? 'Untitled agent',
        assistant_description: ai?.description ?? null,
        is_primary: row.is_primary === true,
        aliases: aliasesByAssistantId[row.assistant_id] ?? [],
      }
    },
  )
}

/**
 * Atomically make the given assistant the primary speaker for a Discord guild.
 * Backed by the set_discord_guild_primary RPC.
 */
export async function setPrimaryDiscordChannel(
  guildId: string,
  assistantId: string,
  requireShareEnabled = false,
): Promise<{ ok: boolean; error?: 'not_bound' }> {
  const { data, error } = await supabase.rpc('set_discord_guild_primary', {
    p_guild_id: guildId,
    p_assistant_id: assistantId,
    p_require_share_enabled: requireShareEnabled,
  })

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { guildId, assistantId, operation: 'setPrimaryDiscordChannel' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    return { ok: false, error: 'not_bound' }
  }

  if (!data || (Array.isArray(data) && data.length === 0)) {
    return { ok: false, error: 'not_bound' }
  }

  return { ok: true }
}

/**
 * Unbind an assistant from a Discord guild. Sets is_active=false and
 * is_primary=false on the matching row. Does NOT promote a sibling.
 */
export async function unbindDiscordChannel(
  guildId: string,
  assistantId: string,
): Promise<void> {
  const { error } = await supabase
    .from('assistant_channels')
    .update({ is_active: false, is_primary: false })
    .eq('channel_type', 'discord')
    .eq('external_channel_id', guildId)
    .eq('assistant_id', assistantId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { guildId, assistantId, operation: 'unbindDiscordChannel' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw error
  }
}

export async function getDiscordVoiceSettingsForGuild(
  guildId: string,
): Promise<{
  assistantId: string
  assistantName: string
  mode: 'off' | 'auto' | 'always'
  voiceId: string | null
  instructions: string | null
} | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('assistant_id, channel_config, ai_assistants!inner(name)')
    .eq('channel_type', 'discord')
    .eq('is_active', true)
    .eq('external_channel_id', guildId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { guildId, operation: 'getDiscordVoiceSettingsForGuild' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return null
  }

  const ai = Array.isArray(data.ai_assistants) ? data.ai_assistants[0] : data.ai_assistants
  const config = data.channel_config && typeof data.channel_config === 'object'
    ? data.channel_config as Record<string, unknown>
    : {}
  const configuredMode = config.discord_voice_mode
  return {
    assistantId: data.assistant_id,
    assistantName: ai?.name ?? 'Untitled agent',
    mode:
      configuredMode === 'auto' || configuredMode === 'always'
        ? configuredMode
        : 'auto',
    voiceId:
      typeof config.discord_voice_id === 'string' && config.discord_voice_id.trim().length > 0
        ? config.discord_voice_id.trim()
        : null,
    instructions:
      typeof config.discord_voice_instructions === 'string' &&
      config.discord_voice_instructions.trim().length > 0
        ? config.discord_voice_instructions.trim()
        : null,
  }
}

export async function getDiscordStatusForGuild(
  guildId: string,
): Promise<{
  channelId: string
  assistantId: string
  assistantName: string
  assistantDescription: string | null
  model: string | null
  guildName: string | null
  dedicatedChannelIds: string[]
  replyToMode: 'off' | 'first' | 'all'
  maxLinesPerMessage: number
  chunkMode: 'length' | 'newline'
  voiceMode: 'off' | 'auto' | 'always'
  voiceId: string | null
} | null> {
  const { data, error } = await supabase
    .from('assistant_channels')
    .select('id, assistant_id, channel_config, ai_assistants!inner(name, description, lucid_model)')
    .eq('channel_type', 'discord')
    .eq('is_active', true)
    .eq('external_channel_id', guildId)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    if (error) {
      ErrorService.captureException(error, {
        severity: 'warning',
        context: { guildId, operation: 'getDiscordStatusForGuild' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return null
  }

  const ai = Array.isArray(data.ai_assistants) ? data.ai_assistants[0] : data.ai_assistants
  const config =
    data.channel_config && typeof data.channel_config === 'object'
      ? (data.channel_config as Record<string, unknown>)
      : {}
  const dedicatedChannelIds = Array.isArray(config.discord_dedicated_channel_ids)
    ? config.discord_dedicated_channel_ids
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    : []
  const replyToMode =
    config.discord_reply_to_mode === 'off' ||
    config.discord_reply_to_mode === 'all' ||
    config.discord_reply_to_mode === 'first'
      ? config.discord_reply_to_mode
      : 'first'
  const rawMaxLines =
    typeof config.discord_max_lines_per_message === 'number'
      ? config.discord_max_lines_per_message
      : Number.parseInt(String(config.discord_max_lines_per_message ?? ''), 10)
  const maxLinesPerMessage =
    Number.isFinite(rawMaxLines) && rawMaxLines >= 4 && rawMaxLines <= 40
      ? rawMaxLines
      : 17
  const chunkMode = config.discord_chunk_mode === 'newline' ? 'newline' : 'length'
  const voiceMode =
    config.discord_voice_mode === 'off' ||
    config.discord_voice_mode === 'always' ||
    config.discord_voice_mode === 'auto'
      ? config.discord_voice_mode
      : 'auto'

  return {
    channelId: data.id,
    assistantId: data.assistant_id,
    assistantName: ai?.name ?? 'Untitled agent',
    assistantDescription: ai?.description ?? null,
    model:
      typeof ai?.lucid_model === 'string' && ai.lucid_model.trim().length > 0
        ? ai.lucid_model.trim()
        : null,
    guildName:
      typeof config.discord_guild_name === 'string' && config.discord_guild_name.trim().length > 0
        ? config.discord_guild_name.trim()
        : null,
    dedicatedChannelIds,
    replyToMode,
    maxLinesPerMessage,
    chunkMode,
    voiceMode,
    voiceId:
      typeof config.discord_voice_id === 'string' && config.discord_voice_id.trim().length > 0
        ? config.discord_voice_id.trim()
        : null,
  }
}

export async function updateDiscordVoiceSettingsForGuild(params: {
  guildId: string
  assistantId: string
  mode?: 'off' | 'auto' | 'always'
  voiceId?: string | null
  instructions?: string | null
}): Promise<{
  assistantId: string
  assistantName: string
  mode: 'off' | 'auto' | 'always'
  voiceId: string | null
  instructions: string | null
} | null> {
  const { data: row, error: loadError } = await supabase
    .from('assistant_channels')
    .select('id, channel_config, ai_assistants!inner(name)')
    .eq('channel_type', 'discord')
    .eq('is_active', true)
    .eq('external_channel_id', params.guildId)
    .eq('assistant_id', params.assistantId)
    .limit(1)
    .maybeSingle()

  if (loadError || !row) {
    if (loadError) {
      ErrorService.captureException(loadError, {
        severity: 'warning',
        context: { ...params, operation: 'updateDiscordVoiceSettingsForGuild.load' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return null
  }

  const nextConfig = row.channel_config && typeof row.channel_config === 'object'
    ? { ...(row.channel_config as Record<string, unknown>) }
    : {}

  if (params.mode) nextConfig.discord_voice_mode = params.mode
  if (params.voiceId !== undefined) {
    nextConfig.discord_voice_id =
      typeof params.voiceId === 'string' && params.voiceId.trim().length > 0
        ? params.voiceId.trim()
        : null
  }
  if (params.instructions !== undefined) {
    nextConfig.discord_voice_instructions =
      typeof params.instructions === 'string' && params.instructions.trim().length > 0
        ? params.instructions.trim()
        : null
  }

  const { error: updateError } = await supabase
    .from('assistant_channels')
    .update({ channel_config: nextConfig })
    .eq('id', row.id)

  if (updateError) {
    ErrorService.captureException(updateError, {
      severity: 'error',
      context: { ...params, operation: 'updateDiscordVoiceSettingsForGuild.update' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
    throw updateError
  }

  const ai = Array.isArray(row.ai_assistants) ? row.ai_assistants[0] : row.ai_assistants
  return {
    assistantId: params.assistantId,
    assistantName: ai?.name ?? 'Untitled agent',
    mode:
      nextConfig.discord_voice_mode === 'auto' || nextConfig.discord_voice_mode === 'always'
        ? nextConfig.discord_voice_mode
        : 'auto',
    voiceId:
      typeof nextConfig.discord_voice_id === 'string' && nextConfig.discord_voice_id.trim().length > 0
        ? nextConfig.discord_voice_id.trim()
        : null,
    instructions:
      typeof nextConfig.discord_voice_instructions === 'string' &&
      nextConfig.discord_voice_instructions.trim().length > 0
        ? nextConfig.discord_voice_instructions.trim()
        : null,
  }
}

/**
 * Update an assistant's discord_share_enabled flag.
 * Used by the Studio share toggle on the Discord channel card.
 */
export async function setAssistantDiscordShareEnabled(
  assistantId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('ai_assistants')
    .update({ discord_share_enabled: enabled })
    .eq('id', assistantId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { assistantId, enabled, operation: 'setAssistantDiscordShareEnabled' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    throw error
  }
}

/**
 * Update an assistant's slack_share_enabled flag.
 * Used by the Studio share toggle for future hosted Slack installs.
 */
export async function setAssistantSlackShareEnabled(
  assistantId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('ai_assistants')
    .update({ slack_share_enabled: enabled })
    .eq('id', assistantId)

  if (error) {
    ErrorService.captureException(error, {
      severity: 'error',
      context: { assistantId, enabled, operation: 'setAssistantSlackShareEnabled' },
      tags: { layer: 'database', table: 'ai_assistants' },
    })
    throw error
  }
}

/**
 * Bind an assistant to a Discord guild via the public OAuth install flow.
 * On success, the agent becomes the primary speaker for the guild.
 */
export async function bindAgentToGuildViaShare(params: {
  assistantId: string
  guildId: string
}): Promise<
  | { ok: true; channelId: string; assistantId: string }
  | { ok: false; error: 'agent_not_found' | 'bind_failed' }
> {
  const { data: agent, error: lookupError } = await supabase
    .from('ai_assistants')
    .select('id')
    .eq('id', params.assistantId)
    .single()

  if (lookupError || !agent) {
    return { ok: false, error: 'agent_not_found' }
  }

  try {
    const { channelId } = await upsertHostedDiscordChannel({
      assistantId: params.assistantId,
      discordGuildId: params.guildId,
      requireShareEnabled: false,
    })

    const { error: routingError } = await supabase
      .from('assistant_channels')
      .update({
        inbound_routing_config: {
          respond_on_mention: true,
          ignore_bots: true,
        },
      })
      .eq('id', channelId)

    if (routingError) {
      ErrorService.captureException(routingError, {
        severity: 'warning',
        context: {
          assistantId: params.assistantId,
          guildId: params.guildId,
          channelId,
          operation: 'bindAgentToGuildViaShare.setHostedRoutingDefaults',
        },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }

    return { ok: true, channelId, assistantId: params.assistantId }
  } catch {
    return { ok: false, error: 'bind_failed' }
  }
}

export async function updateDiscordGuildMetadata(params: {
  channelId: string
  guildId: string
  guildName?: string | null
}): Promise<void> {
  const { data: row, error: loadError } = await supabase
    .from('assistant_channels')
    .select('channel_config')
    .eq('id', params.channelId)
    .eq('channel_type', 'discord')
    .eq('external_channel_id', params.guildId)
    .limit(1)
    .maybeSingle()

  if (loadError || !row) {
    if (loadError) {
      ErrorService.captureException(loadError, {
        severity: 'warning',
        context: { ...params, operation: 'updateDiscordGuildMetadata.load' },
        tags: { layer: 'database', table: 'assistant_channels' },
      })
    }
    return
  }

  const nextConfig = row.channel_config && typeof row.channel_config === 'object'
    ? { ...(row.channel_config as Record<string, unknown>) }
    : {}

  const normalizedGuildName =
    typeof params.guildName === 'string' && params.guildName.trim().length > 0
      ? params.guildName.trim()
      : null

  if (normalizedGuildName) {
    nextConfig.discord_guild_name = normalizedGuildName
  } else {
    delete nextConfig.discord_guild_name
  }

  const { error: updateError } = await supabase
    .from('assistant_channels')
    .update({ channel_config: nextConfig })
    .eq('id', params.channelId)

  if (updateError) {
    ErrorService.captureException(updateError, {
      severity: 'warning',
      context: { ...params, operation: 'updateDiscordGuildMetadata.update' },
      tags: { layer: 'database', table: 'assistant_channels' },
    })
  }
}
