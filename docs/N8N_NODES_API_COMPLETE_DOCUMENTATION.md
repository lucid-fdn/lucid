# n8n Nodes API - Complete Documentation

## Overview

This document provides comprehensive documentation for the n8n Nodes API endpoint at `http://54.204.114.86:3001/api/flow/nodes`. The API returns a complete catalog of 847 workflow automation nodes available in n8n.

## API Response Structure

### Root Response Object

```json
{
  "success": boolean,
  "count": number,
  "totalAvailable": number,
  "nodes": Array<NodeDefinition>,
  "message": string,
  "source": string
}
```

**Fields:**
- `success`: Indicates if the API call was successful
- `count`: Number of nodes returned in this response
- `totalAvailable`: Total number of nodes available
- `nodes`: Array of node definition objects
- `message`: Human-readable status message
- `source`: Source of the data (e.g., "cli-export")

---

## Node Definition Schema

Each node in the `nodes` array follows this structure:

### Core Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Unique identifier for the node (e.g., "n8n-nodes-base.actionNetwork") |
| `displayName` | string | Yes | Human-readable name displayed in the UI |
| `description` | string | Yes | Brief description of the node's functionality |
| `version` | number \| number[] | Yes | Node version(s) - can be single number or array for multiple versions |
| `group` | string[] | Yes | Node categories: "transform", "trigger", "input", "output", "organization", "schedule" |
| `iconUrl` | string \| object | No | Path to icon or object with light/dark theme variants |
| `inputs` | string[] \| string \| object | Yes | Input connection types the node accepts |
| `outputs` | string[] \| string \| object | Yes | Output connection types the node provides |
| `codex` | object | No | Metadata about the node including categories, aliases, and documentation |
| `usableAsTool` | boolean | No | Whether the node can be used as an AI tool |
| `icon` | string | No | Font Awesome icon identifier (e.g., "fa:clock") |

### IconUrl Variants

Icons can be specified in two ways:

**Simple String:**
```json
"iconUrl": "icons/n8n-nodes-base/dist/nodes/ActionNetwork/actionNetwork.svg"
```

**Theme-Aware Object:**
```json
"iconUrl": {
  "light": "icons/path/to/light-icon.svg",
  "dark": "icons/path/to/dark-icon.svg"
}
```

### Codex Object Structure

The `codex` object contains rich metadata:

```json
"codex": {
  "categories": string[],
  "subcategories": {
    "CategoryName": string[]
  },
  "alias": string[],
  "resources": {
    "primaryDocumentation": Array<{
      "url": string
    }>,
    "credentialDocumentation": Array<{
      "url": string
    }>
  }
}
```

**Categories include:**
- Sales
- Marketing
- Communication
- Development
- Data & Storage
- Productivity
- Finance & Accounting
- Analytics
- Utility
- AI
- Core Nodes
- HITL (Human in the Loop)
- Miscellaneous

### Input/Output Connection Types

Nodes can have various input/output types:

**Simple Types:**
- `"main"` - Standard data flow
- `[]` - No connections (for trigger nodes)

**AI-Specific Types:**
- `"ai_tool"` - AI tool connection
- `"ai_languageModel"` - Language model connection
- `"ai_memory"` - Memory system connection
- `"ai_embedding"` - Embedding connection
- `"ai_document"` - Document connection
- `"ai_vectorStore"` - Vector store connection
- `"ai_outputParser"` - Output parser connection
- `"ai_textSplitter"` - Text splitter connection
- `"ai_chain"` - Chain connection
- `"ai_retriever"` - Retriever connection
- `"ai_reranker"` - Reranker connection

**Dynamic Inputs/Outputs:**
Many advanced nodes use JavaScript expressions to dynamically determine inputs/outputs based on node parameters.

---

## Node Categories & Classification

### 1. Core Nodes (Built-in Workflow Utilities)

**Flow Control:**
- Switch, If, Filter, Merge
- Compare Datasets
- Loop Over Items (Split in Batches)
- Wait

**Data Transformation:**
- Code (JavaScript/Python)
- Edit Fields (Set)
- Item Lists
- Aggregate, Limit, Remove Duplicates, Sort, Split Out, Summarize
- Date & Time
- Rename Keys

**Files:**
- Read/Write Files from Disk
- Convert to File / Extract from File
- Spreadsheet File
- Compression
- Edit Image

**Helpers:**
- Execute Command
- HTTP Request
- SSH
- No Operation
- Debug Helper
- Crypto
- JWT
- HTML
- XML
- Markdown
- TOTP

**Triggers:**
- Manual Trigger
- Webhook
- Schedule Trigger / Cron / Interval
- n8n Trigger
- Error Trigger
- Workflow Trigger
- Local File Trigger
- SSE Trigger

**Workflow Management:**
- Execute Sub-workflow
- Execute Workflow Trigger
- Execution Data
- Respond to Webhook
- Sticky Note
- Simulate / Simulate Trigger

**Forms & Interaction:**
- n8n Form / n8n Form Trigger

**Data Storage:**
- Data Table

### 2. Integration Nodes (300+ Third-Party Services)

#### Communication & Messaging
- **Email:** Gmail, Microsoft Outlook, Send Email (SMTP), Mailchimp, Mailgun, SendGrid
- **Chat:** Slack, Discord, Microsoft Teams, Telegram, Mattermost, RocketChat
- **Video:** Zoom, Webex by Cisco, GoToWebinar
- **SMS:** Twilio, Vonage, Plivo, MessageBird, MSG91, Mocean, seven

#### CRM & Sales
- Salesforce, HubSpot, Pipedrive, Zoho CRM
- ActiveCampaign, Affinity, Copper, Freshworks CRM
- Microsoft Dynamics CRM, Keap (Infusionsoft)

#### Productivity & Project Management
- Asana, Trello, ClickUp, Monday.com, Notion
- Jira, Linear, Taiga, Kitemaker
- Todoist, Microsoft To Do, Google Tasks

#### Marketing & Analytics
- Google Analytics, Google Ads, Mailchimp, ConvertKit
- Facebook Graph API, LinkedIn, Twitter (X)
- Webflow, WordPress, Ghost, Medium, Contentful

#### Data & Storage
- Airtable, Google Sheets, Microsoft Excel
- MongoDB, PostgreSQL, MySQL, Snowflake
- Supabase, NocoDB, SeaTable, Baserow
- AWS S3, Google Drive, Dropbox, OneDrive, Box, Nextcloud

#### E-commerce & Payments
- Shopify, WooCommerce, Stripe, PayPal, Paddle
- Magento 2, QuickBooks Online

#### Development & DevOps
- GitHub, GitLab, Bitbucket, Jenkins, CircleCI, TravisCI
- AWS Lambda, AWS SNS, Cloudflare, Netlify
- Sentry.io, Grafana, Splunk, Elastic Security

#### Cloud Services
- **AWS:** Lambda, SNS, SES, S3, Certificate Manager, Cognito, Comprehend, DynamoDB, ELB, IAM, Rekognition, Textract, Transcribe
- **Google Cloud:** BigQuery, Cloud Storage, Cloud Firestore, Cloud Natural Language, Realtime Database
- **Azure:** Cosmos DB, Storage
- **Microsoft:** Entra ID, Graph Security, SharePoint

#### Finance & Accounting
- Xero, ERPNext, Invoice Ninja, Chargebee
- Wise (Currency), ProfitWell

#### Customer Support
- Zendesk, Freshdesk, Help Scout, Intercom
- ServiceNow, HaloPSA, Zammad

#### Marketing Automation
- Mautic, Autopilot, Emelia, Lemlist
- Customer.io, GetResponse, MailerLite, Brevo (SendInBlue)

#### Miscellaneous Services
- Calendar: Google Calendar, Calendly, Acuity Scheduling, Cal.com
- Forms: Typeform, JotForm, Form.io, Formstack, Wufoo, SurveyMonkey
- Weather: OpenWeatherMap
- Books: Google Books
- Space: NASA
- Music: Spotify
- Security: MISP, TheHive, Cortex, SecurityScorecard
- Translation: DeepL, Google Translate, LingvaNex
- URL Shortening: Bitly, Yourls
- And many more...

### 3. AI & LangChain Nodes (100+ AI-Specific Nodes)

#### Root Nodes (Workflow Entry Points)
- **AI Agent** - Autonomous agent that can use tools and make decisions
- **OpenAI Assistant** - Utilizes OpenAI's Assistant API
- **Anthropic** - Direct access to Claude models
- **OpenAI** - Direct access to GPT models with image, audio, and text capabilities
- **Google Gemini** - Direct access to Google's Gemini models

#### Chains (Specialized AI Workflows)
- **Basic LLM Chain** - Simple prompt → response flow
- **Question and Answer Chain** - RAG-style Q&A over documents
- **Summarization Chain** - Document summarization
- **Sentiment Analysis** - Classify sentiment of text
- **Text Classifier** - Categorize text into predefined classes
- **Information Extractor** - Extract structured data from unstructured text

#### Language Models

