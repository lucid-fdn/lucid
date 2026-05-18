# Built-in Plugins

Lucid includes 19+ first-party plugins that run in-process with near-zero latency (~1-5ms). These are maintained by the Lucid team and are always available in the plugin catalog.

## Trading & Finance

### lucid-trade
Token trading tools for DeFi operations.
- **dex_swap** — Execute token swaps via Jupiter (Solana) or 1inch (EVM)
- **dex_get_quote** — Get swap quotes before executing
- **wallet_balance** — Check token balances across chains
- **wallet_transfer** — Transfer tokens between wallets
- **get_price** — Real-time token prices
- **get_portfolio** — Full portfolio view with valuations

### lucid-tax
Cryptocurrency tax reporting and calculation.
- Generate tax reports for trading activity
- Calculate capital gains/losses

### lucid-invoice
Invoice generation and management.
- Create and send invoices
- Track payment status

## Analytics & Intelligence

### lucid-seo
SEO analysis and keyword research.
- **research_keywords** — Keyword difficulty, volume, competition
- **analyze_page** — On-page SEO audit
- **track_rankings** — Monitor search positions

### lucid-metrics
Business metrics and analytics tracking.
- Dashboard KPIs and trend analysis
- Custom metric definitions

### lucid-compete
Competitive intelligence and market analysis.
- Monitor competitor activity
- Market positioning reports

### lucid-predict
Market prediction and forecasting tools.
- Price trend analysis
- Sentiment-based predictions

## Communication

### lucid-meet
Meeting scheduling and management.
- Schedule meetings
- Send calendar invites
- Meeting summaries

### lucid-propose
Proposal generation and management.
- Create business proposals from templates
- Track proposal status

### lucid-feedback
Customer feedback collection and analysis.
- Collect structured feedback
- Sentiment analysis on responses

## Content & Media

### lucid-video
Video generation and editing tools.
- Generate video content
- Video metadata management

### lucid-hype
Social media and marketing content.
- Generate marketing copy
- Social media post scheduling

## Operations

### lucid-audit
Security and compliance auditing.
- Smart contract auditing
- Compliance checks

### lucid-observability
System observability and monitoring.
- Health checks and alerting
- Performance metrics

### lucid-recruit
Recruitment and hiring tools.
- Job posting management
- Candidate screening

### lucid-prospect
Sales prospecting and lead generation.
- Lead identification
- Outreach management

### lucid-veille
Market intelligence and monitoring (veille technologique).
- Industry news tracking
- Technology trend monitoring

## Web3 & Blockchain

### lucid-bridge
Cross-chain bridge operations.
- Bridge tokens between chains
- Estimate bridge fees and times

### lucid-quantum
Quantum-resistant cryptography tools.
- Post-quantum key generation
- Quantum-safe signing

## Built-in Agent Tools

In addition to plugins, every agent has access to core tools:

| Tool | Description |
|------|-------------|
| **web_search** | Search the web (Brave, Perplexity, Grok, Gemini) |
| **web_fetch** | Fetch and parse web pages |
| **image** | Analyze images with vision models |
| **pdf** | Analyze PDF documents |
| **cron_schedule** | Create scheduled/recurring tasks |
| **cron_list** | View scheduled tasks |
| **cron_cancel** | Cancel a scheduled task |
| **sessions_send** | Send messages to other agents |
| **sessions_spawn** | Create sub-agents for parallel work |

These core tools are always available and don't count toward plugin limits.
