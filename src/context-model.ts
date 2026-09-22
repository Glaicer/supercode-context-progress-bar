/**
 * Context Model — every number, formula and string of the Context progress bar.
 *
 * The last assistant message with `tokens.output > 0` supplies the token
 * buckets and model. Used tokens are measured against that model's context
 * limit, while cost comes from the open session. The view renders only the
 * strings exposed here and computes nothing.
 *
 * States: `ready` (bar + numbers), `empty` (session has no model responses —
 * honest placeholder, never zeros as fact), `unavailable` (unknown model,
 * non-positive limit, or unreadable state — never NaN/zeros as fact).
 */

import type * as Solid from "solid-js";
import type { Context } from "@opencode/plugin/tui/context";

type Message = ReturnType<Context["data"]["session"]["message"]["list"]>[number];
type AssistantMessage = Extract<Message, { type: "assistant" }>;

export type ContextStatus = "ready" | "empty" | "unavailable";

export const CONTEXT_BAR_TITLE = "Context";

export const CONTEXT_BAR_EMPTY = "No model responses yet.";

export const CONTEXT_BAR_UNAVAILABLE = "Context unavailable.";

export const CONTEXT_COST_LABEL = "Cost";

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
    if (message.type !== "assistant") continue;
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
  context: Pick<Context, "data" | "location">,
  message: AssistantMessage,
): number | undefined {
  const models = context.data.location.model.list(context.location);
  const limit = models?.find(
    (model) =>
      model.providerID === message.model.providerID &&
      (model.id === message.model.id || model.modelID === message.model.id),
  )?.limit.context;
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
 * Context Model over OpenCode v2's live TUI data cache. Reads stay synchronous
 * and subscribed server events force recomputation. Initial session/model sync
 * fills caches that were not ready when the slot first mounted.
 */
export function createContextModel(
  context: Pick<Context, "data" | "location">,
  sessionId: () => string,
  solid: SolidRuntime,
): ContextModel {
  const [version, setVersion] = solid.createSignal(0);
  const [snapshot, setSnapshot] = solid.createSignal<Snapshot | undefined>(undefined);

  const recompute = (sessionID: string, keepPrevious: boolean): void => {
    let messages: readonly Message[];
    try {
      messages = context.data.session.message.list(sessionID);
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
      limit = resolveLimit(context, last);
    } catch {
      limit = undefined;
    }
    if (limit === undefined) {
      setSnapshot({ sessionID, status: "unavailable", barLine: "", usageLine: "", costText: CONTEXT_DASH });
      return;
    }
    let cost = 0;
    try {
      cost = context.data.session.cost(sessionID);
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

  solid.createEffect(() => {
    const sessionID = sessionId();
    const sync = async () => {
      await Promise.all([
        context.data.session.sync(sessionID),
        context.data.session.message.sync(sessionID),
        context.data.location.model.sync(context.location),
      ]);
      setVersion((value) => value + 1);
    };
    void sync().catch(() => {});
  });

  const bump = () => setVersion((v) => v + 1);
  const offStepEnded = context.data.on("session.step.ended", (event) => {
    if (event.data.sessionID === sessionId()) bump();
  });
  const offStepFailed = context.data.on("session.step.failed", (event) => {
    if (event.data.sessionID === sessionId()) bump();
  });
  const offUsageUpdated = context.data.on("session.usage.updated", (event) => {
    if (event.data.sessionID === sessionId()) bump();
  });
  const offCompacted = context.data.on("session.compaction.ended", (event) => {
    if (event.data.sessionID === sessionId()) bump();
  });
  const offModelsUpdated = context.data.on("model.updated", () => {
    bump();
  });
  const offConnected = context.data.on("server.connected", () => {
    bump();
  });
  const offSessionDeleted = context.data.on("session.deleted", (event) => {
    if (event.data.sessionID === sessionId()) {
      // The open session is gone: never linger on its stale numbers.
      setSnapshot({ sessionID: event.data.sessionID, status: "unavailable", barLine: "", usageLine: "", costText: CONTEXT_DASH });
    }
  });

  solid.onCleanup(() => {
    offStepEnded();
    offStepFailed();
    offUsageUpdated();
    offCompacted();
    offModelsUpdated();
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
