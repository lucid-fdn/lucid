# Command Center

The Command Center is Mission Control's default landing page — a single-screen operational view of your entire agent fleet.

## Layout

The Command Center uses a resizable 4-pane layout:

### Agent List (Left Panel)

Shows all agents with:
- **Status dot** — Green (active), yellow (paused), red (error)
- **Name** and brief description
- **Health score** (0-100)
- **Cost** — Today's spending
- **Risk level** — Based on enabled tools and guardrails

Click an agent to select it and populate the context pane and controls.

### Live Feed (Center Panel)

A real-time stream of events across your fleet:

- **Tool calls** — What tools agents are calling and their results
- **Errors** — Failed operations with error details
- **Approval requests** — Pending approvals with countdown timers (pulsing amber)
- **Agent events** — Start, stop, pause, resume events
- **Run groups** — Events grouped by conversation run for context

Events include timestamps, agent names, and severity indicators. The feed updates automatically via real-time subscriptions.

### Context Pane (Right Panel)

When you select an agent, this pane shows:

- **Agent state** — Current status, model, uptime
- **Active channels** — Connected messaging platforms
- **Recent memories** — Latest extracted memories
- **Policy summary** — Approval requirements, cost limits
- **Proof anchors** — Recent blockchain attestations

### Controls Bar (Bottom)

Action buttons for the selected agent:

| Control | Action |
|---------|--------|
| **Pause / Resume** | Temporarily stop or restart message processing |
| **Kill Run** | Abort the current in-flight operation |
| **Escalate Model** | Override to a stronger model for the next run |
| **Approve / Deny** | Respond to pending approval requests |

## Customizing the Layout

All panels are resizable — drag the dividers to adjust proportions. The right panel is collapsible. Your layout preferences are saved automatically and persist across sessions.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate agent list |
| `Space` | Toggle pause on selected agent |
| `Enter` | Open agent detail |

## Copilot

The Mission Control copilot is an AI assistant that can answer questions about your fleet:

- "Which agents have the lowest health scores?"
- "What's causing errors on my support bot?"
- "Show me pending approvals"
- "How much have I spent today?"

Access it from the copilot icon in the Command Center header.
