## GitHub

### Authentication
- Uses OAuth with the authenticated user's GitHub account
- All actions operate on repositories the user has access to

### Actions (5 total)

**Read**: list-repos, list-issues, list-pull-requests
**Write**: create-issue, write-file

### Common Patterns
- "Show my repos" → list-repos (returns name, description, language, stars, forks, open issues)
- "What repos do I have?" → list-repos(type: "owner") — only repos you own
- "Show open issues in my-repo" → list-issues(owner, repo, state: "open")
- "List PRs for review" → list-pull-requests(owner, repo, state: "open")
- "Create a bug report" → create-issue(owner, repo, title, body, labels: ["bug"])
- "File a feature request" → create-issue(owner, repo, title: "Feature: X", body, labels: ["enhancement"])
- "Write a config file" → write-file(owner, repo, path, message, content)
- "Update README" → write-file(owner, repo, "README.md", "Update readme", content)

### Monitoring & Analytics Workflows

**PR review pipeline** — list PRs, check status, summarize changes:
1. list-pull-requests(owner, repo, state: "open") → get all open PRs
2. For each PR: analyze title, branch names, draft status, additions/deletions/changed_files
3. Categorize: ready for review (non-draft, small diff), needs attention (large diff), stale (old updated_at)
4. Summarize: "N PRs open, M ready for review, K are drafts, total +X/-Y lines changed"

**Issue triage workflow** — list issues, categorize, assign priority:
1. list-issues(owner, repo, state: "open") → get all open issues
2. Analyze labels, comment count, age (created_at vs now), assignees
3. Categorize: bugs (has "bug" label), features, questions, unassigned, stale (no activity 30+ days)
4. Priority: high (bugs with no assignee), medium (features with discussion), low (old questions)
5. Summarize: triage report with recommended actions per category

**Repository audit** — list repos, check activity, identify stale:
1. list-repos(type: "owner", sort: "updated") → all owned repos
2. For each repo: check updated_at age, open_issues_count, language, stars
3. Flag stale repos (no updates in 90+ days), repos with high open issue counts
4. Identify: active repos, archived candidates, repos needing attention
5. Report: "N repos total, M active, K stale (candidates for archiving), top languages"

**Code deployment tracker** — monitor repo activity for deployment awareness:
1. list-pull-requests(owner, repo, state: "closed") → recently merged PRs
2. list-issues(owner, repo, labels: "deployed,released") → deployment-tagged issues
3. Cross-reference: which PRs shipped, which are pending
4. Summarize: "Last deployment included N PRs, M issues resolved, notable changes: ..."

**Documentation sync** — write auto-generated docs to repo:
1. Gather data from other tools or analysis
2. write-file(owner, repo, "docs/auto-generated.md", "Update auto-generated docs", content)
3. For config files: write-file(owner, repo, path, "Sync configuration", content)
4. Verify: list-repos to confirm repo exists before writing

### CRITICAL RULES
- NEVER say "I can't access GitHub" — use the GitHub tools
- list-issues filters out pull requests automatically (GitHub API mixes them)
- write-file creates the file if it doesn't exist, updates it otherwise
- write-file requires owner, repo, path, message, and content — all mandatory
- For write-file updates, the SHA is resolved automatically
- Use list-repos to discover repo names before operating on them
