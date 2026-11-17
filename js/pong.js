// Beer pong against Pat, on the table in Lucky's.
// House rules: six cups each (3-2-1), two balls a turn, make both and you get the balls back. A bounce shot that drops
// is worth two cups, but the defender may swat a bounced ball away. Gentleman's re-rack: when a side is down to its last
// two cups, they are lined up one behind the other.
// Table space: the table runs along z. You throw from the +z end at Pat's cups, which sit at the -z end.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const spreadD = d => 0.017 + d * 0.006, spreadA = d => 0.006 + d * 0.003;    // the most your hand can push the ball off target: along the throw, and sideways (radians)
export const TOP = 0.78, HL = 1.2, HW = 0.38;     // table height, half length, half width
export const CUP_H = 0.115, RIM = 0.045, BASE = 0.031, BR = 0.02;
export const MOUTH = RIM - BR * 0.6;              // the ball drops in if its centre crosses the top of the cup this close to the middle
const OX = 0, OZ = 0.75;                          // the point your aim is measured from (the arrow's pivot)
const DMIN = 1.25, DSPAN = 0.85;                  // power 0..1 → how far from that point the ball comes down
const SWEEP = 0.8;                                // seconds for the power bar to run from empty to full
const HAND = { x: 0.13, y: TOP + 0.42, z: 0.02 };  // where your throws actually leave your hand (in view of the camera)
const PATHAND = { x: 0.12, y: TOP + 0.6, z: -HL - 0.22 };
const PAT_SIGMA = 0.0253;                         // Pat's aim error (metres): tuned so he makes about 55% of his shots
const G = 9.8, STEP = 1 / 240;
const rackAt = side => {                          // side -1: Pat's cups (your targets). +1: yours.
  const out = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) out.push({ x: (i - (2 - r) / 2) * 0.098, z: side * (1.05 - r * 0.085), on: true, mesh: null, gone: 0, wob: 0 });
  return out;
};
// the velocity that carries a ball from a to b in T seconds under gravity
export const aimVel = (a, b, T) => ({ vx: (b.x - a.x) / T, vy: (b.y - a.y + 0.5 * G * T * T) / T, vz: (b.z - a.z) / T });

// One physics step for the ball: gravity (integrated exactly), the mouths, rims and walls of every cup on the table,
// the table top and the floor. Sets b.sunk to the cup it drops into.
export function stepBall(b, cups, h = STEP) {
  const py = b.y;
  b.x += b.vx * h; b.z += b.vz * h; b.y += b.vy * h - 0.5 * G * h * h; b.vy -= G * h;
  const yT = TOP + CUP_H;
  for (const c of cups) {
    if (!c.on) continue;
    const dx = b.x - c.x, dz = b.z - c.z, dh = Math.hypot(dx, dz);
    if (dh > RIM + BR + 0.02) continue;
    if (py >= yT && b.y < yT && b.vy < 0 && dh < MOUTH) { b.sunk = c; b.y = yT; return b; }         // straight in
    // the lip: a ring around the top of the cup
    const ux = dh > 1e-6 ? dx / dh : 1, uz = dh > 1e-6 ? dz / dh : 0;
    const nx = b.x - (c.x + ux * RIM), ny = b.y - yT, nz = b.z - (c.z + uz * RIM), nd = Math.hypot(nx, ny, nz), touch = BR + 0.0035;
    if (nd < touch && nd > 1e-6) {
      const kx = nx / nd, ky = ny / nd, kz = nz / nd, vn = b.vx * kx + b.vy * ky + b.vz * kz;
      if (vn < 0) { const e = 0.5; b.vx -= (1 + e) * vn * kx; b.vy -= (1 + e) * vn * ky; b.vz -= (1 + e) * vn * kz; b.vx += (Math.random() - 0.5) * 0.3; b.vz += (Math.random() - 0.5) * 0.3; b.rims = (b.rims || 0) + 1; c.wob = 0.3; }
      b.x += kx * (touch - nd); b.y += ky * (touch - nd); b.z += kz * (touch - nd);
    }
    // the outside wall, below the lip
    if (b.y < yT - 0.003 && b.y > TOP - BR) {
      const wr = BASE + (RIM - BASE) * clamp((b.y - TOP) / CUP_H, 0, 1);
      if (dh < wr + BR) {
        const vr = b.vx * ux + b.vz * uz;
        if (vr < 0) { b.vx -= 1.45 * vr * ux; b.vz -= 1.45 * vr * uz; c.wob = Math.max(c.wob, 0.2); }
        b.x = c.x + ux * (wr + BR); b.z = c.z + uz * (wr + BR);
      }
    }
  }
  if (Math.abs(b.x) < HW && Math.abs(b.z) < HL && b.y < TOP + BR && py >= TOP + BR - 0.03) {         // the table top
    b.y = TOP + BR; b.bounces = (b.bounces || 0) + 1;
    if (b.vy < 0) { b.vy = -b.vy * 0.62; b.vx *= 0.88; b.vz *= 0.88; if (b.vy < 0.35) b.vy = 0; }
    if (b.vy === 0) { const f = Math.max(0, 1 - 1.4 * h); b.vx *= f; b.vz *= f; }
  } else if (b.y < BR) { b.y = BR; if (b.vy < 0) b.vy = -b.vy * 0.5; b.vx *= 0.8; b.vz *= 0.8; }
  return b;
}

