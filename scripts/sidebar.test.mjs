import { strict as assert } from "node:assert";
import test from "node:test";
import plugin from "../dist/context-bar.js";

function slotWith(options) {
  let claim;
  const dispose = () => {};
  assert.equal(
    plugin.setup({
      options,
      ui: {
        slot(value) {
          claim = value;
          return dispose;
        },
      },
    }),
    dispose,
  );
  assert.equal(plugin.id, "opencode.sidebar.context");
  return claim;
}

test("replaces the built-in Context contribution without hiding MCP by default", () => {
  for (const options of [{}, { hideMcp: false }]) {
    const claim = slotWith(options);
    assert.equal(claim.append, "sidebar.content");
    assert.equal(claim.replace, undefined);
  }
});

test("hideMcp opts into replacing the entire sidebar content slot", () => {
  const claim = slotWith({ hideMcp: true });
  assert.equal(claim.replace, "sidebar.content");
  assert.equal(claim.append, undefined);
});
