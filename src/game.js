// The core loop. Vol0 §2: Reality -> Investigation -> Memory -> Reconstruct -> Output.
// UI is a swappable shim (DOM now, Three.js later). Engine doesn't care.
import { State } from "./state.js";
import { runDialogue } from "./dialogue.js";
import { enterMemory } from "./memory.js";
import { playCinematic } from "./cinematic.js";

const load = (path) => fetch(path).then(r => {
  if (!r.ok) throw new Error("Missing data: " + path);
  return r.json();
});

// Play a cinematic script (ordered beats), diving into memories as its beats call for.
export async function playCinematicCase(cineId, ui) {
  const script = await load(`data/${cineId}.json`);
  if (script.title) await ui.banner(script.title);
  await playCinematic(script, ui, async (memId) => {
    const mem = await load(`data/${memId}.json`);
    const truth = await enterMemory(mem, ui);
    await ui.banner(`Archived: "${truth}". Drift band: ${State.driftBand()}.`);
  });
}

// Run a single dialogue graph (e.g. a hub NPC) outside a case. Used by the hub.
export async function runStandaloneDialogue(dialogueId, ui) {
  const onEnterMemory = async (memId) => {
    const mem = await load(`data/${memId}.json`);
    await enterMemory(mem, ui);
  };
  const talkTo = async (id) => {
    const g = await load(`data/${id}.json`);
    await runDialogue(g, ui, onEnterMemory, null, talkTo);
  };
  await talkTo(dialogueId);
}

export async function playCase(caseId, ui) {
  const c = await load(`data/${caseId}.json`);
  // No title card up front — the day starts in the apartment; the case
  // introduces itself at the office (case file modal carries the title).

  // Shared memory-dive handler — used by the main dialogue and by NPC dialogues.
  const onEnterMemory = async (memId) => {
    const mem = await load(`data/${memId}.json`);
    const truth = await enterMemory(mem, ui);
    await ui.banner(`Archived: "${truth}". Drift band: ${State.driftBand()}.`);
  };

  // talkTo(dialogueId): load an NPC's dialogue graph and run it inline. NPCs can
  // themselves trigger memory dives. No case file in an NPC chat (caseData omitted).
  const talkTo = async (dialogueId) => {
    const g = await load(`data/${dialogueId}.json`);
    await runDialogue(g, ui, onEnterMemory, null, talkTo);
  };

  const dlg = await load(`data/${c.briefing}.json`);
  await runDialogue(dlg, ui, onEnterMemory, c, talkTo);
}
