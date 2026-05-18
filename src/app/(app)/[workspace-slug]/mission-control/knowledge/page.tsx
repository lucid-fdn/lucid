import { AlertTriangle, BookOpen, Brain, Database, Fingerprint, GitBranch, PackageCheck, Plug, Scale, ShieldCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MissionControlSectionShell } from '@/components/mission-control/mission-control-section-shell'
import { requireUserId } from '@/lib/auth/server-utils'
import { getWorkspaceWithAccess } from '@/lib/workspace'
import {
  findKnowledgeEntities,
  getBoardMemories,
  listKnowledgeMaintenanceEvents,
  listKnowledgeEngineHomeProjectionCandidates,
  listKnowledgeL2Receipts,
  listKnowledgePages,
  listKnowledgeSources,
  listExternalKnowledgeClients,
  listKnowledgeClaims,
  listKnowledgeImportJobs,
} from '@/lib/db'
import {
  buildKnowledgeBenchmarkSuite,
  buildKnowledgeContinuityMatrix,
  getMemoryCorrectionActions,
} from '@/lib/knowledge/memory-moat'
import { buildKnowledgeEntityScorecardFromClaims } from '@/lib/knowledge/intelligence/scorecard'
import { KnowledgeGraphExplorer } from './knowledge-graph-explorer'
import { KnowledgeOpsClient } from './knowledge-ops-client'

function formatLabel(value: string | null | undefined, fallback = 'Unknown') {
  const normalized = value?.trim()
  return normalized ? normalized.replace(/_/g, ' ') : fallback
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatShortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : 'n/a'
}