**Chat Models (Recommended):**
- Anthropic Chat Model (Claude)
- OpenAI Chat Model (GPT-4, GPT-3.5)
- Azure OpenAI Chat Model
- Google Gemini Chat Model
- Google Vertex Chat Model
- AWS Bedrock Chat Model
- Mistral Cloud Chat Model
- Groq Chat Model
- Ollama Chat Model
- Cohere Chat Model
- DeepSeek Chat Model
- OpenRouter Chat Model
- Vercel AI Gateway Chat Model
- xAI Grok Chat Model

**Text Completion Models (Legacy):**
- OpenAI Model
- Cohere Model
- Ollama Model
- Hugging Face Inference Model

**Model Selection:**
- Model Selector - Dynamically choose between multiple models

#### Memory Systems
- **Simple Memory** - In-memory storage (no external dependencies)
- **Postgres Chat Memory** - Persistent storage in PostgreSQL
- **MongoDB Chat Memory** - Persistent storage in MongoDB
- **Redis Chat Memory** - Fast in-memory database storage
- **Motorhead** - Managed memory service
- **Xata** - Cloud-based memory
- **Zep** - Long-term memory for AI apps
- **Chat Memory Manager** - Manage and retrieve chat history

#### Vector Stores
**For Beginners:**
- **Simple Vector Store** - In-memory vector storage for experimentation

**Production Vector Stores:**
- **Pinecone Vector Store** - Managed vector database
- **Supabase Vector Store** - PostgreSQL with pgvector
- **Postgres PGVector Store** - Self-hosted PostgreSQL with pgvector
- **Qdrant Vector Store** - High-performance vector search
- **Weaviate Vector Store** - Open-source vector database
- **Zep Vector Store** - Long-term memory vector store
- **MongoDB Atlas Vector Store** - MongoDB with vector search
- **Milvus Vector Store** - Scalable vector database

**Modes:**
- Insert - Add new documents
- Retrieve - Search for similar documents
- Load - Load existing store
- Update - Modify existing documents
- Retrieve as Tool - Expose as AI tool

#### Embeddings
- **OpenAI Embeddings** - text-embedding-3-small/large, ada-002
- **Azure OpenAI Embeddings** - Azure-hosted OpenAI
- **Google Gemini Embeddings** - Google's embedding models
- **Google Vertex Embeddings** - Vertex AI embeddings
- **Cohere Embeddings** - Cohere's embedding API
- **AWS Bedrock Embeddings** - AWS-managed embeddings
- **Mistral Cloud Embeddings** - Mistral embedding models
- **Ollama Embeddings** - Local embedding models
- **Hugging Face Inference Embeddings** - HF model embeddings

#### Document Loaders
- **Default Data Loader** - Load from previous workflow step
- **Binary Input Loader** - Load from binary files (PDF, DOCX, etc.)
- **JSON Input Loader** - Load from JSON data
- **GitHub Document Loader** - Load from GitHub repositories

#### Text Splitters
- **Recursive Character Text Splitter** - Recommended for most use cases
- **Character Text Splitter** - Simple character-based splitting
- **Token Splitter** - Split by token count (respects model limits)

#### Retrievers
- **Vector Store Retriever** - Basic vector store retrieval
- **Contextual Compression Retriever** - Compress retrieved docs for relevance
- **MultiQuery Retriever** - Generate multiple queries for better results
- **Workflow Retriever** - Use custom n8n workflow as retriever

#### Rerankers
- **Reranker Cohere** - Rerank search results by relevance

#### Output Parsers
- **Structured Output Parser** - Return JSON in defined schema
- **Item List Output Parser** - Return results as separate items
- **Auto-fixing Output Parser** - Automatically fix malformed outputs (deprecated)

#### AI Tools (300+ Tool Variants)

**Recommended Tools:**
- **HTTP Request Tool** - Make API calls
- **Code Tool** - Write custom JavaScript/Python logic
- **Call n8n Workflow Tool** - Execute any workflow as a tool

**Search & Information:**
- **Wikipedia** - Search Wikipedia articles
- **SerpApi (Google Search)** - Search Google
- **SearXNG** - Privacy-focused meta-search
- **Wolfram|Alpha** - Computational intelligence

**Utility Tools:**
- **Calculator** - Arithmetic operations
- **Think Tool** - Give agent time to reason
- **Vector Store Q&A Tool** - Query vector stores

**Integration Tools:**
Every major integration has a corresponding AI Tool variant (300+ tools), including:
- GitHub Tool, GitLab Tool
- Slack Tool, Discord Tool, Telegram Tool
- Google Sheets Tool, Airtable Tool
- Salesforce Tool, HubSpot Tool
- And 300+ more...

#### MCP (Model Context Protocol)
- **MCP Client Tool** - Connect to MCP servers
- **MCP Server Trigger** - Expose n8n tools as MCP server

#### Chat & Interaction
- **Chat Trigger** - Web-based chat interface
- **Manual Chat Trigger** - Manual chat testing
- **Respond to Chat** - Send responses to chat

---

## Node Type Categories

### By Group Classification

#### 1. **Transform Nodes** (Data Processing)
Nodes that transform, process, or manipulate data as it flows through the workflow.

**Examples:**
- Code, Edit Fields (Set), Item Lists
- Filter, Switch, Merge
- All integration nodes that modify data
- AI chains and agents

**Characteristics:**
- Have both inputs and outputs
- Process data in the middle of workflows
- Can modify, enrich, or transform data

#### 2. **Trigger Nodes** (Workflow Initiators)
Nodes that start workflow execution based on events.

**Types:**

**Polling Triggers:**
- Schedule Trigger, Cron, Interval
- Gmail Trigger, RSS Feed Trigger
- Database triggers (polling)

**Webhook Triggers:**
- Webhook
- Form Trigger
- Most service-specific triggers (GitHub, Slack, etc.)

**Event-Based Triggers:**
- Email Trigger (IMAP)
- Local File Trigger
- n8n Trigger (workflow events)
- Error Trigger

**Characteristics:**
- No inputs (start of workflow)
- Always have outputs
- Execute on schedule, webhook, or event

#### 3. **Input Nodes** (Data Retrieval)
Nodes primarily focused on reading/fetching data.

**Examples:**
- Database read operations
- API GET requests
- File read operations
- Google Sheets, Airtable (read mode)

#### 4. **Output Nodes** (Data Sending)
Nodes primarily focused on sending/writing data.

**Examples:**
- Database write operations
- Email sending
- API POST/PUT requests
- File write operations

#### 5. **Organization Nodes** (Workflow Structure)
Nodes that help organize workflow logic.

**Examples:**
- No Operation (passthrough)
- Sticky Note (documentation)
- Wait (delay execution)

---

## Connection Types Explained

### Standard Connections

| Type | Description | Used By |
|------|-------------|---------|
| `main` | Standard data flow | Most nodes |
| `[]` | No connections | Trigger nodes (inputs), terminal nodes (outputs) |

### AI Connections

| Type | Display Name | Description | Max Connections |
|------|--------------|-------------|-----------------|
| `ai_languageModel` | Model/Chat Model | LLM connection | Usually 1 |
| `ai_tool` | Tool | AI tool capability | Unlimited |
| `ai_memory` | Memory | Chat memory system | Usually 1 |
| `ai_embedding` | Embedding | Embedding model | Usually 1 |
| `ai_document` | Document | Document input | Usually 1 |
| `ai_vectorStore` | Vector Store | Vector database | Usually 1 |
| `ai_outputParser` | Output Parser | Structure output | Usually 1 |
| `ai_textSplitter` | Text Splitter | Text chunking | Usually 1 |
| `ai_chain` | Chain | LangChain chain | Usually 1 |
| `ai_retriever` | Retriever | Document retrieval | Usually 1 |
| `ai_reranker` | Reranker | Result reranking | Usually 1 |

---

## Dynamic Input/Output Patterns

Many advanced nodes use JavaScript expressions to determine connections dynamically:

### Example: AI Agent Inputs
```javascript
// Inputs change based on parameters
// If hasOutputParser = true, includes Output Parser input
// If needsFallback = true, includes Fallback Model input
```

### Example: Vector Store Modes
```javascript
// Different modes have different inputs:
// - 'insert': main input + Document + Embedding
// - 'retrieve': only Embedding
// - 'load': main input + Embedding
// - 'retrieve-as-tool': only Embedding, outputs ai_tool
```

### Example: Switch Node Outputs
```javascript
// Outputs determined by mode and configuration:
// - expression mode: N numbered outputs
// - rules mode: outputs named by rule keys
```

---

## Complete Node Inventory

### Statistics

- **Total Nodes:** 847
- **Base n8n Nodes:** ~120 core/integration nodes
- **AI/LangChain Nodes:** ~100 AI-specific nodes
- **Tool Variants:** ~300 AI tool versions of integration nodes
- **Trigger Variants:** ~80 webhook/polling triggers

### Node Name Convention

Nodes follow a consistent naming pattern:

**Format:** `scope.category.nodeName[Variant]`