export function createPong(THREE, host) {
  const { group, camera } = host;
  const L = c => new THREE.MeshLambertMaterial({ color: c }), B = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o });
  const add = (geo, m, x, y, z, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const flat = (geo, m, x, y, z, parent = group) => { const o = add(geo, m, x, y, z, parent); o.rotation.x = -Math.PI / 2; return o; };
  // the table: one slab, markings laid just above it so nothing shares a surface
  add(new THREE.BoxGeometry(HW * 2, 0.04, HL * 2), L(0x1b5f8f), 0, TOP - 0.02, 0);
  add(new THREE.BoxGeometry(HW * 2 + 0.05, 0.035, HL * 2 + 0.05), L(0xd9d4c8), 0, TOP - 0.06, 0);
  flat(new THREE.PlaneGeometry(0.014, HL * 2 - 0.06), B(0xffffff, 0.55), 0, TOP + 0.0015, 0);
  for (const k of [-1, 1]) { flat(new THREE.PlaneGeometry(0.014, HL * 2 - 0.06), B(0xffffff, 0.55), k * (HW - 0.03), TOP + 0.0015, 0); flat(new THREE.PlaneGeometry(HW * 2 - 0.046, 0.014), B(0xffffff, 0.55), 0, TOP + 0.0015, k * (HL - 0.03)); }
  for (const k of [-1, 1]) for (const j of [-1, 1]) add(new THREE.BoxGeometry(0.045, TOP - 0.08, 0.045), L(0x444a52), k * (HW - 0.07), (TOP - 0.08) / 2, j * (HL - 0.14));
  for (const j of [-1, 1]) add(new THREE.BoxGeometry(HW * 2 - 0.19, 0.03, 0.03), L(0x444a52), 0, 0.3, j * (HL - 0.14));
  // cups: solid, with beer to the brim and a white lip
  const cupG = new THREE.CylinderGeometry(RIM, BASE, CUP_H, 24), lipG = new THREE.TorusGeometry(RIM - 0.001, 0.0035, 6, 24), beerG = new THREE.CircleGeometry(RIM - 0.006, 22);
  const red = L(0xc8202a), white = L(0xf6f3ea), beer = L(0xdba02a);
  const sets = { pat: rackAt(-1), you: rackAt(1) };
  for (const k of ['pat', 'you']) for (const c of sets[k]) {
    const g = new THREE.Group(); g.position.set(c.x, TOP, c.z); group.add(g);                         // pivot at the base, so a cup can wobble
    add(cupG, red, 0, CUP_H / 2, 0, g); const r = add(lipG, white, 0, CUP_H, 0, g); r.rotation.x = Math.PI / 2; flat(beerG, beer, 0, CUP_H - 0.004, 0, g);
    c.mesh = g; c.side = k;
  }
  // the ball, its shadow and a short trail
  const ball = add(new THREE.SphereGeometry(BR, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x777777 }), 0, TOP + 0.5, HL + 0.2);
  const shadow = flat(new THREE.CircleGeometry(0.022, 14), B(0x000000, 0.35), 0, TOP + 0.003, 0);
  const TRAIL = 10, trail = Array.from({ length: TRAIL }, (_, i) => { const m = add(new THREE.SphereGeometry(BR * (0.8 - i * 0.06), 10, 8), B(0xffffff, 0.22 * (1 - i / TRAIL)), 0, 0, 0); m.visible = false; return m; }), hist = [];
  // splashes: a few drops of beer thrown up when a ball goes in
  const drops = Array.from({ length: 14 }, () => { const m = add(new THREE.SphereGeometry(0.006, 6, 5), B(0xf0b43c), 0, 0, 0); m.visible = false; return { m, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 }; });
  const ring = flat(new THREE.RingGeometry(0.03, 0.04, 22), B(0xffffff, 0.9), 0, TOP + CUP_H + 0.01, 0); ring.visible = false;
  // the aim arrow: direction only, drawn well short of the cups
  const aim = new THREE.Group(); aim.position.set(OX, TOP + 0.004, OZ); group.add(aim);
  { const m = B(0xffe066, 0.85); const shaft = flat(new THREE.PlaneGeometry(0.014, 0.4), m, 0, 0, -1.08, aim); const head = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.08, 3), m); head.rotation.x = -Math.PI / 2; head.position.set(0, 0, -1.31); aim.add(head); shaft.renderOrder = head.renderOrder = 2; }
  const hop = flat(new THREE.RingGeometry(0.02, 0.027, 20), B(0x9fd8ff, 0.9), 0, TOP + 0.004, 0); hop.material.depthTest = false; hop.renderOrder = 3;    // where a bounce shot touches down
  // the landing target: slides out with the power bar; its size is how far your hand may shake the ball off it
  const tgt = new THREE.Group(); group.add(tgt); tgt.visible = false;
  const tgtRing = flat(new THREE.RingGeometry(0.74, 1, 40), B(0xffe066, 0.9), 0, 0, 0, tgt), tgtFill = flat(new THREE.CircleGeometry(1, 40), B(0xffe066, 0.16), 0, 0, 0, tgt), tgtDot = flat(new THREE.CircleGeometry(0.006, 12), B(0xffffff, 1), 0, 0.0005, 0, tgt);
  for (const m of [tgtRing, tgtFill, tgtDot]) { m.material.depthTest = false; m.renderOrder = 3; }
  // your throwing hand, at the bottom of the screen: it holds the ball, cocks back with the power and flicks it away
  const arm = new THREE.Group(); arm.position.set(HAND.x + 0.03, HAND.y - 0.05, HAND.z + 0.16); group.add(arm);
  const wrist = new THREE.Group(); wrist.position.set(0, 0.0, -0.17); arm.add(wrist);
  { const skin = L(0xf0c8a6), sleeve = L(0x2b5fa8);
    add(new THREE.BoxGeometry(0.075, 0.07, 0.24), sleeve, 0, 0, -0.03, arm); add(new THREE.BoxGeometry(0.062, 0.058, 0.08), skin, 0, 0, -0.14, arm);
    add(new THREE.BoxGeometry(0.075, 0.03, 0.08), skin, 0, 0.0, -0.04, wrist);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.018, 0.016, 0.05), skin, -0.022 + i * 0.022, 0.012, -0.095, wrist);
    add(new THREE.BoxGeometry(0.018, 0.016, 0.04), skin, 0.042, 0.012, -0.06, wrist); }
  const held = add(new THREE.SphereGeometry(BR, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x777777 }), 0, 0.035, -0.1, wrist);
  arm.rotation.order = 'YXZ';
  const swatHand = add(new THREE.BoxGeometry(0.13, 0.17, 0.04), L(0xf0c8a6), 0, TOP + 0.2, 0.7); swatHand.visible = false;
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.024, 0.08, 0.03), L(0xf0c8a6), -0.045 + i * 0.03, 0.12, 0, swatHand);       // fingers
  // a bounce shot coming at you: where it will hit the table, and a glow round the ball (yellow: wait, green: swat now)
  const bounceMark = flat(new THREE.RingGeometry(0.05, 0.075, 32), B(0xffe066, 0.95), 0, TOP + 0.004, 0); bounceMark.material.depthTest = false; bounceMark.renderOrder = 4; bounceMark.visible = false;
  const glow = add(new THREE.SphereGeometry(BR * 2.2, 16, 12), B(0xffe066, 0.35), 0, 0, 0); glow.material.depthTest = false; glow.renderOrder = 4; glow.visible = false;
  const pat = host.pat; pat.g.position.set(0, 0, -HL - 0.42); group.add(pat.g);

  const P = {
    on: false, turn: 'you', phase: 'aim',          // aim | time | fly | pat | over
    ang: 0, sx: 0, tm: 0, cT: 0, lastPow: null, bounce: false, t: 0, fly: null, msg: '', msgT: 0, wait: 0, winner: null,
    ballNo: 1, made: 0, lost: 0, cam: 0, patArm: 0, swat: 0, swatLock: false, swatCool: 0, early: 0, ringT: 0, throws: 0, flick: 0, gents: { you: false, pat: false },
  };
  const left = k => sets[k].filter(c => c.on).length;
  const say = (m, t = 2) => { P.msg = m; P.msgT = t; };
  const pick = a => a[(Math.random() * a.length) | 0];
  const drinks = () => host.drinks?.() ?? 0;
  const allCups = () => sets.pat.concat(sets.you);

  function reset() {
    for (const k of ['pat', 'you']) { const fresh = rackAt(k === 'pat' ? -1 : 1); sets[k].forEach((c, i) => { Object.assign(c, { x: fresh[i].x, z: fresh[i].z, on: true, gone: 0, wob: 0 }); c.mesh.visible = true; c.mesh.scale.setScalar(1); c.mesh.position.set(c.x, TOP, c.z); c.mesh.rotation.set(0, 0, 0); c.slide = null; }); }
    Object.assign(P, { turn: 'you', phase: 'aim', ang: 0, lastPow: null, bounce: false, fly: null, winner: null, ballNo: 1, made: 0, lost: 0, wait: 0, swat: 0, swatLock: false, throws: 0, flick: 0, gents: { you: false, pat: false } });
    ball.visible = shadow.visible = ring.visible = swatHand.visible = false; hist.length = 0; for (const t of trail) t.visible = false;
  }
  // Throw: work out the velocity that carries the ball to the target (through a planned bounce on the table first, for a
  // bounce shot), then let the physics fly it, so it can clip a rim or the side of a cup on the way.
  function launch(who, to, bounce) {
    const from = who === 'you' ? { ...HAND } : { ...PATHAND }, yT = TOP + CUP_H;
    const dist = Math.hypot(to.x - from.x, to.z - from.z), T = who === 'you' ? 0.5 + dist * 0.06 : 0.62 + dist * 0.06;
    let b, mid = null;
    if (bounce) { mid = { x: from.x + (to.x - from.x) * 0.55, y: TOP + BR, z: from.z + (to.z - from.z) * 0.55 }; b = { ...from, ...aimVel(from, mid, T * 0.48) }; }
    else b = { ...from, ...aimVel(from, { x: to.x, y: yT, z: to.z }, T) };
    P.fly = { who, b, to: { x: to.x, y: yT, z: to.z }, mid, bounce, bounced: false, T2: T * 0.62, t: 0, blocked: false, end: 0, willBlock: who === 'you' && bounce && Math.random() < 0.4, blockAt: 0.3 + Math.random() * 0.2 };
    P.phase = 'fly'; ball.visible = shadow.visible = true; P.throws++; P.swat = 0; P.swatLock = false; hist.length = 0;
    if (who === 'you') P.flick = 0.001;

  }
  function takeCup(who, c) {                                // a cup comes off the table
    c.on = false; c.gone = 0.001;
    if (who === 'pat') { P.lost++; if (P.lost % 2 === 0) host.drink?.(); }       // two cups is about one beer
  }
  function splashAt(c) {
    ring.visible = true; ring.position.set(c.x, TOP + CUP_H + 0.012, c.z); P.ringT = 0.001;
    for (const d of drops) { const a = Math.random() * 6.28, s = 0.25 + Math.random() * 0.5; Object.assign(d, { x: c.x, y: TOP + CUP_H, z: c.z, vx: Math.cos(a) * s, vy: 0.8 + Math.random() * 0.9, vz: Math.sin(a) * s, t: 0.6 + Math.random() * 0.3 }); d.m.visible = true; }
  }
  function sunk(c) {
    const f = P.fly, who = f.who, cups = sets[who === 'you' ? 'pat' : 'you'];
    if (c.side === (who === 'you' ? 'you' : 'pat')) { f.inCup = c; f.end = 0.6; missed(); return; }      // into your own cup: it does not count
    takeCup(who, c); let n = 1;
    if (f.bounced) { const more = cups.filter(x => x.on).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0]; if (more) { takeCup(who, more); n = 2; } }
    P.made++; splashAt(c); f.inCup = c; f.end = 0.55;
    const done = !left(who === 'you' ? 'pat' : 'you'), rimIn = f.b.rims > 0;
    if (who === 'you') { say(done ? 'You win!' : n === 2 ? 'Bounced in — two cups!' : rimIn ? 'Rattles in!' : 'Sunk it!', done ? 99 : 1.8); if (done || Math.random() < 0.6) host.line?.(done ? '“Good game. Rematch?”' : pick(['“Lucky shot.”', '“Okay, okay.”', '“Fine. Cheers.”', '“Who taught you that?”'])); }
    else { say(done ? 'Pat wins' : n === 2 ? 'Pat bounces one in — two cups' : 'Pat sinks one', done ? 99 : 1.8); host.line?.(done ? '“That is game. Next round is on you.”' : pick(['“Drink up.”', '“That is how it is done.”', '“Splash.”', '“You are going to feel that one.”'])); }
    if (done) { P.winner = who; f.final = true; }
  }
  function blocked() {                                      // a bounced ball gets swatted away
    const f = P.fly, b = f.b; f.blocked = true;
    b.vx = (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random()); b.vy = 1.6; b.vz = (f.who === 'you' ? 1 : -1) * 0.8; f.end = 0.9;
    if (f.who === 'pat') P.swat = 0.35;
    if (f.who === 'you') { say('Pat swats it away', 1.4); host.line?.(pick(['“Not in my house.”', '“Bounces are fair game.”', '“Get that out of here.”'])); } else { say('Swatted! 🖐', 1.6); host.line?.(pick(['“Hey!”', '“Good hands.”'])); }
  }
  function missed() {
    const f = P.fly; if (f.said) return; f.said = true;
    if (f.who === 'you') say(f.b.rims ? 'Off the rim' : 'Miss', 1.1); else if (Math.random() < 0.35) host.line?.(pick(['“Rim. Come on.”', '“I was robbed.”', '“Warming up.”']));
  }
  // Gentleman's re-rack: the last two cups are lined up one behind the other, down the middle
  function gents() {
    for (const k of ['you', 'pat']) {
      const on = sets[k].filter(c => c.on); if (on.length !== 2 || P.gents[k]) continue;
      P.gents[k] = true; const s = k === 'pat' ? -1 : 1;
      on.sort((a, b) => Math.abs(a.z) - Math.abs(b.z)).forEach((c, i) => { c.slide = { x0: c.x, z0: c.z, x1: 0, z1: s * (0.88 + i * 0.097), t: 0 }; c.x = 0; c.z = s * (0.88 + i * 0.097); });
      say(k === 'pat' ? 'Gentleman’s: Pat’s last two cups in a line' : 'Gentleman’s: your last two cups in a line', 2.2);
      if (k === 'you') host.line?.('“Gentleman’s. Line ’em up.”');
    }
  }
  function nextBall() {
    const who = P.fly.who; P.fly = null; ball.visible = shadow.visible = false; for (const t of trail) t.visible = false;
    if (P.winner) { P.phase = 'over'; return; }
    gents();
    if (P.ballNo === 1) P.ballNo = 2;
    else if (P.made === 2) { P.ballNo = 1; P.made = 0; if (P.msgT < 1) say(who === 'you' ? 'Both in — balls back!' : 'Pat made both — balls back', 2); if (who === 'pat') host.line?.('“Balls back. Stay there.”'); }
    else { P.turn = who === 'you' ? 'pat' : 'you'; P.ballNo = 1; P.made = 0; }
    if (P.turn === 'pat') { P.phase = 'pat'; P.wait = 1.35; } else P.phase = 'aim';
  }
  // Pat picks a cup (sometimes a bounce shot) and throws at it with a steady but human hand
  function patThrow(force) {
    const mine = sets.you.filter(c => c.on), t = pick(mine), bounce = force ?? Math.random() < 0.2, g = () => { let u = 0; while (!u) u = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * Math.random()); };
    const s = PAT_SIGMA * (bounce ? 1.15 : 1);
    launch('pat', { x: t.x + g() * s, z: t.z + g() * s }, bounce);
  }

  const api = {
    P, sets,
    get on() { return P.on; },
    get label() { return P.phase === 'over' ? 'REMATCH' : P.phase === 'fly' && P.fly?.who === 'pat' && P.fly.bounce ? 'SWAT' : 'THROW'; },
    get alt() { return P.on && P.turn === 'you' && P.phase === 'aim' ? (P.bounce ? 'LOB' : 'BOUNCE') : null; },     // the second button on phones
    start() { P.on = true; reset(); pat.g.visible = true; say('Beer pong — two balls a turn', 2.6); host.line?.('“Rack ’em. Loser buys.”'); },
    stop() { P.on = false; reset(); pat.g.visible = false; aim.visible = hop.visible = arm.visible = false; },
    key(code) { if (code === 'KeyB' && P.turn === 'you' && P.phase === 'aim') P.bounce = !P.bounce; },
    look(dx) { if (P.turn === 'you' && P.phase === 'aim') P.ang = clamp(P.ang + dx * 0.00045, -0.22, 0.22); },
    down() {
      if (P.phase === 'over') { reset(); say('New game — you throw first', 2.2); host.line?.('“Run it back.”'); return; }
      const f = P.fly;
      if (P.phase === 'fly' && f.who === 'pat' && f.bounce && !f.blocked && !f.inCup && !P.swatLock) {     // your swat at Pat's bounce: only once it has hit the table
        if (P.swatCool > 0) return;
        P.swat = 0.3;
        if (!f.bounced) { P.swatCool = 0.35; P.early = 0.7; } else blocked();
        return;
      }
      if (P.turn === 'you' && P.phase === 'aim') { P.phase = 'time'; P.cT = 0; P.tm = 0; }
    },
    up() {
      if (P.turn !== 'you' || P.phase !== 'time') return;
      if (P.cT < 0.06) { P.phase = 'aim'; return; }
      // where it lands: power sets the distance, the arrow sets the direction, and your hand is never perfectly steady
      const d = drinks(), shake = () => (Math.random() + Math.random() - 1);
      const dist = DMIN + P.tm * DSPAN + shake() * spreadD(d), th = P.ang + P.sx + shake() * spreadA(d);
      P.lastPow = P.tm;
      launch('you', { x: OX + Math.sin(th) * dist, z: OZ - Math.cos(th) * dist }, P.bounce);
    },
    // test hooks: throw straight at a spot, and Pat's throw
    throwAt(x, z, bounce = false) { if (P.turn === 'you' && (P.phase === 'aim' || P.phase === 'time')) launch('you', { x, z }, bounce); },
    patThrow,
    update(dt, s) {
      P.t += dt; P.msgT -= dt; P.swat -= dt; P.swatCool -= dt; P.early -= dt;
      const incoming = P.phase === 'fly' && P.fly && P.fly.who === 'pat' && P.fly.bounce && !P.fly.blocked && !P.fly.inCup && !P.fly.end;
      const fdt = incoming ? dt * 0.45 : dt;                       // half speed while you have a bounce shot to swat
      const d = drinks(); P.sx = (Math.sin(P.t * 1.9) * 0.006 + Math.sin(P.t * 3.3) * 0.0025) * (0.35 + d);                // the arrow drifts a little, and a lot more after a few beers
      if (P.phase === 'aim' && P.turn === 'you') P.ang = clamp(P.ang + s * dt * 0.12, -0.22, 0.22);
      else if (P.phase === 'time') { P.cT += dt; const p = (P.cT / SWEEP) % 2; P.tm = p < 1 ? p : 2 - p; }
      else if (P.phase === 'pat') { P.wait -= dt; P.patArm = clamp(1 - P.wait / 0.8, 0, 1); if (P.wait <= 0) patThrow(); }
      if (P.phase === 'fly') {
        const f = P.fly, b = f.b, cups = allCups();
        f.t += fdt;
        if (f.inCup) { const c = f.inCup; b.y = Math.max(TOP + CUP_H - 0.03, b.y - dt * 0.25); b.x += (c.x - b.x) * Math.min(1, dt * 10); b.z += (c.z - b.z) * Math.min(1, dt * 10); }   // the ball settles into the beer
        else for (let n = Math.ceil(Math.min(fdt, 0.05) / STEP), i = 0; i < n; i++) {
          if (f.bounce && !f.bounced && b.vy < 0 && b.y + b.vy * STEP - 0.5 * G * STEP * STEP <= TOP + BR && Math.abs(b.z - f.mid.z) < 0.25) {     // the planned bounce: off the table and on towards the cup
            f.bounced = true; b.x += b.vx * STEP; b.z += b.vz * STEP; Object.assign(b, { y: TOP + BR, ...aimVel({ x: b.x, y: TOP + BR, z: b.z }, f.to, f.T2) }); f.tb = f.t; continue;
          }
          stepBall(b, cups);
          if (b.sunk) { const c = b.sunk; b.sunk = null; sunk(c); if (f.inCup || f.end) break; }
          if (f.bounced && f.willBlock && !f.blocked && f.t - f.tb > f.blockAt * f.T2) { blocked(); break; }      // Pat gets a hand to it
        }
        if (!f.inCup && !f.blocked && (b.y < TOP - 0.05 || (b.vy === 0 && Math.hypot(b.vx, b.vz) < 0.15) || f.t > 1.3 + (f.bounce ? 0.5 : 0))) { missed(); if (!f.end) f.end = 0.5; }
        if (f.end) { f.end -= dt; if (f.end <= 0) { if (f.final) { P.fly = null; ball.visible = shadow.visible = false; for (const t of trail) t.visible = false; P.phase = 'over'; } else nextBall(); } }
        if (P.fly) {
          ball.position.set(b.x, b.y, b.z); ball.rotation.x += dt * 25; ball.rotation.y += dt * 9;
          const onT = Math.abs(b.x) < HW && Math.abs(b.z) < HL && b.y > TOP; shadow.visible = onT && !f.inCup; shadow.position.set(b.x, TOP + 0.003, b.z); shadow.scale.setScalar(clamp(1.3 - (b.y - TOP) * 0.8, 0.5, 1.2));
          const h0 = hist[0]; if (!h0 || Math.hypot(b.x - h0[0], b.y - h0[1], b.z - h0[2]) > 0.035) { hist.unshift([b.x, b.y, b.z]); if (hist.length > TRAIL + 1) hist.length = TRAIL + 1; }     // spaced by distance, so it looks the same at any frame rate
          trail.forEach((m, i) => { const p = hist[i + 1]; m.visible = !!p && !f.inCup; if (p) m.position.set(p[0], p[1], p[2]); });
        }
      }
      bounceMark.visible = incoming && !P.fly.bounced; glow.visible = incoming;
      if (incoming) {
        const fb = P.fly; if (!fb.bounced) { bounceMark.position.set(fb.mid.x, TOP + 0.004, fb.mid.z); bounceMark.scale.setScalar(1 + Math.sin(P.t * 12) * 0.18); }
        glow.position.copy(ball.position); glow.material.color.setHex(fb.bounced ? 0x46e07a : 0xffe066); glow.material.opacity = fb.bounced ? 0.5 : 0.32;
      }
      // cups: lift away when taken, wobble when hit, slide into a gentleman's line
      for (const c of allCups()) {
        if (c.gone > 0) { c.gone += dt; c.mesh.position.y = TOP + c.gone * 0.5; c.mesh.scale.setScalar(Math.max(0.01, 1 - c.gone * 2.6)); if (c.gone > 0.38) { c.mesh.visible = false; c.gone = 0; } continue; }
        if (c.slide) { const sl = c.slide; sl.t = Math.min(1, sl.t + dt * 2); const k = sl.t * sl.t * (3 - 2 * sl.t); c.mesh.position.x = sl.x0 + (sl.x1 - sl.x0) * k; c.mesh.position.z = sl.z0 + (sl.z1 - sl.z0) * k; if (sl.t >= 1) c.slide = null; }
        if (c.wob > 0) { c.wob = Math.max(0, c.wob - dt); const a = c.wob * 0.5 * Math.sin(c.wob * 60); c.mesh.rotation.set(a, 0, a * 0.6); } else if (c.mesh.rotation.x) c.mesh.rotation.set(0, 0, 0);
      }
      if (P.ringT > 0) { P.ringT += dt; ring.scale.setScalar(1 + P.ringT * 5); ring.material.opacity = Math.max(0, 0.9 - P.ringT * 2.4); if (P.ringT > 0.4) { ring.visible = false; P.ringT = 0; } }
      for (const dp of drops) if (dp.t > 0) { dp.t -= dt; dp.vy -= G * dt; dp.x += dp.vx * dt; dp.y += dp.vy * dt; dp.z += dp.vz * dt; dp.m.position.set(dp.x, dp.y, dp.z); dp.m.visible = dp.t > 0 && dp.y > TOP; }
      // the arrow, the landing target and the first touch of a bounce shot
      const mine = P.turn === 'you' && (P.phase === 'aim' || P.phase === 'time');
      aim.visible = mine; hop.visible = false; const timing = mine && P.phase === 'time'; tgt.visible = timing;
      if (mine) aim.rotation.y = -(P.ang + P.sx);
      if (timing) {
        const th = P.ang + P.sx, dist = DMIN + P.tm * DSPAN, x = OX + Math.sin(th) * dist, z = OZ - Math.cos(th) * dist, dr = drinks();
        let near = 1e9; for (const c of sets.pat) if (c.on) near = Math.min(near, Math.hypot(c.x - x, c.z - z));
        const overCup = near < RIM + 0.004, y = overCup ? TOP + CUP_H + 0.006 : TOP + 0.004;
        const r = Math.max(0.026, Math.hypot(spreadD(dr), spreadA(dr) * dist) * 0.95);
        tgt.position.set(x, y, z); tgt.scale.setScalar(r);
        const good = near < MOUTH * 0.75; tgtRing.material.color.setHex(good ? 0x46e07a : 0xffe066); tgtFill.material.color.setHex(good ? 0x46e07a : 0xffe066); tgtFill.material.opacity = good ? 0.3 : 0.16;
        if (P.bounce) { hop.visible = true; hop.position.set(HAND.x + (x - HAND.x) * 0.55, TOP + 0.004, HAND.z + (z - HAND.z) * 0.55); }
      }
      // your hand: holds the ball while you aim, cocks back with the power, flicks through on release
      const handUp = P.turn === 'you' && P.phase !== 'over' && (mine || (P.phase === 'fly' && P.fly?.who === 'you' && P.flick > 0 && P.flick < 0.45));
      arm.visible = handUp; held.visible = mine;
      if (P.flick > 0) P.flick += dt;
      if (handUp) {
        const cock = P.phase === 'time' ? P.tm : 0, fl = P.flick > 0 ? clamp(P.flick / 0.14, 0, 1) : 0;
        arm.rotation.x = 0.2 + cock * 0.45 - fl * 0.9; wrist.rotation.x = cock * 0.9 - fl * 1.5; arm.rotation.y = -(P.ang + P.sx) * 0.6;
        arm.position.y = HAND.y - 0.05 + Math.sin(P.t * 2.1) * 0.004;
      }
      if (P.phase === 'aim' && P.flick) P.flick = 0;
      // Pat: idle sway, wind up and throw, and a swat when he blocks
      pat.g.position.y = Math.sin(P.t * 1.6) * 0.005; pat.g.rotation.y = Math.sin(P.t * 0.7) * 0.05;
      const f = P.fly, throwing = P.phase === 'pat' ? P.patArm : f && f.who === 'pat' && f.t < 0.25 ? -1 : 0, swatting = f && f.who === 'you' && f.blocked && f.t - (f.tb || 0) < 0.6;
      const armTo = swatting ? -1.5 : throwing > 0 ? -2.1 * throwing : throwing < 0 ? 0.5 : 0;
      pat.armR.rotation.x += (armTo - pat.armR.rotation.x) * Math.min(1, dt * 12); pat.armR.rotation.z = swatting ? -0.9 : 0.07;
      const cheer = P.phase === 'over' && P.winner === 'pat'; pat.armL.rotation.x = cheer ? -2.8 : 0; if (cheer) pat.armR.rotation.x = -2.8;
      pat.head.rotation.x = P.phase === 'fly' ? -0.1 : 0.12;
      swatHand.visible = P.swat > 0 && P.turn === 'pat'; if (swatHand.visible) { const k = 1 - P.swat / 0.3, bp = ball.position; swatHand.position.set(bp.x - 0.18 + k * 0.36, Math.max(TOP + 0.1, bp.y), bp.z + 0.06); swatHand.rotation.z = 0.6 - k * 1.2; }
      // camera: over the table looking at Pat's cups on your turn; pulled back onto your own cups when he throws
      const o = host.origin, tall = camera.aspect < 1, fov = tall ? 74 : 50, over = P.phase === 'over';
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      P.cam += ((P.turn === 'pat' && !over ? 1 : 0) - P.cam) * Math.min(1, dt * 3.5);
      camera.up.set(0, 1, 0); camera.position.set(o.x, o.y + TOP + 0.8, o.z + 0.3 + (HL + 1.0) * P.cam); camera.lookAt(o.x, o.y + TOP + 0.05, o.z - 1.0 + 1.35 * P.cam);
      // HUD
      const lit = ' style="border-color:#f2b441;box-shadow:0 0 0 1px #f2b441"', balls = `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#fff;margin-left:5px;vertical-align:0"></i>`;
      let html = `<div class="g-top"><div class="pill"${P.turn === 'you' && !over ? lit : ''}>You: ${left('you')} cups${P.turn === 'you' && !over ? balls.repeat(3 - P.ballNo - (P.phase === 'fly' ? 1 : 0)) : ''}</div><div class="pill"${P.turn === 'pat' && !over ? lit : ''}>Pat: ${left('pat')} cups${P.turn === 'pat' && !over ? balls.repeat(Math.max(0, 3 - P.ballNo - (P.phase === 'fly' ? 1 : 0))) : ''}</div></div>`;
      if (P.msgT > 0 && !incoming) html += `<div class="g-msg" style="top:15%;font-size:28px">${P.msg}</div>`;
      if (over) html += `<div class="g-prompt" style="top:auto;bottom:70px">${host.touch ? 'REMATCH — play again · ✕ to walk away' : 'Click for a rematch · <kbd>E</kbd> to walk away'}</div>`;
      else if (mine) {
        const pos = host.touch ? 'top:58px' : 'bottom:54px';
        html += `<div style="position:absolute;left:50%;${pos};transform:translateX(-50%);width:min(320px,72vw)"><div style="display:flex;justify-content:space-between;font-size:11px;letter-spacing:.08em;color:rgba(255,255,255,.7);margin-bottom:3px"><span>SHORT</span><span>POWER</span><span>LONG</span></div><div style="position:relative;height:16px;border-radius:999px;background:rgba(16,21,31,.85);border:1px solid rgba(255,255,255,.25);overflow:hidden"><i style="position:absolute;left:0;top:0;bottom:0;width:${(P.phase === 'time' ? P.tm : 0) * 100}%;background:linear-gradient(90deg,#2fae5c,#f2b441,#d64545)"></i>${P.lastPow !== null ? `<i title="last throw" style="position:absolute;left:calc(${P.lastPow * 100}% - 1px);width:2px;top:0;bottom:0;background:#fff;opacity:.85"></i>` : ''}</div></div>`;
        html += `<div class="g-prompt" style="top:auto;bottom:${host.touch ? 'auto;top:100px' : '92px'};font-size:12.5px">${P.bounce ? 'Bounce shot: worth 2 cups, but Pat can swat it' : 'Lob shot'}${host.touch ? '' : ' · <kbd>B</kbd> switches'}</div>`;
        html += `<div class="g-tip">${host.touch ? 'Drag to point the arrow · hold THROW and let go when the target is over a cup' : P.phase === 'time' ? 'Let go when the target is over a cup — it glows green when you are dead on' : 'Mouse or A/D points the arrow · hold click and let go at the right power · B for a bounce shot · E walks away'}</div>`;
      } else if (P.phase === 'pat') html += `<div class="g-prompt" style="top:auto;bottom:70px">Pat is lining one up…</div>`;
      if (incoming) {
        const now = P.fly.bounced, how = host.touch ? 'tap SWAT' : 'click or press Space';
        html += `<div style="position:absolute;left:50%;bottom:${host.touch ? 30 : 14}%;transform:translateX(-50%);text-align:center;pointer-events:none;background:rgba(10,12,18,.62);border-radius:16px;padding:10px 22px">
          <div style="font:800 ${now ? 46 : 26}px Georgia,serif;color:${now ? '#46e07a' : '#ffe066'};text-shadow:0 2px 12px rgba(0,0,0,.7)">${now ? 'SWAT NOW!' : 'Bounce shot incoming!'}</div>
          <div style="margin-top:6px;font-size:14px;color:#fff;text-shadow:0 1px 6px rgba(0,0,0,.8)">${now ? how : `Wait for it to hit the table at the <b style="color:#ffe066">yellow ring</b>, then ${how}`}</div>
          ${P.early > 0 ? '<div style="margin-top:6px;font-size:14px;color:#ff9a9a;font-weight:700">Too early — wait for the bounce</div>' : ''}</div>`;
      }
      return html;
    },
  };
  reset(); pat.g.visible = false; aim.visible = hop.visible = arm.visible = false;
  return api;
}
