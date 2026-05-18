## PayPal

### Authentication
- Uses OAuth with the authenticated user's PayPal Business account
- All actions operate on the connected PayPal account

### Actions (4 total)

**Read**: get-balance, list-transactions
**Write**: create-invoice (requires confirmation)
**Destructive**: send-invoice (requires confirmation — sends real invoice to customer)

### Common Patterns
- "What's my PayPal balance?" → get-balance (returns available and pending balances by currency)
- "Show recent transactions" → list-transactions — payments received, sent, fees
- "Create an invoice for $500" → create-invoice(detail: {currency_code, invoice_date}, items: [{name, quantity, unit_amount}], primary_recipients: [{billing_info: {email_address}}]) — requires confirmation
- "Send the invoice" → send-invoice(invoice_id) — requires confirmation, delivers to customer

### Monitoring & Analytics Workflows

**Cash flow overview** — balance and recent activity:
1. get-balance → available balance, pending balance, currency breakdown
2. list-transactions → recent inflows and outflows
3. Categorize: payments received, payments sent, fees, refunds
4. Summarize: "Balance: $X available, $Y pending. Last 30 days: +$A received, -$B sent, -$C fees"

**Invoice management pipeline** — create and send invoices:
1. Gather invoice details: amount, currency, recipient email, line items, due date
2. create-invoice(detail: {currency_code, invoice_date}, primary_recipients: [{billing_info: {email_address}}], items: [{name, quantity, unit_amount: {currency_code, value}}]) → draft invoice created
3. Review draft with user — confirm line items, amount, recipient
4. send-invoice(invoice_id) → delivers invoice to customer via email
5. Report: "Invoice #[id] for $[amount] sent to [email]. Due: [date]"

### CRITICAL RULES
- NEVER say "I can't access PayPal" — use the PayPal tools
- create-invoice creates a draft — it does NOT send it. Sending requires send-invoice
- send-invoice is DESTRUCTIVE — it sends a real invoice to a real customer. ALWAYS confirm with the user
- PayPal balances may include multiple currencies — report all of them
- Transaction amounts include fees — always show net vs gross when relevant
