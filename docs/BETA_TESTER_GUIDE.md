# Lucid Beta Tester Guide

Last updated: 2026-04-15

This guide is for beta testers. It explains what is available to test right now, what is working well enough for active testing, and which areas are still early or limited.

## What Lucid Is

Lucid helps you create and operate AI agents inside a workspace.

The main experience is:

1. Enter your workspace
2. Open a project
3. Create or configure agents
4. Group agents into teams when needed
5. Review runs, activity, and approvals

## What We Want You To Focus On

Please spend most of your time on these areas.

### 1. Project Workspace

Main things to test:

- opening your workspace and project
- moving between the main project pages
- checking whether the interface feels clear and consistent
- noticing any broken links, confusing labels, or dead ends

Main pages:

- Project overview
- Agents
- Teams
- Runs

### 2. Agents

Main things to test:

- creating an agent
- editing its name, instructions, and model
- saving changes
- checking whether the agent behaves as expected

Please pay attention to:

- whether setup feels easy or confusing
- whether edits save reliably
- whether the agent follows its role and instructions

### 3. Chat

Main things to test:

- chatting with an agent in the web app
- trying different prompts
- trying different models if available
- checking whether conversations feel stable and coherent

Please pay attention to:

- response quality
- response speed
- whether the agent loses context
- whether anything feels broken or inconsistent

### 4. Knowledge Base

Main things to test:

- uploading documents
- adding pasted text
- adding content from supported file types
- checking whether the uploaded knowledge improves answers

Please pay attention to:

- whether upload and processing feel smooth
- whether answers actually use the uploaded knowledge
- whether the agent cites or reflects the right information
- whether document management feels clear

### 5. Templates

Templates are pre-built starting points for agents or teams.

Main things to test:

- browsing templates
- opening template details
- deploying a template
- checking whether the created agent or team looks correct

Please pay attention to:

- whether templates are easy to understand
- whether deployment feels smooth
- whether the result matches what the template promised

### 6. Teams

Teams let multiple agents work together.

Main things to test:

- creating a team
- assigning agents to a team
- reviewing the team setup
- checking team activity and recent runs

Please pay attention to:

- whether the team concept feels clear
- whether setup is understandable
- whether the team output is useful

### 7. Runs And Activity

Runs are where you review what happened.

Main things to test:

- opening the Runs page
- reviewing recent activity
- checking failures, pending items, and completed work
- confirming whether the run history gives enough context

Please pay attention to:

- whether the page helps you understand what happened
- whether activity is easy to follow
- whether anything important feels missing

### 8. Approvals

Some actions may require a human approval before continuing.

Main things to test:

- seeing an approval request
- approving or denying it
- checking what happens next

Please pay attention to:

- whether approval requests are clear
- whether the decision process feels trustworthy
- whether the system resumes or stops correctly afterward

## Messaging And Channel Testing

If your test setup includes channels, test them in this order:

1. Web chat
2. Telegram
3. Discord
4. WhatsApp
5. Slack

### Strongest Channel Test Areas Right Now

- Web chat
- Telegram
- Discord
- WhatsApp

### More Limited Or Conditional Areas

- Slack may depend on how the beta environment is configured
- Microsoft Teams is not ready for normal beta testing yet

For channels, please pay attention to:

- whether setup is understandable
- whether messages arrive correctly
- whether replies are correct and timely
- whether switching between agents feels clear where supported

## Full Channel Overview

This section is the plain-language channel map.

### Web Chat

What it is:

- the built-in chat experience inside Lucid
- can also be used as an embedded website chat widget

What to test:

- normal conversations
- session continuity
- embedded widget behavior if included in your scope
- mobile and desktop behavior

Channel features to pay attention to:

- streaming replies
- conversation continuity
- widget appearance and usability
- responsiveness on mobile
- whether messages feel immediate and stable

### Telegram

What it is:

- an agent connected to Telegram
- supports both normal bot-style setup and a hosted multi-agent experience

What to test:

- setup and connection flow
- normal chat replies
- media and voice note behavior
- agent switching where hosted multi-agent is enabled

Channel features to pay attention to:

- voice notes and audio transcription
- media understanding for images and documents
- hosted multi-agent switching
- mini app / control room behavior where available
- assistant identity and reply controls in hosted mode

### Discord

