import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const BUILD_DIR = resolve(import.meta.dirname, '../../../../../nango-integrations/build');
const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../../../../supabase/migrations');

/** Expected DB action counts per provider. */
const EXPECTED_COUNTS: Record<string, number> = {
  hubspot: 50, slack: 23, 'twitter-v2': 23, google: 16,
  'google-calendar': 15, salesforce: 14, notion: 13, 'google-sheets': 12,
  zendesk: 8, asana: 5, github: 5, zoom: 5, airtable: 4, intercom: 4,
  linear: 4, calendly: 3, aircall: 2, 'aws-iam': 2, fireflies: 1,
  gong: 1, jira: 1, linkedin: 1,
  discord: 5, instagram: 3, facebook: 3, reddit: 4, tiktok: 2,
  bitly: 3, trello: 5, typeform: 3, whoop: 4, heygen: 3,
  paypal: 4, canva: 3, lemlist: 3, amazon: 2,
  make: 6, zapier: 5, pipedrive: 12, apollo: 8,
};

/**
 * Script provider prefix → DB provider mapping for cases where they diverge.
 * Currently none — both scripts and DB use 'twitter-v2'.
 */
const SCRIPT_TO_DB_PROVIDER: Record<string, string> = {};

/**
 * Reverse: DB provider → expected-count key mapping.
 * Old migration (20260328700000) uses 'twitter'; new one uses 'twitter-v2'.
 * Both insert into DB — ON CONFLICT deduplicates. Map old name to expected key.
 */
const DB_TO_EXPECTED_KEY: Record<string, string> = {
  twitter: 'twitter-v2',
};

/**
 * Scripts that are known variants/aliases without their own DB catalog entry.
 * - notion/search-pages: alias for 'search' (DB has 'search')
 * - notion/retrieve-database: alias for 'get_database' (DB has 'get_database')
 * - google/list-files-non-unified: variant of 'list_files' for non-unified provider key
 */
const SCRIPT_EXCLUSIONS = new Set([
  'google/list-files-non-unified',
  'notion/retrieve-database',
  'notion/search-pages',
]);