**Examples:**
- `n8n-nodes-base.slack` - Base Slack node
- `n8n-nodes-base.slackTrigger` - Slack trigger variant
- `n8n-nodes-base.slackTool` - Slack AI tool variant
- `@n8n/n8n-nodes-langchain.agent` - LangChain AI Agent
- `@n8n/n8n-nodes-langchain.lmChatOpenAi` - OpenAI chat model

**Scopes:**
- `n8n-nodes-base.*` - Core n8n nodes
- `@n8n/n8n-nodes-langchain.*` - AI/LangChain nodes

### Major Integration Families

#### Google Ecosystem (15+ nodes)
- Gmail, Calendar, Drive, Sheets, Docs, Slides, Tasks
- Analytics, Ads, BigQuery, Cloud Storage
- Contacts, Chat, Business Profile, Perspective, Translate
- Books, YouTube

#### Microsoft Ecosystem (10+ nodes)
- Outlook, Teams, To Do, Excel, OneDrive, SharePoint
- Dynamics CRM, Entra ID (Azure AD), Graph Security
- SQL Server, Azure Storage, Azure Cosmos DB

#### AWS Ecosystem (12+ nodes)
- Lambda, SNS, SES, S3
- Certificate Manager, Cognito, Comprehend
- DynamoDB, ELB, IAM, Rekognition, Textract, Transcribe

#### Communication Platforms
- Slack, Discord, Microsoft Teams, Telegram, Mattermost
- RocketChat, Twist, Zulip, Matrix, Line
- Webex by Cisco

#### CRM Platforms
- Salesforce, HubSpot, Pipedrive, Zoho CRM
- ActiveCampaign, Affinity, Copper, Drift
- Freshworks CRM, Microsoft Dynamics, Keap

---

## Version Support

Many nodes support multiple versions to maintain backward compatibility:

### Single Version
```json
"version": 1
```

### Multiple Versions
```json
"version": [1, 2, 3]
// or
"version": [2, 2.1, 2.2, 2.3]
```

**Common Version Patterns:**
- Major versions: `[1, 2, 3]` - Breaking changes between versions
- Minor versions: `[2, 2.1, 2.2]` - Non-breaking enhancements
- AI nodes often have: `[1, 1.1, 1.2, 1.3]` - Incremental improvements

---

## Documentation Resources

Every node includes documentation links in the `codex.resources` object:

### Primary Documentation
Step-by-step guides for using the node:
```
https://docs.n8n.io/integrations/builtin/app-nodes/{node-name}/
```

### Credential Documentation
How to set up authentication:
```
https://docs.n8n.io/integrations/builtin/credentials/{credential-type}/
```

---

## Node Selection & Filtering

### By Category
Nodes can be filtered using the `codex.categories` array:

**Main Categories:**
- `"AI"` - All AI-related nodes
- `"Core Nodes"` - Built-in n8n utilities
- `"Communication"` - Messaging and email
- `"Data & Storage"` - Databases and file systems
- `"Development"` - Developer tools and APIs
- `"Sales"` - CRM and sales tools
- `"Marketing"` - Marketing automation
- `"Productivity"` - Project management
- `"Finance & Accounting"` - Financial services
- `"Analytics"` - Data analysis tools
- `"Utility"` - General utilities
- `"HITL"` - Human-in-the-loop nodes

### By Subcategory
AI nodes have detailed subcategorization:

```json
"subcategories": {
  "AI": [
    "Agents",
    "Chains",
    "Language Models",
    "Memory",
    "Vector Stores",
    "Embeddings",
    "Tools",
    "Document Loaders",
    "Text Splitters",
    "Output Parsers",
    "Retrievers",
    "Rerankers",
    "Root Nodes",
    "Miscellaneous"
  ],
  "Core Nodes": [
    "Flow",
    "Data Transformation",
    "Files",
    "Helpers",
    "Other Trigger Nodes"
  ],
  "Tools": [
    "Recommended Tools",
    "Other Tools"
  ]
}
```

### By Alias
Nodes include searchable aliases:

```json
"alias": [
  "ChatGPT",
  "DallE",
  "whisper",
  "audio",
  "transcribe",
  "assistant"
]
```

### By Capability
Filter nodes that can be used as AI tools:

```json
"usableAsTool": true
```

---

## Integration Patterns

### 1. Standard Node Pattern
Most integration nodes follow this pattern:

```json
{
  "name": "n8n-nodes-base.serviceName",
  "displayName": "Service Name",
  "version": 1,
  "group": ["transform"],
  "inputs": ["main"],
  "outputs": ["main"],
  "usableAsTool": true
}
```

### 2. Trigger Variant Pattern
Most integrations have a trigger variant:

```json
{
  "name": "n8n-nodes-base.serviceNameTrigger",
  "displayName": "Service Name Trigger",
  "group": ["trigger"],
  "inputs": [],
  "outputs": ["main"]
}
```

### 3. AI Tool Variant Pattern
Many nodes have an AI tool variant:

```json
{
  "name": "n8n-nodes-base.serviceNameTool",
  "displayName": "Service Name Tool",
  "inputs": [],
  "outputs": ["ai_tool"]
}
```

---

## Advanced Node Examples

### 1. AI Agent (Complex Dynamic Inputs)

```json
{
  "name": "@n8n/n8n-nodes-langchain.agent",
  "displayName": "AI Agent",
  "version": [2, 2.1, 2.2],
  "inputs": [
    { "type": "main" },
    { "type": "ai_languageModel", "displayName": "Chat Model", "required": true },
    { "type": "ai_languageModel", "displayName": "Fallback Model", "required": true },
    { "type": "ai_memory", "displayName": "Memory" },
    { "type": "ai_tool", "displayName": "Tool" },
    { "type": "ai_outputParser", "displayName": "Output Parser" }
  ],
  "outputs": ["main"]
}
```

**Dynamic Behavior:**
- If `hasOutputParser = false`, removes Output Parser input
- If `needsFallback = false`, removes Fallback Model input
- Tools input accepts unlimited connections

### 2. Vector Store (Multiple Modes)

```json
{
  "name": "@n8n/n8n-nodes-langchain.vectorStoreInMemory",
  "displayName": "Simple Vector Store",
  "modes": {
    "insert": {
      "inputs": ["main", "ai_document", "ai_embedding"],
      "outputs": ["main"]
    },
    "retrieve": {
      "inputs": ["ai_embedding"],
      "outputs": ["ai_vectorStore"]
    },
    "retrieve-as-tool": {
      "inputs": ["ai_embedding"],
      "outputs": ["ai_tool"]
    },
    "load": {
      "inputs": ["main", "ai_embedding"],
      "outputs": ["ai_vectorStore"]
    }
  }
}
```

### 3. Switch Node (Dynamic Outputs)

```json
{
  "name": "n8n-nodes-base.switch",
  "displayName": "Switch",
  "version": [3, 3.1, 3.2, 3.3],
  "outputs": "dynamic based on rules or expression mode"
}
```

**Output Modes:**
- **Expression Mode:** N numbered outputs (0, 1, 2...)
- **Rules Mode:** Named outputs based on rule keys
- **Fallback:** Optional extra output for unmatched items

### 4. Webhook (Multiple HTTP Methods)

```json
{
  "name": "n8n-nodes-base.webhook",
  "displayName": "Webhook",
  "outputs": [
    { "type": "main", "displayName": "GET" },
    { "type": "main", "displayName": "POST" },
    { "type": "main", "displayName": "PUT" }
  ]
}
```

Outputs correspond to configured HTTP methods.

---

## Use Cases & Patterns

### 1. Simple Automation Workflow
```
Trigger → Transform → Action
Gmail Trigger → Filter → Slack
```

### 2. AI-Powered Workflow
```
Manual Trigger → AI Agent → Respond
             ↓
         (Tools: HTTP Request, Calculator, Wikipedia)
             ↓
         (Model: OpenAI GPT-4)
```

### 3. RAG (Retrieval Augmented Generation)
```
Documents → Document Loader → Text Splitter → Vector Store
                                                    ↓
Question → Q&A Chain ← Vector Store Retriever ← Embeddings
              ↓
           Answer
```

### 4. Multi-Integration Workflow
```
Webhook → Switch → [Route 1: Salesforce → Email]
                → [Route 2: Slack → Database]
                → [Route 3: Error Handler]
```

### 5. AI Tool Ecosystem
```
AI Agent
  ├─ HTTP Request Tool (API calls)
  ├─ Call n8n Workflow Tool (complex logic)
  ├─ Google Sheets Tool (data access)
  ├─ Calculator Tool (math)
  └─ Vector Store Q&A Tool (knowledge base)
```

---

## Special Node Features

### HITL (Human-in-the-Loop) Nodes
Nodes that pause workflow for human interaction:

- Discord, Slack, Telegram, Microsoft Teams
- Email nodes (send and wait for reply)
- n8n Form / Form Trigger
- Chat nodes

**Subcategory:**
```json
"subcategories": {
  "HITL": ["Human in the Loop"]
}
```

### Schedule Nodes
Time-based execution:

