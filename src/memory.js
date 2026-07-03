// Memory = playable reconstructed scene from incomplete data. Vol0 §3.
// Attention (examining fragments) shifts drift & can lower stability ->
// memory may collapse. Then player picks an interpretation = irreversible truth.
import { State } from "./state.js";

// Vol0 §3 memory behavior types shape the fragment set before play:
//   stable    -> as written, linear, minimal distortion
//   unstable  -> events re-order; fragment order shuffled each visit
//   corrupted -> missing segments + symbolic replacements
// Pure function so it's testable headless.
export function prepFragments(mem) {
  let frags = mem.scene.fragments.slice();
  const beh = mem.behavior || "stable";

  if (beh === "unstable") {
    for (let i = frags.length - 1; i > 0; i--) {        // Fisher-Yates shuffle
      const j = Math.floor(Math.random() * (i + 1));
      [frags[i], frags[j]] = [frags[j], frags[i]];
    }
  }

  if (beh === "corrupted") {
    frags = frags
      .filter(f => !f.corrupt_drop)                       // missing segments
      .map(f => f.symbol                                  // symbolic replacement
        ? { ...f, text: f.symbol, drift: (f.drift || 0) + 5 }
        : f);
  }
  return frags;
}

export async function enterMemory(mem, ui) {
  // Examine fragments. Attention changes the memory. Vol0 §3 "changes based on attention".
  let stability = mem.stability_score;
  let frags = prepFragments(mem);

  // Fade to black, build the memory scene, fade back in. (DOM UI has no fade.)
  if (ui.fade) await ui.fade(true);
  await ui.scene(mem.scene.description, mem.behavior, mem.emotion_signature, frags, mem.env);
  if (ui.fade) await ui.fade(false);
  while (frags.length) {
    const pick = await ui.choose(
      frags.map(f => "Examine: " + f.text).concat(["Step back and decide"])
    );
    if (pick === frags.length) break;

    const f = frags.splice(pick, 1)[0];
    State.saw(f.id);
    if (f.reveals) State.set("revealed_" + f.reveals);
    State.addDrift(f.drift || 0);
    stability -= (f.drift || 0); // attention destabilizes. Vol0 §3
    if (f.reveals) await ui.reveal(f.reveals);

    // Vol0 §3 collapse — but RuleA (§7): never breaks without explanation.
    // Eden supplies the in-world rationale, so perception breaks, reality doesn't.
    if (stability <= 0) {
      await ui.collapse();
      await ui.say("Eden", "Insufficient data integrity. The Archive is interpolating. What you see now is reconstruction, not record.", State.driftBand());
      break;
    }
  }

  // Interpretation = output decision. First choice locks forever. Vol0 §2 STEP5.
  const pick = await ui.choose(mem.interpretations.map(i => i.label));
  const choice = mem.interpretations[pick];
  State.addDrift(choice.drift);
  State.decide(mem.memory_id, choice.truth);
  await ui.outcome(choice.truth);     // shows outcome + waits for Continue, then tears down
  if (ui.fade) { await ui.fade(true); await ui.fade(false); } // transition out of the dive
  return choice.truth;
}
