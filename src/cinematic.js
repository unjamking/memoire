// Cinematic sequencer — runs an ordered list of beats with no player input
// between them (Continue-gated where it should breathe). Reuses the UI shim.
//
// ponytail: one flat beat list, no timeline/keyframe engine. A scripted scene is
// a sequence of typed cues; richer choreography can layer on if a scene needs it.
//
// Beat types (data-driven):
//   { say, who?, delay? }      speaker line, typewriter + Continue
//   { sys }                    non-HUD system message (perceived, not UI)
//   { sound }                  audio cue — stubbed as an italic caption for now
//   { wait, ms }               pause
//   { fade, on }               fade to/from black
//   { flicker }                light/scene flicker pulse
//   { shake }                  brief screen shake
//   { stability, value }       show the Stability Index (perceived number)
//   { memory }                 hand off to a playable Reconstruction Instance
//   { choices:[{text,goto}] }  branch within the cinematic (label -> beat index/label)
import { State } from "./state.js";

export async function playCinematic(script, ui, onEnterMemory) {
  const beats = script.beats;
  // allow labelled jumps: a beat may carry `label`, choices goto that label
  const labelIndex = {};
  beats.forEach((b, i) => { if (b.label) labelIndex[b.label] = i; });

  let i = 0;
  while (i < beats.length) {
    const b = beats[i];
    if (b.set) for (const f in b.set) State.set(f, b.set[f]);
    if (b.drift) State.addDrift(b.drift);

    if (b.say != null)        await ui.say(b.who || "", b.say, State.driftBand(), b.delay, true);
    else if (b.sys != null)   await ui.sysmsg(b.sys);
    else if (b.sound != null) await ui.cue(b.sound, "sound");
    else if (b.wait != null)  await ui.wait(b.ms ?? b.wait);
    else if (b.fade != null)  await ui.fade(b.fade);
    else if (b.flicker)       await ui.flicker();
    else if (b.shake)         await ui.shake();
    else if (b.stability != null) await ui.stability(b.stability);
    else if (b.memory != null) { await onEnterMemory(b.memory); }
    else if (b.choices) {
      const avail = b.choices;
      const pick = await ui.choose(avail.map(c => c.text));
      const dest = avail[pick].goto;
      if (dest != null && labelIndex[dest] != null) { i = labelIndex[dest]; continue; }
    }

    if (b.goto != null && labelIndex[b.goto] != null) { i = labelIndex[b.goto]; continue; }
    i++;
  }
}