- Schedule Trigger
- Cron
- Interval

**Group:**
```json
"group": ["trigger", "schedule"]
```

### Binary Data Nodes
Handle file/binary data:

- Read/Write Binary Files
- Convert to/from Binary
- Compression
- Edit Image
- Read PDF
- Spreadsheet File

### Database Nodes
Direct database access:

**SQL:**
- PostgreSQL, MySQL, Microsoft SQL, Snowflake
- QuestDB, TimescaleDB, CrateDB

**NoSQL:**
- MongoDB, Redis, Elasticsearch
- AWS DynamoDB, Azure Cosmos DB

**Cloud Databases:**
- Supabase, Airtable, NocoDB, SeaTable, Baserow

---

## AI Workflow Patterns

### 1. Simple LLM Call
```
Input → Basic LLM Chain → Output
         ↑
    OpenAI Chat Model
```

### 2. Agent with Tools
```
Question → AI Agent → Actions → Response
            ↑
    ┌───────┼───────┐
    │       │       │
  Model   Tools  Memory
```

### 3. Document Q&A (RAG)
```
Documents → Loader → Splitter → Embeddings → Vector Store
                                                  ↓
Question → Q&A Chain ← Retriever ← [Vector Store]
            ↑
        LLM Model
```

### 4. Chat with Memory
```
Chat Trigger → AI Agent → Respond to Chat
                ↑
            ┌───┼───┐
        Model  Tools  Memory
                        ↑
                  Redis/Postgres
```

### 5. Information Extraction
```
Text → Information Extractor → Structured JSON
             ↑
        LLM Model
         (with schema)
```

---

## Node Versioning Strategy

### Version Number Meaning

**Major Versions (1, 2, 3):**
- Breaking changes
- Different parameter structures
- Incompatible with previous versions
- Users must manually migrate

**Minor Versions (1.1, 1.2, 1.3):**
- New features added
- Backward compatible
- Automatic migration

**Patch Versions (2.1.1, 2.1.2):**
- Bug fixes only
- No functional changes

### Multi-Version Support

Nodes can support multiple versions simultaneously:

```json
{
  "name": "n8n-nodes-base.httpRequest",
  "version": [1, 2, 3, 4, 4.1, 4.2]
}
```

Users can choose which version to use in their workflows.

---

## Complete Node List by Category

### Core Nodes (Essential Workflow Building Blocks)

#### Flow Control Nodes
1. **Switch** - Route items to different outputs based on rules/expressions
2. **If** - Branch workflow into true/false paths
3. **Filter** - Remove items that don't match conditions
4. **Merge** - Combine data from multiple inputs
5. **Compare Datasets** - Find differences between two datasets
6. **Loop Over Items (Split in Batches)** - Process items in batches
7. **Wait** - Pause execution for a specified time

#### Data Transformation Nodes
8. **Code** - Execute custom JavaScript or Python
9. **Edit Fields (Set)** - Modify item properties
10. **Item Lists** - Aggregate, split, sort, deduplicate arrays
11. **Aggregate** - Combine fields from many items
12. **Limit** - Restrict number of items
13. **Remove Duplicates** - Delete duplicate items
14. **Sort** - Order items by field values
15. **Split Out** - Turn nested arrays into separate items
16. **Summarize** - Group and calculate (sum, count, average, etc.)
17. **Date & Time** - Parse, format, calculate dates
18. **Rename Keys** - Rename item fields
19. **AI Transform** - Transform data using plain English instructions

#### File Operations Nodes
20. **Read/Write Files from Disk** - Local file system access
21. **Convert to File** - JSON → Binary (CSV, Excel, PDF, etc.)
22. **Extract from File** - Binary → JSON (parse files)
23. **Spreadsheet File** - Read/write CSV, Excel, ODS
24. **Compression** - Zip/unzip files
25. **Edit Image** - Resize, crop, add text to images
26. **Read Binary File** - Load single binary file
27. **Read Binary Files** - Load multiple binary files
28. **Write Binary File** - Save binary file to disk

#### HTTP & API Nodes
29. **HTTP Request** - Make HTTP/REST API calls
30. **GraphQL** - Execute GraphQL queries
31. **Webhook** - Receive HTTP webhooks
32. **Respond to Webhook** - Send HTTP responses
33. **SSE Trigger** - Server-Sent Events listener

#### Utility Nodes
34. **Execute Command** - Run shell commands
35. **SSH** - Execute remote SSH commands
36. **Crypto** - Encryption, hashing, signing
37. **JWT** - Create/verify JSON Web Tokens
38. **TOTP** - Generate 2FA codes
39. **HTML** - Parse/generate HTML
40. **XML** - Parse/generate XML
41. **Markdown** - Convert Markdown ↔ HTML
42. **Debug Helper** - Testing and debugging utilities
43. **No Operation** - Passthrough node

#### Workflow Management Nodes
44. **Manual Trigger** - Start workflow manually
45. **Schedule Trigger** - Time-based execution
46. **Cron** - Cron expression scheduling
47. **Interval** - Run at regular intervals
48. **Execute Sub-workflow** - Call another workflow
49. **Execute Workflow Trigger** - Receive sub-workflow calls
50. **n8n Trigger** - React to n8n instance events
51. **Error Trigger** - Handle workflow errors
52. **Workflow Trigger** - Workflow lifecycle events
53. **Execution Data** - Add searchable metadata
54. **Sticky Note** - Add documentation notes
55. **Simulate** - Placeholder for testing
56. **Simulate Trigger** - Trigger placeholder

#### Form & Interaction Nodes
57. **n8n Form** - Generate web forms
58. **n8n Form Trigger** - Receive form submissions
59. **Email Trigger (IMAP)** - Monitor email inbox
60. **Send Email** - Send SMTP emails
61. **Local File Trigger** - Watch file system changes

#### Data Storage Nodes
62. **Data Table** - Persistent workflow data storage

---

## Integration Nodes - Complete List

### A

1. **Action Network** - Activism and organizing platform
2. **ActiveCampaign** - Email marketing and automation
3. **Acuity Scheduling Trigger** - Appointment booking webhooks
4. **Adalo** - No-code app builder
5. **Affinity** - Relationship intelligence CRM
6. **Agile CRM** - Customer relationship management
7. **Airtable** - Collaborative database
8. **Airtop** - Browser automation and scraping
9. **AMQP Sender** - Message queue protocol
10. **APITemplate.io** - PDF/image generation
11. **Asana** - Work management platform
12. **Automizy** - Email marketing
13. **Autopilot** - Marketing automation

### B-C

14. **AWS Bedrock** - Managed AI services
15. **AWS Certificate Manager** - SSL/TLS certificates
16. **AWS Cognito** - User authentication
17. **AWS Comprehend** - Natural language processing
18. **AWS DynamoDB** - NoSQL database
19. **AWS ELB** - Elastic Load Balancing
20. **AWS IAM** - Identity and access management
21. **AWS Lambda** - Serverless functions
22. **AWS Rekognition** - Image/video analysis
23. **AWS S3** - Object storage
24. **AWS SES** - Email service
25. **AWS SNS** - Notification service
26. **AWS SQS** - Message queue
27. **AWS Textract** - Document text extraction
28. **AWS Transcribe** - Speech to text
29. **Azure Cosmos DB** - NoSQL database
30. **Azure Storage** - Cloud storage
31. **BambooHR** - HR management
32. **Bannerbear** - Image/video generation API
33. **Baserow** - Open-source database
34. **Beeminder** - Goal tracking
35. **Bitbucket Trigger** - Code repository webhooks
36. **Bitly** - URL shortening
37. **Bitwarden** - Password manager
38. **Box** - Cloud storage
39. **Brandfetch** - Brand assets API
40. **Bubble** - No-code platform
41. **Cal.com Trigger** - Scheduling webhooks
42. **Calendly Trigger** - Scheduling webhooks
43. **Chargebee** - Subscription billing
44. **CircleCI** - CI/CD platform
45. **Cisco Webex** - Video conferencing
46. **Clearbit** - Business intelligence
47. **ClickUp** - Project management
48. **Clockify** - Time tracking
49. **Cloudflare** - CDN and security
50. **Cockpit** - Headless CMS
51. **Coda** - Document collaboration
52. **CoinGecko** - Cryptocurrency data
53. **Contentful** - Headless CMS
54. **ConvertKit** - Email marketing
55. **Copper** - CRM for Google Workspace
56. **Cortex** - Security orchestration
57. **CrateDB** - Distributed SQL database
58. **crowd.dev** - Community management

### D-F

