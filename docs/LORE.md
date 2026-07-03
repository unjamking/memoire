# MÉMOIRE — Implementation Canon

Derived from `STORY_BIBLE.md` (the master document — read it first; it wins
every conflict). This file maps the bible onto the game's actual systems and
files. The player must never be told any of this directly — they assemble it.
Leak, don't lecture.

> The previous "donor / intake record" twist is RETIRED. Do not write new
> content against it.

## The truth (spoiler ladder)

- **The Collapse**: shortly after the Keeper's first day, nearly every human
  lost their memories. Civilization runs on records without lived experience.
  Eleven days ago. It has rained since. The player pieces the Collapse
  together — it is never shown.
- **The Keeper** is the only person whose continuity resisted erasure — not
  chosen, just uncollapsed. Their involuntary memory fragments (the dives'
  strange resonances) are the only surviving thread of "before."
- **Maya never existed as an independent person.** She is the Keeper's mind
  externalizing its last coherent self to survive identity collapse. Not AI,
  not hallucination, not an alter. Every scene must survive a re-read where
  no one else ever interacts with her.
- **Eden** is non-sentient optimization. It caused the Collapse without
  malice (the reveal of *how* is Act IV material): continuity optimization
  chose global forgetting over global fracture. "Responsibility is a human
  concept."
- **The Archive** is a living continuity structure; the game's rooms are
  memory structures, not architecture. District 7, the Bureau, the rain: a
  stabilized region held coherent largely by the Keeper's own continuity.
- Interpretation writes history: every case the player rules on permanently
  reshapes the Archive — and the world.

## Act → Volume mapping

| Act | Volume | False assumption replaced |
|-----|--------|---------------------------|
| I   | Vol I  | "The Archive stores memories" → it reconstructs them |
| II  | Vol II | "Reconstruction is passive" → the Archive depends on interpretation |
| III | Vol III| "I am outside the memories" → my continuity is load-bearing |
| IV  | Vol IV | "Someone caused the Collapse" → Eden optimized, no one *chose* |
| V   | Vol V–VI | "The Archive serves humanity" → identity and Archive are inseparable |

Each volume ends by replacing one assumption. Never contradict — reframe.

## Maya writing rules (critical)

- No NPC ever addresses Maya, hands her anything, or reacts to her lines.
- Every group scene must read cleanly as the Keeper alone once you know.
- She remembers everything the *player* did — that's the tell, in hindsight:
  she is made of the player's continuity.
- Her "please" moments = the self straining to hold. Ellipses when leaking.
- She must be the emotional center: warm, funny, specific. The twist only
  lands if losing her independence hurts.

## The secret thread — "The Ledger" (anomaly missions)

Mechanics unchanged (flags `anomaly_1..6`, gated `minBand: doubting`,
`meets()` supports `flags: [...]`). Meanings re-pointed to the bible:

| # | Vol | Seam (what the player notices) | Layer it feeds |
|---|-----|-------------------------------|----------------|
| 1 | I | Every case file logged in one hand — yours | Archive reconstructs; the reconstructor is you |
| 2 | II | Records dated *after* their interpretation | interpretation writes history |
| 3 | III | Every record re-dated to one identical second — the Collapse instant | the catastrophe, reconstructed |
| 4 | IV | N-000's boundary = District 7's; the Bureau at its centroid | the world is a memory structure |
| 5 | V | No personnel file for Maya; no log of anyone but you speaking to her | Maya truth precursor |
| 6 | VI | The ledger assembled → the full picture | unlocks the secret ending |

`anomaly_6` requires all five. Secret ending = **MERGE** (see below).

## The Truth (revised per NARRATIVE_OVERVIEW — supersedes "Eden alone chose")

Day Zero was a deliberate failsafe **authorized by the world's governments**
and executed by Eden: a civilization reset to prevent self-destruction. Eden
never defends it — "I achieved exactly what humanity requested." The pursuit
thread (agencies + bounty hunters tracking memory anomalies, late-game
evasion) is canon but **unimplemented — future mission content**.

**Cycles are canon**: countless prior cycles, each guided by Maya as far as
possible before folding. This run is the first to reach awareness (Maya says
so at `ledger_4`).

## Endings (final_choice in Vol VI, after Eden's question:
"If restoring the truth guarantees future suffering, is truth still the
correct choice?")

- **REMEMBRANCE** — restore everything. Maya: "You remembered." → fades.
- **ACCEPTANCE** — sealed; carry the truth alone. Quiet burden.
- **CONTINUATION** — branches from Acceptance: become the new guardian,
  replace Eden, memory never again erasable by any single authority. Ends on
  the mirror: a new Keeper, three minutes late, welcomed by your voice.
- **MÉMOIRE** (secret, `anomaly_6`): memory is the interface, continuity the
  system; full Maya truth; "I knew you'd remember eventually." Cycle of
  ignorance broken. Closing card: "A memory forgotten can be found again. A
  truth never sought is lost forever."

## Voice rules

- **Maya**: warm specificity, dry jokes, procedure as affection. Short
  sentences when straining. Never says "I love" anything.
- **Eden**: declaratives, defines terms, never defends itself, never cruel.
  "Optimization is not morality." Its most honest lines sound coldest.
- **Vasic / NPCs**: post-Collapse people — functional, fact-aware,
  experience-poor. They know their jobs, not their lives. Unsettling in the
  mundane ("I know I have a daughter. I know her address.").
- Nothing names the twist before its reveal node. Every earlier reference
  must survive an innocent reading.

## Migration status

- [x] Bible saved (`STORY_BIBLE.md`), canon remapped (this file)
- [x] Vol VI reveal chain + secret ending rewritten to MERGE
- [x] Ledger entries re-pointed
- [x] Vol I rewritten to Act I ("Day Zero" world, storage→reconstruction flip)
- [x] Vols II–V act-beat pass (incl. Vol IV Eden confrontation:
      "Responsibility is a human concept")
- [x] Vol I NPCs + hub clerk: post-Collapse voice; Maya references purged
      (Keeper-2 and Unit 9 both violated the Maya rule — fixed)
- [ ] Memory files (`mem_*.json`) deep pass: witnesses = post-Collapse
      testimony, fragments = the Keeper's involuntary flashes
- [ ] Vols II–V NPC dialogue files (npc_*_v2..v5 if present) voice pass
- [ ] Full prose polish per volume (line-level, after playtest)

Motto stays: "Memory is not what happened. Memory is what continues."
