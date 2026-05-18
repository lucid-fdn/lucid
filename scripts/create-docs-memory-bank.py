import os

base = r'c:\docs'

# productContext.md
with open(os.path.join(base, 'memory-bank', 'productContext.md'), 'w', encoding='utf-8') as f:
    f.write("""# Product Context: Raijin Labs Documentation

## Why This Project Exists

### The Problem Space

**Developer documentation is fragmented across Raijin Labs products:**
- Lucid-L2 API docs live in the repo README
- LucidMerged has internal docs/ folder but no public-facing guides
- OpenClaw integration specs are scattered across memory-bank files
- No unified place for developers to find API references, quickstarts, or tutorials

**Existing docs are internal-only:**
- Memory bank files are great for AI context but not for human developers
- Architecture docs in LucidMerged/docs/ are implementation-focused, not user-focused
- No interactive API explorer or code playground

### Our Solution: Mintlify Documentation Site

**Unified public documentation** for all Raijin Labs products:
- Single URL for all documentation
- Auto-generated API reference from OpenAPI specs
- Interactive code examples
- AI tool integration (Cursor, Claude Code, Windsurf)
- Search across all docs

## Problems We Solve

### For External Developers
- **Quick Onboarding**: Get from zero to first API call in < 2 minutes
- **API Reference**: Auto-generated, always up-to-date OpenAPI docs
- **Code Examples**: Copy-paste snippets in multiple languages
- **AI Integration**: Use docs directly in Cursor, Claude Code, Windsurf

### For Internal Teams
- **Single Source of Truth**: One place for all public documentation
- **Version Control**: Git-based, PR-reviewed content changes
- **Auto-Deploy**: Push to main = live in production
- **Consistent Branding**: Mintlify handles design/UX

## How It Should Work

### Developer Journey
1. Land on docs homepage
2. Click Quickstart
3. Get API key from dashboard
4. Make first API call (< 2 minutes)
5. Explore API reference for advanced features
6. Use AI tools for code generation

### Content Creation Workflow
1. Write MDX content locally
2. Preview with `mint dev` (localhost:3000)
3. Create PR on GitHub
4. Review and merge
5. Auto-deploys to production

## User Experience Goals

### Core Principles
1. **Speed**: Find answers in < 30 seconds
2. **Clarity**: No jargon, progressive disclosure
3. **Interactive**: Code examples you can copy and run
4. **Searchable**: Full-text search across all docs
5. **Beautiful**: Clean, modern design (Mintlify default)

### Design Language
- **Theme**: Mint green (#16A34A primary)
- **Layout**: Two-tab structure (Guides + API Reference)
- **Components**: Cards, columns, code blocks, callouts
- **Navigation**: Tab-based with sidebar groups
""")
print('Created: memory-bank/productContext.md')

