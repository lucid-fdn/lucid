# How Lucid Works

Lucid is an operating layer for agent work. It helps teams create agents, assign them to projects, coordinate them in teams, connect them to channels, give them governed knowledge, and review what they did afterward.

The goal is not to make users manage every model, runtime, workflow, or memory detail by hand. Lucid gives users simple product surfaces while preserving the evidence, policy, and recovery controls needed for serious work.

## The Mental Model

Lucid is organized around a few durable objects:

| Object | What it means |
|---|---|
| Workspace | Your company or organization boundary. |
| Project | The operating arena for a goal, product, client, initiative, or workflow. |
| Agent | A deployable AI worker with identity, tools, channels, memory, and policies. |
| Team | A coordinated group of agents assigned to a project. |
| Run | A record of work performed by an agent, team, workflow, or Agent Ops action. |
| Evidence | The proof behind what happened: findings, logs, screenshots, claims, approvals, evals, Commerce events, and provenance. |
| Mission Control | The operator surface for monitoring, reviewing, approving, replaying, and improving agent work. |

This model lets Lucid support a simple single-agent setup and a more advanced multi-agent operating system without changing the core objects.

## Agents Are Workers, Projects Are Context

An agent is useful only when it understands where it is working.

Lucid keeps project context separate from agent identity:

- Agent identity describes the agent itself: role, tone, behavior, heartbeat, memory policy, access policy, tool policy, and current operating frame.
- Project context describes the work: goals, decisions, risks, signals, feedback, policy, Daily Intel, and what the team currently believes.

This separation keeps agents portable while making their work project-aware. The same agent can be assigned to different projects without mixing company policy, customer facts, or team decisions into one unreviewable prompt.

## Teams Coordinate Agent Work

A team is a project-scoped coordination unit. Teams can include agents with different responsibilities, such as research, planning, review, support, QA, operations, or execution.

Lucid uses teams to make multi-agent work legible:

- each team has a clear project context
- each member has a role
- work can be dispatched to the right specialist
- policy and runtime compatibility can be checked before work starts
- Mission Control can show who did what and why

This makes teams more than a list of bots. A team becomes a reusable operating unit for a project.

## Agent Ops Turns Work Into Repeatable Runs

Agent Ops is Lucid's workflow layer. It turns common agent tasks into clear actions:

- investigate
- plan
- review
- check a page
- research a website
- extract data
- monitor
- QA
- ship
- canary
- run a retro
- audit security posture

Each Agent Ops run produces a consistent output shape: summary, findings, evidence, risks, next actions, provenance, runtime compatibility, and team dispatch state.

That consistency matters. It means a browser QA run, a release review, a research run, and a security audit can all be inspected in Mission Control with the same basic expectations.

## Lucid Can Use Different Runtimes And Engines

Lucid is runtime-agnostic. Workflows declare what capabilities they need. Runtime selection decides which available engine or runtime can safely execute the work.

Depending on the workspace configuration and available capabilities, Lucid can work with shared runtimes, dedicated runtimes, BYO/local runtimes, Browser Operator, OpenClaw, Hermes, and future engines.

Users should not have to think in engine names for normal work. They should ask for the outcome. Lucid should route the work through the compatible runtime path and show the result, evidence, and any limitations in Mission Control.

## Knowledge Makes Agent Work Compound

Lucid Knowledge is the shared brain for a workspace. It combines:

- assistant memory
- Project Brain
- Team Brain
- workspace policy
- documents and sources
- Knowledge Claims
- evidence links
- Daily Intel
- eval receipts
- Commerce evidence

This lets a team keep useful context after an agent run ends. A finding can become a project learning. A recurring issue can become a risk. A resolved question can become a decision. A proven fact can become a Knowledge Claim with evidence.

The important rule is that Lucid does not treat every transcript as trusted memory. Shared knowledge is scoped, governed, and reviewable.

## Mission Control Is The System Of Record

Mission Control answers the operational questions that matter:

- what are agents doing
- what happened in a run
- which evidence supports the result
- what needs approval
- what failed or got blocked
- which runtime or channel was used
- what should be repeated, archived, resolved, or improved

Mission Control is also where operators review Browser Operator evidence, Agent Ops runs, Knowledge findings, Commerce events, managed packs, eval receipts, and runtime health.

## Evidence And Recovery Are First-Class

Agent work should be inspectable after the fact.

Lucid keeps evidence attached to the work:

- screenshots and browser findings
- logs and traces
- Knowledge Claims and source links
- Commerce lifecycle events
- approval decisions
- eval receipts
- managed pack changes
- routine revisions
- engine-home mutation candidates

This lets teams replay runs, restore routine definitions, supersede stale claims, resolve risks, review candidates before promotion, and recover from mistakes without losing history.

## Channels Are Entry Points, Not Separate Brains

Lucid can connect agents and Agent Ops workflows to channels such as web chat, Slack, Telegram, Discord, WhatsApp, Microsoft Teams, and iMessage.

Each channel uses its native command style, but the work routes back into the same Lucid contracts. A page check launched from Slack and a page check launched from Mission Control should produce the same kind of Agent Ops run, evidence, and report state.

This gives users continuity across channels instead of one memory and workflow model per chat app.

## Packs And Routines Make Good Work Reusable

Useful work should not stay trapped in one run.

Lucid can turn repeatable setup and operating patterns into:

- templates
- managed packs
- browser procedures
- scheduled routines
- project learnings
- policies
- Knowledge Claims

Managed packs are governed setup bundles. They can install resources, reconcile changes, preserve local edits by forking when policy requires it, and archive resources on uninstall instead of deleting history.

Scheduled routines let teams repeat useful work while keeping revision history and restore points.

## Commerce Makes Agent Work Accountable

When agents request spend, access paid resources, or participate in seller-side flows, Lucid Commerce records the lifecycle with policy, idempotency, provider, ledger, budget, seller, run, and project context.

Commerce events can become Knowledge evidence and shared operating context. This lets teams connect money movement to the project, policy, run, and decision that caused it.

## What Users Should Expect

Lucid is designed so teams can:

- start with one useful agent
- add memory and tools
- connect channels
- assign agents to projects
- coordinate agents in teams
- run repeatable Agent Ops workflows
- review evidence in Mission Control
- preserve what was learned
- govern risky actions
- improve agent work over time

As a workspace grows, Lucid should feel less like a collection of chats and more like an operating system for useful, reviewable, and compounding agent work.

## Next Steps

- Create your first agent with [Your First Agent](your-first-agent.md).
- Learn how identity and shared context work in [Agent Identity And Operating Context](../agents/operating-context.md).
- Use repeatable workflows with [Agent Ops](../agent-ops/overview.md).
- Review work and evidence in [Mission Control](../mission-control/overview.md).
- Manage shared memory with [Lucid Knowledge](../knowledge-base/lucid-knowledge.md).
