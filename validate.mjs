// Graph validator: every goto / enter_memory / briefing must resolve to a real
// node or data file. Catches dead narrative links before playtest.
// Run: node validate.mjs
import { readFileSync, readdirSync } from "node:fs";

const dir = "./data";
const load = (f) => JSON.parse(readFileSync(`${dir}/${f}.json`, "utf8"));
const exists = (f) => readdirSync(dir).includes(f + ".json");

let errs = 0;
const fail = (m) => { console.error("  ✗ " + m); errs++; };

for (const file of readdirSync(dir)) {
  const name = file.replace(/\.json$/, "");
  const d = load(name);

  // dialogue graph
  if (d.nodes) {
    const ids = new Set(Object.keys(d.nodes));
    if (!ids.has(d.start)) fail(`${name}: start "${d.start}" missing`);
    for (const [nid, node] of Object.entries(d.nodes)) {
      const gotos = [];
      if (node.goto) gotos.push(node.goto);
      if (node.choices) for (const c of node.choices) if (c.goto) gotos.push(c.goto);
      for (const g of gotos) if (!ids.has(g)) fail(`${name}.${nid}: goto "${g}" missing`);
      if (node.enter_memory && !exists(node.enter_memory)) fail(`${name}.${nid}: memory "${node.enter_memory}" missing`);
      // a node must terminate or advance
      if (!node.choices && !node.goto && !node.enter_memory) { /* terminal ok */ }
    }
  }

  // case
  if (d.case_id) {
    if (d.briefing && !exists(d.briefing)) fail(`${name}: briefing "${d.briefing}" missing`);
    if (d.memory && !exists(d.memory)) fail(`${name}: memory "${d.memory}" missing`);
    for (const npc of d.npcs || [])
      if (!exists(npc.dialogue)) fail(`${name}: npc "${npc.id}" dialogue "${npc.dialogue}" missing`);
  }

  // cinematic
  if (d.beats) {
    const labels = new Set(d.beats.filter(b => b.label).map(b => b.label));
    for (const b of d.beats) {
      if (b.memory && !exists(b.memory)) fail(`${name}: beat memory "${b.memory}" missing`);
      if (b.goto && !labels.has(b.goto)) fail(`${name}: beat goto "${b.goto}" missing`);
      for (const c of b.choices || [])
        if (c.goto && !labels.has(c.goto)) fail(`${name}: choice goto "${c.goto}" missing`);
    }
  }

  // memory
  if (d.memory_id) {
    if (!d.scene?.fragments?.length) fail(`${name}: no fragments`);
    if (!d.interpretations?.length) fail(`${name}: no interpretations`);
    for (const f of d.scene?.fragments || [])
      if (!f.text && !f.symbol) fail(`${name}: fragment ${f.id} has no text/symbol`);
  }
}

console.log(errs ? `\n${errs} broken link(s)` : "ok — all narrative links resolve");
process.exit(errs ? 1 : 0);
