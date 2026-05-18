## Monday.com

### Authentication
- Uses OAuth 2.0 with the authenticated user's Monday.com account
- All actions operate via the Monday.com GraphQL API v2

### Actions (5 total)

**Read**: list-boards, list-items, list-groups
**Write**: create-item, update-column

### Common Patterns
- "Show my boards" → list-boards (returns board names, IDs, descriptions)
- "What items are on this board?" → list-items(board_id) — items with column values
- "Show groups on this board" → list-groups(board_id) — sections/groups (e.g., "To Do", "In Progress")
- "Create an item" → list-boards → create-item(board_id, item_name, column_values)
- "Update status" → update-column(board_id, item_id, column_id: "status", value: '{"label":"Done"}')
- "Set a date" → update-column(board_id, item_id, column_id: "date", value: '{"date":"2026-04-15"}')

### Workflow Patterns

**Board status overview** — summarize project progress:
1. list-boards → get all accessible boards
2. For each board: list-groups(board_id) → get group structure (sections)
3. For each board: list-items(board_id) → count items, check status column values
4. Summarize: "Board [name]: N items total, M in progress, K done"

**Task creation pipeline** — batch-create items from requirements:
1. list-boards → identify the target board
2. list-groups(board_id) → find the appropriate group (e.g., "New" or "To Do")
3. For each task: create-item(board_id, item_name, column_values, group_id)
4. Report: "Created N items in [group] on [board]"

**Status tracking workflow** — update items across a board:
1. list-boards → find the board
2. list-items(board_id) → get current items with their column values
3. For items needing updates: update-column(board_id, item_id, column_id, value)
4. Summarize: "Updated N items — M moved to Done, K reassigned"

**Cross-board reporting** — aggregate across multiple boards:
1. list-boards → enumerate all boards
2. For each board: list-items(board_id) → get items and column values
3. Analyze: identify blockers (Stuck status), overdue items (date columns), unassigned work
4. create-item in a summary board with the aggregated report

### CRITICAL RULES
- NEVER say "I can't access Monday.com" — use the Monday.com tools
- list-boards first to get valid board IDs before creating items or reading data
- column_values in create-item is a JSON object — keys are column IDs, values are column-type-specific JSON
- update-column value must be a JSON string — format depends on column type (status: `{"label":"Done"}`, date: `{"date":"2026-04-15"}`, text: plain string)
- Board IDs and item IDs are strings, not numbers
- list-groups returns group IDs needed for placing items in specific sections