/** Migrations that lack ON CONFLICT — recorded as applied before we added idempotency. */
const ON_CONFLICT_EXCEPTIONS = new Set([
  '20260321120000_oauth_action_catalog.sql',
  '20260328700000_seed_x_oauth_action_catalog.sql',
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getScriptsByProvider(): Map<string, string[]> {
  const files = readdirSync(BUILD_DIR).filter((f) => f.endsWith('.cjs'));
  const map = new Map<string, string[]>();
  for (const file of files) {
    // Format: <provider>_actions_<action-name>.cjs  (provider may contain hyphens)
    const match = file.match(/^(.+?)_actions_(.+)\.cjs$/);
    if (!match) continue;
    const [, rawProvider, action] = match;
    const list = map.get(rawProvider) ?? [];
    list.push(action);
    map.set(rawProvider, list);
  }
  return map;
}

function getMigrationFiles(): string[] {
  if (!existsSync(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => {
      if (!f.endsWith('.sql')) return false;
      // Match both naming conventions:
      // - Old: *_oauth_action_catalog.sql
      // - New: *_seed_*_actions.sql / *_seed_*_remaining_actions.sql
      return f.includes('oauth_action_catalog') || /seed_.*_actions\.sql$/.test(f);
    });
}

function parseActionsFromMigrations(files: string[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const file of files) {
    const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');
    // Match lines starting with ('provider', 'DisplayName', 'action_name',
    // The ^ anchor + gm flags ensure we only match INSERT value tuples,
    // not random substrings inside JSON or other SQL.
    const re = /^\('([^']+)',\s*'[^']*',\s*'([^']+)'/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const [, provider, actionName] = m;
      const set = map.get(provider) ?? new Set();
      set.add(actionName);
      map.set(provider, set);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('oauth-action-catalog completeness', () => {
  const scriptsByProvider = getScriptsByProvider();
  const migrationFiles = getMigrationFiles();
  const dbActionsByProvider = parseActionsFromMigrations(migrationFiles);

  it('build directory exists and has .cjs scripts', () => {
    expect(existsSync(BUILD_DIR)).toBe(true);
    const total = [...scriptsByProvider.values()].reduce((s, a) => s + a.length, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('every .cjs script has a corresponding DB entry', () => {
    const missing: string[] = [];

    for (const [scriptProvider, actions] of scriptsByProvider) {
      const dbProvider = SCRIPT_TO_DB_PROVIDER[scriptProvider] ?? scriptProvider;

      // google_ scripts span google, google-calendar, and google-sheets in DB.
      // google-calendar_ and google-sheets_ scripts also have their own DB providers.
      const dbSets: Set<string>[] = [];
      if (dbProvider === 'google') {
        for (const p of ['google', 'google-calendar', 'google-sheets']) {
          const s = dbActionsByProvider.get(p);
          if (s) dbSets.push(s);
        }
      } else {
        const s = dbActionsByProvider.get(dbProvider);
        if (s) dbSets.push(s);
        // Also check aliased DB providers (e.g. twitter-v2 scripts also in 'twitter' DB rows)
        for (const [alias, target] of Object.entries(DB_TO_EXPECTED_KEY)) {
          if (target === dbProvider) {
            const aliased = dbActionsByProvider.get(alias);
            if (aliased) dbSets.push(aliased);
          }
        }
      }

      for (const action of actions) {
        // Scripts use hyphens, DB uses underscores
        const dbName = action.replace(/-/g, '_');
        const found = dbSets.some((s) => s.has(dbName));
        if (!found && !SCRIPT_EXCLUSIONS.has(`${scriptProvider}/${action}`)) {
          missing.push(`${scriptProvider}/${action}`);
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('every provider with scripts has at least one migration', () => {
    const providersWithoutMigration: string[] = [];

    for (const scriptProvider of scriptsByProvider.keys()) {
      const dbProvider = SCRIPT_TO_DB_PROVIDER[scriptProvider] ?? scriptProvider;

      if (dbProvider === 'google') {
        // google scripts are split across google, google-calendar, google-sheets
        const hasAny = ['google', 'google-calendar', 'google-sheets'].some((p) =>
          dbActionsByProvider.has(p),
        );
        if (!hasAny) providersWithoutMigration.push(scriptProvider);
      } else if (!dbActionsByProvider.has(dbProvider)) {
        providersWithoutMigration.push(scriptProvider);
      }
    }

    expect(providersWithoutMigration).toEqual([]);
  });

  it('action counts match expected per provider', () => {
    const mismatches: string[] = [];

    // Reverse DB_TO_EXPECTED_KEY: collect all DB providers that map to each expected key
    const expectedKeyToDbProviders = new Map<string, string[]>();
    for (const [dbProv, expKey] of Object.entries(DB_TO_EXPECTED_KEY)) {
      const list = expectedKeyToDbProviders.get(expKey) ?? [];
      list.push(dbProv);
      expectedKeyToDbProviders.set(expKey, list);
    }

    for (const [expectedKey, expected] of Object.entries(EXPECTED_COUNTS)) {
      // Merge actions from all DB providers that map to this expected key
      const merged = new Set<string>();
      // The primary DB provider (same name as expected key)
      const primary = dbActionsByProvider.get(expectedKey);
      if (primary) primary.forEach((a) => merged.add(a));
      // Any aliased DB providers (e.g. 'twitter' → 'twitter-v2')
      for (const alias of expectedKeyToDbProviders.get(expectedKey) ?? []) {
        const aliased = dbActionsByProvider.get(alias);
        if (aliased) aliased.forEach((a) => merged.add(a));
      }
      const actual = merged.size;
      if (actual !== expected) {
        mismatches.push(`${expectedKey}: expected ${expected}, got ${actual}`);
      }
    }

    expect(mismatches).toEqual([]);
  });

  it('all seed migrations use ON CONFLICT DO NOTHING for idempotency', () => {
    const nonIdempotent: string[] = [];

    for (const file of migrationFiles) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf-8');
      // Only check files that INSERT into the catalog
      if (!sql.includes('INSERT INTO oauth_action_catalog')) continue;
      if (ON_CONFLICT_EXCEPTIONS.has(file)) continue;
      if (!sql.includes('ON CONFLICT') || !sql.includes('DO NOTHING')) {
        nonIdempotent.push(file);
      }
    }

    expect(nonIdempotent).toEqual([]);
  });

  it('no provider in DB is missing from expected counts', () => {
    const unexpected = [...dbActionsByProvider.keys()].filter((dbProvider) => {
      const key = DB_TO_EXPECTED_KEY[dbProvider] ?? dbProvider;
      return !(key in EXPECTED_COUNTS);
    });
    expect(unexpected).toEqual([]);
  });
});