59. **Customer.io** - Marketing automation
60. **DeepL** - Translation service
61. **Demio** - Webinar platform
62. **DHL** - Shipping and logistics
63. **Discord** - Community chat platform
64. **Discourse** - Forum software
65. **Disqus** - Comment system
66. **Drift** - Conversational marketing
67. **Dropbox** - Cloud storage
68. **Dropcontact** - Email finder and enrichment
69. **E-goi** - Marketing automation
70. **Elasticsearch** - Search and analytics
71. **Elastic Security** - Security platform
72. **Emelia** - Cold email automation
73. **ERPNext** - Open-source ERP
74. **Eventbrite Trigger** - Event management webhooks
75. **Facebook Graph API** - Facebook platform API
76. **Facebook Lead Ads Trigger** - Lead generation webhooks
77. **Figma Trigger** - Design tool webhooks
78. **FileMaker** - Custom database platform
79. **Flow** - Task management
80. **Form.io Trigger** - Form builder webhooks
81. **Formstack Trigger** - Form builder webhooks
82. **Freshdesk** - Customer support
83. **Freshservice** - IT service management
84. **Freshworks CRM** - Sales CRM
85. **FTP** - File transfer protocol

### G

86. **GetResponse** - Email marketing
87. **Ghost** - Publishing platform
88. **Git** - Version control operations
89. **GitHub** - Code repository
90. **GitLab** - DevOps platform
91. **Gmail** - Google email service
92. **Gong** - Revenue intelligence
93. **Google Ads** - Advertising platform
94. **Google Analytics** - Web analytics
95. **Google BigQuery** - Data warehouse
96. **Google Books** - Book search API
97. **Google Business Profile** - Business listings (formerly Google My Business)
98. **Google Calendar** - Calendar service
99. **Google Chat** - Team messaging
100. **Google Cloud Firestore** - NoSQL document database
101. **Google Cloud Natural Language** - NLP API
102. **Google Cloud Realtime Database** - Real-time data sync
103. **Google Cloud Storage** - Object storage
104. **Google Contacts** - Contact management
105. **Google Docs** - Document editing
106. **Google Drive** - Cloud storage
107. **Google Perspective** - Toxicity analysis
108. **Google Sheets** - Spreadsheet service
109. **Google Slides** - Presentation software
110. **Google Tasks** - Task management
111. **Google Translate** - Translation service
112. **Google Workspace Admin** - Admin API
113. **Gotify** - Push notifications
114. **GoToWebinar** - Webinar platform
115. **Grafana** - Monitoring and visualization
116. **Grist** - Spreadsheet database
117. **Gumroad Trigger** - Digital product sales webhooks

### H-K

118. **Hacker News** - Tech news aggregator
119. **HaloPSA** - PSA platform
120. **Harvest** - Time tracking
121. **Help Scout** - Customer support
122. **HighLevel** - Marketing platform
123. **Home Assistant** - Smart home automation
124. **HubSpot** - Marketing/sales platform
125. **Humantic AI** - Personality insights
126. **Hunter** - Email finder
127. **Intercom** - Customer messaging
128. **Invoice Ninja** - Invoicing software
129. **Iterable** - Marketing automation
130. **Jenkins** - CI/CD automation
131. **Jina AI** - Neural search
132. **Jira Software** - Issue tracking
133. **JotForm Trigger** - Form builder webhooks
134. **Kafka** - Event streaming platform
135. **Keap** - CRM and marketing (formerly Infusionsoft)
136. **Kitemaker** - Product development
137. **KoBoToolbox** - Data collection forms

### L-N

138. **LDAP** - Directory service protocol
139. **Lemlist** - Cold email outreach
140. **Line** - Messaging app
141. **Linear** - Issue tracking
142. **LingvaNex** - Translation API
143. **LinkedIn** - Professional network
144. **LoneScale** - Lead management
145. **Magento 2** - E-commerce platform
146. **Mailcheck** - Email validation
147. **Mailchimp** - Email marketing
148. **MailerLite** - Email marketing
149. **Mailgun** - Email API
150. **Mailjet** - Email service
151. **Mandrill** - Transactional email
152. **Marketstack** - Stock market data
153. **Matrix** - Decentralized chat
154. **Mattermost** - Team collaboration
155. **Mautic** - Marketing automation
156. **Medium** - Publishing platform
157. **MessageBird** - Communications API
158. **Metabase** - Business intelligence
159. **Microsoft Dynamics CRM** - Enterprise CRM
160. **Microsoft Entra ID** - Identity platform (Azure AD)
161. **Microsoft Excel** - Spreadsheet software
162. **Microsoft Graph Security** - Security API
163. **Microsoft OneDrive** - Cloud storage
164. **Microsoft Outlook** - Email client
165. **Microsoft SharePoint** - Document management
166. **Microsoft SQL** - Database server
167. **Microsoft Teams** - Team collaboration
168. **Microsoft To Do** - Task management
169. **MISP** - Threat intelligence platform
170. **Mistral AI** - AI models
171. **Mocean** - SMS and voice API
172. **Monday.com** - Work OS
173. **MongoDB** - NoSQL database
174. **Monica CRM** - Personal CRM
175. **Mosquitto** - MQTT broker
176. **MSG91** - SMS service
177. **MySQL** - Relational database
178. **n8n** - n8n API (self-management)
179. **NASA** - Space data API
180. **Netlify** - Web hosting and deployment
181. **Nextcloud** - File sharing and collaboration
182. **NocoDB** - Open-source Airtable alternative

### O-R

183. **Odoo** - ERP and CRM
184. **Okta** - Identity management
185. **One Simple API** - Utility toolbox
186. **Onfleet** - Delivery management
187. **OpenAI** - GPT models and AI services
188. **OpenThesaurus** - German thesaurus
189. **OpenWeatherMap** - Weather data
190. **Orbit** - Community analytics
191. **Oura** - Health tracking ring
192. **Paddle** - Payment processing
193. **PagerDuty** - Incident management
194. **PayPal** - Payment processing
195. **Peekalink** - Link preview API
196. **Perplexity** - AI search with citations
197. **Phantombuster** - Social media automation
198. **Philips Hue** - Smart lighting
199. **Pipedrive** - Sales CRM
200. **Plivo** - Communications API
201. **PostBin** - HTTP request inspector
202. **Postgres** - PostgreSQL database
203. **PostHog** - Product analytics
204. **Postmark Trigger** - Email service webhooks
205. **ProfitWell** - Subscription metrics
206. **Pushbullet** - Push notifications
207. **Pushcut** - iOS automation
208. **Pushover** - Push notifications
209. **QuestDB** - Time-series database
210. **Quick Base** - Low-code platform
211. **QuickBooks Online** - Accounting software
212. **QuickChart** - Chart generation
213. **RabbitMQ** - Message broker
214. **Raindrop** - Bookmark manager
215. **Reddit** - Social news platform
216. **Redis** - In-memory database
217. **RocketChat** - Team chat
218. **RSS Feed Read** - RSS/Atom feed parser
219. **Rundeck** - Runbook automation

### S

220. **S3** - S3-compatible storage
221. **Salesforce** - CRM platform
222. **Salesmate** - CRM software
223. **SeaTable** - Database and spreadsheet
224. **SecurityScorecard** - Security ratings
225. **Segment** - Customer data platform
226. **SendGrid** - Email delivery
227. **Sendy** - Email newsletter
228. **Sentry.io** - Error tracking
229. **ServiceNow** - IT service management
230. **Seven (SMS77)** - SMS and text-to-speech
231. **Shopify** - E-commerce platform
232. **SIGNL4** - Mobile alerting
233. **Slack** - Team messaging
234. **Snowflake** - Data warehouse
235. **Splunk** - Log analysis and monitoring
236. **Spontit** - Push notifications
237. **Spotify** - Music streaming API
238. **Stackby** - Collaborative database
239. **Storyblok** - Headless CMS
240. **Strapi** - Headless CMS
241. **Strava** - Fitness tracking
242. **Stripe** - Payment processing
243. **Supabase** - Backend-as-a-Service
244. **SurveyMonkey Trigger** - Survey webhooks
245. **SyncroMSP** - MSP platform

### T-Z

246. **Taiga** - Project management
247. **Tapfiliate** - Affiliate tracking
248. **Telegram** - Messaging platform
249. **TheHive** - Security incident response
250. **TheHive 5** - Security platform (v5)
251. **TimescaleDB** - Time-series database
252. **Todoist** - Task management
253. **Toggl Trigger** - Time tracking webhooks
254. **Trello** - Kanban boards
255. **Twake** - Team collaboration
256. **Twilio** - Communications API
257. **Twist** - Team messaging
258. **Twitter (X)** - Social media platform
259. **Typeform Trigger** - Form webhooks
260. **Unleashed Software** - Inventory management
261. **Uplead** - B2B contact data
262. **uProc** - Email parsing
263. **UptimeRobot** - Website monitoring
264. **urlscan.io** - Website scanner
265. **Venafi TLS Protect Cloud** - Certificate management
266. **Venafi TLS Protect Datacenter** - Certificate management
267. **Vero** - Email marketing
268. **Vonage** - Communications API
269. **Webex by Cisco** - Video conferencing
270. **Webflow** - Website builder
271. **Wekan** - Kanban board
272. **WhatsApp Business Cloud** - WhatsApp messaging
273. **WooCommerce** - WordPress e-commerce
274. **WordPress** - Content management
275. **Workable Trigger** - Recruiting webhooks
276. **Xero** - Accounting software
277. **YouTube** - Video platform
278. **Yourls** - URL shortener
279. **Zammad** - Helpdesk
280. **Zendesk** - Customer service
281. **Zoho CRM** - CRM software
282. **Zoom** - Video conferencing
283. **Zulip** - Team chat

