// Three.js view layer. Same engine methods as ui_dom.js + a walkable Bureau hub.
// Interaction matches the TLMK reference: enclosed rooms, manual yaw/pitch mouselook,
// WASD move, E to examine, crosshair + "[E] Examine" prompt, walls clamp you in.
//
// ponytail: manual controls (no PointerLockControls addon — the reference proves
// raw yaw/pitch is enough). Procedural geometry only, Three.js from CDN.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { State } from "./state.js";
import * as SFX from "./audio.js";

// ---------- CC0 model kit (Kenney) ----------
// Preloaded fire-and-forget at init; every use falls back to the procedural
// builder if a model hasn't arrived (or failed) — the game never waits on assets.
// name: [url, { h: real-world height in meters }]. Models auto-normalize at
// load: Box3-measured, scaled so height equals h, base shifted to y=0.
// Kills per-model scale guessing and sunken/floating pivots in one move.
const MODEL_SRC = {
  desk:        ["assets/models/furn/desk.glb", { h: 0.75 }],
  chairDesk:   ["assets/models/furn/chairDesk.glb", { h: 0.95 }],
  bookcase:    ["assets/models/furn/bookcaseOpen.glb", { h: 1.9 }],
  bookcase2:   ["assets/models/furn/bookcaseClosed.glb", { h: 1.9 }],
  bedSingle:   ["assets/models/furn/bedSingle.glb", { h: 0.65 }],
  sofa:        ["assets/models/furn/loungeSofa.glb", { h: 0.8 }],
  lampTable:   ["assets/models/furn/lampRoundTable.glb", { h: 0.45 }],
  lampFloor:   ["assets/models/furn/lampRoundFloor.glb", { h: 1.5 }],
  rug:         ["assets/models/furn/rugRound.glb", { h: 0.025 }],
  kitchen:     ["assets/models/furn/kitchenCabinet.glb", { h: 0.9 }],
  kitchenSink: ["assets/models/furn/kitchenSink.glb", { h: 0.9 }],
  coffeeMk:    ["assets/models/furn/kitchenCoffeeMachine.glb", { h: 0.35 }],
  tvCabinet:   ["assets/models/furn/cabinetTelevision.glb", { h: 0.5 }],
  books:       ["assets/models/furn/books.glb", { h: 0.26 }],
  tableRound:  ["assets/models/furn/tableRound.glb", { h: 0.75 }],
  chairDine:   ["assets/models/furn/chairCushion.glb", { h: 0.95 }],
  plantBig:    ["assets/models/furn/pottedPlant.glb", { h: 1.1 }],
  plantSmall:  ["assets/models/furn/plantSmall2.glb", { h: 0.3 }],
  trashcan:    ["assets/models/furn/trashcan.glb", { h: 0.6 }],
  boxOpen:     ["assets/models/furn/cardboardBoxOpen.glb", { h: 0.45 }],
  toaster:     ["assets/models/furn/toaster.glb", { h: 0.22 }],
  doormat:     ["assets/models/furn/rugDoormat.glb", { h: 0.02 }],
  fridge:      ["assets/models/furn/kitchenFridgeSmall.glb", { h: 1.55 }],
  tvVintage:   ["assets/models/furn/televisionVintage.glb", { h: 0.5 }],
  tableCoffee: ["assets/models/furn/tableCoffee.glb", { h: 0.45 }],
  pillowB:     ["assets/models/furn/pillowBlue.glb", { h: 0.15 }],
  sideTable:   ["assets/models/furn/sideTable.glb", { h: 0.55 }],
  charA:       ["assets/models/char/character-a.glb", { h: 1.72 }],
  charB:       ["assets/models/char/character-c.glb", { h: 1.72 }],
  charC:       ["assets/models/char/character-f.glb", { h: 1.72 }],
  charD:       ["assets/models/char/character-h.glb", { h: 1.72 }],
  charE:       ["assets/models/char/character-l.glb", { h: 1.72 }],
  charF:       ["assets/models/char/character-o.glb", { h: 1.72 }],
  buildingA:   ["assets/models/city/building-d.glb", { h: 9 }],
  buildingB:   ["assets/models/city/building-e.glb", { h: 10 }],
  buildingC:   ["assets/models/city/building-g.glb", { h: 12 }],
  buildingD:   ["assets/models/city/building-h.glb", { h: 9.5 }],
  buildingE:   ["assets/models/city/building-n.glb", { h: 13 }],
};
const MODEL_YAW = -Math.PI / 2; // kenney characters face +X, not +Z
const modelCache = {}; // name -> { scene, scale, yOff }
let modelsRequested = false;
function preloadModels() {
  if (modelsRequested) return;
  modelsRequested = true;
  const loader = new GLTFLoader();
  for (const [k, [url, spec]] of Object.entries(MODEL_SRC)) {
    loader.load(url, (g) => {
      g.scene.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const box = new THREE.Box3().setFromObject(g.scene);
      const scale = spec.h / Math.max(box.getSize(new THREE.Vector3()).y, 1e-4);
      modelCache[k] = { scene: g.scene, scale, yOff: -box.min.y * scale };
    }, undefined, () => {}); // error -> procedural fallback carries the scene
  }
}
// Clone a preloaded model, normalized: origin at its floor point, true height.
function spawn(k) {
  const e = modelCache[k];
  if (!e) return null;
  const c = e.scene.clone(true);
  c.scale.setScalar(e.scale);
  c.position.y = e.yOff;
  const g = new THREE.Group();
  g.add(c);
  return g;
}

// Current ambience spec — re-sent when the drift band shifts the memory drone.
let currentAmb = null;
function setAmb(spec) { currentAmb = spec; SFX.ambience(spec); }

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- centered dialogue panel ----------
// Higgsfield keyart portraits, matched on the speaker tag. Degraded variants
// (late-game Vasic echoes) render washed out. Maya's slot fills when her
// portrait is generated.
const PORTRAITS = [
  [/what remains of vasic|vasic \(\?\)/i, "assets/higgsfield/vasic.png", true],
  [/vasic/i, "assets/higgsfield/vasic.png", false],
  [/eden|the archive/i, "assets/higgsfield/eden.png", false],
];
function portraitFor(who) {
  if (!who) return "";
  for (const [re, src, degraded] of PORTRAITS)
    if (re.test(who)) return `<img class="who-port${degraded ? " degraded" : ""}" src="${src}" alt="">`;
  return "";
}

// One message at a time — replace, don't pile up. `who` renders as a name tag.
function overlayShow(html, cls = "", who = null) {
  const log = $("overlay-log");
  log.innerHTML =
    portraitFor(who) +
    (who ? `<span class="who-tag">${who}</span>` : "") +
    `<p class="${cls}">${html}</p>`;
  $("overlay").style.display = "flex";
}
// back-compat alias for non-speaker lines (banners, scene, reveal…)
function overlayLine(html, cls = "") { overlayShow(html, cls, null); }

// Typewriter reveal, then AUTO-ADVANCE after a reading pause. Two stages:
//  1. Text types out. A click/key fills it instantly.
//  2. Once full, a "▼" cue appears; the line advances by itself after a delay
//     scaled to its length, or immediately on click / Enter / Space / E.
// No more [ Continue ] button on every line — pacing over ceremony.
let menuPaused = false; // Esc menu open: freeze typing + auto-advance
function typeLine(text, cls, who, wait = true, extraHold = 0, manual = false) {
  const log = $("overlay-log");
  $("overlay").style.display = "flex";
  log.innerHTML = portraitFor(who) + (who ? `<span class="who-tag">${who}</span>` : "") + `<p class="${cls}"></p>`;
  const p = log.querySelector("p");
  const box = $("overlay-choices");
  box.innerHTML = "";

  return new Promise((resolve) => {
    let i = 0, full = false, timer = null;

    const showAdvance = () => {
      if (!wait) { resolve(); return; } // choices follow — advance immediately
      const hint = document.createElement("div");
      hint.className = "adv-hint";
      hint.textContent = "▼";
      box.appendChild(hint);

      let autoTimer = null;
      const go = () => {
        clearTimeout(autoTimer);
        removeEventListener("keydown", keyAdvance, true);
        removeEventListener("pointerdown", clickAdvance, true);
        removeEventListener("keyup", arm, true);
        box.innerHTML = "";
        SFX.tick();
        resolve();
      };
      // Key advances only after the current keypress is released — one held key
      // can't blow through beats.
      let armed = false;
      const arm = () => { armed = true; removeEventListener("keyup", arm, true); };
      addEventListener("keyup", arm, true);
      const keyAdvance = (e) => {
        if (!armed || e.repeat) return;
        if (["Enter", "Space", "KeyE"].includes(e.code)) { e.preventDefault(); go(); }
      };
      const clickAdvance = () => go();
      addEventListener("keydown", keyAdvance, true);
      addEventListener("pointerdown", clickAdvance, true);

      // Manual lines never auto-advance — the player dismisses them (examined
      // fragments: "I need to be able to see it").
      if (manual) return;
      // Reading pause: ~26ms/char, clamped. Banners get extraHold.
      const delay = Math.min(2800, 600 + text.length * 26) + extraHold;
      const tryGo = () => { if (menuPaused) { autoTimer = setTimeout(tryGo, 250); return; } go(); };
      autoTimer = setTimeout(tryGo, delay);
    };

    const fill = () => {
      full = true;
      if (timer) { clearTimeout(timer); timer = null; }
      p.textContent = text;
      removeEventListener("pointerdown", skip, true);
      removeEventListener("keydown", skip, true);
      showAdvance();
    };
    // First click/key fills the text instantly; doesn't advance. Ignore key-repeat.
    const skip = (e) => {
      if (e.type === "keydown" && (e.code === "Escape" || e.repeat)) return;
      if (!full) { e.stopPropagation(); fill(); }
    };

    const tick = () => {
      if (menuPaused) { timer = setTimeout(tick, 250); return; } // freeze behind Esc menu
      p.textContent = text.slice(0, ++i);
      if (i >= text.length) return fill();
      const c = text[i - 1];
      // Quick but still breathing: brief hold on sentence punctuation.
      const d = (c === "." || c === "?" || c === "!") ? 90
              : (c === "," || c === ";" || c === "—") ? 45
              : 16;
      timer = setTimeout(tick, d);
    };

    addEventListener("pointerdown", skip, true);
    addEventListener("keydown", skip, true);
    tick();
  });
}
function overlayButtons(labels) {
  return new Promise((resolve) => {
    const box = $("overlay-choices");
    box.innerHTML = "";
    labels.forEach((label, i) => {
      const b = document.createElement("button");
      // Telltale-style bracketed inline option: [ label ]
      b.innerHTML = `<span class="brk">[</span> ${label} <span class="brk">]</span>`;
      b.style.animationDelay = (i * 70) + "ms"; // stagger the rise-in
      b.onclick = () => { box.innerHTML = ""; SFX.blip(); resolve(i); };
      box.appendChild(b);
    });
  });
}
// Case board modal — list of cases; click one to launch it. Resolves id or null.
function caseBoardModal(items) {
  return new Promise((resolve) => {
    uiBusy = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const done = (v) => { uiBusy = false; resolve(v); };
    const m = $("center-modal");
    const rows = items.map((it) => it.locked
      ? `<div class="board-row locked"><span class="br-id">${it.label}</span><span class="br-sub">${it.sub}</span></div>`
      : `<button class="board-row" data-id="${it.id}"><span class="br-id">${it.label}</span><span class="br-sub">${it.sub}</span></button>`
    ).join("");
    m.innerHTML = `<div class="cf-head">ARCHIVE BUREAU · CASE BOARD</div>${rows}` +
      `<div style="text-align:center;margin-top:14px"><button id="cb-close">Step away</button></div>`;
    m.style.display = "block";
    m.querySelectorAll("button.board-row").forEach((b) => {
      b.onclick = () => { m.style.display = "none"; m.innerHTML = ""; done(b.dataset.id); };
    });
    $("cb-close").onclick = () => { m.style.display = "none"; m.innerHTML = ""; done(null); };
  });
}

// Centered modal — case files appear in the middle of the screen.
function centerModal(html) {
  return new Promise((resolve) => {
    uiBusy = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const m = $("center-modal");
    m.innerHTML = html + `<div style="text-align:center;margin-top:14px"><button id="cm-close">Close</button></div>`;
    m.style.display = "block";
    $("cm-close").onclick = () => { m.style.display = "none"; m.innerHTML = ""; uiBusy = false; resolve(); };
  });
}

