// Plain-DOM UI shim. Every method returns a Promise the engine awaits.
// ponytail: no framework — append nodes, resolve a promise on click. Replace with
// a Three.js scene driver later by implementing the same 8 methods.
const root = () => document.getElementById("game");

function line(html, cls = "") {
  const p = document.createElement("p");
  p.className = cls;
  p.innerHTML = html;
  root().appendChild(p);
  p.scrollIntoView();
}

function buttons(labels) {
  return new Promise((resolve) => {
    const box = document.createElement("div");
    box.className = "choices";
    labels.forEach((label, i) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.onclick = () => { box.remove(); resolve(i); };
      box.appendChild(b);
    });
    root().appendChild(box);
    box.scrollIntoView();
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export const UI = {
  banner: (t) => { line(t, "banner"); return Promise.resolve(); },
  // delayMs: render after a pause — a hesitating system reads as a hesitating mind. Vol1 §5.
  say: async (who, t, _band, delayMs) => {
    if (delayMs) await sleep(delayMs);
    line(`<b>${who}:</b> ${t}`, "say");
  },
  choose: (labels) => buttons(labels),
  ask: (labels) => buttons(labels), // same thing here; the 3D UI needs the distinction
  scene: (desc, behavior, emotion) => {
    line(`<i>[${behavior} memory · ${emotion}]</i><br>${desc}`, "scene");
    return Promise.resolve();
  },
  casefile: (c) => {
    const f = c.file;
    const rows = f.records.map(r => `<tr><td>${r.label}</td><td>${r.value}</td></tr>`).join("");
    line(`<div class="casefile"><b>CASE FILE · ${c.case_id}</b><br>${f.subject} — ${f.memory_type}<br>${f.summary}<table>${rows}</table>${f.verdict}<br><i>OBJECTIVE: ${f.objective}</i></div>`, "casefile-wrap");
    return Promise.resolve();
  },
  fragment: (f) => { line(`<i>${f.symbol || f.text}</i>`, "scene"); return Promise.resolve(); },
  reveal: (flag) => { line(`— You notice: <b>${flag}</b>`, "reveal"); return Promise.resolve(); },
  collapse: () => { line("The memory buckles. Pieces go missing.", "collapse"); return Promise.resolve(); },
  outcome: (truth) => { line(`This is now what happened: <b>${truth}</b>.`, "outcome"); return Promise.resolve(); },
};