# systemPatterns.md
with open(os.path.join(base, 'memory-bank', 'systemPatterns.md'), 'w', encoding='utf-8') as f:
    f.write("""# System Patterns: Raijin Labs Documentation

## Architecture Overview

Mintlify docs-as-code platform with Git-based workflow:

```
GitHub (raijinlabs/docs)
    |
    | Push to main branch
    v
Mintlify Dashboard
    |
    | Auto-build + deploy
    v
Public Documentation Site
    |
    | CDN-served static pages
    v
End Users (developers, partners)
```

## Content Architecture

### Navigation Structure (docs.json)

Two-tab layout:
- **Guides tab**: Getting started, Customization, Writing content, AI tools
- **API reference tab**: API documentation, Endpoint examples

### File Organization Pattern

```
c:\\docs/
├── docs.json              # Central config (nav, theme, branding)
├── index.mdx              # Homepage
├── quickstart.mdx         # Getting started guide
├── development.mdx        # Local dev setup
├── ai-tools/              # AI tool integration guides
│   ├── cursor.mdx
│   ├── claude-code.mdx
│   └── windsurf.mdx
├── api-reference/          # API documentation
│   ├── introduction.mdx
│   ├── openapi.json        # OpenAPI spec (auto-generates endpoints)
│   └── endpoint/           # Endpoint examples
│       ├── get.mdx
│       ├── create.mdx
│       ├── delete.mdx
│       └── webhook.mdx
├── essentials/             # Content writing guides
│   ├── markdown.mdx
│   ├── code.mdx
│   ├── images.mdx
│   ├── navigation.mdx
│   ├── settings.mdx
│   └── reusable-snippets.mdx
├── snippets/               # Reusable MDX snippets
│   └── snippet-intro.mdx
├── images/                 # Static images
├── logo/                   # Brand logos (light/dark)
├── memory-bank/            # AI context files
├── .clinerules/            # Cline rules
└── docs/                   # Additional deep-dive docs
```

## Key Patterns

### 1. MDX Content Pattern
All content pages use MDX format with Mintlify components:

```mdx
---
title: "Page Title"
description: "Page description for SEO"
---

## Section

<Card title="Feature" icon="rocket" href="/link">
  Description of the feature.
</Card>
```

### 2. OpenAPI Auto-Generation
API reference pages are auto-generated from `api-reference/openapi.json`.
Mintlify reads the spec and creates interactive endpoint documentation.

### 3. Reusable Snippets
Common content blocks in `snippets/` directory, imported via MDX:

```mdx
<Snippet file="snippet-intro.mdx" />
```

### 4. Theme Configuration
All branding in `docs.json`:
- Colors (primary, light, dark)
- Logo (light/dark variants)
- Navigation structure
- Footer socials
- Navbar links

### 5. Git-Based Deployment
- Push to `main` branch triggers auto-deploy
- Mintlify GitHub app watches for changes
- No CI/CD pipeline needed (Mintlify handles build)
""")
print('Created: memory-bank/systemPatterns.md')

# techContext.md
with open(os.path.join(base, 'memory-bank', 'techContext.md'), 'w', encoding='utf-8') as f:
    f.write("""# Tech Context: Raijin Labs Documentation

## Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Mintlify | Latest | Documentation platform |
| MDX | - | Content format (Markdown + JSX) |
| OpenAPI | 3.x | API spec format |
| Git/GitHub | - | Version control + deployment trigger |

## Development Setup

### Prerequisites
- Node.js (for Mintlify CLI)
- Git

### Commands

```bash
# Install Mintlify CLI globally
npm i -g mint

# Start local development server
cd c:\\docs
mint dev
# Preview at http://localhost:3000

# Update Mintlify CLI
mint update
```

### Configuration

| File | Purpose |
|------|---------|
| `docs.json` | Central config: navigation, theme, branding, footer |
| `api-reference/openapi.json` | OpenAPI spec for auto-generated API docs |
| `favicon.svg` | Browser tab icon |
| `logo/light.svg` | Logo for light mode |
| `logo/dark.svg` | Logo for dark mode |

## Deployment

| Target | Platform | Trigger |
|--------|----------|---------|
| Production | Mintlify CDN | Push to `main` branch |
| Preview | Local | `mint dev` (localhost:3000) |

### Mintlify Dashboard
- GitHub app installed from [dashboard](https://dashboard.mintlify.com)
- Auto-deploys on push to default branch
- No manual build step required

## Content Format

### MDX Components Available
- `<Card>` - Feature cards with icons
- `<Columns>` - Multi-column layouts
- `<Tabs>` - Tabbed content
- `<Accordion>` - Collapsible sections
- `<Snippet>` - Reusable content blocks
- `<CodeGroup>` - Multi-language code blocks
- `<Warning>` / `<Note>` / `<Tip>` - Callout blocks

### Frontmatter
Every `.mdx` file starts with YAML frontmatter:
```yaml
---
title: "Page Title"
description: "SEO description"
icon: "icon-name"  # Optional Mintlify icon
---
```

## Repository Info

- **GitHub**: `raijinlabs/docs`
- **Origin**: `https://github.com/raijinlabs/docs.git`
- **Default Branch**: main
- **License**: See LICENSE file

## Related Repositories

| Repo | Relationship |
|------|-------------|
| `LucidMerged` | Main platform (docs reference its APIs) |
| `Lucid-L2` | AI backend (API docs generated from its OpenAPI spec) |
| `lucid-plateform-core` | Core services (TrustGate API docs) |
| `yaku-hub` | Additional services |

## Code Style for Documentation

- **File names**: `kebab-case.mdx`
- **Titles**: Title Case
- **Descriptions**: Sentence case
- **Code blocks**: Always specify language
- **Links**: Use relative paths within docs
- **Images**: Store in `images/` directory
""")
print('Created: memory-bank/techContext.md')

