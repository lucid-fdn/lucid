/**
 * Credential Resolver
 * Resolves credential aliases to n8n credential IDs
 * Features: 3-tier cache (Redis → DB → n8n), race-safe, idempotent
 */

import type { N8nClient } from './client';
import type { N8nCredentialReference } from '../../types';

// ============================================================================
// Configuration
// ============================================================================

const CACHE_TTL = 3600; // 1 hour in seconds
const REDIS_KEY_PREFIX = 'n8n:cred:';

// ============================================================================
// Dependency Interfaces
// ============================================================================

/** Minimal Redis client interface (compatible with ioredis, node-redis, etc.) */
interface RedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, seconds: number, value: string): Promise<unknown>;
  del(...keys: string[]): Promise<unknown>;
  keys(pattern: string): Promise<string[]>;
}

/** Minimal database query result */
interface DbQueryResult<T = Record<string, unknown>> {
  rows: T[];
}

/** Minimal database client interface (compatible with pg, Supabase, etc.) */
interface DbClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<DbQueryResult<T>>;
}

/** Row shape returned from credential alias table */
interface CredentialAliasRow {
  alias: string;
  n8n_credential_name: string;
}

/** Row shape returned from tenant credentials table */
interface TenantCredentialRow {
  credential_data: Record<string, unknown>;
}

/** n8n credential item as returned from listCredentials */
interface N8nCredentialItem {
  id: string;
  name: string;
  type?: string;
}