// ---------- procedural textures (canvas → tinted by material color) ----------
function tex(draw, w = 512, h = 512, repeat = null) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
// Drawn in grays so material `color` tints them per-room palette.
let _floorTex = null, _wallTex = null;
function floorTex() {
  return _floorTex ??= tex((g, w, h) => {
    g.fillStyle = "#8f8f8f"; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {                 // planks
      const v = 118 + Math.random() * 40 | 0;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(0, y, w, 62);
      g.fillStyle = "#4a4a4a"; g.fillRect(0, y + 62, w, 2); // seam
      // stagger a butt-joint per plank row
      const x = Math.random() * w | 0;
      g.fillRect(x, y, 2, 62);
    }
  }, 512, 512, [4, 4]);
}
function wallTex() {
  return _wallTex ??= tex((g, w, h) => {
    g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 128) {                // vertical panels
      g.fillStyle = "#7e7e7e"; g.fillRect(x, 0, 3, h);
    }
    g.fillStyle = "#767676"; g.fillRect(0, h * 0.68, w, 8);  // wainscot rail
    g.fillStyle = "rgba(60,60,60,.25)";               // grime near floor
    g.fillRect(0, h * 0.86, w, h * 0.14);
  }, 512, 512, [3, 1]);
}
function terminalTex() {
  return tex((g, w, h) => {
    g.fillStyle = "#04100a"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#22cc77"; g.font = "22px monospace";
    ["ARCHIVE // TERMINAL 07", "", "> case loaded", "> memory index: READY",
     "> drift monitor: [redacted]", "", "PRESS E TO REVIEW █"].forEach((l, i) =>
      g.fillText(l, 24, 48 + i * 34));
    g.strokeStyle = "rgba(34,204,119,.25)";           // scanlines
    for (let y = 0; y < h; y += 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }, 512, 320);
}
function boardTex() {
  return tex((g, w, h) => {
    g.fillStyle = "#101a26"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#2a3a4a"; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    const pins = [];
    for (let i = 0; i < 7; i++) {                      // pinned case cards
      const x = 40 + (i % 4) * 115 + Math.random() * 18, y = 46 + (i / 4 | 0) * 130 + Math.random() * 14;
      g.save(); g.translate(x, y); g.rotate((Math.random() - .5) * .14);
      g.fillStyle = "#c8c2b0"; g.fillRect(0, 0, 92, 104);
      g.fillStyle = "#333"; g.font = "10px monospace";
      g.fillText("CASE " + (i + 1).toString().padStart(3, "0"), 8, 16);
      for (let l = 0; l < 6; l++) { g.fillStyle = "#8a8578"; g.fillRect(8, 26 + l * 12, 60 + Math.random() * 18, 4); }
      g.restore(); pins.push([x + 46, y + 6]);
    }
    g.strokeStyle = "rgba(200,80,70,.7)"; g.lineWidth = 2;  // red string
    for (let i = 1; i < pins.length; i++) {
      g.beginPath(); g.moveTo(...pins[i - 1]); g.lineTo(...pins[i]); g.stroke();
    }
  }, 512, 320);
}
// What windows look onto: a slice of the painted night-sky keyart, framed on
// the amber skyline band. Each window gets its own texture instance (offsets
// differ); the image itself comes from browser cache after the first load.
function windowViewTex(ox = 0.35) {
  const t = new THREE.TextureLoader().load("assets/higgsfield/night_sky.png");
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(0.3, 0.42);
  t.offset.set(ox, 0.02); // bottom band of the panorama — skyline + lit clouds
  return t;
}

// ---------- procedural noir towers ----------
// Replaces the deleted GLB building kit. Facade and lit-window emissive are
// twin canvases sharing one grid, so bloom catches only the windows — that
// glow against dark concrete is what sells the rain-night city.
const _bldgMats = [];
function buildingMat(seed) {
  const i = seed % 3;
  if (_bldgMats[i]) return _bldgMats[i];
  const w = 256, h = 512;
  const face = document.createElement("canvas"); face.width = w; face.height = h;
  const glow = document.createElement("canvas"); glow.width = w; glow.height = h;
  const f = face.getContext("2d"), e = glow.getContext("2d");
  f.fillStyle = ["#3d3a38", "#33383e", "#403c34"][i]; f.fillRect(0, 0, w, h);
  e.fillStyle = "#000"; e.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 4) {                    // rain-grime streaks
    f.fillStyle = `rgba(0,0,0,${Math.random() * 0.14})`;
    f.fillRect(x, 0, 4, h);
  }
  for (let y = 18; y < h - 30; y += 34)               // window grid, ~38% lit
    for (let x = 14; x < w - 20; x += 30) {
      f.fillStyle = "#16181d"; f.fillRect(x, y, 18, 24);
      if (Math.random() < 0.38) {
        e.fillStyle = Math.random() < 0.75 ? "#ffb45e" : "#9fc4ff";
        e.fillRect(x + 1, y + 1, 16, 22);
      }
    }
  const mk = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  return _bldgMats[i] = new THREE.MeshStandardMaterial({
    map: mk(face), emissiveMap: mk(glow), emissive: 0xffffff, emissiveIntensity: 1.35, roughness: 0.92,
  });
}
function makeBuilding(hgt, seed) {
  const g = new THREE.Group();
  const wd = 6 + (seed % 3) * 1.5, dp = 6 + ((seed + 1) % 3) * 1.5;
  const body = new THREE.Mesh(new THREE.BoxGeometry(wd, hgt, dp), buildingMat(seed));
  body.position.y = hgt / 2; body.castShadow = body.receiveShadow = true;
  g.add(body);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(wd + 0.3, 0.35, dp + 0.3),
    new THREE.MeshStandardMaterial({ color: 0x232528, roughness: 1 }));
  cap.position.y = hgt + 0.17; g.add(cap);
  const ac = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.6, metalness: 0.4 }));
  ac.position.set(wd * 0.2, hgt + 0.75, -dp * 0.15); g.add(ac);
  return g;
}

// ---------- 3D engine (shared by bureau + memory rooms) ----------
let renderer, scene, camera, raycaster, clock, composer, renderPass;
let targets = [];            // examinable objects (meshes or groups)
let yaw = 0, pitch = 0, locked = false, active = false;
let uiBusy = false;          // true while a modal/dialogue owns input — suspends examine/look/relock
let pausePrevBusy = false;   // uiBusy state saved when the Esc menu opens
let camIntroT = 0;           // 1 -> 0 ease for the memory-enter camera punch-in
const keys = {};
let bounds = { x: 4.5, z: 4.5 };
let onExamine = null;        // current room's examine handler
let roomFx = {};             // per-room animated refs: { lamp, dust, flicker }

function initRenderer() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ canvas: $("scene-canvas"), antialias: true });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Cinematic pass chain: bloom makes lamps/neon glow like a rain-night city.
  // MSAA + HalfFloat target keeps edges clean and HDR headroom for ACES.
  composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
    innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType }));
  renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
  composer.addPass(renderPass);
  // threshold 0.8: only genuinely bright things bloom, rooms stay noir not hazy
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.4, 0.8));
  composer.addPass(new OutputPass());
  raycaster = new THREE.Raycaster();
  clock = new THREE.Clock();

  // Audio unlocks on the first gesture (browser autoplay policy).
  addEventListener("pointerdown", SFX.unlock, { once: true });
  addEventListener("keydown", SFX.unlock, { once: true });

  addEventListener("resize", () => {
    if (!camera) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    composer.setSize(innerWidth, innerHeight);
  });
  // E examines on the initial press only — ignore auto-repeat so one press = one examine.
  addEventListener("keydown", (e) => { keys[e.code] = true; if (e.code === "KeyE" && !e.repeat) doExamine(); });
  addEventListener("keyup", (e) => { keys[e.code] = false; });

  const cv = renderer.domElement;
  // Only grab the pointer when roaming — never while a modal/dialogue is open.
  cv.addEventListener("click", () => { if (active && !uiBusy) cv.requestPointerLock(); });
  document.addEventListener("pointerlockchange", () => { locked = document.pointerLockElement === cv; });
  document.addEventListener("mousemove", (e) => {
    if (!locked) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-1.2, Math.min(1.2, pitch));
  });
  loop();
}

// Enclosed room: floor, ceiling, 4 walls, dust in the air. Reference pattern.
function buildRoom(palette, size = 10) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.bg);
  // Fog pushed back so the room is legible, not a murk wall. Atmosphere, not blackout.
  scene.fog = new THREE.Fog(palette.fogColor ?? palette.bg, palette.fogNear ?? 10, palette.fogFar ?? 30);
  targets = [];
  roomFx = { flicker: !!palette.flicker };

  scene.add(new THREE.AmbientLight(palette.amb ?? 0xffe9c4, (palette.ambI ?? 1.1) * 0.95));
  const hemi = new THREE.HemisphereLight(0xaab4d4, 0x33302a, 0.8);
  scene.add(hemi);
  // Main ceiling light — the only shadow caster. One is enough for one room.
  const lamp = new THREE.SpotLight(palette.lamp ?? 0xffe0b0, 120, 22, 1.3, 0.6, 1.4);
  lamp.position.set(0, 3.25, 0);
  lamp.target.position.set(0, 0, 0);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  lamp.shadow.bias = -0.002;
  scene.add(lamp, lamp.target);
  roomFx.lamp = lamp;
  const fill = new THREE.PointLight(0xbfd4ff, 10, 30);
  fill.position.set(0, 2.4, 3.4);
  scene.add(fill);

  const floorMat = new THREE.MeshStandardMaterial({ color: palette.floor ?? 0x3a3026, map: floorTex(), roughness: 0.92 });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(size, size), floorMat);
  fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; scene.add(fl);
  const cl = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color: palette.ceil ?? 0x2a241c }));
  cl.rotation.x = Math.PI / 2; cl.position.y = 3.4; scene.add(cl);

  const wallMat = new THREE.MeshStandardMaterial({ color: palette.wall ?? 0x4a3f30, map: wallTex(), roughness: 0.96 });
  const wall = (x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, 3.4), wallMat);
    m.position.set(x, 1.7, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m);
  };
  const hw = size / 2;
  wall(0, -hw, 0); wall(0, hw, Math.PI); wall(-hw, 0, Math.PI / 2); wall(hw, 0, -Math.PI / 2);

  // Hanging lamp fixture under the spot — the light has a visible source.
  const fixture = new THREE.Group();
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  wire.position.y = 3.15;
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.26, 20, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x2c2c30, side: THREE.DoubleSide }));
  shade.position.y = 2.85;
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshBasicMaterial({ color: palette.lamp ?? 0xffe0b0 }));
  bulb.position.y = 2.8;
  fixture.add(wire, shade, bulb);
  scene.add(fixture);

  // Dust motes — cheap air. Excluded from raycasting.
  const n = 140, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - .5) * (size - 0.4);
    pos[i * 3 + 1] = 0.2 + Math.random() * 3;
    pos[i * 3 + 2] = (Math.random() - .5) * (size - 0.4);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xaabbcc, size: 0.018, transparent: true, opacity: 0.22, depthWrite: false }));
  dust.raycast = () => {}; // never blocks the crosshair
  scene.add(dust);
  roomFx.dust = dust;

  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 100);
  camera.position.set(0, 1.6, 4);
  yaw = 0; pitch = 0;
  bounds = { x: hw - 0.6, z: hw - 0.7 };
}

// Register any Object3D as examinable. data carries what examine should do.
function registerTarget(obj, data) {
  obj.userData = { ...data, __t: true };
  scene.add(obj);
  targets.push(obj);
  return obj;
}

// Simple box target (flavor props). Kept for anything that reads fine as a box.
function addTarget(o) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(o.w, o.h, o.d),
    new THREE.MeshStandardMaterial({ color: o.c, emissive: o.e || 0x000000, emissiveIntensity: 0.6, roughness: 0.5 })
  );
  m.position.set(o.x, o.y, o.z);
  m.castShadow = true;
  return registerTarget(m, o);
}

// A simple person: legs, coat, arms, scarf in their accent color, head.
// ponytail: stylized capsule-people, not rigged models. Reads as human at this
// art level; swap for GLB characters only if the style stops carrying it.
function makeHuman(accent) {
  const g = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: 0x3c4454, roughness: 0.85 });
  const slacks = new THREE.MeshStandardMaterial({ color: 0x2c323e, roughness: 0.9 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9b299, roughness: 0.75 });
  const acc = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.6, emissive: accent, emissiveIntensity: 0.18 });

  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.82, 10), slacks);
  legs.position.y = 0.41;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.23, 0.5, 4, 12), coat);
  torso.position.y = 1.2;
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.44, 4, 8), coat);
  armL.position.set(-0.31, 1.16, 0); armL.rotation.z = 0.13;
  const armR = armL.clone(); armR.position.x = 0.31; armR.rotation.z = -0.13;
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.05, 8, 16), acc);
  scarf.position.y = 1.52; scarf.rotation.x = Math.PI / 2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), skin);
  head.position.y = 1.76;
  g.add(legs, torso, armL, armR, scarf, head);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// ---------- furniture ----------
const wood = (c = 0x6a543e) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 });
const metal = (c = 0x3a4048) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.45, metalness: 0.5 });

