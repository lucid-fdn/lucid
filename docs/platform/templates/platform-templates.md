# Platform Templates

Lucid ships ready-to-use platform templates covering common agent, team, and capability use cases. All first-party templates are backed by Lucid Packs, so a vertical template can be as small as one agent or as rich as a bundle of agents, workflows, routines, knowledge, policies, browser procedures, and channel commands.

## Content

### Authority Engine (`content-machine`) — Team
Turn one topic into a researched, SEO-ready article package ready to publish.

**Members:** Search Strategist → Subject Researcher → Article Writer → Publication Editor
**Plugins:** brave-search, lucid-seo, notion
**Parameters:** Brand Name, Primary Topic or Keyword, Target Reader, Brand Voice

### Content Pipeline (`content-pipeline`) — Team
A 3-agent editorial team that researches, drafts, and publishes content end-to-end.

**Members:** Research Lead → Draft Writer → Managing Editor
**Plugins:** brave-search, notion
**Parameters:** Brand Name, Topic, Target Reader, Publishing Destination

## Sales

### Sales Assistant (`sales-assistant`) — Agent
Qualifies leads, researches accounts, and drafts outreach using your CRM data.

**Plugins:** hubspot, slack
**Parameters:** Brand Name, CRM Workspace, Slack Alert Channel

### Lemlist Launcher (`sales-outreach-lemlist`) — Agent
End-to-end outbound: researches prospects with Apollo, writes personalized sequences, launches campaigns in Lemlist, and logs outcomes in HubSpot.

**Plugins:** lemlist, brave-search, hubspot, apollo
**Parameters:** Brand Name, Target Persona, Value Proposition, HubSpot Pipeline

### Prospect Intelligence (`prospect-intelligence`) — Agent
Deep prospect research using Apollo enrichment and Pipedrive CRM sync.

**Plugins:** apollo, pipedrive, brave-search
**Parameters:** Brand Name, Target Market, Pipedrive Stage

## Support

### Support Agent (`support-agent`) — Agent
Handles inbound support requests, creates Linear issues, and routes to Notion runbooks.

**Plugins:** linear, slack, notion
**Parameters:** Brand Name, Linear Team, Notion Runbook Database

### Frontline Support (`tier1-support`) — Agent
Tier-1 triage: classifies tickets, resolves common issues from Notion docs, and escalates to Linear.

**Plugins:** linear, notion
**Parameters:** Brand Name, Linear Project, Notion Knowledge Base

### Contract Sentinel (`contract-sentinel`) — Agent
Reviews contracts for risk clauses, flags issues, and routes critical items for human review.

**Plugins:** slack, notion
**Parameters:** Brand Name, Risk Tolerance, Legal Alert Channel

## Marketing

### Campaign Command (`marketing-campaign`) — Team
Full campaign lifecycle: strategy, copy, and ops with link tracking via Bitly.

**Members:** Campaign Strategist → Content Copywriter → Campaign Ops Lead
**Plugins:** brave-search, notion, slack, bitly
**Parameters:** Brand Name, Campaign Goal, Target Audience, Slack Ops Channel

### Brand Watch (`brand-monitor`) — Agent
Monitors public mentions across news, blogs, forums, Reddit, and review sites. Classifies each as Amplify, Respond, Monitor, or Escalate.

**Plugins:** brave-search, reddit, slack
**Parameters:** Brand Name, Slack Alert Channel

### Social Command (`social-media-manager`) — Team
Manages social presence: content calendar, community engagement, and performance reporting.

**Members:** Content Strategist → Community Manager → Performance Analyst
**Plugins:** notion, slack
**Parameters:** Brand Name, Content Calendar, Community Channel

### Social Performance Hub (`social-performance`) — Agent
Pulls cross-platform metrics weekly from Instagram, Facebook, and TikTok and surfaces insights in Slack.

**Plugins:** instagram, facebook, tiktok, slack
**Parameters:** Brand Name, Reporting Channel

### NPS Intelligence (`nps-pipeline`) — Agent
Pulls NPS responses from Typeform, logs promoters and detractors to HubSpot, and escalates critical feedback to Slack.

**Plugins:** typeform, hubspot, slack
**Parameters:** Brand Name, Typeform Form ID, HubSpot Pipeline, Alert Channel

## Analytics

### Competitive Radar (`competitive-intel`) — Agent
Monitors competitors daily: pricing changes, product launches, hiring signals, and press mentions.

**Plugins:** brave-search, slack, notion
**Parameters:** Brand Name, Competitor List, Alert Channel

### Renewal Radar (`churn-radar`) — Agent
Scans HubSpot for at-risk accounts, scores churn risk, and alerts the CS team in Slack.

**Plugins:** hubspot, slack
**Parameters:** Brand Name, HubSpot Pipeline, Slack Alert Channel

### Executive Brief (`ceo-briefing`) — Team
Daily CEO digest: business metrics, market risks, and a synthesized briefing delivered to Notion and Slack.

**Members:** Metrics Analyst → Risk Scanner → Briefing Coordinator
**Plugins:** notion, hubspot, brave-search, slack
**Parameters:** Brand Name, Metrics Dashboard, Slack Delivery Channel

### Engineering Watch (`dev-monitor`) — Agent
Monitors GitHub for incidents, reviews Linear issues, and surfaces critical items to Slack.

**Plugins:** linear, github, slack
**Parameters:** Brand Name, GitHub Repo, Linear Team, Alert Channel

## Video

### AI Video Producer (`ai-video-producer`) — Agent
Reads a content brief from Notion, generates a video with HeyGen, and delivers the output link via Slack.

**Plugins:** heygen, notion, slack
**Parameters:** Brand Name, Notion Brief Database, Delivery Channel

## Web3 Templates

These install whole Web3 operating capabilities rather than one prompt:

### Whale Watchtower
Tracks whale wallets, classifies movements, and sends evidence-backed alerts before narratives move.

### Token War Room
Monitors price, liquidity, holders, risk, and trend signals for watched tokens.

### Prediction Market Alpha Desk
Tracks prediction-market probability moves, catalysts, liquidity, and watchlist opportunities.

### Portfolio Risk Agent
Reads wallet exposures and produces concentration, liquidity, and drawdown risk reviews.

### Smart Wallet Copy Desk
Finds smart-wallet patterns and drafts copy-trade plans. Execution remains approval-only by default.

### Web3 Intelligence Suite
Bundles whales, tokens, portfolio risk, prediction markets, and smart-wallet research into one operating capability.

All mutating Web3 behavior remains policy-gated. Read-only intelligence is the default posture.
