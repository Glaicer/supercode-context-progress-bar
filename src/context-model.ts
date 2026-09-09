/**
 * Context Model — every number, formula and string of the Context progress bar.
 *
 * Parity target is the built-in `internal:sidebar-context` section
 * (OpenCode 1.18.29 binary, same mechanism as 1.18.21): the last assistant
 * message with `tokens.output > 0`, `used` as the sum of all token buckets
 * against `model.limit.context` of that message's model, and `Cost` from
 * `session.cost` of the open session. The view (context-bar.tsx) renders only
 * the ready strings exposed here and computes nothing.
 *
 * States: `ready` (bar + numbers), `empty` (session has no model responses —
 * honest placeholder, never zeros as fact), `unavailable` (unknown model,
 * non-positive limit, or unreadable state — never NaN/zeros as fact).
 */

import type * as Solid from "solid-js";
import type { AssistantMessage, Message } from "@opencode-ai/sdk/v2";
import type { TuiPluginApi } from "@opencode-ai/plugin/tui";

export type ContextStatus = "ready" | "empty" | "unavailable";

export const CONTEXT_BAR_TITLE = "Context";

export const CONTEXT_BAR_EMPTY = "No model responses yet.";

export const CONTEXT_BAR_UNAVAILABLE = "Context unavailable.";

export const CONTEXT_COST_LABEL = "Cost";

/** Built-in section this plugin replaces (best-effort hide, see README). */
export const INTERNAL_CONTEXT_SECTION_ID = "internal:sidebar-context";

/** Slot order below the internal 100s: sidebar_content sorts ascending. */
export const CONTEXT_BAR_ORDER = 50;

/** Bar geometry: fixed width, fill/empty cells, one-decimal percent. */
export const CONTEXT_BAR_WIDTH = 20;
export const CONTEXT_BAR_FILLED = "█";
export const CONTEXT_BAR_EMPTY_CELL = "░";

/** Placeholder for missing values: never render NaN/Infinity as a number. */
export const CONTEXT_DASH = "–";

export interface ContextModel {
  status: () => ContextStatus;
  /** `████████░░░░░░░░░░░░ 41.1%` — ready only, empty string otherwise. */
  barLine: () => string;
  /** `82,102 / 200,000` — ready only, empty otherwise. */
  usageLine: () => string;
  /** `$0.01` — ready only, dash otherwise. */
  costText: () => string;
}

/**
 * Reactive primitives owned by the TUI entrypoint (same pattern as
 * token-usage-panel): the entry imports these from "solid-js" where the host
 * rewrites them to its own runtime. context-model.ts must not value-import
 * "solid-js" itself, or an npm-installed copy can miss the host prescan and
 * freeze the panel on its first paint.
 */
export interface SolidRuntime {
  createSignal: typeof Solid.createSignal;
  createMemo: typeof Solid.createMemo;
  createEffect: typeof Solid.createEffect;
  onCleanup: typeof Solid.onCleanup;
  untrack: typeof Solid.untrack;
}

interface Snapshot {
  sessionID: string;
  status: ContextStatus;
  barLine: string;
  usageLine: string;
  costText: string;
}

