import type { TuiPluginApi } from "@opencode-ai/plugin/tui";
import type { Message, Model, Provider, Session } from "@opencode-ai/sdk/v2";
import { createSignal } from "solid-js";

/** Minimal test double for TuiPluginApi: messages, providers, session cost. */
export interface FakeStore {
  sessions: Map<string, readonly Message[]>;
  providers: Provider[];
  costs: Map<string, number>;
}

export function fakeModel(id: string, providerID: string, context: number): Model {
  return {
    id,
    providerID,
    api: { id: providerID, url: "https://test.invalid", npm: "@test/provider" },
    name: id,
    capabilities: {
      temperature: true,
      reasoning: true,
      attachment: true,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: {
      input: 0,
      output: 0,
      cache: { read: 0, write: 0 },
    },
    limit: { context, output: 4096 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2026-01-01",
  };
}

export function fakeProvider(id: string, models: Record<string, Model>): Provider {
  return {
    id,
    name: id,
    source: "config",
    env: [],
    options: {},
    models,
  };
}

function fail(what: string): never {
  throw new Error(`fake-tui-api: ${what} is not implemented`);
}

export interface FakeTuiApi {
  api: TuiPluginApi;
  setStore(next: FakeStore): void;
  emit(type: string, properties: unknown): void;
}

export function createFakeTuiApi(initial: FakeStore): FakeTuiApi {
  const [store, setStore] = createSignal<FakeStore>(initial);
  const listeners = new Map<string, Set<(event: never) => void>>();

  const api = {
    state: {
      get ready() {
        return true;
      },
      get config() {
        return fail("state.config");
      },
      get provider() {
        return store().providers;
      },
      path: { state: "", config: "", worktree: "", directory: "" },
      vcs: undefined,
      session: {
        count: () => store().sessions.size,
        get: (sessionID: string): Session | undefined => {
          if (!store().sessions.has(sessionID)) return undefined;
          return {
            id: sessionID,
            slug: sessionID,
            projectID: "project-test",
            directory: "/",
            title: sessionID,
            version: "0.0.0-test",
            time: { created: 0, updated: 0 },
            cost: store().costs.get(sessionID) ?? 0,
          };
        },
        diff: () => [],
        todo: () => [],
        messages: (sessionID: string) => {
          const messages = store().sessions.get(sessionID);
          if (!messages) throw new Error(`fake-tui-api: unknown session ${sessionID}`);
          return messages;
        },
        status: () => undefined,
        permission: () => [],
        question: () => [],
      },
      part: () => fail("state.part"),
      lsp: () => [],
      mcp: () => [],
    },
    event: {
      on: (type: string, handler: (event: never) => void) => {
        let set = listeners.get(type);
        if (!set) {
          set = new Set();
          listeners.set(type, set);
        }
        set.add(handler);
        return () => {
          set.delete(handler);
        };
      },
    },
  } as unknown as TuiPluginApi;

  return {
    api,
    setStore: (next) => setStore(next),
    emit: (type, properties) => {
      for (const handler of listeners.get(type) ?? []) handler({ type, properties } as never);
    },
  };
}
