import { strict as assert } from "node:assert";
import test from "node:test";
import { createRoot, createSignal, createMemo, createEffect, onCleanup, untrack } from "solid-js";
import type { AssistantMessage, Message } from "@opencode-ai/sdk/v2";
import {
  CONTEXT_BAR_EMPTY,
  CONTEXT_BAR_ORDER,
  CONTEXT_BAR_TITLE,
  CONTEXT_BAR_UNAVAILABLE,
  CONTEXT_BAR_WIDTH,
  INTERNAL_CONTEXT_SECTION_ID,
  createContextModel,
  formatCost,
  formatTokens,
  type SolidRuntime,
} from "./context-model.ts";
import { createFakeTuiApi, fakeModel, fakeProvider, type FakeStore } from "./fake-tui-api.ts";

// Same-process solid-js copy stands in for the host runtime (see SolidRuntime).
const solid: SolidRuntime = { createSignal, createMemo, createEffect, onCleanup, untrack };

function withRoot(fn: () => void): void {
  createRoot((dispose) => {
    try {
      fn();
    } finally {
      dispose();
    }
  });
}

function withAsyncRoot(fn: () => Promise<void>): Promise<void> {
  return createRoot((dispose) => fn().finally(dispose));
}

function nextTask(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function fakeAssistant(
  id: string,
  sessionID: string,
  overrides?: Partial<AssistantMessage>,
): AssistantMessage {
  return {
    id,
    sessionID,
    role: "assistant",
    time: { created: 1_000, completed: 2_000 },
    parentID: "msg_parent",
    modelID: "model-a",
    providerID: "provider-a",
    mode: "build",
    agent: "build",
    path: { cwd: "/", root: "/" },
    cost: 0.01,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    ...overrides,
  };
}

function fakeUser(id: string, sessionID: string): Message {
  return { id, sessionID, role: "user", time: { created: 500 }, agent: "build", model: { providerID: "provider-a", modelID: "model-a" } } as Message;
}

function storeWith(
  sessionID: string,
  messages: readonly Message[],
  context = 200_000,
  cost = 0.01,
): FakeStore {
  return {
    sessions: new Map([[sessionID, messages]]),
    providers: [fakeProvider("provider-a", { "model-a": fakeModel("model-a", "provider-a", context) })],
    costs: new Map([[sessionID, cost]]),
  };
}

test("section title, order and internal target are pinned", () => {
  assert.equal(CONTEXT_BAR_TITLE, "Context");
  assert.equal(INTERNAL_CONTEXT_SECTION_ID, "internal:sidebar-context");
  assert.ok(CONTEXT_BAR_ORDER < 100, "bar must sort before the internal 100s");
});

test("parity: used sums all buckets of the last assistant with output > 0", () => {
  withRoot(() => {
    const sid = "ses_parity";
    const first = fakeAssistant("msg_1", sid, {
      tokens: { input: 70_000, output: 10_000, reasoning: 1_000, cache: { read: 500, write: 602 } },
    });
    const fake = createFakeTuiApi(storeWith(sid, [first], 200_000, 0.01));
    const model = createContextModel(fake.api, () => sid, solid);
    assert.equal(model.status(), "ready");
    // 70,000 + 10,000 + 1,000 + 500 + 602 = 82,102; 82,102 / 200,000.
    assert.equal(model.usageLine(), "82,102 / 200,000 (117,898 left)");
    assert.equal(model.costText(), "$0.01");
    // 82,102 / 200,000 = 41.051% -> 41.1%, filled = round(0.41051 * 20) = 8.
    assert.equal(model.barLine(), "████████░░░░░░░░░░░░ 41.1%");
  });
});

test("last message wins; messages without output > 0 are skipped", () => {
  withRoot(() => {
    const sid = "ses_last";
    const first = fakeAssistant("msg_1", sid, {
      tokens: { input: 1_000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const streaming = fakeAssistant("msg_2", sid, {
      time: { created: 3_000 },
      tokens: { input: 999_999, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const last = fakeAssistant("msg_3", sid, {
      tokens: { input: 80_000, output: 2_000, reasoning: 100, cache: { read: 1, write: 1 } },
    });
    const fake = createFakeTuiApi(storeWith(sid, [fakeUser("u_1", sid), first, streaming, last], 200_000, 0));
    const model = createContextModel(fake.api, () => sid, solid);
    assert.equal(model.status(), "ready");
    // 80,000 + 2,000 + 100 + 1 + 1 = 82,102 — the zero-output giant is skipped.
    assert.equal(model.usageLine(), "82,102 / 200,000 (117,898 left)");
  });
});

test("empty session: honest placeholder, never zeros as fact", () => {
  withRoot(() => {
    const sid = "ses_empty";
    const fake = createFakeTuiApi(storeWith(sid, [], 200_000, 0));
    const model = createContextModel(fake.api, () => sid, solid);
    assert.equal(model.status(), "empty");
    assert.equal(model.barLine(), "");
    assert.equal(model.usageLine(), "");
    assert.match(CONTEXT_BAR_EMPTY, /responses/);
  });
  withRoot(() => {
    const sid = "ses_zero_output";
    const msg = fakeAssistant("msg_1", sid, {
      tokens: { input: 5_000, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const fake = createFakeTuiApi(storeWith(sid, [msg], 200_000, 0));
    const model = createContextModel(fake.api, () => sid, solid);
    assert.equal(model.status(), "empty");
  });
});

test("unknown model: unavailable, not zeros", () => {
  withRoot(() => {
    const sid = "ses_unknown";
    const msg = fakeAssistant("msg_1", sid, {
      providerID: "provider-missing",
      modelID: "model-ghost",
      tokens: { input: 1_000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const fake = createFakeTuiApi(storeWith(sid, [msg], 200_000, 0.05));
    const model = createContextModel(fake.api, () => sid, solid);
    assert.equal(model.status(), "unavailable");
    assert.equal(model.barLine(), "");
    assert.equal(model.usageLine(), "");
    assert.match(CONTEXT_BAR_UNAVAILABLE, /unavailable/i);
  });
});

test("zero limit: unavailable, not zeros", () => {
  withRoot(() => {
    const sid = "ses_zero_limit";
    const msg = fakeAssistant("msg_1", sid, {
      tokens: { input: 1_000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const fake = createFakeTuiApi(storeWith(sid, [msg], 0, 0));
    const model = createContextModel(fake.api, () => sid, solid);
    assert.equal(model.status(), "unavailable");
  });
});

test("session switch: previous session numbers do not leak", () => {
  withRoot(() => {
    const paid = "ses_paid";
test("session switch: previous session numbers do not leak", async () => {
  await withAsyncRoot(async () => {
    const paid = "ses_paid";
    const empty = "ses_empty2";
    const msg = fakeAssistant("msg_1", paid, {
      tokens: { input: 70_000, output: 10_000, reasoning: 1_000, cache: { read: 500, write: 602 } },
    });
    const fake = createFakeTuiApi({
      sessions: new Map([
        [paid, [msg]],
        [empty, []],
      ]),
      providers: [fakeProvider("provider-a", { "model-a": fakeModel("model-a", "provider-a", 200_000) })],
      costs: new Map([[paid, 0.01]]),
    });
    const [sessionID, setSessionID] = createSignal(paid);
    const model = createContextModel(fake.api, sessionID, solid);
    assert.equal(model.status(), "ready");
    assert.equal(model.usageLine(), "82,102 / 200,000 (117,898 left)");

    setSessionID(empty);
    await nextTask();
    assert.equal(model.status(), "empty");
    assert.equal(model.barLine(), "");

    setSessionID(paid);
    await nextTask();
    assert.equal(model.status(), "ready");
    assert.equal(model.usageLine(), "82,102 / 200,000 (117,898 left)");
  });
});
    const fake = createFakeTuiApi({ sessions: new Map(), providers: [], costs: new Map() });
    const model = createContextModel(fake.api, () => "ses_missing", solid);
    assert.equal(model.status(), "unavailable");
  });
});

test("repeated events are idempotent: same state, same strings", () => {
  withRoot(() => {
    const sid = "ses_idem";
    const msg = fakeAssistant("msg_1", sid, {
      tokens: { input: 70_000, output: 10_000, reasoning: 1_000, cache: { read: 500, write: 602 } },
    });
    const fake = createFakeTuiApi(storeWith(sid, [msg], 200_000, 0.01));
    const model = createContextModel(fake.api, () => sid, solid);
    const before = [model.status(), model.barLine(), model.usageLine(), model.costText()];
    fake.emit("message.updated", { sessionID: sid, info: msg });
    fake.emit("message.updated", { sessionID: sid, info: msg });
    fake.emit("session.updated", { sessionID: sid, info: { id: sid } });
    const after = [model.status(), model.barLine(), model.usageLine(), model.costText()];
    assert.deepEqual(after, before);
    assert.equal(model.usageLine(), "82,102 / 200,000 (117,898 left)");
  });
});

test("message update for another session does not disturb the current bar", () => {
  withRoot(() => {
    const sid = "ses_a";
    const other = "ses_b";
    const msg = fakeAssistant("msg_1", sid, {
      tokens: { input: 1_000, output: 500, reasoning: 0, cache: { read: 0, write: 0 } },
    });
    const fake = createFakeTuiApi({
      sessions: new Map([
        [sid, [msg]],
        [other, []],
      ]),
      providers: [fakeProvider("provider-a", { "model-a": fakeModel("model-a", "provider-a", 200_000) })],
      costs: new Map([[sid, 0]]),
    });
    const model = createContextModel(fake.api, () => sid, solid);
    const before = model.usageLine();
    fake.emit("message.updated", { sessionID: other, info: fakeAssistant("msg_x", other) });
    assert.equal(model.usageLine(), before);
  });
});

test("deleted open session: stale numbers are dropped, never linger", () => {
  withRoot(() => {
    const sid = "ses_gone";
    const msg = fakeAssistant("msg_1", sid, {
      tokens: { input: 70_000, output: 10_000, reasoning: 1_000, cache: { read: 500, write: 602 } },
    });
    const fake = createFakeTuiApi(storeWith(sid, [msg], 200_000, 0.01));
    const model = createContextModel(fake.api, () => sid, solid);
    assert.equal(model.status(), "ready");
    fake.emit("session.deleted", { sessionID: sid, info: { id: sid } });
    assert.equal(model.status(), "unavailable");
    assert.equal(model.barLine(), "");
    assert.equal(model.usageLine(), "");
  });
});

test("read failure on a known session preserves the last confirmed numbers", async () => {
  await withAsyncRoot(async () => {
    const sid = "ses_flaky";
    const msg = fakeAssistant("msg_1", sid, {
      tokens: { input: 70_000, output: 10_000, reasoning: 1_000, cache: { read: 500, write: 602 } },
    });
    const initial = storeWith(sid, [msg], 200_000, 0.01);
    const fake = createFakeTuiApi(initial);
    const model = createContextModel(fake.api, () => sid, solid);
    assert.equal(model.usageLine(), "82,102 / 200,000 (117,898 left)");
    fake.setStore({ ...initial, sessions: new Map() });
    fake.emit("message.updated", { sessionID: sid, info: msg });
    await nextTask();
    assert.equal(model.status(), "ready");
    assert.equal(model.usageLine(), "82,102 / 200,000 (117,898 left)");
  });
});

test("formatters: grouped tokens, two-decimal cost, fixed bar width", () => {
  assert.equal(formatTokens(82102), "82,102");
  assert.equal(formatTokens(200000), "200,000");
  assert.equal(formatCost(0.01), "$0.01");
  assert.equal(formatCost(3.756), "$3.76");
  withRoot(() => {
    const sid = "ses_fmt";
    const msg = fakeAssistant("msg_1", sid, {
      tokens: { input: 70_000, output: 10_000, reasoning: 1_000, cache: { read: 500, write: 602 } },
    });
    const fake = createFakeTuiApi(storeWith(sid, [msg], 200_000, 0.01));
    const model = createContextModel(fake.api, () => sid, solid);
    const [bar] = model.barLine().split(" ");
    assert.equal([...bar].length, CONTEXT_BAR_WIDTH);
  });
});