function safe(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

function positive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function groupDigits(value: number): string {
  return String(Math.trunc(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function formatTokens(value: number): string {
  return groupDigits(value);
}

export function formatCost(value: number): string {
  return `$${safe(value).toFixed(2)}`;
}

function lastAssistantWithOutput(messages: readonly Message[]): AssistantMessage | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i] as Message;
    if (message.role !== "assistant") continue;
    const tokens = (message as AssistantMessage).tokens;
    if (safe(tokens?.output) > 0) return message as AssistantMessage;
  }
  return undefined;
}

function usedTokens(message: AssistantMessage): number {
  const tokens = message.tokens;
  return (
    safe(tokens?.input) +
    safe(tokens?.output) +
    safe(tokens?.reasoning) +
    safe(tokens?.cache?.read) +
    safe(tokens?.cache?.write)
  );
}

function resolveLimit(
  api: Pick<TuiPluginApi, "state">,
  message: AssistantMessage,
): number | undefined {
  const limit = api.state.provider
    .find((provider) => provider.id === message.providerID)
    ?.models[message.modelID]?.limit.context;
  return positive(limit as number) ? (limit as number) : undefined;
}

function buildBar(used: number, limit: number): string {
  const ratio = used / limit;
  const filled = Math.min(
    CONTEXT_BAR_WIDTH,
    Math.max(0, Math.round(ratio * CONTEXT_BAR_WIDTH)),
  );
  const bar =
    CONTEXT_BAR_FILLED.repeat(filled) +
    CONTEXT_BAR_EMPTY_CELL.repeat(CONTEXT_BAR_WIDTH - filled);
  return `${bar} ${(ratio * 100).toFixed(1)}%`;
}

function buildUsage(used: number, limit: number): string {
  return `${groupDigits(used)} / ${groupDigits(limit)}`;
}

/**
 * Context Model over the live TUI state. All reads are synchronous against
 * `api.state` (messages, session cost, provider list — read live on every
 * recompute, never snapshotted, since the provider list fills after TUI
 * startup and can be replaced wholesale). A version signal bumped by subscribed
 * events forces recompute even where the host state is not itself reactive,
 * which also makes repeated events idempotent: same state, same strings.
 */
export function createContextModel(
  api: Pick<TuiPluginApi, "state" | "event">,
  sessionId: () => string,
  solid: SolidRuntime,
): ContextModel {
  const [version, setVersion] = solid.createSignal(0);
  const [snapshot, setSnapshot] = solid.createSignal<Snapshot | undefined>(undefined);

  const recompute = (sessionID: string, keepPrevious: boolean): void => {
    let messages: readonly Message[];
    try {
      messages = api.state.session.messages(sessionID);
    } catch {
      if (keepPrevious && snapshot()?.sessionID === sessionID) return;
      setSnapshot({ sessionID, status: "unavailable", barLine: "", usageLine: "", costText: CONTEXT_DASH });
      return;
    }
    const last = lastAssistantWithOutput(messages ?? []);
    if (!last) {
      setSnapshot({ sessionID, status: "empty", barLine: "", usageLine: "", costText: CONTEXT_DASH });
      return;
    }
    const used = usedTokens(last);
    let limit: number | undefined;
    try {
      limit = resolveLimit(api, last);
    } catch {
      limit = undefined;
    }
    if (limit === undefined) {
      setSnapshot({ sessionID, status: "unavailable", barLine: "", usageLine: "", costText: CONTEXT_DASH });
      return;
    }
    let cost = 0;
    try {
      cost = api.state.session.get(sessionID)?.cost ?? 0;
    } catch {
      cost = 0;
    }
    setSnapshot({
      sessionID,
      status: "ready",
      barLine: buildBar(used, limit),
      usageLine: buildUsage(used, limit),
      costText: formatCost(cost),
    });
  };

  solid.untrack(() => {
    recompute(sessionId(), false);
  });

  solid.createEffect(() => {
    const sessionID = sessionId();
    version();
    solid.untrack(() => {
      // Same session revalidating (event bump): a read failure keeps the
      // last confirmed numbers. A session switch resets instead.
      recompute(sessionID, snapshot()?.sessionID === sessionID);
    });
  });

  const bump = () => setVersion((v) => v + 1);
  const offUpdated = api.event.on("message.updated", (event) => {
    if (event.properties.sessionID === sessionId()) bump();
  });
  const offRemoved = api.event.on("message.removed", (event) => {
    if (event.properties.sessionID === sessionId()) bump();
  });
  const offSessionUpdated = api.event.on("session.updated", (event) => {
    if (event.properties.info.id === sessionId()) bump();
  });
  const offCompacted = api.event.on("session.compacted", (event) => {
    if (event.properties.sessionID === sessionId()) bump();
  });
  const offConnected = api.event.on("server.connected", () => {
    bump();
  });
  const offSessionDeleted = api.event.on("session.deleted", (event) => {
    const properties = event.properties as unknown as { sessionID?: string; info?: { id?: string } };
    const deletedID = properties.sessionID ?? properties.info?.id;
    if (deletedID !== undefined && deletedID === sessionId()) {
      // The open session is gone: never linger on its stale numbers.
      setSnapshot({ sessionID: deletedID, status: "unavailable", barLine: "", usageLine: "", costText: CONTEXT_DASH });
    }
  });

  solid.onCleanup(() => {
    offUpdated();
    offRemoved();
    offSessionUpdated();
    offCompacted();
    offConnected();
    offSessionDeleted();
  });

  const current = solid.createMemo((): Snapshot => {
    const sessionID = sessionId();
    const loaded = snapshot();
    if (loaded && loaded.sessionID === sessionID) return loaded;
    return { sessionID, status: "unavailable", barLine: "", usageLine: "", costText: CONTEXT_DASH };
  });

  return {
    status: () => current().status,
    barLine: () => current().barLine,
    usageLine: () => current().usageLine,
    costText: () => current().costText,
  };
}
