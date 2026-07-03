// Runnable check for the only tricky logic: irreversible decisions + drift bands.
// Run: node test_state.mjs   (fakes localStorage so state.js loads headless)
import assert from "node:assert";

globalThis.localStorage = {
  _v: null,
  getItem() { return this._v; },
  setItem(_, v) { this._v = v; },
  removeItem() { this._v = null; },
};

const { State } = await import("./src/state.js");
State.reset();

// drift is invisible but banded
assert.equal(State.driftBand(), "stable");
State.addDrift(25); assert.equal(State.driftBand(), "doubting");
State.addDrift(30); assert.equal(State.driftBand(), "fracturing");

// decisions are irreversible — first one locks. Vol0 §2 STEP5.
assert.equal(State.decide("memory_01", "hidden_visitor"), true);
assert.equal(State.decide("memory_01", "erased"), false);
assert.equal(State.data.decisions.memory_01, "hidden_visitor");

// persistence round-trips
const raw = globalThis.localStorage.getItem("memoire_save");
assert.ok(JSON.parse(raw).decisions.memory_01 === "hidden_visitor");

// condition language drives all branching (tone, Eden, consequences). Vol0 §4/§5/§10.
const { meets } = await import("./src/dialogue.js");
// drift is fracturing now, decision = hidden_visitor
assert.equal(meets(null), true);                              // no condition = always
assert.equal(meets({ minBand: "doubting" }), true);           // fracturing >= doubting
assert.equal(meets({ band: "doubting" }), false);             // exact band mismatch
assert.equal(meets({ truth: "hidden_visitor" }), true);       // past decision read back
assert.equal(meets({ truth: "erased" }), false);
assert.equal(meets({ decided: "memory_01" }), true);
assert.equal(meets({ decided: "memory_99" }), false);
State.set("doubt", true);
assert.equal(meets({ flag: "doubt" }), true);
assert.equal(meets({ notFlag: "doubt" }), false);

// Vol0 §3 memory behavior types reshape fragments before play.
const { prepFragments } = await import("./src/memory.js");
const base = { scene: { fragments: [
  { id: "a", text: "A" },
  { id: "b", text: "B", corrupt_drop: true },
  { id: "c", symbol: "[redacted]", drift: 2 },
] } };

// stable: untouched
assert.deepEqual(prepFragments({ ...base, behavior: "stable" }).map(f => f.id), ["a", "b", "c"]);
// corrupted: drops corrupt_drop, swaps symbol into text, bumps its drift
const corr = prepFragments({ ...base, behavior: "corrupted" });
assert.deepEqual(corr.map(f => f.id), ["a", "c"]);          // b gone (missing segment)
assert.equal(corr[1].text, "[redacted]");                   // symbolic replacement
assert.equal(corr[1].drift, 7);                             // 2 + 5
// unstable: same set, order may differ — set preserved
const uns = prepFragments({ ...base, behavior: "unstable" }).map(f => f.id).sort();
assert.deepEqual(uns, ["a", "b", "c"]);

console.log("ok — drift, irreversibility, persistence, gating, memory-types all hold");
