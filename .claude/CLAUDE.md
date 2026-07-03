# memoire

## Developer Commands

- **Run Dev Server (Node)**: `npx serve` (serves the current folder at `http://localhost:3000`)
- **Run Dev Server (Python)**: `python3 -m http.server 8000` (serves the current folder at `http://localhost:8000`)
- **Validate Data**: `node validate.mjs` (verifies all case/dialogue/memory files resolve correctly)

## Architecture

This is a vanilla HTML/CSS/JavaScript client-side web application/game.
- **`index.html`**: Entry point, UI layout, CSS styles, and main controller loop.
- **`src/`**: Local ES modules containing game loop, cinematic player, dialogue interpreter, state manager, and UI shims.
- **`data/`**: JSON configuration files for cases, NPC dialogues, cinematic scripts, and memory details.
- **Three.js**: Loaded dynamically via importmap using an unpkg CDN.

## CORS Warning
Because the game uses ES modules and imports local JSON files dynamically via `fetch()`, it cannot be run directly via the `file://` protocol (e.g. double-clicking `index.html`). It must be served over a local HTTP server.

