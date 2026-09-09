/**
 * supercode.context-progress-bar — two-line context-window readout replacing
 * the built-in `internal:sidebar-context`: bar + percent, then used / limit.
 *
 * Numbers are 1:1 with the hidden section (verified against the 1.18.29
 * binary, same mechanism as 1.18.21): last assistant message with
 * `tokens.output > 0`, `used` against `model.limit.context`. This file is
 * only the View plus slot registration: it computes no numbers and formats
 * nothing — all logic lives in ./context-model.ts (the tested seam).
 *
 * Hide mechanism (spike, see README): `sidebar_content` renders in `append`
 * mode (host-controlled, no `replace` available to plugins), so the only
 * host-supported hide is `api.plugins.deactivate("internal:sidebar-context")`
 * — same plugin registry, dispose unregisters its slot. Best-effort: on
 * failure the bar still lands first (order 50 < internal 100) and the
 * built-in section remains; the finding is recorded in README. On dispose the
 * built-in section is re-activated only if this plugin deactivated it, so
 * disabling the plugin restores the sidebar without manual edits.
 *
 * Colors always come from the live host theme; collapse state is component
 * Colors always come from the live host theme; no header, no collapse, no
 * cost row — minimal two-line render per user request.
 */
import { createEffect, createMemo, createSignal, onCleanup, Show, untrack } from "solid-js";
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui";
import {
  CONTEXT_BAR_EMPTY,
  CONTEXT_BAR_ORDER,
  CONTEXT_BAR_UNAVAILABLE,
  INTERNAL_CONTEXT_SECTION_ID,
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

function Section(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current;
  const model = createContextModel(props.api, () => props.session_id, solid);

  return (
    <box>
      <Show when={model.status() !== "ready"}>
        <text fg={theme().textMuted}>
          {model.status() === "empty" ? CONTEXT_BAR_EMPTY : CONTEXT_BAR_UNAVAILABLE}
        </text>
      </Show>
      <Show when={model.status() === "ready"}>
        <text fg={theme().text}>{model.barLine()}</text>
        <text fg={theme().textMuted}>{model.usageLine()}</text>
      </Show>
    </box>
  );
}

const tui: TuiPlugin = async (api) => {
  let hidInternal = false;
  try {
    const internal = api.plugins.list().find((plugin) => plugin.id === INTERNAL_CONTEXT_SECTION_ID);
    if (!internal || internal.enabled) {
      hidInternal = await api.plugins.deactivate(INTERNAL_CONTEXT_SECTION_ID);
    }
  } catch {
    hidInternal = false;
  }
  if (hidInternal) {
    api.lifecycle.onDispose(() => {
      void api.plugins.activate(INTERNAL_CONTEXT_SECTION_ID).catch(() => {});
    });
  }
  // Order 50: sidebar_content sorts ascending (verified in 1.18.29 binary:
  // sort by order, then registration order, then id), internal context sits
  // at 100 — the bar lands first without moving any existing section.
  api.slots.register({
    order: CONTEXT_BAR_ORDER,
    slots: {
      sidebar_content(_ctx, props) {
        return <Section api={api} session_id={props.session_id} />;
      },
    },
  });
};

const plugin: TuiPluginModule = {
  id: "supercode.context-progress-bar",
  tui,
};

export default plugin;
