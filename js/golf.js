// Story St. Golf Club: the outside world. Walk, drive the cart, and play nine holes.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const G = 9.8, DEG = Math.PI / 180;

// tee -> (optional dogleg) -> green, in metres. Par total 34.
export const HOLES = [
  { par: 4, pts: [[30, 30], [60, 285]] },
  { par: 3, pts: [[95, 300], [215, 345]], pond: [0.55, 0, 16] },
  { par: 4, pts: [[250, 330], [300, 50]] },
  { par: 5, pts: [[330, 20], [420, 180], [360, 380]], pondAt: [392, 205, 17] },
  { par: 3, pts: [[330, 420], [190, 470]], pond: [0.5, 0, 15] },
  { par: 4, pts: [[150, 480], [-140, 420]], pond: [0.5, 30, 16] },
  { par: 4, pts: [[-170, 400], [-220, 150]] },
  { par: 3, pts: [[-200, 120], [-120, 215]] },
  { par: 4, pts: [[-100, 330], [-20, 200], [-45, 50]], pondAt: [-66, 96, 12] },
];
const CLUBS = [
  { id: 'D', name: 'Driver', carry: 205, loft: 12 },
  { id: '5i', name: '5 iron', carry: 165, loft: 20 },
  { id: '7i', name: '7 iron', carry: 140, loft: 27 },
  { id: '9i', name: '9 iron', carry: 115, loft: 35 },
  { id: 'PW', name: 'Pitching wedge', carry: 85, loft: 44 },
  { id: 'CH', name: 'Chip', carry: 34, loft: 28, short: true },
  { id: 'P', name: 'Putter', carry: 0, loft: 0, short: true, putter: true },
];
for (const c of CLUBS) if (!c.putter) c.v = Math.sqrt(c.carry * G / Math.sin(2 * c.loft * DEG));
const ROLL = { green: 2.0, fairway: 4.5, tee: 4.5, rough: 10, sand: 24 };
const BOUNCE = { green: [0.25, 0.62], fairway: [0.36, 0.72], tee: [0.36, 0.72], rough: [0.16, 0.42], sand: [0, 0.1] };
const BOUNDS = { x0: -330, x1: 480, z0: -70, z1: 560 };

function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function segDist(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz, t = l2 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
}

