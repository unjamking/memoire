# Graph Report - .  (2026-07-03)

## Corpus Check
- Corpus is ~33,170 words - fits in a single context window. You may not need a graph.

## Summary
- 75 nodes · 105 edges · 13 communities (11 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 2% INFERRED · 1% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_3D UI  Case Board|3D UI / Case Board]]
- [[_COMMUNITY_Story Core & Volumes|Story Core & Volumes]]
- [[_COMMUNITY_State Save Tests|State Save Tests]]
- [[_COMMUNITY_Case & Cinematic Runner|Case & Cinematic Runner]]
- [[_COMMUNITY_DOM UI Fallback|DOM UI Fallback]]
- [[_COMMUNITY_Room Overlay & Typing|Room Overlay & Typing]]
- [[_COMMUNITY_Dialogue System|Dialogue System]]
- [[_COMMUNITY_Renderer & Crosshair Loop|Renderer & Crosshair Loop]]
- [[_COMMUNITY_Memory Fragments|Memory Fragments]]
- [[_COMMUNITY_3D Room Builders|3D Room Builders]]
- [[_COMMUNITY_State LoadReset|State Load/Reset]]
- [[_COMMUNITY_Project Instructions|Project Instructions]]

## God Nodes (most connected - your core abstractions)
1. `$()` - 7 edges
2. `runDialogue()` - 5 edges
3. `State` - 5 edges
4. `loop()` - 5 edges
5. `playCinematic()` - 3 edges
6. `load()` - 3 edges
7. `playCinematicCase()` - 3 edges
8. `playCase()` - 3 edges
9. `enterMemory()` - 3 edges
10. `overlayShow()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `game-developer agent` ----> `MÉMOIRE`  [AMBIGUOUS]
  .claude/agents/game-developer.md → index.html
- `playCase()` --calls--> `runDialogue()`  [EXTRACTED]
  src/game.js → src/dialogue.js
- `playCinematicCase()` --calls--> `playCinematic()`  [EXTRACTED]
  src/game.js → src/cinematic.js

## Import Cycles
- None detected.

## Communities (13 total, 2 thin omitted)

### Community 0 - "3D UI / Case Board"
Cohesion: 0.15
Nodes (8): bounds, centerModal(), currentLabels, keys, memFrags, showCaseFile(), targets, UI

### Community 1 - "Story Core & Volumes"
Cohesion: 0.32
Nodes (7): MÉMOIRE, Volumes I-VI, Endings, game-developer agent, src/game.js, src/state.js, src/ui_three.js

### Community 2 - "State Save Tests"
Cohesion: 0.25
Nodes (4): base, corr, raw, uns

### Community 3 - "Case & Cinematic Runner"
Cohesion: 0.48
Nodes (4): playCinematic(), load(), playCase(), playCinematicCase()

### Community 4 - "DOM UI Fallback"
Cohesion: 0.40
Nodes (3): line(), root(), UI

### Community 5 - "Room Overlay & Typing"
Cohesion: 0.33
Nodes (6): enterRoom(), exitRoom(), overlayLine(), overlayShow(), typeLine(), $()

### Community 6 - "Dialogue System"
Cohesion: 0.60
Nodes (4): meets(), ORDER, runDialogue(), textFor()

### Community 7 - "Renderer & Crosshair Loop"
Cohesion: 0.40
Nodes (5): doExamine(), initRenderer(), loop(), move(), targetUnderCrosshair()

### Community 8 - "Memory Fragments"
Cohesion: 0.67
Nodes (3): enterMemory(), prepFragments(), State

### Community 9 - "3D Room Builders"
Cohesion: 0.67
Nodes (4): addTarget(), buildBureau(), buildMemoryRoom(), buildRoom()

## Ambiguous Edges - Review These
- `MÉMOIRE` → `game-developer agent`  [AMBIGUOUS]
  .claude/agents/game-developer.md · relation: unknown

## Knowledge Gaps
- **16 isolated node(s):** `ORDER`, `UI`, `targets`, `keys`, `bounds` (+11 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `MÉMOIRE` and `game-developer agent`?**
  _Edge tagged AMBIGUOUS (relation: related to) - confidence is low._
- **Why does `runDialogue()` connect `Dialogue System` to `Case & Cinematic Runner`?**
  _High betweenness centrality (0.004) - this node is a cross-community bridge._
- **Why does `$()` connect `Room Overlay & Typing` to `3D UI / Case Board`, `Renderer & Crosshair Loop`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **What connects `ORDER`, `UI`, `targets` to the rest of the system?**
  _16 weakly-connected nodes found - possible documentation gaps or missing edges._