// 8-ball against the bartender, on the table in Lucky's.
// Everything here is in "table space": x runs along the table, z across it, the centre of the cloth is 0,0.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const R = 0.033;                       // ball radius
const L = 1.18, W = 0.58;              // half length and half width of the playing surface
const POCKETS = [[-L, -W, 0.085], [L, -W, 0.085], [-L, W, 0.085], [L, W, 0.085], [0, -W - 0.015, 0.078], [0, W + 0.015, 0.078]];
const COLORS = ['#ffffff', '#f2c230', '#2456b8', '#d03a2e', '#6a2f9a', '#ee7d22', '#1f8a4c', '#8a2433', '#141414'];
const A0 = 0.5, K = 0.3;               // cloth friction: a = A0 + K * v
const E_BALL = 0.95, E_RAIL = 0.74;
const H = 0.004;                       // fixed physics step: the real table and the bartender's rehearsals match exactly
const typeOf = n => (n === 0 ? 'cue' : n === 8 ? 'eight' : n < 8 ? 'solid' : 'stripe');
const NAME = { solid: 'solids', stripe: 'stripes' };

// One physics step for a set of balls. ev collects what happened: first ball the cue ball touched, what dropped.
function step(balls, h, ev) {
  const n = balls.length;
  for (let i = 0; i < n; i++) { const b = balls[i]; if (!b.on) continue; b.x += b.vx * h; b.z += b.vz * h; }
  for (let i = 0; i < n; i++) {
    const a = balls[i]; if (!a.on) continue;
    for (let j = i + 1; j < n; j++) {
      const b = balls[j]; if (!b.on) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
      if (d2 >= 4 * R * R || d2 === 0) continue;
      // rewind the pair to the instant they touched, so the bounce comes off the true contact point
      const rvx = a.vx - b.vx, rvz = a.vz - b.vz, rv2 = rvx * rvx + rvz * rvz, B = dx * rvx + dz * rvz;
      let tau = 0, ex = dx, ez = dz;
      if (rv2 > 1e-9 && B > 0) { tau = Math.min(h, (-B + Math.sqrt(B * B - rv2 * (d2 - 4 * R * R))) / rv2); a.x -= a.vx * tau; a.z -= a.vz * tau; b.x -= b.vx * tau; b.z -= b.vz * tau; ex = b.x - a.x; ez = b.z - a.z; }
      const d = Math.hypot(ex, ez) || 1e-6, nx = ex / d, nz = ez / d, vn = rvx * nx + rvz * nz;
      if (vn > 0) { const J = (1 + E_BALL) / 2 * vn; a.vx -= J * nx; a.vz -= J * nz; b.vx += J * nx; b.vz += J * nz; if (ev) ev.hits++; }
      a.x += a.vx * tau; a.z += a.vz * tau; b.x += b.vx * tau; b.z += b.vz * tau;
      const gap = 2 * R - Math.hypot(b.x - a.x, b.z - a.z); if (gap > 0) { a.x -= nx * gap / 2; a.z -= nz * gap / 2; b.x += nx * gap / 2; b.z += nz * gap / 2; }
      if (ev && ev.first === null) { if (a.n === 0) ev.first = b.n; else if (b.n === 0) ev.first = a.n; }
    }
  }
  let moving = false;
  for (let i = 0; i < n; i++) {
    const b = balls[i]; if (!b.on) continue;
    let down = false;
    for (const [px, pz, pr] of POCKETS) if ((b.x - px) * (b.x - px) + (b.z - pz) * (b.z - pz) < pr * pr) { down = true; break; }
    if (down) { b.on = false; b.vx = b.vz = 0; if (ev) { if (b.n === 0) ev.scratch = true; else ev.potted.push(b.n); } continue; }
    if (b.x < -L + R) { b.x = -L + R; b.vx = Math.abs(b.vx) * E_RAIL; } else if (b.x > L - R) { b.x = L - R; b.vx = -Math.abs(b.vx) * E_RAIL; }
    if (b.z < -W + R) { b.z = -W + R; b.vz = Math.abs(b.vz) * E_RAIL; } else if (b.z > W - R) { b.z = W - R; b.vz = -Math.abs(b.vz) * E_RAIL; }
    const v = Math.hypot(b.vx, b.vz);
    if (v > 0) { const nv = v - (A0 + K * v) * h; if (nv < 0.02) b.vx = b.vz = 0; else { b.vx *= nv / v; b.vz *= nv / v; moving = true; } }
  }
  return moving;
}
// play a whole shot on a copy of the table (the bartender uses this to pick her shots)
function simulate(src, aim, speed) {
  const balls = src.map(b => ({ n: b.n, x: b.x, z: b.z, vx: 0, vz: 0, on: b.on })), ev = { first: null, potted: [], scratch: false, hits: 0 };
  balls[0].vx = Math.sin(aim) * speed; balls[0].vz = Math.cos(aim) * speed;
  for (let i = 0; i < 5000; i++) if (!step(balls, H, ev)) break;
  return ev;
}
// speed a ball still has after rolling d metres
function speedAfter(v, d) { const h = 0.01; while (d > 0 && v > 0) { d -= v * h; v -= (A0 + K * v) * h; } return Math.max(0, v); }

