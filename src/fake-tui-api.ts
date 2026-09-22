import type { Context } from "@opencode/plugin/tui/context";

type Data = Context["data"];
type Message = ReturnType<Data["session"]["message"]["list"]>[number];
type Model = NonNullable<ReturnType<Data["location"]["model"]["list"]>>[number];

/** Minimal test double for the v2 TUI data cache surface used by the model. */
export interface FakeStore {
  messages: Map<string, readonly Message[]>;
  models: Model[];
  costs: Map<string, number>;
}

export function fakeModel(id: string, providerID: string, context: number): Model {
  return {
    id,
    modelID: id,
    providerID,
    name: id,
    capabilities: { tools: true, input: ["text"], output: ["text"] },
    variants: [],
    time: { released: 0 },
    cost: [],
    status: "active",
    enabled: true,
    limit: { context, output: 4096 },
  };
}

export interface FakeTui {
  context: Pick<Context, "data" | "location">;
  setStore(next: FakeStore): void;
  emit(type: string, data?: unknown): void;
}

export function createFakeTui(initial: FakeStore): FakeTui {
  let store = initial;
  const listeners = new Map<string, Set<(event: { type: string; data: unknown }) => void>>();

  // Only the data-cache surface the context model reads is implemented; the
  // cast covers the untouched remainder of Data (project, shell, skills...).
  const data = {
    session: {
      cost: (sessionID: string): number => store.costs.get(sessionID) ?? 0,
      sync: async (_sessionID: string): Promise<void> => {},
      message: {
        list: (sessionID: string): Message[] => {
          const messages = store.messages.get(sessionID);
          if (!messages) throw new Error(`fake-tui: unknown session ${sessionID}`);
          return [...messages];
        },
        sync: async (_sessionID: string): Promise<void> => {},
      },
    },
    location: {
      model: {
        list: (): Model[] | undefined => store.models,
        sync: async (): Promise<void> => {},
      },
    },
    on: (type: string, handler: (event: never) => void): (() => void) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      const wrapped = (event: { type: string; data: unknown }) => handler(event as never);
      set.add(wrapped);
      return () => {
        set.delete(wrapped);
      };
    },
  };

  return {
    context: { data: data as unknown as Data, location: { directory: "/" } },
    setStore: (next) => {
      store = next;
    },
    emit: (type, eventData = {}) => {
      for (const handler of listeners.get(type) ?? []) handler({ type, data: eventData });
    },
  };
}
