# Waiting List Setup Guide

This document explains the dedicated waiting list system for Lucid.

## Architecture

### Dedicated Database Table
- **Table**: `waitinglist` (separate from `contacts` table)
- **Location**: Supabase database
- **Purpose**: Store waiting list signups with crypto wallet and social info

### Dedicated API Endpoint
- **Route**: `/api/waitinglist`
- **Method**: POST
- **Purpose**: Handle waiting list submissions independently

## Database Schema

The `waitinglist` table includes:

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `email` | VARCHAR(255) | User email (unique) |
| `solana_wallet` | VARCHAR(44) | Solana wallet address (unique) |
| `discord_id` | VARCHAR(255) | Discord username/ID |
| `twitter_id` | VARCHAR(255) | Twitter/X handle |
| `status` | VARCHAR(50) | pending, approved, invited, active, etc. |
| `created_at` | TIMESTAMP | Signup timestamp |
| `updated_at` | TIMESTAMP | Last update timestamp |
| `metadata` | JSONB | Additional metadata (user agent, IP, etc.) |
| `notes` | TEXT | Admin notes |

### Unique Constraints
- Email addresses are unique (prevent duplicate signups)
- Solana wallet addresses are unique (one wallet per signup)

### Row Level Security (RLS)
- ✅ Public INSERT (anyone can sign up)
- 🔒 Authenticated SELECT (only logged-in users can view)
- 🔒 Authenticated UPDATE (only logged-in users can update)

## Setup Instructions

### 1. Create the Database Table

Run this SQL in your Supabase SQL Editor:

```bash
# File: supabase_waitinglist_table.sql
```

This creates:
- The `waitinglist` table
- Indexes for performance
- RLS policies for security
- Triggers for auto-updating timestamps

### 2. Environment Variables

Ensure these are set in your `.env.local`:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
RESEND_API_KEY=your_resend_api_key (optional for email notifications)
SLACK_WEBHOOK_URL=your_slack_webhook (optional for Slack notifications)
```

### 3. Access the Form

The waiting list form is available at:

```
https://your-domain.com/contact?from=waitinglist
```

## Form Fields

The waiting list form collects:

1. **Email** (required, validated)
2. **Solana Wallet Address** (required, validated with regex)
3. **Discord ID** (required)
4. **Twitter/X ID** (required)
5. **Privacy Policy Agreement** (required checkbox)

## Notifications

When someone joins the waiting list, notifications are sent to:

### Email (via Resend)
- **From**: `waitinglist@lucid.foundation`
- **To**: `waitinglist@lucid.foundation`
- **Subject**: "🎉 New Waiting List Signup"
- **Contains**: All signup details with formatted HTML

### Slack (optional)
- Formatted message with signup details
- Action buttons to email user or view Twitter profile
- Timestamp and status indicator

## Data Flow

```
User fills form at /contact?from=waitinglist
         ↓
ContactForm component (with apiEndpoint="/api/waitinglist")
         ↓
POST /api/waitinglist
         ↓
┌────────────────────┐
│ Validation         │ - Check required fields
│                    │ - Validate Solana address format
└────────────────────┘
         ↓
┌────────────────────┐
│ Supabase Insert    │ - Save to 'waitinglist' table
│                    │ - Handle duplicate errors
│                    │ - Store metadata (IP, user agent, etc.)
└────────────────────┘
         ↓
┌────────────────────┐
│ Send Notifications │ - Email via Resend
│                    │ - Slack webhook
└────────────────────┘
         ↓
Success response to user
```

## Managing Waiting List Signups

### View All Signups

In Supabase Table Editor:
```sql
SELECT * FROM waitinglist ORDER BY created_at DESC;
```

### Filter by Status
```sql
SELECT * FROM waitinglist WHERE status = 'pending';
```

### Update Status
```sql
UPDATE waitinglist 
SET status = 'approved' 
WHERE email = 'user@example.com';
```

### Export to CSV
Use Supabase dashboard's export feature or:
```sql
COPY (SELECT * FROM waitinglist) TO '/tmp/waitinglist.csv' WITH CSV HEADER;
```

## Status Values

Suggested status values for managing the waiting list:

- `pending` - Just signed up (default)
- `approved` - Reviewed and approved
- `invited` - Sent invite/access
- `active` - User is active on platform
- `declined` - Not approved
- `spam` - Flagged as spam

## API Response

### Success
```json
{
  "success": true,
  "message": "Successfully joined the waiting list!"
}
```

### Duplicate Entry
```json
{
  "error": "This email or wallet is already on the waiting list"
}
```
Status: `409 Conflict`

### Validation Error
```json
{
  "error": "All fields are required"
}
```
Status: `400 Bad Request`

## Comparison: Waiting List vs Contact Form

| Feature | Waiting List | Contact Form |
|---------|--------------|--------------|
| Database Table | `waitinglist` | `contacts` |
| API Endpoint | `/api/waitinglist` | `/api/contact` |
| Email Sender | `waitinglist@lucid.foundation` | `contact@form.lucid.foundation` |
| Required Fields | 4 (email, wallet, discord, twitter) | Varies by form type |
| Unique Constraints | Email & Wallet | None |
| Status Tracking | Yes | No |
| Metadata Storage | Yes (JSONB) | No |

## Future Enhancements

Consider adding:
- Admin dashboard to manage waiting list
- Email templates for welcome/approval emails
- Automatic invite sending when status changes to 'approved'
- Referral tracking
- Position number in queue
- Estimated wait time
- Integration with Discord/Twitter APIs for verification

## Troubleshooting

### "Failed to save submission"
- Check Supabase connection
- Verify environment variables
- Check Supabase logs for detailed error

### "Email or wallet already on list"
- User previously signed up
- Check database for existing entry
- Consider allowing status updates for existing entries

### Email notifications not sending
- Verify `RESEND_API_KEY` is set
- Check Resend dashboard for errors
- Verify sender domain is configured

### Slack notifications not working
- Verify `SLACK_WEBHOOK_URL` is set correctly
- Test webhook URL manually
- Check Slack app configuration

## Security Notes

- ✅ RLS policies prevent unauthorized data access
- ✅ Unique constraints prevent duplicate signups
- ✅ Email validation prevents invalid addresses
- ✅ Solana wallet validation (32-44 char base58)
- ✅ Metadata tracking for audit trail
- ⚠️ Consider adding rate limiting for production
- ⚠️ Consider adding CAPTCHA for spam prevention

---

**Questions?** Check the code in:
- `src/app/api/waitinglist/route.ts` - API logic
- `src/components/ContactForm.tsx` - Form component
- `src/app/contact/page.tsx` - Page configuration