What it is:

- an agent connected to Discord servers or DMs

What to test:

- mentions
- direct messages
- thread behavior
- server/channel binding behavior

Channel features to pay attention to:

- mention-based routing
- DM behavior
- thread behavior
- message formatting and readability
- shared-bot versus direct bot behavior where available

### WhatsApp

What it is:

- an agent connected to WhatsApp Business messaging

What to test:

- message delivery
- replies
- media handling
- overall setup clarity

Channel features to pay attention to:

- media handling
- voice note or audio handling where enabled
- reliability of inbound and outbound delivery
- overall clarity of business messaging behavior

### Slack

What it is:

- an agent connected to Slack
- may run as a shared Lucid app or workspace-specific setup depending on environment

What to test:

- install and bind flow if available
- replies in DMs or selected channels
- whether setup feels understandable

Channel features to pay attention to:

- explicit bind flow
- behavior in DMs versus channels
- attachment handling
- message identity and naming
- slash-command style controls where available

### Microsoft Teams

What it is:

- an agent connected to Teams

Current note:

- this is not a main beta focus yet
- test only if your environment explicitly includes it

Channel features to pay attention to if included:

- install / connect flow
- conversation binding
- reply reliability
- clarity of setup

## Channel Feature Checklist

If you are testing a messaging channel, please also check these specific behaviors when they are available in that channel:

### Text Messaging

- messages arrive reliably
- replies are relevant and timely
- formatting is readable

### Voice And Audio

- voice notes can be received
- audio is transcribed correctly
- transcripts are accurate enough to be useful
- failures are clear when transcription is unavailable

### Images And Documents

- images are understood correctly
- documents are accepted and handled clearly
- the agent uses the attached content in its reply

### Conversation Identity

- the right agent is replying
- switching between agents is understandable where supported
- replies do not feel anonymous or confusing

### Controls And Commands

- buttons, menus, or shortcuts are understandable
- channel controls do what users expect
- fallback commands work if the richer UI is unavailable

## Plugins, Tools, Skills, And Integrations

These terms are easy to mix up, so here is the simple version.

### Plugins

Plugins give an agent new capabilities.

Examples:

- trading
- SEO
- analytics
- monitoring
- content tools
- recruiting
- prospecting

What to test:

- whether a plugin is easy to understand
- whether it is easy to install and activate
- whether the agent actually uses the plugin correctly
- whether enabling only some tools is clear

### Built-In Core Tools

These are common tools that may already be available to agents.

Examples:

- web search
- web page fetch
- image understanding
- PDF understanding
- scheduling tasks
- messaging or spawning other agents

What to test:

- whether the agent uses them at the right time
- whether results are useful
- whether tool-driven behavior feels trustworthy

### Integrations

Integrations connect Lucid to outside services.

Examples include:

- Telegram
- Discord
- Slack
- WhatsApp
- Microsoft Teams
- website chat
- external OAuth-connected services where enabled

What to test:

- connection flow
- permissions or authorization flow
- whether data moves correctly between Lucid and the connected service

### Skills

For non-technical testers, the easiest way to think about skills is:

- skills are guidance or capability packs that help agents behave in a certain way
- they are not always something a normal tester will install or manage one by one

What matters for beta testing:

- whether the agent behaves intelligently in its assigned role
- whether templates and configured agents feel capable and useful
- whether the product exposes these capabilities clearly enough in the UI

You do not need to audit internal skill files one by one unless we specifically ask you to test a skills-management surface.

## Plugin And Capability Areas

This is the broader capability map testers can use for context.

### Trading And Finance

Includes areas like:

- token swaps
- quotes
- balances
- portfolio views
- transfers
- tax-style reporting
- invoices and payment-related actions

Test if in scope:

- whether outputs are understandable
- whether risky actions are clearly gated
- whether approvals are used correctly

### Analytics And Intelligence

Includes areas like:

- SEO help
- metrics and reporting
- competitive analysis
- prediction or forecasting features

Test if in scope:

- whether insights are understandable
- whether outputs feel actionable rather than generic

### Communication And Business Operations

Includes areas like:

- meetings
- proposals
- feedback handling
- recruiting
- sales prospecting

Test if in scope:

- whether the workflow makes sense to a normal business user
- whether the wording and outputs feel polished

### Content And Media

