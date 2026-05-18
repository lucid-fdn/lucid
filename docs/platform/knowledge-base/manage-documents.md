# Manage Knowledge Base Documents

## Uploading Documents

Navigate to **Knowledge Base** in the sidebar (under AI settings) to manage your workspace's documents.

### Supported Formats

- **Markdown** (`.md`) — Best format, preserves heading structure for optimal chunking
- **Plain text** (`.txt`) — Simple text, chunked by paragraphs
- **PDF** (`.pdf`) — Text extracted and chunked

### Upload Methods

- **File upload** — Drag and drop or browse for a file
- **Paste text** — Paste content directly into the editor
- **URL import** — Fetch content from a web URL

### Size Limits

| Limit | Value |
|-------|-------|
| Max document size | 1,000,000 characters (~250 pages) |
| Max chunks per document | 500 |
| Chunk size | ~2,000 characters |
| Chunk overlap | ~200 characters |

## Document Status

After upload, documents go through a processing pipeline:

| Status | Meaning |
|--------|---------|
| **Pending** | Queued for processing |
| **Processing** | Being chunked and embedded |
| **Ready** | Available for agent retrieval |
| **Error** | Processing failed (check error message) |

## Viewing Documents

The knowledge base page shows all documents in your workspace:

- **Title** — Document name
- **Source** — How it was added (upload, URL, paste, API)
- **Status** — Processing status
- **Chunks** — Number of chunks created
- **Created** — When it was uploaded

Click a document to see its details and chunk count.

## Deleting Documents

To remove a document:

1. Find it in the knowledge base list
2. Click the delete button
3. Confirm deletion

Deleting a document removes all its chunks and embeddings. Agents will no longer retrieve content from that document.

## Project Scoping

Documents can optionally be scoped to a specific project within your workspace. When scoped:

- Only agents in that project retrieve from the document
- Documents without a project scope are available to all agents in the workspace

## Best Practices

### Optimize for RAG

- **Use markdown with clear headings** — Headings create natural chunk boundaries
- **Keep sections focused** — One topic per section (200-500 words ideal)
- **Include the answer, not just the question** — "How do I reset my password? Go to Settings > Security > Reset Password" is better than just "Password Reset"
- **Update, don't duplicate** — Delete old versions before uploading updated documents

### What to Upload

- Product documentation and FAQs
- Standard operating procedures
- Policy documents (returns, refunds, privacy)
- Technical specifications
- Training materials and onboarding guides

### What NOT to Upload

- Sensitive credentials or API keys
- Data that changes frequently (use agent tools instead)
- Extremely large datasets (use a database, not RAG)
- Content already in the system prompt (redundant)