---

## AI/LangChain Nodes - Complete List

### Root Nodes (15 nodes)

1. **AI Agent** (v2, 2.1, 2.2, 3) - Autonomous reasoning agent
2. **AI Agent Tool** (v2.2) - Agent as a tool for other agents
3. **OpenAI Assistant** (v1, 1.1) - OpenAI Assistant API
4. **Anthropic** (v1) - Claude models direct access
5. **OpenAI** (v1-1.8) - GPT models with multimodal capabilities
6. **Google Gemini** (v1) - Gemini models direct access
7. **Basic LLM Chain** (v1-1.7) - Simple prompt-response
8. **Question and Answer Chain** (v1-1.6) - RAG Q&A
9. **Summarization Chain** (v1, 2, 2.1) - Text summarization
10. **Sentiment Analysis** (v1, 1.1) - Sentiment classification
11. **Information Extractor** (v1-1.2) - Structured data extraction
12. **Text Classifier** (v1, 1.1) - Multi-class text classification
13. **Simple Vector Store** (v1-1.3) - In-memory vectors
14. **Chat Memory Manager** (v1, 1.1) - Manage chat history
15. **LangChain Code** (v1) - Custom LangChain code

### Chat Models (14 nodes)

16. **Anthropic Chat Model** (v1-1.3) - Claude 3.x
17. **OpenAI Chat Model** (v1-1.2) - GPT-4, GPT-3.5
18. **Azure OpenAI Chat Model** (v1) - Azure-hosted OpenAI
19. **Google Gemini Chat Model** (v1) - Gemini Pro/Ultra
20. **Google Vertex Chat Model** (v1) - Vertex AI models
21. **AWS Bedrock Chat Model** (v1, 1.1) - Bedrock models
22. **Mistral Cloud Chat Model** (v1) - Mistral models
23. **Groq Chat Model** (v1) - Ultra-fast inference
24. **Ollama Chat Model** (v1) - Local open models
25. **Cohere Chat Model** (v1) - Cohere Command
26. **DeepSeek Chat Model** (v1) - DeepSeek models
27. **OpenRouter Chat Model** (v1) - Multi-model gateway
28. **Vercel AI Gateway Chat Model** (v1) - Vercel AI SDK
29. **xAI Grok Chat Model** (v1) - Grok models

### Completion Models (4 nodes - Legacy)

30. **OpenAI Model** (v1) - GPT-3 completion
31. **Cohere Model** (v1) - Cohere completion
32. **Ollama Model** (v1) - Local model completion
33. **Hugging Face Inference Model** (v1) - HF models

### Model Selection (1 node)

34. **Model Selector** (v1) - Dynamic model routing

### Memory Systems (7 nodes)

35. **Simple Memory** (v1-1.3) - In-memory buffer
36. **Postgres Chat Memory** (v1-1.3) - PostgreSQL storage
37. **MongoDB Chat Memory** (v1) - MongoDB storage
38. **Redis Chat Memory** (v1-1.5) - Redis storage
39. **Motorhead** (v1-1.3) - Managed memory service
40. **Xata** (v1-1.4) - Cloud database memory
41. **Zep** (v1-1.3) - Long-term memory service
42. **Chat Messages Retriever** (v1) - Retrieve chat history

### Vector Stores (14 nodes)

43. **Simple Vector Store** (v1-1.3) - In-memory vectors
44. **Pinecone Vector Store** (v1-1.3) - Managed vector DB
45. **Supabase Vector Store** (v1-1.3) - Postgres + pgvector
46. **Postgres PGVector Store** (v1-1.3) - Self-hosted pgvector
47. **Qdrant Vector Store** (v1-1.3) - High-performance vectors
48. **Weaviate Vector Store** (v1-1.3) - Semantic search
49. **Zep Vector Store** (v1-1.3) - Memory + vectors
50. **MongoDB Atlas Vector Store** (v1-1.3) - MongoDB vectors
51. **Milvus Vector Store** (v1-1.3) - Scalable vectors
52-56. **Legacy Insert/Load variants** - Older API patterns

### Embeddings (9 nodes)

57. **OpenAI Embeddings** (v1-1.2) - text-embedding models
58. **Azure OpenAI Embeddings** (v1) - Azure OpenAI
59. **Google Gemini Embeddings** (v1) - Gemini embeddings
60. **Google Vertex Embeddings** (v1) - Vertex AI
61. **Cohere Embeddings** (v1) - Cohere embed
62. **AWS Bedrock Embeddings** (v1) - Bedrock embeddings
63. **Mistral Cloud Embeddings** (v1) - Mistral embeddings
64. **Ollama Embeddings** (v1) - Local embeddings
65. **Hugging Face Inference Embeddings** (v1) - HF embeddings

### Document Loaders (4 nodes)

66. **Default Data Loader** (v1, 1.1) - Previous step data
67. **Binary Input Loader** (v1) - Binary files
68. **JSON Input Loader** (v1) - JSON data
69. **GitHub Document Loader** (v1, 1.1) - GitHub repositories

### Text Splitters (3 nodes)

70. **Recursive Character Text Splitter** (v1) - Recommended splitter
71. **Character Text Splitter** (v1) - Simple character splitting
72. **Token Splitter** (v1) - Token-based splitting

### Retrievers (4 nodes)

73. **Vector Store Retriever** (v1) - Basic vector retrieval
74. **Contextual Compression Retriever** (v1) - Compressed retrieval
75. **MultiQuery Retriever** (v1) - Multi-query expansion
76. **Workflow Retriever** (v1, 1.1) - Custom workflow retrieval

### Rerankers (1 node)

77. **Reranker Cohere** (v1) - Cohere reranking

### Output Parsers (3 nodes)

78. **Structured Output Parser** (v1-1.3) - JSON schema output
79. **Item List Output Parser** (v1) - Separate items output
80. **Auto-fixing Output Parser** (v1) - Self-correcting (deprecated)

### Evaluation Nodes (2 nodes)

81. **Evaluation** (v4.6-4.8) - Run evaluations
82. **Evaluation Trigger** (v4.6, 4.7) - Test datasets

### MCP Nodes (2 nodes)

83. **MCP Client Tool** (v1-1.2) - Connect to MCP servers
84. **MCP Server Trigger** (v1, 1.1, 2) - Expose as MCP server

### Chat Nodes (3 nodes)

85. **Chat Trigger** (v1-1.3) - Web chat interface
86. **Manual Chat Trigger** (v1, 1.1) - Manual chat testing
87. **Respond to Chat** (v1) - Send chat responses

### AI Tool Nodes (12 core tool nodes)

88. **Calculator** (v1) - Arithmetic operations
89. **Code Tool** (v1-1.3) - Custom JS/Python tools
90. **HTTP Request Tool** (v1, 1.1) - API calls as tools
91. **SearXNG** (v1) - Privacy-focused search
92. **SerpApi (Google Search)** (v1) - Google search
93. **Think Tool** (v1, 1.1) - Reasoning step
94. **Vector Store Q&A Tool** (v1, 1.1) - Vector store querying
95. **Wikipedia** (v1) - Wikipedia search
96. **Wolfram|Alpha** (v1) - Computational engine
97. **Call n8n Workflow Tool** (v1-2.2) - Execute workflows
98. **Tool Executor** (v1) - Execute tools without agent

### AI Integration Tool Variants (300+ nodes)

Every major integration node has an AI Tool variant that outputs `ai_tool` instead of `main`, allowing it to be used by AI agents. Examples include:

- Action Network Tool, ActiveCampaign Tool, Adalo Tool
- Airtable Tool, Airtop Tool, AMQP Tool
- Asana Tool, GitHub Tool, GitLab Tool
- Google Sheets Tool, Gmail Tool, Google Drive Tool
- Slack Tool, Discord Tool, Telegram Tool
- And 290+ more...

---

## Practical Implementation Guide

### Building a Node Palette UI

To create a searchable node palette using this API:

```typescript
interface NodeDefinition {
  name: string;
  displayName: string;
  description: string;
  version: number | number[];
  group: string[];
  iconUrl: string | { light: string; dark: string };
  inputs: any;
  outputs: any;
  codex?: {
    categories?: string[];
    subcategories?: Record<string, string[]>;
    alias?: string[];
    resources?: {
      primaryDocumentation?: Array<{ url: string }>;
      credentialDocumentation?: Array<{ url: string }>;
    };
  };
  usableAsTool?: boolean;
}

interface NodesResponse {
  success: boolean;
  count: number;
  totalAvailable: number;
  nodes: NodeDefinition[];
  message: string;
  source: string;
}

// Fetch nodes
const response = await fetch('http://54.204.114.86:3001/api/flow/nodes');
const data: NodesResponse = await response.json();

// Filter by category
const aiNodes = data.nodes.filter(node => 
  node.codex?.categories?.includes('AI')
);

// Search by display name or alias
function searchNodes(query: string, nodes: NodeDefinition[]) {
  const lowerQuery = query.toLowerCase();
  return nodes.filter(node => {
    const matchesName = node.displayName.toLowerCase().includes(lowerQuery);
    const matchesAlias = node.codex?.alias?.some(alias => 
      alias.toLowerCase().includes(lowerQuery)
    );
    return matchesName || matchesAlias;
  });
}

// Group by category
function groupByCategory(nodes: NodeDefinition[]) {
  const groups: Record<string, NodeDefinition[]> = {};
  nodes.forEach(node => {
    node.codex?.categories?.forEach(category => {
      if (!groups[category]) groups[category] = [];
      groups[category].push(node);
    });
  });
  return groups;
}
```

