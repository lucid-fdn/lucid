# Lucid

Lucid is a self-hostable AI agent operations platform for launching, supervising, and governing agent work inside real projects.

Use it to run agents with BYO model keys, memory, browser operations, plugins, channels, work queues, approvals, evidence, and observability.

## Quick Start

```bash
git clone https://github.com/lucid-fdn/lucid.git
cd lucid
./scripts/generate-env.sh
docker compose up
```

Open [http://localhost:3000](http://localhost:3000), sign up with email/password, create a project, and run your first agent.

## What Is Included

- Next.js web app and API routes
- Worker runtime for background agent execution
- Supabase/Postgres schema and Docker-first self-host setup
- Shared contracts and runtime packages
- Agent Ops workflows, approvals, evidence, and run history
- Browser Operator foundations
- BYO provider configuration
- Optional channels and integrations
- Self-host documentation and environment reference

## What Is Not Included

The public repository does not include the official Lucid desktop/mobile control apps, signing credentials, native release workflows, store metadata, cloud-only release operations, or private planning artifacts.

Official native apps are cloud-first. Self-hosted deployments use the web/PWA experience unless native source or templates are explicitly published later.

User-launched agent apps should be built through exportable manifests, web/PWA templates, embeddable widgets, and optional guided native templates rather than the official Lucid control apps.

## Architecture

Lucid separates product surfaces from execution infrastructure:

- **Projects** organize operational context.
- **Agents** perform work with tools, memory, and policies.
- **Agent Ops** provides review, QA, research, incident, canary, and audit workflows.
- **Mission Control** stores evidence, approvals, findings, receipts, and run state.
- **Runtime packages** keep execution engine concerns modular.
- **Contracts** define shared schemas used by app, worker, and integrations.

## Self-Hosting

Start with [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md).

Environment variables are documented in [docs/ENV_REFERENCE.md](docs/ENV_REFERENCE.md).

For the public documentation path, start with [docs/README.md](docs/README.md).

For contribution setup and PR expectations, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Open Source Export Model

This public repository is generated from a private source-of-truth repo through an allowlist export. The export process intentionally excludes official native apps and private release operations.

See [docs/OPEN_SOURCE_EXPORT.md](docs/OPEN_SOURCE_EXPORT.md) for the boundary and publishing model.

## License

Lucid is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
