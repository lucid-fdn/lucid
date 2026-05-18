# iMessage Integration

For the canonical current-state architecture, including BYOB vs hosted behavior and the shared alias/default routing model, see `docs/platform/agents/channels.md`.

## Current Model

Lucid supports two iMessage modes:

- `Hosted`
  - Lucid owns the control plane, routing, aliases, defaults, and admin UI
  - a managed provider node owns the Apple/iMessage transport
  - best when you want the same hosted experience as WhatsApp or Telegram, but backed by an iMessage provider surface
- `BYOB`
  - you provide your own iMessage bridge or `imsg` runtime
  - Lucid receives normalized inbound messages on a webhook and sends replies through your configured transport

## Hosted iMessage

Hosted iMessage is the fastest path when you want Lucid to manage routing and agent ownership while a provider node handles the Apple transport.

Studio flow:
1. Open the agent in Lucid Studio
2. Go to `Channels`
3. Choose `iMessage`
4. Choose hosted mode
5. Generate hosted provider credentials
6. Attach or restart the provider node with those credentials

Hosted behavior:
- Lucid creates one hosted iMessage surface per connected Apple/account transport identity
- the surface can have:
  - a default agent for new chats
  - per-chat default overrides
  - aliases scoped to that hosted surface
- inbound messages are normalized into Lucid events before the worker runs the assistant
- outbound replies are queued by Lucid and claimed by the provider node for final delivery

### Hosted defaults and aliases

Hosted iMessage uses the same shared admin model as the other hosted channels:

- **Surface default** — which Lucid agent should answer new iMessage chats on this hosted surface
- **Per-chat override** — which Lucid agent owns one specific iMessage chat target
- **Aliases** — short names like `sales` or `support` that can be used for explicit targeting

### Hosted provider node

The provider node is the transport companion that owns:
- iMessage monitoring
- heartbeat / health
- dispatch claiming
- final Apple transport sends

Lucid exposes three internal URLs through the hosted iMessage panel:
- provider heartbeat URL
- provider dispatch URL
- provider ingress URL

The provider node uses those URLs plus the hosted surface token to:
- report health
- forward inbound iMessage messages
- claim outbound work
- acknowledge delivery success or retryable failure

## BYOB iMessage

Use BYOB when you already run your own iMessage bridge or `imsg` transport and want Lucid to stay at the webhook/control-plane layer.

Studio flow:
1. Open the agent in Lucid Studio
2. Go to `Channels`
3. Choose `iMessage`
4. Choose BYOB mode
5. Generate a webhook URL and secret
6. Configure your iMessage bridge to POST normalized inbound events to that webhook

Lucid will:
- verify the webhook secret
- normalize inbound messages into the shared assistant event model
- route replies back through your configured `imsg` sender settings

## Normalized inbound shape

Lucid expects iMessage inbound payloads to include:
- `messageId`
- `chatId`
- `senderId`
- optional `senderName`
- optional `text`
- optional `replyToId`
- optional `attachments`

Hosted provider ingress and BYOB webhook delivery both use the same normalized message shape so routing stays shared.

## Features

- **BYOB and hosted modes**
- **Chat-level ownership**
- **Surface-level default agent**
- **Alias management**
- **Reply threading**
- **Attachment-aware inbound notes**
- **Shared worker routing and delivery lifecycle**

## Hosted Chat Commands

Hosted iMessage commands are plain chat text parsed by Lucid:

- `help`
- `agents`
- `whoami`
- `status`
- `ops <workflow> <target>`
- `check <url>`
- `buy <request>`
- `research <url>`
- `extract <what> from <url>`
- `monitor <url>`
- `switch <agent name>`

Agent Ops and Browser Operator examples:

- `ops qa https://preview.example.com`
- `check https://www.example.com`
- `research https://competitor.example.com`
- `extract pricing from https://www.example.com/pricing`
- `monitor https://status.example.com`

No Apple-side command registration is required. The hosted provider node forwards normalized text to Lucid, and Lucid routes these commands through the shared Agent Ops launcher.

## Troubleshooting

| Issue | What to check |
|-------|---------------|
| Hosted surface never becomes healthy | Provider node is running, surface token is correct, and heartbeat is reaching Lucid |
| Hosted inbound messages never route | Provider node can reach the hosted ingress URL and the surface token matches the current surface |
| Hosted replies stay queued | Provider node is not claiming dispatches or cannot send through the configured Apple transport |
| BYOB inbound messages fail | Verify the webhook secret and that your bridge sends the normalized Lucid payload |
| BYOB replies fail | Verify `imsg`/bridge runtime config such as CLI path, DB path, service, region, and account id |
