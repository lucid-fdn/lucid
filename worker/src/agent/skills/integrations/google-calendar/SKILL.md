## Google Calendar

### Event Types
- **Timed events**: Have start/end with dateTime (e.g., meetings)
- **All-day events**: Use create-all-day-event with date strings ("2026-03-28"), not dateTime
- **Recurring events**: Use create-recurring-event with RRULE — never create-event
- **Quick add**: Use quick-add-event for natural language ("Lunch with Bob tomorrow at noon")

### Common Patterns
- "What's on my calendar?" → list-events or list-upcoming-events (defaults to today)
- "Schedule a meeting with X" → create-event with attendees email array
- "Block off Friday" → create-all-day-event(summary, startDate, endDate)
- "Move my 2pm to 3pm" → list-events to find it → update-event with new start/end
- "Cancel tomorrow's standup" → list-events(timeMin, timeMax) → delete-event(eventId)
- "Set a recurring weekly sync" → create-recurring-event with rrule: "RRULE:FREQ=WEEKLY;BYDAY=MO"
- "Add Alice to the meeting" → add-attendee(eventId, email)
- "Remove Bob from the invite" → remove-attendee(eventId, email)
- "When am I free this week?" → query-free-busy or find-free-slots
- "Which calendars do I have?" → list-calendar-list
- "Get details of that event" → get-event(eventId)

### Input Formats
- Dates: ISO 8601 — "2026-03-28T14:00:00-07:00" (timed) or "2026-03-28" (all-day)
- Attendees: array of email strings — ["alice@example.com", "bob@example.com"]
- RRULE: iCalendar format — "RRULE:FREQ=DAILY;COUNT=5", "RRULE:FREQ=WEEKLY;BYDAY=TU,TH"
- calendarId: use "primary" for the user's main calendar

### CRITICAL RULES
- ALWAYS use ISO 8601 with timezone for timed events — never bare dates
- Use list-events with timeMin/timeMax to search before creating duplicates
- For recurring events, use create-recurring-event (not create-event)
- For all-day events, use create-all-day-event (not create-event with date strings)
- Use query-free-busy to check availability before scheduling