# activeContext.md
with open(os.path.join(base, 'memory-bank', 'activeContext.md'), 'w', encoding='utf-8') as f:
    f.write("""# Active Context

## Current Work: Documentation Site Initialization (Feb 19, 2026)

### Session Progress

1. **Memory Bank Initialized** - Created memory-bank directory with full structure matching LucidMerged pattern
2. **Cline Rules Created** - Added `.clinerules/` with context-loading and memory-bank maintenance rules
3. **Project Analysis Complete** - Identified this as a Mintlify starter kit that needs customization for Raijin Labs

### Current State

The documentation site is currently using the **default Mintlify starter kit** content. It needs to be customized with actual Raijin Labs product documentation:

- `docs.json` still says "Mint Starter Kit" (needs to be "Raijin Labs" or "Lucid Documentation")
- Content pages are Mintlify examples, not product-specific
- API reference uses placeholder OpenAPI spec
- AI tools section exists but may need Raijin Labs-specific content

### Architecture Decisions Made
- Using Mintlify as the documentation platform (already set up)
- Two-tab navigation: Guides + API Reference
- MDX content format with Mintlify components
- Git-based deployment (push to main = auto-deploy)

---

## Next Steps (Priority Order)

1. **P0**: Customize `docs.json` - Update name, colors, logos, navigation for Raijin Labs branding
2. **P0**: Replace homepage (`index.mdx`) with Raijin Labs product overview
3. **P0**: Create Lucid-L2 API quickstart guide
4. **P1**: Import Lucid-L2 OpenAPI spec to replace placeholder
5. **P1**: Write LucidMerged platform getting started guide
6. **P1**: Write OpenClaw integration guide
7. **P2**: Add SDK documentation (JavaScript, Python)
8. **P2**: Create tutorials and how-to guides
9. **P3**: Add changelog/release notes section
10. **P3**: Multi-language code examples

---

## Important Patterns & Preferences

- Follow Mintlify best practices for content structure
- Use MDX components (Card, Columns, CodeGroup) for rich content
- Keep pages focused and scannable
- Include code examples on every API page
- Cross-reference between related pages
""")
print('Created: memory-bank/activeContext.md')

# progress.md
with open(os.path.join(base, 'memory-bank', 'progress.md'), 'w', encoding='utf-8') as f:
    f.write("""# Progress: Raijin Labs Documentation

## Current Status (February 2026)

### Overall Progress: ~15% (Scaffolding Complete, Content Needed)

---

## What Works (Production-Ready)

### Infrastructure
- Mintlify project scaffolded and deployed
- GitHub repo (`raijinlabs/docs`) connected to Mintlify dashboard
- Auto-deploy pipeline active (push to main = live)
- Local development working (`mint dev`)

### Content Structure
- Two-tab navigation (Guides + API Reference)
- AI tools section (Cursor, Claude Code, Windsurf pages)
- API endpoint examples (GET, POST, DELETE, Webhook)
- Essential guides (Markdown, Code, Images, Navigation, Settings, Snippets)
- OpenAPI spec integration working

### Assets
- Logo files (light/dark SVG)
- Favicon
- Hero images (light/dark)

---

## What Needs Work

### High Priority (P0) - Branding & Core Content

| Task | Status | Notes |
|------|--------|-------|
| Customize docs.json for Raijin Labs | Not Started | Name, colors, logos, nav |
| Replace index.mdx homepage | Not Started | Product overview, not starter kit |
| Lucid-L2 API quickstart | Not Started | First API call guide |
| Import real OpenAPI spec | Not Started | Replace placeholder spec |

### Medium Priority (P1) - Product Documentation

| Task | Status | Notes |
|------|--------|-------|
| LucidMerged platform guide | Not Started | Getting started, workspace setup |
| OpenClaw integration guide | Not Started | Agent creation, channel setup |
| Authentication docs | Not Started | Privy auth, API keys |
| Webhook documentation | Not Started | Event types, payload formats |

### Low Priority (P2) - Advanced Content

| Task | Status | Notes |
|------|--------|-------|
| JavaScript SDK docs | Not Started | raijin-labs-lucid-ai package |
| Python SDK docs | Not Started | If SDK exists |
| Tutorials & how-tos | Not Started | Step-by-step guides |
| Changelog section | Not Started | Release notes |

### Future (P3)

| Task | Status | Notes |
|------|--------|-------|
| Multi-language examples | Not Started | Python, Go, Ruby, etc. |
| Interactive playground | Not Started | Try API in browser |
| Community guides | Not Started | User-contributed content |
| Video tutorials | Not Started | Embedded walkthroughs |

---

## Known Issues

1. **All content is starter kit defaults** - Every page needs to be replaced with actual product content
2. **docs.json branding** - Still says "Mint Starter Kit" with Mintlify colors
3. **OpenAPI spec is placeholder** - Needs real Lucid-L2 API spec
4. **No product-specific images** - Only starter kit hero images

---

## Summary

**Infrastructure: 100%** - Mintlify is fully set up and deploying
**Branding: 0%** - Still using starter kit defaults
**Core Content: 0%** - No product-specific documentation yet
**API Reference: 5%** - Structure exists but placeholder spec
**Advanced Content: 0%** - SDKs, tutorials, changelog not started

**Estimated Timeline to MVP:**
- 1 day: Branding + homepage customization
- 3 days: Core API docs (Lucid-L2 quickstart + OpenAPI spec)
- 1 week: Platform guides (LucidMerged, OpenClaw)
- 2 weeks: Full documentation MVP
""")
print('Created: memory-bank/progress.md')

