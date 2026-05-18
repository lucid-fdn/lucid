# Workspaces

Workspaces are the top-level organizational unit in Lucid. Everything you build — agents, plugins, knowledge bases, integrations — belongs to a workspace.

## What Is a Workspace?

A workspace maps to an organization. It provides:

- **Isolation** — Each workspace has its own agents, data, and settings. Nothing leaks between workspaces.
- **Team collaboration** — Invite team members with role-based access (Owner, Admin, Member).
- **Billing scope** — Plans and usage limits are applied per workspace.

## Creating a Workspace

You create your first workspace during onboarding. To create additional workspaces:

1. Click the workspace switcher in the top-left of the sidebar
2. Select **Create Workspace**
3. Enter a name and optional description

## Workspace Settings

Access settings from the sidebar gear icon. You can manage:

- **General** — Name, description, slug
- **Members** — Invite users, assign roles
- **Billing** — View your current plan, upgrade, manage payment methods
- **API Keys** — Generate keys for programmatic access (BYOK)
- **Integrations** — OAuth connections for external services

## Roles and Permissions

| Role | Capabilities |
|------|-------------|
| **Owner** | Full access — billing, members, delete workspace |
| **Admin** | Manage agents, plugins, integrations, members (except billing) |
| **Member** | Create and manage own agents, use shared resources |

## Bring Your Own Key (BYOK)

If you have your own API keys for AI providers (OpenAI, Anthropic, etc.), you can add them in workspace settings. When BYOK keys are configured, your agents route directly to the provider instead of going through the Lucid gateway — giving you full control over costs and rate limits.

## Switching Workspaces

Use the workspace switcher in the sidebar to move between workspaces. Your current workspace determines which agents, data, and settings you see.
