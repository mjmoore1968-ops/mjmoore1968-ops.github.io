// Beer pong against Pat, on the table in Lucky's. Ten cups each. Every cup he sinks is a beer you drink.
// Table space: the table runs along z. You throw from the +z end at Pat's cups, which sit at the -z end.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TOP = 0.78, HL = 1.2, HW = 0.38;       // table height, half length, half width
const CUP_H = 0.12, RIM = 0.046;
const rackAt = side => {                     // side -1: Pat's cups (your targets). +1: yours.
  const out = []; for (let r = 0; r < 4; r++) for (let i = 0; i < 4 - r; i++) out.push({ x: (i - (3 - r) / 2) * 0.1, z: side * (1.06 - r * 0.0866), on: true, mesh: null, sink: 0 });
  return out;
};

export function createPong(THREE, host) {
  const { group, camera } = host;
  const L = c => new THREE.MeshLambertMaterial({ color: c });
  const add = (geo, m, x, y, z, parent = group) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  // the table
  add(new THREE.BoxGeometry(HW * 2, 0.05, HL * 2), L(0x1d5c8a), 0, TOP - 0.025, 0);
  add(new THREE.BoxGeometry(HW * 2 + 0.04, 0.03, HL * 2 + 0.04), L(0xe9e4d8), 0, TOP - 0.062, 0);
  add(new THREE.BoxGeometry(0.02, 0.002, HL * 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }), 0, TOP + 0.001, 0);
  for (const k of [-1, 1]) for (const j of [-1, 1]) add(new THREE.BoxGeometry(0.05, TOP - 0.07, 0.05), L(0x444a52), k * (HW - 0.06), (TOP - 0.07) / 2, j * (HL - 0.12));
  for (const j of [-1, 1]) add(new THREE.BoxGeometry(HW * 2 - 0.12, 0.03, 0.03), L(0x444a52), 0, 0.3, j * (HL - 0.12));
  const cupG = new THREE.CylinderGeometry(RIM, 0.032, CUP_H, 16, 1, true), rimG = new THREE.TorusGeometry(RIM, 0.004, 6, 18), beerG = new THREE.CircleGeometry(RIM - 0.006, 14);
  const red = new THREE.MeshLambertMaterial({ color: 0xc8202a, side: THREE.DoubleSide }), white = L(0xf6f3ea), beer = L(0xd89a22);
  const sets = { pat: rackAt(-1), you: rackAt(1) };
  for (const k of ['pat', 'you']) for (const c of sets[k]) {
    const g = new THREE.Group(); g.position.set(c.x, TOP + CUP_H / 2, c.z); group.add(g);
    add(cupG, red, 0, 0, 0, g); const r = add(rimG, white, 0, CUP_H / 2, 0, g); r.rotation.x = Math.PI / 2; const b = add(beerG, beer, 0, CUP_H * 0.1, 0, g); b.rotation.x = -Math.PI / 2;
    c.mesh = g;
  }
  const ball = add(new THREE.SphereGeometry(0.02, 12, 9), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x555555 }), 0, TOP + 0.5, HL + 0.2);
  const lane = add(new THREE.BoxGeometry(0.014, 0.001, 1.5), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }), 0, TOP + 0.003, -0.45);
  const ring = add(new THREE.RingGeometry(0.03, 0.043, 22), new THREE.MeshBasicMaterial({ color: 0xffe066, side: THREE.DoubleSide, depthTest: false }), 0, TOP + CUP_H + 0.004, 0); ring.rotation.x = -Math.PI / 2;
  // Pat stands at his end
  const pat = host.pat; pat.g.position.set(0, 0, -HL - 0.42); group.add(pat.g);

  const P = { on: false, turn: 'you', phase: 'aim', ax: 0, power: 0, cT: 0, t: 0, fly: null, msg: '', msgT: 0, wait: 0, winner: null, throws: 0, sway: 0, patArm: 0, cam: 0 };
  const left = k => sets[k].filter(c => c.on).length;
  const say = (m, t = 2.2) => { P.msg = m; P.msgT = t; };
  const PAT_HIT = ['“Drink up.”', '“That is how it is done.”', '“Splash.”', '“You are going to feel that one.”'];
  const PAT_MISS = ['“Rim. Come on.”', '“I was robbed.”', '“Warming up.”'];
  const PAT_SUNK = ['“Lucky shot.”', '“Okay, okay.”', '“Fine. Cheers.”', '“Who taught you that?”'];

  function reset() {
    for (const k of ['pat', 'you']) for (const c of sets[k]) { c.on = true; c.sink = 0; c.mesh.visible = true; c.mesh.position.y = TOP + CUP_H / 2; c.mesh.scale.setScalar(1); }
    Object.assign(P, { turn: 'you', phase: 'aim', ax: 0, power: 0, fly: null, winner: null, throws: 0, wait: 0 }); ball.visible = false;
  }
  // a throw: from a hand to a landing point, on a simple arc
  function launch(from, to, who) {
    const cups = sets[who === 'you' ? 'pat' : 'you']; let hit = null, rim = false, best = 1e9;
    for (const c of cups) { if (!c.on) continue; const d = Math.hypot(c.x - to.x, c.z - to.z); if (d < best) { best = d; hit = c; } }
    if (best > RIM * 1.18) hit = null; else if (best > RIM * 0.8) { rim = true; }
    const onTable = Math.abs(to.x) < HW && Math.abs(to.z) < HL;
    P.fly = { from, to: { x: to.x, y: hit && !rim ? TOP + CUP_H * 0.6 : hit ? TOP + CUP_H : onTable ? TOP + 0.02 : 0.02, z: to.z }, t: 0, T: 0.78, who, hit: rim ? null : hit, rim, onTable, bounce: null };
    P.phase = 'fly'; ball.visible = true; P.throws++;
  }
  function landed() {
    const f = P.fly, who = f.who;
    if (f.hit) {
      f.hit.on = false; f.hit.sink = 0.001; ball.visible = false;
      if (who === 'you') { say(left('pat') ? 'Sunk it!' : 'You win!', left('pat') ? 2 : 99); host.line?.(left('pat') ? PAT_SUNK[(Math.random() * PAT_SUNK.length) | 0] : '“Good game. Rematch?”'); }
      else { say(left('you') ? 'Pat sinks one — you drink' : 'Pat wins', left('you') ? 2.2 : 99); host.line?.(left('you') ? PAT_HIT[(Math.random() * PAT_HIT.length) | 0] : '“That is game. Next round is on you.”'); host.drink?.(); }
      if (!left('pat') || !left('you')) { P.winner = left('pat') ? 'pat' : 'you'; P.phase = 'over'; P.fly = null; return; }
      next(who);
    } else {                                              // off the rim, off the table, or wide
      const dir = who === 'you' ? -1 : 1;
      f.bounce = { x: f.to.x, y: f.to.y, z: f.to.z, vx: (Math.random() - 0.5) * 0.8, vy: f.rim ? 1.9 : f.onTable ? 1.5 : 0.6, vz: dir * (0.9 + Math.random() * 0.6), t: 0 };
      if (who === 'you') say(f.rim ? 'Off the rim' : f.onTable ? 'Miss' : 'Way off', 1.4); else if (Math.random() < 0.4) host.line?.(PAT_MISS[(Math.random() * PAT_MISS.length) | 0]);
    }
  }
  function next(who) { P.fly = null; P.turn = who === 'you' ? 'pat' : 'you'; if (P.turn === 'pat') { P.phase = 'pat'; P.wait = 1.5; } else { P.phase = 'aim'; ball.visible = false; } }
  const depth = p => HL - (1.3 + p * 1.2);                 // power 0..1 → where along the table the ball comes down
  const drinks = () => host.drinks?.() ?? 0;

  const api = {
    P, sets,
    get on() { return P.on; },
    get label() { return P.phase === 'over' ? 'REMATCH' : 'THROW'; },
    start() { P.on = true; reset(); pat.g.visible = true; say('Beer pong — you throw first', 2.6); host.line?.('“Rack ’em. Loser buys.”'); },
    stop() { P.on = false; reset(); pat.g.visible = false; lane.visible = ring.visible = false; },
    look(dx) { if (P.turn === 'you' && P.phase === 'aim') P.ax = clamp(P.ax + dx * 0.0011, -HW + 0.03, HW - 0.03); },
    down() {
      if (P.phase === 'over') { reset(); say('New game — you throw first', 2.2); host.line?.('“Run it back.”'); return; }
      if (P.turn === 'you' && P.phase === 'aim') { P.phase = 'power'; P.cT = 0; P.power = 0; }
    },
    up() {
      if (P.turn !== 'you' || P.phase !== 'power') return;
      if (P.cT < 0.07) { P.phase = 'aim'; return; }
      const d = drinks(), n = 0.006 + d * 0.0035;       // the more you have had, the shakier the hand
      launch({ x: P.ax * 0.5, y: TOP + 0.62, z: HL + 0.35 }, { x: P.ax + P.sway + (Math.random() - 0.5) * 2 * n, z: depth(P.power) + (Math.random() - 0.5) * 2 * n }, 'you');
    },
    // test hook: throw straight at a spot
    throwAt(x, z) { if (P.turn === 'you' && (P.phase === 'aim' || P.phase === 'power')) launch({ x: 0, y: TOP + 0.62, z: HL + 0.35 }, { x, z }, 'you'); },
    update(dt, s) {
      P.t += dt; P.msgT -= dt;
      const d = drinks(); P.sway = Math.sin(P.t * 1.9) * 0.008 * d + Math.sin(P.t * 3.1) * 0.004 * d;
      if (P.phase === 'aim' && P.turn === 'you') P.ax = clamp(P.ax + s * dt * 0.25, -HW + 0.03, HW - 0.03);
      else if (P.phase === 'power') { P.cT += dt; const p = (P.cT / 1.5) % 2; P.power = p < 1 ? p : 2 - p; }
      else if (P.phase === 'pat') {
        P.wait -= dt; P.patArm = clamp(1 - P.wait / 0.9, 0, 1);
        if (P.wait <= 0) {
          const mine = sets.you.filter(c => c.on), t = mine[(Math.random() * mine.length) | 0], hit = Math.random() < 0.36;
          const a = Math.random() * 6.28, off = hit ? Math.random() * RIM * 0.6 : RIM * (1.3 + Math.random() * 1.6);
          launch({ x: 0.12, y: TOP + 0.75, z: -HL - 0.3 }, { x: t.x + Math.cos(a) * off, z: t.z + Math.sin(a) * off }, 'pat');
        }
      }
      if (P.phase === 'fly') {
        const f = P.fly;
        if (f.bounce) { const b = f.bounce; b.t += dt; b.vy -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; if (b.y < (Math.abs(b.x) < HW && Math.abs(b.z) < HL ? TOP + 0.02 : 0.02) && b.vy < 0) { b.vy *= -0.5; b.y += 0.01; } ball.position.set(b.x, b.y, b.z); if (b.t > 0.9) next(f.who); }
        else { f.t += dt; const k = Math.min(1, f.t / f.T); ball.position.set(f.from.x + (f.to.x - f.from.x) * k, f.from.y + (f.to.y - f.from.y) * k + Math.sin(k * Math.PI) * 0.55, f.from.z + (f.to.z - f.from.z) * k); if (k >= 1) landed(); }
      }
      for (const k of ['pat', 'you']) for (const c of sets[k]) if (c.sink > 0) { c.sink += dt; c.mesh.scale.setScalar(Math.max(0.01, 1 - c.sink * 2.2)); if (c.sink > 0.45) { c.mesh.visible = false; c.sink = 0; } }
      // guides
      const mine = P.turn === 'you' && (P.phase === 'aim' || P.phase === 'power');
      lane.visible = mine; ring.visible = mine && P.phase === 'power';
      if (mine) { lane.position.x = P.ax + P.sway; ring.position.set(P.ax + P.sway, TOP + CUP_H + 0.004, depth(P.power)); }
      // Pat: idle sway, wind up and throw, look at the ball
      pat.g.position.y = Math.sin(P.t * 1.6) * 0.005; pat.g.rotation.y = Math.sin(P.t * 0.7) * 0.05;
      const wind = P.phase === 'pat' ? P.patArm : P.phase === 'fly' && P.fly && P.fly.who === 'pat' && !P.fly.bounce ? 1 - Math.min(1, P.fly.t / 0.25) * 1.6 : 0;
      pat.armR.rotation.x += ((-2.1 * Math.max(0, wind) + (wind < 0 ? 0.5 : 0)) - pat.armR.rotation.x) * Math.min(1, dt * 12);
      pat.armL.rotation.x = P.phase === 'over' && P.winner === 'pat' ? -2.8 : 0; if (P.phase === 'over' && P.winner === 'pat') pat.armR.rotation.x = -2.8;
      pat.head.rotation.x = P.phase === 'fly' ? -0.1 : 0.12;
      // camera: from your end of the table
      const o = host.origin, tall = camera.aspect < 1, fov = tall ? 74 : 50, over0 = P.phase === 'over';
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      // looking down the table at Pat's cups on your turn; pulled back onto your own cups when he throws
      const his = P.turn === 'pat' && !over0, k = Math.min(1, dt * 3.5); P.cam += ((his ? 1 : 0) - P.cam) * k;
      camera.up.set(0, 1, 0); camera.position.set(o.x + P.ax * 0.3 * (1 - P.cam), o.y + TOP + 0.8, o.z + 0.3 + (HL + 1.0) * P.cam); camera.lookAt(o.x + P.ax * 0.3 * (1 - P.cam), o.y + TOP + 0.05, o.z - 1.0 + 1.35 * P.cam);
      // HUD
      const lit = ' style="border-color:#f2b441;box-shadow:0 0 0 1px #f2b441"', over = P.phase === 'over';
      let html = `<div class="g-top"><div class="pill"${P.turn === 'you' && !over ? lit : ''}>You: ${left('you')} cups left</div><div class="pill"${P.turn === 'pat' && !over ? lit : ''}>Pat: ${left('pat')} cups left</div></div>`;
      if (P.msgT > 0) html += `<div class="g-msg" style="top:15%;font-size:28px">${P.msg}</div>`;
      if (over) html += `<div class="g-prompt" style="top:auto;bottom:70px">${host.touch ? 'REMATCH — play again · ✕ to walk away' : 'Click for a rematch · <kbd>E</kbd> to walk away'}</div>`;
      else if (mine) html += `<div class="g-bar golf" style="${host.touch ? 'top:58px;bottom:auto' : 'bottom:46px'}"><i style="width:${Math.round(P.power * 100)}%"></i><em>DISTANCE</em></div><div class="g-tip">${host.touch ? 'Drag left/right to aim · hold THROW, let go when the ring is over a cup' : P.phase === 'power' ? 'Let go when the ring is over a cup' : 'Mouse or A/D to aim left and right · hold click, release when the ring is over a cup · E walks away'}</div>`;
      else if (P.phase === 'pat') html += `<div class="g-prompt" style="top:auto;bottom:70px">Pat is lining one up…</div>`;
      return html;
    },
  };
  reset(); pat.g.visible = false; lane.visible = ring.visible = false;
  return api;
}
