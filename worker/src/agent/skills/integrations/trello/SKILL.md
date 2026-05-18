## Trello

### Authentication
- Uses OAuth with the authenticated user's Trello account
- All actions operate on boards the user has access to

### Actions (5 total)

**Read**: list-boards, list-cards, list-lists
**Write**: create-card, update-card

### Common Patterns
- "Show my boards" → list-boards (returns board names, IDs, descriptions)
- "What cards are in this list?" → list-cards(list_id) — all cards in a specific list
- "Show lists on this board" → list-lists(board_id) — column structure (To Do, In Progress, Done)
- "Create a task" → create-card(name, idList, desc) — adds card to specified list
- "Move card to Done" → update-card(card_id, idList: doneListId) — moves between lists
- "Add a due date" → update-card(card_id, due: "2026-04-15")

### Monitoring & Analytics Workflows

**Board status overview** — summarize project progress:
1. list-boards → get all boards for the user
2. For each board: list-lists(board_id) → get column structure
3. For each list: list-cards(list_id) → count cards, identify overdue (due date in past)
4. Summarize: "Board [name]: N cards total, M in progress, K overdue"

**Task creation pipeline** — batch-create cards from requirements:
1. list-boards → identify the target board
2. list-lists(board_id) → find the appropriate list (e.g., "To Do" or "Backlog")
3. For each task: create-card(name, idList, desc) → add with description
4. Report: "Created N cards in [list name] on [board name]"

### CRITICAL RULES
- NEVER say "I can't manage Trello" — use the Trello tools
- Always list-boards and list-lists first to get valid IDs before creating/updating cards
- update-card requires the card ID — use list-cards to find it first
- Moving a card between lists uses update-card with the target idList