### Determining Node Compatibility

Check if two nodes can be connected:

```typescript
function canConnect(sourceNode: NodeDefinition, targetNode: NodeDefinition): boolean {
  const sourceOutputs = Array.isArray(sourceNode.outputs) 
    ? sourceNode.outputs 
    : [sourceNode.outputs];
  
  const targetInputs = Array.isArray(targetNode.inputs)
    ? targetNode.inputs
    : [targetNode.inputs];
  
  // Check for matching connection types
  return sourceOutputs.some(output => {
    const outputType = typeof output === 'string' ? output : output.type;
    return targetInputs.some(input => {
      const inputType = typeof input === 'string' ? input : input.type;
      return outputType === inputType || outputType === 'main' && inputType === 'main';
    });
  });
}
```

### Building AI Workflows

Example workflow structures:

```typescript
// Simple AI Chat
const chatWorkflow = {
  nodes: [
    { type: '@n8n/n8n-nodes-langchain.chatTrigger' },
    { type: '@n8n/n8n-nodes-langchain.agent' },
    { type: '@n8n/n8n-nodes-langchain.lmChatOpenAi' }, // Connected to agent
    { type: '@n8n/n8n-nodes-langchain.memoryBufferWindow' }, // Connected to agent
    { type: '@n8n/n8n-nodes-langchain.toolHttpRequest' }, // Connected to agent
    { type: '@n8n/n8n-nodes-langchain.chat' } // Respond
  ]
};

// RAG System
const ragWorkflow = {
  nodes: [
    { type: 'n8n-nodes-base.manualTrigger' },
    { type: '@n8n/n8n-nodes-langchain.chainRetrievalQa' },
    { type: '@n8n/n8n-nodes-langchain.lmChatOpenAi' },
    { type: '@n8n/n8n-nodes-langchain.retrieverVectorStore' },
    { type: '@n8n/n8n-nodes-langchain.vectorStoreSupabase' },
    { type: '@n8n/n8n-nodes-langchain.embeddingsOpenAi' }
  ]
};
```

---

## API Integration Patterns

### Filtering Nodes for UI Display

```typescript
// Get only trigger nodes
const triggers = data.nodes.filter(n => n.group.includes('trigger'));

// Get AI-capable nodes
const aiTools = data.nodes.filter(n => n.usableAsTool === true);

// Get nodes with specific input type
const vectorStoreInputs = data.nodes.filter(n => {
  const inputs = Array.isArray(n.inputs) ? n.inputs : [n.inputs];
  return inputs.some(i => i.type === 'ai_vectorStore');
});

// Get latest version of each node
const latestNodes = data.nodes.reduce((acc, node) => {
  const baseName = node.name;
  const version = Array.isArray(node.version) 
    ? Math.max(...node.version)
    : node.version;
  
  if (!acc[baseName] || version > acc[baseName].version) {
    acc[baseName] = { ...node, version };
  }
  return acc;
}, {} as Record<string, NodeDefinition>);
```

### Building Category Navigation

```typescript
interface CategoryTree {
  [category: string]: {
    [subcategory: string]: NodeDefinition[];
  };
}

function buildCategoryTree(nodes: NodeDefinition[]): CategoryTree {
  const tree: CategoryTree = {};
  
  nodes.forEach(node => {
    const categories = node.codex?.categories || ['Uncategorized'];
    const subcategories = node.codex?.subcategories || {};
    
    categories.forEach(category => {
      if (!tree[category]) tree[category] = {};
      
      const subs = subcategories[category] || ['General'];
      subs.forEach(subcategory => {
        if (!tree[category][subcategory]) {
          tree[category][subcategory] = [];
        }
        tree[category][subcategory].push(node);
      });
    });
  });
  
  return tree;
}
```

---

## Common Node Configurations

### HTTP Request Node Configuration

```json
{
  "name": "n8n-nodes-base.httpRequest",
  "parameters": {
    "method": "GET | POST | PUT | DELETE | PATCH",
    "url": "https://api.example.com/endpoint",
    "authentication": "predefinedCredentialType",
    "options": {
      "headers": {},
      "queryParameters": {},
      "bodyParameters": {}
    }
  }
}
```

### AI Agent Configuration

```json
{
  "name": "@n8n/n8n-nodes-langchain.agent",
  "parameters": {
    "promptType": "define",
    "text": "{{ $json.query }}",
    "hasOutputParser": true,
    "options": {
      "systemMessage": "You are a helpful assistant.",
      "maxIterations": 10
    }
  },
  "connections": {
    "ai_languageModel": ["OpenAI Chat Model"],
    "ai_tool": ["HTTP Request Tool", "Calculator", "Wikipedia"],
    "ai_memory": ["Simple Memory"]
  }
}
```

### Vector Store Insert Configuration

```json
{
  "name": "@n8n/n8n-nodes-langchain.vectorStoreSupabase",
  "parameters": {
    "mode": "insert",
    "tableName": "documents",
    "options": {
      "metadata": {
        "source": "{{ $json.filename }}",
        "timestamp": "{{ $now }}"
      }
    }
  }
}
```

---

## Node Lifecycle & Execution

### Trigger Node Execution
1. **Webhook Triggers:** Listen for HTTP requests
2. **Polling Triggers:** Check for new data on schedule
3. **Event Triggers:** React to system events

### Data Flow
```
Trigger → Node 1 → Node 2 → Node 3 → Output
   ↓         ↓         ↓         ↓        ↓
[Items]  [Items]   [Items]   [Items]  [Items]
```

Each node receives items from previous node and outputs transformed items.

### Error Handling
- **Error Trigger** - Catches errors from other workflows
- **Try-Catch Pattern** - Use multiple branches with error routing
- **Continue on Fail** - Node parameter to skip errors

---

## Best Practices

### 1. Node Selection
- Use **Core Nodes** for basic operations (faster, no auth needed)
- Use **Integration Nodes** when service-specific features needed
- Use **AI Nodes** for intelligent processing

### 2. Performance
- **Filter early** - Remove unnecessary data as soon as possible
- **Batch operations** - Use Loop Over Items for large datasets
- **Cache results** - Store expensive operations in Data Table
- **Async execution** - Use Wait node to prevent rate limiting

### 3. AI Workflows
- **Start simple** - Use Basic LLM Chain before complex agents
- **Choose right model** - GPT-4 for complex, GPT-3.5 for simple
- **Limit iterations** - Set maxIterations on agents
- **Use memory wisely** - Persistent memory for production, simple for testing
- **Vector stores** - Simple for dev, Pinecone/Supabase for production

### 4. Security
- **Use credentials** - Never hardcode API keys
- **Validate webhooks** - Check signatures on incoming webhooks
- **Sanitize inputs** - Clean user input before processing
- **Limit permissions** - Use minimum required API scopes

---

## Migration & Compatibility

### Upgrading Node Versions

When multiple versions exist:

```json
"version": [1, 2, 3]
```

**Migration Strategy:**
1. Test new version in separate workflow
2. Compare outputs with old version
3. Update credentials if auth changed
4. Update parameter names if structure changed
5. Deploy to production workflow

### Deprecated Nodes

Some nodes are deprecated but maintained for compatibility:

- **Function / Function Item** → Use **Code** node instead
- **Move Binary Data** → Use **Convert to File / Extract from File**
- **Auto-fixing Output Parser** → Use **Structured Output Parser** with autoFix option

---

## Performance Characteristics

### Node Execution Speed

**Fastest:**
- Core Nodes (Code, Set, Filter, etc.) - <10ms
- In-memory operations - <50ms

**Fast:**
- HTTP Request - 50-500ms (depends on API)
- Database queries - 10-200ms

**Medium:**
- AI LLM calls - 1-10 seconds
- Large file processing - 1-30 seconds

**Slow:**
- AI embeddings (bulk) - 10-60 seconds
- Vector store indexing - 30-300 seconds
- Image generation - 10-30 seconds

### Resource Usage

**Memory Intensive:**
- Simple Vector Store (all data in RAM)
- Large PDF processing
- Image/video processing

**CPU Intensive:**
- Code node (complex calculations)
- Compression/decompression
- Image manipulation

**Network Intensive:**
- HTTP Request (bulk operations)
- Cloud storage sync
- Real-time triggers

---

## Troubleshooting Guide

