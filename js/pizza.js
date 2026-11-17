// Moore's Pizzeria: a pizza shop that runs in the kitchen, in the spirit of Papa's Pizzeria.
// Customers line up at the counter. Take the order, stretch the dough, paint on sauce and cheese, drop the toppings
// where the ticket wants them, bake it in the wood-fired oven (turn it halfway: the fire is at the back), cut it, serve it.
// Every pie is scored on wait, build, bake and cut. Eight customers a shift; new toppings unlock as the days go by.
// createPizzeria(ctx) returns { overlay: true, update(dt), key(code), dispose(), api } and draws into its own full-screen layer.

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rrect = (x, a, b, w, h, r) => { x.beginPath(); if (x.roundRect) x.roundRect(a, b, w, h, r); else x.rect(a, b, w, h); };
const mmss = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* ------------------------------------------------------------------ the menu */
// r: piece radius as a fraction of a full-size pie. n: counts a ticket can ask for, [whole pie, half pie].
const T = {
  pep:    { name: 'Pepperoni',     r: 0.12,  day: 1, n: [[6, 8, 10], [3, 4, 5]] },
  mush:   { name: 'Mushrooms',     r: 0.115, day: 1, n: [[6, 8, 10], [3, 4, 5]] },
  olive:  { name: 'Black olives',  r: 0.07,  day: 1, n: [[8, 10, 12], [4, 5, 6]] },
  pepper: { name: 'Green peppers', r: 0.12,  day: 1, n: [[6, 8], [3, 4]] },
  onion:  { name: 'Onions',        r: 0.115, day: 2, n: [[6, 8], [3, 4]] },
  saus:   { name: 'Sausage',       r: 0.075, day: 2, n: [[8, 10, 12], [4, 5, 6]] },
  basil:  { name: 'Basil',         r: 0.1,   day: 3, n: [[5, 6, 7], [3, 4]] },
  pine:   { name: 'Pineapple',     r: 0.075, day: 3, n: [[6, 8, 10], [3, 4, 5]] },
  bacon:  { name: 'Bacon',         r: 0.13,  day: 4, n: [[5, 6, 8], [3, 4]] },
  jal:    { name: 'Jalapeños',     r: 0.075, day: 4, n: [[6, 8, 10], [3, 4, 5]] },
};
const KEYS = Object.keys(T);
const BAKE = { light: { t: 0.42, name: 'Light' }, reg: { t: 0.62, name: 'Regular' }, well: { t: 0.8, name: 'Well done' } };
const REG = { all: { glyph: '●', name: 'whole pie' }, L: { glyph: '◐', name: 'left half' }, R: { glyph: '◑', name: 'right half' } };
const SHIFT = 8, SLOTS = 4;
const BAKE_RATE = 1 / 30;            // average bake per second; the half facing the fire bakes 1.3x, the far half 0.7x
const PERFECT = 0.035;               // the green band on the bake dial is target +/- this

// grids for sauce and cheese coverage: N x N cells over the square [-UMAX, UMAX] in pie units (1 = a full-size pie)
const N = 60, UMAX = 1.2, CS = 2 * UMAX / N, MS = 320, MK = MS / (2 * UMAX), MASTER = 520, SPR = 128;

const REGULARS = [
  { name: 'Pat', look: { skin: '#f0c8a6', hair: '#5b3f2a', hs: 'swept', top: '#b3262a', plaid: true, legs: '#3d5f93' },
    order: { reqs: [{ k: 'pep', reg: 'all', n: 8 }, { k: 'jal', reg: 'R', n: 4 }], bake: 'well', cut: 8 }, hi: 'The usual. Extra crispy.' },
  { name: 'Vinnie', look: { skin: '#e0ac8a', hair: '#3a2a1c', hs: 'short', beard: '#3a2a1c', top: '#2f6b3a', legs: '#3a3226' },
    order: { reqs: [{ k: 'saus', reg: 'all', n: 10 }, { k: 'pepper', reg: 'L', n: 4 }], bake: 'reg', cut: 6 }, hi: 'Sausage and peppers, like my nonna made.' },
  { name: 'Rosa', look: { skin: '#c68d68', hair: '#2a1c12', hs: 'long', top: '#8a1f5b', legs: '#17191d' },
    order: { reqs: [{ k: 'basil', reg: 'all', n: 6 }, { k: 'mush', reg: 'R', n: 5 }], bake: 'light', cut: 8 }, hi: 'Something fresh, please.' },
  { name: 'Duke', look: { skin: '#f0c8a6', hair: '#d8d2c4', hs: 'short', beard: '#d8d2c4', top: '#e8e2d0', legs: '#5b3a22' },
    order: { reqs: [{ k: 'bacon', reg: 'all', n: 6 }, { k: 'onion', reg: 'all', n: 8 }], bake: 'well', cut: 6 }, hi: 'Bacon. Onions. Don’t be shy.' },
  { name: 'The Shark', look: { skin: '#d9a57e', hair: '#17191d', hs: 'short', glasses: true, top: '#23262d', legs: '#17191d' },
    order: { reqs: [{ k: 'olive', reg: 'all', n: 12 }], bake: 'reg', cut: 4 }, hi: 'Olives. Twelve. I’ll be counting.' },
  { name: 'The bartender', look: { skin: '#f0c8a6', hair: '#f3d667', hs: 'long', top: '#17191d', legs: '#3d5f93' },
    order: { reqs: [{ k: 'pine', reg: 'all', n: 8 }, { k: 'bacon', reg: 'L', n: 3 }], bake: 'reg', cut: 8 }, hi: 'Pineapple. Fight me.' },
];
const NAMES = ['Ava', 'Ben', 'Chloe', 'Diego', 'Emma', 'Finn', 'Grace', 'Hugo', 'Ivy', 'Jack', 'Kai', 'Luna', 'Max', 'Nora', 'Owen', 'Priya', 'Quinn', 'Ruby', 'Sam', 'Tess', 'Uma', 'Wes', 'Zoe', 'Leo', 'Mia', 'Theo'];
const SKINS = ['#f0c8a6', '#e8b996', '#d9a57e', '#c68d68', '#a8714f', '#7d4f35', '#5a3a28'];
const HAIRS = ['#2a1c12', '#5b3f2a', '#8a5a2b', '#d9b25c', '#f3d667', '#b8432e', '#d8d2c4', '#17191d'];
const TOPS = ['#2b5fa8', '#d64545', '#2a9d8f', '#e9c46a', '#6d597a', '#f4a261', '#3c9460', '#1d3557', '#e76f51', '#8ecae6', '#f6f3ec', '#9b1c2c'];
const LINES = {
  perfect: ['Perfect. I’m telling everyone.', 'Chef’s kiss!', 'Best pizza on Story St.'],
  great: ['Really good!', 'Now that’s a pie.', 'Nailed it.'],
  good: ['Pretty good.', 'Not bad at all.', 'I’d come back.'],
  ok: ['It’s… pizza.', 'Could be better.', 'Hm. Okay.'],
  bad: ['What happened here?', 'I’ll just eat the crust.', 'Is this a pizza?'],
};
const HOWTO = [
  '<b>Order.</b> Customers line up at the counter. Take the order and a ticket drops onto the rail up top.',
  '<b>Build.</b> Pick a ticket. Hold on the dough to stretch it to the dashed ring (it tears if you overdo it). Paint on sauce, then cheese, then drop each topping where the ticket shows it: the whole pie, the left half or the right half. Count carefully and spread them out.',
  '<b>Bake.</b> Slide it into the wood-fired oven. The fire is at the back, so turn each pie once, about halfway, for an even bake. Pull it when the needle is in the green.',
  '<b>Cut.</b> Drag straight across the pie, through the middle. The ticket says 4, 6 or 8 slices; space the cuts evenly.',
  '<b>Serve.</b> Every pie is scored on wait, build, bake and cut. The trick is multitasking: take orders and build the next pie while the oven works.',
  'Keys: <kbd>1</kbd>–<kbd>4</kbd> switch stations, <kbd>Z</kbd> takes back a topping, <kbd>Space</kbd> takes an order, <kbd>Esc</kbd> pauses.',
];

function loadSave() {
  const d = { day: 1, best: 0, served: 0, tips: 0, shifts: 0 };
  try { return { ...d, ...JSON.parse(localStorage.getItem('mmjr.pizza') || '{}') }; } catch { return d; }
}
function storeSave(s) { try { localStorage.setItem('mmjr.pizza', JSON.stringify(s)); } catch { /* storage unavailable */ } }
export function pizzaRecord() { return loadSave(); }

/* ------------------------------------------------------------------ topping sprites */
function makeSprite(k, v) {
  const cv = document.createElement('canvas'); cv.width = cv.height = SPR; const c = cv.getContext('2d'); const r = rng(k.length * 977 + v * 131 + k.charCodeAt(0));
  c.translate(SPR / 2, SPR / 2);
  if (k === 'pep') {
    const g = c.createRadialGradient(-12, -14, 4, 0, 0, 54); g.addColorStop(0, '#d4503a'); g.addColorStop(1, '#9a281d');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 51, 0, TAU); c.fill(); c.lineWidth = 5; c.strokeStyle = '#741c14'; c.stroke();
    for (let i = 0; i < 9; i++) { const a = r() * TAU, d = r() * 36; c.fillStyle = i % 3 ? 'rgba(240,150,118,.55)' : 'rgba(84,18,12,.5)'; c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d, 3 + r() * 5, 2 + r() * 4, r() * 3, 0, TAU); c.fill(); }
  } else if (k === 'mush') {
    c.rotate(r() * 0.4 - 0.2);
    c.fillStyle = '#e8d8bc'; c.strokeStyle = '#8b6a48'; c.lineWidth = 5;
    c.beginPath(); c.moveTo(-50, 4); c.bezierCurveTo(-48, -50, 48, -50, 50, 4); c.quadraticCurveTo(30, 13, 16, 9); c.lineTo(14, 44); c.quadraticCurveTo(0, 52, -14, 44); c.lineTo(-16, 9); c.quadraticCurveTo(-30, 13, -50, 4); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(140,105,70,.55)'; c.lineWidth = 2.5; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 9, 3); c.lineTo(i * 11, -28 + Math.abs(i) * 4); c.stroke(); }
    c.fillStyle = 'rgba(120,85,55,.35)'; c.beginPath(); c.ellipse(0, -30, 30, 8, 0, Math.PI, TAU); c.fill();
  } else if (k === 'olive') {
    c.fillStyle = '#211e1d'; c.beginPath(); c.arc(0, 0, 47, 0, TAU); c.fill();
    c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.ellipse(1, 0, 19, 17, 0, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over';
    c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.arc(0, 0, 34, -2.5, -1.3); c.stroke();
  } else if (k === 'pepper') {
    c.lineCap = 'round'; const a0 = Math.PI * (1.08 + r() * 0.08), a1 = Math.PI * (1.86 + r() * 0.08);
    c.strokeStyle = '#2a7429'; c.lineWidth = 24; c.beginPath(); c.arc(0, 20, 40, a0, a1); c.stroke();
    c.strokeStyle = '#5cb84a'; c.lineWidth = 9; c.beginPath(); c.arc(0, 20, 40, a0 + 0.08, a1 - 0.08); c.stroke();
  } else if (k === 'onion') {
    c.lineCap = 'round'; const a0 = Math.PI * (0.95 + r() * 0.1), a1 = Math.PI * (1.95 + r() * 0.1);
    c.strokeStyle = '#a56ac0'; c.lineWidth = 15; c.beginPath(); c.arc(0, 18, 42, a0, a1); c.stroke();
    c.strokeStyle = '#f6eefa'; c.lineWidth = 8; c.beginPath(); c.arc(0, 18, 42, a0, a1); c.stroke();
  } else if (k === 'saus') {
    const g = c.createRadialGradient(-8, -10, 4, 0, 0, 50); g.addColorStop(0, '#9a5634'); g.addColorStop(1, '#5e2d18');
    c.fillStyle = g; c.beginPath(); for (let i = 0; i < 11; i++) { const a = i / 11 * TAU, d = 34 + r() * 16; i ? c.lineTo(Math.cos(a) * d, Math.sin(a) * d) : c.moveTo(Math.cos(a) * d, Math.sin(a) * d); } c.closePath(); c.fill();
    for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? 'rgba(200,130,90,.5)' : 'rgba(50,22,10,.55)'; c.beginPath(); c.arc(r() * 50 - 25, r() * 50 - 25, 3 + r() * 4, 0, TAU); c.fill(); }
  } else if (k === 'basil') {
    c.rotate(r() * 0.6);
    const g = c.createLinearGradient(0, -36, 0, 36); g.addColorStop(0, '#47a852'); g.addColorStop(1, '#1f6a2a');
    c.fillStyle = g; c.beginPath(); c.moveTo(-54, 0); c.quadraticCurveTo(-8, -46, 52, -2); c.quadraticCurveTo(-4, 40, -54, 0); c.fill();
    c.strokeStyle = 'rgba(190,240,170,.7)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-50, 0); c.quadraticCurveTo(0, -6, 48, -2); c.stroke();
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 15, -3); c.lineTo(i * 15 + 10, -18); c.moveTo(i * 15, -2); c.lineTo(i * 15 + 10, 13); c.stroke(); }
  } else if (k === 'pine') {
    c.rotate(r() * 0.8 - 0.4);
    c.fillStyle = '#f6d861'; c.strokeStyle = '#d6a42a'; c.lineWidth = 5; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(-42, -26); c.lineTo(40, -36); c.lineTo(46, 30); c.lineTo(-46, 34); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = 'rgba(214,164,42,.6)'; c.lineWidth = 3; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 16, -28); c.lineTo(i * 18, 30); c.stroke(); }
  } else if (k === 'bacon') {
    c.rotate(r() * TAU); const ph = r() * 6;
    const edge = s => { const pts = []; for (let x = -54; x <= 54; x += 6) pts.push([x, Math.sin(x * 0.1 + ph) * 8 + s]); return pts; };
    const top = edge(-12), bot = edge(12).reverse();
    c.fillStyle = '#b4473a'; c.beginPath(); top.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); bot.forEach(([x, y]) => c.lineTo(x, y)); c.closePath(); c.fill();
    c.strokeStyle = '#f2c7a8'; c.lineWidth = 6; c.beginPath(); edge(-1).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    c.strokeStyle = 'rgba(120,30,20,.6)'; c.lineWidth = 3; c.beginPath(); edge(7).forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
  } else if (k === 'jal') {
    c.fillStyle = '#dcecb4'; c.beginPath(); c.arc(0, 0, 38, 0, TAU); c.fill();
    c.strokeStyle = '#3c8a2c'; c.lineWidth = 13; c.beginPath(); c.arc(0, 0, 42, 0, TAU); c.stroke();
    c.fillStyle = '#f8f2d8'; c.strokeStyle = 'rgba(150,170,100,.6)'; c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + r(); c.beginPath(); c.ellipse(Math.cos(a) * 15, Math.sin(a) * 15, 5, 3.5, a, 0, TAU); c.fill(); c.stroke(); }
  }
  return cv;
}
let SPRITES = null, ICONS = null;
function sprites() {
  if (!SPRITES) {
    SPRITES = {}; ICONS = {};
    for (const k of KEYS) { SPRITES[k] = [0, 1, 2].map(v => makeSprite(k, v)); ICONS[k] = SPRITES[k][0].toDataURL(); }
  }
  return SPRITES;
}

