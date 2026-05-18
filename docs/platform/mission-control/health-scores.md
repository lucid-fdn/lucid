# Agent Health Scores

Every agent gets a health score from 0 to 100, computed hourly. The score gives you an at-a-glance understanding of how well each agent is performing.

## Score Dimensions

The health score is a weighted combination of six dimensions:

| Dimension | Weight | What It Measures |
|-----------|--------|-----------------|
| **Response Latency** | 20% | P95 response time — how fast the agent replies |
| **Error Rate** | 25% | Percentage of responses with errors |
| **Memory Health** | 15% | Embedding coverage and extraction success rate |
| **Tool Reliability** | 15% | Tool call success rate |
| **User Satisfaction** | 15% | Re-ask rate, conversation abandonment, response length |
| **Cost Efficiency** | 10% | Tokens per response vs fleet median |

## Score Interpretation

| Score | Status | Meaning |
|-------|--------|---------|
| 90-100 | Excellent | Agent is performing optimally |
| 70-89 | Good | Normal operation, minor issues possible |
| 50-69 | Warning | Performance degraded — investigate |
| 30-49 | Poor | Significant issues — action needed |
| 0-29 | Critical | Agent is failing — immediate attention required |

## Where to See Health Scores

- **Agent list** — In the Mission Control Command Center sidebar
- **Fleet table** — On the Agents page, sortable by health score
- **Agent detail** — Health tab shows score history and per-dimension breakdown
- **Canvas view** — Node color reflects health (green → yellow → red)

## Score History

The Health tab on an agent's detail page shows:
- **30-day score trend** — Line chart of hourly scores
- **Per-dimension breakdown** — See which dimensions are pulling the score down
- **Incidents** — Points where the score dropped significantly

## Remediation

When an agent's health score drops below a threshold, the system can:

- **Alert** — Highlight the agent in Mission Control
- **Auto-pause** — Automatically pause agents below a critical threshold
- **Escalate model** — Temporarily switch to a stronger model
- **Notify** — Send alerts via configured channels

Remediation policies are configured on the System page under remediation settings.

## Improving Health Scores

| Low Dimension | Actions to Take |
|---------------|----------------|
| Response Latency | Switch to a faster model, reduce system prompt size |
| Error Rate | Check error logs, fix tool configurations |
| Memory Health | Verify memory strategy is set correctly |
| Tool Reliability | Check plugin configurations, network connectivity |
| User Satisfaction | Improve system prompt, add more context |
| Cost Efficiency | Use a smaller model for simple queries, enable model routing |