function makeDesk() {
  const m = spawn("desk");
  if (m) {
    const g = new THREE.Group();
    g.add(m);
    const lamp = spawn("lampTable");
    if (lamp) { lamp.position.set(-0.75, 0.75, -0.15); g.add(lamp); }
    return g;
  }
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 1.1), wood(0x7a6248));
  top.position.y = 0.86;
  g.add(top);
  for (const [x, z] of [[-1.1, -0.45], [1.1, -0.45], [-1.1, 0.45], [1.1, 0.45]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.86, 0.09), wood(0x5c4a36));
    leg.position.set(x, 0.43, z);
    g.add(leg);
  }
  const drawers = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.95), wood(0x6a543e));
  drawers.position.set(0.8, 0.55, 0);
  g.add(drawers);
  // papers + a folder on top — the desk is worked at
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.012, 0.44),
    new THREE.MeshStandardMaterial({ color: 0xbcb6a4, roughness: 1 }));
  paper.position.set(-0.5, 0.905, 0.1); paper.rotation.y = 0.24;
  const folder = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.03, 0.48),
    new THREE.MeshStandardMaterial({ color: 0x8a4a42, roughness: 0.9 }));
  folder.position.set(-0.05, 0.91, -0.12); folder.rotation.y = -0.12;
  g.add(paper, folder);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// Origin at its base — set it directly on a desk top.
function makeTerminal() {
  const g = new THREE.Group();
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.11, 0.16, 10), metal());
  stand.position.y = 0.08;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.62, 0.07), metal(0x2c323a));
  body.position.y = 0.46;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.52),
    new THREE.MeshBasicMaterial({ map: terminalTex() })); // basic = self-lit glow
  screen.position.set(0, 0.46, 0.037);
  g.add(stand, body, screen);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  // faint green cast onto the desk
  const glow = new THREE.PointLight(0x2aff88, 1.6, 3.5);
  glow.position.set(0, 0.4, 0.4);
  g.add(glow);
  return g;
}

function makeChair() {
  const m = spawn("chairDesk");
  if (m) return m;
  const g = new THREE.Group();
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.07, 0.5), wood(0x6a5a48));
  seat.position.y = 0.5;
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.06), wood(0x6a5a48));
  back.position.set(0, 0.85, 0.23);
  g.add(seat, back);
  for (const [x, z] of [[-0.22, -0.2], [0.22, -0.2], [-0.22, 0.2], [0.22, 0.2]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 8), wood(0x504234));
    leg.position.set(x, 0.25, z);
    g.add(leg);
  }
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

function makeBookshelf(closed = false) {
  const m = spawn(closed ? "bookcase2" : "bookcase");
  if (m) {
    const g = new THREE.Group();
    g.add(m);
    const bk = spawn("books");
    if (bk) { bk.position.set(0, 0.75, 0.02); g.add(bk); }
    return g;
  }
  const g = new THREE.Group();
  const frame = wood(0x54432f);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.3, 0.05), frame);
  back.position.y = 1.15;
  g.add(back);
  for (const x of [-0.85, 0.85]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.3, 0.36), frame);
    side.position.set(x, 1.15, 0.15);
    g.add(side);
  }
  for (let s = 0; s < 5; s++) {
    const y = 0.24 + s * 0.5;
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.36), frame);
    shelf.position.set(0, y, 0.15);
    g.add(shelf);
    if (s === 4) continue; // top shelf bare
    let x = -0.76;
    while (x < 0.72) {                                  // a run of books
      const bw = 0.05 + Math.random() * 0.06, bh = 0.26 + Math.random() * 0.14;
      const hue = 0.52 + Math.random() * 0.16 - (Math.random() < 0.3 ? 0.45 : 0); // blues, some browns
      const col = new THREE.Color().setHSL(hue, 0.28, 0.24 + Math.random() * 0.14);
      const b = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.24),
        new THREE.MeshStandardMaterial({ color: col, roughness: 0.9 }));
      b.position.set(x + bw / 2, y + 0.025 + bh / 2, 0.16);
      b.rotation.z = Math.random() < 0.08 ? 0.09 : 0;   // the odd leaning book
      g.add(b);
      x += bw + 0.008;
      if (Math.random() < 0.12) x += 0.09;              // gaps — books get borrowed
    }
  }
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

function makeCabinet() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.76, 1.32, 0.6), metal(0x46505c));
  body.position.y = 0.66;
  g.add(body);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.36, 0.03), metal(0x525c68));
    f.position.set(0, 0.28 + i * 0.42, 0.31);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, 0.03), metal(0x222222));
    h.position.set(0, 0.28 + i * 0.42, 0.335);
    g.add(f, h);
  }
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// The Keeper's ledger — a small notebook that appears on the desk once the
// player logs their first anomaly. Examining it opens the ledger modal.
function makeNotebook() {
  const g = new THREE.Group();
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.035, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x2e2622, roughness: 0.85 }));
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.3),
    new THREE.MeshStandardMaterial({ color: 0xa89e8a, roughness: 1 }));
  pages.position.y = -0.006;
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.32),
    new THREE.MeshStandardMaterial({ color: 0x7a3a34, roughness: 0.8 }));
  band.position.x = 0.06;
  g.add(cover, pages, band);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// The anomalies, in the player's own shorthand. Unfound entries stay redacted.
const LEDGER_ENTRIES = [
  ["anomaly_1", "Three citizens. Decades apart. One filing hand. Mine."],
  ["anomaly_2", "K-902 filed tomorrow. The ruling writes the record."],
  ["anomaly_3", "Every timestamp identical: one second past 07:41, eleven days ago."],
  ["anomaly_4", "N-000 is District 7. The Bureau sits at the center of the undefined."],
  ["anomaly_5", "No personnel file for Maya. No one else has ever spoken to her."],
  ["anomaly_6", "Eleven days. One unbroken thread. It's me — and so is she."],
];
function ledgerModal() {
  const rows = LEDGER_ENTRIES.map(([flag, text], i) => {
    const found = State.has(flag);
    return `<tr><td>${i + 1}.</td><td${found ? "" : ' style="color:#556;letter-spacing:2px"'}>` +
           `${found ? text : "· · · · · · · · · · · · · · ·"}</td></tr>`;
  }).join("");
  const done = State.has("anomaly_6");
  return centerModal(
    `<div class="cf-head">KEEPER'S LEDGER · PERSONAL · DO NOT FILE</div>
     <table>${rows}</table>
     <p class="cf-verdict">${done
       ? "Record status: CONTINUITY LOCATED. Nothing left to count."
       : "Some pages are still blank. Keep counting."}</p>`
  );
}

function makeCaseBoard() {
  const g = new THREE.Group();
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.74, 0.08), wood(0x4a3c2c));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2.62, 1.56),
    new THREE.MeshBasicMaterial({ map: boardTex() }));
  face.position.z = 0.045;
  g.add(frame, face);
  const spot = new THREE.PointLight(0xffe8c0, 2.2, 4);  // picture light
  spot.position.set(0, 1.1, 0.7);
  g.add(spot);
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

function targetUnderCrosshair() {
  if (!camera) return null;
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  // Raycast everything recursively so walls/furniture occlude targets, then climb
  // from the hit mesh to its registered root. First hit wins.
  const hit = raycaster.intersectObjects(scene.children, true)[0];
  if (!hit || hit.distance > 3.4) return null;
  let o = hit.object;
  while (o && !o.userData.__t) o = o.parent;
  return (o && targets.includes(o)) ? o : null;
}

function doExamine() {
  if (!active || uiBusy || !onExamine) return; // ignore E while a modal/dialogue owns input
  const o = targetUnderCrosshair();
  if (o) onExamine(o.userData, o);
}

function move(dt) {
  const s = (roomFx.moveSpeed || 3) * dt;
  const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const r = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const mv = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) mv.add(f);
  if (keys.KeyS || keys.ArrowDown) mv.sub(f);
  if (keys.KeyD || keys.ArrowRight) mv.add(r);
  if (keys.KeyA || keys.ArrowLeft) mv.sub(r);
  if (mv.lengthSq() > 0) { mv.normalize().multiplyScalar(s); camera.position.add(mv); }
  camera.position.x = Math.max(-bounds.x, Math.min(bounds.x, camera.position.x));
  camera.position.z = Math.max(-bounds.z, Math.min(bounds.z, camera.position.z));
  // solid buildings: push out along the axis of least penetration
  for (const c of roomFx.colliders || []) {
    const { x, z } = camera.position;
    if (x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1) {
      const px = Math.min(x - c.x0, c.x1 - x);
      const pz = Math.min(z - c.z0, c.z1 - z);
      if (px < pz) camera.position.x = (x - c.x0 < c.x1 - x) ? c.x0 : c.x1;
      else camera.position.z = (z - c.z0 < c.z1 - z) ? c.z0 : c.z1;
    }
  }
  camera.position.y = 1.6;
}

function loop() {
  requestAnimationFrame(loop);
  if (!scene || !camera) return;
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (active && !uiBusy) {
    if (locked) move(dt);
    const o = targetUnderCrosshair();
    const ph = $("ph");
    if (o) {
      // Name shown BEFORE interacting so you know what it is. Below it: the action.
      const act = o.userData.kind === "npc" || o.userData.kind === "worker" ? "[E] Talk"
                : o.userData.kind === "exit_door" ? "[E] Leave for the Bureau"
                : o.userData.kind === "bureau_door" ? "[E] Enter the Bureau"
                : o.userData.kind === "mission" ? "[E] Investigate"
                : o.userData.kind === "exit" ? "[E] Submit findings"
                : "[E] Examine";
      ph.innerHTML = `<span class="ph-name">${o.userData.name || "Object"}</span><span class="ph-act">${act}</span>`;
      ph.style.opacity = 1;
    } else {
      ph.style.opacity = 0;
    }
  } else {
    $("ph").style.opacity = 0; // hide the prompt whenever roaming is suspended
  }
  // Camera orientation, plus a slow drift while the player isn't steering —
  // dialogue plays over a scene that breathes instead of a freeze-frame.
  const swaying = !locked || uiBusy;
  const sy = swaying ? Math.sin(t * 0.28) * 0.012 : 0;
  const sx = swaying ? Math.cos(t * 0.21) * 0.008 : 0;
  camera.rotation.set(0, 0, 0);
  camera.rotateY(yaw + sy);
  camera.rotateX(pitch + sx);
  // Camera ease-in on memory enter: slight FOV punch settling to normal.
  if (camIntroT > 0) {
    camIntroT = Math.max(0, camIntroT - dt * 1.6);
    camera.fov = 72 + 12 * (camIntroT * camIntroT); // ease-out (quadratic)
    camera.updateProjectionMatrix();
  }
  // Room life: NPC breathing, fragment crystals float+spin, dust rises, bad lamps flicker.
  for (const m of targets) {
    const u = m.userData;
    if (u.kind === "npc" || u.kind === "worker") {
      const phase = m.position.x + m.position.z;
      m.position.y = (u.baseY ?? 0) + Math.sin(t * 1.4 + phase) * 0.03; // breathe
      m.rotation.y = (u.baseRy ?? 0) + Math.sin(t * 0.5 + phase) * 0.08; // slight sway
    } else if (u.kind === "frag") {
      m.position.y = (u.baseY ?? 1) + Math.sin(t * 1.1 + u.index) * 0.12;
      m.rotation.y += dt * 0.6;
      m.rotation.x = Math.sin(t * 0.7 + u.index) * 0.2;
    } else if (u.kind === "exit") {
      m.rotation.y += dt * 0.25;
    }
  }
  if (roomFx.dust) {
    const p = roomFx.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) + dt * 0.06;
      if (y > 3.2) y = 0.15;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }
  if (roomFx.flicker && roomFx.lamp) {
    // corrupted memories: the light itself is unreliable
    roomFx.lamp.intensity = 120 * (Math.random() < 0.06 ? 0.55 + Math.random() * 0.3 : 1);
  }
  // environment life: lighthouse beam turns, rain falls, undefined geometry drifts
  if (roomFx.beacon) roomFx.beacon.rotation.y = t * 0.45;
  if (roomFx.rainPts) {
    const p = roomFx.rainPts.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) - dt * 9;
      if (y < 0) y = 10;
      p.setY(i, y);
    }
    p.needsUpdate = true;
  }
  // pedestrians walk their lanes; flip at the district edge
  if (roomFx.peds) {
    for (const p of roomFx.peds) {
      const v = p.speed * dt * p.dir;
      const range = p.range ?? 40; // city sidewalks by default; office lanes pass their own
      if (p.alongX) {
        p.o.position.x += v;
        if (Math.abs(p.o.position.x) > range) p.dir *= -1;
        p.o.rotation.y = (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) + p.off;
      } else {
        p.o.position.z += v;
        if (Math.abs(p.o.position.z) > range) p.dir *= -1;
        p.o.rotation.y = (p.dir > 0 ? 0 : Math.PI) + p.off;
      }
      p.o.position.y = Math.sin(t * 2.2 + p.o.position.x + p.o.position.z) * 0.02;
    }
  }
  // the Repeating Man: forty meters, pause (checks the watch he isn't wearing), back
  if (roomFx.repeater) {
    const r = roomFx.repeater;
    if (r.pause > 0) r.pause -= dt;
    else {
      r.o.position.z += 1.35 * dt * r.dir;
      if (r.o.position.z >= r.z1) { r.o.position.z = r.z1; r.dir = -1; r.pause = 0.9; }
      if (r.o.position.z <= r.z0) { r.o.position.z = r.z0; r.dir = 1; r.pause = 0.9; }
      r.o.rotation.y = r.dir > 0 ? 0 : Math.PI;
    }
  }
  // Maya walks ahead-right of the player — in frame, where you can see her.
  if (roomFx.maya) {
    const m = roomFx.maya;
    const tx = camera.position.x - Math.sin(yaw) * 2.4 + Math.cos(yaw) * 1.5;
    const tz = camera.position.z - Math.cos(yaw) * 2.4 - Math.sin(yaw) * 1.5;
    const dx = tx - m.position.x, dz = tz - m.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 20) { m.position.set(tx, 0, tz); }               // catch up after sprints
    else if (d > 0.3) {
      const sp = Math.min((roomFx.moveSpeed || 3) * 1.15, d * 2.2) * dt;
      m.position.x += (dx / d) * sp;
      m.position.z += (dz / d) * sp;
      m.rotation.y = Math.atan2(dx, dz);                     // face where she walks
    } else {
      // idle: face the player
      m.rotation.y = Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z);
    }
    m.position.y = Math.sin(t * 1.6) * 0.02; // walk-ish bob
  }
  if (roomFx.city && active) updateCityHud();
  if (roomFx.floaters) {
    for (const f of roomFx.floaters.children) {
      f.rotation.x += dt * f.userData.spin;
      f.rotation.y += dt * f.userData.spin * 0.7;
      f.position.y += Math.sin(t * 0.3 + f.position.x) * dt * 0.1;
    }
  }
  renderPass.scene = scene;
  renderPass.camera = camera;
  composer.render();
}

