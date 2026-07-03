// Procedural audio — WebAudio only, zero asset files.
// ponytail: synthesized rain/hum/drones; swap layers for real recordings only
// if the synth stops selling it. All entry points no-op until unlock() runs
// from a user gesture (browser autoplay policy).
let ctx = null, master = null, noiseBuf = null;
let pending = null;          // ambience requested before the first gesture
const layers = {};           // name -> { gain, stop }

export function unlock() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  if (pending) { const p = pending; pending = null; ambience(p); }
}
const on = () => ctx && ctx.state === "running";

function noiseSrc() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  return s;
}
function ramp(g, v, secs) {
  g.gain.cancelScheduledValues(ctx.currentTime);
  g.gain.linearRampToValueAtTime(v, ctx.currentTime + secs);
}
function layerGain(v) {
  const g = ctx.createGain(); g.gain.value = 0; g.connect(master);
  ramp(g, v, 1.4);
  return g;
}
function kill(name) {
  const l = layers[name]; if (!l) return;
  ramp(l.gain, 0, 1.0);
  setTimeout(l.stop, 1200);
  delete layers[name];
}

// spec: { rain: 0..1, hum: 0|1, drone: null | "stable"|"doubting"|"fracturing" }
export function ambience(spec) {
  if (!on()) { pending = spec; return; }
  // rain — filtered noise
  if (spec.rain) {
    if (!layers.rain) {
      const src = noiseSrc();
      const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 300;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1400;
      const g = layerGain(0.045 * spec.rain);
      src.connect(hp); hp.connect(lp); lp.connect(g);
      src.start();
      layers.rain = { gain: g, stop: () => src.stop() };
    } else ramp(layers.rain.gain, 0.045 * spec.rain, 1.4);
  } else kill("rain");
  // room hum — mains-adjacent, barely there
  if (spec.hum) {
    if (!layers.hum) {
      const o1 = ctx.createOscillator(); o1.frequency.value = 55;
      const o2 = ctx.createOscillator(); o2.frequency.value = 110.7; // slight detune = alive
      const g = layerGain(0.02);
      const g2 = ctx.createGain(); g2.gain.value = 0.3;
      o1.connect(g); o2.connect(g2); g2.connect(g);
      o1.start(); o2.start();
      layers.hum = { gain: g, stop: () => { o1.stop(); o2.stop(); } };
    }
  } else kill("hum");
  // memory drone — chord darkens with the drift band
  if (spec.drone) {
    kill("drone"); // rebuild, chord depends on band
    const freqs = spec.drone === "fracturing" ? [62, 65.4, 92.5, 130.8]  // cluster + beat
                : spec.drone === "doubting"   ? [65.4, 98, 92.5]          // tritone shadow
                :                                [65.4, 98, 130.8];        // open fifth, C2 G2 C3
    const g = layerGain(0.035);
    const oscs = freqs.map((f, i) => {
      const o = ctx.createOscillator(); o.type = "sine"; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = 0.9 / freqs.length / (i * 0.4 + 1);
      o.connect(og); og.connect(g); o.start();
      return o;
    });
    layers.drone = { gain: g, stop: () => oscs.forEach(o => o.stop()) };
  } else kill("drone");
}

function chirp(f0, f1, dur, vol, type = "sine") {
  if (!on()) return;
  const o = ctx.createOscillator(); o.type = type;
  const g = ctx.createGain();
  const t = ctx.currentTime;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.linearRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(t + dur + 0.02);
}
export const blip = () => chirp(660, 440, 0.07, 0.05, "triangle"); // choice click
export const tick = () => chirp(1100, 1100, 0.02, 0.018);          // line advance

// Eden's presence — a sub-bass swell under the line
export function swell() {
  if (!on()) return;
  const o = ctx.createOscillator(); o.frequency.value = 41;
  const g = ctx.createGain(); g.gain.value = 0;
  o.connect(g); g.connect(master);
  const t = ctx.currentTime;
  g.gain.linearRampToValueAtTime(0.11, t + 0.9);
  g.gain.linearRampToValueAtTime(0, t + 2.4);
  o.start(); o.stop(t + 2.5);
}

// flicker/shake — a short broadband hit
export function burst() {
  if (!on()) return;
  const src = noiseSrc();
  const bp = ctx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 320;
  const g = ctx.createGain(); g.gain.value = 0.14;
  src.connect(bp); bp.connect(g); g.connect(master);
  src.start();
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
  setTimeout(() => src.stop(), 420);
}
