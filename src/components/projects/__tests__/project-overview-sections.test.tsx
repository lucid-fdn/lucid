import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import {
  ProjectAgentOpsSection,
  ProjectAttentionSection,
  ProjectFirstProofSection,
  ProjectKnowledgeSection,
  ProjectMetricGrid,
  ProjectRuntimePathsSection,
  buildProjectQuickActions,
} from '@/components/projects/project-overview-sections'

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string
    children: React.ReactNode
    className?: string
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

describe('project overview sections', () => {
  it('renders metrics with reusable workspace metric cards', () => {
    const html = renderToStaticMarkup(
      <ProjectMetricGrid
        agents={2}
        activeAgents={1}
        teams={0}
        approvals={1}
        templates={3}
        reliabilityLabel="n/a"
        reliabilityDetail="1 open operator signal"
        reliabilityTrend="Not enough resolved team runs yet"
      />,
    )

    expect(html).toContain('Agents')
    expect(html).toContain('1 active and ready to run')
    expect(html).toContain('Reliability')
    expect(html).toContain('Not enough resolved team runs yet')
  })

  it('routes the first-proof action to the correct project surface', () => {
    const html = renderToStaticMarkup(
      <ProjectFirstProofSection
        proofLoop={{
          stage: 'create-work',
          title: 'Create the first unit of work',
          summary: 'Agents exist, but nothing concrete is being operated.',
          receiptLabel: 'No work receipts yet',
          nextActionTitle: 'Create one work item',
          nextActionDescription: 'Turn intent into a project work item.',
        }}
        agentBuilderHref="/agents/new"
        workHref="/work"
        inboxHref="/inbox"
        runsHref="/runs"
      />,
    )

    expect(html).toContain('First Proof')
    expect(html).toContain('href="/work?composer=open"')
    expect(html).toContain('Create one work item')
  })

  it('renders empty project knowledge with graph and maintenance context', () => {
    const html = renderToStaticMarkup(
      <ProjectKnowledgeSection pages={[]} entities={[]} findings={[]} />,
    )

    expect(html).toContain('No compiled project knowledge yet')
    expect(html).toContain('Knowledge graph')
    expect(html).toContain('No open project knowledge maintenance findings')
  })

  it('keeps action and runtime sections data-driven', () => {
    const actions = buildProjectQuickActions({
      inboxHref: '/inbox',
      agentsHref: '/agents',
      workHref: '/work',
      teamsHref: '/teams',
      runsHref: '/runs',
    })
    const agentOpsHtml = renderToStaticMarkup(
      <ProjectAgentOpsSection
        links={[
          {
            title: 'Investigate',
            href: '/investigate',
            description: 'Triage current risks with evidence.',
          },
        ]}
      />,
    )
    const runtimeHtml = renderToStaticMarkup(
      <ProjectRuntimePathsSection
        sharedRuntime={{
          title: 'Shared runtime',
          description: 'Fastest setup.',
        }}
        managedRuntime={{
          title: 'Lucid-managed runtime',
          description: 'Dedicated isolation.',
        }}
        byoRuntime={{
          title: 'Bring your own runtime',
          description: 'You run the runtime.',
        }}
        runtimeCounts={{ shared: 2, managed: 0, byo: 0 }}
        runtimePackaging={{
          primaryTitle: 'Shared runtime',
          operatorLabel: 'Operated by Lucid',
          alignmentLabel: 'Aligned on one runtime path',
          guidance: 'Runtime ownership stays clear.',
        }}
      />,
    )

    expect(actions.map((action) => action.title)).toEqual([
      'Open Inbox',
      'Open Agents',
      'Open Work',
      'Create or Edit Teams',
      'Inspect Runs',
    ])
    expect(agentOpsHtml).toContain('Investigate')
    expect(runtimeHtml).toContain('Shared runtime')
    expect(runtimeHtml).toContain('2 agents in this project')
  })

  it('computes the recommended attention move from project state', () => {
    const html = renderToStaticMarkup(
      <ProjectAttentionSection
        approvals={0}
        failedRuns={0}
        openWorkItems={0}
        assistantsCount={0}
        crewsCount={0}
      />,
    )

    expect(html).toContain(
      'Create the first agent so the project has something to run',
    )
  })
})