/** Shape of a workflow with nodes that may have credential placeholders */
interface WorkflowWithCredentials {
  nodes: Array<{
    credentials?: Record<string, { id: string; name: string }>;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

// ============================================================================
// Credential Resolver
// ============================================================================

export class CredentialResolver {
  private client: N8nClient;
  private redis: RedisClient;
  private db: DbClient;

  constructor(n8nClient: N8nClient, redis: RedisClient, db: DbClient) {
    this.client = n8nClient;
    this.redis = redis;
    this.db = db;
  }

  /**
   * Resolve credential alias to n8n credential ID
   * Uses 3-tier cache: Redis → DB → n8n
   */
  async resolveCredentialId(
    tenantId: string,
    alias: string,
    credentialType: string
  ): Promise<string> {
    // Tier 1: Check Redis cache
    const cacheKey = `${REDIS_KEY_PREFIX}${tenantId}:${alias}`;
    const cached = await this.getCached(cacheKey);
    
    if (cached) {
      return cached;
    }

    // Tier 2: Check database mapping
    const dbRecord = await this.getFromDatabase(tenantId, alias);
    
    if (dbRecord) {
      const n8nName = dbRecord.n8n_credential_name;
      
      // Tier 3a: Verify it exists in n8n
      const n8nId = await this.findInN8n(n8nName);
      
      if (n8nId) {
        // Cache and return
        await this.cache(cacheKey, n8nId);
        return n8nId;
      }
    }

    // Tier 3b: Create new credential in n8n
    return this.createCredential(tenantId, alias, credentialType);
  }

  /**
   * Resolve multiple credentials at once
   */
  async resolveCredentials(
    tenantId: string,
    credentials: Record<string, { alias: string; type: string }>
  ): Promise<Record<string, N8nCredentialReference>> {
    const resolved: Record<string, N8nCredentialReference> = {};

    for (const [key, { alias, type }] of Object.entries(credentials)) {
      const id = await this.resolveCredentialId(tenantId, alias, type);
      resolved[key] = {
        id,
        name: `cred_${tenantId}_${alias}`,
      };
    }

    return resolved;
  }

  // ==========================================================================
  // Cache Operations (Tier 1: Redis)
  // ==========================================================================

  private async getCached(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  private async cache(key: string, value: string): Promise<void> {
    try {
      await this.redis.setex(key, CACHE_TTL, value);
    } catch (error) {
      console.error('Redis setex error:', error);
    }
  }

  private async invalidateCache(tenantId: string, alias: string): Promise<void> {
    const cacheKey = `${REDIS_KEY_PREFIX}${tenantId}:${alias}`;
    try {
      await this.redis.del(cacheKey);
    } catch (error) {
      console.error('Redis del error:', error);
    }
  }

  // ==========================================================================
  // Database Operations (Tier 2)
  // ==========================================================================

  private async getFromDatabase(
    tenantId: string,
    alias: string
  ): Promise<{ n8n_credential_name: string } | null> {
    try {
      const result = await this.db.query<{ n8n_credential_name: string }>(
        `SELECT n8n_credential_name
         FROM n8n_credential_aliases
         WHERE tenant_id = $1 AND alias = $2
         LIMIT 1`,
        [tenantId, alias]
      );

      return result.rows[0] || null;
    } catch (error) {
      console.error('Database query error:', error);
      return null;
    }
  }

  private async saveToDatabase(
    tenantId: string,
    alias: string,
    n8nCredentialName: string
  ): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO n8n_credential_aliases (tenant_id, alias, n8n_credential_name, created_at, updated_at)
         VALUES ($1, $2, $3, NOW(), NOW())
         ON CONFLICT (tenant_id, alias) DO NOTHING`,
        [tenantId, alias, n8nCredentialName]
      );
    } catch (error) {
      console.error('Database insert error:', error);
      // Don't throw - this is best-effort caching
    }
  }

  // ==========================================================================
  // n8n Operations (Tier 3)
  // ==========================================================================

  private async findInN8n(credentialName: string): Promise<string | null> {
    try {
      // Get all credentials (or use filter if n8n supports it)
      const credentials = await this.client.listCredentials() as N8nCredentialItem[];

      const match = credentials.find((c: N8nCredentialItem) => c.name === credentialName);
      return match?.id || null;
    } catch (error) {
      console.error('n8n list credentials error:', error);
      return null;
    }
  }

  private async createCredential(
    tenantId: string,
    alias: string,
    credentialType: string
  ): Promise<string> {
    const credentialName = `cred_${tenantId}_${alias}`;

    try {
      // Get credential data from your system
      const credentialData = await this.getCredentialData(tenantId, alias);

      // Create in n8n (idempotent - may fail if exists due to race)
      const created = await this.client.createCredential({
        name: credentialName,
        type: credentialType,
        data: credentialData,
      }) as N8nCredentialItem;

      // Save mapping to database
      await this.saveToDatabase(tenantId, alias, credentialName);

      // Cache the ID
      const cacheKey = `${REDIS_KEY_PREFIX}${tenantId}:${alias}`;
      await this.cache(cacheKey, created.id);

      return created.id;
    } catch (error: unknown) {
      // If creation failed because it already exists (race condition)
      const errMsg = error instanceof Error ? error.message : '';
      const errStatusCode = (error as { statusCode?: number }).statusCode;
      if (errMsg.includes('already exists') || errStatusCode === 409) {
        // Retry resolution (it should be in n8n now)
        const existingId = await this.findInN8n(credentialName);

        if (existingId) {
          // Save mapping and cache
          await this.saveToDatabase(tenantId, alias, credentialName);
          const cacheKey = `${REDIS_KEY_PREFIX}${tenantId}:${alias}`;
          await this.cache(cacheKey, existingId);
          return existingId;
        }
      }

      // Real error - propagate
      throw new Error(`Failed to create credential: ${errMsg}`);
    }
  }

  /**
   * Get credential data from your system
   * This should retrieve the actual credential values (API keys, passwords, etc.)
   */
  private async getCredentialData(
    tenantId: string,
    alias: string
  ): Promise<Record<string, unknown>> {
    // TODO: Implement actual credential retrieval from your secure storage
    // This might query a credentials table, KMS, vault, etc.

    try {
      const result = await this.db.query<TenantCredentialRow>(
        `SELECT credential_data
         FROM tenant_credentials
         WHERE tenant_id = $1 AND alias = $2`,
        [tenantId, alias]
      );

      if (result.rows[0]) {
        return result.rows[0].credential_data;
      }

      throw new Error(`Credential data not found for alias: ${alias}`);
    } catch (error: unknown) {
      throw new Error(`Failed to retrieve credential data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Prefetch multiple credentials (batch optimization)
   */
  async prefetchCredentials(
    tenantId: string,
    aliases: string[]
  ): Promise<void> {
    // Load all from DB at once
    try {
      const result = await this.db.query<CredentialAliasRow>(
        `SELECT alias, n8n_credential_name
         FROM n8n_credential_aliases
         WHERE tenant_id = $1 AND alias = ANY($2)`,
        [tenantId, aliases]
      );

      // Cache them
      const promises = result.rows.map(async (row: CredentialAliasRow) => {
        const n8nId = await this.findInN8n(row.n8n_credential_name);
        if (n8nId) {
          const cacheKey = `${REDIS_KEY_PREFIX}${tenantId}:${row.alias}`;
          await this.cache(cacheKey, n8nId);
        }
      });

      await Promise.all(promises);
    } catch (error) {
      console.error('Prefetch error:', error);
    }
  }

  /**
   * Invalidate credential cache (when credential is updated)
   */
  async invalidate(tenantId: string, alias: string): Promise<void> {
    await this.invalidateCache(tenantId, alias);
  }

  /**
   * Clear all credential caches for a tenant
   */
  async clearTenantCache(tenantId: string): Promise<void> {
    try {
      const pattern = `${REDIS_KEY_PREFIX}${tenantId}:*`;
      const keys = await this.redis.keys(pattern);
      
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Clear tenant cache error:', error);
    }
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create credential resolver from dependencies
 */
export function createCredentialResolver(
  n8nClient: N8nClient,
  redis: RedisClient,
  db: DbClient
): CredentialResolver {
  return new CredentialResolver(n8nClient, redis, db);
}

// ============================================================================
// Helper: Inject Resolved Credentials
// ============================================================================

/**
 * Replace credential placeholders with resolved IDs
 */
export async function injectResolvedCredentials(
  workflow: WorkflowWithCredentials,
  resolver: CredentialResolver,
  tenantId: string
): Promise<WorkflowWithCredentials> {
  const workflowCopy: WorkflowWithCredentials = JSON.parse(JSON.stringify(workflow));

  for (const node of workflowCopy.nodes) {
    if (!node.credentials) continue;

    for (const [credType, credRef] of Object.entries(node.credentials)) {
      const ref = credRef;

      // If ID is placeholder, resolve it
      if (ref.id === 'placeholder' && ref.name) {
        // Extract alias from name (format: "cred_tenantId_alias" or just "alias")
        const alias = ref.name.startsWith('cred_')
          ? ref.name.split('_').slice(2).join('_')
          : ref.name;

        try {
          const resolvedId = await resolver.resolveCredentialId(
            tenantId,
            alias,
            credType
          );

          // Update with resolved ID
          ref.id = resolvedId;
          ref.name = `cred_${tenantId}_${alias}`;
        } catch (error: unknown) {
          console.error(`Failed to resolve credential ${alias}:`, error);
          throw new Error(`Credential resolution failed for ${alias}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  return workflowCopy;
}
