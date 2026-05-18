/**
 * Key Template DB Operations
 *
 * Re-exports from centralized @/lib/db/index.ts to maintain backward compatibility.
 * The actual implementations use the shared Supabase client (no direct createClient).
 */

export {
  createKeyTemplate,
  listKeyTemplates,
  getKeyTemplate,
  deleteKeyTemplate,
} from '@/lib/db'