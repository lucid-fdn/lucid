# Install a Template

Installing a template adds a governed Lucid Pack to your workspace. A pack can create or register agents, teams, workflows, routines, knowledge sources, browser procedures, policies, approval gates, docs, and channel commands.

Simple agent and team templates use the same Pack-backed architecture as larger capability templates. The difference is scope, not lifecycle.

## From the Template Gallery

1. Go to **Templates** in the sidebar
2. Browse or search for a template
3. Click a template card to open the detail view
4. Review the preview: creates, reuses, updates, conflicts, setup needs, and approvals
5. Click **Install**
6. Complete any required setup, such as connecting a provider, adding a wallet watchlist, or choosing channels

Lucid provisions what is safe to materialize immediately and registers the rest in the managed-resource ledger with health and setup status.

## What Happens During Install

When you click **Install**, Lucid:

1. **Validates the Pack manifest** — Checks schema, resource keys, safety metadata, and secret hygiene
2. **Previews resource changes** — Shows what will be created, reused, updated, blocked, or left as setup-required
3. **Creates native resources where safe** — For example assistants, teams, policies, knowledge sources, browser procedures, and enabled routines
4. **Registers managed resources** — Tracks workflows, docs, channel commands, host playbooks, and other resources that need setup or a native surface
5. **Records health and provenance** — Stores install status, source Pack version, managed-resource health, and reconcile evidence
6. **Keeps local edits safe** — Marks edited resources for fork/review instead of overwriting them blindly

If setup is missing, the install does not pretend everything is live. The affected resource is marked `needs_setup`, and the template can be reconciled after setup is completed.

## After Install

After install, use the template's health panel and Mission Control to finish setup:

1. **Finish setup** — Add required wallets, sources, providers, approvals, or channels
2. **Run the first prompt** — Templates show example prompts and expected output shape
3. **Check health** — Confirm managed resources are healthy or clearly setup-required
4. **Reconcile** — Re-run provisioning after setup or after upgrading a Pack
5. **Monitor proof** — Track runs, evidence, alerts, and repeat usage in Mission Control

Channel connection is intentionally explicit. Templates may declare channel commands, but real Slack, Discord, Telegram, WhatsApp, Teams, or iMessage delivery requires the workspace/channel provider to be configured first.

## Installing The Same Template Again

You can install the same Pack more than once when the template supports multiple instances. This is useful for:

- tracking different wallets, markets, regions, or brands
- creating isolated staging and production operating capabilities
- testing different policies, providers, or channels

When a Pack is meant to be singleton, Lucid reuses or reconciles the existing install instead of duplicating resources.

## Install History And Reconcile

Every Pack install is recorded. You can see:

- which template Pack was installed
- when it was installed and by whom
- which resources were created, reused, updated, or blocked
- current install health
- managed-resource provenance and reconcile state
- related Mission Control runs and evidence

Use **Templates** for preview/install and **Mission Control → Templates** for install health, funnel analytics, managed resources, reconcile, and proof.

## Troubleshooting

**"Needs setup"** — The Pack is installed, but one or more resources need configuration before they can run. Complete the listed setup step and click **Reconcile**.

**"Conflict requires review"** — Lucid detected local edits to a managed resource. Review the diff, fork the resource, or reconcile only after confirming the change is safe.

**"Approval policy required"** — The template can perform a risky action such as trading, buying, publishing, or deleting. Add or select an approval policy before enabling that resource.

**"Provider missing"** — Connect the required provider or integration first. Templates never embed raw API keys, cookies, passwords, or private keys.

**"Resource unhealthy"** — Open Mission Control to see the health reason, last reconcile attempt, and recommended fix.
