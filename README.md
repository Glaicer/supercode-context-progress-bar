# context-progress-bar

An OpenCode plugin that replaces the built-in `Context` section in the TUI sidebar with a progress bar.

```text
████░░░░░░░░░░░░░░░░ 22.3%
234,230 / 1,048,576
```

Pairs with [`@glaicer/supercode-token-usage-panel`](https://github.com/Glaicer/supercode-token-usage-panel): that one shows total spend for the session family, this one shows window occupancy.

## Install

The plugin is built for OpenCode ≥ 2.0.10.

Install with the OpenCode CLI — it installs the package and registers it in the global configuration (`~/.config/opencode/opencode.jsonc`):

```bash
opencode plugin add @glaicer/supercode-context-progress-bar
```

The package exposes both a server entry (`.`) and a TUI entry (`./tui`), so the CLI picks the progress bar up automatically — no `cli.json` entry is needed. Restart OpenCode after installing.

By default, the progress bar replaces only OpenCode's built-in Context section; the MCP section stays visible. To hide MCP too, pass the TUI plugin option in `~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "@glaicer/supercode-context-progress-bar",
      "options": { "hideMcp": true }
    }
  ]
}
```

Keep the plugin in `opencode.json(c)` when adding this CLI option; `cli.json` supplies the TUI-specific setting.

Manage installed plugins with:

```bash
opencode plugin list      # what's installed
opencode plugin update    # update outdated packages
opencode plugin remove @glaicer/supercode-context-progress-bar
```

For a project-local install (or to pin a version), add the package to the `plugins` array in `opencode.json(c)` (global `~/.config/opencode/opencode.jsonc`, or local `<project>/opencode.json(c)` / `<project>/.opencode/opencode.json(c)`):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["@glaicer/supercode-context-progress-bar"]
}
```

> [!IMPORTANT]
> **The first OpenCode load after installing this plugin may be slow.** That's OpenCode downloading the plugin's packages and managed tools into its cache — it happens once. Every subsequent start is fast.
