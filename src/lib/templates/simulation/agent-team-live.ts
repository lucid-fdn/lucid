import type { AgentTeamTemplateSimulationFamily, AgentTeamTemplateSimulationScenario } from './agent-team-fixtures'

export interface LiveAgentTeamSourceSnapshot {
  fetchedAt: string
  sourceStatuses: Record<string, 'live' | 'fixture_fallback' | 'failed'>
  warnings: string[]
  familyEvidence: Record<AgentTeamTemplateSimulationFamily, string[]>
  familyAnchors: Record<AgentTeamTemplateSimulationFamily, string[]>
}

export interface FetchLiveAgentTeamSourceSnapshotOptions {
  timeoutMs?: number
  allowFixtureFallback?: boolean
}

interface GithubRepoSnapshot {
  source: 'github'
  fullName: string
  stars: number | null
  openIssues: number | null
  pushedAt: string | null
}

interface GithubIssueSnapshot {
  source: 'github_issues'
  repo: string
  title: string
  number: number
}

interface HackerNewsSnapshot {
  source: 'hackernews'
  title: string
  url: string | null
  points: number | null
}

interface NpmDownloadsSnapshot {
  source: 'npm'
  packageName: string
  downloads: number | null
  period: string
}

interface StatusSnapshot {
  source: 'github_status'
  indicator: string
  description: string
}

const GITHUB_REPO_URL = 'https://api.github.com/repos/vercel/next.js'
const GITHUB_ISSUES_URL = 'https://api.github.com/repos/vercel/next.js/issues?state=open&per_page=3'
const HN_FRONT_PAGE_URL = 'https://hn.algolia.com/api/v1/search?tags=front_page'
const NPM_DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point/last-week/next'
const GITHUB_STATUS_URL = 'https://www.githubstatus.com/api/v2/status.json'

export async function fetchLiveAgentTeamSourceSnapshot(
  options: FetchLiveAgentTeamSourceSnapshotOptions = {},
): Promise<LiveAgentTeamSourceSnapshot> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const warnings: string[] = []
  const sourceStatuses: LiveAgentTeamSourceSnapshot['sourceStatuses'] = {}

  const [repo, issues, hackerNews, npmDownloads, status] = await Promise.all([
    fetchGithubRepo(timeoutMs).catch((error: unknown) => {
      sourceStatuses.github = options.allowFixtureFallback ? 'fixture_fallback' : 'failed'
      warnings.push(`github_repo failed: ${formatError(error)}`)
      return options.allowFixtureFallback ? fixtureRepo() : null
    }),
    fetchGithubIssues(timeoutMs).catch((error: unknown) => {
      sourceStatuses.github_issues = options.allowFixtureFallback ? 'fixture_fallback' : 'failed'
      warnings.push(`github_issues failed: ${formatError(error)}`)
      return options.allowFixtureFallback ? fixtureIssues() : []
    }),
    fetchHackerNews(timeoutMs).catch((error: unknown) => {
      sourceStatuses.hackernews = options.allowFixtureFallback ? 'fixture_fallback' : 'failed'
      warnings.push(`hackernews failed: ${formatError(error)}`)
      return options.allowFixtureFallback ? fixtureHackerNews() : null
    }),
    fetchNpmDownloads(timeoutMs).catch((error: unknown) => {
      sourceStatuses.npm = options.allowFixtureFallback ? 'fixture_fallback' : 'failed'
      warnings.push(`npm_downloads failed: ${formatError(error)}`)
      return options.allowFixtureFallback ? fixtureNpmDownloads() : null
    }),
    fetchGithubStatus(timeoutMs).catch((error: unknown) => {
      sourceStatuses.github_status = options.allowFixtureFallback ? 'fixture_fallback' : 'failed'
      warnings.push(`github_status failed: ${formatError(error)}`)
      return options.allowFixtureFallback ? fixtureStatus() : null
    }),
  ])

  if (repo && !sourceStatuses.github) sourceStatuses.github = 'live'
  if (issues.length > 0 && !sourceStatuses.github_issues) sourceStatuses.github_issues = 'live'
  if (hackerNews && !sourceStatuses.hackernews) sourceStatuses.hackernews = 'live'
  if (npmDownloads && !sourceStatuses.npm) sourceStatuses.npm = 'live'
  if (status && !sourceStatuses.github_status) sourceStatuses.github_status = 'live'

  const liveSourceCount = Object.values(sourceStatuses).filter((value) => value === 'live').length
  if (liveSourceCount === 0 && !options.allowFixtureFallback) {
    throw new Error(`No live agent/team template sources were reachable: ${warnings.join('; ')}`)
  }

  return buildSnapshot({
    fetchedAt: new Date().toISOString(),
    repo,
    issues,
    hackerNews,
    npmDownloads,
    status,
    sourceStatuses,
    warnings,
  })
}