// Enter a room: show crosshair + prompt, capture pointer, wait until `done()` called.
function enterRoom(examineHandler) {
  active = true;
  uiBusy = false;
  $("crosshair").style.display = "block";
  $("ph").style.display = "block";
  onExamine = examineHandler;
}
function exitRoom() {
  active = false;
  uiBusy = false;
  $("crosshair").style.display = "none";
  $("ph").style.display = "none";
  $("ph").style.opacity = 0;
  if (document.pointerLockElement) document.exitPointerLock();
  onExamine = null;
}

// ---------- the apartment: an ordinary morning, eleven mornings in a row ----------
function clockTex() {
  return tex((g, w, h) => {
    g.fillStyle = "#0a0806"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#cc3a2a"; g.font = "bold 64px monospace";
    g.fillText("07:41", 24, 82);
  }, 220, 120);
}
function tallyTex() {
  return tex((g, w, h) => {
    g.fillStyle = "#9a9a9a"; g.fillRect(0, 0, w, h); // tinted by wall color
    g.strokeStyle = "#3a332c"; g.lineWidth = 5; g.lineCap = "round";
    let x = 30;
    for (let n = 0; n < 11; n++) {                    // ||||/ ||||/ |
      if (n > 0 && n % 5 === 0) x += 26;
      const slash = (n % 5 === 4);
      g.beginPath();
      if (slash) { g.moveTo(x - 78, 30); g.lineTo(x - 8, 90); }
      else { g.moveTo(x, 26 + Math.random() * 5); g.lineTo(x - 4 + Math.random() * 8, 94); x += 18; }
      g.stroke();
    }
  }, 300, 120);
}

function buildApartment() {
  buildRoom({ bg: 0x161219, fogColor: 0x161219, fogNear: 9, fogFar: 26,
              floor: 0x4a3c30, ceil: 0x2c241e, wall: 0x584a3e,
              amb: 0xd0b090, ambI: 1.4, lamp: 0xffdca8 }, 8);

  // bed, corner — model when loaded, boxes otherwise
  const bed = new THREE.Group();
  const bedModel = spawn("bedSingle");
  if (bedModel) {
    bed.add(bedModel);
  } else {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 2.1), wood(0x4c3a2a));
    frame.position.y = 0.15;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x8a8276, roughness: 1 }));
    mattress.position.y = 0.33;
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.08, 1.3),
      new THREE.MeshStandardMaterial({ color: 0x4a5468, roughness: 1 }));
    blanket.position.set(0, 0.44, 0.35);
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.4),
      new THREE.MeshStandardMaterial({ color: 0xa8a094, roughness: 1 }));
    pillow.position.set(0, 0.46, -0.75);
    bed.add(frame, mattress, blanket, pillow);
  }
  bed.position.set(-3.15, 0, -2.6); // against the west wall
  registerTarget(bed, { id: "bed", name: "Your Bed", kind: "flavor",
    t: "Unmade, the same unmade as yesterday. You woke up already knowing the time. You usually do." });

  // nightstand + alarm clock
  const stand = new THREE.Group();
  const top2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.4), wood(0x54432f));
  top2.position.y = 0.25;
  const clock = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.16),
    new THREE.MeshBasicMaterial({ map: clockTex() }));
  clock.position.set(0, 0.62, 0.1); clock.rotation.x = -0.25;
  stand.add(top2, clock);
  stand.position.set(-1.95, 0, -3.6);
  registerTarget(stand, { id: "clock", name: "Alarm Clock", kind: "flavor",
    t: "07:41. It said 07:41 yesterday, when you looked. You look once a day." });

  // tally marks above the bed
  const tally = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.44),
    new THREE.MeshStandardMaterial({ color: 0x584a3e, map: tallyTex() }));
  tally.position.set(-3.15, 1.9, -3.94);
  registerTarget(tally, { id: "tally", name: "Marks on the Wall", kind: "flavor",
    t: "Eleven marks. Your hand made them — the strokes lean the way your writing leans. You only remember making the last one." });

  // kitchenette: counter + kettle, right wall — kit models when loaded
  const kit = new THREE.Group();
  const kc = spawn("kitchen"), ks = spawn("kitchenSink"), cm = spawn("coffeeMk");
  if (kc && ks) {
    kc.position.x = -0.85; ks.position.x = 0.55;
    kit.add(kc, ks);
    if (cm) { cm.position.set(-0.75, 0.78, 0.05); kit.add(cm); }
    const to = spawn("toaster");
    if (to) { to.position.set(-1.15, 0.78, 0.05); kit.add(to); }
    const fr = spawn("fridge");
    if (fr) { fr.position.x = 1.6; kit.add(fr); }
  } else {
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 0.6), wood(0x50402e));
    counter.position.y = 0.45;
    const kettle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.22, 12), metal(0x8a8f96));
    kettle.position.set(-0.5, 1.0, 0);
    const cup2 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.045, 0.1, 10),
      new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.6 }));
    cup2.position.set(0.1, 0.95, 0.1);
    kit.add(counter, kettle, cup2);
  }
  kit.position.set(3.62, 0, -1.2); kit.rotation.y = -Math.PI / 2;

  // a little more life: a proper TV corner — cabinet against the wall, sofa
  // facing it, floor lamp beside, rug between. (models only — skip silently otherwise)
  const tv = spawn("tvCabinet");
  if (tv) { // front faces into the room
    tv.position.set(1.5, 0, -3.62);
    registerTarget(tv, { id: "tv", name: "Television", kind: "flavor",
      t: "The screen is off. You don't remember ever turning it on. You don't remember buying it. It gets excellent reception of nothing." });
  }
  const sofa = spawn("sofa");
  if (sofa) { sofa.position.set(1.5, 0, -1.9); sofa.rotation.y = Math.PI; scene.add(sofa); } // faces the TV
  const flamp = spawn("lampFloor");
  if (flamp) {
    flamp.position.set(2.75, 0, -3.5); scene.add(flamp);
    const gl = new THREE.PointLight(0xffdca8, 4, 6); gl.position.set(2.75, 1.6, -3.5); scene.add(gl);
  }
  const rug = spawn("rug");
  if (rug) { rug.position.set(1.5, 0.02, -2.75); scene.add(rug); } // between sofa and TV
  const tvSet = spawn("tvVintage");
  if (tvSet && tv) { tvSet.position.set(1.5, 0.5, -3.62); scene.add(tvSet); } // the set on its cabinet
  const ct = spawn("tableCoffee");
  if (ct) { ct.position.set(1.5, 0, -2.75); scene.add(ct); }
  const pw = spawn("pillowB");
  if (pw) { pw.position.set(1.95, 0.4, -1.85); pw.rotation.y = 0.5; scene.add(pw); } // tossed on the sofa

  // ---- lived-in: dinner spot, plants, clutter that says someone exists here ----
  const dine = spawn("tableRound");
  if (dine) {
    dine.position.set(2.2, 0, 1.0); scene.add(dine);
    const c1 = spawn("chairDine"), c2 = spawn("chairDine");
    if (c1) { c1.position.set(2.2, 0, 1.78); c1.rotation.y = Math.PI; scene.add(c1); }
    if (c2) { c2.position.set(2.2, 0, 0.22); scene.add(c2); }
    // one chair pulled out, one tucked in — dinner for one, set for two
  }
  const pb = spawn("plantBig");
  if (pb) { pb.position.set(-3.4, 0, 2.4); scene.add(pb); }        // by the window
  const psm = spawn("plantSmall");
  if (psm && dine) { psm.position.set(2.2, 0.75, 1.0); scene.add(psm); } // on the table
  const trash = spawn("trashcan");
  if (trash) { trash.position.set(3.4, 0, 0.6); scene.add(trash); }
  const mat = spawn("doormat");
  if (mat) { mat.position.set(-0.4, 0.015, 3.35); scene.add(mat); } // inside the door
  const box = spawn("boxOpen");
  if (box) {                                                        // never unpacked
    box.position.set(-3.5, 0, 0.2); box.rotation.y = 0.4;
    registerTarget(box, { id: "movebox", name: "Cardboard Box", kind: "flavor",
      t: "A moving box, still packed. The tape was never cut. You've lived here... how long, exactly?" });
  }
  const st = spawn("sideTable");
  if (st) { st.position.set(2.85, 0, -1.9); scene.add(st); }        // beside the sofa
  const bks = spawn("books");
  if (bks && st) { bks.position.set(2.85, 0.55, -1.9); bks.rotation.y = -0.3; scene.add(bks); }
  registerTarget(kit, { id: "kettle", name: "Kettle", kind: "flavor",
    t: "The kettle is already warm. You live alone." });

  // mirror by the door
  const mirror = new THREE.Group();
  const mFrame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.05), wood(0x3c3428));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.98),
    new THREE.MeshStandardMaterial({ color: 0x30363e, roughness: 0.15, metalness: 0.8 }));
  glass.position.z = 0.03;
  mirror.add(mFrame, glass);
  mirror.position.set(2.6, 1.7, 3.94); mirror.rotation.y = Math.PI;
  registerTarget(mirror, { id: "mirror", name: "Mirror", kind: "flavor",
    t: "You look exactly the way you remember. Exactly." });

  // coat on a hook
  const coat = new THREE.Group();
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.08), wood(0x3c3428));
  hook.position.y = 1.9;
  const body2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.1, 10),
    new THREE.MeshStandardMaterial({ color: 0x3c4454, roughness: 0.85 }));
  body2.position.y = 1.28;
  coat.add(hook, body2);
  coat.position.set(1.6, 0, 3.88);
  registerTarget(coat, { id: "coat", name: "Your Coat", kind: "flavor",
    t: "Your coat. Dry, despite everything." });

  // window with the same rain
  const winG = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.2),
    new THREE.MeshBasicMaterial({ map: windowViewTex(0.55) }));
  const wf = wood(0x3c3428);
  const wfh = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.08, 0.08), wf);
  wfh.position.y = 0.63; const wfh2 = wfh.clone(); wfh2.position.y = -0.63;
  winG.add(pane, wfh, wfh2);
  winG.position.set(-3.94, 1.9, 1.2); winG.rotation.y = Math.PI / 2;
  registerTarget(winG, { id: "apt_window", name: "Window", kind: "flavor",
    t: "Rain over District 7. Same as yesterday. You like the sound — you're almost sure you like the sound." });
  const winLight = new THREE.PointLight(0x8fb0d0, 2.5, 8);
  winLight.position.set(-3.2, 2.0, 1.2);
  scene.add(winLight);

  // the front door — leaving starts the day
  const door = new THREE.Group();
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.2, 0.09), wood(0x4a3826));
  slab.position.y = 1.1;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), metal(0xa89858));
  knob.position.set(0.36, 1.05, 0.08);
  door.add(slab, knob);
  door.position.set(-0.4, 0, 3.92);
  registerTarget(door, { id: "front_door", name: "Front Door", kind: "exit_door",
    t: "The Bureau is waiting." });

  // wake up beside the bed, facing the room
  camera.position.set(-1.9, 1.6, -1.5);
  yaw = -Math.PI * 0.78;
  setAmb({ rain: 0.6, hum: 1 });
}