export function createPool(THREE, host) {
  const { group, top, camera } = host, Y = top + R;
  const tex = n => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 64; const g = c.getContext('2d'), col = COLORS[n > 8 ? n - 8 : n];
    g.fillStyle = n > 8 ? '#f6f3ea' : col; g.fillRect(0, 0, 128, 64);
    if (n > 8) { g.fillStyle = col; g.fillRect(0, 17, 128, 30); }
    if (n) for (const x of [32, 96]) { g.fillStyle = '#f6f3ea'; g.beginPath(); g.ellipse(x, 32, 8, 11, 0, 0, 6.3); g.fill(); g.fillStyle = '#111'; g.font = 'bold 13px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(x, 33); g.scale(n > 9 ? 0.62 : 0.8, 1); g.fillText(String(n), 0, 0); g.restore(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const geo = new THREE.SphereGeometry(R, 20, 14);
  const balls = [];
  for (let n = 0; n < 16; n++) {
    const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex(n), emissive: 0x161616 })); group.add(mesh);
    balls.push({ n, x: 0, z: 0, vx: 0, vz: 0, on: true, mesh });
  }
  for (const [px, pz, pr] of POCKETS) { const m = new THREE.Mesh(new THREE.CircleGeometry(pr * 0.86, 18), new THREE.MeshBasicMaterial({ color: 0x050505 })); m.rotation.x = -Math.PI / 2; m.position.set(clamp(px, -L + 0.02, L - 0.02), top + 0.003, clamp(pz, -W + 0.02, W - 0.02)); group.add(m); }
  { const m = new THREE.Mesh(new THREE.CircleGeometry(0.012, 10), new THREE.MeshBasicMaterial({ color: 0xdfeee0 })); m.rotation.x = -Math.PI / 2; m.position.set(-L / 2, top + 0.002, 0); group.add(m); }   // head spot
  // dressing for the overhead view: cushions, rail sights and the head string
  { const cush = new THREE.MeshLambertMaterial({ color: 0x176a3b }), sight = new THREE.MeshBasicMaterial({ color: 0xe9dfc4 }), put = (g, m, x, y, z) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); group.add(o); return o; };
    for (const k of [-1, 1]) { put(new THREE.BoxGeometry(0.028, 0.03, 2 * W - 0.2), cush, k * (L + 0.012), top + 0.015, 0); }
    for (const k of [-1, 1]) for (const kx of [-1, 1]) put(new THREE.BoxGeometry(L - 0.2, 0.03, 0.028), cush, kx * (L / 2 + 0.005), top + 0.015, k * (W + 0.012));
    for (const k of [-1, 1]) { for (let i = 1; i < 8; i++) if (i !== 4) { const d = put(new THREE.CircleGeometry(0.011, 4), sight, -L + (i * 2 * L) / 8, top + 0.052, k * (W + 0.085)); d.rotation.x = -Math.PI / 2; } for (let i = 1; i < 4; i++) { const d = put(new THREE.CircleGeometry(0.011, 4), sight, k * (L + 0.085), top + 0.052, -W + (i * 2 * W) / 4); d.rotation.x = -Math.PI / 2; } }
    const hs = put(new THREE.BoxGeometry(0.004, 0.0006, 2 * W - 0.02), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 }), -L / 2, top + 0.0012, 0); }
  // the cue, the aiming line and the ghost ball
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.0055, 1.45, 8), new THREE.MeshLambertMaterial({ color: 0xd8b98a })); group.add(stick);
  { const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.0135, 0.0115, 0.42, 8), new THREE.MeshLambertMaterial({ color: 0x2a1a12 })); butt.position.y = 0.515; stick.add(butt); const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.0056, 0.02, 8), new THREE.MeshLambertMaterial({ color: 0x3b7fb8 })); tip.position.y = -0.725; stick.add(tip); }
  const segGeo = new THREE.BoxGeometry(1, 0.0012, 1);
  const mkSeg = (color, opacity) => { const m = new THREE.Mesh(segGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity })); m.visible = false; group.add(m); return m; };
  const setSeg = (m, x0, z0, x1, z1, w) => { const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz); m.visible = len > 0.01; if (!m.visible) return; m.position.set((x0 + x1) / 2, top + 0.0035, (z0 + z1) / 2); m.scale.set(len, 1, w); m.rotation.y = -Math.atan2(dz, dx); };
  const gAim = mkSeg(0xffffff, 0.9), gObj = mkSeg(0xffd84a, 0.95), gCue = mkSeg(0x9fd8ff, 0.8);       // your line, the object ball's path, where the cue ball goes
  const mark = new THREE.Group(); group.add(mark);                                                   // the crosshair you aim with
  { const mm = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide }); const r = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.033, 24), mm); r.rotation.x = -Math.PI / 2; mark.add(r);
    for (const [w, d] of [[0.09, 0.006], [0.006, 0.09]]) mark.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.001, d), mm)); mark.position.y = top + 0.006; mark.visible = false; }
  const ghost = new THREE.Mesh(new THREE.RingGeometry(R * 0.78, R, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); ghost.rotation.x = -Math.PI / 2; group.add(ghost);
  const UP = new THREE.Vector3(0, 1, 0), v3 = new THREE.Vector3(), ax3 = new THREE.Vector3(), camTo = new THREE.Vector3(), lookTo = new THREE.Vector3(), lookNow = new THREE.Vector3();

  const P = {
    on: false, turn: 'you', phase: 'aim',        // aim | power | roll | think | over
    aim: Math.PI / 2, power: 0, cT: 0, open: true, breakShot: true, groups: { you: null, her: null }, pre: { solid: 7, stripe: 7 },
    tx: 0, tz: 0, tall: false, ev: null, msg: '', msgT: 0, thinkT: 0, plan: null, winner: null, snap: true, strike: 0, shots: 0, watch: [0, -W - 0.62, 0], jump: true,
  };
  const cue = balls[0];
  const left = g => balls.filter(b => b.on && typeOf(b.n) === g).length;
  const other = w => (w === 'you' ? 'her' : 'you');
  const say = (m, t = 2.6) => { P.msg = m; P.msgT = t; };
  const free = (x, z, skip) => !balls.some(b => b.on && b !== skip && Math.hypot(b.x - x, b.z - z) < 2 * R + 0.002);

  function rack() {
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 6, 13, 7, 14, 15], s = 2 * R + 0.0008; let k = 0;
    for (let row = 0; row < 5; row++) for (let i = 0; i <= row; i++) { const b = balls[order[k++]]; b.x = L / 2 + row * s * 0.866; b.z = (i - row / 2) * s; b.vx = b.vz = 0; b.on = true; b.mesh.rotation.set(Math.PI / 2, 0, Math.PI / 2 + (b.n % 2 ? 0.5 : -0.4)); }
    cue.x = -L / 2; cue.z = 0; cue.vx = cue.vz = 0; cue.on = true;
    Object.assign(P, { turn: 'you', phase: 'aim', aim: Math.PI / 2, power: 0, open: true, breakShot: true, groups: { you: null, her: null }, winner: null, ev: null, plan: null, scan: null, strike: 0, shots: 0, tx: L / 2, tz: 0 });
    sync();
  }
  function sync() { for (const b of balls) { b.mesh.visible = b.on; b.mesh.position.set(b.x, Y, b.z); } }
  function placeCue() {                               // after a scratch: back on the head spot, or the nearest free place to it
    cue.on = true; cue.vx = cue.vz = 0;
    for (const dx of [0, -0.1, 0.1, -0.2, 0.2, -0.3, 0.3]) for (let i = 0; i < 15; i++) { const x = -L / 2 + dx, z = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.07; if (Math.abs(z) < W - R - 0.01 && free(x, z, cue)) { cue.x = x; cue.z = z; return; } }
    cue.x = -L / 2; cue.z = 0;
  }
  // ball in hand for her: set the cue ball down for an easy straight shot if there is one
  function placeHer() {
    cue.on = true; cue.vx = cue.vz = 0;
    for (const t of legal('her')) for (const [px, pz] of POCKETS) {
      const qx = clamp(px, -L + 0.03, L - 0.03), qz = clamp(pz, -W + 0.02, W - 0.02), d = Math.hypot(qx - t.x, qz - t.z); if (d < 0.05) continue;
      const ux = (qx - t.x) / d, uz = (qz - t.z) / d, x = t.x - ux * (2 * R + 0.36), z = t.z - uz * (2 * R + 0.36);
      if (Math.abs(x) > L - R - 0.02 || Math.abs(z) > W - R - 0.02 || !free(x, z, cue)) continue;
      cue.x = x; cue.z = z;
      if (clear(x, z, t.x - ux * 2 * R, t.z - uz * 2 * R, cue, t) && clear(t.x, t.z, qx, qz, t, null)) return;
    }
    placeCue();
  }
  function respotEight() { const b = balls[8]; b.on = true; b.vx = b.vz = 0; for (let i = 0; i < 40; i++) { const x = L / 2 + i * 0.03; if (x < L - R && free(x, 0, b)) { b.x = x; b.z = 0; return; } } b.x = 0; b.z = 0; }

  function shoot(aim, speed) {
    P.pre = { solid: left('solid'), stripe: left('stripe') };
    P.ev = { first: null, potted: [], scratch: false, hits: 0 };
    cue.vx = Math.sin(aim) * speed; cue.vz = Math.cos(aim) * speed; P.phase = 'roll'; P.strike = 0.18; P.shots++; P.acc = 0;
  }
  // the shot is over: apply the rules of 8-ball
  function resolve() {
    const ev = P.ev, who = P.turn, opp = other(who), mine = P.groups[who], onEight = !!mine && P.pre[mine] === 0, whoName = who === 'you' ? 'You' : 'She';
    let foul = ev.scratch || ev.first === null, why = ev.scratch ? 'Scratch' : ev.first === null ? 'No ball hit' : '';
    if (!foul) { const ft = typeOf(ev.first); if (P.open ? ft === 'eight' && !P.breakShot : onEight ? ft !== 'eight' : ft !== mine) { foul = true; why = 'Wrong ball first'; } }
    if (ev.potted.includes(8)) {
      if (P.breakShot) respotEight();
      else { P.winner = onEight && !foul ? who : opp; P.phase = 'over'; if (ev.scratch) placeCue(); sync();
        say(P.winner === 'you' ? 'You win!' : 'The bartender wins', 99);
        host.line?.(P.winner === 'you' ? (onEight ? '“Okay, okay. Best of three?”' : '“I sank the eight early. That one is yours.”') : (who === 'you' ? '“Eight ball down too soon. My game.”' : '“Eight ball. Good game.”'));
        return; }
    }
    const pots = ev.potted.filter(n => n !== 8); let keep = false, note = '';
    if (P.open) {
      if (!foul && pots.length) { const g = typeOf(pots[0]); P.groups[who] = g; P.groups[opp] = g === 'solid' ? 'stripe' : 'solid'; P.open = false; keep = true; note = `${whoName === 'You' ? 'You are' : 'She is'} ${NAME[g]}`; }
    } else if (!foul) keep = pots.some(n => typeOf(n) === mine);
    if (ev.scratch) placeCue();
    P.breakShot = false; sync();
    const next = keep ? who : opp; P.turn = next;
    if (foul) { say(`${why} — ${next === 'you' ? 'you have ball in hand' : 'she has ball in hand'}`, 3.2); if (who === 'you' && Math.random() < 0.6) host.line?.(ev.scratch ? '“Scratch. I will take that.”' : '“That is a foul, hon.”'); }
    else if (note) say(note);
    else if (keep) { say(who === 'you' ? 'Nice shot — go again' : 'She keeps the table'); if (who === 'you' && Math.random() < 0.35) host.line?.('“Nice shot.”'); }
    else say(next === 'you' ? 'Your shot' : 'Her shot');
    if (next === 'you') { aimAtSomething(); P.phase = foul ? 'place' : 'aim'; if (foul) { cue.on = true; if (!ev.scratch && !free(cue.x, cue.z, cue)) placeCue(); sync(); } }
    else { if (foul) { placeHer(); sync(); } P.phase = 'think'; P.thinkT = 1.5; P.plan = null; P.scan = null; }
  }
  // which balls may this player hit first?
  function legal(who) { const g = P.groups[who]; if (P.open) return balls.filter(b => b.on && b.n && b.n !== 8); if (left(g) === 0) return balls.filter(b => b.on && b.n === 8); return balls.filter(b => b.on && typeOf(b.n) === g); }
  function aimAtSomething() {                         // start each turn pointed at the nearest ball you are allowed to hit
    const t = legal('you').sort((a, b) => Math.hypot(a.x - cue.x, a.z - cue.z) - Math.hypot(b.x - cue.x, b.z - cue.z))[0];
    if (t) { P.tx = t.x; P.tz = t.z; P.aim = Math.atan2(t.x - cue.x, t.z - cue.z); } else { P.tx = cue.x + 0.5; P.tz = cue.z; } watchSpot();
  }
  function watchSpot() {                              // she waits on the far side of the table from where you are shooting
    const dx = Math.sin(P.aim), dz = Math.cos(P.aim); let best = -1e9;
    for (const [x, z] of [[0, -W - 0.62], [0, W + 0.62], [L + 0.62, 0], [-L - 0.62, 0]]) { const sc = (x - cue.x) * dx + (z - cue.z) * dz; if (sc > best) { best = sc; P.watch = [x, z, Math.atan2(-x, -z)]; } }
  }
  const clear = (x0, z0, x1, z1, a, b) => {           // is the path between two points free of other balls?
    const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
    for (const o of balls) { if (!o.on || o === a || o === b) continue; const t = clamp(((o.x - x0) * dx + (o.z - z0) * dz) / l2, 0, 1); if (Math.hypot(o.x - x0 - dx * t, o.z - z0 - dz * t) < 2 * R) return false; }
    return true;
  };
  // The bartender: line up every ball-and-pocket she is allowed to play and try each on a copy of the table. If none
  // drops, she sweeps the cue right round the table looking for anything that works (banks, combinations), and
  // failing that plays a safe, legal hit. The search is spread over a few frames while she "lines one up".
  // Then her hand wobbles a little, so she misses sometimes.
  function planStep() {
    const wobble = c => ({ aim: c.aim + (Math.random() + Math.random() - 1) * (Math.random() < 0.3 ? 0.04 : 0.012), speed: c.speed * (0.97 + Math.random() * 0.06) });   // good, not perfect: about one shot in three is loose
    if (P.breakShot) { P.plan = { aim: Math.atan2(balls[1].x - cue.x, balls[1].z - cue.z) + (Math.random() - 0.5) * 0.02, speed: 6.6 }; return; }
    if (!P.scan) {
      const targets = legal('her'), cands = [];
      for (const t of targets) for (const [px, pz] of POCKETS) {
        const qx = clamp(px, -L + 0.03, L - 0.03), qz = clamp(pz, -W + 0.02, W - 0.02);
        const d2 = Math.hypot(qx - t.x, qz - t.z); if (d2 < 0.01) continue;
        const ux = (qx - t.x) / d2, uz = (qz - t.z) / d2, gx = t.x - ux * 2 * R, gz = t.z - uz * 2 * R;
        const d1 = Math.hypot(gx - cue.x, gz - cue.z); if (d1 < 0.001) continue;
        const cut = ((gx - cue.x) * ux + (gz - cue.z) * uz) / d1; if (cut < 0.25) continue;                   // too thin a cut
        if (!clear(cue.x, cue.z, gx, gz, cue, t) || !clear(t.x, t.z, qx, qz, t, null)) continue;
        let speed = 6.5; for (let v = 1.2; v <= 6.5; v += 0.25) if (speedAfter(speedAfter(v, d1) * cut * 0.97, d2) > 0.9) { speed = v + 0.35; break; }
        cands.push({ aim: Math.atan2(gx - cue.x, gz - cue.z), speed: Math.min(speed, 6.5), score: cut * cut / (0.4 + d1 + d2 * 1.4) });
      }
      cands.sort((a, b) => b.score - a.score);
      P.scan = { cands: cands.slice(0, 16), ci: 0, ai: 0, safe: null, set: new Set(targets.map(t => t.n)), eight: !P.open && left(P.groups.her) === 0, first: targets[0] };
      return;
    }
    const sc = P.scan, N = 420;
    for (let budget = 0; budget < 26; budget++) {
      let c;
      if (sc.ci < sc.cands.length) c = sc.cands[sc.ci++];
      else if (sc.ai < N) { const i = sc.ai++; c = { aim: (i * 2 * Math.PI) / N, speed: i % 2 ? 3.1 : 4.7 }; }
      else { P.plan = wobble(sc.safe || sc.cands[0] || (sc.first ? { aim: Math.atan2(sc.first.x - cue.x, sc.first.z - cue.z), speed: 2.4 } : { aim: 0, speed: 2 })); P.scan = null; return; }
      const ev = simulate(balls, c.aim, c.speed);
      if (ev.scratch || ev.first === null || !sc.set.has(ev.first) || (ev.potted.includes(8) && !sc.eight)) continue;      // that would be a foul, or worse
      if (ev.potted.some(n => sc.set.has(n))) { P.plan = wobble(c); P.plan.kind = sc.ai ? 'scan' : 'direct'; P.plan.exact = c; P.scan = null; return; }
      if (!sc.safe) sc.safe = c;
    }
  }
  // where the aiming line ends: the first ball or cushion in the way
  function ray(aim) {
    const dx = Math.sin(aim), dz = Math.cos(aim); let t = 1e9, hit = null;
    for (const b of balls) { if (!b.on || b === cue) continue; const ox = b.x - cue.x, oz = b.z - cue.z, pr = ox * dx + oz * dz; if (pr <= 0) continue; const perp2 = ox * ox + oz * oz - pr * pr; if (perp2 >= 4 * R * R) continue; const tt = pr - Math.sqrt(4 * R * R - perp2); if (tt < t) { t = tt; hit = b; } }
    let tw = 1e9; if (dx > 0) tw = Math.min(tw, (L - R - cue.x) / dx); else if (dx < 0) tw = Math.min(tw, (-L + R - cue.x) / dx); if (dz > 0) tw = Math.min(tw, (W - R - cue.z) / dz); else if (dz < 0) tw = Math.min(tw, (-W + R - cue.z) / dz);
    if (tw < t) { t = tw; hit = null; }
    return { x: cue.x + dx * t, z: cue.z + dz * t, hit };
  }
  // where someone stands to play the cue ball along an aim: just off the table, behind the ball
  function stance(aim) { const dx = Math.sin(aim), dz = Math.cos(aim); let d = 0.5; while (d < 3 && Math.abs(cue.x - dx * d) < L + 0.6 && Math.abs(cue.z - dz * d) < W + 0.6) d += 0.05; return [cue.x - dx * d, cue.z - dz * d]; }

  // the bartender walks round the table (never across it) to wherever she needs to be
  const her = { x: 0, z: -W - 0.62, there: true };
  const across = (ax, az, bx, bz) => { for (let i = 1; i < 14; i++) { const t = i / 14, x = ax + (bx - ax) * t, z = az + (bz - az) * t; if (Math.abs(x) < L + 0.38 && Math.abs(z) < W + 0.38) return true; } return false; };
  function walkHer(tx, tz, ry, pose, dt) {
    if (P.jump) { P.jump = false; her.x = tx; her.z = tz; her.there = true; host.tender?.(tx, tz, ry, pose, true); return; }
    let gx = tx, gz = tz;
    if (across(her.x, her.z, tx, tz)) { let best = 1e9; for (const cx of [-1, 1]) for (const cz of [-1, 1]) { const x = cx * (L + 0.62), z = cz * (W + 0.62); if (across(her.x, her.z, x, z)) continue; const d = Math.hypot(x - her.x, z - her.z) + Math.hypot(tx - x, tz - z) + (across(x, z, tx, tz) ? 3 : 0); if (d < best) { best = d; gx = x; gz = z; } } }
    const d = Math.hypot(gx - her.x, gz - her.z), far = Math.hypot(tx - her.x, tz - her.z); her.there = far < 0.12;
    if (d > 0.02) { const m = Math.min(1, 2.9 * dt / d); her.x += (gx - her.x) * m; her.z += (gz - her.z) * m; }
    host.tender?.(her.x, her.z, far > 0.2 ? Math.atan2(gx - her.x, gz - her.z) : ry, far > 0.2 ? 'walk' : pose, false);
  }

  function hideGuides() { gAim.visible = gObj.visible = gCue.visible = ghost.visible = mark.visible = false; }

  const api = {
    P, balls, simulate: (a, s) => simulate(balls, a, s),
    get on() { return P.on; },
    get label() { return P.phase === 'over' ? 'RACK' : P.phase === 'place' ? 'PLACE' : 'SHOOT'; },
    start() { P.on = true; rack(); P.jump = true; watchSpot(); if (host.lamp) host.lamp.visible = false; say('8-ball — you break', 3); host.line?.('“Rack ’em up. You break.”'); },
    stop() { P.on = false; rack(); hideGuides(); stick.visible = false; if (host.lamp) host.lamp.visible = true; camera.up.set(0, 1, 0); },
    // the mouse (or a finger) slides a crosshair over the table; the cue points at it. With ball in hand it slides the cue ball.
    look(dx, dy = 0) {
      if (P.turn !== 'you' || (P.phase !== 'aim' && P.phase !== 'place')) return;
      const k = 0.0021, mx = (P.tall ? -dy : dx) * k, mz = (P.tall ? dx : dy) * k;
      if (P.phase === 'place') { const x = clamp(cue.x + mx, -L + R, L - R), z = clamp(cue.z + mz, -W + R, W - R); if (free(x, z, cue)) { cue.x = x; cue.z = z; } else if (free(x, cue.z, cue)) cue.x = x; else if (free(cue.x, z, cue)) cue.z = z; sync(); return; }
      P.tx = clamp(P.tx + mx, -L - 0.2, L + 0.2); P.tz = clamp(P.tz + mz, -W - 0.2, W + 0.2);
    },
    down() {
      if (P.phase === 'over') { rack(); say('New rack — you break', 2.5); host.line?.('“Again? You break.”'); return; }
      if (P.turn === 'you' && P.phase === 'place') { if (free(cue.x, cue.z, cue)) { P.phase = 'aim'; aimAtSomething(); } return; }
      if (P.turn === 'you' && P.phase === 'aim') { P.phase = 'power'; P.cT = 0; P.power = 0; }
    },
    up() { if (P.turn !== 'you' || P.phase !== 'power') return; if (P.cT > 0.07) shoot(P.aim, 0.5 + P.power * 6.3); else P.phase = 'aim'; },
    // test hook
    hit(aim, speed) { if (P.phase === 'aim' || P.phase === 'power' || P.phase === 'place') { P.aim = aim; shoot(aim, speed); } },
    update(dt, s) {
      P.msgT -= dt; P.strike -= dt;
      const mineTurn = P.turn === 'you';
      if (P.phase === 'aim' && mineTurn) {
        if (s) { const a = -s * dt * 0.5, cx = P.tx - cue.x, cz = P.tz - cue.z, co = Math.cos(a), si = Math.sin(a); P.tx = cue.x + cx * co + cz * si; P.tz = cue.z - cx * si + cz * co; }   // A/D: fine adjustment
        if (Math.hypot(P.tx - cue.x, P.tz - cue.z) > 0.03) P.aim = Math.atan2(P.tx - cue.x, P.tz - cue.z);
      }
      else if (P.phase === 'power') { P.cT += dt; const p = (P.cT / 1.15) % 2; P.power = p < 1 ? p : 2 - p; }
      else if (P.phase === 'think') {
        if (!P.plan) planStep();
        if (her.there && P.plan) P.thinkT -= dt;                 // she walks round to the cue ball first
        if (P.plan && P.thinkT <= 0) { P.aim = P.plan.aim; shoot(P.plan.aim, P.plan.speed); }
      } else if (P.phase === 'roll') {
        P.acc += Math.min(dt, 0.05); let moving = true;
        for (; P.acc >= H && moving; P.acc -= H) {
          const before = balls.map(b => [b.x, b.z]);
          moving = step(balls, H, P.ev);
          for (let k = 0; k < 16; k++) { const b = balls[k]; if (!b.on) continue; const mx = b.x - before[k][0], mz = b.z - before[k][1], d = Math.hypot(mx, mz); if (d > 1e-6) b.mesh.rotateOnWorldAxis(ax3.set(mz / d, 0, -mx / d), d / R); }
        }
        sync();
        if (!moving) resolve();
      }
      // the cue, the guide and where the bartender stands
      const aiming = P.phase === 'aim' || P.phase === 'power' || P.phase === 'think', showAim = P.phase === 'think' ? (P.plan ? P.plan.aim : P.aim) : P.aim;
      stick.visible = cue.on && (aiming || P.strike > 0);
      if (stick.visible) {
        const dx = Math.sin(showAim), dz = Math.cos(showAim);
        const pull = P.strike > 0 ? -0.02 : P.phase === 'power' ? 0.05 + P.power * 0.26 : P.phase === 'think' ? 0.1 + Math.sin(Math.max(0, 1.5 - P.thinkT) * 7) * 0.06 : 0.06 + Math.sin(performance.now() / 420) * 0.012;
        v3.set(-dx, 0.11, -dz).normalize(); stick.quaternion.setFromUnitVectors(UP, v3);
        stick.position.set(cue.x, Y + 0.004, cue.z).addScaledVector(v3, R + pull + 0.725);
      }
      const guide = mineTurn && (P.phase === 'aim' || P.phase === 'power') && cue.on; hideGuides();
      if (guide) {
        const r = ray(P.aim), dx = Math.sin(P.aim), dz = Math.cos(P.aim);
        setSeg(gAim, cue.x + dx * R, cue.z + dz * R, r.x, r.z, 0.007);
        if (r.hit) {
          const ux = (r.hit.x - r.x) / (2 * R), uz = (r.hit.z - r.z) / (2 * R), along = dx * ux + dz * uz;
          setSeg(gObj, r.hit.x + ux * R, r.hit.z + uz * R, r.hit.x + ux * (R + 0.18 + 0.5 * along), r.hit.z + uz * (R + 0.18 + 0.5 * along), 0.009);
          const tx = dx - ux * along, tz = dz - uz * along, tl = Math.hypot(tx, tz);
          if (tl > 0.08) setSeg(gCue, r.x, r.z, r.x + tx / tl * (0.12 + 0.3 * tl), r.z + tz / tl * (0.12 + 0.3 * tl), 0.006);
          ghost.visible = true; ghost.position.set(r.x, top + 0.004, r.z);
        }
        mark.visible = P.phase === 'aim'; mark.position.x = P.tx; mark.position.z = P.tz;
      }
      if (!mineTurn && (P.phase === 'think' || (P.phase === 'roll' && P.strike > -0.5)) && cue.on) { const a = P.plan ? P.plan.aim : P.aim, [sx, sz] = P.phase === 'think' ? stance(a) : [her.x, her.z]; walkHer(sx, sz, a, 'shoot', dt); }
      else walkHer(P.watch[0], P.watch[1], P.watch[2], 'watch', dt);
      // camera: straight down on the table, fitted to the screen (turned lengthways on a tall phone)
      { const o = host.origin, tall = camera.aspect < 1; P.tall = tall;
        const need = Math.max(tall ? 1.9 : 1.06, (tall ? 0.84 : 1.56) / camera.aspect), t = Math.max(0.36, need / 2.5), fov = 2 * Math.atan(t) * 180 / Math.PI;
        if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
        camera.up.set(tall ? 1 : 0, 0, tall ? 0 : -1); camera.position.set(o.x, o.y + top + need / t, o.z); camera.lookAt(o.x, o.y + top, o.z); }
      // HUD
      const chip = n => { const col = COLORS[n > 8 ? n - 8 : n]; return `<i style="display:inline-block;width:11px;height:11px;border-radius:50%;margin-left:4px;vertical-align:-1px;box-sizing:border-box;${n > 8 ? `background:#f6f3ea;border:3px solid ${col}` : `background:${col};border:1px solid rgba(255,255,255,.35)`}"></i>`; };
      const tag = w => { const g = P.groups[w]; if (P.open) return 'open table'; const mine = balls.filter(b => b.on && typeOf(b.n) === g); return mine.length ? `${NAME[g]}${mine.map(b => chip(b.n)).join('')}` : `on the 8${chip(8)}`; };
      const lit = ' style="border-color:#f2b441;box-shadow:0 0 0 1px #f2b441"';
      let html = `<div class="g-top"><div class="pill"${mineTurn && P.phase !== 'over' ? lit : ''}>You: ${tag('you')}</div><div class="pill"${!mineTurn && P.phase !== 'over' ? lit : ''}>Bartender: ${tag('her')}</div></div>`;
      if (P.msgT > 0) html += `<div class="g-msg" style="top:13%;font-size:26px">${P.msg}</div>`;
      if (P.phase === 'over') html += `<div class="g-prompt" style="top:auto;bottom:70px">${host.touch ? 'RACK — play again · ✕ to walk away' : 'Click to rack them again · <kbd>E</kbd> to walk away'}</div>`;
      else if (mineTurn && P.phase === 'place') html += `<div class="g-prompt" style="top:auto;bottom:70px">${host.touch ? 'Ball in hand — drag to move the cue ball, then PLACE' : 'Ball in hand — move the mouse to position the cue ball, click to set it down'}</div>`;
      else if (mineTurn && (P.phase === 'aim' || P.phase === 'power')) html += `<div class="g-bar golf" style="${host.touch ? 'top:58px;bottom:auto' : 'bottom:46px'}"><i style="width:${Math.round(P.power * 100)}%"></i><em>POWER</em></div><div class="g-tip">${host.touch ? 'Drag to aim · hold SHOOT for power, let go to shoot' : P.phase === 'power' ? 'Let go to shoot' : 'Move the mouse to aim (A/D to fine-tune) · hold click for power, release to shoot · E walks away'}</div>`;
      else if (!mineTurn && P.phase === 'think') html += `<div class="g-prompt" style="top:auto;bottom:70px">The bartender is lining one up…</div>`;
      return html;
    },
  };
  rack(); hideGuides(); stick.visible = false;
  return api;
}