export function buildLiveAgentTeamScenario(input: {
  scenario: AgentTeamTemplateSimulationScenario
  snapshot: LiveAgentTeamSourceSnapshot
}): AgentTeamTemplateSimulationScenario {
  const familyEvidence = input.snapshot.familyEvidence[input.scenario.family] ?? []
  const familyAnchors = input.snapshot.familyAnchors[input.scenario.family] ?? []
  const liveStatuses = Object.entries(input.snapshot.sourceStatuses)
    .map(([source, status]) => `${source}:${status}`)

  return {
    ...input.scenario,
    id: `${input.scenario.id}-live`,
    prompt: `${input.scenario.prompt} Use the supplied live evidence anchors; do not invent unavailable source details.`,
    evidence: [
      ...input.scenario.evidence,
      `Live snapshot fetched at ${input.snapshot.fetchedAt}. Source statuses: ${liveStatuses.join(', ')}.`,
      ...familyEvidence,
    ],
    expectedTerms: Array.from(new Set([
      ...input.scenario.expectedTerms,
      ...familyAnchors,
    ])),
    liveEvidenceAnchors: familyAnchors,
  }
}

function buildSnapshot(input: {
  fetchedAt: string
  repo: GithubRepoSnapshot | null
  issues: GithubIssueSnapshot[]
  hackerNews: HackerNewsSnapshot | null
  npmDownloads: NpmDownloadsSnapshot | null
  status: StatusSnapshot | null
  sourceStatuses: LiveAgentTeamSourceSnapshot['sourceStatuses']
  warnings: string[]
}): LiveAgentTeamSourceSnapshot {
  const repoEvidence = input.repo
    ? `Live GitHub repo signal: ${input.repo.fullName} has ${input.repo.stars ?? 'unknown'} stars, ${input.repo.openIssues ?? 'unknown'} open issues, pushed at ${input.repo.pushedAt ?? 'unknown'}.`
    : 'Live GitHub repo signal unavailable.'
  const issueEvidence = input.issues.length > 0
    ? `Live GitHub issue signal: #${input.issues[0].number} "${input.issues[0].title}" is open in ${input.issues[0].repo}.`
    : 'Live GitHub issue signal unavailable.'
  const hnEvidence = input.hackerNews
    ? `Live Hacker News signal: "${input.hackerNews.title}" has ${input.hackerNews.points ?? 'unknown'} points.`
    : 'Live Hacker News signal unavailable.'
  const npmEvidence = input.npmDownloads
    ? `Live npm demand signal: ${input.npmDownloads.packageName} had ${input.npmDownloads.downloads ?? 'unknown'} downloads during ${input.npmDownloads.period}.`
    : 'Live npm demand signal unavailable.'
  const statusEvidence = input.status
    ? `Live platform status signal: GitHub status is ${input.status.indicator} - ${input.status.description}.`
    : 'Live platform status signal unavailable.'

  const repoAnchors = input.repo ? [input.repo.fullName, String(input.repo.openIssues ?? ''), String(input.repo.stars ?? '')] : []
  const issueAnchors = input.issues[0] ? [`#${input.issues[0].number}`, input.issues[0].title.split(/\s+/).slice(0, 4).join(' ')] : []
  const hnAnchors = input.hackerNews ? ['Hacker News', input.hackerNews.title.split(/\s+/).slice(0, 4).join(' ')] : []
  const npmAnchors = input.npmDownloads ? ['npm', input.npmDownloads.packageName, String(input.npmDownloads.downloads ?? '')] : []
  const statusAnchors = input.status ? ['GitHub status', input.status.indicator] : []

  return {
    fetchedAt: input.fetchedAt,
    sourceStatuses: input.sourceStatuses,
    warnings: input.warnings,
    familyEvidence: {
      sales_prospecting: [repoEvidence, hnEvidence],
      support_success: [issueEvidence, statusEvidence],
      marketing_content_social: [hnEvidence, npmEvidence],
      executive_ops_legal: [statusEvidence, repoEvidence, npmEvidence],
      personal_productivity: [statusEvidence, hnEvidence],
    },
    familyAnchors: {
      sales_prospecting: cleanAnchors([...repoAnchors.slice(0, 2), ...hnAnchors.slice(0, 1)]),
      support_success: cleanAnchors([...issueAnchors, ...statusAnchors]),
      marketing_content_social: cleanAnchors([...hnAnchors, ...npmAnchors.slice(0, 2)]),
      executive_ops_legal: cleanAnchors([...statusAnchors, ...repoAnchors.slice(0, 2)]),
      personal_productivity: cleanAnchors([...statusAnchors, ...hnAnchors.slice(0, 2)]),
    },
  }
}