/* ------------------------------------------------------------------ the pizza itself */
function newPizza(order) {
  const mk = () => { const cv = document.createElement('canvas'); cv.width = cv.height = MS; return cv; };
  const r = rng((Math.random() * 1e9) | 0);
  const spots = []; for (let i = 0; i < 46; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.8; spots.push([Math.cos(a) * d, Math.sin(a) * d, 0.02 + r() * 0.05, r() * 3, r()]); }
  const flour = []; for (let i = 0; i < 60; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 1.15; flour.push([Math.cos(a) * d, Math.sin(a) * d, 0.006 + r() * 0.012]); }
  return { order, d: 0.36, locked: false, torn: false, tornT: 0, sauce: mk(), cheese: mk(), sGrid: new Uint8Array(N * N), cGrid: new Uint8Array(N * N),
    tops: [], bakeA: 0, bakeB: 0, turns: [], inOven: false, cuts: [], ver: 1, master: null, key: '', spots, flour, sauceUsed: false, cheeseUsed: false };
}
function markGrid(grid, ux, uy, r) {
  const i0 = Math.max(0, Math.floor((ux - r + UMAX) / CS)), i1 = Math.min(N - 1, Math.floor((ux + r + UMAX) / CS));
  const j0 = Math.max(0, Math.floor((uy - r + UMAX) / CS)), j1 = Math.min(N - 1, Math.floor((uy + r + UMAX) / CS));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cx = -UMAX + (i + 0.5) * CS, cy = -UMAX + (j + 0.5) * CS;
    if ((cx - ux) ** 2 + (cy - uy) ** 2 <= r * r) grid[j * N + i] = 1;
  }
}
// how much of the inside of the pie is covered, and how much spilled out onto the crust or the counter
function coverage(grid, d) {
  let inner = 0, cov = 0, ring = 0, spill = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const cx = -UMAX + (i + 0.5) * CS, cy = -UMAX + (j + 0.5) * CS, r = Math.hypot(cx, cy), g = grid[j * N + i];
    if (r <= 0.84 * d) { inner++; if (g) cov++; }
    else if (r > 0.9 * d) { if (r <= d) ring++; if (g) spill++; }
  }
  return { cov: inner ? cov / inner : 0, spill: ring ? Math.min(1, spill / ring) : 0 };
}
function stamp(pz, kind, ux, uy) {
  const c = (kind === 'sauce' ? pz.sauce : pz.cheese).getContext('2d');
  const x = (ux + UMAX) * MK, y = (uy + UMAX) * MK;
  if (kind === 'sauce') {
    const r = 0.17 * MK, g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(176,36,22,.95)'); g.addColorStop(0.7, 'rgba(188,48,28,.85)'); g.addColorStop(1, 'rgba(188,48,28,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    if (Math.random() < 0.5) { c.fillStyle = Math.random() < 0.5 ? 'rgba(90,30,14,.6)' : 'rgba(224,100,64,.55)'; c.beginPath(); c.arc(x + rand(-r, r) * 0.6, y + rand(-r, r) * 0.6, rand(0.6, 1.6), 0, TAU); c.fill(); }
    markGrid(pz.sGrid, ux, uy, 0.16); pz.sauceUsed = true;
  } else {
    const r = 0.15 * MK, g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(250,226,146,.6)'); g.addColorStop(0.75, 'rgba(248,220,132,.45)'); g.addColorStop(1, 'rgba(248,220,132,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    c.lineCap = 'round'; c.lineWidth = 0.022 * MK;
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r * 0.9, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, b = Math.random() * TAU, L = rand(0.03, 0.06) * MK;
      c.strokeStyle = pick(['#fbe7a1', '#f6d77a', '#f1c95c', '#fff3c6']); c.beginPath(); c.moveTo(px - Math.cos(b) * L, py - Math.sin(b) * L); c.lineTo(px + Math.cos(b) * L, py + Math.sin(b) * L); c.stroke();
    }
    markGrid(pz.cGrid, ux, uy, 0.14); pz.cheeseUsed = true;
  }
  pz.ver++;
}
// draws the pie (dough, sauce, cheese, toppings, browning) into its own canvas, re-rendered only when something changed
function render(pz) {
  const a = pz.bakeA, b = pz.bakeB, key = `${pz.ver}|${Math.round(a * 60)}|${Math.round(b * 60)}|${pz.torn ? 1 : 0}`;
  if (pz.master && pz.key === key) return pz.master;
  if (!pz.master) { pz.master = document.createElement('canvas'); pz.master.width = pz.master.height = MASTER; }
  pz.key = key;
  const S = sprites(), c = pz.master.getContext('2d'), k = MASTER / (2 * UMAX), h = MASTER / 2, d = pz.d * k;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, MASTER, MASTER); c.translate(h, h);
  const ball = clamp((0.62 - pz.d) / 0.26, 0, 1);                     // a dough ball still looks like a ball
  // dough with a puffy rim
  const g = c.createRadialGradient(-d * 0.25, -d * 0.3, d * 0.1, 0, 0, d);
  g.addColorStop(0, ball > 0 ? '#f8e6bf' : '#f2dcaa'); g.addColorStop(0.82, '#ecd19b'); g.addColorStop(1, '#d9b47a');
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, d, 0, TAU); c.fill();
  if (ball < 1) { c.globalAlpha = 1 - ball; c.lineWidth = d * 0.12; c.strokeStyle = '#e9c88c'; c.beginPath(); c.arc(0, 0, d * 0.92, 0, TAU); c.stroke(); c.lineWidth = d * 0.03; c.strokeStyle = 'rgba(255,248,226,.6)'; c.beginPath(); c.arc(0, 0, d * 0.95, Math.PI * 1.05, Math.PI * 1.6); c.stroke(); c.globalAlpha = 1; }
  if (ball > 0) { c.fillStyle = `rgba(255,255,255,${0.35 * ball})`; c.beginPath(); c.ellipse(-d * 0.3, -d * 0.35, d * 0.3, d * 0.18, -0.6, 0, TAU); c.fill(); }
  c.save(); c.beginPath(); c.arc(0, 0, d, 0, TAU); c.clip();
  c.fillStyle = 'rgba(255,255,255,.55)'; for (const [x, y, r] of pz.flour) if (Math.hypot(x, y) < pz.d) { c.beginPath(); c.arc(x * k, y * k, r * k, 0, TAU); c.fill(); }
  if (pz.sauceUsed) c.drawImage(pz.sauce, -UMAX * k, -UMAX * k, 2 * UMAX * k, 2 * UMAX * k);
  if (pz.cheeseUsed) {
    c.drawImage(pz.cheese, -UMAX * k, -UMAX * k, 2 * UMAX * k, 2 * UMAX * k);
    const melt = clamp((a + b) / 2 / 0.5, 0, 1);                      // baked cheese melts into a glossy sheet
    if (melt > 0) { c.globalAlpha = melt * 0.55; c.drawImage(pz.cheese, -UMAX * k - 3, -UMAX * k - 3, 2 * UMAX * k + 6, 2 * UMAX * k + 6); c.globalAlpha = 1; }
  }
  for (const t of pz.tops) {
    const sp = S[t.k][t.v], s = T[t.k].r * k * 2 * (SPR / 2) / 52;
    c.save(); c.translate(t.x * k, t.y * k); c.rotate(t.a); c.shadowColor = 'rgba(60,20,0,.35)'; c.shadowBlur = 3; c.shadowOffsetY = 1.5; c.drawImage(sp, -s / 2, -s / 2, s, s); c.restore();
  }
  c.restore();
  // browning: the half facing the fire (-y half is "A") gets darker first
  if (a > 0.01 || b > 0.01) {
    c.save(); c.globalCompositeOperation = 'source-atop';
    const tone = x => `rgba(150,72,16,${clamp(x * 0.42, 0, 0.42)})`, char = x => `rgba(34,16,6,${clamp((x - 0.86) * 2.6, 0, 0.85)})`;
    let lg = c.createLinearGradient(0, -d, 0, d); lg.addColorStop(0, tone(a)); lg.addColorStop(0.5, tone((a + b) / 2)); lg.addColorStop(1, tone(b)); c.fillStyle = lg; c.fillRect(-d, -d, 2 * d, 2 * d);
    const rg = c.createRadialGradient(0, 0, d * 0.78, 0, 0, d); rg.addColorStop(0, 'rgba(160,80,20,0)'); rg.addColorStop(1, `rgba(150,70,18,${clamp((a + b) * 0.45, 0, 0.6)})`); c.fillStyle = rg; c.fillRect(-d, -d, 2 * d, 2 * d);
    for (const [x, y, r, rot, w] of pz.spots) { const bk = y < 0 ? a : b, al = clamp((bk - 0.3) * 1.3, 0, 0.55) * (0.5 + w * 0.5); if (al <= 0) continue; c.fillStyle = `rgba(176,96,30,${al})`; c.beginPath(); c.ellipse(x * pz.d * k, y * pz.d * k, r * k, r * k * 0.7, rot, 0, TAU); c.fill(); }
    lg = c.createLinearGradient(0, -d, 0, d); lg.addColorStop(0, char(a)); lg.addColorStop(1, char(b)); c.fillStyle = lg; c.fillRect(-d, -d, 2 * d, 2 * d);
    c.restore();
  }
  if (pz.torn) {
    c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); const tr = rng(7);
    for (let i = 0; i < 12; i++) { const ang = -0.5 + i / 12 * 1.0, rr = d * (0.55 + tr() * 0.35); i ? c.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr) : c.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr); }
    c.lineTo(d * 1.3, 0); c.closePath(); c.fill(); c.restore();
  }
  return pz.master;
}
// a cut is an infinite line through the pie: unit direction (dx, dy) and its signed distance off the centre (normal (-dy, dx))
function chord(cut, d) {
  const h = Math.sqrt(Math.max(0, d * d - cut.off * cut.off)), nx = -cut.dy * cut.off, ny = cut.dx * cut.off;
  return [nx - cut.dx * h, ny - cut.dy * h, nx + cut.dx * h, ny + cut.dy * h];
}
function drawPie(c, pz, cx, cy, R, rot = 0, cutAnim = null) {
  const m = render(pz);
  c.save(); c.translate(cx, cy); c.rotate(rot);
  c.drawImage(m, -UMAX * R, -UMAX * R, 2 * UMAX * R, 2 * UMAX * R);
  if (pz.cuts.length) {
    c.save(); c.beginPath(); c.arc(0, 0, pz.d * R, 0, TAU); c.clip(); c.lineCap = 'round';
    pz.cuts.forEach((cut, i) => {
      let [x0, y0, x1, y1] = chord(cut, pz.d * 1.02);
      if (cutAnim && i === pz.cuts.length - 1) { const f = clamp(cutAnim.t / 0.22, 0, 1); x1 = lerp(x0, x1, f); y1 = lerp(y0, y1, f); }
      c.strokeStyle = 'rgba(70,30,12,.78)'; c.lineWidth = Math.max(1.6, R * 0.014); c.beginPath(); c.moveTo(x0 * R, y0 * R); c.lineTo(x1 * R, y1 * R); c.stroke();
      c.strokeStyle = 'rgba(255,236,200,.35)'; c.lineWidth = Math.max(0.8, R * 0.005); c.beginPath(); c.moveTo(x0 * R + 1.5, y0 * R + 1.5); c.lineTo(x1 * R + 1.5, y1 * R + 1.5); c.stroke();
    });
    c.restore();
  }
  c.restore();
}

/* ------------------------------------------------------------------ scoring */
function regionOf(t, d) { return t.x < -0.06 * d ? 'L' : t.x > 0.06 * d ? 'R' : 'mid'; }
function scoreBuild(pz) {
  const o = pz.order, d = pz.d, det = [];
  const dough = pz.torn ? 0 : clamp(1 - Math.abs(d - 1) / 0.13, 0, 1);
  det.push(['Dough', `${Math.round(d * 100)}% of the ring`, dough]);
  const sc = coverage(pz.sGrid, d), cc = coverage(pz.cGrid, d);
  const sauce = clamp((sc.cov - 0.55) / 0.35, 0, 1) * clamp(1 - Math.max(0, sc.spill - 0.08) * 1.1, 0, 1);
  const cheese = clamp((cc.cov - 0.55) / 0.35, 0, 1) * clamp(1 - Math.max(0, cc.spill - 0.08) * 1.1, 0, 1);
  det.push(['Sauce', `${Math.round(sc.cov * 100)}% covered${sc.spill > 0.08 ? `, ${Math.round(sc.spill * 100)}% on the crust` : ''}`, sauce]);
  det.push(['Cheese', `${Math.round(cc.cov * 100)}% covered${cc.spill > 0.08 ? `, ${Math.round(cc.spill * 100)}% on the crust` : ''}`, cheese]);
  let pen = 0, sum = 0;
  const wanted = new Set(o.reqs.map(q => q.k));
  for (const q of o.reqs) {
    const mine = pz.tops.filter(t => t.k === q.k);
    const inReg = mine.filter(t => q.reg === 'all' || regionOf(t, d) === q.reg);
    const wrong = mine.length - inReg.length;
    const cnt = clamp(1 - Math.abs(inReg.length - q.n) / q.n, 0, 1);
    let even = 1;
    if (inReg.length >= 3) {                                   // spread: mean nearest-neighbour distance vs an even layout
      const area = Math.PI * (0.84 * d) ** 2 * (q.reg === 'all' ? 1 : 0.5), ideal = Math.sqrt(area / inReg.length);
      let nn = 0; for (const t of inReg) { let m = 9; for (const u of inReg) if (u !== t) m = Math.min(m, Math.hypot(t.x - u.x, t.y - u.y)); nn += m; }
      even = clamp((nn / inReg.length / ideal - 0.42) / 0.4, 0, 1);
    } else if (!inReg.length) even = 0;
    sum += 0.65 * cnt + 0.35 * even; pen += wrong * 0.07;
    det.push([T[q.k].name, `${inReg.length}/${q.n} on the ${REG[q.reg].name}${wrong ? `, ${wrong} in the wrong spot` : ''}, spread ${Math.round(even * 100)}%`, 0.65 * cnt + 0.35 * even]);
  }
  const extra = pz.tops.filter(t => !wanted.has(t.k)).length;
  if (extra) { pen += extra * 0.07; det.push(['Extras', `${extra} topping${extra > 1 ? 's' : ''} nobody asked for`, 0]); }
  const crust = pz.tops.filter(t => Math.hypot(t.x, t.y) > 0.88 * d).length;
  if (crust) { pen += crust * 0.03; det.push(['Crust', `${crust} topping${crust > 1 ? 's' : ''} on the crust`, 0]); }
  const tops = clamp(sum / o.reqs.length - pen, 0, 1);
  return { score: 100 * (0.08 * dough + 0.16 * sauce + 0.16 * cheese + 0.6 * tops), det, parts: { dough, sauce, cheese, tops } };
}
function scoreBake(pz) {
  const t = BAKE[pz.order.bake].t, avg = (pz.bakeA + pz.bakeB) / 2, diff = Math.abs(avg - t);
  const close = avg > 1 ? 0 : diff <= PERFECT ? 1 : clamp(1 - (diff - PERFECT) / 0.2, 0, 1);
  const even = clamp(1 - Math.abs(pz.bakeA - pz.bakeB) / (0.6 * t), 0, 1);
  const word = avg > 1 ? 'burnt' : avg < t - PERFECT ? 'underdone' : avg > t + PERFECT ? 'overdone' : 'right on';
  return { score: 100 * (0.7 * close + 0.3 * even), det: [['Bake', `${Math.round(avg * 100)}% (wanted ${BAKE[pz.order.bake].name}, ${Math.round(t * 100)}%): ${word}`, close], ['Evenness', pz.turns.length ? `turned at ${pz.turns.map(f => Math.round(f * 100) + '%').join(', ')} of the way` : 'never turned', even]], avg, word };
}
function scoreCut(pz) {
  const k = pz.order.cut / 2, cuts = pz.cuts, n = cuts.length;
  if (!n) return { score: 0, det: [['Cut', 'not cut at all', 0]] };
  const ang = cuts.map(q => ((Math.atan2(q.dy, q.dx) % Math.PI) + Math.PI) % Math.PI).sort((x, y) => x - y);
  let err = 0;
  if (n > 1) { for (let i = 0; i < n; i++) { const g = i < n - 1 ? ang[i + 1] - ang[i] : ang[0] + Math.PI - ang[n - 1]; err += Math.abs(g - Math.PI / n); } err /= n * (Math.PI / n); }
  const off = cuts.reduce((s, q) => s + Math.abs(q.off), 0) / n / pz.d;
  const countPen = Math.abs(n - k) * 0.25 + (n !== k ? 0.1 : 0);
  const ev = clamp(1 - Math.max(0, err - 0.04) * 1.1 - Math.max(0, off - 0.02) * 1.6, 0, 1), score = clamp(ev - countPen, 0, 1);
  const slices = n * 2;
  return { score: 100 * score, det: [['Slices', `${slices} slices (wanted ${pz.order.cut})`, n === k ? 1 : 0], ['Even cuts', `spacing ${Math.round(clamp(1 - err, 0, 1) * 100)}% even, ${Math.round(off * 100)}% off-centre`, ev]] };
}
function idealWait(o) { return 70 + 9 * o.reqs.length + BAKE[o.bake].t / BAKE_RATE; }
function waitScore(o, secs) { const id = idealWait(o); return secs <= id ? 100 : Math.max(25, 100 - (secs - id) * 0.55); }