### Common Issues

#### 1. "Node not found"
**Cause:** Node name mismatch or unavailable version
**Solution:** Check exact node name from API, verify version exists

#### 2. "Connection type mismatch"
**Cause:** Trying to connect incompatible node types
**Solution:** Check input/output types match (main → main, ai_tool → ai_tool)

#### 3. "Missing required input"
**Cause:** Required connection not made
**Solution:** Check node.inputs for required: true connections

#### 4. "Authentication failed"
**Cause:** Invalid or expired credentials
**Solution:** Update credentials, check API key validity

#### 5. "Rate limit exceeded"
**Cause:** Too many API calls
**Solution:** Add Wait node, implement exponential backoff

---

## API Endpoint Usage

### Request

```http
GET http://54.204.114.86:3001/api/flow/nodes
```

### Response

```json
{
  "success": true,
  "count": 847,
  "totalAvailable": 847,
  "nodes": [ /* 847 node definitions */ ],
  "message": "Retrieved 847 of 847 n8n node types",
  "source": "cli-export"
}
```

### Example: Fetching Specific Node Types

```javascript
// Fetch all nodes
const response = await fetch('http://54.204.114.86:3001/api/flow/nodes');
const data = await response.json();

// Filter for specific use case
const chatbotNodes = data.nodes.filter(node => 
  node.codex?.categories?.includes('AI') &&
  node.codex?.categories?.includes('Communication')
);

// Get all trigger nodes
const allTriggers = data.nodes.filter(node => 
  node.group.includes('trigger')
);

// Get nodes that work with databases
const databaseNodes = data.nodes.filter(node =>
  node.codex?.categories?.includes('Data & Storage') &&
  !node.group.includes('trigger')
);
```

---

## Future-Proofing

### Handling New Nodes

The API may return additional nodes in the future. Your implementation should:

1. **Gracefully handle unknown categories**
```typescript
const category = node.codex?.categories?.[0] || 'Other';
```

2. **Support dynamic input/output types**
```typescript
const inputs = typeof node.inputs === 'string' 
  ? [node.inputs]
  : Array.isArray(node.inputs)
    ? node.inputs
    : Object.values(node.inputs);
```

3. **Check for new properties**
```typescript
const hasNewFeature = 'newProperty' in node;
```

---

## Integration with LucidMerged Project

### Current Implementation

Based on your project structure, you have:

**File:** `src/app/api/lucid-l2/nodes/route.ts`

This likely proxies or transforms the n8n nodes API for your frontend.

### Recommended Architecture

```typescript
// API Route: src/app/api/lucid-l2/nodes/route.ts
export async function GET(request: Request) {
  // Fetch from n8n instance
  const response = await fetch('http://54.204.114.86:3001/api/flow/nodes');
  const data = await response.json();
  
  // Transform for your UI needs
  const transformed = {
    ...data,
    nodes: data.nodes.map(transformNode)
  };
  
  return Response.json(transformed);
}

function transformNode(node: NodeDefinition) {
  return {
    id: node.name,
    label: node.displayName,
    description: node.description,
    category: node.codex?.categories?.[0] || 'Other',
    subcategory: getSubcategory(node),
    icon: normalizeIcon(node.iconUrl),
    type: node.group[0],
    connections: {
      inputs: parseConnections(node.inputs),
      outputs: parseConnections(node.outputs)
    },
    metadata: {
      versions: Array.isArray(node.version) ? node.version : [node.version],
      isAITool: node.usableAsTool === true,
      docs: node.codex?.resources?.primaryDocumentation?.[0]?.url
    }
  };
}
```

### UI Component Structure

```typescript
// Node Palette Component
interface NodePaletteProps {
  nodes: NodeDefinition[];
  onNodeSelect: (node: NodeDefinition) => void;
}

const NodePalette: React.FC<NodePaletteProps> = ({ nodes, onNodeSelect }) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  
  const filteredNodes = useMemo(() => {
    let filtered = nodes;
    
    if (search) {
      filtered = searchNodes(search, filtered);
    }
    
    if (category) {
      filtered = filtered.filter(n => 
        n.codex?.categories?.includes(category)
      );
    }
    
    return filtered;
  }, [nodes, search, category]);
  
  const categories = useMemo(() => 
    groupByCategory(nodes),
    [nodes]
  );
  
  return (
    <div>
      <input 
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search nodes..."
      />
      <CategoryNav 
        categories={Object.keys(categories)}
        selected={category}
        onSelect={setCategory}
      />
      <NodeList 
        nodes={filteredNodes}
        onSelect={onNodeSelect}
      />
    </div>
  );
};
```

---

## Appendix A: Node Count by Category

| Category | Count | Percentage |
|----------|-------|------------|
| AI Tools | ~300 | 35% |
| Integration Nodes | ~280 | 33% |
| AI/LangChain Nodes | ~100 | 12% |
| Core Nodes | ~62 | 7% |
| Trigger Variants | ~80 | 9% |
| Other | ~25 | 3% |
| **Total** | **847** | **100%** |

---

## Appendix B: Most Connected Node Types

Nodes that accept the most connection types:

1. **AI Agent** - 6 connection types (main, model, fallback, memory, tool, parser)
2. **Vector Stores** - 4 connection types (main, document, embedding, reranker)
3. **Chains** - 3-4 connection types (main, model, retriever, parser)
4. **Tool Executor** - 2 connection types (main, ai_tool)

---

## Appendix C: Icon Reference

### Icon Formats

**SVG Files:**
```
icons/n8n-nodes-base/dist/nodes/{NodeName}/{nodename}.svg
icons/@n8n/n8n-nodes-langchain/dist/nodes/{category}/{NodeName}.svg
```

**Font Awesome:**
```
fa:icon-name
```

Common icons:
- `fa:clock` - Schedule/time nodes
- `fa:robot` - AI agents
- `fa:database` - Data storage
- `fa:code` - Code execution
- `fa:envelope` - Email
- `fa:comments` - Chat
- `fa:link` - Chains

---

## Appendix D: Quick Reference

### Essential Node Combinations

#### Basic Workflow
```
Schedule Trigger → HTTP Request → Filter → Slack
```

#### Database Sync
```
Postgres Trigger → Transform (Code) → MongoDB
```

#### AI Chat
```
Chat Trigger → AI Agent → Respond to Chat
```

#### Email Automation
```
Gmail Trigger → If → [Send Email / Slack]
```

#### Data Pipeline
```
HTTP Request → Code → Google Sheets → Slack
```

#### RAG Q&A
```
Question → Q&A Chain → Answer
            ↑
    Vector Store (with docs)
```

---

## Appendix E: Node Documentation URLs

All node documentation follows these patterns:

**App Nodes:**
```
https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.{nodename}/
```

**Core Nodes:**
```
https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.{nodename}/
```

**Trigger Nodes:**
```
https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.{nodename}trigger/
```

**AI/LangChain Nodes:**
```
https://docs.n8n.io/integrations/builtin/cluster-nodes/{type}/n8n-nodes-langchain.{nodename}/
```

**Credentials:**
```
https://docs.n8n.io/integrations/builtin/credentials/{service}/
```

---

## Glossary

**Agent** - Autonomous AI that can reason and use tools

**Chain** - Sequence of AI operations (prompt → model → parse)

**Embedding** - Vector representation of text for similarity search

**Memory** - Storage of conversation history for context

**Node** - Single unit of work in a workflow

**RAG** - Retrieval Augmented Generation (AI + knowledge base)

**Reranker** - Reorders search results by relevance

**Retriever** - Fetches relevant documents for AI context

**Text Splitter** - Breaks documents into chunks for processing

**Tool** - Function an AI agent can call

**Trigger** - Starts workflow execution

**Vector Store** - Database optimized for similarity search

**Workflow** - Connected sequence of nodes

---

## Conclusion

This API provides access to 847 powerful workflow automation nodes, enabling:

1. **Traditional Automation** - Integrate 280+ services without code
2. **AI-Powered Workflows** - Build intelligent agents with LangChain
3. **Custom Logic** - Write JavaScript/Python for complex transformations
4. **Hybrid Systems** - Combine traditional and AI capabilities

The node architecture is designed for:
- **Extensibility** - Easy to add new nodes
- **Compatibility** - Multiple versions supported
- **Composability** - Nodes connect in flexible ways
- **Discoverability** - Rich metadata for searching/filtering

For building workflow editors, this API provides all necessary metadata to:
- Display node palettes
- Validate connections
- Generate documentation
- Enable search and filtering
- Support multiple themes (light/dark icons)

---

## Additional Resources

- **n8n Official Docs:** https://docs.n8n.io
- **n8n Community:** https://community.n8n.io
- **LangChain Docs:** https://js.langchain.com/docs
- **n8n GitHub:** https://github.com/n8n-io/n8n
- **API Reference:** https://docs.n8n.io/api/

---

**Document Version:** 1.0  
**Last Updated:** January 21, 2025  
**API Endpoint:** http://54.204.114.86:3001/api/flow/nodes  
**Total Nodes Documented:** 847
