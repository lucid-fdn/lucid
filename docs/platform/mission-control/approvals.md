# Approvals

The approval system lets you require manual authorization before agents execute high-stakes actions. This is critical for financial operations, destructive actions, or any tool where a human should verify before proceeding.

## How Approvals Work

1. **Configure** — On the agent's Guardrails tab, specify which tools require approval
2. **Agent calls tool** — During a conversation, the agent decides to call an approved tool
3. **Approval created** — Instead of executing immediately, a pending approval is created
4. **Owner notified** — The approval appears in the Mission Control live feed with a pulsing amber indicator
5. **Approve or Deny** — The owner clicks Approve or Deny
6. **Execution resumes** — If approved, the tool executes. If denied, the agent is informed and can take alternative action
7. **Timeout** — If no response within 5 minutes, the approval auto-denies

## Setting Up Approval Requirements

1. Go to your agent's detail page
2. Click the **Guardrails** tab
3. Under **Approval Required Tools**, select the tools that need authorization
4. Save

### Commonly Approved Tools

| Tool | Why Approve |
|------|-------------|
| `dex_swap` | Token trades involve real money |
| `wallet_transfer` | Token transfers are irreversible |
| `hl_place_order` | Leveraged trading positions |

## Approval Cards in the Live Feed

Pending approvals appear in the Mission Control live feed as highlighted cards:

- **Amber pulse** — Draws attention to pending approvals
- **Countdown timer** — Shows time remaining before auto-deny
- **Tool details** — The exact tool call, parameters, and context
- **Approve / Deny buttons** — One-click response
- **Badge count** — The Feed tab shows a badge with the number of pending approvals

## Approval Log

All approval decisions are logged in **Proof Receipts**:

- Who approved or denied
- When the decision was made
- The full tool call parameters
- Whether it timed out

## Best Practices

- **Start strict** — Require approval on all financial tools, then relax as you build confidence
- **Monitor timeout rate** — If approvals are frequently timing out, consider whether the tool should require approval at all
- **Set up notifications** — Check Mission Control regularly when running agents with approval requirements
- **Use approval data** — Review the approval log to understand what your agents are doing and whether policies need adjustment