/* ------------------------------------------------------------------ people (flat, in the same blocky style as Pat) */
function drawPerson(c, x, y, h, lk, mood = 1, t = 0, opt = {}) {
  const u = h / 1.9, B = (cx, cy, w, hh, col) => { c.fillStyle = col; c.fillRect(x + (cx - w / 2) * u, y - (cy + hh / 2) * u, w * u, hh * u); };
  if (!opt.headOnly) {
    for (const k of [-1, 1]) { B(k * 0.09, 0.42, 0.14, 0.8, lk.legs); B(k * 0.09, 0.035, 0.16, 0.07, '#2a1c12'); }
    B(0, 0.9, 0.36, 0.18, lk.legs); B(0, 0.99, 0.37, 0.04, '#2a1c12');
    B(0, 1.25, 0.4, 0.5, lk.top);
    if (lk.plaid) { c.fillStyle = 'rgba(20,16,18,.4)'; for (let i = 0; i < 4; i++) { c.fillRect(x + (-0.2 + i * 0.1 + 0.02) * u, y - 1.5 * u, 0.03 * u, 0.5 * u); c.fillRect(x - 0.2 * u, y - (1.04 + i * 0.12) * u, 0.4 * u, 0.03 * u); } B(0, 1.25, 0.14, 0.48, '#f6f3ec'); }
    B(0, 1.5, 0.46, 0.07, lk.top);
    const sw = Math.sin(t * 2) * 0.03;
    for (const k of [-1, 1]) { B(k * (0.26 + sw * k), 1.22, 0.11, 0.56, lk.top); c.fillStyle = lk.skin; c.beginPath(); c.arc(x + k * (0.26 + sw * k) * u, y - 0.92 * u, 0.055 * u, 0, TAU); c.fill(); }
    B(0, 1.57, 0.11, 0.08, lk.skin);
  }
  // a big friendly head
  const hy = 1.78, hw = 0.32, hh = 0.34;
  B(0, hy, hw, hh, lk.skin); B(-hw / 2 - 0.015, hy, 0.03, 0.08, lk.skin); B(hw / 2 + 0.015, hy, 0.03, 0.08, lk.skin);
  const hs = lk.hs || 'short';
  if (hs === 'long') { B(0, hy - 0.06, hw + 0.06, hh + 0.14, lk.hair); B(0, hy - 0.02, hw - 0.02, hh - 0.08, lk.skin); }
  if (hs !== 'bald') { B(0, hy + hh / 2 - 0.02, hw + 0.04, 0.09, lk.hair); B(-hw / 2 + 0.01, hy + 0.06, 0.04, 0.16, lk.hair); B(hw / 2 - 0.01, hy + 0.06, 0.04, 0.16, lk.hair); }
  if (hs === 'swept') { c.fillStyle = lk.hair; c.beginPath(); c.moveTo(x - 0.16 * u, y - (hy + 0.17) * u); c.lineTo(x + 0.12 * u, y - (hy + 0.27) * u); c.lineTo(x + 0.17 * u, y - (hy + 0.15) * u); c.closePath(); c.fill(); }
  if (hs === 'bun') { c.fillStyle = lk.hair; c.beginPath(); c.arc(x, y - (hy + 0.22) * u, 0.07 * u, 0, TAU); c.fill(); }
  const blink = (t * 0.7 + (opt.seed || 0)) % 4 < 0.1;
  for (const k of [-1, 1]) {
    if (blink) B(k * 0.07, hy + 0.02, 0.05, 0.012, '#3a2a1c');
    else { B(k * 0.07, hy + 0.02, 0.05, 0.045, '#fff'); B(k * 0.07 + 0.006, hy + 0.017, 0.024, 0.035, '#2a1c12'); }
    B(k * 0.07, hy + 0.075 - (mood < 0.4 ? k * 0.012 : 0), 0.065, 0.016, lk.hair);       // eyebrows tilt when annoyed
  }
  if (lk.glasses) { c.strokeStyle = '#111'; c.lineWidth = Math.max(1, 0.012 * u); for (const k of [-1, 1]) c.strokeRect(x + (k * 0.07 - 0.04) * u, y - (hy + 0.05) * u, 0.08 * u, 0.065 * u); }
  if (lk.beard) { B(0, hy - 0.13, hw, 0.1, lk.beard); B(-hw / 2 + 0.02, hy - 0.06, 0.04, 0.12, lk.beard); B(hw / 2 - 0.02, hy - 0.06, 0.04, 0.12, lk.beard); }
  B(0, hy - 0.035, 0.035, 0.05, 'rgba(0,0,0,.1)');
  c.strokeStyle = '#7a3a2e'; c.lineWidth = Math.max(1.2, 0.018 * u); c.lineCap = 'round'; c.beginPath();
  const my = y - (hy - 0.1) * u, mw = 0.07 * u, bend = (mood - 0.5) * 0.09 * u;
  c.moveTo(x - mw, my - bend * 0.3); c.quadraticCurveTo(x, my + bend, x + mw, my - bend * 0.3); c.stroke();
}
function randomLook() {
  return { skin: pick(SKINS), hair: pick(HAIRS), hs: pick(['short', 'short', 'swept', 'long', 'bun', 'bald']), top: pick(TOPS), legs: pick(['#3d5f93', '#17191d', '#5b3a22', '#3a3226', '#6b6f78']), glasses: Math.random() < 0.18, beard: Math.random() < 0.15 ? pick(HAIRS) : undefined };
}