# README.md
with open(os.path.join(base, 'memory-bank', 'README.md'), 'w', encoding='utf-8') as f:
    f.write("""# Memory Bank Overview

This Memory Bank contains comprehensive documentation for the Raijin Labs Documentation project (C:\\docs), designed to provide complete context after memory resets.

## File Structure

### Core Files (Required)
1. **`projectbrief.md`** - Foundation document defining project scope and requirements
2. **`productContext.md`** - Why this project exists, problems it solves
3. **`systemPatterns.md`** - Technical architecture and content patterns
4. **`techContext.md`** - Technologies, dev setup, deployment
5. **`activeContext.md`** - Current work focus and recent changes
6. **`progress.md`** - What works, what is left to build, current status

### File Relationships
```
projectbrief.md (foundation)
├── productContext.md (why & how)
├── systemPatterns.md (architecture)
└── techContext.md (technology)
    └── activeContext.md (current state)
        └── progress.md (status & next steps)
```

## Quick Reference

### Project Status (February 2026)
- **Overall Progress**: ~15% (scaffolding complete, content needed)
- **Current Focus**: Initialize memory bank and plan content customization
- **Infrastructure**: Mintlify fully deployed and auto-deploying
- **Content**: Still using starter kit defaults - needs full customization

### Technology
- **Platform**: Mintlify (docs-as-code)
- **Content**: MDX (Markdown + JSX)
- **Deployment**: Auto-deploy on push to main via Mintlify GitHub app
- **API Docs**: Auto-generated from OpenAPI spec

### Key Commands
```bash
npm i -g mint    # Install Mintlify CLI
mint dev         # Local preview at localhost:3000
mint update      # Update CLI
```

## Usage
Read all Memory Bank files at the start of each session to understand project context and continue work effectively.

**Last Updated:** February 19, 2026
""")
print('Created: memory-bank/README.md')

