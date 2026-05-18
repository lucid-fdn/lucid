# Workflows Overview

The Workflow Builder lets you create visual automation flows using a drag-and-drop canvas. Connect triggers, actions, and logic nodes to build complex multi-step processes without writing code.

## What Is a Workflow?

A workflow is a visual graph of connected nodes:

- **Trigger nodes** — Start the workflow (webhook, schedule, event)
- **Action nodes** — Do something (send message, call API, update database)
- **Logic nodes** — Control flow (conditions, loops, switches, delays)
- **AI nodes** — Use AI models for classification, generation, or analysis

## The Workflow Editor

The editor is a ReactFlow-based canvas where you:

1. **Drag nodes** from the palette onto the canvas
2. **Connect nodes** by dragging edges between output and input ports
3. **Configure nodes** by clicking them to open the settings panel
4. **Test workflows** by triggering them manually or with test data
5. **Deploy** by activating the workflow

## Node Categories

### Triggers
- **Webhook** — HTTP endpoint that starts the flow
- **Schedule** — Cron-based recurring trigger
- **Event** — Triggered by platform events

### Actions
- **HTTP Request** — Call any API endpoint
- **Send Message** — Send a message via any channel
- **Database** — Query or update data
- **Email** — Send email notifications
- **Transform** — Map, filter, or reshape data

### Logic
- **If/Else** — Conditional branching
- **Switch** — Multi-way branching
- **Loop** — Iterate over lists
- **Delay** — Wait before continuing
- **Merge** — Combine multiple branches

### AI
- **AI Chat** — Generate text with an AI model
- **Classify** — Categorize input into predefined labels
- **Extract** — Pull structured data from text
- **Summarize** — Condense long text

## Use Cases

- **Lead routing** — Classify incoming leads and route to the right team
- **Content pipeline** — Generate, review, and publish content automatically
- **Alert system** — Monitor data and send notifications when thresholds are crossed
- **Data enrichment** — Fetch additional data about contacts or companies
- **Onboarding flows** — Multi-step automated onboarding sequences

## Workflows vs Agent Tools

| Feature | Workflows | Agent Tools |
|---------|-----------|-------------|
| Triggered by | Events, schedules, webhooks | Agent during conversation |
| Execution | Deterministic, predefined path | AI-decided, dynamic |
| Visibility | Full flow visible on canvas | Tool calls in conversation |
| Best for | Repeatable automation | Conversational tasks |
