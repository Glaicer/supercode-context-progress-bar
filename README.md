# context-progress-bar

An OpenCode TUI plugin that replaces the built-in `Context` sidebar section
with a progress bar of the same context window, pinned to the first position.

```text
████░░░░░░░░░░░░░░░░ 22.3%
234,230 / 1,048,576
```

Numbers match the hidden section 1:1: `used` from the last assistant message
with `tokens.output > 0` (`input + output + reasoning + cache.read +
cache.write`) against `model.limit.context` of that message's model.
Complements
[`@glaicer/supercode-token-usage-panel`](https://github.com/Glaicer/supercode-token-usage-panel):
that panel shows cumulative session-family spend; this one shows current
context-window occupancy.

- Bar width 20 (`█`/`░`), percent with one decimal, tokens with digit
  grouping. No header, no collapse, no cost row — minimal two-line render.
- Colors come from the live host theme only; no hardcoded colors.
- Session without model responses shows `No model responses yet.` —
  never zeros as fact. Unknown model or non-positive limit shows
  `Context unavailable.` — never `NaN` or zeros as fact.

## Hide mechanism and fallback

`sidebar_content` renders in host-controlled `append` mode (verified in the
1.18.29 binary: no `mode` prop on the host `Slot`, plugin registration carries
only `{ order, slots }`), so a plugin cannot `replace` the built-in section.
The plugin therefore calls
`api.plugins.deactivate("internal:sidebar-context")` on startup — internal
sections live in the same plugin registry, and dispose unregisters their
slot. If deactivation succeeds, the built-in section disappears and this bar
is the only context indicator. On dispose the built-in section is
re-activated, but only if this plugin deactivated it — disabling the plugin
restores the sidebar with no manual edits.

Fallback: if deactivation fails (or the internal id changes in a future
OpenCode), the bar still registers at order 50 — below the internal 100s,
which sort ascending — so it stays first and the built-in section remains
below it. Two indicators of the same window is then visible; the numbers
still agree 1:1. Static alternative: `"plugin_enabled":
{ "internal:sidebar-context": false }` in `tui.json` disables the built-in
section persistently. Core is never forked.

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

## Development

```bash
npm run typecheck   # tsc --noEmit
npm test            # node --test, network-free
npm run build       # precompile Solid TSX into dist
npm pack --dry-run  # build and verify the publish artifact
```
