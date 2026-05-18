#!/usr/bin/env python3
"""Create PROJECT_MAP.md for the docs repo."""
import os

content = """# PROJECT MAP — LucidLayer Documentation (`raijinlabs/docs`)

## High-Level Architecture

```
raijinlabs/docs
├── docs.json                    # Mintlify config (nav, theme, colors, OpenAPI)
├── index.mdx                    # Landing page
├── quickstart.mdx               # Getting started guide
├── authentication.mdx           # Auth setup
├── sdk-installation.mdx         # SDK install instructions
├── architecture.mdx             # Platform architecture overview
├── glossary.mdx                 # Terms & definitions
├── contributing.mdx             # Contribution guide
├── support.mdx                  # Support & contact
│
├── concepts/                    # Core concept pages
│   ├── passports.mdx            # Verifiable identity
│   ├── inference.mdx            # AI inference pipeline
│   ├── receipts.mdx             # Proof of inference
│   ├── epochs.mdx               # Time-based verification
│   ├── agents.mdx               # AI agent framework
│   ├── mmr.mdx                  # Merkle Mountain Range
│   ├── solana-programs.mdx      # On-chain programs
│   └── session-signer.mdx       # Session signing
│
├── guides/                      # Tutorial pages (3 tiers)
│   ├── first-inference.mdx      # Beginner: first API call
│   ├── passport-management.mdx  # Beginner: managing passports
│   ├── error-handling.mdx       # Beginner: error handling
│   ├── verifiable-receipts.mdx  # Intermediate: receipt verification
│   ├── streaming.mdx            # Intermediate: streaming responses
│   ├── compute-providers.mdx    # Advanced: custom providers
│   ├── n8n-integration.mdx      # Advanced: n8n workflows
│   ├── crewai-integration.mdx   # Advanced: CrewAI
│   └── ...                      # More guides
│
├── api-reference/               # API documentation
│   ├── introduction.mdx         # API overview
│   ├── errors.mdx               # Error codes
│   ├── rate-limits.mdx          # Rate limiting
│   └── (auto-generated)         # OpenAPI endpoints
│
├── sdks/                        # SDK reference (auto-synced from Speakeasy)
│   ├── typescript.mdx           # TS SDK overview
│   ├── typescript-passports.mdx # TS passports module
│   ├── typescript-inference.mdx # TS inference module
│   ├── typescript-receipts.mdx  # TS receipts module
│   ├── typescript-agents.mdx    # TS agents module
│   ├── python.mdx               # Python SDK (planned)
│   ├── rest.mdx                 # REST reference
│   └── mcp-server.mdx           # MCP server setup
│
├── ai-tools/                    # MCP integration guides
│   ├── cursor.mdx               # Cursor IDE setup
│   ├── claude-code.mdx          # Claude Code setup
│   └── windsurf.mdx             # Windsurf IDE setup
│
├── platform/                    # Platform management
│   ├── billing.mdx              # Billing & plans
│   ├── api-keys.mdx             # Key management
│   ├── metering.mdx             # Usage tracking
│   ├── quotas.mdx               # Quota management
│   ├── organizations.mdx        # Org management
│   └── dashboard.mdx            # Dashboard overview
│
├── security/                    # Security docs
├── changelog/                   # Release notes
├── logo/                        # Brand assets
├── images/                      # Doc images
├── snippets/                    # Reusable MDX snippets
├── scripts/                     # Build/sync scripts
│   └── rebuild-sdk-docs.py      # Fetches Speakeasy docs → builds MDX
│
├── .github/workflows/
│   └── sync-sdk-docs.yml        # Auto-sync SDK docs (6h + dispatch)
│
└── memory-bank/                 # Project context (this system)
```

## Key Flows

### Adding a new documentation page
1. Create `.mdx` file in the appropriate directory
2. Add frontmatter (`title`, `description`, optional `icon`)
3. Add the page path to `docs.json` navigation
4. Commit and push → Mintlify auto-deploys

### SDK docs auto-sync
1. Speakeasy regenerates SDK → pushes to `lucid-ai-sdk/typescript/docs/`
2. `trigger-docs-sync.yml` (SDK repo) → `repository_dispatch` → docs repo
3. `sync-sdk-docs.yml` (docs repo) → runs `rebuild-sdk-docs.py`
4. Script fetches fresh content → rebuilds MDX → auto-commits

### Changing navigation structure
1. Edit `docs.json` → `navigation.tabs[].groups[].pages[]`
2. Ensure referenced files exist
3. Commit and push

## Where to Change Common Things

| Want to... | Change... |
|------------|-----------|
| Add a new page | Create `.mdx` + add to `docs.json` navigation |
| Change site theme/colors | `docs.json` → `colors`, `theme` |
| Update logo | Replace files in `logo/` + update `docs.json` → `logo` |
| Add API endpoint docs | Update OpenAPI spec in SDK repo |
| Modify SDK docs | Update Speakeasy config or manually edit `sdks/*.mdx` |
| Add an AI tool guide | Create `ai-tools/<tool>.mdx` + add to navigation |
| Change the sync schedule | `.github/workflows/sync-sdk-docs.yml` → cron |
"""

with open("c:/docs/docs/PROJECT_MAP.md", "w", encoding="utf-8") as f:
    f.write(content.strip() + "\n")
print("Created: docs/PROJECT_MAP.md")