// ---------- District 7: free-roam city, missions, minimap, Maya ----------
function bureauSignTex() {
  return tex((g, w, h) => {
    g.fillStyle = "#0c1018"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#2a3a4a"; g.lineWidth = 6; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = "#e8d3a8"; g.font = "42px Georgia";
    g.textAlign = "center";
    g.fillText("ARCHIVE BUREAU", w / 2, 62);
    g.fillStyle = "#7aa2c0"; g.font = "16px monospace";
    g.fillText("DISTRICT 7 · MEMORY DIVISION", w / 2, 92);
  }, 512, 128);
}

// Maya, walking with you. Deliberately NOT a city character model: stylized
// figure, gold scarf. She doesn't look like the world because she isn't of it.
function makeMaya() {
  return makeHuman(0xe8d3a8);
}

let cityMissions = null; // fetched once per session
async function loadCityMissions() {
  if (cityMissions) return cityMissions;
  try {
    cityMissions = (await (await fetch("data/city_anomalies.json")).json()).missions;
  } catch { cityMissions = []; }
  return cityMissions;
}

function makeBeacon(done) {
  const g = new THREE.Group();
  const col = done ? 0x66cc88 : 0xe8b060;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.9, 26, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: done ? 0.05 : 0.13,
      side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 13;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 8, 26),
    new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.8 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.06;
  const l = new THREE.PointLight(col, done ? 1 : 5, 9);
  l.position.y = 2;
  g.add(beam, ring, l);
  return g;
}

function buildCity(missions) {
  buildOpen({ bg: 0x0a0d13, fogNear: 10, fogFar: 52, ground: 0x14161d,
              groundRough: 0.3, groundMetal: 0.35, amb: 0x6d7d9d, ambI: 0.95, sky: true }, 100);

  roomFx.colliders = [];
  // road grid — wet asphalt strips
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x191c22, roughness: 0.25, metalness: 0.45 });
  for (const c of [-22, 0, 22]) {
    const rh = new THREE.Mesh(new THREE.PlaneGeometry(96, 7), roadMat);
    rh.rotation.x = -Math.PI / 2; rh.position.set(0, 0.012, c); scene.add(rh);
    const rv = new THREE.Mesh(new THREE.PlaneGeometry(7, 96), roadMat);
    rv.rotation.x = -Math.PI / 2; rv.position.set(c, 0.012, 0); scene.add(rv);
  }

  // blocks of buildings (skip the Bureau plaza)
  const kits = ["buildingA", "buildingB", "buildingC", "buildingD", "buildingE"];
  let ki = 0;
  for (const bx of [-33, -11, 11, 33]) {
    for (const bz of [-33, -11, 11, 33]) {
      if (bz === -33 && Math.abs(bx) <= 11) continue; // bureau plaza
      // GLB kit if a Higgsfield mesh has landed at the path; noir tower otherwise
      const b = spawn(kits[ki % kits.length]) ?? makeBuilding(9 + (ki * 7) % 5, ki);
      ki++;
      b.position.set(bx + (Math.random() - .5) * 3, 0, bz + (Math.random() - .5) * 3);
      b.rotation.y = (Math.PI / 2) * (ki % 4);
      scene.add(b);
      const bb = new THREE.Box3().setFromObject(b);
      roomFx.colliders.push({ x0: bb.min.x - .35, x1: bb.max.x + .35, z0: bb.min.z - .35, z1: bb.max.z + .35 });
    }
  }
  // skyline silhouettes beyond the walkable edge
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const hgt = 22 + Math.random() * 26;
    const sil = new THREE.Mesh(new THREE.BoxGeometry(10 + Math.random() * 8, hgt, 10),
      new THREE.MeshBasicMaterial({ color: 0x0c0f16 }));
    sil.position.set(Math.cos(a) * 62, hgt / 2, Math.sin(a) * 62);
    scene.add(sil);
  }
  // streetlamps along the main road
  for (let z = -24; z <= 26; z += 12) {
    const x = (z / 12) % 2 ? 4.2 : -4.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 4, 8), metal(0x2a2e34));
    pole.position.set(x, 2, z); pole.castShadow = true; scene.add(pole);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
    head.position.set(x, 3.95, z); scene.add(head);
    const l = new THREE.PointLight(0xffc98a, 9, 13);
    l.position.set(x, 3.8, z); scene.add(l);
  }
  // rain over the whole district
  const n = 1300, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = (Math.random() - .5) * 84;
    pos[i * 3 + 1] = Math.random() * 14;
    pos[i * 3 + 2] = (Math.random() - .5) * 84;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const rain = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0x9fb2c8, size: 0.04, transparent: true, opacity: 0.45, depthWrite: false }));
  rain.raycast = () => {};
  scene.add(rain);
  roomFx.rainPts = rain;

  // the Bureau — a real building you walk into
  const bureau = spawn("buildingC");
  if (bureau) {
    bureau.position.set(0, 0, -36); scene.add(bureau);
    const bb = new THREE.Box3().setFromObject(bureau);
    roomFx.colliders.push({ x0: bb.min.x - .35, x1: bb.max.x + .35, z0: bb.min.z - .35, z1: bb.max.z + .35 });
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6),
    new THREE.MeshBasicMaterial({ map: bureauSignTex() }));
  sign.position.set(0, 4.6, -30.4); scene.add(sign);
  const signGlow = new THREE.PointLight(0xe8d3a8, 6, 12);
  signGlow.position.set(0, 4.2, -29); scene.add(signGlow);
  const doorBeam = new THREE.Group();
  const db = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.0, 5, 14, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xe8d3a8, transparent: true, opacity: 0.1,
      side: THREE.DoubleSide, depthWrite: false }));
  db.position.y = 2.5;
  doorBeam.add(db);
  doorBeam.position.set(0, 0, -30);
  registerTarget(doorBeam, { id: "bureau_door", name: "Archive Bureau", kind: "bureau_door",
    t: "The Bureau. Your desk is inside." });

  // mission beacons
  const mstate = missions.map(m => {
    const done = State.has(m.id);
    const beacon = makeBeacon(done);
    beacon.position.set(m.x, 0, m.z);
    registerTarget(beacon, { id: m.id, name: m.label, kind: "mission", mission: m });
    return { ...m, done, beacon };
  });

  // Maya walks with you
  const maya = makeMaya();
  maya.position.set(1.4, 0, 27.5);
  scene.add(maya);
  roomFx.maya = maya;

  // ambient pedestrians — post-Collapse commuters, walking their records
  const peds = [];
  const PKEYS = ["charA", "charC", "charD", "charE", "charF"];
  for (let i = 0; i < 10; i++) {
    const pm = spawn(PKEYS[i % PKEYS.length]);
    const p = pm || makeHuman(0x6a7180);
    const lane = [-22, 0, 22][i % 3] + (i % 2 ? 4.6 : -4.6); // sidewalks
    const alongX = i < 5;
    if (alongX) p.position.set((Math.random() - .5) * 70, 0, lane);
    else p.position.set(lane, 0, (Math.random() - .5) * 70);
    peds.push({ o: p, alongX, dir: Math.random() < .5 ? 1 : -1, speed: 1.1 + Math.random() * 0.7, off: pm ? MODEL_YAW : 0 });
    scene.add(p);
  }
  roomFx.peds = peds;

  // the Repeating Man — mission 1, in the flesh: forty meters, turn, back
  const rman = makeHuman(0x8a8a8a); // grey coat, deliberately unlike the others
  rman.position.set(16.5, 0, -16);
  scene.add(rman);
  roomFx.repeater = { o: rman, z0: -16, z1: 4, dir: 1, pause: 0 };

  roomFx.moveSpeed = 4.6;
  roomFx.city = { missions: mstate, bureau: { x: 0, z: -30 } };
  bounds = { x: 42, z: 42 };
  camera.position.set(0, 1.6, 30);
  yaw = 0; pitch = 0;

  buildCityHud(mstate);
  setAmb({ rain: 1.0, hum: 0 });
}

// ---- city HUD: objective card, world markers, minimap ----
function updateObjective(mstate) {
  const left = mstate.filter(m => !m.done).length;
  $("objective").style.display = "block";
  $("objective").querySelector(".obj-t").textContent = "Report to the Archive Bureau";
  $("objective").querySelector(".obj-s").textContent =
    left ? `Optional: ${left} anomal${left === 1 ? "y" : "ies"} detected nearby ⬥` : "All anomalies logged.";
}
function buildCityHud(mstate) {
  $("minimap").style.display = "block";
  updateObjective(mstate);
  const wm = $("wmarks");
  wm.innerHTML = "";
  const mk = (cls, icon, label) => {
    const d = document.createElement("div");
    d.className = "wmark " + cls;
    d.innerHTML = `<span class="wm-i">${icon}</span><span class="wm-l">${label}</span>`;
    wm.appendChild(d);
    return d;
  };
  roomFx.city.bureauMark = mk("bureau", "◆", "BUREAU");
  for (const m of roomFx.city.missions) m.mark = mk(m.done ? "done" : "", "⬥", m.label.toUpperCase());
}
function updateCityHud() {
  const c = roomFx.city;
  if (!c) return;
  // world markers -> screen space
  const place = (mark, x, z, label) => {
    const v = new THREE.Vector3(x, 3, z).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) { mark.style.display = "none"; return; }
    const d = Math.hypot(camera.position.x - x, camera.position.z - z) | 0;
    mark.querySelector(".wm-l").textContent = `${label} · ${d}m`;
    mark.style.display = "block";
    mark.style.left = ((v.x * 0.5 + 0.5) * innerWidth) + "px";
    mark.style.top = ((-v.y * 0.5 + 0.5) * innerHeight) + "px";
  };
  place(c.bureauMark, c.bureau.x, c.bureau.z, "BUREAU");
  for (const m of c.missions) place(m.mark, m.x, m.z, m.done ? "LOGGED" : m.label.toUpperCase());
  // minimap (north-up; you are the arrow)
  const cv = $("minimap"), g = cv.getContext("2d");
  const W = cv.width, R = W / 2, S = R / 46; // 46m radius shown
  g.clearRect(0, 0, W, W);
  g.save();
  g.beginPath(); g.arc(R, R, R - 3, 0, Math.PI * 2); g.clip();
  g.fillStyle = "rgba(10,14,20,.9)"; g.fillRect(0, 0, W, W);
  const px = camera.position.x, pz = camera.position.z;
  const mx = (x) => R + (x - px) * S, mz = (z) => R + (z - pz) * S;
  g.strokeStyle = "rgba(90,110,140,.5)"; g.lineWidth = 4;
  for (const r of [-22, 0, 22]) {
    g.beginPath(); g.moveTo(mx(-48), mz(r)); g.lineTo(mx(48), mz(r)); g.stroke();
    g.beginPath(); g.moveTo(mx(r), mz(-48)); g.lineTo(mx(r), mz(48)); g.stroke();
  }
  g.fillStyle = "#e8d3a8";
  g.fillRect(mx(c.bureau.x) - 4, mz(c.bureau.z) - 4, 8, 8);
  for (const m of c.missions) {
    g.fillStyle = m.done ? "#8fb89f" : "#e8b060";
    g.beginPath(); g.arc(mx(m.x), mz(m.z), 4, 0, Math.PI * 2); g.fill();
  }
  // player arrow (rotates with yaw)
  g.translate(R, R); g.rotate(-yaw);
  g.fillStyle = "#f4f5f8";
  g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 6); g.lineTo(-5, 6); g.closePath(); g.fill();
  g.restore();
}
function hideCityHud() {
  $("minimap").style.display = "none";
  $("objective").style.display = "none";
  $("wmarks").innerHTML = "";
}

// Play one anomaly investigation: lines -> log choice -> outcome -> flags.
async function runMission(m, mstate) {
  uiBusy = true;
  if (document.pointerLockElement) document.exitPointerLock();
  for (const l of m.scene) await typeLine(l.text, l.who ? "say" : "scene", l.who, true);
  await overlayButtons([m.choice]);
  State.set(m.id);
  if (m.drift) State.addDrift(m.drift);
  await typeLine(m.outcome.text, "say", m.outcome.who, true);
  // beacon -> logged
  const entry = mstate.find(e => e.id === m.id);
  if (entry) {
    entry.done = true;
    const fresh = makeBeacon(true);
    fresh.position.copy(entry.beacon.position);
    scene.remove(entry.beacon);
    targets = targets.filter(t => t !== entry.beacon);
    scene.add(fresh);
    if (entry.mark) entry.mark.classList.add("done");
  }
  if (mstate.every(e => e.done)) State.set("city_all_anomalies");
  updateObjective(mstate);
  overlayLine(`<i>Anomaly logged. The Bureau is marked ◆ — anomalies ⬥.</i>`, "hint");
  uiBusy = false;
}

