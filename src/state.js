// World state: flags, invisible cognitive drift, persistence. Vol0 §4, §11.
// ponytail: localStorage is the persistence layer. Swap for a server save only if multiplayer/cloud ever matters.

const KEY = "memoire_save";

const fresh = () => ({
  flags: {},            // narrative flags set by choices/fragments
  drift: 0,             // COGNITIVE DRIFT — invisible. never rendered to player.
  decisions: {},        // memory_id -> chosen interpretation truth (irreversible)
  seen: [],             // fragment ids the player attended to
});

export const State = {
  data: load(),

  set(flag, val = true) { this.data.flags[flag] = val; this.save(); },
  has(flag) { return !!this.data.flags[flag]; },

  addDrift(n) { if (n) { this.data.drift += n; this.save(); } },

  // Drift bands drive tone, not a visible bar. Vol0 §4 effects.
  driftBand() {
    const d = this.data.drift;
    if (d < 20) return "stable";
    if (d < 50) return "doubting";
    return "fracturing";
  },

  decide(memoryId, truth) {
    if (this.data.decisions[memoryId]) return false; // irreversible: first choice locks. Vol0 §2 STEP5
    this.data.decisions[memoryId] = truth;
    this.save();
    return true;
  },

  saw(fragId) {
    if (!this.data.seen.includes(fragId)) { this.data.seen.push(fragId); this.save(); }
  },

  save() { localStorage.setItem(KEY, JSON.stringify(this.data)); },
  reset() { this.data = fresh(); this.save(); },
};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || fresh(); }
  catch { return fresh(); }
}
