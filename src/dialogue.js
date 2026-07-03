// Dialogue node runner. Each node: speaker, text, optional set/drift, then
// choices (goto) OR enter_memory (hand off to memory system). Vol0 §11.
//
// Two data-driven rule-enforcers, no engine special-casing:
//  - variants[]: pick text by condition -> drift shifts tone. Vol0 §4.
//  - eden{}: drift-gated interjection -> Eden grows present with instability. Vol0 §5.
//  - choices/nodes may carry `when` to gate on state. Vol0 §10 consequences.
import { State } from "./state.js";

// Condition mini-language, all data-driven. A `when` is met if every key matches.
//   band: "doubting"      -> drift band is exactly this
//   minBand: "doubting"   -> drift band is this or higher
//   flag: "doubt"         -> flag is set
//   flags: ["a", "b"]     -> every listed flag is set (secret-thread gates)
//   notFlag: "doubt"      -> flag is not set
//   decided: "memory_01"  -> a decision exists for that memory
//   truth: "hidden_visitor" -> any past decision equals this truth
const ORDER = ["stable", "doubting", "fracturing"];
export function meets(when) {
  if (!when) return true;
  const band = State.driftBand();
  if (when.band && when.band !== band) return false;
  if (when.minBand && ORDER.indexOf(band) < ORDER.indexOf(when.minBand)) return false;
  if (when.flag && !State.has(when.flag)) return false;
  if (when.flags && !when.flags.every(f => State.has(f))) return false;
  if (when.notFlag && State.has(when.notFlag)) return false;
  if (when.decided && !State.data.decisions[when.decided]) return false;
  if (when.truth && !Object.values(State.data.decisions).includes(when.truth)) return false;
  return true;
}

const textFor = (node) => {
  if (node.variants) {
    const hit = node.variants.find(v => meets(v.when));
    if (hit) return hit.text;
  }
  return node.text;
};

export async function runDialogue(graph, ui, onEnterMemory, caseData, talkTo) {
  let id = graph.start;
  while (id) {
    const node = graph.nodes[id];
    if (!node) throw new Error("Bad dialogue node: " + id);

    if (node.set) for (const f in node.set) State.set(f, node.set[f]);
    if (node.drift) State.addDrift(node.drift);
    // Optional screen effect before the line: "fx": "flicker" | "shake".
    if (node.fx && ui[node.fx]) await ui[node.fx]();

    // Morning routine (free-roam apartment) before the line plays. Vol1 opening.
    if (node.enter_apartment && ui.apartment) {
      await ui.apartment();
    }
    // Walk the Bureau (free-roam): talk to NPCs, then take the case at the desk. Vol1 §1-2.
    if (node.enter_bureau && ui.bureau) {
      // NPCs available only if their `when` gate passes (stance/drift/prior cases).
      const npcs = (caseData?.npcs || []).filter(n => meets(n.when));
      await ui.bureau(caseData, npcs, talkTo);
    } else if (node.show_case && caseData?.file && ui.casefile) {
      // fallback: render file inline (DOM UI / no bureau)
      await ui.casefile(caseData);
    }

    const edenFollows = node.eden && meets(node.eden.when);
    const hasChoices = !!node.choices;
    // The speaker's line waits for Continue unless an Eden line follows it, or
    // choices come next (the choices themselves are the advance).
    await ui.say(node.speaker, textFor(node), State.driftBand(), node.delay,
                 !edenFollows && !hasChoices);

    // Eden cuts in only when instability qualifies. Vol0 §5: logical, never emotional.
    if (edenFollows) {
      await ui.say("Eden", node.eden.text, State.driftBand(), 0, !hasChoices);
    }

    // A memory node plays the dive, then optionally continues the dialogue (goto).
    // Lets one graph chain dialogue -> memory -> dialogue -> memory. Vol1 needs this.
    if (node.enter_memory) {
      await onEnterMemory(node.enter_memory);
      if (node.goto) { id = node.goto; continue; }
      return;
    }

    if (!node.choices) return; // terminal

    // Choices can be gated by state. Hidden until earned. Vol0 §10.
    const avail = node.choices.filter(c => meets(c.when));
    const pick = await ui.choose(avail.map(c => c.text));
    id = avail[pick].goto;
  }
}
