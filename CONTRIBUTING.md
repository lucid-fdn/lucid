# Contributing to Lucid

Thanks for your interest in contributing to Lucid. This guide covers everything you need to get started.

## Getting Started

### Prerequisites

- Node.js 20+
- Docker 24+ and Docker Compose v2
- Git

### Setup

```bash
# Fork and clone the repo
git clone https://github.com/<your-username>/lucid.git
cd lucid

# Install dependencies
npm install --legacy-peer-deps

# Generate environment variables
./scripts/generate-env.sh

# Start the development server
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

### Running the Full Stack (Docker)

```bash
docker compose up
```

This starts PostgreSQL, PostgREST, GoTrue, Redis, the Next.js web app, and the worker.

## Development Workflow

### Branch Naming

Use descriptive branch names with a prefix:

- `feat/short-description` — new features
- `fix/short-description` — bug fixes
- `refactor/short-description` — code improvements
- `docs/short-description` — documentation changes
- `test/short-description` — test additions or fixes

### Commit Style

Write clear, concise commit messages. Use present tense ("Add feature" not "Added feature"). Keep the first line under 72 characters.

```
Add wallet balance caching with 30s TTL

Reduces redundant RPC calls for repeated balance queries.
Cache uses LRU eviction with max 100 entries per tool.
```

## Code Standards

### TypeScript

- Strict mode. No `any` unless absolutely necessary.
- Use existing patterns in the codebase. Consistency over novelty.
- Files: `kebab-case.tsx`. Components: `PascalCase`. DB columns: `snake_case`.

### Architecture

- **Server-first**: Default to Server Components. Use `'use client'` only when needed.
- **DB access**: Always through `src/lib/db/`. Never use `supabase.from()` directly.
- **Auth**: Use `getServerSession()` from `src/lib/auth/session.ts`.
- **Imports**: Use `@contracts/` for shared types from `contracts/`.

Check `src/components/ui/` for existing shadcn primitives before creating new ones. See the full inventory in `CLAUDE.md`.

### Linting and Formatting

```bash
npm run lint
```

Prettier is configured with single quotes, no semicolons, and Tailwind class sorting.

### Testing

All changes must include tests. Run the test suite before submitting:

```bash
# Frontend tests
npm run test

# Type checking
npm run typecheck

# Worker tests (if you changed worker code)
cd worker && npx vitest run
```

## Pull Request Process

1. Create a branch from `develop` (not `main`).
2. Make your changes with tests.
3. Run `npm run typecheck` and `npm run test` locally.
4. Push your branch and open a PR against `develop`.
5. Fill out the PR template with a summary, change list, and testing notes.
6. Wait for CI to pass and a maintainer to review.

### Review Expectations

- PRs are typically reviewed within 48 hours.
- Small, focused PRs are reviewed faster than large ones.
- If CI fails, fix it before requesting review.
- Respond to review feedback promptly.

## Architecture Overview

Lucid is a Next.js 15 application with a separate Node.js worker for agent processing.

```
src/                    # Next.js app (UI + API routes)
  app/                  # Route groups: (marketing), (app), (launchpad)
  lib/                  # Business logic: db/, auth/, ai/, cache/
  components/           # React components: ui/, shared/, panels/
  hooks/                # Custom hooks
contracts/              # Shared types between app and worker
worker/                 # Agent processor (Express + polling loops)
  src/agent/            # Agent runtime, tool surface, plugins
  src/skills/           # Domain skill bundles (polymarket, etc.)
  src/memory/           # Memory pipeline
migrations/             # SQL migrations
docker/                 # Docker support files
docs/                   # Design docs and guides
```

For detailed architecture documentation, see `docs/` and the `CLAUDE.md` file at the repo root.

## Issue Reporting

### Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template. Include:

- Steps to reproduce
- Expected vs actual behavior
- Environment details (self-hosted or cloud, Docker version, OS)
- Relevant logs

### Feature Requests

Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template. Describe:

- The problem you want solved
- Your proposed solution
- Alternatives you considered

## Self-Hosted Issues

If you hit issues with the Docker deployment, run the diagnostic script first:

```bash
npm run selfhost:doctor
```

This checks environment variables, database connectivity, service health, and configuration alignment.

## License

By contributing, you agree that your contributions will be licensed under the project's AGPL-3.0 license. See [LICENSING.md](LICENSING.md) for details.
