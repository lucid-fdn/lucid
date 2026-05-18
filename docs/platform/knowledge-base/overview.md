# Knowledge Base Overview

The Knowledge Base lets you upload documents that your AI agents can reference when answering questions. Instead of cramming everything into the system prompt, you store documents in the knowledge base and agents automatically retrieve relevant sections during conversations.

For the broader workspace brain that combines documents with assistant memory, project knowledge, team knowledge, org policy, evidence, source governance, and Brain Ops, see [Lucid Knowledge](lucid-knowledge.md). For the engine/runtime-facing contract, see [Brain Runtime Contract](brain-runtime.md).

## Brain Intake

The workspace Brain overview exposes one canonical input for non-technical users: paste text, drop a readable file, add a URL, or ask a recall question. Lucid classifies the input before saving it:

- **Operating context** for policies, decisions, risks, thesis, memory, and durable guidance that agents should inherit.
- **Knowledge facts** for short truths agents can retrieve and cite.
- **Knowledge documents** for long pasted text and readable text files.
- **Knowledge sources** for URLs and files that should be tracked as provenance.
- **Recall tests** for questions that should validate what agents would retrieve instead of storing new information.

The classifier is schema-bound and review-first. Users see the proposed destination, confidence, editable title/body, and warnings before anything is committed. Persistence goes through the shared Brain runtime facade (`rememberBrain`) and reuses the existing Context, Knowledge Facts, Sources, and RAG document stores, so Brain intake does not create a parallel knowledge system.

## How It Works

The Knowledge Base uses Retrieval-Augmented Generation (RAG):

1. **Upload** — You upload a document (text, markdown, PDF)
2. **Chunk** — The document is split into sections using markdown-aware chunking (preserving headings, code blocks, and paragraph structure)
3. **Embed** — Each chunk is converted to a vector embedding with contextual prefixes (document title + section heading)
4. **Store** — Chunks and embeddings are stored in your workspace's knowledge base
5. **Retrieve** — When a user asks a question, the system finds the most relevant chunks using hybrid search (vector similarity + keyword matching)
6. **Inject** — Retrieved context is injected into the agent's prompt before generating a response

## Key Features

### Markdown-Aware Chunking

Documents are split intelligently:
- Headings (`##`, `###`, `####`) define natural section boundaries
- Code blocks are kept intact (never split mid-code)
- Paragraphs within sections are split to stay within size limits
- Overlap between chunks ensures continuity

### Contextual Embeddings

Each chunk is embedded with context from the document title and section heading. This means a chunk about "pricing" in a "Product FAQ" document is embedded differently than "pricing" in a "Competitor Analysis" — improving retrieval accuracy.

### Hybrid Search

Retrieval combines two strategies:
- **Vector similarity** — Semantic matching (understands meaning)
- **Full-text search** — Keyword matching (catches exact terms)
- **Reciprocal Rank Fusion (RRF)** — Merges both rankings for best results

### Chunk Deduplication

When multiple overlapping chunks match a query, the system deduplicates them — keeping the most relevant version and filtering near-duplicates (based on word-level Jaccard similarity).

## Use Cases

- **Product documentation** — Upload your docs so agents can answer "how do I..." questions
- **FAQ** — Upload frequently asked questions and answers
- **Policies** — Company policies, terms of service, return policies
- **Technical specs** — API documentation, integration guides
- **Training materials** — Onboarding guides, playbooks
