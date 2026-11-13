// Story St. Golf Club: the outside world. Walk, drive the cart, and play three signature holes over rolling hills.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const G = 9.8, DEG = Math.PI / 180;

// Three signature holes. tee -> (doglegs) -> green, in metres. Par 12.
//  1. The Island: a par 3 from a raised tee to a green ringed by water. There is nowhere to miss.
//  2. The Drop: a par 4 from a tee high on a hill, dogleg right around a huge waste bunker, to a green sunk in a bowl.
//  3. The Volcano: a par 5 that curls around a lake (cut the corner if you dare) up to a green on top of a cone.
export const HOLES = [
  { name: 'The Island', par: 3, pts: [[65, 65], [120, 190]], gr: 12, teeUp: 6, ponds: [[120, 190, 40, 18]], bunkers: [[113, 178, 3.2]] },
  { name: 'The Drop', par: 4, pts: [[190, 120], [350, 150], [365, 310]], gr: 13, teeUp: 9, bowl: 2.6, bunkers: [[312, 192, 22], [383, 318, 5]] },
  { name: 'The Volcano', par: 5, pts: [[300, 395], [160, 405], [25, 335], [-60, 185]], gr: 12.5, plateau: 7, ponds: [[160, 345, 42]], bunkers: [[-80, 196, 5], [-42, 196, 5], [-58, 162, 5]] },
];
const CLUBS = [
  { id: 'D', name: 'Driver', carry: 205, loft: 12, head: 'wood' },
  { id: '5i', name: '5 iron', carry: 165, loft: 20, head: 'iron' },
  { id: '7i', name: '7 iron', carry: 140, loft: 27, head: 'iron' },
  { id: '9i', name: '9 iron', carry: 115, loft: 35, head: 'iron' },
  { id: 'PW', name: 'Pitching wedge', carry: 85, loft: 44, head: 'iron' },
  { id: 'Chip', name: 'Chip', carry: 34, loft: 28, short: true, head: 'iron' },
  { id: 'Putt', name: 'Putter', carry: 0, loft: 0, short: true, putter: true, head: 'putter' },
];
for (const c of CLUBS) if (!c.putter) c.v = Math.sqrt(c.carry * G / Math.sin(2 * c.loft * DEG));
const ROLL = { green: 2.0, fairway: 6, tee: 6, rough: 11, sand: 24 };
const BOUNCE = { green: [0.2, 0.35], fairway: [0.22, 0.4], tee: [0.22, 0.4], rough: [0.16, 0.35], sand: [0, 0.1] };
const CHECK = 2.5;                                   // a shot landing on the green checks up (backspin); putts roll freely
const SLOPE = 0.8;                                   // how strongly hills pull a rolling ball
const CURVE = 7.5;                                   // sideways pull of a full hook or slice, m/s^2 at driver speed
const PURE = 0.1;                                    // half-width of the "straight" zone on the accuracy bar
const BOUNDS = { x0: -240, x1: 420, z0: -70, z1: 500 };
const TX = { x0: -280, x1: 460, z0: -120, z1: 540 }; // terrain mesh extent
const COL = { rough: '#2c6a2b', fair: '#63b548', fair2: '#70c254', fringe: '#7fcb58', green: '#a6e56c', tee: '#58ad49', sand: '#f1e3ae', sandRim: '#cdbb84', ash: '#8f8983', ashRim: '#5f5a55', rock: '#5b4a3c', rock2: '#6f5a48', beach: '#e3d7a6', water: '#3d8fd6', bank: '#2a5c28', path: '#d6cdb6' };

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export function createGolf(THREE, ctx) {
  const SKY = 0x9fd0f2;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 420, 1350);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.2, 1800); camera.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0xffffff, 0x55733f, 1.7));
  const sun = new THREE.DirectionalLight(0xfff1d0, 1.9); sun.position.set(-90, 80, 50); scene.add(sun);   // low-ish sun so the hills read
  const L = (c, o) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const add = (geo, m, x, y, z, parent = scene) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const bx = (parent, w, h, d, c, x, y, z) => add(new THREE.BoxGeometry(w, h, d), typeof c === 'number' ? L(c) : c, x, y, z, parent);
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

  /* ---------------------------------------------------------------- course data */
  const rng = mulberry(1977);
  const ponds = [], bunkers = [], holes = [];
  HOLES.forEach((H, n) => {
    const P = H.pts, tee = P[0], green = P[P.length - 1];
    let len = 0; for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const gr = H.gr, ca = rng() * 6.28, cr = rng() * gr * 0.42;
    const h = { n, name: H.name, par: H.par, pts: P, tee, green, gr, teeUp: H.teeUp || 0, bowl: H.bowl || 0, plateau: H.plateau || 0, len: Math.round(len), cup: [green[0] + Math.cos(ca) * cr, green[1] + Math.sin(ca) * cr] };
    const d0 = Math.hypot(P[1][0] - tee[0], P[1][1] - tee[1]), k = Math.min(0.6, 24 / d0);
    h.fair = [[tee[0] + (P[1][0] - tee[0]) * k, tee[1] + (P[1][1] - tee[1]) * k], ...P.slice(1)];
    h.dir0 = [(P[1][0] - tee[0]) / d0, (P[1][1] - tee[1]) / d0];
    for (const [x, z, r] of H.bunkers || []) bunkers.push({ x, z, r, ash: !!H.plateau });
    for (const [x, z, r, island] of H.ponds || []) { ponds.push({ x, z, r, island: island || 0, y: 0 }); if (island) { h.island = true; h.fair = []; } }   // no fairway: it is all carry
    holes.push(h);
  });
  // water is wherever the ground lies below a pond's surface, so what you see is exactly what counts (HT is defined below)
  const inWater = (p, x, z, m = 0.03) => Math.hypot(x - p.x, z - p.z) < p.r + 6 && HT(x, z) < p.y - m;
  function surfaceAt(x, z) {
    for (const p of ponds) if (inWater(p, x, z)) return 'water';
    for (const h of holes) if (Math.hypot(x - h.green[0], z - h.green[1]) < h.gr) return 'green';
    for (const b of bunkers) if (Math.hypot(x - b.x, z - b.z) < b.r) return 'sand';
    for (const h of holes) if (Math.hypot(x - h.tee[0], z - h.tee[1]) < 5) return 'tee';
    for (const h of holes) for (let i = 1; i < h.fair.length; i++) if (segDist(x, z, h.fair[i - 1][0], h.fair[i - 1][1], h.fair[i][0], h.fair[i][1]) < 15) return 'fairway';
    return 'rough';
  }

  /* ---------------------------------------------------------------- terrain
     Hills are designed with a formula, then baked into a height grid. The ground mesh and every height lookup
     use that same grid (same triangles), so the ball, flags, cart and golfer always sit exactly on the grass. */
  function rawH(x, z) {
    let h = 3.6 * Math.sin(x / 55 + 1) * Math.cos(z / 70) + 1.5 * Math.sin(x / 23 + z / 31) + 0.8 * Math.cos(z / 17 - x / 41);
    h *= smooth(62, 135, Math.hypot(x, z + 10));
    return h * smooth(0, 50, Math.min(x - TX.x0, TX.x1 - x, z - TX.z0, TX.z1 - z));
  }
  const flats = [];
  function designH(x, z) {
    let h = rawH(x, z);
    for (const f of flats) { const dx = x - f.x, dz = z - f.z; if (Math.abs(dx) < f.r1 && Math.abs(dz) < f.r1) { const d = Math.hypot(dx, dz); if (d < f.r1) h = lerp(f.h + (h - f.h) * f.k, h, smooth(f.r0, f.r1, d)); } }
    return h;
  }
  // Ponds: the bed is sunk, and the water level sits just below the lowest ground around the rim, so the water
  // surface always meets a bank and never hangs in the air.
  for (const p of ponds) {
    let low = 1e9; for (let a = 0; a < 6.283; a += 0.2) low = Math.min(low, rawH(p.x + Math.cos(a) * (p.r + 5), p.z + Math.sin(a) * (p.r + 5)));
    p.y = low - 0.15; flats.push({ x: p.x, z: p.z, r0: p.r - 1, r1: p.r + 5, h: p.y - 1.2, k: 0 });
    if (p.island) flats.push({ x: p.x, z: p.z, r0: p.island - 3, r1: p.island + 1.5, h: p.y + 1.3, k: 0.15 });      // the island rises out of the water
  }
  for (const h of holes) flats.push(h.teeUp
    ? { x: h.tee[0], z: h.tee[1], r0: 9, r1: 48, h: designH(h.tee[0], h.tee[1]) + h.teeUp, k: 0 }                  // tee perched on a hill
    : { x: h.tee[0], z: h.tee[1], r0: 7, r1: 18, h: designH(h.tee[0], h.tee[1]) + 0.4, k: 0 });
  for (const h of holes) {
    if (h.island) continue;                                                                                          // the island is already shaped
    const gh = designH(h.green[0], h.green[1]);
    if (h.plateau) flats.push({ x: h.green[0], z: h.green[1], r0: h.gr + 4, r1: h.gr + 22, h: gh + h.plateau, k: 0.25 });   // green on top of a cone
    else if (h.bowl) flats.push({ x: h.green[0], z: h.green[1], r0: h.gr + 2, r1: h.gr + 32, h: gh - h.bowl, k: 0.25 });    // green at the bottom of a bowl
    else flats.push({ x: h.green[0], z: h.green[1], r0: h.gr + 3, r1: h.gr + 19, h: gh, k: 0.3 });
  }
  for (const b of bunkers) flats.push({ x: b.x, z: b.z, r0: b.r - 1, r1: b.r + 4, h: designH(b.x, b.z) - 0.45, k: 0.4 });
  const STEP = 2, GW = TX.x1 - TX.x0, GD = TX.z1 - TX.z0, NX = Math.floor(GW / STEP) + 1, NZ = Math.floor(GD / STEP) + 1, hm = new Float32Array(NX * NZ);
  for (let k = 0, i = 0; k < NZ; k++) for (let j = 0; j < NX; j++, i++) hm[i] = designH(TX.x0 + j * STEP, TX.z0 + k * STEP);
  function HT(x, z) {
    const fx = clamp((x - TX.x0) / STEP, 0, NX - 1.0001), fz = clamp((z - TX.z0) / STEP, 0, NZ - 1.0001), j = fx | 0, k = fz | 0, u = fx - j, v = fz - k, i = k * NX + j;
    const a = hm[i], b = hm[i + 1], c = hm[i + NX], d = hm[i + NX + 1];
    return u + v <= 1 ? a + (b - a) * u + (c - a) * v : d + (c - d) * (1 - u) + (b - d) * (1 - v);
  }
  const grad = (x, z) => [(HT(x + 1, z) - HT(x - 1, z)) / 2, (HT(x, z + 1) - HT(x, z - 1)) / 2];

  { // the ground mesh, with the whole course painted onto one texture
    const tw = ctx.touch ? 2048 : 3072, th = Math.round(tw * GD / GW), s = tw / GW;
    const map = canvasTex(tw, th, (c) => {
      const X = x => (x - TX.x0) * s, Z = z => (z - TX.z0) * s, circ = (x, z, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(X(x), Z(z), r * s, 0, 6.3); c.fill(); };
      c.fillStyle = COL.rough; c.fillRect(0, 0, tw, th);
      const r2 = mulberry(7);
      for (let i = 0; i < 2600; i++) circ(TX.x0 + r2() * GW, TX.z0 + r2() * GD, 4 + r2() * 12, r2() < 0.5 ? 'rgba(0,0,0,.06)' : 'rgba(255,255,200,.035)');
      c.lineCap = c.lineJoin = 'round';
      const path = (h, w, col) => { c.strokeStyle = col; c.lineWidth = w * s; c.beginPath(); h.fair.forEach(([x, z], i) => (i ? c.lineTo(X(x), Z(z)) : c.moveTo(X(x), Z(z)))); c.stroke(); };
      for (const h of holes) path(h, 32.5, 'rgba(255,255,255,.22)');       // a pale edge so fairways stand out from the rough
      for (const h of holes) path(h, 30, COL.fair);
      for (const h of holes) {                                            // mowing stripes across each fairway
        c.save(); c.beginPath(); c.lineWidth = 30 * s; c.strokeStyle = '#000';
        const P = h.fair; let acc = 0; c.fillStyle = COL.fair2;
        for (let i = 1; i < P.length; i++) {
          const [ax, az] = P[i - 1], [bx2, bz] = P[i], d = Math.hypot(bx2 - ax, bz - az), ux = (bx2 - ax) / d, uz = (bz - az) / d;
          for (let t = (8 - (acc % 16) + 16) % 16; t < d; t += 16) { const x0 = ax + ux * t, z0 = az + uz * t, len = Math.min(8, d - t); c.beginPath(); c.moveTo(X(x0 - uz * 15), Z(z0 + ux * 15)); c.lineTo(X(x0 + uz * 15), Z(z0 - ux * 15)); c.lineTo(X(x0 + uz * 15 + ux * len), Z(z0 - ux * 15 + uz * len)); c.lineTo(X(x0 - uz * 15 + ux * len), Z(z0 + ux * 15 + uz * len)); c.fill(); }
          acc += d;
        }
        c.restore();
      }
      for (const p of ponds) { circ(p.x, p.z, p.r + 5.5, COL.bank); circ(p.x, p.z, p.r + 1, COL.water); if (p.island) { circ(p.x, p.z, p.island + 1.2, COL.beach); circ(p.x, p.z, p.island - 0.6, COL.fair); } }
      for (const h of holes) if (h.plateau) { circ(h.green[0], h.green[1], h.gr + 23, COL.rock); circ(h.green[0], h.green[1], h.gr + 14, COL.rock2); for (let i = 0; i < 26; i++) { const a = i * 2.4, d = h.gr + 6 + (i * 7 % 15); circ(h.green[0] + Math.cos(a) * d, h.green[1] + Math.sin(a) * d, 1.2 + (i % 3) * 0.6, i % 2 ? 'rgba(0,0,0,.18)' : 'rgba(255,220,180,.1)'); } }
      for (const h of holes) { circ(h.green[0], h.green[1], h.gr + 3.4, 'rgba(255,255,255,.25)'); circ(h.green[0], h.green[1], h.gr + 3, COL.fringe); circ(h.green[0], h.green[1], h.gr, COL.green); circ(h.tee[0], h.tee[1], 5.4, 'rgba(255,255,255,.3)'); circ(h.tee[0], h.tee[1], 5, COL.tee); }
      for (const b of bunkers) { circ(b.x, b.z, b.r + 0.6, b.ash ? COL.ashRim : COL.sandRim); circ(b.x, b.z, b.r - 0.2, b.ash ? COL.ash : COL.sand); }
      { const wb = bunkers.find(b => b.r > 15); if (wb) { const r3 = mulberry(3); for (let i = 0; i < 60; i++) { const a = r3() * 6.28, d = r3() * (wb.r - 2); circ(wb.x + Math.cos(a) * d, wb.z + Math.sin(a) * d, 0.5 + r3() * 1.4, r3() < 0.5 ? 'rgba(160,140,90,.35)' : 'rgba(255,255,255,.25)'); } } }   // ripples in the waste bunker
      c.fillStyle = COL.path; c.fillRect(X(-3), Z(-7), 6 * s, 26 * s); circ(6, 18, 9, COL.path);
    });
    map.anisotropy = 8;
    const pos = new Float32Array(NX * NZ * 3), uv = new Float32Array(NX * NZ * 2), idx = new Uint32Array((NX - 1) * (NZ - 1) * 6);
    for (let k = 0, i = 0; k < NZ; k++) for (let j = 0; j < NX; j++, i++) { const x = TX.x0 + j * STEP, z = TX.z0 + k * STEP; pos[i * 3] = x; pos[i * 3 + 1] = hm[i]; pos[i * 3 + 2] = z; uv[i * 2] = (x - TX.x0) / GW; uv[i * 2 + 1] = 1 - (z - TX.z0) / GD; }
    for (let k = 0, t = 0; k < NZ - 1; k++) for (let j = 0; j < NX - 1; j++) { const a = k * NX + j, b = a + 1, c2 = a + NX, d = c2 + 1; idx[t++] = a; idx[t++] = c2; idx[t++] = b; idx[t++] = b; idx[t++] = c2; idx[t++] = d; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map })));
    // Backdrop beyond the course: four strips around the terrain, never underneath it. (The terrain is exactly 0 high
    // at its edges, so the strips meet it cleanly. A single sheet under the course would hide every valley.)
    const R = 3000, fm = L(0x2c6a2b), strip = (x0, x1, z0, z1) => { const m = add(new THREE.PlaneGeometry(x1 - x0, z1 - z0), fm, (x0 + x1) / 2, -0.02, (z0 + z1) / 2); m.rotation.x = -Math.PI / 2; };
    strip(-R, TX.x0, -R, R); strip(TX.x1, R, -R, R); strip(TX.x0, TX.x1, -R, TX.z0); strip(TX.x0, TX.x1, TX.z1, R);
  }

  /* ---------------------------------------------------------------- water, and the island's footbridge */
  for (const p of ponds) {
    const w = add(new THREE.CircleGeometry(p.r + 5, 56), new THREE.MeshLambertMaterial({ color: 0x3d8fd6, transparent: true, opacity: 0.86 }), p.x, p.y, p.z); w.rotation.x = -Math.PI / 2;
    if (!p.island) continue;
    const h = holes.find(o => o.island), d = Math.hypot(h.tee[0] - p.x, h.tee[1] - p.z), ux = (h.tee[0] - p.x) / d, uz = (h.tee[1] - p.z) / d;
    const a0 = p.island - 1, a1 = p.r + 4.5, len = a1 - a0, mid = (a0 + a1) / 2, br = new THREE.Group();
    br.position.set(p.x + ux * mid, p.y + 1.15, p.z + uz * mid); br.rotation.y = Math.atan2(ux, uz); scene.add(br);
    bx(br, 2.2, 0.14, len, 0x8a6a4a, 0, 0, 0);
    for (let i = 0; i <= 6; i++) { const z = -len / 2 + (len * i) / 6; for (const sx of [-1, 1]) { bx(br, 0.12, 1.0, 0.12, 0x6b4a2f, sx * 1.05, 0.5, z); bx(br, 0.16, 2.2, 0.16, 0x5d4632, sx * 1.05, -1.1, z); } }
    for (const sx of [-1, 1]) bx(br, 0.08, 0.08, len, 0x6b4a2f, sx * 1.05, 0.95, 0);
  }

  /* ---------------------------------------------------------------- flags, tee markers, signs */
  const flags = [];
  for (const h of holes) {
    const cy = HT(h.cup[0], h.cup[1]);
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20), new THREE.MeshBasicMaterial({ color: 0x10140f }), h.cup[0], cy + 0.005, h.cup[1]);
    const f = new THREE.Group(); f.position.set(h.cup[0], cy, h.cup[1]); scene.add(f);
    add(new THREE.CylinderGeometry(0.045, 0.045, 3.4, 8), L(0xfdfdf8), 0, 1.7, 0, f);
    const fl = add(new THREE.PlaneGeometry(1.15, 0.75), new THREE.MeshBasicMaterial({ map: canvasTex(96, 64, (c, W, Hh) => { c.fillStyle = '#e02f2a'; c.fillRect(0, 0, W, Hh); c.fillStyle = '#fff'; c.font = 'bold 46px Georgia, serif'; c.textAlign = 'center'; c.fillText(String(h.n + 1), W / 2, 48); }), side: THREE.DoubleSide }), 0.58, 3.0, 0, f);
    flags.push({ g: f, fl });
    const px = -h.dir0[1], pz = h.dir0[0], ty = HT(h.tee[0], h.tee[1]);
    for (const s of [-1, 1]) { const mx = h.tee[0] + px * s * 2.6 + h.dir0[0] * 0.6, mz = h.tee[1] + pz * s * 2.6 + h.dir0[1] * 0.6; add(new THREE.SphereGeometry(0.16, 10, 8), L(0x2f5fb5), mx, HT(mx, mz) + 0.16, mz); }
    const sx = h.tee[0] + px * 5 - h.dir0[0] * 2, sz = h.tee[1] + pz * 5 - h.dir0[1] * 2;
    const sg = new THREE.Group(); sg.position.set(sx, HT(sx, sz), sz); sg.rotation.y = Math.atan2(-h.dir0[0], -h.dir0[1]); scene.add(sg);
    bx(sg, 0.12, 1.2, 0.12, 0x5d4632, 0, 0.6, 0); bx(sg, 1.5, 0.9, 0.08, 0x1f4e2f, 0, 1.55, 0);
    const st = canvasTex(256, 150, (c, W, Hh) => { c.fillStyle = '#1f4e2f'; c.fillRect(0, 0, W, Hh); c.fillStyle = '#f2d98a'; c.textAlign = 'center'; c.font = 'bold 40px Georgia, serif'; c.fillText(`HOLE ${h.n + 1}`, W / 2, 44); c.font = 'bold 34px Georgia, serif'; c.fillText(h.name, W / 2, 88); c.fillStyle = '#fff'; c.font = 'bold 28px Georgia, serif'; c.fillText(`Par ${h.par} · ${h.len} m`, W / 2, 128); });
    for (const s of [-1, 1]) { const p = add(new THREE.PlaneGeometry(1.4, 0.82), new THREE.MeshBasicMaterial({ map: st }), 0, 1.55, 0.045 * s, sg); if (s < 0) p.rotation.y = Math.PI; }
  }

  /* ---------------------------------------------------------------- trees */
  const trees = [];
  for (let i = 0; i < 1400 && trees.length < 300; i++) {
    const x = lerp(BOUNDS.x0 + 10, BOUNDS.x1 - 10, rng()), z = lerp(BOUNDS.z0 + 10, BOUNDS.z1 - 10, rng());
    if (Math.abs(x) < 60 && z < 40) continue;
    if (ponds.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 10)) continue;
    if (bunkers.some(b => Math.hypot(x - b.x, z - b.z) < b.r + 4)) continue;
    if (holes.some(h => (h.teeUp && Math.hypot(x - h.tee[0], z - h.tee[1]) < 30) || ((h.plateau || h.bowl) && Math.hypot(x - h.green[0], z - h.green[1]) < h.gr + 36))) continue;
    if (holes.some(h => { for (let k = 1; k < h.pts.length; k++) if (segDist(x, z, h.pts[k - 1][0], h.pts[k - 1][1], h.pts[k][0], h.pts[k][1]) < 27) return true; return Math.hypot(x - h.green[0], z - h.green[1]) < h.gr + 16; })) continue;
    trees.push({ x, z, s: 0.75 + rng() * 0.7, y: HT(x, z) });
  }
  { const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.42, 3, 7), L(0x5d4632), trees.length);
    const leaf = new THREE.InstancedMesh(new THREE.ConeGeometry(3.1, 8.5, 8), L(0x1f5a2c), trees.length), leaf2 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.3, 6, 8), L(0x276b35), trees.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    trees.forEach((t, i) => { s.setScalar(t.s); trunk.setMatrixAt(i, m.compose(p.set(t.x, t.y + 1.5 * t.s - 0.3, t.z), q, s)); leaf.setMatrixAt(i, m.compose(p.set(t.x, t.y + 6.6 * t.s, t.z), q, s)); leaf2.setMatrixAt(i, m.compose(p.set(t.x, t.y + 10 * t.s, t.z), q, s)); });
    scene.add(trunk, leaf, leaf2); }

  /* ---------------------------------------------------------------- clubhouse (you cannot go in) */
  const CH = new THREE.Group(); CH.position.set(0, 0, -20); scene.add(CH);
  bx(CH, 46, 9, 16, 0xf3efe6, 0, 4.5, 0); bx(CH, 16, 12, 18, 0xf3efe6, 0, 6, 0);
  const roofM = L(0x3d4450);
  const roof = (w, d, h, x, y, z) => { const g = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1); g.rotateY(Math.PI / 4); add(g, roofM, x, y + h / 2, z, CH).scale.set(w / 1.414, h, d / 1.414); };
  roof(49, 19, 5, 0, 9, 0); roof(18, 20, 5, 0, 12, 0);
  bx(CH, 18, 0.6, 5, 0xe7e2d6, 0, 0.3, 10.5); bx(CH, 18, 0.5, 5.4, 0xf3efe6, 0, 8.6, 10.5); bx(CH, 19, 1.2, 6, 0x3d4450, 0, 9.4, 10.5);
  for (let i = 0; i < 6; i++) add(new THREE.CylinderGeometry(0.42, 0.48, 8, 14), L(0xffffff), -8 + i * 3.2, 4.3, 12.4, CH);
  bx(CH, 3.2, 4.6, 0.3, 0x1f4e2f, 0, 2.9, 8.05); bx(CH, 0.08, 4.4, 0.34, 0x163a23, 0, 2.9, 8.07);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.12, 10, 8), L(0xd9b34a), s * 0.35, 2.8, 8.3, CH);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) { bx(CH, 2.2, 3.2, 0.2, 0x2b4a6b, s * (10.5 + i * 3.6), 4.6, 8.02); bx(CH, 2.5, 0.2, 0.3, 0xffffff, s * (10.5 + i * 3.6), 2.9, 8.05); for (const k of [-1, 1]) bx(CH, 0.5, 3.2, 0.12, 0x1f4e2f, s * (10.5 + i * 3.6) + k * 1.4, 4.6, 8.06); }
  const signT = canvasTex(1024, 160, (c, W, Hh) => { c.fillStyle = '#1f4e2f'; c.fillRect(0, 0, W, Hh); c.strokeStyle = '#f2d98a'; c.lineWidth = 8; c.strokeRect(10, 10, W - 20, Hh - 20); c.fillStyle = '#f2d98a'; c.font = 'bold 84px Georgia, serif'; c.textAlign = 'center'; c.fillText('STORY ST. GOLF CLUB', W / 2, 108); });
  add(new THREE.PlaneGeometry(13, 2), new THREE.MeshBasicMaterial({ map: signT }), 0, 10.3, 13.52, CH);
  for (const s of [-1, 1]) { bx(CH, 12, 1.1, 1.6, 0x2c6a36, s * 16, 0.55, 9.6); add(new THREE.CylinderGeometry(0.06, 0.06, 9, 8), L(0xdddddd), s * 21, 4.5, 16, CH); }
  // the red apartment door, standing in its frame on the lawn
  const RD = { x: -7, z: 6 };
  const rd = new THREE.Group(); rd.position.set(RD.x, 0, RD.z); rd.rotation.y = 0.5; scene.add(rd);
  bx(rd, 1.0, 2.1, 0.08, 0x7a2e2a, 0, 1.05, 0); bx(rd, 0.1, 2.25, 0.16, 0xf5f1e8, -0.55, 1.12, 0); bx(rd, 0.1, 2.25, 0.16, 0xf5f1e8, 0.55, 1.12, 0); bx(rd, 1.2, 0.1, 0.16, 0xf5f1e8, 0, 2.2, 0);
  add(new THREE.SphereGeometry(0.05, 10, 8), L(0xd9b34a), 0.38, 1.02, 0.08, rd);

  /* ---------------------------------------------------------------- golf cart */
  const cartG = new THREE.Group(); cartG.rotation.order = 'YXZ'; scene.add(cartG);
  bx(cartG, 1.5, 0.35, 2.6, 0xf4f1ea, 0, 0.55, 0); bx(cartG, 1.5, 0.5, 0.7, 0xf4f1ea, 0, 0.85, -1.0); bx(cartG, 1.5, 0.45, 0.6, 0xf4f1ea, 0, 0.85, 1.05);
  bx(cartG, 1.3, 0.14, 0.6, 0x1f4e2f, 0, 0.95, 0.25); bx(cartG, 1.3, 0.6, 0.12, 0x1f4e2f, 0, 1.25, 0.58);
  for (const sx of [-1, 1]) { for (const sz of [-0.85, 0.5]) add(new THREE.CylinderGeometry(0.03, 0.03, 1.25, 6), L(0x222222), sx * 0.7, 1.6, sz, cartG); for (const sz of [-0.9, 0.95]) { const w = add(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14), L(0x1b1d22), sx * 0.78, 0.3, sz, cartG); w.rotation.z = Math.PI / 2; } }
  bx(cartG, 1.6, 0.08, 1.9, 0x1f4e2f, 0, 2.25, -0.15);
  const wheel = add(new THREE.TorusGeometry(0.16, 0.025, 6, 14), L(0x222222), -0.35, 1.2, -0.55, cartG); wheel.rotation.x = -1.0;
  add(new THREE.CylinderGeometry(0.2, 0.17, 0.95, 10), L(0x9b1c2c), 0.3, 1.45, 1.2, cartG).rotation.x = -0.2;       // golf bag
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), L(0xc9ccd2), 0.22 + i * 0.08, 2.05, 1.12, cartG);
  const cart = { x: 9, z: 17, h: Math.PI * 0.9, v: 0 };

  /* ---------------------------------------------------------------- ball, markers, shot preview, trail */
  const ballM = add(new THREE.SphereGeometry(0.12, 14, 10), L(0xffffff, { emissive: 0x666666 }), 0, 0.12, 0);
  const beam = add(new THREE.CylinderGeometry(0.25, 0.25, 34, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.5, depthWrite: false }), 0, 17, 0);
  const pinBeam = add(new THREE.CylinderGeometry(0.22, 0.22, 44, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff4a3d, transparent: true, opacity: 0.32, depthWrite: false }), 0, 22, 0);
  const ring = add(new THREE.RingGeometry(1.5, 2.0, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }), 0, 0.1, 0); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 6;
  const dots = (n, size, color, opacity) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3)); g.setDrawRange(0, 0); const p = new THREE.Points(g, new THREE.PointsMaterial({ color, size: size * Math.min(window.devicePixelRatio || 1, 2), sizeAttenuation: false, transparent: true, opacity, depthWrite: false })); p.frustumCulled = false; scene.add(p); return p; };
  const arc = dots(140, 5, 0xffffff, 0.95), trail = dots(700, 4, 0xfff3a0, 0.9); let trailN = 0;

  /* ---------------------------------------------------------------- the golfer and his clubs */
  const golfer = new THREE.Group(); scene.add(golfer);
  for (const sx of [-1, 1]) { bx(golfer, 0.15, 0.82, 0.17, 0xcdb891, sx * 0.13, 0.45, 0); bx(golfer, 0.16, 0.08, 0.28, 0xf4f1ea, sx * 0.13, 0.04, 0.05); }
  const torso = bx(golfer, 0.4, 0.56, 0.24, 0x9b1c2c, 0, 1.1, 0.1); torso.rotation.x = 0.3;
  add(new THREE.SphereGeometry(0.115, 14, 10), L(0xf0c8a6), 0, 1.5, 0.24, golfer);
  bx(golfer, 0.25, 0.07, 0.25, 0xf4f1ea, 0, 1.6, 0.24); bx(golfer, 0.22, 0.02, 0.14, 0xf4f1ea, 0, 1.57, 0.41);          // cap + brim
  const tilt = new THREE.Group(); tilt.position.set(0, 1.3, 0.24); tilt.rotation.x = -0.4; golfer.add(tilt);
  const swingG = new THREE.Group(); tilt.add(swingG);
  for (const sx of [-1, 1]) { const arm = bx(swingG, 0.075, 0.64, 0.075, 0x9b1c2c, sx * 0.1, -0.3, 0); arm.rotation.z = sx * 0.16; }
  add(new THREE.SphereGeometry(0.07, 10, 8), L(0xf0c8a6), 0, -0.62, 0, swingG);
  add(new THREE.CylinderGeometry(0.011, 0.011, 0.86, 6), L(0xc9ccd2), 0, -1.02, 0, swingG);
  add(new THREE.CylinderGeometry(0.018, 0.016, 0.26, 8), L(0x1b1d22), 0, -0.68, 0, swingG);                            // grip
  const heads = {
    wood: (() => { const g = new THREE.Group(); const h = add(new THREE.SphereGeometry(0.075, 14, 10), L(0x1b1d22), 0.03, 0.0, 0, g); h.scale.set(1.25, 0.72, 1.05); bx(g, 0.012, 0.085, 0.13, 0xd9d9de, 0.105, 0.0, 0); return g; })(),
    iron: (() => { const g = new THREE.Group(); const h = bx(g, 0.022, 0.075, 0.11, 0xc9ccd2, 0.03, 0.01, 0); h.rotation.z = -0.35; bx(g, 0.03, 0.03, 0.03, 0xc9ccd2, 0, 0.0, 0); return g; })(),
    putter: (() => { const g = new THREE.Group(); bx(g, 0.03, 0.035, 0.15, 0xd9d9de, 0.02, -0.005, 0); bx(g, 0.012, 0.012, 0.012, 0xd64545, 0.037, 0.0, 0); return g; })(),
  };
  for (const k in heads) { heads[k].position.y = -1.45; swingG.add(heads[k]); }

  /* ---------------------------------------------------------------- state */
  const S = {
    state: 'foot',          // foot | cart | address | flight | landed | holed
    phase: 'aim',           // while addressing: aim -> power (held) -> acc (accuracy line) -> swing
    px: 0, pz: 3, yaw: Math.PI, pitch: -0.02, led: false, hole: 0, strokes: 0, card: [],
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mode: 'rest', bounced: 0, spin: 0 }, last: [0, 0],
    aim: 0, club: 0, cT: 0, power: 0, accT: 0, swingT: 0, flT: 0, shotAim: 0, shotClub: 0, msg: '', msgT: 0, sub: '', t: 0, endT: 0, shotFrom: [0, 0],
    prevF: 0, done: false, pen: false, prompt: null, toCorner: false, tgtD: 0, tgtY: 0, snap: true, cutT: 0, cutDone: true, landCam: null, camPos: new THREE.Vector3(0, 1.65, 3), camLook: new THREE.Vector3(),
  };
  const hole = () => holes[S.hole];
  const say = (m, sub = '', t = 2.6) => { S.msg = m; S.sub = sub; S.msgT = t; };
  function teeUp(n) { S.hole = n; S.strokes = 0; const h = holes[n]; Object.assign(S.ball, { x: h.tee[0], y: HT(h.tee[0], h.tee[1]), z: h.tee[1], vx: 0, vy: 0, vz: 0, mode: 'rest', spin: 0 }); S.last = [h.tee[0], h.tee[1]]; mapHole = -1; }
  const distToCup = () => Math.hypot(S.ball.x - hole().cup[0], S.ball.z - hole().cup[1]);
  function blockedAt(x, z, r) {
    if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return true;
    if (Math.abs(x) < 24 + r && z > -29 - r && z < -11.5 + r) return true;            // clubhouse
    if (Math.abs(x) < 9.5 + r && z > -12 && z < -6.6 + r) return true;                 // portico
    for (const p of ponds) if (inWater(p, x, z, -0.12)) return true;                 // water blocks you; the island itself is walkable
    for (const t of trees) if (Math.abs(x - t.x) < 2 && Math.abs(z - t.z) < 2 && Math.hypot(x - t.x, z - t.z) < 0.5 * t.s + r) return true;
    return false;
  }
  const shotDist = () => (S.toCorner ? S.tgtD : distToCup());
  const shotRise = () => (S.toCorner ? S.tgtY : HT(hole().cup[0], hole().cup[1])) - S.ball.y;      // + uphill, - downhill
  function pickClub() {
    const d = Math.max(1, shotDist() + shotRise() * 1.8), surf = surfaceAt(S.ball.x, S.ball.z);
    if (surf === 'green') return 6;
    if (d < 30) return 5;
    if (surf === 'tee' && d > 190) return 0;
    for (let i = 4; i >= 1; i--) if (CLUBS[i].carry * 1.04 >= d) return i;
    return surf === 'fairway' || surf === 'tee' ? 0 : 1;
  }
  // putts: release at 60% for perfect weight; uphill needs more, downhill less
  function putterMax() { const h = hole(), d = distToCup(), dh = HT(h.cup[0], h.cup[1]) - HT(S.ball.x, S.ball.z); return clamp(d + SLOPE * G * dh / ROLL.green, 1.5, 60) / 0.6; }
  const needPower = c => (c.putter ? 0.6 : clamp(((c.short ? shotDist() * 0.85 : shotDist() * 0.94) + shotRise() / Math.tan(c.loft * DEG)) / c.carry, 0.04, 1.2));
  // the accuracy line sweeps left-right-left; -1 is far left (hook), +1 far right (slice), 0 is dead straight
  const accPos = () => { const t = (S.accT / 0.62) % 2; return t < 1 ? -1 + 2 * t : 3 - 2 * t; };
  function launch(b, c, p, a, lie, spin = 0) {
    if (c.putter) { const v = Math.sqrt(2 * ROLL.green * putterMax() * p); b.vx = Math.sin(a) * v; b.vz = Math.cos(a) * v; b.vy = 0; b.mode = 'roll'; b.spin = 0; b.fromAir = false; }
    else { b.fromAir = true; const v = c.v * Math.sqrt(p) * lie, lo = c.loft * DEG; b.vx = Math.sin(a) * v * Math.cos(lo); b.vz = Math.cos(a) * v * Math.cos(lo); b.vy = v * Math.sin(lo); b.y += 0.02; b.mode = 'air'; b.spin = spin; }
    b.bounced = 0;
  }
  // one physics step; used for real shots and for the preview. Returns 'water' when the ball is lost.
  function stepBall(b, dt) {
    if (b.mode === 'air') {
      if (b.spin) { const vh = Math.hypot(b.vx, b.vz) || 1, k = b.spin * CURVE * (vh / 55) * dt; const lx = b.vz / vh, lz = -b.vx / vh; b.vx -= lx * k; b.vz -= lz * k; }   // + spin curves right (slice), - curves left (hook)
      b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const gh = HT(b.x, b.z);
      if (b.y <= gh) {
        b.y = gh; const surf = surfaceAt(b.x, b.z); if (surf === 'water') return 'water';
        const [rest, keep] = BOUNCE[surf], [gx, gz] = grad(b.x, b.z), up = Math.abs(b.vy) * rest;
        b.vx = b.vx * keep - gx * up * 0.7; b.vz = b.vz * keep - gz * up * 0.7; b.vy = up; b.bounced++; b.spin *= 0.3;
        if (b.vy < 1.3 || surf === 'sand') { b.vy = 0; b.mode = 'roll'; }
      }
    } else if (b.mode === 'roll') {
      const surf = surfaceAt(b.x, b.z); if (surf === 'water') return 'water';
      const [gx, gz] = grad(b.x, b.z), a = (ROLL[surf] || 6) * (b.fromAir && surf === 'green' ? CHECK : 1);
      b.vx -= gx * G * SLOPE * dt; b.vz -= gz * G * SLOPE * dt;
      const v = Math.hypot(b.vx, b.vz), nv = v - a * dt;
      if (nv <= 0.1) { b.vx = b.vz = 0; b.mode = 'rest'; }
      else { b.vx *= nv / v; b.vz *= nv / v; b.x += b.vx * dt; b.z += b.vz * dt; }
      b.y = HT(b.x, b.z);
    }
    return null;
  }
  const tb = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mode: 'rest', bounced: 0, spin: 0 };
  const land = { x: 0, z: 0 };
  function preview() {                                  // dotted arc of a straight shot at the marked power
    const c = CLUBS[S.club], p = c.putter ? 0.6 : clamp(S.phase === 'acc' ? S.power : needPower(c), 0.12, 1), pos = arc.geometry.attributes.position.array; let n = 0;
    Object.assign(tb, S.ball, { vx: 0, vy: 0, vz: 0 }); launch(tb, c, p, S.aim, 1);
    for (let i = 0; i < 800 && n < 140; i++) {
      const r = stepBall(tb, 1 / 50);
      if (i % (c.putter ? 3 : 4) === 0) { pos[n * 3] = tb.x; pos[n * 3 + 1] = tb.y + 0.12; pos[n * 3 + 2] = tb.z; n++; }
      if (r || tb.mode === 'rest' || (!c.putter && tb.mode !== 'air')) break;
    }
    arc.geometry.setDrawRange(0, n); arc.geometry.attributes.position.needsUpdate = true;
    land.x = tb.x; land.z = tb.z; ring.position.set(tb.x, HT(tb.x, tb.z) + 0.12, tb.z); ring.visible = !c.putter;
  }
  function parkCartNear() {                             // the cart follows you when you skip ahead with E
    const a = S.aim, ax = Math.sin(a), az = Math.cos(a), lx = Math.cos(a), lz = -Math.sin(a);
    for (const [bk, sd] of [[7, -5], [7, 5], [10, -7], [10, 7], [13, 0]]) { const x = S.ball.x - ax * bk + lx * sd, z = S.ball.z - az * bk + lz * sd; if (!blockedAt(x, z, 1.6) && surfaceAt(x, z) !== 'green' && surfaceAt(x, z) !== 'sand' && !ponds.some(q => Math.hypot(x - q.x, z - q.z) < q.r + 3)) { cart.x = x; cart.z = z; cart.h = a; cart.v = 0; return; } }
  }
  function address() {
    if (S.done) return;
    const h = hole(); let tx = h.cup[0], tz = h.cup[1]; S.toCorner = false;
    // on a dogleg, aim at the next corner of the fairway until the green is in range
    if (h.pts.length > 2 && distToCup() > 215) {
      let best = 0, bd = 1e9; for (let i = 1; i < h.pts.length; i++) { const d = segDist(S.ball.x, S.ball.z, h.pts[i - 1][0], h.pts[i - 1][1], h.pts[i][0], h.pts[i][1]); if (d < bd - 0.01) { bd = d; best = i; } }
      let w = h.pts[best]; if (best < h.pts.length - 1 && Math.hypot(w[0] - S.ball.x, w[1] - S.ball.z) < 70) w = h.pts[++best];
      if (best < h.pts.length - 1) { tx = w[0]; tz = w[1]; S.toCorner = true; S.tgtD = Math.hypot(tx - S.ball.x, tz - S.ball.z); S.tgtY = HT(tx, tz); }
    }
    S.aim = Math.atan2(tx - S.ball.x, tz - S.ball.z); S.club = pickClub(); S.phase = 'aim'; S.power = 0; S.state = 'address'; S.prevF = 0; S.snap = true;
    trailN = 0; trail.geometry.setDrawRange(0, 0);
  }
  function swing(dev) {
    const c = CLUBS[S.club], surf = surfaceAt(S.ball.x, S.ball.z), p = Math.max(S.power, 0.03);
    let lie = 1, err = c.putter ? 0.25 : 0.5;
    if (!c.putter) { if (surf === 'rough') { lie = 0.87; err += 1.8; } else if (surf === 'sand') { lie = S.club >= 4 ? 0.85 : 0.6; err += 2.4; } }
    const e = Math.abs(dev) <= PURE ? 0 : Math.sign(dev) * (Math.abs(dev) - PURE) / (1 - PURE);        // 0 = pure, ±1 = worst
    // a = bearing; turning right means a smaller bearing here, so a slice (e > 0) starts and curves right
    const push = c.putter ? 5 : c.short ? 3.5 : 1.5, spin = c.putter ? 0 : e * (c.short ? 0.35 : 1);
    const b = S.ball; S.shotFrom = [b.x, b.z]; S.last = [b.x, b.z]; S.strokes++; S.shotAim = S.aim; S.shotClub = S.club;
    const ang = S.aim - e * push * DEG + (Math.random() - 0.5) * 2 * err * DEG;
    // fly a copy of the shot first to find where it comes down; the landing camera waits there
    S.landCam = null; S.cutDone = true;
    if (!c.putter) {
      Object.assign(tb, b, { vx: 0, vy: 0, vz: 0 }); launch(tb, c, p, ang, lie, spin); let tAir = 0;
      for (let i = 0; i < 900 && tb.mode === 'air'; i++) { if (stepBall(tb, 1 / 60)) break; tAir += 1 / 60; }
      const carry = Math.hypot(tb.x - b.x, tb.z - b.z);
      if (carry > 70 && tAir > 2) {
        const ax = Math.sin(ang), az = Math.cos(ang), lx = Math.cos(ang), lz = -Math.sin(ang);
        for (const [fw, sd] of [[17, 10], [17, -10], [24, 6], [24, -6], [12, 14], [12, -14], [30, 0]]) {
          const x = tb.x + ax * fw + lx * sd, z = tb.z + az * fw + lz * sd;
          if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1 || trees.some(t => Math.hypot(x - t.x, z - t.z) < 4.5 * t.s)) continue;
          S.landCam = [x, HT(x, z) + 3.4, z]; S.cutT = Math.max(0.9, tAir * 0.45); S.cutDone = false; break;
        }
      }
    }
    launch(b, c, p, ang, lie, spin);
    S.state = 'flight'; S.phase = 'aim'; S.swingT = 0.32; S.flT = 0; S.endT = 0; trailN = 0;
    const big = Math.abs(e) > 0.55;
    if (e === 0) say('Pure', 'Dead straight.', 1.3);
    else if (c.putter) say(e < 0 ? 'Pulled left' : 'Pushed right', '', 1.3);
    else say(e < 0 ? (big ? 'Hook' : 'Draw') : (big ? 'Slice' : 'Fade'), e < 0 ? 'Curving left.' : 'Curving right.', 1.3);
  }
  function penalty(text) {
    const b = S.ball; S.strokes++; Object.assign(b, { x: S.last[0], y: HT(S.last[0], S.last[1]), z: S.last[1], vx: 0, vy: 0, vz: 0, mode: 'rest', spin: 0 });
    say(text, 'One-stroke penalty. Replaying from the last spot.'); S.endT = 1.4; S.pen = true;
  }
  function holedOut() {
    const h = hole(), d = S.strokes - h.par;
    const name = S.strokes === 1 ? 'HOLE IN ONE!' : d <= -3 ? 'Albatross!' : d === -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : `${S.strokes} strokes`;
    S.card.push(S.strokes); S.ball.mode = 'rest'; S.state = 'holed'; S.endT = 2.6;
    say(name, `Hole ${h.n + 1} in ${S.strokes} (par ${h.par})`, 2.6);
  }
  function afterShot() {
    const b = S.ball, surf = surfaceAt(b.x, b.z), carried = Math.hypot(b.x - S.shotFrom[0], b.z - S.shotFrom[1]), d = distToCup();
    say(`${carried.toFixed(carried < 20 ? 1 : 0)} m`, `${surf === 'green' ? 'On the green' : surf === 'fairway' ? 'In the fairway' : surf === 'sand' ? 'In the bunker' : surf === 'tee' ? 'Still on the tee' : 'In the rough'} · ${d.toFixed(d < 20 ? 1 : 0)} m to the pin`, 2.4);
    if (Math.hypot(b.x - S.px, b.z - S.pz) < 45) { standBy(); address(); }       // short shots: walk straight to it
    else { S.state = 'landed'; S.yaw = S.shotAim + Math.PI; S.pitch = -0.05; }   // long shots: the camera stays on the ball until you press E
  }
  function standBy() { const h = hole(), a = Math.atan2(h.cup[0] - S.ball.x, h.cup[1] - S.ball.z); S.px = S.ball.x - Math.sin(a) * 2; S.pz = S.ball.z - Math.cos(a) * 2; S.yaw = a + Math.PI; }
  function goNext() { ctx.fade?.(); standBy(); address(); parkCartNear(); }
  function exitCart() {
    const sx = Math.cos(cart.h), sz = -Math.sin(cart.h);
    for (const s of [-1, 1, -1.6, 1.6]) { const x = cart.x - sx * 1.7 * s, z = cart.z - sz * 1.7 * s; if (!blockedAt(x, z, 0.35)) { S.px = x; S.pz = z; break; } }
    S.yaw = cart.h + Math.PI; S.pitch = -0.05; cart.v = 0; S.state = 'foot';
  }
  // fromClick: a mouse click only acts on things you are standing next to; skipping ahead needs E
  function use(fromClick) {
    if (S.state === 'address') { S.state = 'foot'; S.phase = 'aim'; return; }
    if (S.state === 'landed') { if (!S.done) goNext(); return; }
    if (S.state === 'cart') { exitCart(); if (!S.done && Math.hypot(S.ball.x - S.px, S.ball.z - S.pz) < 9) { standBy(); address(); } return; }
    if (S.state !== 'foot' || !S.prompt) return;
    const k = S.prompt.k;
    if (k === 'cart') {
      S.state = 'cart';
      if (!S.led) {                                          // first ride: straight to the first tee
        S.led = true; const h = holes[0]; cart.h = Math.atan2(h.dir0[0], h.dir0[1]);
        cart.x = h.tee[0] - h.dir0[1] * 5 - h.dir0[0] * 7; cart.z = h.tee[1] + h.dir0[0] * 5 - h.dir0[1] * 7; cart.v = 0;
        ctx.fade?.(); say('Hole 1', `Par ${h.par} · ${h.len} m. Hop out with E and play your tee shot.`, 4);
      }
    } else if (k === 'ball') { standBy(); address(); }
    else if (k === 'next') { if (!fromClick) goNext(); }
    else if (k === 'club') ctx.toast?.('Members only. The course is all yours, though.');
    else if (k === 'door') ctx.goInside?.();
  }
  function reset() { S.card = []; S.done = false; teeUp(0); const h = holes[0]; cart.h = Math.atan2(h.dir0[0], h.dir0[1]); cart.x = h.tee[0] - h.dir0[1] * 5 - h.dir0[0] * 7; cart.z = h.tee[1] + h.dir0[0] * 5 - h.dir0[1] * 7; cart.v = 0; S.state = 'cart'; S.led = true; say('Hole 1', 'A fresh round.', 2.5); }

  /* ---------------------------------------------------------------- hole map (top-right corner) */
  const mapEl = document.createElement('canvas'); mapEl.id = 'gmap'; mapEl.className = 'hidden';
  const MW = ctx.touch ? 118 : 172, MH = ctx.touch ? 158 : 232, MS = Math.min(window.devicePixelRatio || 1, 2);
  mapEl.width = MW * MS; mapEl.height = MH * MS; mapEl.style.width = MW + 'px'; mapEl.style.height = MH + 'px';
  (document.getElementById('hud') || document.body).appendChild(mapEl);
  const mapBase = document.createElement('canvas'); mapBase.width = mapEl.width; mapBase.height = mapEl.height;
  let mapHole = -1; const MT = { cx: 0, cz: 0, sin: 0, cos: 1, k: 1 };
  const toMap = (x, z) => { const dx = x - MT.cx, dz = z - MT.cz; return [(MW / 2 - (dx * MT.cos - dz * MT.sin) * MT.k) * MS, ((MH + 22) / 2 - (dx * MT.sin + dz * MT.cos) * MT.k) * MS]; };
  function drawMapBase() {
    const h = hole(), c = mapBase.getContext('2d'), a = Math.atan2(h.green[0] - h.tee[0], h.green[1] - h.tee[1]);
    MT.sin = Math.sin(a); MT.cos = Math.cos(a);
    // fit every point of the hole, rotated so the green is at the top
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const [x, z] of h.pts) { const u = x * MT.cos - z * MT.sin, v = x * MT.sin + z * MT.cos; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
    const pad = 34; u0 -= pad; u1 += pad; v0 -= pad * 0.7; v1 += pad;
    MT.k = Math.min((MW - 8) / (u1 - u0), (MH - 30) / (v1 - v0));
    const uc = (u0 + u1) / 2, vc = (v0 + v1) / 2; MT.cx = uc * MT.cos + vc * MT.sin; MT.cz = -uc * MT.sin + vc * MT.cos;
    const r = v => v * MT.k * MS, circ = (x, z, rad, col) => { const [px, py] = toMap(x, z); c.fillStyle = col; c.beginPath(); c.arc(px, py, Math.max(r(rad), 1.5 * MS), 0, 6.3); c.fill(); };
    c.clearRect(0, 0, mapBase.width, mapBase.height);
    c.fillStyle = 'rgba(16,21,31,.9)'; c.beginPath(); c.roundRect(0, 0, mapBase.width, mapBase.height, 12 * MS); c.fill();
    c.save(); c.beginPath(); c.roundRect(3 * MS, 24 * MS, mapBase.width - 6 * MS, mapBase.height - 27 * MS, 9 * MS); c.clip();
    c.fillStyle = COL.rough; c.fillRect(0, 0, mapBase.width, mapBase.height);
    c.lineCap = c.lineJoin = 'round';
    for (const o of holes) { c.strokeStyle = o === h ? COL.fair : 'rgba(99,181,72,.35)'; c.lineWidth = r(30); c.beginPath(); o.fair.forEach(([x, z], i) => { const [px, py] = toMap(x, z); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke(); }
    for (const p of ponds) { circ(p.x, p.z, p.r, COL.water); if (p.island) circ(p.x, p.z, p.island, COL.fair); }
    if (h.plateau) circ(h.green[0], h.green[1], h.gr + 20, COL.rock);
    for (const o of holes) { circ(o.green[0], o.green[1], o.gr + 3, o === h ? COL.fringe : 'rgba(127,203,88,.4)'); if (o === h) circ(o.green[0], o.green[1], o.gr, COL.green); }
    for (const b of bunkers) circ(b.x, b.z, b.r, COL.sand);
    circ(h.tee[0], h.tee[1], 5, '#ffffff');
    const [fx, fy] = toMap(h.cup[0], h.cup[1]); c.strokeStyle = '#fff'; c.lineWidth = 1.5 * MS; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx, fy - 11 * MS); c.stroke();
    c.fillStyle = '#e02f2a'; c.beginPath(); c.moveTo(fx, fy - 11 * MS); c.lineTo(fx + 7 * MS, fy - 8.5 * MS); c.lineTo(fx, fy - 6 * MS); c.fill();
    c.restore();
    c.fillStyle = '#f2b441'; c.font = `bold ${12.5 * MS}px ui-sans-serif, system-ui, sans-serif`; c.textBaseline = 'middle'; c.textAlign = 'left'; c.fillText(`${h.n + 1} · ${h.name}`, 9 * MS, 13 * MS);
    c.fillStyle = '#f4efe6'; c.font = `${11 * MS}px ui-sans-serif, system-ui, sans-serif`; c.textAlign = 'right'; c.fillText(`Par ${h.par}`, mapBase.width - 9 * MS, 13 * MS);
    mapHole = S.hole;
  }
  function drawMap() {
    if (mapHole !== S.hole) drawMapBase();
    const c = mapEl.getContext('2d'), b = S.ball; c.clearRect(0, 0, mapEl.width, mapEl.height); c.drawImage(mapBase, 0, 0);
    c.save(); c.beginPath(); c.roundRect(3 * MS, 24 * MS, mapEl.width - 6 * MS, mapEl.height - 27 * MS, 9 * MS); c.clip();
    const [bx2, by] = toMap(b.x, b.z);
    if (S.state === 'address') { const [lx, ly] = CLUBS[S.club].putter ? toMap(hole().cup[0], hole().cup[1]) : toMap(land.x, land.z); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1.4 * MS; c.setLineDash([4 * MS, 3 * MS]); c.beginPath(); c.moveTo(bx2, by); c.lineTo(lx, ly); c.stroke(); c.setLineDash([]); c.beginPath(); c.arc(lx, ly, 3.2 * MS, 0, 6.3); c.stroke(); }
    if (S.state === 'foot' || S.state === 'cart') { const [px, py] = toMap(S.px, S.pz); c.fillStyle = '#f2b441'; c.strokeStyle = '#1a1303'; c.lineWidth = MS; c.beginPath(); c.arc(px, py, 3.4 * MS, 0, 6.3); c.fill(); c.stroke(); }
    c.fillStyle = '#fff'; c.strokeStyle = '#111'; c.lineWidth = 1.2 * MS; c.beginPath(); c.arc(bx2, by, 3 * MS, 0, 6.3); c.fill(); c.stroke();
    c.restore();
  }
  teeUp(0);

  const ARR = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const arrow = (tx, tz, heading) => { let a = Math.atan2(tx - camera.position.x, tz - camera.position.z) - heading; a = Math.atan2(Math.sin(a), Math.cos(a)); return ARR[((Math.round(-a / (Math.PI / 4)) % 8) + 8) % 8]; };
  const vs = n => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);
  const look3 = new THREE.Vector3();

  const api = {
    scene, camera, S,
    get label() { return S.state === 'address' ? (S.phase === 'acc' ? 'STOP' : 'SWING') : S.state === 'cart' ? 'EXIT' : S.state === 'landed' ? 'NEXT' : 'USE'; },
    get canBack() { return S.state === 'address'; },
    back() { if (S.state === 'address') { S.state = 'foot'; S.phase = 'aim'; } },
    use, reset,
    // test hook: play a shot with a given power (0..1) and accuracy (-1..1, 0 = straight)
    hit(p, dev = 0) { if (S.state === 'address') { S.power = clamp(p, 0, 1); swing(dev); } },
    enter() { S.state = 'foot'; S.px = RD.x + 2.5; S.pz = RD.z + 20; S.yaw = -0.12; S.pitch = 0.1; mapEl.classList.remove('hidden');   // a few steps out, looking back at the clubhouse
      say('Story St. Golf Club', S.led ? '' : 'The cart out front will take you to the first tee.', 3.5); },
    leave() { mapEl.classList.add('hidden'); },
    look(dx, dy) {
      if (S.state === 'address') { if (S.phase !== 'acc') S.aim -= dx * 0.0011; return; }
      if (S.state === 'foot') { S.yaw -= dx * 0.0022; S.pitch = clamp(S.pitch - dy * 0.0022, -1.3, 1.3); }
    },
    down(src) {
      if (S.state === 'address') {
        if (S.phase === 'aim') { S.phase = 'power'; S.cT = 0; S.power = 0; }
        else if (S.phase === 'acc' && S.accT > 0.12) swing(accPos());
      } else if (src !== 'key') use(src !== 'btn');
    },
    up() {
      if (S.state !== 'address' || S.phase !== 'power') return;
      if (S.cT > 0.06) { S.phase = 'acc'; S.accT = 0; } else S.phase = 'aim';      // power is locked in; now stop the accuracy line
    },
    update(dt) {
      S.t += dt; S.msgT -= dt; S.swingT -= dt;
      const { f, s } = ctx.axes(), b = S.ball, h = hole();
      S.prompt = null;
      if (S.state === 'landed' && (Math.abs(f) > 0.3 || Math.abs(s) > 0.3)) S.state = 'foot';        // walk off instead of skipping ahead
      if (S.state === 'foot') {
        if (f || s) {
          const sp = (ctx.keys.ShiftLeft || ctx.keys.ShiftRight ? 7 : 4.2) * Math.min(1, Math.hypot(f, s)), n = Math.hypot(f, s) || 1, sn = Math.sin(S.yaw), cs = Math.cos(S.yaw);
          const nx = S.px + (-sn * f + cs * s) / n * sp * dt, nz = S.pz + (-cs * f - sn * s) / n * sp * dt;
          if (!blockedAt(nx, S.pz, 0.35)) S.px = nx; if (!blockedAt(S.px, nz, 0.35)) S.pz = nz;
        }
        camera.position.set(S.px, HT(S.px, S.pz) + 1.7, S.pz); camera.rotation.set(S.pitch, S.yaw, 0);
        const near = (x, z, r) => Math.hypot(x - S.px, z - S.pz) < r, farBall = !S.done && !near(b.x, b.z, 3.6);
        if (near(cart.x, cart.z, 3.6)) S.prompt = { k: 'cart', t: S.led ? 'Drive the golf cart' : 'Take the cart to the first tee' };
        else if (!S.done && near(b.x, b.z, 3.6)) S.prompt = { k: 'ball', t: 'Play your shot' };
        else if (near(RD.x, RD.z, 2.6)) S.prompt = { k: 'door', t: 'Back to the apartment' };
        else if (near(0, -8, 4)) S.prompt = { k: 'club', t: 'Clubhouse' };
        else if (farBall && S.led) S.prompt = { k: 'next', t: S.strokes === 0 ? `Go to the hole ${S.hole + 1} tee` : 'Go to your ball' };
      } else if (S.state === 'landed') {
        S.prompt = { k: 'next', t: S.strokes === 0 ? `Go to the hole ${S.hole + 1} tee` : 'Next shot' };
        camera.lookAt(S.camLook);
      } else if (S.state === 'cart') {
        const [gx, gz] = grad(cart.x, cart.z), fx = Math.sin(cart.h), fz = Math.cos(cart.h), climb = gx * fx + gz * fz;
        const target = f > 0 ? 15 * f : f < 0 ? 5 * f : 0, acc = f ? 9 : 7;
        cart.v += clamp(target - cart.v, -acc * dt, acc * dt) - climb * 6 * dt;
        if (!f && Math.abs(cart.v) < 0.4) cart.v = 0;                              // parking brake on hills
        if (surfaceAt(cart.x, cart.z) === 'sand') cart.v *= 1 - 2.5 * dt;
        cart.h -= s * dt * 1.5 * clamp(cart.v / 6, -1, 1);
        const nx = cart.x + Math.sin(cart.h) * cart.v * dt, nz = cart.z + Math.cos(cart.h) * cart.v * dt;
        if (!blockedAt(nx, nz, 1.2)) { cart.x = nx; cart.z = nz; } else cart.v *= -0.2;
        const cx = cart.x - Math.sin(cart.h) * 8, cz = cart.z - Math.cos(cart.h) * 8, cy = HT(cart.x, cart.z);
        S.camPos.set(cx, Math.max(HT(cx, cz) + 2, cy + 4.2), cz); camera.position.lerp(S.camPos, Math.min(1, dt * 5)); camera.lookAt(cart.x + Math.sin(cart.h) * 4, cy + 1.4, cart.z + Math.cos(cart.h) * 4);
        S.px = cart.x; S.pz = cart.z;
        S.prompt = { k: 'exit', t: !S.done && Math.hypot(b.x - cart.x, b.z - cart.z) < 9 ? 'Hop out and play your shot' : 'Hop out' };
      } else if (S.state === 'address') {
        const c = CLUBS[S.club];
        if (S.phase !== 'acc') S.aim -= s * dt * (c.short ? 0.25 : 0.5);
        const fs = f > 0.5 ? 1 : f < -0.5 ? -1 : 0;
        if (fs && fs !== S.prevF && S.phase === 'aim') S.club = clamp(S.club - fs, 0, CLUBS.length - 1);
        S.prevF = fs;
        if (S.phase === 'power') { S.cT += dt; const p = (S.cT / (c.short ? 1.35 : 0.95)) % 2; S.power = p < 1 ? p : 2 - p; }
        else if (S.phase === 'acc') S.accT += dt;
        const c2 = CLUBS[S.club], back = c2.putter ? 4.4 : 6.2, up = c2.putter ? 2.8 : 3.2, ax = Math.sin(S.aim), az = Math.cos(S.aim), lx = Math.cos(S.aim), lz = -Math.sin(S.aim);
        const cx = b.x - ax * back - lx * 0.9, cz = b.z - az * back - lz * 0.9;
        let cy = Math.max(HT(cx, cz) + 1.8, b.y + up);
        for (const t of [0.35, 0.7]) cy = Math.max(cy, HT(lerp(cx, b.x, t), lerp(cz, b.z, t)) + 1.0 + (1 - t) * 1.2);   // clear any rise between the camera and the ball
        S.camPos.set(cx, cy, cz);
        if (S.snap) { camera.position.copy(S.camPos); S.snap = false; } else camera.position.lerp(S.camPos, Math.min(1, dt * 8));
        // look down the line at the ground ahead, so uphill and downhill holes both stay in frame
        const ahead = c2.putter ? clamp(distToCup() * 0.6, 1.5, 5) : 20, tx2 = b.x + ax * ahead, tz2 = b.z + az * ahead;
        camera.lookAt(tx2, c2.putter ? HT(tx2, tz2) + 0.1 : lerp(b.y + 1.0, HT(tx2, tz2) + 1.0, 0.7), tz2);
        preview();
      } else if (S.state === 'flight') {
        S.flT += dt;
        if (b.mode !== 'rest') {
          const steps = 3, h2 = dt / steps;
          for (let i = 0; i < steps && b.mode !== 'rest'; i++) {
            const air = b.mode === 'air', r = stepBall(b, h2);
            if (r === 'water') { penalty('Splash'); break; }
            if (air && b.y - HT(b.x, b.z) > 1.5) for (const t of trees) if (Math.abs(b.x - t.x) < 3 && Math.abs(b.z - t.z) < 3 && Math.hypot(b.x - t.x, b.z - t.z) < 1.5 * t.s && b.y < t.y + 13 * t.s) { b.vx *= 0.15; b.vz *= 0.15; b.vy = Math.min(b.vy, 0); b.spin = 0; say('Thwack', 'That one found a tree.', 1.5); break; }
          }
          if (b.mode === 'rest' && !S.pen) S.endT = 0.9;
          if (trailN < 700) { const p = trail.geometry.attributes.position.array; p[trailN * 3] = b.x; p[trailN * 3 + 1] = b.y + 0.12; p[trailN * 3 + 2] = b.z; trailN++; trail.geometry.setDrawRange(0, trailN); trail.geometry.attributes.position.needsUpdate = true; }
        }
        if (b.mode !== 'rest' && (b.x < BOUNDS.x0 || b.x > BOUNDS.x1 || b.z < BOUNDS.z0 || b.z > BOUNDS.z1)) penalty('Out of bounds');
        if (!S.pen && b.y - HT(b.x, b.z) < 0.25 && Math.hypot(b.x - h.cup[0], b.z - h.cup[1]) < 0.36 && Math.hypot(b.vx, b.vz) < 5.5) { b.x = h.cup[0]; b.z = h.cup[1]; b.y = HT(b.x, b.z); holedOut(); }
        else if (b.mode === 'rest') { S.endT -= dt; if (S.endT <= 0) { if (S.pen) { S.pen = false; standBy(); address(); } else afterShot(); } }
        // camera: stay behind the ball as it leaves, then cut once to a camera beyond the landing spot looking back,
        // so you see the ball come down, bounce and roll. Short shots are simply watched from where you hit them.
        if (!S.cutDone && S.landCam && S.flT > S.cutT && b.mode === 'air') {
          S.cutDone = true; camera.position.set(S.landCam[0], S.landCam[1], S.landCam[2]); S.camLook.set(b.x, b.y + 0.3, b.z);
        }
        S.camLook.lerp(look3.set(b.x, b.y + 0.3, b.z), Math.min(1, dt * 9)); camera.lookAt(S.camLook);
      } else if (S.state === 'holed') {
        S.endT -= dt; S.camLook.set(h.cup[0], HT(h.cup[0], h.cup[1]) + 0.5, h.cup[1]); camera.lookAt(S.camLook);
        if (S.endT <= 0) {
          S.px = h.cup[0] + 2.5; S.pz = h.cup[1] + 2.5;
          if (S.hole === holes.length - 1) { S.done = true; S.state = 'foot'; ctx.finish?.({ card: S.card.slice(), pars: holes.map(x => x.par) }); }
          else { teeUp(S.hole + 1); S.state = 'landed'; S.yaw = Math.atan2(S.ball.x - S.px, S.ball.z - S.pz) + Math.PI; S.pitch = 0; say(`Next: hole ${S.hole + 1}`, `Par ${hole().par} · ${hole().len} m`, 4); }
        }
      }
      if (S.state === 'address' || S.state === 'foot' || S.state === 'cart') S.camLook.set(b.x, b.y + 0.3, b.z);
      // scene objects
      { const [gx, gz] = grad(cart.x, cart.z), fx = Math.sin(cart.h), fz = Math.cos(cart.h);
        cartG.position.set(cart.x, HT(cart.x, cart.z), cart.z); cartG.rotation.set(Math.atan(gx * fx + gz * fz), cart.h + Math.PI, -Math.atan(gx * fz - gz * fx)); }
      wheel.rotation.z = -s * 0.8 * (S.state === 'cart' ? 1 : 0);
      ballM.position.set(b.x, b.y + 0.12, b.z);
      const showBeam = !S.done && (S.state === 'foot' || S.state === 'cart' || S.state === 'landed'); beam.visible = showBeam; beam.position.set(b.x, b.y + 17, b.z);
      const cu = hole().cup; pinBeam.visible = !S.done && S.state !== 'holed' && surfaceAt(b.x, b.z) !== 'green'; pinBeam.position.set(cu[0], HT(cu[0], cu[1]) + 22, cu[1]);
      for (const fl of flags) fl.fl.rotation.y = Math.sin(S.t * 2 + fl.g.position.x) * 0.25;
      const addr = S.state === 'address', c = CLUBS[addr ? S.club : S.shotClub];
      arc.visible = addr; if (!addr) ring.visible = false;
      trail.visible = S.state === 'flight' || S.state === 'landed';
      // golfer: stands left of the ball, target to his left; the swing follows the power meter
      golfer.visible = addr || (S.state === 'flight' && S.flT < 1.6);
      if (golfer.visible) {
        const a = addr ? S.aim : S.shotAim, ox = addr ? b.x : S.shotFrom[0], oz = addr ? b.z : S.shotFrom[1], gx = ox + Math.cos(a) * 0.86, gz = oz - Math.sin(a) * 0.86;
        golfer.position.set(gx, HT(gx, gz), gz); golfer.rotation.y = a - Math.PI / 2;
        for (const k in heads) heads[k].visible = k === c.head;
        const top = c.putter ? 0.42 : c.short ? 1.1 : 2.0, thru = c.putter ? 0.4 : c.short ? 1.0 : 1.9;
        let ang = 0;
        if (addr) ang = S.phase === 'aim' ? Math.sin(S.t * 1.5) * 0.03 : -S.power * top;
        else { const k = clamp(1 - S.swingT / 0.32, 0, 1); ang = lerp(-S.power * top, thru, k * k * (3 - 2 * k)); }
        swingG.rotation.z = ang;
      }
      drawMap();
      // HUD
      const total = S.card.reduce((acc, v, i) => acc + v - holes[i].par, 0), dcup = distToCup(), surf = surfaceAt(b.x, b.z);
      let html = `<div class="g-top"><div class="pill">Hole ${S.hole + 1} · Par ${h.par}</div><div class="pill">${S.done ? 'Round complete' : S.state === 'address' || S.state === 'flight' ? `Shot ${Math.max(1, S.strokes + (addr ? 1 : 0))}` : `Strokes ${S.strokes}`}</div><div class="pill">Total ${vs(total)}</div></div>`;
      if (S.msgT > 0) html += `<div class="g-msg">${S.msg}${S.sub ? `<small>${S.sub}</small>` : ''}</div>`;
      if (addr) {
        const need = needPower(c), dh = HT(cu[0], cu[1]) - b.y, ap = accPos(), acc = S.phase === 'acc';
        html += `<div class="g-side left"><b style="color:#f2b441">${c.name}</b><br>${c.putter ? `Putt &nbsp;${dcup.toFixed(1)} m` : `Max &nbsp;&nbsp;${c.carry} m carry`}<br>Pin &nbsp;&nbsp;${dcup.toFixed(dcup < 20 ? 1 : 0)} m${S.toCorner ? `<br>Aim &nbsp;&nbsp;corner, ${S.tgtD.toFixed(0)} m` : ''}<br>Elev &nbsp;${dh >= 0 ? '+' : ''}${dh.toFixed(1)} m ${Math.abs(dh) < 0.15 ? '' : dh > 0 ? 'uphill' : 'downhill'}<br>Lie &nbsp;&nbsp;${surf}</div>
          <div class="g-clubs">${CLUBS.map((k, i) => `<span class="${i === S.club ? 'on' : ''}">${k.id}</span>`).join('')}</div>
          <div class="g-bar golf${Math.abs(S.power - need) < 0.07 && S.phase !== 'aim' ? ' hot' : ''}"><i style="width:${Math.round(S.power * 100)}%"></i>${need <= 1 ? `<u style="left:${Math.round(need * 100)}%"></u>` : ''}<em>POWER</em></div>
          <div class="g-acc${acc ? ' live' : ''}"><span></span>${acc ? `<u style="left:${(50 + ap * 50).toFixed(1)}%"></u>` : ''}<em>${c.putter ? 'PULL · STRAIGHT · PUSH' : 'HOOK · STRAIGHT · SLICE'}</em></div>
          <div class="g-tip">${acc ? (ctx.touch ? 'Tap STOP when the line is in the middle' : 'Click again when the line is in the middle')
            : S.phase === 'power' ? (ctx.touch ? 'Let go at the white mark' : 'Release at the white mark')
            : ctx.touch ? 'Drag or stick ←/→ to aim · stick ↑/↓ changes club · hold SWING for power' : 'Mouse or A/D to aim · W/S changes club · hold click for power · E steps away'}</div>`;
      } else if (S.state === 'foot' || S.state === 'cart' || S.state === 'landed') {
        const heading = S.state === 'cart' ? cart.h : S.yaw + Math.PI, hd = Math.hypot(b.x - S.px, b.z - S.pz);
        if (!S.done && S.state !== 'landed') html += `<div class="g-wind">${S.strokes === 0 ? `Hole ${S.hole + 1} tee` : 'Your ball'} <b>${arrow(b.x, b.z, heading)} ${hd.toFixed(0)} m</b></div>`;
        if (S.prompt) html += `<div class="g-prompt">${ctx.touch ? `${api.label} — ${S.prompt.t}` : S.prompt.k === 'next' ? `<kbd>E</kbd> — ${S.prompt.t}` : `<kbd>E</kbd> or click — ${S.prompt.t}`}</div>`;
        if (S.state === 'cart') html += `<div class="g-tip">${ctx.touch ? 'Stick to drive' : 'W/S or ↑/↓ to drive · A/D or ←/→ to steer'}</div>`;
        else if (S.state === 'landed') html += `<div class="g-tip">${ctx.touch ? 'Or move the stick to walk' : 'Or use WASD to walk, and take the cart if you like'}</div>`;
      }
      ctx.hud(html);
    },
  };
  return api;
}
