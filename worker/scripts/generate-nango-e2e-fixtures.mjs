import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Nango } from '@nangohq/node';

const ROOT = resolve(import.meta.dirname, '..');
const BUILD_DIR = resolve(ROOT, '../nango-integrations/build');

const DEFAULT_FIXTURES_PATH = resolve(ROOT, 'src/agent/oauth-tools/__tests__/action-e2e.fixtures.generated.json');
const DEFAULT_REPORT_PATH = resolve(ROOT, 'src/agent/oauth-tools/__tests__/action-e2e.report.generated.json');

const args = process.argv.slice(2);

function getArg(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

const fixturesPath = resolve(getArg('--fixtures', DEFAULT_FIXTURES_PATH));
const reportPath = resolve(getArg('--report', DEFAULT_REPORT_PATH));

const secretKey = process.env.NANGO_SECRET_KEY?.trim();
const host =
  process.env.NANGO_HOST?.trim()
  || process.env.NANGO_API_BASE?.trim()
  || (process.env.NEXT_PUBLIC_OAUTH_API_URL?.trim()
    ? `${process.env.NEXT_PUBLIC_OAUTH_API_URL.trim().replace(/\/$/, '')}/nango`
    : '');

if (!secretKey) {
  throw new Error('Missing NANGO_SECRET_KEY');
}

if (!host) {
  throw new Error('Missing NANGO_HOST/NANGO_API_BASE/NEXT_PUBLIC_OAUTH_API_URL');
}

const EXPLICIT_SMOKE_CONFIG = {
  github: { smokeAction: 'list-repos', smokeArgs: {}, expectKeys: ['repositories'] },
  notion: { smokeAction: 'search-pages', smokeArgs: { page_size: 5 }, expectKeys: ['results'] },
  slack: { smokeAction: 'list-channels', smokeArgs: {}, expectKeys: ['channels'] },
};

const ACTION_PREFERENCE_PATTERNS = [
  /^whoami$/,
  /^list-/,
  /^search-/,
  /^fetch-/,
  /^find-/,
  /^get-/,
  /^query-/,
  /^retrieve-/,
  /^read-/,
];

function getBuiltActionMap() {
  const map = new Map();

  for (const file of readdirSync(BUILD_DIR)) {
    const match = file.match(/^(.+)_actions_(.+)\.cjs$/);
    if (!match) continue;
    const [, integrationId, actionName] = match;
    if (!map.has(integrationId)) map.set(integrationId, []);
    map.get(integrationId).push(actionName);
  }

  for (const actions of map.values()) {
    actions.sort();
  }

  return map;
}

function pickSmokeConfig(integrationId, actions) {
  const explicit = EXPLICIT_SMOKE_CONFIG[integrationId];
  if (explicit && actions.includes(explicit.smokeAction)) {
    return explicit;
  }

  const smokeAction = actions.find((action) =>
    ACTION_PREFERENCE_PATTERNS.some((pattern) => pattern.test(action))
  );

  if (!smokeAction) return null;
  return { smokeAction, smokeArgs: {}, expectKeys: [] };
}

function firstDefined(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== '');
}

const nango = new Nango({ secretKey, host });
const builtActionMap = getBuiltActionMap();
const builtIntegrations = [...builtActionMap.keys()].sort();

const integrationResponse = await nango.listIntegrations();
const connectionResponse = await nango.listConnections({ limit: 1000 });

const liveIntegrationIds = new Set(
  (integrationResponse.configs || [])
    .map((item) => firstDefined(item.unique_key, item.provider_config_key, item.provider))
    .filter(Boolean)
);

const rawConnections = connectionResponse.data || connectionResponse.connections || [];
const activeConnectionByProvider = new Map();

for (const conn of rawConnections) {
  const providerConfigKey = firstDefined(conn.provider_config_key, conn.providerConfigKey, conn.provider);
  const connectionId = firstDefined(conn.connection_id, conn.connectionId, conn.id);
  if (!providerConfigKey || !connectionId) continue;
  if (conn.deleted === true) continue;
  if (!activeConnectionByProvider.has(providerConfigKey)) {
    activeConnectionByProvider.set(providerConfigKey, connectionId);
  }
}

const fixtures = {};
const missingConnections = [];
const missingSmokeActions = [];

for (const integrationId of builtIntegrations) {
  const connectionId = activeConnectionByProvider.get(integrationId);
  if (!connectionId) {
    missingConnections.push(integrationId);
    continue;
  }

  const actions = builtActionMap.get(integrationId) || [];
  const smokeConfig = pickSmokeConfig(integrationId, actions);
  if (!smokeConfig) {
    missingSmokeActions.push(integrationId);
    continue;
  }

  fixtures[integrationId] = {
    connectionId,
    providerConfigKey: integrationId,
    smokeAction: smokeConfig.smokeAction,
    smokeArgs: smokeConfig.smokeArgs,
    expectKeys: smokeConfig.expectKeys,
  };
}

const connectedButUnbuilt = [...activeConnectionByProvider.keys()]
  .filter((provider) => !builtActionMap.has(provider))
  .sort();

const report = {
  host,
  builtIntegrationCount: builtIntegrations.length,
  liveIntegrationCount: liveIntegrationIds.size,
  liveConnectionCount: rawConnections.length,
  fixtureCount: Object.keys(fixtures).length,
  fixtureProviders: Object.keys(fixtures).sort(),
  missingConnections,
  missingSmokeActions,
  connectedButUnbuilt,
};

mkdirSync(dirname(fixturesPath), { recursive: true });
mkdirSync(dirname(reportPath), { recursive: true });

writeFileSync(fixturesPath, `${JSON.stringify(fixtures, null, 2)}\n`);
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({ fixturesPath, reportPath, report }, null, 2));