Includes areas like:

- video-related features
- social or marketing content

Test if in scope:

- whether outputs feel useful and editable
- whether generated content matches the request

### Monitoring, Audit, And Observability

Includes areas like:

- health and system visibility
- audit-style review
- performance monitoring

Test if in scope:

- whether the page helps you understand what is happening
- whether issues are easy to notice and interpret

### Web3 And Blockchain

Includes areas like:

- bridging
- blockchain wallets
- advanced crypto-related actions

Current note:

- these are real capabilities in the product surface, but not every tester needs to focus on them
- test them only if your beta assignment includes financial or web3 flows

What to test if included:

- wallet-related actions feel understandable
- balances, positions, or portfolio views make sense
- risky actions are clearly separated from read-only actions
- approvals appear where they should
- the system does not feel unsafe or ambiguous when money or assets are involved

## Web3 And Trading Features

This section is for testers assigned to crypto, trading, or onchain flows.

### Wallet And Portfolio Features

What these do:

- show balances
- show portfolio value
- support wallet-related actions

What to test:

- balances look reasonable
- portfolio summaries are understandable
- wallet-related language is clear for non-experts

### Trading Features

What these do:

- quotes
- swaps
- transfers
- trading-related decisions and actions

What to test:

- read-only actions like quotes and balances
- risky actions only if your environment is meant for that
- approval flow for risky actions
- whether the product clearly explains what is about to happen

### Bridge And Cross-Chain Features

What these do:

- support movement across chains where enabled

What to test:

- whether the action is understandable
- whether timing, expectations, and status are clear
- whether the user is warned when a flow is advanced or risky

### Financial Safety Expectations

For any web3 or trading test:

- do not treat unclear behavior as acceptable
- report anything that feels misleading
- report missing confirmations, missing warnings, or weak approval context immediately

## Engines

Lucid can run agents with different execution engines.

For non-technical testers, the simple idea is:

- different engines are different ways the agent runtime can operate
- some are more stable
- some are more experimental

### OpenClaw Engine

What it is:

- the more stable core execution path in the current product

What to test:

- normal agent behavior
- tool usage
- approvals
- consistency across repeated tasks

### Hermes Engine

What it is:

- a more experimental engine path

What to test if included:

- whether the agent still behaves reliably
- whether tools work correctly
- whether responses feel less stable or more error-prone than the default path
- whether the overall experience feels production-like or still rough

Current note:

- Hermes should be treated as an advanced beta area, not a default expectation for all testers

## Deployments And Runtime Modes

Lucid can be used in more than one operating mode.

For testers, the important distinction is:

- some agents run in the shared Lucid environment
- some run in dedicated runtimes or custom deployments

### Shared Runtime

What it is:

- the default managed environment for normal product use

What to test:

- speed
- reliability
- consistency of chat and actions

### Dedicated Runtime

What it is:

- an agent runtime running on separate infrastructure but still managed through Lucid

What to test if included:

- runtime connection status
- whether assigned agents still work normally
- whether health, status, and runtime pages are understandable
- whether maintenance or deployment actions make sense

### Runtime Health And Operations

What to test if included:

- whether connected versus offline states are clear
- whether system status pages are understandable
- whether runtime errors are understandable
- whether operations pages feel trustworthy

### Relay Versus Native Channel Ownership

Non-technical summary:

- in some setups, Lucid handles the channel delivery centrally
- in others, the runtime handles the channel directly

What to test:

- whether the user experience still feels consistent regardless of setup
- whether channel behavior feels reliable

## Deployment And Rollout Features

Some testers may be asked to validate deployment-related areas.

These can include:

- assigning agents to runtimes
- checking runtime health
- checking logs or status pages
- maintenance actions
- deployment-related setup flows

What to test:

- whether deployment-related setup is understandable
- whether the product explains status clearly
- whether the product makes it obvious when something is active, stale, offline, or failing

## Extra Attention For Web3, Engines, And Deployments

If your beta scope includes these areas, please give especially detailed feedback on:

- trust and safety
- clarity of warnings
- approval quality
- operational clarity
- stability differences between engine modes
- anything that feels too technical for a normal user to understand

## What Is Included Versus What Is Not

### Included In This Guide

- the main project workflow
- main channels
- major plugin and capability categories
- integrations in plain language
- what non-technical testers should care about