# docs/PROJECT_MAP.md
os.makedirs(os.path.join(base, 'docs'), exist_ok=True)
with open(os.path.join(base, 'docs', 'PROJECT_MAP.md'), 'w', encoding='utf-8') as f:
    f.write("""# PROJECT MAP: Raijin Labs Documentation

## High-Level Architecture

```
Mintlify Docs Site (raijinlabs/docs)
├── docs.json          <- Central config (nav, theme, branding)
├── Content Pages      <- MDX files organized by topic
├── API Reference      <- Auto-generated from OpenAPI spec
└── Static Assets      <- Images, logos, favicon
```

## Module / Directory List

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `/` (root) | Top-level pages + config | `docs.json`, `index.mdx`, `quickstart.mdx`, `development.mdx` |
| `ai-tools/` | AI tool integration guides | `cursor.mdx`, `claude-code.mdx`, `windsurf.mdx` |
| `api-reference/` | API documentation | `introduction.mdx`, `openapi.json` |
| `api-reference/endpoint/` | Endpoint examples | `get.mdx`, `create.mdx`, `delete.mdx`, `webhook.mdx` |
| `essentials/` | Content writing guides | `markdown.mdx`, `code.mdx`, `images.mdx`, `navigation.mdx`, `settings.mdx`, `reusable-snippets.mdx` |
| `snippets/` | Reusable MDX fragments | `snippet-intro.mdx` |
| `images/` | Static images | `hero-dark.png`, `hero-light.png`, `checks-passed.png` |
| `logo/` | Brand logos | `light.svg`, `dark.svg` |
| `memory-bank/` | AI context (Cline memory) | Core files (projectbrief, progress, etc.) |
| `.clinerules/` | Cline behavior rules | `00-context.md`, `01-memory-bank.md` |
| `docs/` | Deep-dive documentation | `PROJECT_MAP.md` |

## Key Flows

### Content Update Flow
1. Edit MDX file locally
2. Preview with `mint dev`
3. Push to `main` branch
4. Mintlify auto-deploys

### Adding a New Page
1. Create `.mdx` file in appropriate directory
2. Add frontmatter (title, description)
3. Add page path to `docs.json` navigation
4. Preview and deploy

### Adding API Endpoint
1. Update `api-reference/openapi.json` with new endpoint
2. Mintlify auto-generates the endpoint page
3. Optionally create custom MDX page in `api-reference/endpoint/`

## Where to Change Common Things

| Want to change... | Edit this file |
|-------------------|---------------|
| Site name/branding | `docs.json` |
| Navigation structure | `docs.json` > `navigation` |
| Homepage content | `index.mdx` |
| API endpoints | `api-reference/openapi.json` |
| Theme colors | `docs.json` > `colors` |
| Logo | Replace files in `logo/` |
| Add new guide page | Create `.mdx` + add to `docs.json` nav |
| Reusable content | Add to `snippets/` |
| Footer links | `docs.json` > `footer` |

## Glossary

| Term | Definition |
|------|-----------|
| MDX | Markdown + JSX - content format used by Mintlify |
| docs.json | Central configuration file for the documentation site |
| OpenAPI | Standard for API specification (auto-generates API docs) |
| Mintlify | Documentation platform (docs-as-code) |
| Snippet | Reusable MDX content block |
""")
print('Created: docs/PROJECT_MAP.md')

# .clinerules/00-context.md
os.makedirs(os.path.join(base, '.clinerules'), exist_ok=True)
with open(os.path.join(base, '.clinerules', '00-context.md'), 'w', encoding='utf-8') as f:
    f.write("""# Always-Load Context (MANDATORY)

**This is the HIGHEST PRIORITY rule. It must be followed at the start of EVERY task.**

## At the Start of EVERY Task

Before doing ANYTHING else, I MUST:

1. **Read ALL Memory Bank files:**
   - `memory-bank/projectbrief.md` - Foundation document (project scope, goals)
   - `memory-bank/productContext.md` - Why the project exists, problems it solves
   - `memory-bank/systemPatterns.md` - Architecture, technical decisions, design patterns
   - `memory-bank/techContext.md` - Technologies, dev setup, dependencies
   - `memory-bank/activeContext.md` - Current work focus, recent changes, next steps
   - `memory-bank/progress.md` - What works, what is left, current status

2. **Read the Project Map:**
   - `docs/PROJECT_MAP.md` - Navigation index, module boundaries, key entrypoints

3. **Confirm Understanding:**
   - Summarize context in 5-10 bullet points before proceeding
   - Identify any gaps in understanding
   - Ask clarifying questions if needed

## Why This Matters

I am Cline, an expert software engineer whose memory resets between sessions. After each reset, I rely ENTIRELY on these documents to understand the project. Without them, I am operating blind.

## Project Map Hygiene (KEEP IT CLEAN)

The PROJECT_MAP is a **navigation index**, not a design doc:

- **Keep it short** - Aim for 200-400 lines max
- **Use bullets** - Module boundaries, key entrypoints, where to change X
- **Link to deeper docs** - Point to other docs instead of long explanations
- **Only update when structure changes**
- **Clear sections:** High-level architecture, Module list, Key flows, Where to change common things, Glossary

## Memory Bank Hygiene

- **activeContext.md + progress.md must stay concise and current**
- **After meaningful milestones:** Update Memory Bank
- **When user says "update memory bank":** Review ALL memory-bank files
- **Focus on patterns and insights** - Not implementation details

## New Session Workflow

When user says **"follow your custom instructions"** at the start of a session:

1. Read all Memory Bank files
2. Read PROJECT_MAP.md
3. Summarize understanding
4. Ask for clarification if needed
5. Proceed with task

## End of Session Workflow

When user says **"update memory bank"** at the end of a session:

1. Review ALL Memory Bank files
2. Update `activeContext.md` with current work focus
3. Update `progress.md` with completed milestones
4. Document any new patterns in `systemPatterns.md`
5. Confirm all files are current and accurate
""")
print('Created: .clinerules/00-context.md')

