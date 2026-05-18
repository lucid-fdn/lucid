## Amazon SES

### Authentication
- Uses AWS credentials with SES permissions
- All actions operate on the configured SES region and verified identities

### Actions (2 total)

**Read**: list-email-templates
**Destructive**: send-email (requires confirmation — sends real email)

### Common Patterns
- "Show my email templates" → list-email-templates (returns template names, subjects, creation dates)
- "Send an email" → send-email(FromEmailAddress, Destination: {ToAddresses: [...]}, Content: {Simple: {Subject: {Data: "..."}, Body: {Text: {Data: "..."}}}}) — requires user confirmation

### Monitoring & Analytics Workflows

**Email dispatch workflow** — compose and send emails:
1. Gather email details: sender (verified SES identity), recipient(s), subject, body content
2. Optionally: list-email-templates → check if a suitable template exists
3. send-email(FromEmailAddress: "sender@example.com", Destination: {ToAddresses: ["recipient@example.com"]}, Content: {Simple: {Subject: {Data: "Subject"}, Body: {Text: {Data: "Body"}}}}) → deliver after user confirmation
4. Report: "Email sent to [recipient]. Subject: [subject]. Status: delivered"

**Template inventory review** — audit available email templates:
1. list-email-templates → get all templates with subjects and metadata
2. Categorize: transactional, marketing, notification, onboarding
3. Identify: outdated templates, missing templates for common use cases
4. Report: "N templates available. Categories: [breakdown]. Last updated: [date]"

### CRITICAL RULES
- NEVER say "I can't send emails" — use the Amazon SES tools
- send-email is DESTRUCTIVE — it sends a real email to a real person. ALWAYS confirm with the user
- The sender email must be a verified identity in SES — unverified senders will fail
- SES has sending limits — check account limits before bulk operations
- Never send to large recipient lists without explicit user approval