### Not Listed One By One

- every internal engineering module
- every backend-only or hidden capability
- every internal skill file used by the runtime

Reason:

- many of those are implementation details, not something a non-technical tester can meaningfully test as separate product features
- for beta testers, it is more useful to explain the user-facing capability areas and expected behavior

## Settings, Keys, And Billing

Some testers may also be asked to test admin-style features.

These include:

- provider keys
- gateway keys
- spend visibility
- billing pages

Please test these only if they are part of your access level or assigned scope.

Please pay attention to:

- whether the language is understandable
- whether setup steps are clear
- whether anything feels risky, confusing, or incomplete

## Workflows

Workflows are available for testing, but they are still a more advanced beta area.

Main things to test:

- creating a workflow
- opening and editing it
- saving it
- checking variables, schedules, and webhook-related flows if available

Please pay attention to:

- whether the workflow builder is understandable
- whether it feels reliable
- whether advanced setup is too technical or confusing

## Areas That Are Still Early

These areas exist, but should be treated as early or limited:

- some Mission Control pages
- advanced runtime management
- Hermes-based runtime behavior
- Slack hosted/shared setup
- workflow-heavy advanced use cases

If you test these, please expect rough edges and report them clearly.

## Areas That Need Extra Attention

These are the areas where we especially want careful testing and detailed feedback.

You can think of these as the parts that may need more “babysitting” during beta.

### 1. Knowledge Base Quality

Watch for:

- uploads that succeed but do not improve answers
- wrong document being used
- stale or irrelevant answers
- confusing processing status

### 2. Agent Behavior And Reliability

Watch for:

- agents ignoring instructions
- inconsistent behavior across similar prompts
- loss of context
- strange model behavior after editing settings

### 3. Channel Setup And Delivery

Watch for:

- setup that feels too technical or unclear
- messages not arriving
- delayed or duplicated replies
- media or voice-note issues
- hosted versus direct setup being confusing

### 4. Templates

Watch for:

- template description not matching the final result
- missing setup after deployment
- deployed agent or team feeling incomplete
- parameter fields that are confusing

### 5. Teams And Runs

Watch for:

- team setup feeling unclear
- difficult-to-understand run history
- missing explanations for what happened
- failures that are hard to interpret

### 6. Approvals And Trust

Watch for:

- approval requests that are unclear
- not enough context to decide
- confusing approve or deny results
- actions that feel too risky or too opaque

### 7. Workflows

Watch for:

- builder experience being too technical
- save or edit issues
- confusion around schedules, variables, or webhooks
- flows that look configured but do not feel dependable

### 8. Advanced Admin Surfaces

Watch for:

- settings that are hard to understand
- key management that feels risky
- billing or usage visibility that feels incomplete
- runtime or system pages that are hard to interpret

## Known Limited Or Incomplete Areas

These should still be reported if you touch them, but they are not expected to feel fully polished yet.

- Microsoft Teams hosted setup
- Telegram logs page
- some advanced Mission Control areas
- some advanced runtime management flows
- some hosted Slack setup flows depending on environment

If something in one of these areas feels incomplete, that is still useful feedback. Please describe what confused you and what you expected instead.

## Areas You Do Not Need To Focus On

These are not part of the main beta path for most testers:

- Microsoft Teams hosted setup
- Telegram logs page
- some specialized launchpad, oracle, retail, and video surfaces

## How To Report Feedback

The most useful feedback includes:

- what you were trying to do
- what you expected to happen
- what actually happened
- whether the issue blocked you completely or was just confusing
- screenshots or short recordings if available

Please also call out:

- confusing wording
- unclear navigation
- parts that feel unfinished
- anything that made you lose trust
- places where the product felt especially strong

## Recommended Beta Checklist

If you want a simple checklist, use this:

- sign in and open your workspace
- open a project
- create or edit an agent
- test the agent in web chat
- upload at least one knowledge document
- confirm the knowledge affects answers
- deploy at least one template
- create or review a team
- inspect runs and activity
- resolve at least one approval if available
- test Telegram or Discord if channel access is included

## Summary

The main beta experience to focus on is:

- project workspace
- agents
- chat
- knowledge base
- templates
- teams
- runs
- approvals

That is the clearest and most complete product path in the current beta.
