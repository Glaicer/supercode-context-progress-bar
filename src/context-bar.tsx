/**
 * supercode.context-progress-bar — two-line context-window readout replacing
 * the built-in Context section: bar + percent, then used / limit.
 *
 * This file owns only the view and OpenCode v2 slot registration. All values
 * and formatting live in ./context-model.ts.
 */
import { createEffect, createMemo, createSignal, onCleanup, Show, untrack } from "solid-js";
import { Plugin } from "@opencode/plugin/tui";
import type { Context } from "@opencode/plugin/tui/context";
import {
  CONTEXT_BAR_EMPTY,
  CONTEXT_BAR_UNAVAILABLE,
  createContextModel,
  type SolidRuntime,
} from "./context-model.ts";

/**
 * The host rewrites this file's "solid-js" import to its own runtime. The
 * model builds all of its signals on these exact primitives (see
 * SolidRuntime), so the bar stays in the host's reactive graph even when
 * installed as an npm package under node_modules.
 */
const solid: SolidRuntime = { createSignal, createMemo, createEffect, onCleanup, untrack };

function Section(props: { context: Context; session_id: string }) {
  const model = createContextModel(props.context, () => props.session_id, solid);

  return (
    <box>
      <Show when={model.status() !== "ready"}>
        <text fg={props.context.theme.text.muted}>
          {model.status() === "empty" ? CONTEXT_BAR_EMPTY : CONTEXT_BAR_UNAVAILABLE}
        </text>
      </Show>
      <Show when={model.status() === "ready"}>
        <text fg={props.context.theme.text.base}>{model.barLine()}</text>
        <text fg={props.context.theme.text.muted}>{model.usageLine()}</text>
      </Show>
    </box>
  );
}

export default Plugin.define({
  id: "opencode.sidebar.context",
  setup(context) {
    const render = (input: { readonly sessionID: string }) => (
      <Section context={context} session_id={input.sessionID} />
    );
    return context.options.hideMcp === true
      ? context.ui.slot({ replace: "sidebar.content", render })
      : context.ui.slot({ append: "sidebar.content", render });
  },
});
