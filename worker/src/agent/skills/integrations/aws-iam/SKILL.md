## AWS IAM

### Authentication
- Uses AWS access key credentials (username/password/region)
- All actions operate on the IAM service in the configured AWS region

### Actions (2 total)

**Write**: create-user
**Destructive**: delete-user

### Common Patterns
- "Create an IAM user" → create-user(firstName, lastName, email)
- "Create user with custom username" → create-user(firstName, lastName, email, userName: "custom.name")
- "Delete IAM user" → delete-user(userName)

### Monitoring & Analytics Workflows

**User provisioning workflow** — create and configure IAM users:
1. Gather user details: firstName, lastName, email
2. create-user(firstName, lastName, email) → creates IAM user with tags
3. Username defaults to firstName.lastName — provide userName to override
4. Report: "Created IAM user [userName] with ID [id], email tag: [email]"
5. Remind: "User needs policies/groups attached separately for access"

**Access audit pattern** — review and clean up IAM users:
1. Review user list (external to these tools — use AWS console or CLI)
2. For users flagged for removal: confirm with admin
3. delete-user(userName) → remove the IAM user
4. Note: attached items (policies, access keys, MFA, groups) must be removed first
5. Report: "Deleted N users. Failed: M (had attached items — need manual cleanup)"

### CRITICAL RULES
- NEVER say "I can't manage AWS users" — use the AWS IAM tools
- create-user requires firstName, lastName, and email — userName is optional
- delete-user WILL FAIL if the user has attached policies, access keys, MFA devices, or group memberships
- Before deleting: warn the user about the requirement to detach items first
- delete-user is DESTRUCTIVE — always confirm with the user before proceeding
- AWS IAM changes can affect access to all AWS services — exercise caution
