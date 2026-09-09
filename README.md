# context-progress-bar

An OpenCode plugin that replaces the built-in `Context` section in the TUI sidebar with a progress bar.

```text
████░░░░░░░░░░░░░░░░ 22.3%
234,230 / 1,048,576
```

Pairs with [`@glaicer/supercode-token-usage-panel`](https://github.com/Glaicer/supercode-token-usage-panel): that one shows total spend for the session family, this one shows window occupancy.

## Install

Install with the OpenCode CLI — it detects the TUI target and registers the plugin in `tui.json` for you:

```bash
opencode plugin @glaicer/supercode-context-progress-bar
```

- `--global` installs into the global config (`~/.config/opencode`); default is local (`.opencode` in the current project).
- `--force` replaces an already-installed version.
- Restart OpenCode after installing.

Manual install also works: add the package to the `plugin` array in `tui.json` (global `~/.config/opencode/tui.json` or local `<project>/.opencode/tui.json`):

```jsonc
{
  "plugin": ["@glaicer/supercode-context-progress-bar"]
}
```

> [!IMPORTANT]
> **The first OpenCode load after installing this plugin may be slow.** That's OpenCode downloading the plugin's packages and managed tools into its cache — it happens once. Every subsequent start is fast.