// Walk District 7 to the Bureau. Optional anomaly stops. Resolves at the door.
async function cityWalk() {
  const missions = await loadCityMissions();
  buildCity(missions);
  await UI.fade(false);
  overlayLine(`<i>District 7, morning rain. The Bureau is six blocks north (◆). Anomaly beacons glow amber (⬥) — walk into one and press E to investigate. WASD move · click to look.</i>`, "scene");
  await new Promise((resolve) => {
    let busy = false;
    enterRoom(async (data) => {
      if (busy) return;
      if (data.kind === "bureau_door") { resolve(); return; }
      if (data.kind === "mission" && !State.has(data.mission.id)) {
        busy = true;
        await runMission(data.mission, roomFx.city.missions);
        busy = false;
      } else if (data.kind === "mission") {
        overlayLine(`<i>Already logged.</i>`, "hint");
      } else {
        overlayLine(`<i>${data.t}</i>`, "scene");
      }
    });
  });
  exitRoom();
  hideCityHud();
}

// ---------- Bureau hub: a walkable office with desk, terminal, shelves, NPCs ----------
// npcs: [{ id, name, dialogue, color?, x?, z?, line? }] — placed around the room.
function buildBureau(npcs = []) {
  buildRoom({ bg: 0x1a2230, fogColor: 0x1a2230, fogNear: 12, fogFar: 34,
              floor: 0x4a5566, ceil: 0x36404e, wall: 0x556070,
              amb: 0xb0c0e0, ambI: 1.5, lamp: 0xfff0d0 }, 13);

  // Two warm fills over the worker pool — one center lamp can't light 13 meters.
  for (const [lx, lz] of [[-3, 2.4], [3, 2.4]]) {
    const l = new THREE.PointLight(0xffe8c8, 14, 12);
    l.position.set(lx, 3.0, lz);
    scene.add(l);
  }

  // rug under the desk area
  const rug = new THREE.Mesh(new THREE.CircleGeometry(2.1, 28),
    new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.012, -2.2);
  rug.receiveShadow = true;
  scene.add(rug);

  const desk = makeDesk();
  desk.position.set(0, 0, -2.6);
  registerTarget(desk, { id: "desk", name: "Desk", kind: "desk",
    t: "Your desk. The Archive terminal hums. The case file is loaded." });

  const term = makeTerminal();
  term.position.set(0, 0.76, -2.85); term.scale.setScalar(0.9);
  registerTarget(term, { id: "terminal", name: "Archive Terminal", kind: "terminal",
    t: "ARCHIVE TERMINAL — case ready for review." });

  const chair = makeChair();
  chair.position.set(0, 0, -1.7); chair.rotation.y = Math.PI;
  registerTarget(chair, { id: "chair", name: "Your Chair", kind: "flavor",
    t: "Your chair. Still warm. You don't remember sitting down." });

  // ---- flavor props: the office has a life the case files don't mention ----
  const shelfL = makeBookshelf();
  shelfL.position.set(-6.28, 0, -2.2); shelfL.rotation.y = Math.PI / 2;
  registerTarget(shelfL, { id: "shelf1", name: "Case Archives", kind: "flavor",
    t: "Bound case archives, years of them. Some spines are blank — not unlabeled. Blank, like something was removed." });

  const shelfR = makeBookshelf();
  shelfR.position.set(-6.28, 0, 1.6); shelfR.rotation.y = Math.PI / 2;
  registerTarget(shelfR, { id: "shelf2", name: "Reference Shelf", kind: "flavor",
    t: "Interpretation manuals. Volume 4 is checked out — the card says YOUR name, in handwriting you don't recognize." });

  const cab = makeCabinet();
  cab.position.set(6.05, 0, -3.6); cab.rotation.y = -Math.PI / 2;
  registerTarget(cab, { id: "cabinet", name: "Filing Cabinet", kind: "flavor",
    t: "Drawer C is labeled RESOLVED. It's empty. It has always been empty." });

  // window with rain, right wall
  const winG = new THREE.Group();
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.35),
    new THREE.MeshBasicMaterial({ map: windowViewTex(0.18) }));
  const frameMat = wood(0x3c3428);
  const fh = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.08, 0.08), frameMat);
  const fv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.5, 0.08), frameMat);
  const mid = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.35, 0.06), frameMat);
  fh.position.y = 0.71; const fh2 = fh.clone(); fh2.position.y = -0.71;
  fv.position.x = 1.09; const fv2 = fv.clone(); fv2.position.x = -1.09;
  winG.add(pane, fh, fh2, fv, fv2, mid);
  winG.position.set(6.43, 1.9, 1.4); winG.rotation.y = -Math.PI / 2;
  registerTarget(winG, { id: "window", name: "Window", kind: "flavor",
    t: "Rain over District 7. It has rained every day you can remember. You can remember eleven days." });
  const winLight = new THREE.PointLight(0x8fb0d0, 3, 9); // cool spill from the window
  winLight.position.set(5.6, 2.1, 1.4);
  scene.add(winLight);

  // the ledger — appears once the player has logged their first anomaly
  if (State.has("anomaly_1")) {
    const nb = makeNotebook();
    nb.position.set(-0.85, 0.76, -2.35);
    nb.rotation.y = 0.35;
    registerTarget(nb, { id: "ledger", name: "Your Ledger", kind: "ledger",
      t: "Your ledger. You don't remember starting it. You remember every entry." });
  }

  // coffee on the desk
  const cup = new THREE.Group();
  const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.11, 12),
    new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.6 }));
  mug.position.y = 0.055;
  cup.add(mug);
  cup.position.set(0.55, 0.76, -2.3);
  registerTarget(cup, { id: "coffee", name: "Coffee", kind: "flavor",
    t: "Cold. It was cold yesterday too. You should ask who keeps refilling it." });

  // NPCs — simple people placed around the room. E starts their dialogue.
  // Default positions fan out along the side walls if x/z not given.
  const spots = [[-3.6, -1], [3.6, -1], [-5.1, 0.3], [5.1, 0.3], [0, 4.6]]; // clear of the worker desks
  const CHAR_KEYS = ["charA", "charB", "charC", "charD", "charE", "charF"];
  // stable character per NPC id, so Vasic looks like Vasic in every volume
  const charFor = (id) => {
    let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return spawn(CHAR_KEYS[Math.abs(h) % CHAR_KEYS.length]);
  };
  npcs.forEach((npc, i) => {
    const [dx, dz] = spots[i % spots.length];
    const accent = (typeof npc.color === "string" ? parseInt(npc.color, 16) : npc.color) ?? 0x8a90a8;
    const modelPerson = charFor(npc.id);
    const person = modelPerson || makeHuman(accent);
    const x = npc.x ?? dx, z = npc.z ?? dz;
    person.position.set(x, 0, z);
    const ry = Math.atan2(0 - x, -2.2 - z) + (modelPerson ? MODEL_YAW : 0); // face the desk area
    person.rotation.y = ry;
    registerTarget(person, {
      id: "npc_" + npc.id, name: npc.name, kind: "npc", npc,
      baseY: 0, baseRy: ry,
      t: npc.line || "They look up as you approach.",
    });
  });

  // ---- the office actually works: a keeper pool, not an empty floor ----
  // Standing workers are examinable ("worker" kind) and cycle short lines.
  const addWorker = (key, x, z, faceX, faceZ, name, lines) => {
    const person = spawn(key) || makeHuman(0x7a8298);
    person.position.set(x, 0, z);
    const ry = Math.atan2(faceX - x, faceZ - z) + (modelCache[key] ? MODEL_YAW : 0);
    person.rotation.y = ry;
    registerTarget(person, { id: "worker_" + name, name, kind: "worker",
      baseY: 0, baseRy: ry, li: 0, lines, t: lines[0] });
  };

  // three worker desks across the front half, each manned
  const pool = [
    [-3.6, 2.3, "charB", "Keeper Ilsa", [
      "Filing. Don't ask which day it is. It's the same day.",
      "If a record contradicts itself, we file both versions. That's the job.",
      "The terminal hums a half-step lower today. You hear it too, don't you."]],
    [0.2, 2.7, "charD", "Keeper Brandt", [
      "Three rulings before lunch. The Archive doesn't wait.",
      "You look like you slept. Lucky.",
      "Drawer C came up empty again. I've stopped asking why."]],
    [3.8, 2.3, "charF", "Keeper Osei", [
      "Citizen intake was full this morning. Same complaint, every one: a memory too coherent.",
      "Coherent is worse than corrupted. Corrupted admits something's wrong.",
      "Sign nothing you haven't read twice, Keeper."]],
  ];
  for (const [wx, wz, key, name, lines] of pool) {
    const d = makeDesk(); d.position.set(wx, 0, wz); d.rotation.y = Math.PI; scene.add(d);
    const ch = makeChair(); ch.position.set(wx, 0, wz - 0.95); scene.add(ch);
    const t = makeTerminal(); t.position.set(wx, 0.76, wz + 0.2); t.scale.setScalar(0.8);
    t.rotation.y = Math.PI; scene.add(t);
    addWorker(key, wx + 0.75, wz - 0.7, wx, wz + 0.2, name, lines);
  }
  // an archivist at the cabinet wall
  addWorker("charE", 5.3, -3.4, 6.05, -3.6, "Archivist Wren", [
    "Careful around Vasic. He counts everything, including questions.",
    "Some spines go blank overnight. We're told not to mind.",
    "Eleven days of rain. It helps the filing, somehow."]);
  // two clerks pacing the aisles — the room moves
  const walkers = [];
  for (const [key, lane, alongX] of [["charA", 0.4, true], ["charC", -4.6, false]]) {
    const p = spawn(key) || makeHuman(0x6a7180);
    if (alongX) p.position.set(-2, 0, lane); else p.position.set(lane, 0, 0);
    walkers.push({ o: p, alongX, dir: 1, speed: 0.8 + Math.random() * 0.4,
      off: modelCache[key] ? MODEL_YAW : 0, range: 4.6 });
    scene.add(p);
  }
  roomFx.peds = walkers;

  // Maya — present, visible, by your desk. She was here before you arrived.
  const maya = makeMaya();
  maya.position.set(2.2, 0, -1.3);
  const mry = Math.atan2(0 - 2.2, -2.2 - -1.3);
  maya.rotation.y = mry;
  registerTarget(maya, { id: "npc_maya", name: "Maya", kind: "worker",
    baseY: 0, baseRy: mry, li: 0, lines: [
      "Morning, Keeper. You're on time. You're always exactly on time.",
      "The case can wait sixty seconds. Nothing else in this building can, but the case can.",
      "I checked the board before you came in. I always do.",
      "When you're in the memory, find what doesn't belong. Log all of it before you touch the pillar."],
    t: "Maya. She was here before you arrived. She is always here before you arrive." });

  setAmb({ rain: 0.45, hum: 1 });
}

// ---------- public UI (engine contract) ----------
let idleStarted = false;

// Drift band → vignette on the screen edge. Tone, never a number. Vol0 §4.
function setBand(band) {
  if (band) document.body.dataset.band = band;
}

