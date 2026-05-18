## Slack

### Channel Access
- **Public channels**: Call join_channel FIRST, then send messages or read history. The bot can self-join any public channel.
- **Private channels**: The bot CANNOT self-join — this is a hard Slack platform limitation (conversations.join only works for public channels, and conversations.invite blocks self-invitation). If you get a "channel_not_found", "not_in_channel", or "method_not_supported_for_channel_type" error on a private channel, tell the user: "I need to be invited to that private channel first. A member can type /invite @BotName or add me from channel settings."
- **DMs (direct messages)**: Use send_message with the USER ID (not channel ID) as the channel_id. Slack auto-opens the DM. No join needed.

### Common Patterns
- "Send a message to #general" → join_channel(channel_id) → send_message(channel_id, text)
- "Message @john" → list_users to find John's user ID → send_message(user_id, text)
- "What happened in #marketing?" → join_channel → get_channel_history
- "Search for messages about X" → search_messages (uses workspace-wide search, no channel join needed)
- "Pin this message" → pin_message(channel_id, message_ts)

### Monitoring & Analytics Workflows

**Daily channel digest** — summarize activity across channels:
1. list-channels → identify target channels
2. join-channel for each → get-conversation-history(oldest: 24h ago) per channel
3. For threads with high reply_count: get-thread-replies to expand
4. Analyze: extract decisions, action items, open questions, FYIs
5. send-message or schedule-message → post structured digest to #daily-digest or DM

**Unanswered question detector** — find questions nobody replied to:
1. get-conversation-history(oldest: 4-8h ago) on target channels
2. Filter messages with reply_count=0 and no reactions that contain questions
3. get-user-info for question authors → list-users to find the right responder
4. send-message DM to responder with the unanswered question + permalink
5. add-reaction (eyes emoji) on original message to signal someone is looking

**Cross-channel intelligence report** — aggregate mentions of a topic:
1. search-messages(query: "topic OR keyword", count: 100) — workspace-wide search
2. For top results with threads: get-thread-replies → get full discussions
3. search-files(query: same keywords) — find related docs/spreadsheets
4. get-user-info for key participants — identify who is discussing and their roles
5. Analyze: sentiment, channel distribution, time trends, key themes
6. send-message → post structured intelligence brief

**Meeting decision tracker** — extract and follow up on commitments:
1. get-conversation-history(channel, oldest: meeting_start, latest: meeting_end)
2. For threaded discussions: get-thread-replies to expand side conversations
3. Analyze: extract decisions (with rationale), action items (with owner + deadline), open questions
4. post-message → structured summary to meeting channel
5. For each action item with deadline: schedule-message DM to owner (deadline - 1 day)

**Crisis response coordinator** — spin up and manage incidents:
1. create-conversation(name: "incident-{date}-{slug}") → set-channel-topic with severity/commander
2. set-channel-purpose with incident description
3. list-users → find relevant responders → send-message DM to each
4. send-message to incident channel with template: severity, impact, commander, timeline
5. send-message to #general: "Incident in progress, updates in #incident-{slug}"
6. As updates come: update-message on the status message with new timeline entries

**Knowledge extraction from threads** — mine high-value discussions:
1. get-conversation-history(channel, limit: 200) → identify threads with reply_count > 5
2. get-thread-replies for each high-value thread → get-user-info for key contributors
3. Analyze: distill into problem/question, discussion summary, resolution, key insights
4. join-channel on #knowledge-base → post-message with the structured knowledge article
5. add-reaction (bookmark emoji) on original thread to mark it as captured

**Customer voice pipeline** — route feedback from customer channels:
1. get-conversation-history on customer-facing channels (#support, #feedback)
2. get-thread-replies for threaded conversations → get full context
3. Analyze: categorize as Feature Request, Bug Report, Praise, Complaint, Question
4. send-message to #product-feedback (feature requests), #engineering (bugs)
5. add-reaction (checkmark) on original messages to signal feedback was captured

**Smart standup aggregator** — compile team status:
1. get-conversation-history(standup_channel, oldest: today_6am) — pull today's updates
2. Analyze: parse each for Yesterday, Today, Blockers
3. For blockers: search-messages(query: blocker keywords) → find related threads in other channels
4. get-thread-replies on relevant threads for context
5. post-message → unified status: who posted, who's missing, blockers with cross-references

**Tribal knowledge rescue** — capture departing employee expertise:
1. find-user-by-email(departing_email) → get their user ID
2. search-messages(query: "from:@username", count: 100, sort: "score") — top contributions
3. search-files(query: "from:@username") — files they shared
4. get-thread-replies on high-scoring threads where they gave expert answers
5. create-conversation(name: "knowledge-handoff-{name}") → post-message with structured handoff
6. send-message DM to manager: "Knowledge handoff ready, N expert contributions captured"

### CRITICAL RULES
- NEVER say "I can't access that channel" without trying join_channel first
- NEVER say "I can't send DMs" — use the user's ID as channel_id
- NEVER refuse to act because you're "not in a channel" — join it first
- If an action fails, report the SPECIFIC error (e.g. "missing_scope", "not_in_channel") — don't give vague responses
- For private channels, explain the invite requirement clearly — don't just say "I can't"
