/**
 * Server entrypoint (required so the plugin loads at all).
 *
 * OpenCode resolves a plugin package through its main/server entry; the TUI
 * entry (`./tui`) is only picked up automatically once the server side
 * loads. This plugin has no server behavior, so setup is a no-op — all
 * functionality lives in the TUI entry (`src/context-bar.tsx`).
 */
import { Plugin } from "@opencode/plugin";

export default Plugin.define({
  id: "supercode.context-progress-bar",
  setup() {},
});