export const UI = {
  // Build the Bureau room immediately so the opening dialogue plays over a real
  // place (not a black canvas). Interaction stays off until bureau() is called.
  init: () => { $("overlay-log").innerHTML = ""; preloadModels(); initRenderer(); buildBureau(); idleStarted = true; },

  // Pause/resume from the Esc menu. Suspends look/move/examine, freezes dialogue
  // auto-advance, and frees the cursor. Remembers the prior input state so
  // resuming doesn't clobber an open modal/dialogue.
  setPaused: (p) => {
    menuPaused = p;
    if (p) {
      pausePrevBusy = uiBusy;
      uiBusy = true;
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      uiBusy = pausePrevBusy;
    }
  },

  // Fade to/from black for scene transitions. await fade(true) then build, await fade(false).
  fade: async (on) => {
    const f = $("fade");
    f.classList.toggle("on", on);
    await sleep(520); // match the .5s CSS transition
  },

  // --- cinematic cues ---
  wait: (ms) => sleep(ms),
  // Non-HUD "perceived" system message — monospace, no speaker, auto-advances.
  sysmsg: (t) => typeLine(t, "sysmsg", null, true),
  // Audio cue — stubbed as an italic caption until real audio assets exist.
  // ponytail: caption stub; swap for new Audio(src).play() when .mp3s land.
  cue: (label) => typeLine(`♪ ${label}`, "soundcue", null, false),
  flicker: async () => { SFX.burst(); document.body.classList.add("flicker"); await sleep(420); document.body.classList.remove("flicker"); },
  shake: async () => { SFX.burst(); document.body.classList.add("shake"); await sleep(420); document.body.classList.remove("shake"); },
  // Stability Index — perceived number, not a HUD bar. Vol0 §4: never a sanity bar.
  stability: async (v) => { await typeLine(`Stability Index: ${v}`, "stability", null, false); },

  // Banners (scene/volume transitions) hold a touch longer before advancing.
  banner: (t) => typeLine(t, "banner", null, true, 500),
  say: async (who, t, band, delayMs, waitContinue = true) => {
    setBand(band);
    // Memory drone darkens live with the drift band.
    if (currentAmb?.drone && band && band !== currentAmb.drone) setAmb({ ...currentAmb, drone: band });
    if (who === "Eden") SFX.swell(); // Eden arrives as pressure before words
    if (delayMs) await sleep(delayMs);
    await typeLine(t, "say", who, waitContinue); // typewriter; auto-advance unless choices follow
  },
  choose: (labels) => activeMemory ? pickGlyph(labels) : overlayButtons(labels),

  // A real button choice even mid-dive (choose() maps to crystals there).
  // Frees the cursor for the click, restores roaming after.
  ask: async (labels) => {
    uiBusy = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const i = await overlayButtons(labels);
    uiBusy = false;
    return i;
  },

  // Mission HUD for a dive: anomaly counter in the objective card. -1 hides it.
  diveHud: (found, total) => {
    const o = $("objective");
    if (found < 0) { o.style.display = "none"; return; }
    o.style.display = "block";
    o.querySelector(".obj-t").textContent = "Locate the anomalies in this memory";
    o.querySelector(".obj-s").textContent = total
      ? `⬥ ${found}/${total} anomaly signatures found · submit at the Archive Pillar`
      : "No anomaly signatures on scan · examine freely, submit at the Archive Pillar";
  },

  // An ordinary morning. Roam the apartment, examine the routine, leave by the
  // front door. Resolves after the fade into the Bureau, so the next dialogue
  // line (Maya, at the office) plays over the right room.
  apartment: async () => {
    initRenderer();
    buildApartment();
    $("fade").style.transition = ""; $("fade").classList.remove("on"); // lift held black (restore smooth fade)
    overlayLine(`<i>Your apartment. Another ordinary morning — the eleventh in a row you can point to. Take your time, then leave for the Bureau. Click to look · WASD move · E examine.</i>`, "scene");
    await new Promise((resolve) => {
      enterRoom((data) => {
        if (data.kind === "exit_door") resolve();
        else overlayLine(`<i>${data.t}</i>`, "scene");
      });
    });
    exitRoom();
    await UI.fade(true);
    await typeLine("Eleven days of rain over District 7. The Bureau is six blocks north.", "scene", null, true);
    await cityWalk(); // free roam: missions optional, resolves at the Bureau door
    await UI.fade(true);
    buildBureau();
    await UI.fade(false);
  },

  // Free-roam Bureau. Talk to NPCs (E) in any order; go to the desk to take the
  // case and proceed. talkTo(dialogueId) runs an NPC's dialogue tree, then returns
  // control to walking. Resolves only when the player examines the desk/terminal.
  bureau: async (caseData, npcs = [], talkTo = null) => {
    initRenderer();
    buildBureau(npcs);
    $("fade").style.transition = ""; $("fade").classList.remove("on");
    overlayLine(`<i>Archive Bureau · District 7. Talk to whoever's here (E), then go to your desk to take the case. Click to look · WASD move.</i>`, "scene");
    const spoken = new Set();
    await new Promise((resolve) => {
      let busy = false; // guard: don't re-trigger while a dialogue is running
      enterRoom(async (data) => {
        if (busy) return;
        if (data.kind === "terminal" || data.kind === "desk") {
          busy = true;
          await showCaseFile(caseData);
          resolve();
        } else if (data.kind === "ledger") {
          busy = true;
          await ledgerModal(); // sets uiBusy itself
          busy = false;
        } else if (data.kind === "npc" && talkTo) {
          busy = true; uiBusy = true;
          if (document.pointerLockElement) document.exitPointerLock();
          await talkTo(data.npc.dialogue);
          spoken.add(data.npc.id);
          uiBusy = false; busy = false; // click to re-lock and resume roaming
        } else if (data.kind === "worker") {
          overlayShow(data.lines[data.li++ % data.lines.length], "say", data.name);
        } else {
          overlayLine(`<i>${data.t}</i>`, "scene");
        }
      });
    });
    exitRoom();
  },

  // Persistent hub between volumes: walk the Bureau, talk to NPCs, examine the
  // CASE BOARD to pick the next case. items: [{ id, label, sub, locked }].
  // Resolves with the chosen case id. talkTo runs NPC dialogue like bureau().
  hub: async (items, npcs = [], talkTo = null) => {
    initRenderer();
    buildBureau(npcs);
    // The case board — pinned cards and red string, far wall.
    const board = makeCaseBoard();
    board.position.set(0, 1.85, -6.42);
    registerTarget(board, { id: "board", name: "Case Board", kind: "board",
      t: "The case board. Active and archived cases, listed." });
    $("fade").style.transition = ""; $("fade").classList.remove("on");
    overlayLine(`<i>Archive Bureau. Walk to the CASE BOARD (far wall) to choose a case. Talk to anyone here (E). Click to look · WASD move.</i>`, "scene");
    return await new Promise((resolve) => {
      let busy = false;
      enterRoom(async (data) => {
        if (busy) return;
        if (data.kind === "board") {
          busy = true;
          const chosen = await caseBoardModal(items); // sets uiBusy itself
          if (chosen) { exitRoom(); resolve(chosen); }
          else busy = false; // stepped away — keep roaming
        } else if (data.kind === "ledger") {
          busy = true;
          await ledgerModal(); // sets uiBusy itself
          busy = false;
        } else if (data.kind === "npc" && talkTo) {
          busy = true; uiBusy = true;
          if (document.pointerLockElement) document.exitPointerLock();
          await talkTo(data.npc.dialogue);
          uiBusy = false; busy = false;
        } else if (data.kind === "worker") {
          overlayShow(data.lines[data.li++ % data.lines.length], "say", data.name);
        } else {
          overlayLine(`<i>${data.t}</i>`, "scene");
        }
      });
    });
  },

  // Case file — centered modal (middle of screen). Vol1 §2.
  casefile: (c) => showCaseFile(c),

  // Memory scene (the dive). Walkable place; fragments are floating crystals.
  scene: async (desc, beh, emotion, frags = [], env = null) => {
    initRenderer();
    buildMemoryRoom(beh, emotion, frags, env);
    camIntroT = 1; // trigger the ease-in punch
    // One combined line — description + controls. Two overlayLine calls would
    // replace each other and the description would never be read.
    overlayLine(
      `<i>[${beh} memory · ${emotion}]</i> ${desc}<br>` +
      `<span class="hint">Click to look · WASD move · E on a crystal to examine · amber crystals carry anomaly signatures · the green pillar submits your findings.</span>`,
      "scene");
    enterRoom(memoryExamine);
    activeMemory = true;
  },

  // Examined fragment: the memory itself, held on screen until the player dismisses it.
  fragment: (f) => typeLine(f.symbol || f.text, "scene", null, true, 0, true),
  reveal: (flag) => typeLine(`— ANOMALY LOGGED: ${String(flag).replace(/_/g, " ")}`, "reveal"),
  collapse: () => { overlayLine("The memory buckles. Pieces go missing.", "collapse"); return Promise.resolve(); },
  outcome: async (truth) => {
    activeMemory = false;
    exitRoom(); // release pointer first so advancing input lands in the overlay
    await typeLine(`This is now what happened: ${truth}.`, "outcome", null, true, 600);
  },
};

