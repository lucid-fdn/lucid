# WhatsApp Integration

Connect your Lucid agent to WhatsApp Business so it can respond to customer messages on WhatsApp.

Lucid uses the official Meta WhatsApp Cloud API for WhatsApp delivery. Control-plane outbound delivery now runs through the same managed relay/shim boundary as the other server-delivered channels, but it does not depend on the OpenClaw runtime package for WhatsApp-specific sends.

Lucid now supports three setup paths:

- **Hosted WhatsApp**: Lucid owns the shared WhatsApp number. Users bind chats to agents with a connect link.
- **BYOB manual**: a workspace admin brings their own WhatsApp Business number and pastes the channel credentials manually.
- **BYOB via Meta Embedded Signup**: a workspace admin uses Meta's guided Embedded Signup flow, and Lucid creates or refreshes the BYOB channel automatically.

## Prerequisites

- A Meta Business account
- A WhatsApp Business API account
- A Lucid agent created and tested

## Setup

Choose the setup path that matches your deployment.

## Hosted WhatsApp

Hosted WhatsApp is the default Lucid-owned path. It works best when you want the fastest agent onboarding and do not need each customer to bring their own Meta number.

### Deployment requirements

Enable the hosted flow and configure these env vars on the app deployment:

- `FEATURE_WHATSAPP_HOSTED=true`
- `WHATSAPP_HOSTED_PHONE_NUMBER`
- `WHATSAPP_HOSTED_PHONE_NUMBER_ID`
- `WHATSAPP_HOSTED_ACCESS_TOKEN`
- `WHATSAPP_HOSTED_APP_SECRET`
- `WHATSAPP_HOSTED_VERIFY_TOKEN`

Meta webhook callback:

- `https://<your-domain>/api/webhooks/whatsapp/hosted`

### Hosted connect flow

1. Open the assistant in Lucid Studio.
2. Open the WhatsApp manager and choose **Generate WhatsApp connect link**.
3. Open the generated `wa.me` link on a phone.
4. Send the prefilled `connect <token>` message.
5. Lucid binds that WhatsApp chat to the selected agent.

Hosted WhatsApp manager capabilities:

- current chat owner
- default agent for new chats on the hosted number
- per-chat aliases
- voice mode settings per chat

## BYOB manual

### Step 1: Set Up WhatsApp Business API

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create or select your app
3. Add the **WhatsApp** product
4. Complete business verification if required
5. Get your **Phone Number ID** and **Access Token**

### Step 2: Connect in Lucid

1. Go to your agent's **Channels** tab
2. Click **Add Channel > WhatsApp**
3. Enter your Phone Number ID, Access Token, App Secret, and Verify Token
4. Click **Connect**
5. Configure the webhook URL provided by Lucid in your Meta app settings

After the channel is connected, the Lucid WhatsApp manager shows the persistent BYOB handoff values again:

- callback URL
- verify token
- phone number ID
- business phone number
- WABA / business account ID when available

Use the manager whenever you need to repair or confirm the Meta-side webhook configuration.

## BYOB via Meta Embedded Signup

Embedded Signup keeps the same BYOB runtime model, but it replaces most manual credential copy/paste with Meta's guided onboarding flow.

### Deployment requirements

Enable the Embedded Signup flow and configure:

- `FEATURE_WHATSAPP_EMBEDDED_SIGNUP=true`
- `WHATSAPP_EMBEDDED_SIGNUP_APP_ID`
- `WHATSAPP_EMBEDDED_SIGNUP_APP_SECRET`
- `WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID`

### Embedded Signup flow

1. Open the assistant in Lucid Studio.
2. Add or manage a WhatsApp BYOB channel.
3. Click **Continue with Meta**.
4. Complete Meta Embedded Signup.
5. Lucid exchanges the returned code, creates or reactivates the BYOB channel, and shows the generated callback URL and verify token.
6. Confirm the webhook settings in Meta if the Meta flow does not finish them automatically for your configuration.

Manual BYOB remains available as a fallback if Embedded Signup is disabled or if Meta onboarding fails.

### Step 3: Test

Send a message to your WhatsApp Business number. Your agent should respond.

## Features

- **Text messages** — Full conversational support
- **Media-aware ingress** — Images and documents are preserved as inbound context notes
- **Voice notes / audio** — Incoming WhatsApp audio is transcribed through Lucid's shared media pipeline when STT is configured
- **Templates** — WhatsApp message templates for outbound
- **Business hours** — Configurable auto-responses outside business hours

## Hosted chat controls

On Lucid-hosted WhatsApp chats, the connected user can use lightweight text commands:

- `help`
- `agents`
- `whoami`
- `voice`
- `voice off`
- `voice auto`
- `voice always`
- `voice set <voice>`
- `ops <workflow> <target>`
- `check <url>`
- `buy <request>`
- `research <url>`
- `extract <what> from <url>`
- `monitor <url>`
- `switch <agent name>`
- `leave`

That keeps the hosted WhatsApp surface closer to Telegram and Discord without forcing a separate control UI.

Agent Ops and Browser Operator examples:

- `ops qa https://preview.example.com`
- `check https://www.example.com`
- `research https://competitor.example.com`
- `extract pricing from https://www.example.com/pricing`
- `monitor https://status.example.com`

No Meta-side command registration is required. WhatsApp commands are plain chat text parsed by Lucid after the hosted chat is connected or a hosted-surface default is configured.

## Hosted routing and defaults

Hosted WhatsApp now uses the same shared ownership model as the other managed channels:

- a **hosted-number default** decides which agent catches new chats on that hosted WhatsApp surface
- a **chat default** decides which agent owns one specific WhatsApp chat
- **aliases** can be managed per hosted chat so admins can route explicitly without renaming the underlying agent

The Lucid Studio WhatsApp manager exposes all three directly:
- current chat owner
- default agent for new chats on that hosted number
- alias add/remove controls

Hosted voice behavior:

- voice settings live on the hosted chat binding via `channel_config`
- `voice auto` replies in audio only when the inbound WhatsApp message was audio
- `voice always` prefers audio first, then falls back to text if TTS or media delivery fails
- `voice set <voice>` picks the voice id used for future WhatsApp audio replies on that chat binding
- speech generation still uses Lucid's shared media gateway and TrustGate-first provider policy

## User Identification

Each WhatsApp user gets a unique scoped identity: `whatsapp:<phone_number>`. Memories and conversations are per-phone-number.

## Important Notes

- WhatsApp has a **24-hour messaging window** — you can only send messages to users who have messaged you in the last 24 hours (unless using approved templates)
- **Business verification** may be required for production use
- Message **throughput limits** apply based on your WhatsApp Business tier
- Embedded Signup still requires a properly configured Meta app and business approval path for real production use
- BYOB, hosted, and Embedded Signup all converge on the same Lucid shared worker and agent runtime once the channel is provisioned

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Not receiving messages | Check webhook URL configuration in Meta app settings |
| Can't send responses | Verify access token and phone number ID |
| Hosted connect-link generation is disabled | Check `FEATURE_WHATSAPP_HOSTED` and the `WHATSAPP_HOSTED_*` env vars |
| Embedded Signup is unavailable | Check `FEATURE_WHATSAPP_EMBEDDED_SIGNUP` and the `WHATSAPP_EMBEDDED_SIGNUP_*` env vars |
| Template messages failing | Ensure templates are approved in Meta Business Manager |
| Rate limited | Check your WhatsApp Business tier limits |
