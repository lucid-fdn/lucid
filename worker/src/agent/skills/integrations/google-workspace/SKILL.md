## Google Workspace Cross-Service Workflows

These workflows chain Calendar + Gmail + Sheets + Drive tools together. This is where the real power is.

**Executive morning briefing** — synthesized daily overview:
1. list-upcoming-events → today's calendar (meetings, deadlines)
2. search-emails(query: "is:unread after:YESTERDAY") → read-email for top priority messages
3. list-spreadsheets(query: "KPI") → get-values to pull headline metrics
4. Synthesize: calendar overview + email highlights + KPI data into structured briefing
5. send-email(to: self, subject: "Morning Briefing - [date]", body: briefing)

**Meeting prep dossier** — assemble context before any meeting:
1. get-event(eventId) → get attendees, description, links
2. For each attendee: search-emails(query: "from:{email}") → read-email for recent correspondence
3. find-file(name: "{company_or_topic}") → get-file-metadata for last modified dates
4. Synthesize: who's attending, last conversation topics, open items, relevant docs
5. upload-document(name: "Meeting Prep - [title].txt") → update-event(description: "Prep: [link]")

**Sales pipeline tracker** — email signals → spreadsheet:
1. search-emails(query: "subject:(proposal OR contract OR pricing) after:LAST_WEEK")
2. read-email for each → extract company, contact, amounts, next steps
3. list-spreadsheets(query: "Sales Pipeline") → get-values to read existing pipeline
4. For existing deals: upsert-row to update status/notes. For new: create-spreadsheet-row
5. send-email to sales manager with pipeline update summary

**Automated meeting follow-up** — close the loop after meetings:
1. list-events(timeMin: 1h_ago, timeMax: now) → get-event for recently ended meetings
2. search-emails(query: "subject:{meeting_title}") for pre-meeting context
3. Draft follow-up: summary, action items, next steps
4. send-email to each attendee with personalized follow-up
5. create-event for follow-up meeting if needed
6. append-values-to-spreadsheet to log action items in a tracker

**Email triage and priority router** — autonomous inbox management:
1. search-emails(query: "is:unread") → read-email for each
2. Classify: urgent/action-required, FYI, routine/autorespond
3. For routine: reply-to-email with acknowledgment
4. For action-required: create-event to block time for response
5. create-spreadsheet-row to log triage decisions
6. send-email summary: "Processed N emails, M need your attention"

**Scheduling intelligence** — multi-calendar coordination:
1. find-free-slots(calendarIds: ["primary"], durationMinutes: 60) → your open windows
2. query-free-busy(items: [{id: attendee1}, {id: attendee2}]) → attendee availability
3. Cross-reference: find overlapping free windows
4. create-event with best slot + attendees
5. send-email confirmation to all attendees

**Client onboarding orchestrator** — full workspace setup in one command:
1. create-folder(name: "Client - [company]") → create-folder("Deliverables", parentId)
2. create-spreadsheet(title: "[Company] - Project Tracker") → append-values-to-spreadsheet with headers
3. upload-document(name: "Onboarding Checklist.txt", folderId: client_folder)
4. share-file(folderId, email: client, role: "writer") → share everything
5. create-event(summary: "Kickoff: [Company]", attendees) → schedule kickoff
6. send-email welcome with links to all created resources

**Cross-service search and synthesis** — "find everything about X":
1. search-emails(query: topic) → find-file(name: topic) → list-spreadsheets(query: topic)
2. list-events filtered by topic → find related meetings
3. read-email + get-values + get-file-metadata for each relevant result
4. Synthesize: timeline of all interactions, documents, data, and meetings
5. upload-document: "Research Brief - [topic].txt" with unified findings

**Recurring data collection** — automated survey and aggregation:
1. get-values(spreadsheetId, "Team!A:B") → get team list
2. send-email to each: "Please reply with [metric1], [metric2], [metric3]"
3. Later: search-emails(query: "subject:request after:send_date") → read-email to extract data
4. upsert-row for each response (updates, doesn't duplicate)
5. For non-responders: send-email reminder → send-email final summary when all collected

**Expense/invoice tracker** — email → Drive + spreadsheet:
1. search-emails(query: "subject:(invoice OR receipt) has:attachment after:LAST_MONTH")
2. read-email → extract vendor, amount, date, invoice number
3. fetch-attachment → upload-document to Drive invoices folder
4. upsert-row in expense tracker spreadsheet
5. send-email to finance team with summary of new invoices logged