// Case keyart — Higgsfield art at the top of the file. Add entries as art lands.
const CASE_ART = {
  vol1_lighthouse: "assets/higgsfield/lighthouse.png",
  vol4_null: "assets/higgsfield/null_district.png",
};
function showCaseFile(c) {
  if (!c?.file) return Promise.resolve();
  const f = c.file;
  const rows = f.records.map(r => `<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join("");
  const art = CASE_ART[c.case_id] ? `<img class="cf-art" src="${CASE_ART[c.case_id]}" alt="">` : "";
  return centerModal(
    art +
    `<div class="cf-head">ARCHIVE BUREAU · CASE FILE · ${c.case_id.toUpperCase()}</div>
     <div class="cf-title">${c.title ? c.title + " · " : ""}${f.subject} — ${f.memory_type}</div>
     <p>${f.summary}</p>
     <table>${rows}</table>
     <p class="cf-verdict">${f.verdict}</p>
     <p class="cf-obj">OBJECTIVE: ${f.objective}</p>`
  );
}

// ---------- memory environments: each memory is a place, not a grey box ----------
function stripeTex() {
  return tex((g, w, h) => {
    for (let y = 0; y < h; y += 64) {
      g.fillStyle = (y / 64) % 2 ? "#8a2a26" : "#c8c2b6";
      g.fillRect(0, y, w, 64);
    }
  }, 64, 512, [1, 1]);
}
function windowsTex() {
  return tex((g, w, h) => {
    g.fillStyle = "#0c0e14"; g.fillRect(0, 0, w, h);
    for (let y = 20; y < h - 20; y += 44) {
      for (let x = 16; x < w - 16; x += 36) {
        const lit = Math.random() < 0.24;
        g.fillStyle = lit ? `rgba(${210 + Math.random() * 45 | 0},${170 + Math.random() * 40 | 0},110,.9)` : "#141824";
        g.fillRect(x, y, 20, 28);
      }
    }
  }, 256, 512, [1, 1]);
}

// Higgsfield keyart sky — one painted panorama shared by the open night scenes.
let _skyTex = null;
function skyTexture() {
  if (!_skyTex) {
    _skyTex = new THREE.TextureLoader().load("assets/higgsfield/night_sky.png");
    _skyTex.colorSpace = THREE.SRGBColorSpace;
  }
  return _skyTex;
}

// Open outdoor space: big ground, fog, moonlight. No walls — bounds clamp instead.
function buildOpen(palette, groundSize = 60) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(palette.bg);
  scene.fog = new THREE.Fog(palette.fogColor ?? palette.bg, palette.fogNear ?? 8, palette.fogFar ?? 30);
  targets = [];
  roomFx = {};

  scene.add(new THREE.AmbientLight(palette.amb ?? 0x8fa0c0, palette.ambI ?? 0.7));
  scene.add(new THREE.HemisphereLight(0x91a5c9, 0x1a1a22, 0.5));
  const moon = new THREE.DirectionalLight(palette.moon ?? 0xa8bcd8, 1.5);
  moon.position.set(6, 12, 4);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -14; moon.shadow.camera.right = 14;
  moon.shadow.camera.top = 14; moon.shadow.camera.bottom = -14;
  scene.add(moon);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize),
    new THREE.MeshStandardMaterial({ color: palette.ground ?? 0x3a3a40, roughness: palette.groundRough ?? 0.95, metalness: palette.groundMetal ?? 0 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  // Painted sky dome — the image's skyline band lands just above the horizon.
  // Unfogged: fog eats the set, not the sky. That's how rain nights read.
  if (palette.sky) {
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(palette.skyR ?? 90, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.58),
      new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
    dome.renderOrder = -1;
    dome.raycast = () => {};
    scene.add(dome);
  }

  camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 120);
  camera.position.set(0, 1.6, 5);
  yaw = 0; pitch = 0;
  bounds = { x: 10, z: 10 };
}

// Each builder dresses the set and returns crystal anchor points [x, z].
const MEM_ENVS = {
  // fog-covered shoreline with the impossible lighthouse
  shoreline() {
    buildOpen({ bg: 0x0d141d, fogNear: 7, fogFar: 34, ground: 0x54493a, amb: 0x7d8fae });
    // water line
    const water = new THREE.Mesh(new THREE.PlaneGeometry(60, 28),
      new THREE.MeshStandardMaterial({ color: 0x0b1520, roughness: 0.08, metalness: 0.65 }));
    water.rotation.x = -Math.PI / 2; water.position.set(0, 0.03, -22); scene.add(water);
    // the lighthouse — striped tower, glass cage, turning beam
    const lh = new THREE.Group();
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, 7.5, 18),
      new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.85 }));
    tower.position.y = 3.75; tower.castShadow = true;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.1, 12),
      new THREE.MeshStandardMaterial({ color: 0x202630, roughness: 0.4, metalness: 0.5, transparent: true, opacity: 0.85 }));
    cage.position.y = 8.05;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.8, 14),
      new THREE.MeshStandardMaterial({ color: 0x2a2028, roughness: 0.8 }));
    cap.position.y = 9.0;
    const lampGlow = new THREE.PointLight(0xffe8b0, 30, 40);
    lampGlow.position.y = 8.05;
    // visible rotating beam — long translucent wedge in the fog
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 1.4, 22, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xffedbe, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false }));
    beam.rotation.z = Math.PI / 2; beam.position.set(11, 8.05, 0);
    const beamPivot = new THREE.Group();
    beamPivot.position.y = 0; beamPivot.add(beam);
    lh.add(tower, cage, cap, lampGlow, beamPivot);
    lh.position.set(-7, 0, -12);
    scene.add(lh);
    roomFx.beacon = beamPivot;
    // rocks
    for (const [x, z, s] of [[3, -8, 0.8], [5.5, -5, 0.5], [-2, -9, 0.6], [7, -9, 1.1]]) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0),
        new THREE.MeshStandardMaterial({ color: 0x3c3a38, roughness: 1, flatShading: true }));
      r.position.set(x, s * 0.5, z); r.castShadow = true; scene.add(r);
    }
    setAmb({ rain: 0.3, hum: 0, drone: State.driftBand() });
    bounds = { x: 11, z: 11 };
    return { anchors: [[-4.5, -7], [-1, -6], [2, -5.5], [4.5, -3], [-6.6, -8.6], [1, 0], [4, 2], [-2, 2]] };
  },

  // rain-slick night street between lit facades
  street() {
    buildOpen({ bg: 0x0b0d13, fogNear: 6, fogFar: 30, ground: 0x14161d, groundRough: 0.12, groundMetal: 0.7, amb: 0x6d7d9d, sky: true, skyR: 60 });
    const kits = ["buildingA", "buildingB", "buildingC", "buildingD", "buildingE"];
    let ki = 0;
    for (const side of [-1, 1]) {                      // facades
      for (let i = 0; i < 3; i++) {
        const model = spawn(kits[ki++ % kits.length]);
        if (model) {                                   // real building models
          model.position.set(side * 7.2, 0, -7 + i * 6.5);
          model.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          scene.add(model);
        } else {                                       // fallback: lit-window slabs
          const hgt = 9 + Math.random() * 4;
          const b = new THREE.Mesh(new THREE.BoxGeometry(5.5, hgt, 4),
            new THREE.MeshBasicMaterial({ map: windowsTex() }));
          b.position.set(side * 6.4, hgt / 2, -7 + i * 6.5);
          scene.add(b);
        }
      }
    }
    for (const z of [-6, -1, 4]) {                     // streetlamps
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.6, 8), metal(0x2a2e34));
      pole.position.set(-3.1, 1.8, z); pole.castShadow = true; scene.add(pole);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
      head.position.set(-3.1, 3.55, z); scene.add(head);
      const l = new THREE.PointLight(0xffc98a, 14, 12);
      l.position.set(-3.1, 3.4, z); scene.add(l);
    }
    // falling rain
    const n = 900, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - .5) * 22;
      pos[i * 3 + 1] = Math.random() * 10;
      pos[i * 3 + 2] = (Math.random() - .5) * 22;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x9fb2c8, size: 0.035, transparent: true, opacity: 0.5, depthWrite: false }));
    rain.raycast = () => {};
    scene.add(rain);
    roomFx.rainPts = rain;
    setAmb({ rain: 1.0, hum: 0, drone: State.driftBand() });
    bounds = { x: 3.4, z: 9 };
    return { anchors: [[-2.4, -6], [2.4, -4], [-2.4, -1], [2.4, 1.5], [0, -2.5], [-2.4, 4], [2.4, 5.5]] };
  },

  // observatory dome under recorded stars
  observatory() {
    buildOpen({ bg: 0x07080d, fogNear: 10, fogFar: 40, ground: 0x1a1d26, amb: 0x5d6d8d });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x141822, roughness: 0.9, side: THREE.BackSide }));
    scene.add(dome);
    // stars painted on the inside of the dome
    const n = 420, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * 0.46;
      pos[i * 3] = Math.cos(th) * Math.sin(ph) * 9.6;
      pos[i * 3 + 1] = Math.cos(ph) * 9.6;
      pos[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * 9.6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcfd8ea, size: 0.06 }));
    stars.raycast = () => {};
    scene.add(stars);
    // the telescope
    const scope = new THREE.Group();
    const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 1.1, 12), metal(0x2c3038));
    mount.position.y = 0.55;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 4, 14), metal(0x3a4250));
    tube.position.y = 1.9; tube.rotation.x = -0.8;
    tube.castShadow = true;
    scope.add(mount, tube);
    scope.position.set(0, 0, -2);
    scene.add(scope);
    // consoles
    for (const [x, z, ry] of [[-3.5, 1.5, 0.6], [3.5, 1.5, -0.6]]) {
      const c = makeTerminal(); c.scale.setScalar(1.2); c.position.set(x, 0, z); c.rotation.y = ry;
      scene.add(c);
    }
    setAmb({ rain: 0, hum: 1, drone: State.driftBand() });
    bounds = { x: 7.5, z: 7.5 };
    return { anchors: [[-4.5, -3.5], [4.5, -3.5], [-5.5, 2], [5.5, 2], [0, -5.5], [-2.5, 4.5], [2.5, 4.5]] };
  },

  // the null district — a platform over nothing
  voidspace() {
    buildOpen({ bg: 0x04050a, fogNear: 5, fogFar: 20, ground: 0x04050a, amb: 0x4d5d7d });
    // the ground is void; stand on a defined disc instead
    const disc = new THREE.Mesh(new THREE.CircleGeometry(6.5, 40),
      new THREE.MeshStandardMaterial({ color: 0x171a24, roughness: 0.85 }));
    disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01; disc.receiveShadow = true; scene.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(6.5, 0.05, 8, 60),
      new THREE.MeshStandardMaterial({ color: 0x3a4456, emissive: 0x2a3446, emissiveIntensity: 0.9 }));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.05; scene.add(rim);
    // undefined geometry drifting where the city should be
    const floaters = new THREE.Group();
    for (let i = 0; i < 14; i++) {
      const s = 0.5 + Math.random() * 1.6;
      const f = new THREE.Mesh(new THREE.BoxGeometry(s, s, s),
        new THREE.MeshBasicMaterial({ color: 0x35405a, wireframe: true }));
      const a = Math.random() * Math.PI * 2, r = 9 + Math.random() * 7;
      f.position.set(Math.cos(a) * r, 1 + Math.random() * 6, Math.sin(a) * r);
      f.userData.spin = 0.05 + Math.random() * 0.2;
      floaters.add(f);
    }
    floaters.raycast = () => {};
    scene.add(floaters);
    roomFx.floaters = floaters;
    setAmb({ rain: 0, hum: 0, drone: State.driftBand() });
    bounds = { x: 5.6, z: 5.6 };
    return { anchors: [[-4, -2.5], [4, -2.5], [-2.5, 3.5], [2.5, 3.5], [0, -4.5], [-4.5, 1], [4.5, 1]] };
  },

  // your office, repeated into the fog — the recursion made a place
  office_echo(beh) {
    buildRoom({ bg: 0x141820, fogColor: 0x141820, fogNear: 5, fogFar: 15,
                floor: 0x3e4650, ceil: 0x2c343e, wall: 0x46505c,
                amb: 0x90a0c0, ambI: 1.0, lamp: 0xffe8c8, flicker: beh === "corrupted" });
    // the same desk, again and again
    for (const [x, z, ry] of [[0, -2.6, 0], [-3.2, -2.6, 0.08], [3.2, -2.6, -0.08], [0, 1.8, Math.PI], [-3.2, 1.8, Math.PI]]) {
      const d = makeDesk(); d.position.set(x, 0, z); d.rotation.y = ry; scene.add(d);
      const ch = makeChair(); ch.position.set(x, 0, z + (Math.abs(ry) > 1 ? -0.9 : 0.9)); ch.rotation.y = ry + Math.PI; scene.add(ch);
    }
    setAmb({ rain: 0.2, hum: 1, drone: State.driftBand() });
    return { anchors: [[-1.6, -1.2], [1.6, -1.2], [-3.2, 0.3], [3.2, 0.3], [0, 3.3], [-1.6, 2.6]] };
  },
};

// ---------- memory room: fragments as floating crystals ----------
let activeMemory = false;
let memFrags = [], examineResolve = null;

function buildMemoryRoom(beh, emotion, frags, env) {
  // Env builders dress a real place and return crystal anchors. Unmapped
  // memories fall back to the abstract room.
  let anchors = null;
  if (MEM_ENVS[env]) {
    ({ anchors } = MEM_ENVS[env](beh));
  } else {
    const pal = beh === "corrupted"
      ? { bg: 0x1a1620, floor: 0x36303c, wall: 0x453c48, amb: 0x9a88aa, ambI: 1.0, fogNear: 8, fogFar: 24, flicker: true }
      : beh === "unstable"
      ? { bg: 0x1c2230, floor: 0x3c4452, wall: 0x4a5462, amb: 0xa0b0d0, ambI: 1.2, fogNear: 11, fogFar: 30 }
      : { bg: 0x1e2632, floor: 0x44505e, wall: 0x525e6c, amb: 0xb0c0d8, ambI: 1.3, fogNear: 12, fogFar: 34 };
    buildRoom(pal);
    setAmb({ rain: 0, hum: 1, drone: State.driftBand() });
  }

  memFrags = frags.slice();
  frags.forEach((fr, i) => {
    const a = (i / frags.length) * Math.PI * 2;
    const r = 3;
    const corrupt = !!fr.symbol;
    const anomaly = !!fr.reveals; // an anomaly signature — reads amber on the scan
    const col = anomaly ? 0xe0b060 : corrupt ? 0xc06a72 : 0x6a9ad0;
    const emis = anomaly ? 0xc07820 : corrupt ? 0xa02830 : 0x2860c0;
    const g = new THREE.Group();
    const crystal = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.32, 0),
      new THREE.MeshStandardMaterial({ color: col, emissive: emis, emissiveIntensity: 1.1,
        roughness: 0.25, flatShading: true }));
    crystal.castShadow = true;
    g.add(crystal);
    // pedestal shadow anchor so the float reads as float, not detachment
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.06, 14),
      new THREE.MeshStandardMaterial({ color: 0x2a2e38, roughness: 0.9 }));
    base.position.y = -1.0;
    g.add(base);
    if (i < 4) {                                        // light budget: first 4 glow for real
      const l = new THREE.PointLight(emis, 3, 5);
      g.add(l);
    }
    // Anchored to a spot in the scene when the env provides one; circle fallback.
    const [ax, az] = anchors ? anchors[i % anchors.length] : [Math.cos(a) * r, Math.sin(a) * r];
    g.position.set(ax, 1.05, az);
    registerTarget(g, {
      id: fr.id, kind: "frag", index: i, baseY: 1.05,
      name: fr.label || (corrupt ? "Corrupted Fragment" : "Memory Fragment"),
      t: fr.symbol || fr.text,
    });
  });

  // The Archive Pillar — center. Walk in, press E to submit your findings.
  const exit = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 3.3, 18, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x66cc88, transparent: true, opacity: 0.18,
      side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = 0.55;
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 1.7, 10),
    new THREE.MeshStandardMaterial({ color: 0x5a8a5a, emissive: 0x2a5a3a, emissiveIntensity: 0.9 }));
  core.position.y = -0.2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.03, 8, 28),
    new THREE.MeshStandardMaterial({ color: 0x66cc88, emissive: 0x2a5a3a, emissiveIntensity: 0.8 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = -1.03;
  const glow = new THREE.PointLight(0x55aa77, 2.4, 5);
  exit.add(beam, core, ring, glow);
  exit.position.set(0, 1.05, 0);
  registerTarget(exit, { id: "__exit", kind: "exit", index: frags.length,
    name: "Archive Pillar", t: "Submit your findings to the Archive." });
}

// memory.js splices its frag array each turn, so indices shift. We resolve by
// matching the examined fragment's text against the CURRENT label list it passed,
// giving the right shrinking-array index. Exit = last index.
let currentLabels = [];

function memoryExamine(data, obj) {
  if (!examineResolve) return;
  if (data.kind === "exit") {
    const r = examineResolve; examineResolve = null;
    r(currentLabels.length - 1); // "Step back and decide" is the last label
    return;
  }
  if (data.kind === "frag") {
    const idx = currentLabels.indexOf("Examine: " + data.t);
    if (idx === -1) return; // already examined / not in current list
    scene.remove(obj);
    targets = targets.filter(t => t !== obj);
    const r = examineResolve; examineResolve = null;
    r(idx);
  }
}

// memory.js calls ui.choose(labels) to get the next pick; resolve via examine.
function pickGlyph(labels) {
  currentLabels = labels;
  return new Promise((resolve) => { examineResolve = resolve; });
}

// ---------- dev hook (localhost only): lets automated tests steer the player ----------
if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
  window.__memoireDev = {
    setLocked: (v) => { locked = v; },
    key: (code, down) => { keys[code] = down; },
    examine: () => doExamine(),
    look: (y, p = 0) => { yaw = y; pitch = p; },
    pos: () => camera ? [camera.position.x, camera.position.z, yaw] : null,
    teleport: (x, z) => { if (camera) { camera.position.x = x; camera.position.z = z; } },
    state: State,
    fx: () => roomFx,
  };
}
