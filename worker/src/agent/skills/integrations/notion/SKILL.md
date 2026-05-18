## Notion

### Page Hierarchy
- Search for pages with search_pages before creating new ones (avoid duplicates)
- When creating a page, you need a parent_id (page or database ID)
- Use retrieve_block_children to read page content (blocks), not retrieve_page (which returns metadata only)

### Common Patterns
- "Find my meeting notes" → search_pages(query: "meeting notes")
- "Add a note to project X" → search_pages to find it → append_block_children
- "Create a new page" → search_pages for the parent → create_page under it
- "Update the status" → retrieve_page to get current properties → update_page

### Monitoring & Analytics Workflows

**Project status report generator** — build reports from live database data:
1. search-pages(query: "Project Name") → find the project hub
2. retrieve-database → get task database schema (Status, Assignee, Priority, Due Date)
3. query-database with filter: Status != "Done", sorted by priority → open tasks
4. query-database with filter: Status = "Done" AND last_edited_time in past week → completed tasks
5. create-page under project hub: "Status Report - Week of [date]" with summary, completed, in-progress, blocked sections

**Meeting notes → action items pipeline**:
1. search-pages(query: "Meeting Notes [date]") → get-page to read full content + blocks
2. Analyze: identify action items, owners, deadlines, decisions from the notes
3. retrieve-database → get tasks database schema
4. create-page (repeated) → create a task row for each action item with assignee, due date, status="To Do"
5. append-block-children → add "Action Items Created" section back to meeting notes with links

**Knowledge base health audit** — find stale and empty pages:
1. search-pages(query: "") → paginate to scan workspace broadly
2. For each page: check last_edited_time — flag pages not edited in 90+ days
3. retrieve-block-children → check if flagged pages have meaningful content or are stubs
4. list-comments → check for unresolved comments/questions on stale pages
5. create-page: "Wiki Health Report" with stale pages, empty stubs, unanswered comments, suggested actions

**Sprint retrospective compiler** — data-driven retros:
1. search-pages → find sprint board/database → retrieve-database for schema
2. query-database → all items for the sprint with final statuses
3. query-database → items that were blocked → list-comments for blocked items to understand why
4. create-page: "Sprint N Retrospective" with velocity, completion rate, carried over items, blocked root causes, workload distribution

**Research synthesis and compilation** — cross-document intelligence:
1. search-pages with multiple queries (different keywords, synonyms) → cast a wide net
2. get-page (repeated) → read full content from each relevant page
3. Analyze: identify themes, contradictions, data points, gaps across all pages
4. create-page: "Research Brief - [topic]" with executive summary, findings by theme, data gaps
5. append-block-children → add Sources section linking back to each original page

**OKR progress dashboard refresh**:
1. search-pages → find OKR dashboard and KR tracking databases
2. retrieve-database + query-database → pull all active Key Results for current quarter
3. Calculate percentage progress (current/target) for each KR
4. retrieve-block-children on existing dashboard → understand current layout
5. append-block-children → update with progress per objective, on-track/at-risk/off-track categorization

**Changelog and release notes generator**:
1. retrieve-database → get sprint/release board schema
2. query-database → items tagged with release version, filtered to user-facing changes
3. get-page (repeated) → read linked specs/design pages for user-facing descriptions
4. create-page: "Release Notes - vX.Y" with features (rewritten for end users), bug fixes, improvements
5. append-block-children → add toggle "Full Changelog" section with technical details

**Team workload analysis**:
1. list-users → get all workspace members
2. retrieve-database + query-database → all active tasks with assignee, status, effort/story points
3. Analyze: tasks per person, effort per person, blocked items, overdue items
4. create-page: "Workload Analysis" with per-person breakdown, overloaded members flagged
5. create-comment on sprint board: "Workload analysis complete. [Person A] has 3x average load."

### CRITICAL RULES
- NEVER say "I can't access Notion" — use the search and read tools
- When a page is not found, search with broader terms before giving up
- Always clean up test pages (archive_page) after creating them for the user