/* ------------------------------------------------------------------ sound: a few tiny synth blips */
let AC = null;
function tone(f0, f1, dur, type = 'sine', vol = 0.12, delay = 0) {
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(AC.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch { /* no audio */ }
}
const SFX = {
  bell() { tone(1320, 1300, 0.5, 'triangle', 0.09); tone(1760, 1740, 0.6, 'triangle', 0.06, 0.12); },
  ding() { tone(988, 980, 0.35, 'sine', 0.13); tone(1480, 1470, 0.45, 'sine', 0.08, 0.08); },
  warn() { tone(330, 300, 0.18, 'square', 0.05); tone(330, 300, 0.18, 'square', 0.05, 0.22); },
  plop() { tone(520, 180, 0.09, 'sine', 0.1); },
  chop() { tone(240, 90, 0.12, 'sawtooth', 0.05); },
  tear() { tone(300, 60, 0.3, 'sawtooth', 0.07); },
  whoosh() { tone(160, 420, 0.3, 'triangle', 0.06); },
  cash() { tone(1600, 1580, 0.12, 'square', 0.05); tone(2100, 2080, 0.3, 'square', 0.045, 0.1); },
  click() { tone(700, 600, 0.04, 'square', 0.03); },
};

/* ------------------------------------------------------------------ layout + look */
const CSS = `
#pz{position:fixed;inset:0;z-index:14;background:#1d140d;color:#2a1d12;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-user-select:none;user-select:none;overflow:hidden}
#pz *{box-sizing:border-box}
#pzc{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none}
#pzTop{position:absolute;left:0;right:0;top:0;display:flex;gap:10px;align-items:stretch;padding:7px 10px 8px;background:linear-gradient(#3b2516,#28180d);border-bottom:3px solid #8c5a2b;box-shadow:0 4px 14px rgba(0,0,0,.4);color:#f7ead6;z-index:3}
.pzBrand{display:flex;flex-direction:column;justify-content:center;flex:none}
.pzBrand b{font:700 18px Georgia,serif;color:#ffcf6e;white-space:nowrap}
.pzBrand small{font-size:12px;opacity:.8;white-space:nowrap}
#pzRail{flex:1;min-width:0;display:flex;gap:8px;overflow-x:auto;overflow-y:hidden;padding:6px 6px 4px;min-height:84px;background:linear-gradient(#5a3b22,#4a2f1b);border-radius:8px;border-top:4px solid #c4c8cf;box-shadow:inset 0 2px 6px rgba(0,0,0,.4);scrollbar-width:thin}
#pzRail:empty::after{content:'Tickets land here when you take an order';color:rgba(255,235,210,.45);font-size:12.5px;align-self:center;margin:auto}
.tk{flex:none;width:150px;height:70px;display:flex;gap:6px;background:#fffdf5;color:#2a1d12;border-radius:2px 2px 6px 6px;box-shadow:0 3px 7px rgba(0,0,0,.4);padding:5px 6px;font-size:11px;cursor:pointer;position:relative;transform-origin:top center}
.tk::before{content:'';position:absolute;left:50%;top:-7px;width:16px;height:7px;margin-left:-8px;background:#9ea3ab;border-radius:2px 2px 0 0}
.tk.drop{animation:tkIn .55s cubic-bezier(.2,1.5,.4,1)}
@keyframes tkIn{from{transform:translateY(-120%) rotate(-7deg)}to{transform:none}}
.tk.sel{outline:3px solid #ffb43a;outline-offset:1px}
.tk img.pie{width:52px;height:52px;flex:none;align-self:center}
.tk .tkB{display:flex;flex-direction:column;min-width:0;flex:1;gap:2px}
.tk .tkH{display:flex;justify-content:space-between;gap:4px;font-weight:800;font-size:11.5px;white-space:nowrap;overflow:hidden}
.tk .tkH span{overflow:hidden;text-overflow:ellipsis}
.tk .tkF{display:flex;gap:4px;font-weight:700;font-size:10.5px;color:#5a4330;white-space:nowrap}
.tk .stt{font-size:9px;font-weight:800;letter-spacing:.04em;padding:1px 4px;border-radius:4px;background:#efe6d6;color:#6b5136;align-self:flex-start}
.tk .stt.oven{background:#ffd9b0;color:#a24a0e}.tk .stt.cut{background:#d9ecff;color:#2a5a8a}.tk .stt.build{background:#e0f3d9;color:#2f6b2a}
.pat{display:block;height:5px;background:#e6dccb;border-radius:3px;overflow:hidden;margin-top:auto}.pat s{display:block;height:100%;background:#35c27a;transition:width .3s,background .3s}
.pzStats{display:flex;align-items:center;gap:8px;flex:none;font-weight:700;font-size:14px}
.pzStats .chip{background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.12);padding:5px 9px;border-radius:999px;white-space:nowrap}
.pzStats button{background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.15);color:#f7ead6;border-radius:999px;width:34px;height:34px;font-size:14px;padding:0}
#pzOvenMini{display:flex;gap:4px;cursor:pointer}
#pzOvenMini i{position:relative;display:block;width:12px;height:34px;border-radius:4px;background:rgba(0,0,0,.4);overflow:hidden;border:1px solid rgba(255,255,255,.15)}
#pzOvenMini i b{position:absolute;left:0;right:0;bottom:0;background:#f2b441}
#pzOvenMini i u{position:absolute;left:0;right:0;height:3px;background:#35c27a;text-decoration:none}
#pzOvenMini i.hot b{background:#35c27a}#pzOvenMini i.burn b{background:#e5544b}
#pzPin{position:absolute;left:10px;width:208px;background:#fffdf5;border-radius:3px 3px 10px 10px;box-shadow:0 8px 22px rgba(0,0,0,.45);padding:10px 12px 12px;z-index:2;font-size:13px}
#pzPin::before{content:'';position:absolute;left:50%;top:-9px;width:44px;height:12px;margin-left:-22px;background:#b9bcc4;border-radius:3px}
#pzPin h4{margin:0;font:800 15px ui-sans-serif,system-ui,sans-serif;display:flex;justify-content:space-between}
#pzPin img.pie{display:block;width:120px;height:120px;margin:6px auto}
#pzPin ul{list-style:none;margin:0;padding:0}#pzPin li{display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px dashed #e3d8c4;font-weight:600}
#pzPin li img{width:20px;height:20px}#pzPin li b{margin-left:auto;font-size:14px}#pzPin li em{font-style:normal;font-size:16px;color:#7a5a3a}
#pzPin .pinF{display:flex;justify-content:space-between;margin-top:6px;font-weight:800;color:#5a4330}
#pzTray{position:absolute;right:0;width:256px;padding:12px;background:linear-gradient(#3a2414,#2b1a0e);border-left:3px solid #8c5a2b;color:#f7ead6;overflow-y:auto;overflow-x:hidden;z-index:2;display:flex;flex-direction:column;gap:8px}
#pzTray h5{margin:2px 0 0;font:700 12px ui-sans-serif,system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#d8b98e}
#pzTray p{margin:0;font-size:13px;line-height:1.45;color:#eadbc4}
.tools{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:6px}
.tool{display:flex;align-items:center;gap:5px;padding:7px 6px;border-radius:10px;background:#f6ecd9;color:#2a1d12;border:2px solid transparent;font-weight:700;font-size:12px;letter-spacing:-.01em;text-align:left;min-height:42px;line-height:1.1;min-width:0;overflow:hidden}
.tool img{width:21px;height:21px;flex:none}.tool .sw{width:22px;height:22px;border-radius:50%;flex:none;border:2px solid rgba(0,0,0,.15)}
.tool small{display:block;font-weight:600;font-size:10.5px;color:#7a5f45}
.tool.on{border-color:#ffb43a;background:#fff6dd;box-shadow:0 0 0 2px rgba(255,180,58,.35)}
.tool:disabled{opacity:.42}
.tool.wide{grid-column:span 2}
.pzBtn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:11px 14px;border-radius:12px;border:0;background:#f2b441;color:#1a1303;font-weight:800;font-size:15px;box-shadow:0 3px 0 #a8741c}
.pzBtn:active{transform:translateY(2px);box-shadow:0 1px 0 #a8741c}
.pzBtn:disabled{opacity:.45;box-shadow:none}
.pzBtn.ghost{background:rgba(255,255,255,.1);color:#f7ead6;box-shadow:none;border:1px solid rgba(255,255,255,.2)}
.pzBtn.red{background:#e5544b;color:#fff;box-shadow:0 3px 0 #9a2f28}
.pzBtn.green{background:#35c27a;color:#06240f;box-shadow:0 3px 0 #1f7a49}
.row2{display:flex;gap:6px}.row2>*{flex:1}
.meter{font-size:12.5px;display:flex;justify-content:space-between;color:#eadbc4}.meter b{color:#fff}
.meter b.ok{color:#7ee2a8}.meter b.bad{color:#ff9d94}
#pzTabs{position:absolute;left:0;right:0;bottom:0;display:flex;gap:6px;padding:7px 10px calc(7px + env(safe-area-inset-bottom));background:linear-gradient(#2b1a0e,#1d110a);border-top:3px solid #8c5a2b;z-index:3}
#pzTabs button{position:relative;flex:1;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px 6px;border-radius:12px;border:2px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);color:#f7ead6;font-weight:800;font-size:15px}
#pzTabs button i{font-style:normal;font-size:19px}
#pzTabs button.on{background:#f2b441;color:#1a1303;border-color:#ffd88a}
#pzTabs button kbd{font:700 10.5px ui-monospace,Menlo,monospace;opacity:.6;border:1px solid currentColor;border-radius:4px;padding:0 4px}
#pzTabs em{position:absolute;top:-8px;right:8px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#e5544b;color:#fff;font:800 12px/20px ui-sans-serif,system-ui,sans-serif;font-style:normal;display:none}
#pzTabs em.show{display:block}#pzTabs em.go{background:#35c27a;animation:pzPulse .8s infinite alternate}
@keyframes pzPulse{to{transform:scale(1.18)}}
#pzSlots{position:absolute;inset:0;pointer-events:none;z-index:1}
#pzSlots .slot{position:absolute;display:flex;gap:6px;pointer-events:auto;transform:translateX(-50%)}
#pzSlots .slot button{white-space:nowrap;padding:7px 12px;border-radius:10px;border:0;font-weight:800;font-size:13px;background:#f6ecd9;color:#2a1d12;box-shadow:0 2px 0 #a3876a}
#pzSlots .slot button.pull{background:#35c27a;color:#06240f;box-shadow:0 2px 0 #1f7a49}
#pzSlots .slot button:disabled{opacity:.4}
#pzMsg{position:absolute;inset:0;pointer-events:none;z-index:4}
#pzMsg div{position:absolute;transform:translate(-50%,-50%);font:900 22px ui-sans-serif,system-ui,sans-serif;color:#fff;text-shadow:0 2px 0 rgba(0,0,0,.45),0 0 14px rgba(0,0,0,.35);white-space:nowrap;animation:pzFloat 1.3s ease-out forwards}
@keyframes pzFloat{0%{opacity:0;margin-top:10px}12%{opacity:1;margin-top:0}75%{opacity:1}100%{opacity:0;margin-top:-34px}}
#pzModal{position:absolute;inset:0;z-index:6;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(12,7,3,.62);backdrop-filter:blur(2px)}
.pzCard{width:100%;max-width:520px;max-height:calc(100vh - 28px);overflow:auto;background:#fffaf0;color:#2a1d12;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.55);padding:20px 22px}
.pzCard.dark{background:rgba(16,21,31,.96);color:#f4efe6;border:1px solid rgba(255,255,255,.12)}
.pzCard h2{margin:0 0 4px;font:700 28px Georgia,serif;color:#a2421b}.pzCard.dark h2{color:#ffcf6e}
.pzCard p{line-height:1.5;margin:6px 0 10px}
.pzCard kbd{display:inline-block;min-width:20px;padding:1px 6px;border-radius:5px;border:1px solid #d8c8ae;background:#f3e7d1;color:#2a1d12;font:700 12px ui-monospace,Menlo,monospace;text-align:center}
.pzCard ol,.pzCard ul.how{margin:8px 0 14px;padding-left:20px;line-height:1.5;font-size:14px}.pzCard li{margin:5px 0}
.pzCard .acts{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}.pzCard .acts>*{flex:1;min-width:140px}
.pzCard .unlock{background:#fff1cf;border:1px dashed #d9a441;border-radius:10px;padding:8px 10px;font-weight:700;font-size:13.5px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.pzCard .unlock img{width:22px;height:22px}
.rateHead{display:flex;gap:12px;align-items:center}.rateHead canvas{width:76px;height:76px;flex:none;border-radius:50%;background:#f1e4cc}
.rateHead small{color:#8a6a4a;font-weight:700;font-size:12px;letter-spacing:.05em;text-transform:uppercase}.rateHead h3{margin:0;font:800 22px ui-sans-serif,system-ui,sans-serif}.rateHead q{display:block;font-style:italic;color:#5a4330;margin-top:2px}
.ratePie{display:flex;justify-content:center;margin:8px 0}.ratePie canvas{width:170px;height:170px}
.rr{display:grid;grid-template-columns:62px 1fr 36px;gap:8px;align-items:center;margin:7px 0;font-weight:800;font-size:14px}
.rr i{display:block;height:14px;border-radius:7px;background:#eadfcc;overflow:hidden}.rr i s{display:block;height:100%;width:0;border-radius:7px;background:linear-gradient(90deg,#f2b441,#35c27a);transition:width .9s cubic-bezier(.2,.8,.2,1)}
.rr b{text-align:right}
.rateTot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:10px;padding:10px 12px;border-radius:12px;background:#2a1d12;color:#ffe3a3;font-weight:800}
.rateTot big{font:800 24px Georgia,serif;color:#fff}
.rateMore{margin-top:8px;font-size:13px}.rateMore summary{cursor:pointer;font-weight:700;color:#8a5a2b}
.rateMore ul{margin:6px 0 0;padding-left:18px}.rateMore li{margin:3px 0}.rateMore li.good{color:#1f7a49}.rateMore li.meh{color:#9a6a12}.rateMore li.bad{color:#b2322a}
.endGrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.endGrid div{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px 12px}
.endGrid small{display:block;color:#b9b2a5;font-size:12px}.endGrid b{font:800 22px Georgia,serif;color:#ffcf6e}
@media (max-width:859px){
  #pzTray{left:0;right:0;width:auto;max-height:128px;border-left:0;border-top:3px solid #8c5a2b;padding:8px 10px;flex-direction:row;flex-wrap:wrap;align-items:flex-start;gap:6px}
  #pzTray h5,#pzTray p.long{display:none}#pzTray p{font-size:12px;flex-basis:100%}
  .tools{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:6px;flex-basis:100%;padding-bottom:2px}.tool{flex:none;min-height:38px;padding:5px 7px}.tool.wide{flex:none}
  #pzTray .pzBtn{width:auto;flex:1;padding:9px 10px;font-size:13.5px}
  .meter{flex:1;min-width:110px}
  #pzPin{width:auto;right:10px;display:flex;gap:10px;align-items:center;padding:6px 10px;font-size:12px}
  #pzPin img.pie{width:56px;height:56px;margin:0}#pzPin h4{font-size:13px}#pzPin ul{display:flex;flex-wrap:wrap;gap:2px 10px}#pzPin li{border:0;padding:0}#pzPin li img{width:16px;height:16px}#pzPin li b{font-size:12.5px;margin-left:2px}
  #pzPin .pinF{margin-top:2px;gap:10px;justify-content:flex-start}
  .pzBrand b{font-size:15px}.tk{width:132px}.pzStats .chip{padding:4px 7px;font-size:12.5px}.pzStats{gap:5px}
  #pzTabs button{font-size:13px;gap:5px;padding:8px 4px}#pzTabs kbd{display:none}
}
@media (max-width:560px){.pzBrand{display:none}#pzOvenMini{display:none}.pzStats .chip.tips{display:none}}
`;
const HTML = `
<canvas id="pzc"></canvas>
<header id="pzTop">
  <div class="pzBrand"><b>Moore’s Pizzeria</b><small id="pzDay">Day 1</small></div>
  <div id="pzRail"></div>
  <div class="pzStats"><div id="pzOvenMini" title="The oven"></div><span class="chip" id="pzServed">0/${SHIFT}</span><span class="chip tips" id="pzTips">$0.00</span><button id="pzMute" title="Sound">🔊</button><button id="pzPauseB" title="Pause (Esc)">❚❚</button></div>
</header>
<aside id="pzPin" class="hidden"></aside>
<aside id="pzTray"></aside>
<div id="pzSlots"></div>
<nav id="pzTabs">
  <button data-st="order"><i>🧾</i>Order<kbd>1</kbd><em></em></button>
  <button data-st="build"><i>🍕</i>Build<kbd>2</kbd><em></em></button>
  <button data-st="bake"><i>🔥</i>Bake<kbd>3</kbd><em></em></button>
  <button data-st="cut"><i>🔪</i>Cut<kbd>4</kbd><em></em></button>
</nav>
<div id="pzMsg"></div>
<div id="pzModal" class="hidden"><div class="pzCard" id="pzCard"></div></div>`;

/* ================================================================== the game */
export function createPizzeria(ctx = {}) {
  const save = loadSave();
  sprites();
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.id = 'pz'; root.innerHTML = HTML; document.body.appendChild(root);
  const $ = s => root.querySelector(s);
  const cv = $('#pzc'), c = cv.getContext('2d');
  let muted = false; try { muted = localStorage.getItem('mmjr.pizza.mute') === '1'; } catch { /* ignore */ }
  const sfx = k => { if (!muted) SFX[k](); };
  $('#pzMute').textContent = muted ? '🔇' : '🔊';

  const G = {
    t: 0, running: false, paused: false, modal: null, station: 'order', custs: [], orders: [], arrivals: [], nextIdx: 0,
    board: null, tool: 'dough', ovens: Array.from({ length: SLOTS }, () => null), cutQ: [], cutBoard: null, cutAnim: null, cutDrag: null,
    stretching: false, hold: 0, painting: null, last: null, ptr: null, bubble: null, served: 0, tips: 0, points: 0, streak: 0, results: [], anim: 0, sel: null,
  };
  let W = 0, H = 0, dpr = 1, L = null, dirtyTray = true, dirtyRail = true, uiClock = 0;
  const unlocked = () => KEYS.filter(k => T[k].day <= save.day);

  /* ---------------- customers and orders */
  function makeOrder(i) {
    const pool = shuffle(unlocked().slice());
    const nReq = i < 2 ? 1 : i < 5 ? (Math.random() < 0.6 ? 2 : 1) : (Math.random() < 0.3 + Math.min(save.day, 5) * 0.06 ? 3 : 2);
    const reqs = [];
    for (let q = 0; q < nReq && pool.length; q++) {
      const k = pool.pop();
      let reg = Math.random() < 0.5 ? 'all' : Math.random() < 0.5 ? 'L' : 'R';
      if (nReq === 1 && Math.random() < 0.7) reg = 'all';
      reqs.push({ k, reg, n: pick(T[k].n[reg === 'all' ? 0 : 1]) });
    }
    reqs.sort((a, b) => (a.reg === 'all' ? 0 : 1) - (b.reg === 'all' ? 0 : 1));
    return { reqs, bake: pick(['light', 'reg', 'reg', 'well']), cut: pick([4, 6, 6, 8, 8]) };
  }
  function buildShift() {
    G.custs = []; G.orders = []; G.arrivals = [];
    const un = new Set(unlocked());
    const regs = shuffle(REGULARS.filter(r => r.order.reqs.every(q => un.has(q.k)))).slice(0, 2);
    const slots = shuffle([1, 2, 3, 4, 5, 6, 7]).slice(0, regs.length);
    const names = shuffle(NAMES.slice());
    let t = 2;
    for (let i = 0; i < SHIFT; i++) {
      const ri = slots.indexOf(i), reg = ri >= 0 ? regs[ri] : null;
      G.custs.push({ id: i + 1, name: reg ? reg.name : names[i], look: reg ? reg.look : randomLook(), hi: reg ? reg.hi : pick(['Hi! Can I get…', 'Hey there. I’ll have…', 'One pie, please:', 'Okay, I’m starving:', 'Let me get…']),
        order: reg ? JSON.parse(JSON.stringify(reg.order)) : makeOrder(i), state: 'out', x: -0.15, f: 0.95, s: 1, arriveT: 0, seat: -1, seed: Math.random() * 9, bob: 0 });
      G.arrivals.push(t);
      t += Math.max(24, 48 - i * 3.2) * Math.max(0.78, 1 - (save.day - 1) * 0.04) + rand(-4, 4);
    }
    G.nextIdx = 0;
  }
  const inLine = () => G.custs.filter(q => q.state === 'line' || q.state === 'enter');
  const waiting = () => G.custs.filter(q => q.state === 'wait' || q.state === 'seat');
  function takeOrder() {
    const q = inLine()[0];
    if (!q || q.state !== 'line' || G.bubble) return false;
    q.state = 'order'; q.takenT = G.t;
    const o = { id: q.id, cust: q, ...q.order, status: 'new', pz: null, img: ticketImage(q.order, 104) };
    q.ticket = o; G.orders.push(o); G.bubble = { q, t: 0 }; dirtyRail = 'drop'; dirtyTray = true;
    if (!G.sel) G.sel = o;
    sfx('click');
    return true;
  }
  function endBubble() {
    const b = G.bubble; if (!b) return; G.bubble = null;
    const used = new Set(G.custs.filter(q => q.seat >= 0 && (q.state === 'seat' || q.state === 'wait')).map(q => q.seat));
    let s = 0; while (used.has(s)) s++;
    b.q.seat = s; b.q.state = 'seat'; dirtyTray = true;
  }

  /* ---------------- tickets */
  function ticketImage(o, size) {
    const cvs = document.createElement('canvas'); cvs.width = cvs.height = size; const x = cvs.getContext('2d'), h = size / 2, R = size * 0.46;
    x.fillStyle = '#e7c48a'; x.beginPath(); x.arc(h, h, R, 0, TAU); x.fill();
    x.fillStyle = '#c2452b'; x.beginPath(); x.arc(h, h, R * 0.84, 0, TAU); x.fill();
    x.fillStyle = '#f5d77a'; x.beginPath(); x.arc(h, h, R * 0.78, 0, TAU); x.fill();
    if (o.reqs.some(q => q.reg !== 'all')) { x.strokeStyle = 'rgba(80,40,10,.5)'; x.setLineDash([3, 3]); x.lineWidth = 1.5; x.beginPath(); x.moveTo(h, h - R); x.lineTo(h, h + R); x.stroke(); x.setLineDash([]); }
    const spots = { all: [[0, -0.52], [0.45, -0.26], [0.45, 0.26], [0, 0.52], [-0.45, 0.26], [-0.45, -0.26], [0, 0]], L: [[-0.5, -0.38], [-0.58, 0.1], [-0.28, 0.45], [-0.25, -0.05]], R: [[0.5, -0.38], [0.58, 0.1], [0.28, 0.45], [0.25, -0.05]] };
    let allIdx = 0;
    for (const q of o.reqs) {
      let pts = spots[q.reg];
      if (q.reg === 'all') { const rot = allIdx++ * 0.5, sc = allIdx > 1 ? 0.62 : 1; pts = pts.map(([a, b]) => [(a * Math.cos(rot) - b * Math.sin(rot)) * sc, (a * Math.sin(rot) + b * Math.cos(rot)) * sc]); if (allIdx > 1) pts = pts.slice(0, 6); }
      const s = T[q.k].r * R * 2.6 * SPR / 104;
      for (const [a, b] of pts) x.drawImage(SPRITES[q.k][0], h + a * R - s / 2, h + b * R - s / 2, s, s);
    }
    return cvs.toDataURL();
  }
  const pieLines = o => o.reqs.map(q => `<li><img src="${ICONS[q.k]}" alt=""><span>${T[q.k].name}</span><em title="${REG[q.reg].name}">${REG[q.reg].glyph}</em><b>×${q.n}</b></li>`).join('');
  function statusOf(o) { return o.status === 'build' ? ['build', 'BUILDING'] : o.status === 'oven' ? ['oven', 'IN OVEN'] : o.status === 'cut' ? ['cut', 'CUTTING'] : ['', 'NEW']; }
  function moodColor(p) { return p > 75 ? '#35c27a' : p > 50 ? '#f2b441' : '#e5544b'; }
  function renderRail() {
    const rail = $('#pzRail'), drop = dirtyRail === 'drop'; dirtyRail = false;
    const live = G.orders.filter(o => o.status !== 'done');
    rail.innerHTML = live.map(o => { const [cl, tx] = statusOf(o); return `<div class="tk${G.sel === o ? ' sel' : ''}${drop && o === live[live.length - 1] && o.status === 'new' ? ' drop' : ''}" data-id="${o.id}">
      <img class="pie" src="${o.img}" alt=""><div class="tkB"><div class="tkH"><span>#${o.id} ${esc(o.cust.name)}</span></div>
      <span class="stt ${cl}">${tx}</span><div class="tkF"><span>🔥 ${BAKE[o.bake].name}</span><span>🔪 ${o.cut}</span></div><i class="pat"><s></s></i></div></div>`; }).join('');
    rail.querySelectorAll('.tk').forEach(el => el.addEventListener('click', () => pickTicket(G.orders.find(o => o.id === +el.dataset.id))));
    patience();
  }
  function patience() {
    const els = root.querySelectorAll('#pzRail .tk, #pzPin');
    els.forEach(el => { const o = G.orders.find(q => q.id === +el.dataset.id); const s = el.querySelector('.pat s'); if (!o || !s) return; const p = waitScore(o, G.t - o.cust.arriveT); s.style.width = p + '%'; s.style.background = moodColor(p); });
  }
  function pickTicket(o) {
    if (!o) return;
    G.sel = o;
    if (G.station === 'build' && !G.board && o.status === 'new') startPizza(o);
    else if (o.status === 'oven') setStation('bake');
    else if (o.status === 'cut') { if (G.cutBoard !== o.pz && (!G.cutBoard || !G.cutBoard.cuts.length)) { if (G.cutBoard) G.cutQ.push(G.cutBoard); G.cutQ = G.cutQ.filter(p => p !== o.pz); G.cutBoard = o.pz; } setStation('cut'); }
    else if (o.status === 'new' && G.station !== 'build') { setStation('build'); if (!G.board) startPizza(o); }
    dirtyRail = true; dirtyTray = true;
  }
  function renderPin() {
    const pin = $('#pzPin'), pz = G.station === 'build' ? G.board : G.station === 'cut' ? G.cutBoard : null, o = pz?.order;
    if (!o) { pin.classList.add('hidden'); pin.dataset.id = ''; return; }
    if (pin.dataset.id === String(o.id) && !pin.classList.contains('hidden')) return;
    pin.dataset.id = o.id; pin.classList.remove('hidden');
    pin.innerHTML = `<img class="pie" src="${o.img}" alt=""><div style="flex:1;min-width:0"><h4><span>#${o.id} ${esc(o.cust.name)}</span></h4><ul>${pieLines(o)}</ul>
      <div class="pinF"><span>🔥 ${BAKE[o.bake].name}</span><span>🔪 ${o.cut} slices</span></div><i class="pat"><s></s></i></div>`;
    layout();
  }

  /* ---------------- stations */
  function setStation(st) {
    if (G.station === st) return;
    G.station = st; G.stretching = false; G.painting = null; G.cutDrag = null; G.ptr = null; dirtyTray = true;
    if (st === 'build' && !G.board) { const o = G.sel?.status === 'new' ? G.sel : G.orders.find(q => q.status === 'new'); if (o) startPizza(o); }
    root.querySelectorAll('#pzTabs button').forEach(b => b.classList.toggle('on', b.dataset.st === st));
    renderPin(); layout(); sfx('click');
  }
  function startPizza(o) {
    if (G.board || o.status !== 'new') return;
    G.board = newPizza(o); o.pz = G.board; o.status = 'build'; G.tool = 'dough'; G.sel = o; dirtyRail = true; dirtyTray = true; renderPin();
  }
  function trashPizza() {
    const pz = G.board; if (!pz) return;
    pz.order.status = 'new'; pz.order.pz = null; G.board = null; G.stretching = false; G.painting = null; dirtyRail = true; dirtyTray = true; renderPin();
    say('Into the bin', W / 2, H / 2, '#ffb3a8'); sfx('tear');
  }
  function toOven() {
    const pz = G.board; if (!pz) return false;
    if (pz.d < 0.75 || pz.torn) { say('Stretch the dough first', L.cx, L.cy, '#ffd27a'); return false; }
    const i = G.ovens.indexOf(null); if (i < 0) { say('The oven is full', L.cx, L.cy, '#ffb3a8'); sfx('warn'); return false; }
    G.ovens[i] = { pz, rot: 0, fireA: true, rotT: 1, rotFrom: 0, ding: false, warn: false, smoke: 0 };
    pz.order.status = 'oven'; pz.inOven = true; G.board = null; dirtyRail = true; dirtyTray = true; renderPin(); sfx('whoosh'); refreshSlots();
    setStation('bake');
    return true;
  }
  function turn(i) {
    const s = G.ovens[i]; if (!s || s.rotT < 1) return;
    s.rotFrom = s.rot; s.rot += Math.PI; s.rotT = 0; s.fireA = !s.fireA;
    s.pz.turns.push(((s.pz.bakeA + s.pz.bakeB) / 2) / BAKE[s.pz.order.bake].t); sfx('whoosh');
  }
  function pull(i) {
    const s = G.ovens[i]; if (!s) return;
    G.ovens[i] = null; s.pz.inOven = false; s.pz.order.status = 'cut';
    const avg = (s.pz.bakeA + s.pz.bakeB) / 2, t = BAKE[s.pz.order.bake].t, sl = slotPos(i);
    say(avg > 1 ? 'Burnt!' : Math.abs(avg - t) <= PERFECT ? 'Perfect bake!' : avg < t ? 'A bit pale' : 'A bit dark', sl.x, sl.y - sl.r * 1.2, Math.abs(avg - t) <= PERFECT ? '#9ff0bf' : '#ffd27a');
    if (!G.cutBoard) G.cutBoard = s.pz; else G.cutQ.push(s.pz);
    dirtyRail = true; dirtyTray = true; sfx('plop'); refreshSlots();
  }
  function undo() {
    const pz = G.board; if (!pz || !pz.tops.length) return;
    pz.tops.pop(); pz.ver++; dirtyTray = true; sfx('click');
  }
  function serve() {
    const pz = G.cutBoard; if (!pz) return false; G.cutAnim = null;
    const o = pz.order, q = o.cust, secs = G.t - q.arriveT;
    const b = scoreBuild(pz), k = scoreBake(pz), ct = scoreCut(pz), w = waitScore(o, secs);
    const total = 0.15 * w + 0.4 * b.score + 0.25 * k.score + 0.2 * ct.score;
    G.streak = total >= 85 ? G.streak + 1 : 0;
    const mult = 1 + 0.1 * Math.min(Math.max(0, G.streak - 1), 5);
    const tip = Math.round((1.5 + 0.6 * o.reqs.length) * Math.pow(total / 100, 1.5) * mult * 100) / 100;
    G.tips += tip; G.points += Math.round(total); G.served++;
    o.status = 'done'; q.state = 'served';
    G.cutBoard = G.cutQ.shift() || null;
    const res = { o, q, secs, w, b, k, ct, total, tip, streak: G.streak, mult, cuts: pz.cuts.slice(), pz };
    G.results.push(res); dirtyRail = true; dirtyTray = true; renderPin();
    showRating(res); sfx('cash');
    return res;
  }

  /* ---------------- floating words */
  function say(text, x, y, color = '#fff') {
    const el = document.createElement('div'); el.textContent = text; el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.color = color;
    $('#pzMsg').appendChild(el); setTimeout(() => el.remove(), 1350);
  }

  /* ---------------- layout */
  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); bg = {}; }
    const wide = W >= 860, top = $('#pzTop').getBoundingClientRect().bottom, tabs = $('#pzTabs').getBoundingClientRect().top;
    const tray = $('#pzTray'), pin = $('#pzPin');
    tray.style.top = wide ? top + 'px' : ''; tray.style.bottom = wide ? (H - tabs) + 'px' : (H - tabs) + 'px';
    const tr = tray.getBoundingClientRect();
    let x0 = 0, x1 = wide ? tr.left : W, y0 = top, y1 = wide ? tabs : tr.top;
    pin.style.top = (top + 12) + 'px';
    const pinOn = !pin.classList.contains('hidden'), pr = pin.getBoundingClientRect();
    L = { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, wide };
    let ax0 = x0, ay0 = y0;
    if (pinOn) { if (wide) ax0 = pr.right + 8; else ay0 = pr.bottom + 4; }
    L.cx = (ax0 + x1) / 2; L.cy = (ay0 + y1) / 2;
    L.R = Math.max(40, Math.min((x1 - ax0) * 0.4, (y1 - ay0) * 0.4));
    placeSlots();
  }
  function slotPos(i) {
    const cols = L.w < 600 ? 2 : 4, rows = SLOTS / cols, cw = L.w / cols, top = cols === 2 ? 86 : 70, rh = (L.h - top) / rows;
    const col = i % cols, row = Math.floor(i / cols), r = Math.max(28, Math.min(cw * 0.36, rh * 0.3));
    return { x: L.x0 + cw * (col + 0.5), y: L.y0 + top + rh * (row + 0.5) - r * 0.2, r };
  }
  function placeSlots() {
    const box = $('#pzSlots');
    if (G.station !== 'bake') { box.innerHTML = ''; return; }
    if (!box.children.length) {
      box.innerHTML = G.ovens.map((_, i) => `<div class="slot" data-i="${i}"><button class="turn">↻ Turn</button><button class="pull">Pull ⇩</button></div>`).join('');
      box.querySelectorAll('.slot').forEach(el => { const i = +el.dataset.i; el.querySelector('.turn').onclick = () => turn(i); el.querySelector('.pull').onclick = () => pull(i); });
    }
    box.querySelectorAll('.slot').forEach(el => { const p = slotPos(+el.dataset.i); el.style.left = p.x + 'px'; el.style.top = (p.y + p.r * 1.28 + 8) + 'px'; });
    refreshSlots();
  }
  function refreshSlots() { root.querySelectorAll('#pzSlots .slot').forEach(el => { const s = G.ovens[+el.dataset.i]; el.style.display = s ? '' : 'none'; if (s) el.querySelector('.turn').disabled = s.rotT < 1; }); }

  /* ---------------- the tray: tools and actions for the current station */
  function renderTray() {
    dirtyTray = false;
    const tr = $('#pzTray'), st = G.station;
    if (st === 'order') {
      const n = inLine().filter(q => q.state === 'line').length, w = waiting().length;
      tr.innerHTML = `<h5>Front counter</h5><p class="long">Customers line up here. Take the order, then build it while they wait at the tables.</p>
        <button class="pzBtn" id="tTake" ${n && !G.bubble ? '' : 'disabled'}>🧾 Take order${n > 1 ? ` (${n} in line)` : ''}</button>
        <p>${n ? `${n} in line` : 'Nobody in line'} · ${w} waiting for food · ${G.served}/${SHIFT} served</p>`;
      tr.querySelector('#tTake').onclick = takeOrder;
    } else if (st === 'build') {
      const pz = G.board;
      if (!pz) {
        const fresh = G.orders.filter(o => o.status === 'new');
        tr.innerHTML = `<h5>Prep table</h5><p>${fresh.length ? 'Pick a ticket to start a pie:' : 'No new tickets. Take an order at the counter first.'}</p>
          ${fresh.map(o => `<button class="pzBtn ghost" data-o="${o.id}">#${o.id} ${esc(o.cust.name)}</button>`).join('')}
          ${fresh.length ? '' : '<button class="pzBtn" id="tGoOrder">🧾 Go to the counter</button>'}`;
        tr.querySelectorAll('[data-o]').forEach(b => b.onclick = () => startPizza(G.orders.find(o => o.id === +b.dataset.o)));
        tr.querySelector('#tGoOrder')?.addEventListener('click', () => setStation('order'));
      } else {
        const tool = (id, inner, dis = false) => `<button class="tool${G.tool === id ? ' on' : ''}" data-tool="${id}" ${dis ? 'disabled' : ''}>${inner}</button>`;
        const counts = {}; for (const t of pz.tops) counts[t.k] = (counts[t.k] || 0) + 1;
        if (!L.wide) {
          tr.innerHTML = `<div class="tools">${tool('dough', `<span class="sw" style="background:#f2dcaa"></span><span>Stretch<small id="mDough">0%</small></span>`, pz.locked)}${tool('sauce', `<span class="sw" style="background:#c23a22"></span><span>Sauce<small id="mSauce">0%</small></span>`)}${tool('cheese', `<span class="sw" style="background:#f5d77a"></span><span>Cheese<small id="mCheese">0%</small></span>`)}
              ${unlocked().map(k => tool(k, `<img src="${ICONS[k]}" alt=""><span>${T[k].name}<small>${counts[k] ? counts[k] + ' on' : '&nbsp;'}</small></span>`)).join('')}</div>
            <button class="pzBtn ghost" id="tUndo" ${pz.tops.length ? '' : 'disabled'}>↶ Undo</button><button class="pzBtn ghost" id="tTrash">🗑 Bin</button><button class="pzBtn green" id="tBake" ${pz.d >= 0.75 && !pz.torn ? '' : 'disabled'}>🔥 Oven</button>`;
          const on = tr.querySelector('.tool.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        } else
        tr.innerHTML = `<h5>1 · Dough</h5><div class="tools">${tool('dough', `<span class="sw" style="background:#f2dcaa"></span><span>Stretch<small>hold on the dough</small></span>`, pz.locked)}
            <div class="meter" style="align-self:center"><span>Size</span><b id="mDough">0%</b></div></div>
          <h5>2 · Sauce &amp; cheese</h5><div class="tools">${tool('sauce', `<span class="sw" style="background:#c23a22"></span><span>Sauce<small id="mSauce">0%</small></span>`)}${tool('cheese', `<span class="sw" style="background:#f5d77a"></span><span>Cheese<small id="mCheese">0%</small></span>`)}</div>
          <h5>3 · Toppings</h5><div class="tools">${unlocked().map(k => tool(k, `<img src="${ICONS[k]}" alt=""><span>${T[k].name}<small>${counts[k] ? counts[k] + ' on' : '&nbsp;'}</small></span>`)).join('')}</div>
          <div class="row2"><button class="pzBtn ghost" id="tUndo" ${pz.tops.length ? '' : 'disabled'}>↶ Undo</button><button class="pzBtn ghost" id="tTrash">🗑 Bin it</button></div>
          <button class="pzBtn green" id="tBake" ${pz.d >= 0.75 && !pz.torn ? '' : 'disabled'}>🔥 Into the oven</button>`;
        tr.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => { G.tool = b.dataset.tool; dirtyTray = true; sfx('click'); });
        tr.querySelector('#tUndo').onclick = undo; tr.querySelector('#tTrash').onclick = trashPizza; tr.querySelector('#tBake').onclick = toOven;
      }
    } else if (st === 'bake') {
      tr.innerHTML = `<h5>Wood-fired oven</h5><p>The fire is at the back, so the far side of each pie browns faster. Turn each pie once, about halfway, for an even bake.</p>
        <p>Pull it when the needle is in the <b style="color:#7ee2a8">green</b>. Past 100% it burns.</p>
        <button class="pzBtn ghost" id="tToBuild">🍕 Back to the prep table</button>`;
      tr.querySelector('#tToBuild').onclick = () => setStation('build');
    } else if (st === 'cut') {
      const pz = G.cutBoard;
      tr.innerHTML = `<h5>Cutting board</h5><p>${pz ? `Drag straight across the pie, through the middle. ${pz.order.cut} slices means ${pz.order.cut / 2} cuts, evenly spaced.` : 'Nothing to cut yet. Pull a pie from the oven.'}</p>
        ${pz ? `<div class="meter"><span>Cuts</span><b id="mCuts">${pz.cuts.length} of ${pz.order.cut / 2}</b></div>` : ''}
        <button class="pzBtn green" id="tServe" ${pz ? '' : 'disabled'}>🛎 Serve${pz ? ' ' + esc(pz.order.cust.name) : ''}</button>
        ${G.cutQ.length ? `<p>${G.cutQ.length} more waiting on the rack</p>` : ''}`;
      tr.querySelector('#tServe').onclick = serve;
    }
    layout();
  }
  function liveMeters() {
    const pz = G.board;
    if (G.station === 'build' && pz) {
      const set = (id, txt, ok) => { const e = $('#' + id); if (e && e.textContent !== txt) { e.textContent = txt; if (ok !== undefined) e.className = ok ? 'ok' : ''; } };
      set('mDough', pz.torn ? 'torn!' : Math.round(pz.d * 100) + '%', Math.abs(pz.d - 1) <= 0.04);
      if (uiClock > 0.2) { set('mSauce', Math.round(coverage(pz.sGrid, pz.d).cov * 100) + '% covered'); set('mCheese', Math.round(coverage(pz.cGrid, pz.d).cov * 100) + '% covered'); }
      const bb = $('#tBake'); if (bb) bb.disabled = !(pz.d >= 0.75 && !pz.torn);
    }
  }
  function badges() {
    const em = st => root.querySelector(`#pzTabs [data-st="${st}"] em`);
    const set = (st, n, go) => { const e = em(st); e.textContent = n || ''; e.classList.toggle('show', !!n); e.classList.toggle('go', !!go); };
    set('order', inLine().filter(q => q.state === 'line').length);
    set('build', G.orders.filter(o => o.status === 'new').length);
    const ready = G.ovens.filter(s => s && Math.abs((s.pz.bakeA + s.pz.bakeB) / 2 - BAKE[s.pz.order.bake].t) <= PERFECT).length;
    set('bake', ready || G.ovens.filter(Boolean).length, ready > 0);
    set('cut', (G.cutBoard ? 1 : 0) + G.cutQ.length);
    // the mini oven gauges in the top bar
    const mini = $('#pzOvenMini');
    if (mini.children.length !== SLOTS) mini.innerHTML = G.ovens.map(() => '<i><u></u><b></b></i>').join('');
    G.ovens.forEach((s, i) => {
      const el = mini.children[i], b = el.querySelector('b'), u = el.querySelector('u');
      if (!s) { b.style.height = '0'; u.style.display = 'none'; el.className = ''; return; }
      const avg = (s.pz.bakeA + s.pz.bakeB) / 2, t = BAKE[s.pz.order.bake].t;
      b.style.height = Math.min(100, avg * 100) + '%'; u.style.display = 'block'; u.style.bottom = `calc(${t * 100}% - 1px)`;
      el.className = avg > 1 ? 'burn' : Math.abs(avg - t) <= PERFECT ? 'hot' : '';
    });
    refreshSlots();
    $('#pzServed').textContent = `${G.served}/${SHIFT}`; $('#pzTips').textContent = `$${G.tips.toFixed(2)}`;
  }

  /* ---------------- modals */
  function modal(html, dark = false) {
    G.modal = true; const card = $('#pzCard'); card.className = 'pzCard' + (dark ? ' dark' : ''); card.innerHTML = html; $('#pzModal').classList.remove('hidden'); card.scrollTop = 0;
    G.stretching = false; G.painting = null; G.cutDrag = null;
  }
  function closeModal() { G.modal = null; $('#pzModal').classList.add('hidden'); }
  function intro() {
    const fresh = KEYS.filter(k => T[k].day === save.day && save.day > 1);
    modal(`<h2>Moore’s Pizzeria</h2><p><b>Day ${save.day}.</b> ${SHIFT} hungry customers are on their way. Every pie gets scored, so make them count.${save.best ? ` Your best shift so far: <b>${save.best} pts</b>.` : ''}</p>
      ${fresh.length ? `<div class="unlock">New today: ${fresh.map(k => `<img src="${ICONS[k]}" alt=""> ${T[k].name}`).join(' &nbsp;')}</div>` : ''}
      <ol>${HOWTO.slice(0, 5).map(h => `<li>${h}</li>`).join('')}</ol><p style="font-size:13px;color:#7a5f45">${HOWTO[5]}</p>
      <div class="acts"><button class="pzBtn" id="mStart">Open the shop</button><button class="pzBtn ghost" style="color:#2a1d12;border-color:#d8c8ae" id="mLeave">Back to the kitchen</button></div>`);
    $('#mStart').onclick = () => { closeModal(); G.running = true; sfx('bell'); };
    $('#mLeave').onclick = () => ctx.exit?.();
  }
  function pause() {
    if (G.modal) return;
    G.paused = true;
    modal(`<h2>Paused</h2><p>Day ${save.day} · ${G.served}/${SHIFT} served · $${G.tips.toFixed(2)} in tips. The oven waits for you.</p>
      <div class="acts"><button class="pzBtn" id="mResume">Keep cooking</button><button class="pzBtn ghost" style="color:#2a1d12;border-color:#d8c8ae" id="mHow">How to play</button></div>
      <div id="mHowBox" class="hidden"><ul class="how">${HOWTO.map(h => `<li>${h}</li>`).join('')}</ul></div>
      <div class="acts"><button class="pzBtn red" id="mQuit">Close up (leave the shift)</button></div>`);
    $('#mResume').onclick = resume; $('#mHow').onclick = () => $('#mHowBox').classList.toggle('hidden');
    $('#mQuit').onclick = () => ctx.exit?.();
  }
  function resume() { closeModal(); G.paused = false; }
  function grade(s) { return s >= 95 ? ['perfect', 'Perfect!'] : s >= 85 ? ['great', 'Great'] : s >= 72 ? ['good', 'Good'] : s >= 55 ? ['ok', 'Okay'] : ['bad', 'Not great']; }
  function showRating(r) {
    const [g, word] = grade(r.total);
    const worst = [['wait', r.w, 'Took a while, though.'], ['build', r.b.score, r.b.parts.tops < 0.6 ? 'The toppings are all over the place.' : 'The build was a little sloppy.'], ['bake', r.k.score, r.k.word === 'burnt' ? 'And it’s burnt!' : r.k.word === 'underdone' ? 'It’s a bit doughy.' : r.k.word === 'overdone' ? 'A little too crispy.' : 'One side’s darker than the other.'], ['cut', r.ct.score, 'The slices are a mess.']].sort((a, b) => a[1] - b[1])[0];
    const quote = pick(LINES[g]) + (r.total < 95 && worst[1] < 75 ? ' ' + worst[2] : '');
    const li = (d) => d.map(([n, t, v]) => `<li class="${v >= 0.85 ? 'good' : v >= 0.5 ? 'meh' : 'bad'}"><b>${esc(n)}:</b> ${esc(t)}</li>`).join('');
    modal(`<div class="rateHead"><canvas width="152" height="152" id="rFace"></canvas><div><small>Ticket #${r.o.id} · ${word}</small><h3>${esc(r.q.name)}</h3><q>${esc(quote)}</q></div></div>
      <div class="ratePie"><canvas width="340" height="340" id="rPie"></canvas></div>
      ${[['Wait', r.w], ['Build', r.b.score], ['Bake', r.k.score], ['Cut', r.ct.score]].map(([n, v]) => `<div class="rr"><span>${n}</span><i><s data-w="${v.toFixed(1)}"></s></i><b>${Math.round(v)}</b></div>`).join('')}
      <div class="rateTot"><span>${word} · <big>${Math.round(r.total)}%</big></span><span>Tip $${r.tip.toFixed(2)}${r.mult > 1 ? ` · streak ×${r.mult.toFixed(1)}` : ''}</span></div>
      <details class="rateMore"><summary>How it was scored</summary><ul><li class="${r.w >= 85 ? 'good' : r.w >= 50 ? 'meh' : 'bad'}"><b>Wait:</b> ${mmss(r.secs)} (under ${mmss(idealWait(r.o))} is perfect)</li>${li(r.b.det)}${li(r.k.det)}${li(r.ct.det)}</ul></details>
      <div class="acts"><button class="pzBtn" id="rOk">${G.served >= SHIFT ? 'Close up for the day ▶' : 'Next ▶'}</button></div>`);
    const fc = $('#rFace').getContext('2d'); fc.fillStyle = '#f1e4cc'; fc.fillRect(0, 0, 152, 152); drawPerson(fc, 76, 436, 380, r.q.look, r.total / 100, 0, { seed: r.q.seed });
    const pc = $('#rPie').getContext('2d'); drawPie(pc, r.pz, 170, 170, 140);
    requestAnimationFrame(() => requestAnimationFrame(() => root.querySelectorAll('.rr s').forEach(s => (s.style.width = s.dataset.w + '%'))));
    $('#rOk').onclick = () => { closeModal(); r.q.state = 'leave'; if (G.served >= SHIFT) endShift(); };
  }
  function endShift() {
    G.running = false;
    const n = G.results.length, avg = n ? G.results.reduce((s, r) => s + r.total, 0) / n : 0, best = G.results.reduce((m, r) => (r.total > (m?.total ?? -1) ? r : m), null);
    const perfect = G.results.filter(r => r.total >= 95).length, newBest = G.points > save.best;
    save.best = Math.max(save.best, G.points); save.served += n; save.tips = Math.round((save.tips + G.tips) * 100) / 100; save.shifts++; const dayWas = save.day; save.day++; storeSave(save);
    ctx.onRecord?.(save);
    const next = KEYS.filter(k => T[k].day === save.day);
    modal(`<h2>Day ${dayWas}: closed</h2><p>${newBest ? '<b>A new best shift!</b> ' : ''}${esc(pick(['The dining room is empty and the oven is glowing.', 'Great shift. The regulars will be back.', 'Flour everywhere. Worth it.']))}</p>
      <div class="endGrid"><div><small>Points</small><b>${G.points}</b></div><div><small>Average pie</small><b>${Math.round(avg)}%</b></div>
        <div><small>Tips</small><b>$${G.tips.toFixed(2)}</b></div><div><small>Perfect pies</small><b>${perfect}/${n}</b></div></div>
      ${best ? `<p style="color:#b9b2a5;font-size:13.5px">Best pie: #${best.o.id} for ${esc(best.q.name)}, ${Math.round(best.total)}%.</p>` : ''}
      ${next.length ? `<p style="font-size:13.5px">Tomorrow: ${next.map(k => T[k].name).join(' and ')} join the menu.</p>` : ''}
      <div id="pzLB"></div>
      <div class="acts"><button class="pzBtn" id="eNext">Start day ${save.day} ▶</button><button class="pzBtn ghost" id="eLeave">Back to the kitchen</button></div>`, true);
    ctx.scoreUI?.($('#pzLB'), G.points);
    $('#eNext').onclick = () => { closeModal(); reset(); intro(); };
    $('#eLeave').onclick = () => ctx.exit?.();
  }
  function reset() {
    G.t = 0; G.running = false; G.board = null; G.ovens = G.ovens.map(() => null); G.cutQ = []; G.cutBoard = null; G.cutAnim = null; G.bubble = null;
    G.served = 0; G.tips = 0; G.points = 0; G.streak = 0; G.results = []; G.sel = null; G.station = '';
    $('#pzDay').textContent = `Day ${save.day} · best ${save.best} pts`;
    buildShift(); setStation('order'); dirtyRail = true; dirtyTray = true; renderPin();
  }

  /* ---------------- simulation */
  function sim(dt) {
    G.t += dt;
    // arrivals: on schedule, or right away if the shop is empty
    if (G.nextIdx < SHIFT) {
      const idle = !inLine().length && G.orders.every(o => o.status === 'done');
      if (idle) G.arrivals[G.nextIdx] = Math.min(G.arrivals[G.nextIdx], G.t + 2.5);
      if (G.t >= G.arrivals[G.nextIdx]) { const q = G.custs[G.nextIdx++]; q.state = 'enter'; q.arriveT = G.t; q.x = -0.12; dirtyTray = true; sfx('bell'); }
    }
    for (const q of G.custs) if (q.state === 'enter' && Math.abs(q.x - lineX(q)) < 0.004) { q.state = 'line'; dirtyTray = true; }
    if (G.bubble) { G.bubble.t += dt; if (G.bubble.t > 2.8) endBubble(); }
    // the dough stretches while you hold it, faster the longer you hold
    const pz = G.board;
    if (pz && G.stretching && !pz.torn && !pz.locked) {
      G.hold += dt; pz.d += (0.35 + 0.6 * G.hold) * dt * 0.62; pz.ver++;
      if (pz.d > 1.14) { pz.torn = true; pz.tornT = 0; G.stretching = false; pz.ver++; say('It tore!', L.cx, L.cy - L.R * 0.2, '#ffb3a8'); sfx('tear'); dirtyTray = true; }
    }
    if (pz && pz.torn) { pz.tornT += dt; if (pz.tornT > 1.1) { const o = pz.order; G.board = newPizza(o); o.pz = G.board; G.tool = 'dough'; dirtyTray = true; say('Fresh dough', L.cx, L.cy, '#ffe9b0'); } }
    // the oven
    G.ovens.forEach((s, i) => {
      if (!s) return;
      const p = s.pz, fa = s.fireA ? 1.3 : 0.7, fb = s.fireA ? 0.7 : 1.3;
      p.bakeA += BAKE_RATE * fa * dt; p.bakeB += BAKE_RATE * fb * dt;
      if (s.rotT < 1) s.rotT = Math.min(1, s.rotT + dt / 0.35);
      const avg = (p.bakeA + p.bakeB) / 2, t = BAKE[p.order.bake].t;
      if (!s.ding && avg >= t - PERFECT) { s.ding = true; sfx('ding'); if (G.station !== 'bake') say(`#${p.order.id} is ready to pull`, W / 2, L.y0 + 30, '#9ff0bf'); }
      if (!s.warn && avg > t + PERFECT + 0.05) { s.warn = true; sfx('warn'); }
      if (avg > 0.95) s.smoke += dt;
    });
    if (G.cutAnim) { G.cutAnim.t += dt; if (G.cutAnim.t > 0.24) G.cutAnim = null; }
    // walking about: everyone eases toward where their state says they should be
    for (const q of G.custs) {
      if (q.state === 'out' || q.state === 'gone') continue;
      let tx, tf, ts;
      if (q.state === 'enter' || q.state === 'line' || q.state === 'order') { tx = lineX(q); tf = standF(); ts = lineScale(q); }
      else if (q.state === 'leave') { tx = 1.25; tf = 0.92; ts = 0.8; }
      else { const p = seatPos(q.seat); tx = p.x; tf = 0.76 + p.y * 0.6; ts = p.s * 0.72; }
      const dx = tx - q.x, moving = Math.abs(dx) > 0.003;
      q.x += clamp(dx, -0.36 * dt, 0.36 * dt);
      const k = Math.min(1, dt * 3); q.f = lerp(q.f, tf, k); q.s = lerp(q.s, ts, k);
      q.bob = moving ? q.bob + dt * 10 : 0;
      if (q.state === 'seat' && !moving) q.state = 'wait';
      if (q.state === 'leave' && q.x > 1.15) q.state = 'gone';
    }
  }
  // people are drawn hBase tall; the front of the line shows them from the hips up over the counter (top at 0.74 of the stage)
  function hbFrac() { return L ? Math.min(0.62, L.w * 0.42 / L.h) : 0.62; }
  function standF() { return 0.74 + hbFrac() * 0.32; }
  function lineX(q) { const ln = G.custs.filter(c2 => c2.state === 'enter' || c2.state === 'line' || c2.state === 'order'); const i = ln.indexOf(q); return 0.36 - i * 0.12; }
  function lineScale(q) { const ln = G.custs.filter(c2 => c2.state === 'enter' || c2.state === 'line' || c2.state === 'order'); return Math.pow(0.86, Math.max(0, ln.indexOf(q))); }
  function seatPos(s) {
    if (L && L.w < 640) { const col = s % 2, row = Math.floor(s / 2); return { x: 0.68 + col * 0.18 + (row % 2) * 0.06, y: -0.26 + row * 0.075, s: 0.55 + row * 0.05 }; }
    const col = s % 4, row = Math.floor(s / 4); return { x: 0.63 + col * 0.1 + row * 0.045, y: -0.2 + row * 0.12, s: 0.6 + row * 0.08 };
  }

  /* ---------------- drawing */
  let bg = {};
  function cached(name, w, h, draw) {
    const key = `${name}|${Math.round(w)}|${Math.round(h)}`;
    if (bg[name]?.key === key) return bg[name].cv;
    const cvs = document.createElement('canvas'); cvs.width = Math.max(1, Math.round(w * dpr)); cvs.height = Math.max(1, Math.round(h * dpr));
    const x = cvs.getContext('2d'); x.scale(dpr, dpr); draw(x, w, h); bg[name] = { key, cv: cvs }; return cvs;
  }
  function wood(x, w, h, base, seed) {
    const r = rng(seed); x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 34) { x.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`; x.fillRect(0, y, w, 2); for (let i = 0; i < 6; i++) { x.strokeStyle = `rgba(${r() < 0.5 ? '255,230,190' : '60,30,10'},${0.05 + r() * 0.06})`; x.lineWidth = 1 + r() * 2; x.beginPath(); const gy = y + 4 + r() * 26; x.moveTo(0, gy); x.bezierCurveTo(w * 0.3, gy + r() * 8 - 4, w * 0.7, gy + r() * 8 - 4, w, gy); x.stroke(); } }
  }
  function draw() {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#1d140d'; c.fillRect(0, 0, W, H);
    if (!L) return;
    c.save(); c.beginPath(); c.rect(L.x0, L.y0, L.w, L.h); c.clip();
    if (G.station === 'order') drawOrder(); else if (G.station === 'build') drawBuild(); else if (G.station === 'bake') drawBake(); else if (G.station === 'cut') drawCut();
    c.restore();
  }
  function drawOrder() {
    const { x0, y0, w, h } = L;
    c.drawImage(cached('shop', w, h, (x, W2, H2) => {
      const g = x.createLinearGradient(0, 0, 0, H2); g.addColorStop(0, '#6b3a24'); g.addColorStop(0.55, '#8a5232'); g.addColorStop(1, '#5a301c'); x.fillStyle = g; x.fillRect(0, 0, W2, H2);
      x.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < W2; i += 46) x.fillRect(i, 0, 3, H2 * 0.62);                         // panelling
      x.fillStyle = '#f2e6cf'; x.fillRect(0, H2 * 0.62, W2, H2 * 0.38);                                                          // tiled floor
      { const ts = H2 * 0.38 / 6; x.fillStyle = '#2b2622'; for (let j = 0; j < 7; j++) for (let i = 0; i * ts < W2; i++) if ((i + j) % 2) x.fillRect(i * ts, H2 * 0.62 + j * ts, ts, ts); }
      x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(0, H2 * 0.62, W2, 6);
      // menu board + sign
      const mw = Math.min(W2 * 0.4, 420), mx = W2 * 0.06, my = H2 * 0.06, mh = H2 * 0.26;
      x.fillStyle = '#1f2a24'; x.fillRect(mx, my, mw, mh); x.strokeStyle = '#8c5a2b'; x.lineWidth = 8; x.strokeRect(mx, my, mw, mh);
      x.fillStyle = '#f6efe0'; x.font = `700 ${Math.round(mh * 0.16)}px Georgia, serif`; x.textAlign = 'center'; x.fillText('MENU', mx + mw / 2, my + mh * 0.22, mw - 20);
      x.font = `600 ${Math.round(mh * 0.095)}px ui-sans-serif, system-ui, sans-serif`; x.textAlign = 'left';
      ['Build your own pie', 'Light · Regular · Well done', '4 · 6 · 8 slices', 'Made with love on Story St.'].forEach((s, i) => x.fillText(s, mx + 16, my + mh * (0.42 + i * 0.15), mw - 28));
      const sx = W2 * 0.55, sw = Math.min(W2 * 0.4, 440); x.fillStyle = '#2a1608'; x.fillRect(sx, my, sw, mh * 0.42);
      x.font = `700 ${Math.round(mh * 0.17)}px Georgia, serif`; x.textAlign = 'center'; x.shadowColor = '#ff9a3a'; x.shadowBlur = 14; x.fillStyle = '#ffcf6e'; x.fillText('MOORE’S PIZZERIA', sx + sw / 2, my + mh * 0.29, sw - 24); x.shadowBlur = 0;
    }), x0, y0, w, h);
    // tables in front of seated people, people, then the counter on top
    const hBase = h * hbFrac();
    const items = G.custs.filter(q => q.state !== 'out' && q.state !== 'gone').map(q => ({ z: q.f, q }));
    for (let s2 = 0; s2 < 8; s2++) { const p = seatPos(s2); items.push({ z: 0.76 + p.y * 0.6 + 0.001, table: p }); }
    items.sort((a, b) => a.z - b.z);
    for (const it of items) {
      if (it.table) {                                                     // a little bistro table; whoever sits here is behind it
        const p = it.table, px = x0 + p.x * w, feet = y0 + h * it.z, ph = hBase * p.s * 0.72;
        c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(px, feet, ph * 0.16, ph * 0.035, 0, 0, TAU); c.fill();
        c.fillStyle = '#3a2416'; c.fillRect(px - ph * 0.025, feet - ph * 0.42, ph * 0.05, ph * 0.42); c.fillRect(px - ph * 0.12, feet - ph * 0.025, ph * 0.24, ph * 0.025);
        c.fillStyle = '#c23a22'; c.fillRect(px - ph * 0.22, feet - ph * 0.43, ph * 0.44, ph * 0.05); c.fillStyle = '#f6efe0'; c.beginPath(); c.ellipse(px, feet - ph * 0.43, ph * 0.22, ph * 0.05, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(194,58,34,.5)'; for (let k = -1; k <= 1; k++) c.fillRect(px + k * ph * 0.1 - 1, feet - ph * 0.47, 2, ph * 0.08);
        continue;
      }
      const q = it.q;
      const seated = q.state === 'wait' || q.state === 'served';
      const px = x0 + q.x * w, feet = y0 + h * q.f, ph = hBase * q.s;
      const wait = q.ticket ? waitScore(q.ticket, G.t - q.arriveT) : q.arriveT ? waitScore(q.order, G.t - q.arriveT) : 100;
      drawPerson(c, px, feet - Math.abs(Math.sin(q.bob)) * ph * 0.02, ph, q.look, q.state === 'leave' ? 0.9 : wait / 100, G.anim, { seed: q.seed });
      if (seated) {
        if (q.state !== 'served') {                                         // patience over their head
          const bw = ph * 0.42, by = feet - ph * 1.17; c.fillStyle = 'rgba(0,0,0,.45)'; c.fillRect(px - bw / 2, by, bw, 6); c.fillStyle = moodColor(wait); c.fillRect(px - bw / 2, by, bw * wait / 100, 6);
          c.fillStyle = '#fff'; c.font = `800 ${Math.max(10, ph * 0.07)}px ui-sans-serif, system-ui`; c.textAlign = 'center'; c.fillText(`#${q.id}`, px, by - 4);
        }
      }
    }
    // the counter, with a register and a pizza stand
    const cy = y0 + h * 0.74;
    c.fillStyle = '#7a4a28'; c.fillRect(x0, cy, w * 0.56, h - (cy - y0)); c.fillStyle = '#d9c3a0'; c.fillRect(x0, cy - 10, w * 0.58, 14);
    c.fillStyle = 'rgba(0,0,0,.15)'; for (let i = 0; i < w * 0.56; i += 60) c.fillRect(x0 + i, cy + 6, 2, h);
    const rx = x0 + w * 0.08, rs = Math.min(h * 0.12, 70);
    c.fillStyle = '#2b2f36'; c.fillRect(rx, cy - rs * 0.9, rs * 1.2, rs * 0.8); c.fillStyle = '#7cf0a8'; c.fillRect(rx + rs * 0.12, cy - rs * 0.8, rs * 0.96, rs * 0.25); c.fillStyle = '#1b1d22'; c.fillRect(rx + rs * 0.12, cy - rs * 0.48, rs * 0.96, rs * 0.3);
    c.fillStyle = '#123'; c.font = `800 ${Math.round(rs * 0.17)}px ui-monospace, monospace`; c.textAlign = 'center'; c.fillText(`$${G.tips.toFixed(2)}`, rx + rs * 0.6, cy - rs * 0.62);
    // front customer: click hint + order bubble
    const front = G.custs.find(q => q.state === 'line' && Math.abs(q.x - 0.36) < 0.01);
    if (front && !G.bubble && G.running) {
      const px = x0 + front.x * w, top = y0 + h * front.f - hBase * 1.02;
      const pulse = 1 + Math.sin(G.anim * 5) * 0.05; c.save(); c.translate(px + hBase * 0.25, top); c.scale(pulse, pulse);
      c.fillStyle = '#fff'; rrect(c, -50, -22, 100, 34, 12); c.fill(); c.fillStyle = '#2a1d12'; c.font = '800 14px ui-sans-serif, system-ui'; c.textAlign = 'center'; c.fillText(ctx.touch ? 'Tap to order' : 'Click to order', 0, 0); c.restore();
    }
    if (G.bubble) drawBubble(G.bubble.q, x0 + G.bubble.q.x * w, y0 + h * G.bubble.q.f - hBase * 0.98, hBase);
    if (!G.running && !G.modal && G.served === 0) { c.fillStyle = 'rgba(0,0,0,.4)'; c.fillRect(x0, y0, w, h); }
  }
  function drawBubble(q, px, py, hb) {
    const o = q.order, lines = o.reqs.length + 2, bw = Math.min(300, L.w - 16), lh = 24, bh = 36 + lines * lh, bx = clamp(px + hb * 0.2, L.x0 + 8, L.x1 - bw - 8), by = clamp(py - bh - 10, L.y0 + 8, L.y1 - bh - 8);
    const appear = clamp(G.bubble.t / 0.18, 0, 1);
    c.save(); c.globalAlpha = appear; c.translate(bx, by);
    c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.15)'; c.lineWidth = 2; rrect(c, 0, 0, bw, bh, 16); c.fill(); c.stroke();
    { const tx = clamp(px - bx, 20, bw - 20); c.beginPath(); c.moveTo(tx - 12, bh - 1); c.lineTo(tx - 4, bh + 16); c.lineTo(tx + 10, bh - 1); c.fill(); }
    c.fillStyle = '#2a1d12'; c.textAlign = 'left'; c.font = 'italic 700 14px ui-sans-serif, system-ui'; c.fillText(q.hi, 14, 24, bw - 28);
    c.font = '700 14px ui-sans-serif, system-ui';
    o.reqs.forEach((r, i) => { const yy = 30 + i * lh; c.drawImage(SPRITES[r.k][0], 14, yy, 20, 20); c.fillText(`${r.n} ${T[r.k].name.toLowerCase()} · ${REG[r.reg].name}`, 40, yy + 15, bw - 54); });
    const yy = 30 + o.reqs.length * lh; c.fillText(`🔥 ${BAKE[o.bake].name}   🔪 ${o.cut} slices`, 14, yy + 15);
    c.fillStyle = '#8a6a4a'; c.font = '600 11px ui-sans-serif, system-ui'; c.fillText('ticket’s on the rail ↑', 14, yy + 15 + lh);
    c.restore();
  }
  function drawBuild() {
    const { x0, y0, w, h } = L;
    c.drawImage(cached('prep', w, h, (x, W2, H2) => {
      wood(x, W2, H2, '#c9a77a', 5);
      const g = x.createRadialGradient(W2 / 2, H2 / 2, 10, W2 / 2, H2 / 2, Math.max(W2, H2) * 0.7); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.28)'); x.fillStyle = g; x.fillRect(0, 0, W2, H2);
      const r = rng(11); x.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 260; i++) { x.beginPath(); x.arc(W2 / 2 + (r() - 0.5) * W2 * 0.7, H2 / 2 + (r() - 0.5) * H2 * 0.8, r() * 2.2, 0, TAU); x.fill(); }   // flour
    }), x0, y0, w, h);
    const pz = G.board, { cx, cy, R } = L;
    // marble slab under the dough
    c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(cx + 4, cy + 7, R * 1.22, 0, TAU); c.fill();
    c.fillStyle = '#ece8e1'; c.beginPath(); c.arc(cx, cy, R * 1.2, 0, TAU); c.fill(); c.strokeStyle = '#cfc8bd'; c.lineWidth = 3; c.stroke();
    if (!pz) {
      c.fillStyle = '#5a4330'; c.font = `800 ${Math.max(14, R * 0.09)}px ui-sans-serif, system-ui`; c.textAlign = 'center';
      c.fillText(G.orders.some(o => o.status === 'new') ? 'Pick a ticket to start a pie' : 'Take an order at the counter first', cx, cy);
      return;
    }
    if (!pz.locked) {                                              // the size you are aiming for
      c.save(); c.setLineDash([10, 8]); c.lineWidth = 3; c.strokeStyle = Math.abs(pz.d - 1) <= 0.04 ? '#1f9a55' : 'rgba(90,60,30,.6)'; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke(); c.restore();
      c.strokeStyle = 'rgba(53,194,122,.25)'; c.lineWidth = R * 0.08; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    }
    const wob = G.stretching ? 1 + Math.sin(G.anim * 26) * 0.006 : 1;
    drawPie(c, pz, cx, cy, R * wob);
    if (pz.order.reqs.some(q => q.reg !== 'all')) { c.save(); c.setLineDash([6, 7]); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 2; c.beginPath(); c.moveTo(cx, cy - pz.d * R); c.lineTo(cx, cy + pz.d * R); c.stroke(); c.restore();
      c.fillStyle = 'rgba(60,35,15,.6)'; c.font = `800 ${Math.max(11, R * 0.06)}px ui-sans-serif, system-ui`; c.textAlign = 'center'; c.fillText('LEFT', cx - R * 0.6, cy - R * 1.08); c.fillText('RIGHT', cx + R * 0.6, cy - R * 1.08); }
    if (!pz.locked && G.tool === 'dough' && !G.stretching && pz.d < 0.9) { c.fillStyle = 'rgba(42,29,18,.85)'; c.font = `800 ${Math.max(13, R * 0.08)}px ui-sans-serif, system-ui`; c.textAlign = 'center'; c.fillText(ctx.touch ? 'Press and hold to stretch' : 'Hold the mouse down to stretch', cx, cy + R * 1.08 + 12); }
    // what is under the pointer
    const p = G.ptr;
    if (p && p.inside && !ctx.touch) {
      if (G.tool === 'sauce' || G.tool === 'cheese') { c.strokeStyle = G.tool === 'sauce' ? 'rgba(190,40,20,.8)' : 'rgba(230,180,40,.9)'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, (G.tool === 'sauce' ? 0.17 : 0.15) * R, 0, TAU); c.stroke(); }
      else if (T[G.tool]) { const s = T[G.tool].r * R * 2 * (SPR / 2) / 52; c.globalAlpha = 0.55; c.drawImage(SPRITES[G.tool][0], p.x - s / 2, p.y - s / 2, s, s); c.globalAlpha = 1; }
    }
  }
  function drawBake() {
    const { x0, y0, w, h } = L;
    c.drawImage(cached('deck', w, h, (x, W2, H2) => {
      x.fillStyle = '#3a2a22'; x.fillRect(0, 0, W2, H2);
      const r = rng(3); for (let y = 0; y < H2; y += 28) for (let i = -1; i < W2 / 60 + 1; i++) { x.fillStyle = `rgb(${120 + r() * 30},${52 + r() * 18},${36 + r() * 12})`; x.fillRect(i * 60 + ((y / 28) % 2) * 30 + 2, y + 2, 56, 24); }   // brick
      const dx = 14, dy = 30, dw = W2 - 28, dh = H2 - 44;
      const g = x.createLinearGradient(0, dy, 0, dy + dh); g.addColorStop(0, '#5a3a2a'); g.addColorStop(0.25, '#4a3226'); g.addColorStop(1, '#2a1c16');
      x.fillStyle = g; rrect(x, dx, dy, dw, dh, 26); x.fill();
      x.strokeStyle = '#1a100b'; x.lineWidth = 6; x.stroke();
      x.fillStyle = 'rgba(255,255,255,.03)'; for (let i = 0; i < 400; i++) x.fillRect(dx + r() * dw, dy + r() * dh, 2, 2);
    }), x0, y0, w, h);
    // the fire at the back: logs and embers along the back wall with flames licking up
    const fy = y0 + 30, band = 46;
    const heat = c.createLinearGradient(0, fy, 0, fy + L.h * 0.55); heat.addColorStop(0, 'rgba(255,140,40,.5)'); heat.addColorStop(1, 'rgba(255,90,20,0)'); c.fillStyle = heat; c.fillRect(x0 + 14, fy, w - 28, L.h * 0.55);
    c.fillStyle = '#1a0d07'; c.fillRect(x0 + 14, fy, w - 28, band);
    const glow = c.createLinearGradient(0, fy + band * 0.4, 0, fy + band); glow.addColorStop(0, 'rgba(255,120,30,0)'); glow.addColorStop(1, 'rgba(255,150,50,.85)'); c.fillStyle = glow; c.fillRect(x0 + 14, fy, w - 28, band);
    const n = Math.max(6, Math.round((w - 28) / 70));
    for (let i = 0; i < n; i++) {                                         // logs
      const lx = x0 + 22 + (i + 0.5) * (w - 44) / n, lw = (w - 44) / n * 0.8;
      c.fillStyle = i % 2 ? '#5a3420' : '#4a2a18'; rrect(c, lx - lw / 2, fy + band - 16, lw, 12, 6); c.fill();
      c.fillStyle = `rgba(255,${120 + 60 * Math.sin(G.anim * 3 + i)},40,.8)`; c.fillRect(lx - lw * 0.3, fy + band - 6, lw * 0.6, 3);
    }
    for (let i = 0; i < n * 3; i++) {                                     // flames, rising toward the back wall
      const fx = x0 + 22 + (i + 0.5) * (w - 44) / (n * 3), fl = band * (0.55 + 0.25 * Math.sin(G.anim * 7 + i * 1.7) + 0.12 * Math.sin(G.anim * 13.1 + i)), fw = (w - 44) / (n * 3) * 1.3, base = fy + band - 10;
      c.fillStyle = i % 3 === 0 ? 'rgba(255,214,110,.95)' : i % 3 === 1 ? 'rgba(255,138,42,.9)' : 'rgba(255,94,24,.85)';
      c.beginPath(); c.moveTo(fx - fw / 2, base); c.quadraticCurveTo(fx - fw * 0.45, base - fl * 0.55, fx + Math.sin(G.anim * 6 + i) * 3, base - fl); c.quadraticCurveTo(fx + fw * 0.45, base - fl * 0.55, fx + fw / 2, base); c.fill();
    }
    for (let i = 0; i < 14; i++) { const ph = (G.anim * 0.5 + i / 14) % 1, sx = x0 + 30 + ((i * 97) % 100) / 100 * (w - 60); c.fillStyle = `rgba(255,200,90,${0.8 * (1 - ph)})`; c.fillRect(sx + Math.sin(G.anim * 3 + i) * 6, fy + band + ph * 60, 2, 2); }   // sparks
    c.fillStyle = 'rgba(255,240,200,.9)'; c.font = '800 12px ui-sans-serif, system-ui'; c.textAlign = 'center'; c.fillText('🔥 THE FIRE IS AT THE BACK 🔥', x0 + w / 2, fy - 9);
    G.ovens.forEach((s, i) => {
      const p = slotPos(i);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(p.x, p.y, p.r * 1.08, 0, TAU); c.fill();
      if (!s) { c.strokeStyle = 'rgba(255,255,255,.12)'; c.setLineDash([6, 6]); c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.stroke(); c.setLineDash([]); c.fillStyle = 'rgba(255,255,255,.35)'; c.font = '700 13px ui-sans-serif, system-ui'; c.fillText('empty', p.x, p.y + 4); return; }
      const pz = s.pz, rot = lerp(s.rotFrom, s.rot, ease(s.rotT));
      drawPie(c, pz, p.x, p.y, p.r / Math.max(pz.d, 0.5) * 0.92, rot);
      // dial: 270 degrees around the pie
      const avg = (pz.bakeA + pz.bakeB) / 2, t = BAKE[pz.order.bake].t, A0 = Math.PI * 0.75, SW = Math.PI * 1.5, rr = p.r * 1.16;
      const ang = v => A0 + SW * clamp(v, 0, 1.08) / 1.08;
      c.lineCap = 'butt'; c.lineWidth = Math.max(6, p.r * 0.1);
      c.strokeStyle = 'rgba(255,255,255,.15)'; c.beginPath(); c.arc(p.x, p.y, rr, A0, A0 + SW); c.stroke();
      c.strokeStyle = 'rgba(229,84,75,.7)'; c.beginPath(); c.arc(p.x, p.y, rr, ang(1), A0 + SW); c.stroke();
      c.strokeStyle = '#35c27a'; c.beginPath(); c.arc(p.x, p.y, rr, ang(t - PERFECT), ang(t + PERFECT)); c.stroke();
      c.strokeStyle = 'rgba(242,180,65,.9)'; c.lineWidth = Math.max(3, p.r * 0.04); c.beginPath(); c.arc(p.x, p.y, rr, A0, ang(avg)); c.stroke();
      const na = ang(avg); c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.moveTo(p.x + Math.cos(na) * (rr - p.r * 0.12), p.y + Math.sin(na) * (rr - p.r * 0.12)); c.lineTo(p.x + Math.cos(na) * (rr + p.r * 0.12), p.y + Math.sin(na) * (rr + p.r * 0.12)); c.stroke();
      c.fillStyle = '#fff'; c.font = `800 ${Math.max(12, p.r * 0.17)}px ui-sans-serif, system-ui`; c.textAlign = 'center';
      c.fillText(`#${pz.order.id} ${pz.order.cust.name}`, p.x, p.y - rr - p.r * 0.16);
      const ready = Math.abs(avg - t) <= PERFECT;
      c.fillStyle = avg > 1 ? '#ff8f86' : ready ? '#9ff0bf' : '#ffe3a3'; c.font = `800 ${Math.max(11, p.r * 0.14)}px ui-sans-serif, system-ui`;
      c.fillText(avg > 1 ? 'BURNT' : ready ? 'PULL IT!' : `${Math.round(avg * 100)}% · ${BAKE[pz.order.bake].name}`, p.x, p.y + rr + p.r * 0.02);
      if (!pz.turns.length && avg > t * 0.42 && avg < t * 0.7 && Math.sin(G.anim * 6) > 0) { c.fillStyle = '#fff'; c.font = `900 ${Math.max(12, p.r * 0.16)}px ui-sans-serif, system-ui`; c.fillText('↻ TURN', p.x, p.y + 5); }
      if (s.smoke > 0) for (let k = 0; k < 5; k++) { const ph = (G.anim * 0.6 + k / 5) % 1; c.fillStyle = `rgba(60,60,60,${0.5 * (1 - ph) * Math.min(1, s.smoke)})`; c.beginPath(); c.arc(p.x + Math.sin(k * 2 + G.anim) * p.r * 0.3, p.y - ph * p.r * 1.6, p.r * (0.15 + ph * 0.3), 0, TAU); c.fill(); }
    });
  }
  function drawCut() {
    const { x0, y0, w, h, cx, cy, R } = L;
    c.drawImage(cached('cutbg', w, h, (x, W2, H2) => wood(x, W2, H2, '#8f6a45', 9)), x0, y0, w, h);
    // the round board with angle marks every 15 degrees
    const BR = R * 1.24;
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(cx + 5, cy + 8, BR, 0, TAU); c.fill();
    const g = c.createRadialGradient(cx - BR * 0.3, cy - BR * 0.3, 10, cx, cy, BR); g.addColorStop(0, '#e3bd85'); g.addColorStop(1, '#c4975e'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, BR, 0, TAU); c.fill();
    c.strokeStyle = '#a77a45'; c.lineWidth = 4; c.stroke();
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, big = i % 3 === 0; c.strokeStyle = big ? 'rgba(80,45,15,.65)' : 'rgba(80,45,15,.35)'; c.lineWidth = big ? 3 : 1.5; c.beginPath(); c.moveTo(cx + Math.cos(a) * BR * (big ? 0.88 : 0.92), cy + Math.sin(a) * BR * (big ? 0.88 : 0.92)); c.lineTo(cx + Math.cos(a) * BR * 0.98, cy + Math.sin(a) * BR * 0.98); c.stroke(); }
    const pz = G.cutBoard;
    // the warming rack of pies still to cut
    G.cutQ.forEach((q, i) => { const r = Math.min(34, R * 0.2), qx = x0 + 18 + r + i * (r * 2 + 10), qy = L.y1 - r - 16; drawPie(c, q, qx, qy, r / q.d); c.fillStyle = '#fff'; c.font = '800 11px ui-sans-serif, system-ui'; c.textAlign = 'center'; c.fillText(`#${q.order.id}`, qx, qy - r - 4); });
    if (!pz) { c.fillStyle = '#5a4330'; c.font = `800 ${Math.max(14, R * 0.09)}px ui-sans-serif, system-ui`; c.textAlign = 'center'; c.fillText('Nothing to cut yet', cx, cy); return; }
    const scale = R / pz.d;                                         // a pie always fills the board, whatever size it was stretched to
    drawPie(c, pz, cx, cy, scale, 0, G.cutAnim);
    if (G.cutAnim) { const cut = pz.cuts[pz.cuts.length - 1], [ax, ay, bx, by] = chord(cut, pz.d * 1.02), f = clamp(G.cutAnim.t / 0.22, 0, 1); wheel(cx + lerp(ax, bx, f) * scale, cy + lerp(ay, by, f) * scale, R * 0.09, f * 12); }
    const d = G.cutDrag;
    if (d) {
      const dx = d.x1 - d.x0, dy = d.y1 - d.y0, len = Math.hypot(dx, dy);
      if (len > 6) {
        const ux = dx / len, uy = dy / len, off = ((d.x0 - cx) * -uy + (d.y0 - cy) * ux) / scale, cut = { dx: ux, dy: uy, off }, [ax, ay, bx, by] = chord(cut, pz.d * 1.15);
        c.save(); c.setLineDash([10, 8]); c.lineWidth = 3; c.strokeStyle = len > R * 0.8 ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.5)'; c.beginPath(); c.moveTo(cx + ax * scale, cy + ay * scale); c.lineTo(cx + bx * scale, cy + by * scale); c.stroke(); c.restore();
      }
      wheel(d.x1, d.y1, R * 0.09, len * 0.05);
    } else if (G.ptr?.inside && !ctx.touch) wheel(G.ptr.x, G.ptr.y, R * 0.09, 0);
    c.fillStyle = 'rgba(42,29,18,.8)'; c.font = `800 ${Math.max(12, R * 0.07)}px ui-sans-serif, system-ui`; c.textAlign = 'center';
    c.fillText(`${pz.cuts.length * 2 || 0} of ${pz.order.cut} slices · drag across the pie`, cx, Math.min(L.y1 - 10, cy + BR + 24));
  }
  function wheel(x, y, r, spin) {
    c.save(); c.translate(x, y); c.fillStyle = '#5a3a22'; c.fillRect(-r * 0.18, -r * 2.4, r * 0.36, r * 1.6);
    c.rotate(spin); c.fillStyle = '#d8dce2'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.strokeStyle = '#8f949c'; c.lineWidth = 2; c.stroke();
    c.fillStyle = '#8f949c'; c.beginPath(); c.arc(0, 0, r * 0.25, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.moveTo(-r * 0.7, 0); c.lineTo(r * 0.7, 0); c.stroke();
    c.restore();
  }
  const ease = t => t * t * (3 - 2 * t);

  /* ---------------- pointer input */
  const pt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const inStage = p => L && p.x >= L.x0 && p.x <= L.x1 && p.y >= L.y0 && p.y <= L.y1;
  const toU = p => ({ x: (p.x - L.cx) / L.R, y: (p.y - L.cy) / L.R });
  function down(p) {
    if (G.modal || !G.running) return;
    if (!inStage(p)) return;
    if (G.station === 'order') {
      if (G.bubble) { if (G.bubble.t > 0.4) endBubble(); return; }
      const front = G.custs.find(q => q.state === 'line');
      if (front) { const fx = L.x0 + front.x * L.w; if (Math.abs(p.x - fx) < L.h * 0.25) takeOrder(); }
      return;
    }
    if (G.station === 'build') {
      const pz = G.board; if (!pz || pz.torn) return;
      const u = toU(p);
      if (G.tool === 'dough') { if (pz.locked) return; G.stretching = true; G.hold = 0; return; }
      if (pz.d < 0.75) { say('Stretch the dough first', p.x, p.y, '#ffd27a'); G.tool = 'dough'; dirtyTray = true; return; }
      if (G.tool === 'sauce' || G.tool === 'cheese') { if (!pz.locked) { pz.locked = true; dirtyTray = true; } G.painting = G.tool; G.last = u; stamp(pz, G.tool, u.x, u.y); return; }
      if (T[G.tool]) {
        if (Math.hypot(u.x, u.y) > pz.d * 1.02) { say('Missed the pie', p.x, p.y, '#ffd27a'); return; }
        if (!pz.locked) pz.locked = true; pz.tops.push({ k: G.tool, x: u.x, y: u.y, a: Math.random() * TAU, v: (Math.random() * 3) | 0 }); pz.ver++; dirtyTray = true; sfx('plop');
      }
      return;
    }
    if (G.station === 'bake') { G.ovens.forEach((s, i) => { const sp = slotPos(i); if (s && Math.hypot(p.x - sp.x, p.y - sp.y) < sp.r) turn(i); }); return; }
    if (G.station === 'cut') {
      // a pie on the rack: swap it onto the board if this one is still uncut
      for (let i = 0; i < G.cutQ.length; i++) { const r = Math.min(34, L.R * 0.2), qx = L.x0 + 18 + r + i * (r * 2 + 10), qy = L.y1 - r - 16; if (Math.hypot(p.x - qx, p.y - qy) < r) { swapCut(i); return; } }
      if (G.cutBoard) { G.cutAnim = null; G.cutDrag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; }
    }
  }
  function swapCut(i) {
    if (G.cutBoard && G.cutBoard.cuts.length) { say('Finish this one first', L.cx, L.cy, '#ffd27a'); return; }
    const q = G.cutQ.splice(i, 1)[0]; if (G.cutBoard) G.cutQ.push(G.cutBoard); G.cutBoard = q; dirtyTray = true; renderPin();
  }
  function move(p) {
    G.ptr = { ...p, inside: inStage(p) };
    if (G.painting && G.board) {
      const u = toU(p), pz = G.board, l = G.last, dist = Math.hypot(u.x - l.x, u.y - l.y), steps = Math.ceil(dist / 0.045);
      for (let i = 1; i <= steps; i++) stamp(pz, G.painting, lerp(l.x, u.x, i / steps), lerp(l.y, u.y, i / steps));
      G.last = u;
    }
    if (G.cutDrag) { G.cutDrag.x1 = p.x; G.cutDrag.y1 = p.y; }
  }
  function up() {
    if (G.stretching) { G.stretching = false; const pz = G.board; if (pz && !pz.torn && pz.d >= 0.85) { G.tool = 'sauce'; dirtyTray = true; if (Math.abs(pz.d - 1) <= 0.04) say('Perfect size!', L.cx, L.cy - L.R * 1.12, '#9ff0bf'); } }
    G.painting = null;
    const d = G.cutDrag; G.cutDrag = null;
    if (d && G.cutBoard) {
      const pz = G.cutBoard, dx = d.x1 - d.x0, dy = d.y1 - d.y0, len = Math.hypot(dx, dy), scale = L.R / pz.d;
      if (len < L.R * 0.8) { if (len > 12) say('Drag all the way across', d.x1, d.y1, '#ffd27a'); return; }
      const ux = dx / len, uy = dy / len, off = ((d.x0 - L.cx) * -uy + (d.y0 - L.cy) * ux) / scale;
      if (Math.abs(off) > pz.d * 0.9) { say('Missed the pie', d.x1, d.y1, '#ffd27a'); return; }
      if (pz.cuts.length >= 8) { say('That’s plenty of cuts', L.cx, L.cy, '#ffd27a'); return; }
      pz.cuts.push({ dx: ux, dy: uy, off }); G.cutAnim = { t: 0 }; dirtyTray = true; sfx('chop');
    }
  }
  cv.addEventListener('pointerdown', e => { if (e.button > 0) return; e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch { /* fine */ } const p = pt(e); G.ptr = { ...p, inside: inStage(p) }; down(p); });
  cv.addEventListener('pointermove', e => move(pt(e)));
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => { if (G.ptr) G.ptr.inside = false; });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  root.querySelectorAll('#pzTabs button').forEach(b => b.addEventListener('click', () => setStation(b.dataset.st)));
  $('#pzOvenMini').addEventListener('click', () => setStation('bake'));
  $('#pzPauseB').addEventListener('click', pause);
  $('#pzMute').addEventListener('click', () => { muted = !muted; $('#pzMute').textContent = muted ? '🔇' : '🔊'; try { localStorage.setItem('mmjr.pizza.mute', muted ? '1' : '0'); } catch { /* ignore */ } });
  const onResize = () => { bg = {}; layout(); };
  addEventListener('resize', onResize);

  function key(code) {
    if (code === 'Escape') { if (G.modal) { if (G.paused) resume(); else $('#rOk, #mLeave, #eLeave')?.click(); } else if (G.running) pause(); return; }
    if (G.modal) { if (code === 'Enter' || code === 'Space') $('#rOk, #mStart, #mResume')?.click(); return; }
    if (!G.running) return;
    const st = { Digit1: 'order', Digit2: 'build', Digit3: 'bake', Digit4: 'cut', Numpad1: 'order', Numpad2: 'build', Numpad3: 'bake', Numpad4: 'cut' }[code];
    if (st) setStation(st);
    else if (code === 'KeyZ') undo();
    else if (code === 'Space' && G.station === 'order') { if (G.bubble) endBubble(); else takeOrder(); }
  }
  function update(dt) {
    dt = Math.min(dt, 0.05); G.anim += dt; uiClock += dt;
    if (G.running && !G.modal) sim(dt);
    if (dirtyRail) renderRail();
    if (dirtyTray) renderTray();
    liveMeters();
    if (uiClock > 0.25) { uiClock = 0; patience(); badges(); }
    draw();
  }
  function dispose() { removeEventListener('resize', onResize); root.remove(); style.remove(); }

  reset(); layout(); intro();
  root.addEventListener('click', e => { const b = e.target.closest?.('button'); if (b) setTimeout(() => b.blur(), 0); });   // Space must not re-press the last button
  // test hooks: drive the shop without a mouse
  const api = {
    G, L: () => L, slotPos, save, takeOrder, endBubble, startPizza, toOven, turn, pull, serve, setStation, undo, closeModal, scoreBuild, scoreBake, scoreCut, coverage, chord,
    start() { $('#mStart')?.click(); },
    advance(sec) { for (let t = 0; t < sec; t += 1 / 30) sim(1 / 30); },
    arriveAll() { while (G.nextIdx < SHIFT) { G.arrivals[G.nextIdx] = G.t; sim(0.01); } for (let i = 0; i < 200; i++) sim(0.05); },
    stretch(d) { G.board.d = d; G.board.ver++; },
    paint(kind, rr = 0.8) { const pz = G.board; pz.locked = true; for (let r = 0; r <= rr; r += 0.06) { const n = Math.max(1, Math.ceil(TAU * r / 0.06)); for (let i = 0; i < n; i++) stamp(pz, kind, Math.cos(i / n * TAU) * r * pz.d, Math.sin(i / n * TAU) * r * pz.d); } },
    place(k, x, y) { G.board.locked = true; G.board.tops.push({ k, x, y, a: 0, v: 0 }); G.board.ver++; },
    cut(deg, off = 0) { const a = deg * Math.PI / 180; G.cutBoard.cuts.push({ dx: Math.cos(a), dy: Math.sin(a), off }); },
    tap(x, y) { const p = { x, y }; G.ptr = { ...p, inside: inStage(p) }; down(p); up(); },
    drag(x0, y0, x1, y1) { down({ x: x0, y: y0 }); for (let i = 1; i <= 12; i++) move({ x: lerp(x0, x1, i / 12), y: lerp(y0, y1, i / 12) }); up(); },
  };
  return { overlay: true, update, key, dispose, api, label: 'GO' };
}
