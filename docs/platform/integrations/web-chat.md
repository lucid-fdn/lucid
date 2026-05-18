# Web Chat Integration

Embed a chat widget on your website so visitors can talk to your Lucid agent directly.

## Prerequisites

- A website where you can add JavaScript
- A Lucid agent created and tested

## Setup

### Step 1: Enable Web Chat

1. Go to your agent's **Channels** tab
2. Click **Add Channel > Web Chat**
3. Customize appearance settings (colors, position, welcome message)
4. Click **Create**

### Step 2: Add to Your Website

Copy the embed code and add it to your website's HTML, just before the closing `</body>` tag:

```html
<script
  src="https://lucid.foundation/widget.js"
  data-agent-id="your-agent-id"
  data-theme="dark"
  async
></script>
```

### Step 3: Test

Visit your website and click the chat icon. Send a message to verify your agent responds.

## Customization

| Option | Description | Default |
|--------|-------------|---------|
| `data-theme` | `"light"` or `"dark"` | `"dark"` |
| `data-position` | `"bottom-right"` or `"bottom-left"` | `"bottom-right"` |
| `data-welcome` | Welcome message text | None |
| `data-color` | Primary color (hex) | Brand color |

## Features

- **Streaming responses** — Tokens appear as they're generated
- **Rich content** — Markdown rendering, code blocks, links
- **Persistent sessions** — Conversations persist across page loads (via localStorage)
- **Mobile responsive** — Full-screen on mobile, widget on desktop
- **Typing indicators** — Shows when the agent is thinking

## User Identification

Web chat users are identified by a generated session ID stored in the browser. For authenticated users, you can pass a user ID to link conversations to your user system.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Widget not appearing | Check the embed code is before `</body>` and the script loads |
| CORS errors | Verify your domain is allowed in agent settings |
| Slow responses | Check agent health in Mission Control |
| Styling conflicts | Use the `data-theme` option or custom CSS overrides |