export function createGolf(THREE, ctx) {
  const SKY = 0x9fd0f2;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 260, 950);
  const camera = new THREE.PerspectiveCamera(68, 1, 0.2, 1500); camera.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4d6b3c, 1.9));
  const sun = new THREE.DirectionalLight(0xfff1d0, 1.5); sun.position.set(-60, 120, 40); scene.add(sun);
  const L = (c, o) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const add = (geo, m, x, y, z, parent = scene) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const bx = (parent, w, h, d, c, x, y, z) => add(new THREE.BoxGeometry(w, h, d), typeof c === 'number' ? L(c) : c, x, y, z, parent);
  const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  // flat "decals" on the ground: no depth writes, drawn in order, so they never flicker at distance
  const decal = (c, order, o) => new THREE.MeshLambertMaterial({ color: c, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -order, polygonOffsetUnits: -order * 2, ...o });
  const disc = (r, m, x, z, order, sx = 1, sz = 1, rot = 0) => { const o = add(new THREE.CircleGeometry(r, 40), m, x, 0.01 * order, z); o.rotation.x = -Math.PI / 2; o.rotation.z = rot; o.scale.set(sx, sz, 1); o.renderOrder = order; return o; };

  const ground = add(new THREE.PlaneGeometry(2400, 2400), L(0x3f7f3a), 80, 0, 240); ground.rotation.x = -Math.PI / 2; ground.renderOrder = -1;

  /* ---------------------------------------------------------------- course data */
  const rng = mulberry(1977);
  const ponds = [], bunkers = [], holes = [];
  HOLES.forEach((H, n) => {
    const P = H.pts, tee = P[0], green = P[P.length - 1], prev = P[P.length - 2];
    let len = 0; for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    const gd = Math.hypot(green[0] - prev[0], green[1] - prev[1]), ux = (green[0] - prev[0]) / gd, uz = (green[1] - prev[1]) / gd;
    const gr = 11.5 + rng() * 2.5, ca = rng() * 6.28, cr = rng() * gr * 0.42;
    const h = { n, par: H.par, pts: P, tee, green, gr, len: Math.round(len), cup: [green[0] + Math.cos(ca) * cr, green[1] + Math.sin(ca) * cr] };
    const d0 = Math.hypot(P[1][0] - tee[0], P[1][1] - tee[1]), k = Math.min(0.6, 24 / d0);
    h.fair = [[tee[0] + (P[1][0] - tee[0]) * k, tee[1] + (P[1][1] - tee[1]) * k], ...P.slice(1)];
    h.dir0 = [(P[1][0] - tee[0]) / d0, (P[1][1] - tee[1]) / d0];
    for (const s of [-1, 1]) bunkers.push({ x: green[0] - uz * s * (gr + 6.5) - ux * 5, z: green[1] + ux * s * (gr + 6.5) - uz * 5, r: 5.5 });
    if (H.pond) { const [t, off, r] = H.pond; ponds.push({ x: tee[0] + (green[0] - tee[0]) * t - uz * off, z: tee[1] + (green[1] - tee[1]) * t + ux * off, r }); }
    if (H.pondAt) ponds.push({ x: H.pondAt[0], z: H.pondAt[1], r: H.pondAt[2] });
    holes.push(h);
  });
  function surfaceAt(x, z) {
    for (const p of ponds) if (Math.hypot(x - p.x, z - p.z) < p.r) return 'water';
    for (const h of holes) if (Math.hypot(x - h.green[0], z - h.green[1]) < h.gr) return 'green';
    for (const b of bunkers) if (Math.hypot(x - b.x, z - b.z) < b.r) return 'sand';
    for (const h of holes) if (Math.hypot(x - h.tee[0], z - h.tee[1]) < 5) return 'tee';
    for (const h of holes) for (let i = 1; i < h.fair.length; i++) if (segDist(x, z, h.fair[i - 1][0], h.fair[i - 1][1], h.fair[i][0], h.fair[i][1]) < 15) return 'fairway';
    return 'rough';
  }

  /* ---------------------------------------------------------------- course visuals */
  const mFair = decal(0x58a548, 1), mSand = decal(0xe9dba8, 2), mWater = decal(0x3f84bd, 2), mGreen = decal(0x86cf63, 3), mTee = decal(0x4c9a43, 3), mCup = decal(0x10140f, 4);
  const flags = [];
  for (const h of holes) {
    for (let i = 1; i < h.fair.length; i++) {
      const [ax, az] = h.fair[i - 1], [bx2, bz] = h.fair[i], d = Math.hypot(bx2 - ax, bz - az), nx = -(bz - az) / d * 15, nz = (bx2 - ax) / d * 15;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([ax + nx, 0.01, az + nz, ax - nx, 0.01, az - nz, bx2 - nx, 0.01, bz - nz, ax + nx, 0.01, az + nz, bx2 - nx, 0.01, bz - nz, bx2 + nx, 0.01, bz + nz]), 3));
      g.computeVertexNormals(); const m = new THREE.Mesh(g, mFair); m.material.side = THREE.DoubleSide; m.renderOrder = 1; scene.add(m);
      disc(15, mFair, ax, az, 1); disc(15, mFair, bx2, bz, 1);
    }
    disc(h.gr + 3, decal(0x6ab552, 2), h.green[0], h.green[1], 2);       // fringe
    disc(h.gr, mGreen, h.green[0], h.green[1], 3);
    disc(5, mTee, h.tee[0], h.tee[1], 3, 1.25, 0.9, Math.atan2(h.dir0[0], h.dir0[1]));
    disc(0.3, mCup, h.cup[0], h.cup[1], 4);
    // flagstick
    const f = new THREE.Group(); f.position.set(h.cup[0], 0, h.cup[1]); scene.add(f);
    add(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), L(0xf5f5f0), 0, 1.3, 0, f);
    const fl = add(new THREE.PlaneGeometry(0.75, 0.5), new THREE.MeshBasicMaterial({ map: canvasTex(96, 64, (c, W, Hh) => { c.fillStyle = '#d6332e'; c.fillRect(0, 0, W, Hh); c.fillStyle = '#fff'; c.font = 'bold 46px Georgia, serif'; c.textAlign = 'center'; c.fillText(String(h.n + 1), W / 2, 48); }), side: THREE.DoubleSide }), 0.38, 2.33, 0, f);
    flags.push({ g: f, fl });
    // tee markers and a hole sign
    const px = -h.dir0[1], pz = h.dir0[0];
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.16, 10, 8), L(0x2f5fb5), h.tee[0] + px * s * 2.6 + h.dir0[0] * 0.6, 0.16, h.tee[1] + pz * s * 2.6 + h.dir0[1] * 0.6);
    const sg = new THREE.Group(); sg.position.set(h.tee[0] + px * 5 - h.dir0[0] * 2, 0, h.tee[1] + pz * 5 - h.dir0[1] * 2); sg.rotation.y = Math.atan2(-h.dir0[0], -h.dir0[1]); scene.add(sg);
    bx(sg, 0.12, 1.2, 0.12, 0x5d4632, 0, 0.6, 0); bx(sg, 1.5, 0.9, 0.08, 0x1f4e2f, 0, 1.55, 0);
    const st = canvasTex(256, 150, (c, W, Hh) => { c.fillStyle = '#1f4e2f'; c.fillRect(0, 0, W, Hh); c.fillStyle = '#f2d98a'; c.textAlign = 'center'; c.font = 'bold 60px Georgia, serif'; c.fillText(`HOLE ${h.n + 1}`, W / 2, 62); c.fillStyle = '#fff'; c.font = 'bold 34px Georgia, serif'; c.fillText(`Par ${h.par} · ${h.len} m`, W / 2, 118); });
    for (const s of [-1, 1]) { const p = add(new THREE.PlaneGeometry(1.4, 0.82), new THREE.MeshBasicMaterial({ map: st }), 0, 1.55, 0.045 * s, sg); if (s < 0) p.rotation.y = Math.PI; }
  }
  for (const b of bunkers) disc(b.r, mSand, b.x, b.z, 2, 1.15, 0.85, rng() * 3);
  for (const p of ponds) { disc(p.r + 1.2, decal(0x356b2f, 1), p.x, p.z, 1); disc(p.r, mWater, p.x, p.z, 2); }

  /* ---------------------------------------------------------------- trees */
  const trees = [];
  for (let i = 0; i < 1400 && trees.length < 300; i++) {
    const x = lerp(BOUNDS.x0 + 10, BOUNDS.x1 - 10, rng()), z = lerp(BOUNDS.z0 + 10, BOUNDS.z1 - 10, rng());
    if (Math.abs(x) < 60 && z < 40) continue;
    if (ponds.some(p => Math.hypot(x - p.x, z - p.z) < p.r + 7)) continue;
    if (holes.some(h => { for (let k = 1; k < h.pts.length; k++) if (segDist(x, z, h.pts[k - 1][0], h.pts[k - 1][1], h.pts[k][0], h.pts[k][1]) < 27) return true; return Math.hypot(x - h.green[0], z - h.green[1]) < h.gr + 16; })) continue;
    trees.push({ x, z, s: 0.75 + rng() * 0.7 });
  }
  { const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.42, 3, 7), L(0x5d4632), trees.length);
    const leaf = new THREE.InstancedMesh(new THREE.ConeGeometry(3.1, 8.5, 8), L(0x2c6a36), trees.length), leaf2 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.3, 6, 8), L(0x347a40), trees.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    trees.forEach((t, i) => { s.setScalar(t.s); trunk.setMatrixAt(i, m.compose(p.set(t.x, 1.5 * t.s, t.z), q, s)); leaf.setMatrixAt(i, m.compose(p.set(t.x, 6.6 * t.s, t.z), q, s)); leaf2.setMatrixAt(i, m.compose(p.set(t.x, 10 * t.s, t.z), q, s)); });
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
  // gravel path from the steps to the cart
  { const p = add(new THREE.PlaneGeometry(6, 26), decal(0xcfc6b0, 1), 0, 0.01, 6); p.rotation.x = -Math.PI / 2; p.renderOrder = 1; disc(9, decal(0xcfc6b0, 1), 6, 18, 1); }
  // the red apartment door, standing in its frame on the lawn
  const RD = { x: -7, z: 6 };
  const rd = new THREE.Group(); rd.position.set(RD.x, 0, RD.z); rd.rotation.y = 0.5; scene.add(rd);
  bx(rd, 1.0, 2.1, 0.08, 0x7a2e2a, 0, 1.05, 0); bx(rd, 0.1, 2.25, 0.16, 0xf5f1e8, -0.55, 1.12, 0); bx(rd, 0.1, 2.25, 0.16, 0xf5f1e8, 0.55, 1.12, 0); bx(rd, 1.2, 0.1, 0.16, 0xf5f1e8, 0, 2.2, 0);
  add(new THREE.SphereGeometry(0.05, 10, 8), L(0xd9b34a), 0.38, 1.02, 0.08, rd);

  /* ---------------------------------------------------------------- golf cart */
  const cartG = new THREE.Group(); scene.add(cartG);
  bx(cartG, 1.5, 0.35, 2.6, 0xf4f1ea, 0, 0.55, 0); bx(cartG, 1.5, 0.5, 0.7, 0xf4f1ea, 0, 0.85, -1.0); bx(cartG, 1.5, 0.45, 0.6, 0xf4f1ea, 0, 0.85, 1.05);
  bx(cartG, 1.3, 0.14, 0.6, 0x1f4e2f, 0, 0.95, 0.25); bx(cartG, 1.3, 0.6, 0.12, 0x1f4e2f, 0, 1.25, 0.58);
  for (const sx of [-1, 1]) { for (const sz of [-0.85, 0.5]) add(new THREE.CylinderGeometry(0.03, 0.03, 1.25, 6), L(0x222222), sx * 0.7, 1.6, sz, cartG); for (const sz of [-0.9, 0.95]) { const w = add(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 14), L(0x1b1d22), sx * 0.78, 0.3, sz, cartG); w.rotation.z = Math.PI / 2; } }
  bx(cartG, 1.6, 0.08, 1.9, 0x1f4e2f, 0, 2.25, -0.15);
  const wheel = add(new THREE.TorusGeometry(0.16, 0.025, 6, 14), L(0x222222), -0.35, 1.2, -0.55, cartG); wheel.rotation.x = -1.0;
  add(new THREE.CylinderGeometry(0.2, 0.17, 0.95, 10), L(0x9b1c2c), 0.3, 1.45, 1.2, cartG).rotation.x = -0.2;       // golf bag
  for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.012, 0.012, 0.5, 5), L(0xc9ccd2), 0.22 + i * 0.08, 2.05, 1.12, cartG);
  const cart = { x: 9, z: 17, h: Math.PI * 0.9, v: 0 };

  /* ---------------------------------------------------------------- ball, aim aids, club */
  const ballM = add(new THREE.SphereGeometry(0.11, 14, 10), L(0xffffff, { emissive: 0x555555 }), 0, 0.11, 0);
  const beam = add(new THREE.CylinderGeometry(0.22, 0.22, 34, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe14d, transparent: true, opacity: 0.4, depthWrite: false }), 0, 17, 0);
  const pinBeam = add(new THREE.CylinderGeometry(0.2, 0.2, 40, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xff5a4d, transparent: true, opacity: 0.22, depthWrite: false }), 0, 20, 0);
  const aimLine = add(new THREE.PlaneGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false }), 0, 0.06, 0); aimLine.rotation.order = 'YXZ'; aimLine.renderOrder = 6;
  const ring = add(new THREE.RingGeometry(1.6, 2.1, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), 0, 0.08, 0); ring.rotation.x = -Math.PI / 2; ring.renderOrder = 6;
  const clubG = new THREE.Group(); scene.add(clubG);
  add(new THREE.CylinderGeometry(0.012, 0.012, 1.05, 6), L(0xc9ccd2), 0, 0.55, 0, clubG); bx(clubG, 0.12, 0.05, 0.05, 0x22252b, 0.05, 0.03, 0);

  /* ---------------------------------------------------------------- state */
  const S = {
    state: 'foot', px: 0, pz: 3, yaw: Math.PI, pitch: -0.02, led: false, hole: 0, strokes: 0, card: [],
    ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, mode: 'rest', bounced: 0 }, last: [0, 0],
    aim: 0, club: 0, charging: false, cT: 0, power: 0, swingT: 0, msg: '', msgT: 0, sub: '', t: 0, endT: 0, shotFrom: [0, 0], carryFrom: 0,
    prevF: 0, done: false, pen: false, prompt: null, camPos: new THREE.Vector3(0, 1.65, 3), camLook: new THREE.Vector3(),
  };
  const hole = () => holes[S.hole];
  const say = (m, sub = '', t = 2.6) => { S.msg = m; S.sub = sub; S.msgT = t; };
  function teeUp(n) { S.hole = n; S.strokes = 0; const h = holes[n]; Object.assign(S.ball, { x: h.tee[0], y: 0, z: h.tee[1], vx: 0, vy: 0, vz: 0, mode: 'rest' }); S.last = [h.tee[0], h.tee[1]]; }
  teeUp(0);
  const distToCup = () => Math.hypot(S.ball.x - hole().cup[0], S.ball.z - hole().cup[1]);
  function blockedAt(x, z, r) {
    if (x < BOUNDS.x0 || x > BOUNDS.x1 || z < BOUNDS.z0 || z > BOUNDS.z1) return true;
    if (Math.abs(x) < 24 + r && z > -29 - r && z < -11.5 + r) return true;            // clubhouse
    if (Math.abs(x) < 9.5 + r && z > -12 && z < -6.6 + r) return true;                 // portico
    for (const p of ponds) if (Math.hypot(x - p.x, z - p.z) < p.r - 0.6 + r * 0.3) return true;
    for (const t of trees) if (Math.abs(x - t.x) < 2 && Math.abs(z - t.z) < 2 && Math.hypot(x - t.x, z - t.z) < 0.5 * t.s + r) return true;
    return false;
  }
  function pickClub() {
    const d = distToCup(), surf = surfaceAt(S.ball.x, S.ball.z);
    if (surf === 'green') return 6;
    if (d < 30) return 5;
    if (surf === 'tee' && d > 190) return 0;
    for (let i = 4; i >= 1; i--) if (CLUBS[i].carry * 1.04 >= d) return i;
    return surf === 'fairway' || surf === 'tee' ? 0 : 1;
  }
  function address() {
    if (S.done) return;
    const h = hole(); let tx = h.cup[0], tz = h.cup[1];
    if (h.pts.length === 3) { const w = h.pts[1], dw = Math.hypot(w[0] - h.cup[0], w[1] - h.cup[1]); if (distToCup() > dw + 35) { tx = w[0]; tz = w[1]; } }
    S.aim = Math.atan2(tx - S.ball.x, tz - S.ball.z); S.club = pickClub(); S.charging = false; S.power = 0; S.state = 'address'; S.prevF = 0;
  }
  function putterMax() { const d = clamp(distToCup(), 2.5, 45); return d / 0.6; }      // release at 60% for a perfect-weight putt
  const clubMax = c => c.putter ? putterMax() : c.carry;
  function swing() {
    const c = CLUBS[S.club], surf = surfaceAt(S.ball.x, S.ball.z), p = Math.max(S.power, 0.03), drunk = ctx.drinks ? ctx.drinks() : 0;
    let lie = 1, err = c.putter ? 0.45 : 1.2;
    if (!c.putter) { if (surf === 'rough') { lie = 0.87; err += 2.4; } else if (surf === 'sand') { lie = S.club >= 4 ? 0.85 : 0.6; err += 3; } }
    err += drunk * 0.6;
    const a = S.aim + (Math.random() - 0.5) * 2 * err * DEG, b = S.ball;
    S.shotFrom = [b.x, b.z]; S.last = [b.x, b.z]; S.strokes++; b.bounced = 0;
    if (c.putter) { const v = Math.sqrt(2 * ROLL.green * putterMax() * p); b.vx = Math.sin(a) * v; b.vz = Math.cos(a) * v; b.vy = 0; b.mode = 'roll'; }
    else { const v = c.v * Math.sqrt(p) * lie, lo = c.loft * DEG; b.vx = Math.sin(a) * v * Math.cos(lo); b.vz = Math.cos(a) * v * Math.cos(lo); b.vy = v * Math.sin(lo); b.y = 0.02; b.mode = 'air'; }
    S.state = 'flight'; S.swingT = 0.3; S.endT = 0; S.charging = false;
  }
  function penalty(text) {
    const b = S.ball; S.strokes++; Object.assign(b, { x: S.last[0], y: 0, z: S.last[1], vx: 0, vy: 0, vz: 0, mode: 'rest' });
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
    const near = Math.hypot(b.x - S.px, b.z - S.pz);
    if (near < 45) { standBy(); address(); }                 // short shots: walk straight to it
    else S.state = 'foot';                                   // long shots: go find it (the cart helps)
  }
  function standBy() { const h = hole(), a = Math.atan2(h.cup[0] - S.ball.x, h.cup[1] - S.ball.z); S.px = S.ball.x - Math.sin(a) * 2; S.pz = S.ball.z - Math.cos(a) * 2; S.yaw = a + Math.PI; }
  function exitCart() {
    const sx = Math.cos(cart.h), sz = -Math.sin(cart.h);
    for (const s of [-1, 1, -1.6, 1.6]) { const x = cart.x - sx * 1.7 * s, z = cart.z - sz * 1.7 * s; if (!blockedAt(x, z, 0.35)) { S.px = x; S.pz = z; break; } }
    S.yaw = cart.h + Math.PI; S.pitch = -0.05; cart.v = 0; S.state = 'foot';
  }
  function use() {
    if (S.state === 'address') { S.state = 'foot'; S.charging = false; return; }
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
    else if (k === 'club') ctx.toast?.('Members only. The course is all yours, though.');
    else if (k === 'door') ctx.goInside?.();
  }
  function reset() { S.card = []; S.done = false; teeUp(0); const h = holes[0]; cart.h = Math.atan2(h.dir0[0], h.dir0[1]); cart.x = h.tee[0] - h.dir0[1] * 5 - h.dir0[0] * 7; cart.z = h.tee[1] + h.dir0[0] * 5 - h.dir0[1] * 7; cart.v = 0; S.state = 'cart'; S.led = true; say('Hole 1', 'A fresh round.', 2.5); }

  const ARR = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
  const arrow = (tx, tz, heading) => { let a = Math.atan2(tx - camera.position.x, tz - camera.position.z) - heading; a = Math.atan2(Math.sin(a), Math.cos(a)); return ARR[((Math.round(-a / (Math.PI / 4)) % 8) + 8) % 8]; };
  const vs = n => (n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);

  const api = {
    scene, camera, S,
    get label() { return S.state === 'address' ? 'SWING' : S.state === 'cart' ? 'EXIT' : 'USE'; },
    get canBack() { return S.state === 'address'; },
    back() { if (S.state === 'address') { S.state = 'foot'; S.charging = false; } },
    use, reset,
    enter() { S.state = 'foot'; S.px = RD.x + 2.5; S.pz = RD.z + 20; S.yaw = -0.12; S.pitch = 0.1;   // a few steps out, looking back at the clubhouse
      say('Story St. Golf Club', S.led ? '' : 'The cart out front will take you to the first tee.', 3.5); },
    look(dx, dy) {
      if (S.state === 'address') { S.aim -= dx * 0.0011; return; }
      if (S.state === 'foot') { S.yaw -= dx * 0.0022; S.pitch = clamp(S.pitch - dy * 0.0022, -1.3, 1.3); }
    },
    down(src) {
      if (S.state === 'address') { if (!S.charging) { S.charging = true; S.cT = 0; S.power = 0; } }
      else if (src !== 'key') use();
    },
    up() { if (S.state === 'address' && S.charging && S.cT > 0.06) swing(); },
    update(dt) {
      S.t += dt; S.msgT -= dt; S.swingT -= dt;
      const { f, s } = ctx.axes(), b = S.ball, h = hole();
      S.prompt = null;
      if (S.state === 'foot') {
        if (f || s) {
          const sp = (ctx.keys.ShiftLeft || ctx.keys.ShiftRight ? 7 : 4.2) * Math.min(1, Math.hypot(f, s)), n = Math.hypot(f, s) || 1, sn = Math.sin(S.yaw), cs = Math.cos(S.yaw);
          const nx = S.px + (-sn * f + cs * s) / n * sp * dt, nz = S.pz + (-cs * f - sn * s) / n * sp * dt;
          if (!blockedAt(nx, S.pz, 0.35)) S.px = nx; if (!blockedAt(S.px, nz, 0.35)) S.pz = nz;
        }
        camera.position.set(S.px, 1.65, S.pz); camera.rotation.set(S.pitch, S.yaw, 0);
        const near = (x, z, r) => Math.hypot(x - S.px, z - S.pz) < r;
        if (near(cart.x, cart.z, 3.6)) S.prompt = { k: 'cart', t: S.led ? 'Drive the golf cart' : 'Take the cart to the first tee' };
        else if (!S.done && near(b.x, b.z, 3.6)) S.prompt = { k: 'ball', t: 'Play your shot' };
        else if (near(RD.x, RD.z, 2.6)) S.prompt = { k: 'door', t: 'Back to the apartment' };
        else if (near(0, -8, 4)) S.prompt = { k: 'club', t: 'Clubhouse' };
      } else if (S.state === 'cart') {
        const target = f > 0 ? 15 * f : f < 0 ? 5 * f : 0, acc = f ? 9 : 7;
        cart.v += clamp(target - cart.v, -acc * dt, acc * dt);
        if (surfaceAt(cart.x, cart.z) === 'sand') cart.v *= 1 - 2.5 * dt;
        cart.h -= s * dt * 1.5 * clamp(cart.v / 6, -1, 1);
        const nx = cart.x + Math.sin(cart.h) * cart.v * dt, nz = cart.z + Math.cos(cart.h) * cart.v * dt;
        if (!blockedAt(nx, nz, 1.2)) { cart.x = nx; cart.z = nz; } else cart.v *= -0.2;
        const cx = cart.x - Math.sin(cart.h) * 7.5, cz = cart.z - Math.cos(cart.h) * 7.5;
        S.camPos.set(cx, 3.6, cz); camera.position.lerp(S.camPos, Math.min(1, dt * 5)); camera.lookAt(cart.x + Math.sin(cart.h) * 4, 1.4, cart.z + Math.cos(cart.h) * 4);
        S.px = cart.x; S.pz = cart.z;
        S.prompt = { k: 'exit', t: !S.done && Math.hypot(b.x - cart.x, b.z - cart.z) < 9 ? 'Hop out and play your shot' : 'Hop out' };
      } else if (S.state === 'address') {
        S.aim -= s * dt * (CLUBS[S.club].short ? 0.25 : 0.5);
        const fs = f > 0.5 ? 1 : f < -0.5 ? -1 : 0;
        if (fs && fs !== S.prevF && !S.charging) S.club = clamp(S.club - fs, 0, CLUBS.length - 1);
        S.prevF = fs;
        const c = CLUBS[S.club];
        if (S.charging) { S.cT += dt; const p = (S.cT / (c.short ? 1.35 : 0.95)) % 2; S.power = p < 1 ? p : 2 - p; }
        const back = c.putter ? 3.4 : 5, up = c.putter ? 2.3 : 2.1, ax = Math.sin(S.aim), az = Math.cos(S.aim);
        S.camPos.set(b.x - ax * back, up, b.z - az * back); camera.position.lerp(S.camPos, Math.min(1, dt * 8));
        camera.lookAt(b.x + ax * (c.putter ? 3 : 12), c.putter ? 0.2 : 1.2, b.z + az * (c.putter ? 3 : 12));
      } else if (S.state === 'flight') {
        if (b.mode === 'air') {
          const steps = 3, h2 = dt / steps;
          for (let i = 0; i < steps && b.mode === 'air'; i++) {
            b.vy -= G * h2; b.x += b.vx * h2; b.y += b.vy * h2; b.z += b.vz * h2;
            if (b.y < 16 && b.y > 1.5) for (const t of trees) if (Math.abs(b.x - t.x) < 3 && Math.abs(b.z - t.z) < 3 && Math.hypot(b.x - t.x, b.z - t.z) < 1.5 * t.s && b.y < 13 * t.s) { b.vx *= 0.15; b.vz *= 0.15; b.vy = Math.min(b.vy, 0); say('Thwack', 'That one found a tree.', 1.5); break; }
            if (b.y <= 0) {
              b.y = 0; const surf = surfaceAt(b.x, b.z);
              if (surf === 'water') { penalty('Splash'); break; }
              const [rest, keep] = BOUNCE[surf]; b.vy = -b.vy * rest; b.vx *= keep; b.vz *= keep; b.bounced++;
              if (b.vy < 1.3 || surf === 'sand') { b.vy = 0; b.mode = 'roll'; }
            }
          }
        } else if (b.mode === 'roll') {
          const surf = surfaceAt(b.x, b.z);
          if (surf === 'water') penalty('Splash');
          else {
            const v = Math.hypot(b.vx, b.vz), a = ROLL[surf] || 6, nv = Math.max(0, v - a * dt);
            if (nv <= 0.12) { b.vx = b.vz = 0; b.mode = 'rest'; S.endT = 0.9; }
            else { b.vx *= nv / v; b.vz *= nv / v; b.x += b.vx * dt; b.z += b.vz * dt; }
          }
        }
        if (b.mode !== 'rest' && (b.x < BOUNDS.x0 || b.x > BOUNDS.x1 || b.z < BOUNDS.z0 || b.z > BOUNDS.z1)) penalty('Out of bounds');
        if (!S.pen && b.y < 0.25 && Math.hypot(b.x - h.cup[0], b.z - h.cup[1]) < 0.36 && Math.hypot(b.vx, b.vz) < 5.5) { b.x = h.cup[0]; b.z = h.cup[1]; holedOut(); }
        else if (b.mode === 'rest') { S.endT -= dt; if (S.endT <= 0) { if (S.pen) { S.pen = false; standBy(); address(); } else afterShot(); } }
        // camera: watch the ball, and chase it when it gets far away
        const dx = b.x - camera.position.x, dz = b.z - camera.position.z, dd = Math.hypot(dx, dz);
        if (dd > 32 && b.mode !== 'rest') { S.camPos.set(b.x - dx / dd * 24, Math.max(4, b.y * 0.5 + 5), b.z - dz / dd * 24); camera.position.lerp(S.camPos, Math.min(1, dt * 2.2)); }
        S.camLook.lerp(new THREE.Vector3(b.x, b.y + 0.3, b.z), Math.min(1, dt * 9)); camera.lookAt(S.camLook);
      } else if (S.state === 'holed') {
        S.endT -= dt; camera.lookAt(h.cup[0], 0.5, h.cup[1]);
        if (S.endT <= 0) {
          S.px = h.cup[0] + 2.5; S.pz = h.cup[1] + 2.5;
          if (S.hole === holes.length - 1) { S.done = true; S.state = 'foot'; ctx.finish?.({ card: S.card.slice(), pars: holes.map(x => x.par) }); }
          else { teeUp(S.hole + 1); S.state = 'foot'; say(`Next: hole ${S.hole + 1}`, `Par ${hole().par} · ${hole().len} m. Follow the yellow beam to the tee.`, 4); }
        }
      }
      if (S.state !== 'flight') S.camLook.set(b.x, 0.3, b.z);
      // scene objects
      cartG.position.set(cart.x, 0, cart.z); cartG.rotation.y = cart.h + Math.PI; wheel.rotation.z = -s * 0.8 * (S.state === 'cart' ? 1 : 0);
      ballM.position.set(b.x, b.y + 0.11, b.z);
      const showBeam = !S.done && (S.state === 'foot' || S.state === 'cart'); beam.visible = showBeam; beam.position.set(b.x, 17, b.z);
      pinBeam.visible = !S.done && S.state !== 'holed' && S.state !== 'address' && surfaceAt(b.x, b.z) !== 'green'; pinBeam.position.set(hole().cup[0], 20, hole().cup[1]);
      for (const fl of flags) fl.fl.rotation.y = Math.sin(S.t * 2 + fl.g.position.x) * 0.25;
      const addr = S.state === 'address', c = CLUBS[S.club];
      aimLine.visible = ring.visible = clubG.visible = addr || (S.state === 'flight' && S.swingT > 0);
      if (addr) {
        const ax = Math.sin(S.aim), az = Math.cos(S.aim), len = c.putter ? Math.min(distToCup() + 1.5, 14) : 16;
        aimLine.scale.set(1, len, 1); aimLine.position.set(b.x + ax * (len / 2 + 0.3), 0.06, b.z + az * (len / 2 + 0.3)); aimLine.rotation.set(-Math.PI / 2, S.aim, 0);
        ring.visible = !c.putter; ring.position.set(b.x + ax * c.carry, 0.08, b.z + az * c.carry);
        clubG.position.set(b.x - az * 0.35 - ax * 0.1, 0, b.z + ax * 0.35 - az * 0.1); clubG.rotation.set(0, S.aim + Math.PI / 2, S.charging ? -S.power * 1.6 : 0.15);
      } else if (clubG.visible) { ring.visible = aimLine.visible = false; clubG.rotation.z = 1.2 * (1 - S.swingT / 0.3) + 0.2; }
      // HUD
      const total = S.card.reduce((a, v, i) => a + v - holes[i].par, 0), dcup = distToCup(), surf = surfaceAt(b.x, b.z);
      let html = `<div class="g-top"><div class="pill">Hole ${S.hole + 1} · Par ${h.par}</div><div class="pill">${S.done ? 'Round complete' : S.state === 'address' || S.state === 'flight' ? `Shot ${Math.max(1, S.strokes + (addr ? 1 : 0))}` : `Strokes ${S.strokes}`}</div><div class="pill">Total ${vs(total)}</div></div>`;
      if (S.msgT > 0) html += `<div class="g-msg">${S.msg}${S.sub ? `<small>${S.sub}</small>` : ''}</div>`;
      if (addr) {
        const mx = clubMax(c), need = c.putter ? 0.6 : clamp((c.short ? dcup * 0.62 : dcup * 0.94) / mx, 0, 1.2);
        html += `<div class="g-side"><b style="color:#f2b441">${c.name}</b><br>${c.putter ? `Putt &nbsp;${dcup.toFixed(1)} m` : `Max &nbsp;&nbsp;${c.carry} m carry`}<br>Pin &nbsp;&nbsp;${dcup.toFixed(dcup < 20 ? 1 : 0)} m<br>Lie &nbsp;&nbsp;${surf}</div>
          <div class="g-bar golf${Math.abs(S.power - need) < 0.07 && S.charging ? ' hot' : ''}"><i style="width:${Math.round(S.power * 100)}%"></i>${need <= 1 ? `<u style="left:${Math.round(need * 100)}%"></u>` : ''}</div>
          <div class="g-tip">${ctx.touch ? 'Drag or stick ←/→ to aim · stick ↑/↓ changes club · hold SWING, release at the mark' : 'Mouse or A/D to aim · W/S changes club · hold click, release at the white mark · E steps away'}</div>`;
      } else if (S.state === 'foot' || S.state === 'cart') {
        const heading = S.state === 'cart' ? cart.h : S.yaw + Math.PI, hd = Math.hypot(b.x - S.px, b.z - S.pz);
        if (!S.done) html += `<div class="g-wind">${S.strokes === 0 ? `Hole ${S.hole + 1} tee` : 'Your ball'} <b>${arrow(b.x, b.z, heading)} ${hd.toFixed(0)} m</b></div>`;
        if (S.prompt) html += `<div class="g-prompt">${ctx.touch ? `${api.label} — ${S.prompt.t}` : `<kbd>E</kbd> or click — ${S.prompt.t}`}</div>`;
        if (S.state === 'cart') html += `<div class="g-tip">${ctx.touch ? 'Stick to drive' : 'W/S or ↑/↓ to drive · A/D or ←/→ to steer'}</div>`;
      }
      ctx.hud(html);
    },
  };
  return api;
}
