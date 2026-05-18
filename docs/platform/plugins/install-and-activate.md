# Install and Activate Plugins

## Step 1: Browse the Plugin Catalog

1. Go to your agent's detail page
2. Click the **Plugins** tab
3. Browse or search the available plugins

Each plugin card shows:
- Name and description
- Number of tools included
- Trust level (Internal, Verified, Community)

## Step 2: Install a Plugin

Click **Install** on a plugin to add it to your workspace. Installation makes the plugin available to all agents in your workspace, but doesn't activate it on any agent yet.

During install, Lucid prepares the plugin's tool manifest:

- normalizes JSON Schema
- rejects hard-invalid tools
- stores a normalized `manifest_snapshot` plus manifest metadata for runtime use

See [Tool Manifest Pipeline](./tool-manifests.md) for the full lifecycle.

You can also install plugins from **Workspace Settings > Plugins**.

## Step 3: Activate on an Agent

After installing, activate the plugin on specific agents:

1. Go to the agent's **Plugins** tab
2. Find the installed plugin
3. Click **Activate**
4. Optionally, toggle individual tools on/off

Activation limit rule:

- the legacy hard cap applies to active **plugins**
- OAuth/API-key **integrations do not consume** that plugin cap
- if an assistant is already at the plugin cap, the UI should block additional plugin activation proactively and explain why before the request is sent

### Per-Tool Control

You don't have to enable all tools in a plugin. For example, if you install the trading plugin but only want your agent to check prices (not execute swaps), you can:

- Enable `get_price` and `get_portfolio`
- Disable `dex_swap` and `wallet_transfer`

This gives you fine-grained control over what each agent can do.

## Managing Plugins

### Viewing Active Plugins

On the agent's **Plugins** tab, you see:
- All activated plugins with their enabled tools
- Execution statistics (calls, success rate, avg latency)
- Configuration options per plugin

### Deactivating a Plugin

Click **Deactivate** on an active plugin to remove it from the agent. The plugin stays installed in your workspace — you can reactivate it anytime.

For integrations, disconnecting the external account does not necessarily uninstall the integration. A disconnected integration can stay installed while requiring setup again. In that state it should no longer count as an active connected skill for the agent.

### Uninstalling a Plugin

From **Workspace Settings > Plugins**, click **Uninstall** to remove a plugin from your workspace entirely. This deactivates it from all agents.

## Plugin Configuration

Some plugins accept configuration parameters (API keys, thresholds, preferences). Configure these when activating the plugin on an agent:

1. Click the plugin's settings icon
2. Fill in the configuration fields
3. Save

Configuration is per-agent — the same plugin can have different settings on different agents.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Agent doesn't use the plugin | Check that the plugin is both installed AND activated |
| Plugin call fails | Check Mission Control for error details in the live feed |
| Tool not appearing | Verify the specific tool is toggled on (not just the plugin) |
| Integration looks installed but unavailable | Check whether the connection is disconnected or `setup_required` |
| Plugin activation blocked | The assistant already has the maximum number of active plugins; deactivate one plugin before enabling another |
| Integration activation blocked by plugin cap | This should no longer happen; integrations are installed/activated separately from the hard plugin cap |