# .clinerules/01-memory-bank.md
with open(os.path.join(base, '.clinerules', '01-memory-bank.md'), 'w', encoding='utf-8') as f:
    f.write("""# Memory Bank Structure & Maintenance

## Memory Bank Overview

The Memory Bank consists of core files in Markdown format. Files build upon each other in a clear hierarchy.

## Core Files (Required)

### 1. projectbrief.md
- Foundation document that shapes all other files
- Created at project start if it does not exist
- Defines core requirements and goals
- Source of truth for project scope

### 2. productContext.md
- Why this project exists
- Problems it solves
- How it should work
- User experience goals

### 3. systemPatterns.md
- System architecture
- Key technical decisions
- Design patterns in use
- Component relationships
- Critical implementation paths

### 4. techContext.md
- Technologies used
- Development setup
- Technical constraints
- Dependencies
- Tool usage patterns

### 5. activeContext.md
- Current work focus
- Recent changes
- Next steps
- Active decisions and considerations
- Important patterns and preferences
- Learnings and project insights

### 6. progress.md
- What works
- What is left to build
- Current status
- Known issues
- Evolution of project decisions

## File Hierarchy

```
projectbrief.md (Foundation)
    ├── productContext.md (Why/What)
    ├── systemPatterns.md (How/Architecture)
    └── techContext.md (With What)
            └── activeContext.md (Current Focus)
                    └── progress.md (Status)
```

## Documentation Updates

Memory Bank updates occur when:
1. Discovering new project patterns
2. After implementing significant changes
3. When user requests with **"update memory bank"** (MUST review ALL files)
4. When context needs clarification

## Update Process

When updating Memory Bank:

1. **Review ALL Files** - Even if some do not require updates
2. **Document Current State** - What has been completed, what is in progress
3. **Clarify Next Steps** - What needs to happen next
4. **Document Insights & Patterns** - New learnings, architectural decisions

Focus particularly on `activeContext.md` and `progress.md` as they track current state.
""")
print('Created: .clinerules/01-memory-bank.md')

# .clinerules/README.md
with open(os.path.join(base, '.clinerules', 'README.md'), 'w', encoding='utf-8') as f:
    f.write("""# Cline Rules Directory

This directory contains organized rules that Cline follows when working on this project. Rules are loaded automatically and enforced during all sessions.

## File Organization

### Core Rules (Load First)
- **00-context.md** - MANDATORY context loading (HIGHEST PRIORITY)
- **01-memory-bank.md** - Memory Bank structure and maintenance

### How Cline Uses These Rules

1. **At session start:** Cline reads all `.clinerules/*.md` files
2. **During work:** Follows patterns and constraints defined in rules
3. **At session end:** Updates Memory Bank as specified in rules

## Key Workflows

### Starting a Session
User says: **"follow your custom instructions"**

### Ending a Session
User says: **"update memory bank"**
""")
print('Created: .clinerules/README.md')

print('\nAll files created successfully!')