export default async function MissionControlKnowledgePage({
  params,
}: {
  params: Promise<{ 'workspace-slug': string }>
}) {
  const userId = await requireUserId()
  const { 'workspace-slug': workspaceSlug } = await params
  const workspace = await getWorkspaceWithAccess(workspaceSlug, userId)
  if (!workspace) return null

  const [
    projectPages,
    teamPages,
    orgMemories,
    sources,
    entities,
    maintenanceEvents,
    l2Receipts,
    engineHomeCandidates,
    claims,
    importJobs,
    externalClients,
  ] = await Promise.all([
    listKnowledgePages({ orgId: workspace.id, scopeType: 'project', limit: 12 }),
    listKnowledgePages({ orgId: workspace.id, scopeType: 'team', limit: 12 }),
    getBoardMemories(workspace.id, { limit: 12 }),
    listKnowledgeSources({ orgId: workspace.id, includeArchived: false, limit: 20 }),
    findKnowledgeEntities({ orgId: workspace.id, limit: 24 }),
    listKnowledgeMaintenanceEvents({ orgId: workspace.id, status: 'open', limit: 20 }),
    listKnowledgeL2Receipts({ orgId: workspace.id, limit: 12 }),
    listKnowledgeEngineHomeProjectionCandidates({ orgId: workspace.id, status: 'candidate', limit: 12 }),
    listKnowledgeClaims({ orgId: workspace.id, status: 'active', limit: 12 }),
    listKnowledgeImportJobs({ orgId: workspace.id, limit: 8 }),
    listExternalKnowledgeClients({ orgId: workspace.id, status: 'active', limit: 8 }),
  ])

  const criticalFindings = maintenanceEvents.filter((event) => event.severity === 'critical').length
  const staleSources = sources.filter((source) => source.status === 'stale' || source.refreshStatus === 'failed').length
  const retrievalSources = sources.filter((source) => source.includeInRetrieval).length
  const scopedPages = [...projectPages, ...teamPages]
  const citedPages = scopedPages.filter((page) => page.evidence.length > 0).length
  const citationCoverage = scopedPages.length === 0 ? 1 : citedPages / scopedPages.length
  const continuityMatrix = buildKnowledgeContinuityMatrix()
  const benchmarkSuite = buildKnowledgeBenchmarkSuite()
  const correctionActions = getMemoryCorrectionActions({ layer: 'project_brain', trustLevel: 'observed', hasL2Proof: l2Receipts.length > 0 })
  const sourceDoctorFindings = maintenanceEvents.filter((event) =>
    `${event.eventType} ${event.title} ${event.summary}`.toLowerCase().includes('source')
    || `${event.eventType} ${event.title} ${event.summary}`.toLowerCase().includes('refresh'),
  )
  const embeddingDoctorFindings = maintenanceEvents.filter((event) =>
    `${event.eventType} ${event.title} ${event.summary}`.toLowerCase().includes('embedding')
    || `${event.eventType} ${event.title} ${event.summary}`.toLowerCase().includes('retrieval')
    || `${event.eventType} ${event.title} ${event.summary}`.toLowerCase().includes('vector'),
  )
  const driftFindings = maintenanceEvents.filter((event) =>
    `${event.eventType} ${event.title} ${event.summary}`.toLowerCase().includes('drift')
    || event.severity === 'critical',
  )
  const claimConflictFindings = maintenanceEvents.filter((event) => event.eventType === 'claim_conflict')
  const claimSemanticIndexFindings = maintenanceEvents.filter((event) =>
    event.eventType === 'vector_index_degraded' && event.claimId,
  )
  const scorecardSubject = claims.find((claim) => claim.claimMetric || claim.evidence.length > 0)?.subject ?? claims[0]?.subject ?? null
  const scorecard = scorecardSubject
    ? buildKnowledgeEntityScorecardFromClaims({
      orgId: workspace.id,
      subject: scorecardSubject,
      profile: 'founder',
      claims: claims.filter((claim) => claim.subject === scorecardSubject),
    })
    : null

  return (
    <MissionControlSectionShell
      title="Knowledge"
      description="Maintain sources, facts, claims, graph context, and proof-ready evidence."
      orgId={workspace.id}
      workspaceSlug={workspaceSlug}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-4 w-4 text-primary" />
                  Scoped Truth
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{scopedPages.length}</p>
                <p className="text-xs text-muted-foreground">
                  {projectPages.length} project - {teamPages.length} team pages
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4 text-primary" />
                  Sources
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{retrievalSources}/{sources.length}</p>
                <p className="text-xs text-muted-foreground">{staleSources} stale or failed refresh signals</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <GitBranch className="h-4 w-4 text-primary" />
                  Knowledge Graph
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{entities.length}</p>
                <p className="text-xs text-muted-foreground">active entities available for graph-aware retrieval</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Scale className="h-4 w-4 text-primary" />
                  Claims
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{claims.length}</p>
                <p className="text-xs text-muted-foreground">
                  {claimConflictFindings.length} conflict{claimConflictFindings.length === 1 ? '' : 's'} - {claimSemanticIndexFindings.length} index finding{claimSemanticIndexFindings.length === 1 ? '' : 's'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Brain Ops
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{maintenanceEvents.length}</p>
                <p className="text-xs text-muted-foreground">{criticalFindings} critical findings need review</p>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
            <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Scale className="h-4 w-4 text-primary" />
                  Entity Scorecard
                </CardTitle>
                <CardDescription>
                  Founder-grade scoring from typed claims, evidence depth, freshness, consistency, and metric trajectory.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scorecard ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{scorecard.profile} profile</p>
                      <p className="mt-1 text-xl font-semibold text-foreground">{scorecard.subject}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl border bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">Score</p>
                        <p className="mt-1 text-2xl font-semibold text-foreground">
                          {scorecard.overallScore === null ? 'n/a' : formatPercent(scorecard.overallScore)}
                        </p>
                      </div>
                      <div className="rounded-xl border bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">Confidence</p>
                        <p className="mt-1 text-2xl font-semibold text-foreground">{formatPercent(scorecard.confidence)}</p>
                      </div>
                      <div className="rounded-xl border bg-background/70 p-3">
                        <p className="text-xs text-muted-foreground">Evidence</p>
                        <p className="mt-1 text-2xl font-semibold text-foreground">{scorecard.provenance.evidenceCount}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{scorecard.recommendations[0]}</p>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    Add claims with evidence or metrics to unlock an entity scorecard.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Trajectory Signals</CardTitle>
                <CardDescription>
                  Typed claim metrics become trend lines and regression alerts, not just plain text memories.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {scorecard?.signals.slice(0, 5).map((signal) => (
                  <div key={signal.id} className="rounded-xl border bg-background/70 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">{signal.label}</p>
                      <Badge variant={signal.status === 'weak' ? 'destructive' : 'secondary'}>{signal.status}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{signal.summary}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Signal score: {formatPercent(signal.score)}</p>
                  </div>
                )) ?? (
                  <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                    No scorecard signals yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Brain className="h-4 w-4 text-primary" />
                  Knowledge Think
                </CardTitle>
                <CardDescription>
                  Verified facts, claims, and evidence available for reasoning.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{claims.length + scopedPages.length}</p>
                <p className="text-xs text-muted-foreground">
                  {claims.length} claims - {scopedPages.length} scoped pages
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Database className="h-4 w-4 text-primary" />
                  Source Doctor
                </CardTitle>
                <CardDescription>
                  Sources that need refresh or review.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{sourceDoctorFindings.length + staleSources}</p>
                <p className="text-xs text-muted-foreground">{staleSources} stale or failed - {retrievalSources} enabled</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Fingerprint className="h-4 w-4 text-primary" />
                  Embedding Doctor
                </CardTitle>
                <CardDescription>
                  Retrieval quality and indexing signals.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{embeddingDoctorFindings.length}</p>
                <p className="text-xs text-muted-foreground">{formatPercent(citationCoverage)} citation coverage</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Drift Findings
                </CardTitle>
                <CardDescription>
                  Open findings that need review.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold text-foreground">{driftFindings.length + engineHomeCandidates.length}</p>
                <p className="text-xs text-muted-foreground">{engineHomeCandidates.length} memory candidates awaiting review</p>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Why Lucid Knows This
                </CardTitle>
                <CardDescription>
                  Project and team facts are versioned with sources, trust levels, citations, and correction history.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {scopedPages.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4">
                    <p className="text-sm font-medium text-foreground">No compiled project or team knowledge yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Run Agent Ops, refresh Team Knowledge, or use the controls below to promote operator-approved facts.
                    </p>
                  </div>
                ) : (
                  scopedPages.slice(0, 8).map((page) => (
                    <div key={page.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{page.scopeType === 'project' ? 'Project brain' : 'Team brain'}</Badge>
                            <Badge variant="outline">v{page.version}</Badge>
                            <Badge variant="outline">{formatLabel(page.trustLevel)}</Badge>
                            <Badge variant="outline">{formatPercent(page.confidence)} confidence</Badge>
                          </div>
                          <p className="mt-3 text-sm font-medium text-foreground">{page.subject}</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {page.evidence.length} evidence link{page.evidence.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{page.compiledTruth}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {page.evidence.slice(0, 4).map((evidence, index) => (
                          <Badge key={`${page.id}-${index}`} variant="secondary">
                            {formatLabel(evidence.kind)}{evidence.label ? `: ${evidence.label}` : ''}
                          </Badge>
                        ))}
                        {page.evidence.length === 0 ? (
                          <Badge variant="outline">Evidence pending</Badge>
                        ) : null}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  Knowledge Types
                </CardTitle>
                <CardDescription>
                  The labels operators see when reviewing and reusing knowledge.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    'Assistant memory',
                    'Team brain',
                    'Project brain',
                    'Org policy',
                    'Document',
                    'Evidence',
                    'Engine memory',
                    'Evaluation memory',
                    'Proof receipt',
                  ].map((label) => (
                    <div key={label} className="rounded-lg border p-3">
                      <p className="text-sm font-medium text-foreground">{label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {label === 'Proof receipt'
                          ? 'Evidence that can be verified when a run or memory item needs a receipt.'
                          : label === 'Engine memory'
                            ? 'Memory and skill candidates waiting for review.'
                            : label === 'Evaluation memory'
                              ? 'Evaluation state kept for review and export.'
                          : 'Available to prompt packets when policy, scope, and budget allow it.'}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border bg-muted/25 p-4">
                  <p className="text-sm font-medium text-foreground">Access contract</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Agents receive the same scoped knowledge packet across channels, runtimes, and local clients.
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                  Knowledge Quality
                </CardTitle>
                <CardDescription>
                  Quality checks track citations, freshness, correction actions, continuity, and benchmark coverage.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-foreground">Citation coverage</p>
                  <p className="mt-2 text-2xl font-semibold">{formatPercent(citationCoverage)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{citedPages}/{scopedPages.length} scoped facts have evidence</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-foreground">Continuity matrix</p>
                  <p className="mt-2 text-2xl font-semibold">
                    {Object.keys(continuityMatrix.channels).length}/{Object.keys(continuityMatrix.runtimes).length}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">channels and runtimes use the shared Knowledge API contract</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-foreground">Correction actions</p>
                  <p className="mt-2 text-2xl font-semibold">{correctionActions.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{correctionActions.map((action) => action.replace(/_/g, ' ')).join(', ')}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm font-medium text-foreground">Benchmarks</p>
                  <p className="mt-2 text-2xl font-semibold">{benchmarkSuite.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">recall, evidence, correction, continuity, and latency assertions</p>
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Scale className="h-5 w-5 text-primary" />
                  Claim Board
                </CardTitle>
                <CardDescription>
                  Track beliefs separately from verified facts so agents can reason without flattening uncertainty.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {claimConflictFindings.length > 0 ? (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="border-amber-500/40 text-amber-200">
                        Semantic conflict review
                      </Badge>
                      <Badge variant="outline">{claimConflictFindings.length} open</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {claimConflictFindings.slice(0, 3).map((event) => {
                        const conflictingIds = Array.isArray(event.metadata.conflictingClaimIds)
                          ? event.metadata.conflictingClaimIds.filter((id): id is string => typeof id === 'string')
                          : []
                        return (
                          <div key={event.id} className="rounded-md border border-amber-500/20 bg-background/50 p-2">
                            <p className="text-xs font-medium text-foreground">{event.title}</p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{event.summary}</p>
                            <p className="mt-1 font-mono text-[10px] text-amber-200">
                              anchor {formatShortId(event.claimId)} - conflicts {conflictingIds.map(formatShortId).join(', ') || 'n/a'}
                            </p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
                {claims.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No active Knowledge claims yet. Use Knowledge Think or the claims API to capture hunches, decisions, risks, and preferences with evidence.
                  </div>
                ) : claims.slice(0, 5).map((claim) => (
                  <div key={claim.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{formatLabel(claim.claimType)}</Badge>
                      <Badge variant="outline">{formatPercent(claim.confidence)} confidence</Badge>
                      <Badge variant="outline">{formatLabel(claim.holderType)}</Badge>
                      <Badge variant={claim.embeddingStatus === 'ready' ? 'secondary' : 'outline'}>
                        semantic {formatLabel(claim.embeddingStatus)}
                      </Badge>
                      {claim.semanticClusterKey ? (
                        <Badge variant="outline">cluster {formatShortId(claim.semanticClusterKey)}</Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-sm font-medium text-foreground">{claim.subject}</p>
                    <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{claim.claim}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PackageCheck className="h-5 w-5 text-primary" />
                  Imports
                </CardTitle>
                <CardDescription>
                  Bring in transcripts, browser artifacts, repo docs, meeting notes, and coding-agent sessions through previewable jobs.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {importJobs.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No import jobs yet. Start with preview mode so secrets can be redacted before commit.
                  </div>
                ) : importJobs.map((job) => (
                  <div key={job.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{formatLabel(job.sourceType)}</Badge>
                      <Badge variant={job.status === 'failed' ? 'destructive' : 'outline'}>{formatLabel(job.status)}</Badge>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {job.itemCount} item{job.itemCount === 1 ? '' : 's'} - {job.redactionCount} redaction{job.redactionCount === 1 ? '' : 's'}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plug className="h-5 w-5 text-primary" />
                  Knowledge Clients
                </CardTitle>
                <CardDescription>
                  Scoped clients let local agents and external runtimes read or write knowledge without broad database access.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {externalClients.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                    No active external clients. Create a scoped client token when a local agent needs Knowledge access.
                  </div>
                ) : externalClients.map((client) => (
                  <div key={client.id} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{client.name}</Badge>
                      <Badge variant="outline">{client.scopes.length} scope{client.scopes.length === 1 ? '' : 's'}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {client.scopes.join(', ')}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <KnowledgeGraphExplorer
              orgId={workspace.id}
              entities={entities.map((entity) => ({
                id: entity.id,
                canonicalName: entity.canonicalName,
                type: entity.type,
                status: entity.status,
                confidence: entity.confidence,
                description: entity.description,
              }))}
            />

            <KnowledgeOpsClient
              orgId={workspace.id}
              boardMemories={orgMemories.map((memory) => ({
                id: memory.id,
                content: memory.content,
                category: memory.category,
                importance: memory.importance,
                source: memory.source,
              }))}
              sources={sources.map((source) => ({
                id: source.id,
                label: source.label,
                type: source.type,
                status: source.status,
                visibility: source.visibility,
                trustLevel: source.trustLevel,
                federationPolicy: source.federationPolicy,
                retentionPolicy: source.retentionPolicy,
                includeInRetrieval: source.includeInRetrieval,
                refreshStatus: source.refreshStatus,
              }))}
              maintenanceEvents={maintenanceEvents.map((event) => ({
                id: event.id,
                eventType: event.eventType,
                claimId: event.claimId,
                title: event.title,
                summary: event.summary,
                severity: event.severity,
                status: event.status,
                metadata: event.metadata,
              }))}
              engineHomeCandidates={engineHomeCandidates.map((candidate) => ({
                id: candidate.id,
                engine: candidate.engine,
                homeKind: candidate.homeKind,
                homeAuthority: candidate.homeAuthority,
                resourceType: candidate.resourceType,
                projectionPolicy: candidate.projectionPolicy,
                status: candidate.status,
                path: candidate.path,
                summary: candidate.summary,
              }))}
              externalClients={externalClients.map((client) => ({
                id: client.id,
                name: client.name,
                scopes: client.scopes,
                projectId: client.projectId,
                teamId: client.teamId,
                expiresAt: client.expiresAt,
                lastUsedAt: client.lastUsedAt,
              }))}
            />
          </section>

          <section>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Fingerprint className="h-5 w-5 text-primary" />
                  Proof Receipts
                </CardTitle>
                <CardDescription>
                  Receipts make sensitive memory and evidence changes inspectable without exposing raw content.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {l2Receipts.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4">
                    <p className="text-sm font-medium text-foreground">No proof receipts yet</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Proof receipts will appear here after eligible memory or evidence changes are recorded.
                    </p>
                  </div>
                ) : (
                  l2Receipts.map((receipt) => (
                    <div key={receipt.id} className="rounded-lg border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline">{formatLabel(receipt.localResourceType)}</Badge>
                            <Badge variant={receipt.anchorStatus === 'verified' ? 'secondary' : 'outline'}>
                              anchor {receipt.anchorStatus}
                            </Badge>
                            <Badge variant={receipt.verificationStatus === 'verified' ? 'secondary' : 'outline'}>
                              receipt {receipt.verificationStatus}
                            </Badge>
                          </div>
                          <p className="mt-3 text-sm font-medium text-foreground">
                            {receipt.namespace}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            content {receipt.contentHash.slice(0, 16)} - receipt {receipt.receiptHash.slice(0, 16)}
                          </p>
                        </div>
                        <div className="text-right text-[11px] text-muted-foreground">
                          <p>{receipt.snapshotCid ? `snapshot ${receipt.snapshotCid.slice(0, 20)}` : 'snapshot pending'}</p>
                          <p>{receipt.anchorEpochId ? `epoch ${receipt.anchorEpochId}` : 'epoch pending'}</p>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </MissionControlSectionShell>
  )
}