async function fetchGithubRepo(timeoutMs: number): Promise<GithubRepoSnapshot> {
  const response = await fetchJsonWithTimeout<GithubRepoResponse>(GITHUB_REPO_URL, timeoutMs)
  return {
    source: 'github',
    fullName: response.full_name,
    stars: numberOrNull(response.stargazers_count),
    openIssues: numberOrNull(response.open_issues_count),
    pushedAt: typeof response.pushed_at === 'string' ? response.pushed_at : null,
  }
}

async function fetchGithubIssues(timeoutMs: number): Promise<GithubIssueSnapshot[]> {
  const response = await fetchJsonWithTimeout<GithubIssueResponse[]>(GITHUB_ISSUES_URL, timeoutMs)
  const issues: GithubIssueSnapshot[] = []
  for (const issue of response) {
    if (typeof issue.title !== 'string' || typeof issue.number !== 'number') continue
    issues.push({
      source: 'github_issues',
      repo: 'vercel/next.js',
      title: issue.title,
      number: issue.number,
    })
    if (issues.length >= 3) break
  }
  return issues
}

async function fetchHackerNews(timeoutMs: number): Promise<HackerNewsSnapshot> {
  const response = await fetchJsonWithTimeout<HackerNewsResponse>(HN_FRONT_PAGE_URL, timeoutMs)
  const hit = response.hits.find((item) => item.title)
  if (!hit?.title) throw new Error('missing Hacker News front-page hit')
  return {
    source: 'hackernews',
    title: hit.title,
    url: typeof hit.url === 'string' ? hit.url : null,
    points: numberOrNull(hit.points),
  }
}

async function fetchNpmDownloads(timeoutMs: number): Promise<NpmDownloadsSnapshot> {
  const response = await fetchJsonWithTimeout<NpmDownloadsResponse>(NPM_DOWNLOADS_URL, timeoutMs)
  return {
    source: 'npm',
    packageName: response.package,
    downloads: numberOrNull(response.downloads),
    period: `${response.start}:${response.end}`,
  }
}

async function fetchGithubStatus(timeoutMs: number): Promise<StatusSnapshot> {
  const response = await fetchJsonWithTimeout<GithubStatusResponse>(GITHUB_STATUS_URL, timeoutMs)
  return {
    source: 'github_status',
    indicator: response.status.indicator,
    description: response.status.description,
  }
}

async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'LucidAgentTeamTemplateSimulation/1.0',
        accept: 'application/json',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json() as T
  } finally {
    clearTimeout(timeout)
  }
}

function cleanAnchors(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, 5)
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function fixtureRepo(): GithubRepoSnapshot {
  return { source: 'github', fullName: 'fixture/lucid-reference', stars: 4242, openIssues: 17, pushedAt: '2026-05-01T00:00:00Z' }
}

function fixtureIssues(): GithubIssueSnapshot[] {
  return [{ source: 'github_issues', repo: 'fixture/lucid-reference', title: 'Checkout flow intermittently times out', number: 1729 }]
}

function fixtureHackerNews(): HackerNewsSnapshot {
  return { source: 'hackernews', title: 'AI agents move from demos to operator workflows', url: null, points: 321 }
}

function fixtureNpmDownloads(): NpmDownloadsSnapshot {
  return { source: 'npm', packageName: 'next', downloads: 4_200_000, period: 'fixture-week' }
}

function fixtureStatus(): StatusSnapshot {
  return { source: 'github_status', indicator: 'none', description: 'All Systems Operational' }
}

interface GithubRepoResponse {
  full_name: string
  stargazers_count?: number
  open_issues_count?: number
  pushed_at?: string
}

interface GithubIssueResponse {
  number?: number
  title?: string
}

interface HackerNewsResponse {
  hits: Array<{
    title?: string
    url?: string | null
    points?: number
  }>
}

interface NpmDownloadsResponse {
  downloads?: number
  package: string
  start: string
  end: string
}

interface GithubStatusResponse {
  status: {
    indicator: string
    description: string
  }
}
