// Beer pong against Pat, on the table in Lucky's.
// House rules: ten cups each, two balls a turn, make both and you get the balls back. A bounce shot that drops
// is worth two cups, but the defender may swat a bounced ball away.
// Table space: the table runs along z. You throw from the +z end at Pat's cups, which sit at the -z end.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TOP = 0.78, HL = 1.2, HW = 0.38;       // table height, half length, half width
const CUP_H = 0.115, RIM = 0.045, SINK = 0.033, LIP = 0.052;
const ZONE = 0.11;                           // half width of the sweet spot on the timing bar
const rackAt = side => {                     // side -1: Pat's cups (your targets). +1: yours.
  const out = []; for (let r = 0; r < 4; r++) for (let i = 0; i < 4 - r; i++) out.push({ x: (i - (3 - r) / 2) * 0.098, z: side * (1.05 - r * 0.085), on: true, mesh: null, gone: 0 });
  return out;
};

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
  const cupG = new THREE.CylinderGeometry(RIM, 0.031, CUP_H, 22), lipG = new THREE.TorusGeometry(RIM - 0.001, 0.0035, 6, 22), beerG = new THREE.CircleGeometry(RIM - 0.006, 20);
  const red = L(0xc8202a), white = L(0xf6f3ea), beer = L(0xdba02a);
  const sets = { pat: rackAt(-1), you: rackAt(1) };
  for (const k of ['pat', 'you']) for (const c of sets[k]) {
    const g = new THREE.Group(); g.position.set(c.x, TOP + CUP_H / 2, c.z); group.add(g);
    add(cupG, red, 0, 0, 0, g); const r = add(lipG, white, 0, CUP_H / 2, 0, g); r.rotation.x = Math.PI / 2; flat(beerG, beer, 0, CUP_H / 2 + 0.0012, 0, g);
    c.mesh = g;
  }
  const ball = add(new THREE.SphereGeometry(0.02, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x666666 }), 0, TOP + 0.5, HL + 0.2);
  const shadow = flat(new THREE.CircleGeometry(0.022, 14), B(0x000000, 0.35), 0, TOP + 0.003, 0);
  const aim = new THREE.Group(); group.add(aim);                                                     // the reticle you aim with
  { const m = B(0xffe066); flat(new THREE.RingGeometry(0.03, 0.038, 26), m, 0, 0, 0, aim); flat(new THREE.CircleGeometry(0.006, 10), m, 0, 0, 0, aim); for (const [w, d, x, z] of [[0.03, 0.005, 0.055, 0], [0.03, 0.005, -0.055, 0], [0.005, 0.03, 0, 0.055], [0.005, 0.03, 0, -0.055]]) flat(new THREE.PlaneGeometry(w, d), m, x, 0, z, aim); }
  const hop = flat(new THREE.RingGeometry(0.02, 0.027, 20), B(0x9fd8ff, 0.9), 0, TOP + 0.004, 0);     // where a bounce shot touches down first
  const splash = flat(new THREE.RingGeometry(0.03, 0.04, 22), B(0xffffff, 0.9), 0, TOP + CUP_H + 0.01, 0); splash.visible = false;
  const hand = add(new THREE.BoxGeometry(0.11, 0.16, 0.05), L(0xf0c8a6), 0, TOP + 0.2, 0.7); hand.visible = false;   // your hand, when you swat
  const pat = host.pat; pat.g.position.set(0, 0, -HL - 0.42); group.add(pat.g);

  const P = {
    on: false, turn: 'you', phase: 'aim',          // aim | time | fly | pat | over
    rx: 0, rz: -0.9, sx: 0, sz: 0, tm: 0, cT: 0, bounce: false, t: 0, fly: null, msg: '', msgT: 0, wait: 0, winner: null,
    ballNo: 1, made: 0, lost: 0, cam: 0, patArm: 0, swat: 0, swatLock: false, splashT: 0, throws: 0,
  };
  const left = k => sets[k].filter(c => c.on).length;
  const say = (m, t = 2) => { P.msg = m; P.msgT = t; };
  const pick = a => a[(Math.random() * a.length) | 0];
  const drinks = () => host.drinks?.() ?? 0;

  function reset() {
    for (const k of ['pat', 'you']) for (const c of sets[k]) { c.on = true; c.gone = 0; c.mesh.visible = true; c.mesh.scale.setScalar(1); c.mesh.position.y = TOP + CUP_H / 2; }
    Object.assign(P, { turn: 'you', phase: 'aim', rx: 0, rz: -0.9, bounce: false, fly: null, winner: null, ballNo: 1, made: 0, lost: 0, wait: 0, swat: 0, swatLock: false, throws: 0 });
    ball.visible = shadow.visible = splash.visible = hand.visible = false;
  }
  // Throw a ball at a spot. A bounce shot touches the table part-way first, then hops on to the spot.
  function launch(who, to, bounce) {
    const from = who === 'you' ? { x: P.rx * 0.3, y: TOP + 0.5, z: 0.75 } : { x: 0.1, y: TOP + 0.62, z: -HL - 0.25 };
    const mid = bounce ? { x: from.x + (to.x - from.x) * 0.55, y: TOP + 0.02, z: from.z + (to.z - from.z) * 0.55 } : null;
    P.fly = { who, from, to, mid, bounce, t: 0, T1: bounce ? 0.42 : 0.72, T2: bounce ? 0.5 : 0, blocked: false, out: null, willBlock: who === 'you' && bounce && Math.random() < 0.4 };
    P.phase = 'fly'; ball.visible = shadow.visible = true; P.throws++; P.swat = 0; P.swatLock = false;
    if (who === 'pat' && bounce) say('Bounce! Swat it!', 1.2);
  }
  function takeCup(who, c) {                                // a cup comes off the table
    c.on = false; c.gone = 0.001;
    if (who === 'pat') { P.lost++; if (P.lost % 2 === 0) host.drink?.(); }       // two cups is about one beer
  }
  function landed() {
    const f = P.fly, who = f.who, cups = sets[who === 'you' ? 'pat' : 'you'];
    let hit = null, best = 1e9; for (const c of cups) { if (!c.on) continue; const d = Math.hypot(c.x - f.to.x, c.z - f.to.z); if (d < best) { best = d; hit = c; } }
    const rim = best >= SINK && best < LIP, sunk = hit && (best < SINK || (rim && Math.random() < 0.3));
    if (sunk) {
      takeCup(who, hit); let n = 1;
      if (f.bounce) { const more = cups.filter(c => c.on).sort((a, b) => Math.hypot(a.x - hit.x, a.z - hit.z) - Math.hypot(b.x - hit.x, b.z - hit.z))[0]; if (more) { takeCup(who, more); n = 2; } }
      P.made++; ball.visible = shadow.visible = false; splash.visible = true; splash.position.set(hit.x, TOP + CUP_H + 0.012, hit.z); P.splashT = 0.001;
      const done = !left(who === 'you' ? 'pat' : 'you');
      if (who === 'you') { say(done ? 'You win!' : n === 2 ? 'Bounced in — two cups!' : rim ? 'Rims in!' : 'Sunk it!', done ? 99 : 1.8); if (done || Math.random() < 0.6) host.line?.(done ? '“Good game. Rematch?”' : pick(['“Lucky shot.”', '“Okay, okay.”', '“Fine. Cheers.”', '“Who taught you that?”'])); }
      else { say(done ? 'Pat wins' : n === 2 ? 'Pat bounces one in — two cups' : 'Pat sinks one', done ? 99 : 1.8); host.line?.(done ? '“That is game. Next round is on you.”' : pick(['“Drink up.”', '“That is how it is done.”', '“Splash.”', '“You are going to feel that one.”'])); }
      if (done) { P.winner = who; P.phase = 'over'; P.fly = null; return; }
      f.out = { t: 0, still: true };
    } else {                                                // off the rim, onto the table, or wide of it
      const dir = who === 'you' ? -1 : 1, on = Math.abs(f.to.x) < HW && Math.abs(f.to.z) < HL;
      f.out = { t: 0, x: f.to.x, y: hit && best < LIP ? TOP + CUP_H : on ? TOP + 0.02 : TOP - 0.3, z: f.to.z, vx: (Math.random() - 0.5) * 0.9, vy: best < LIP ? 1.8 : on ? 1.4 : 0, vz: dir * (0.8 + Math.random() * 0.6) };
      if (who === 'you') say(best < LIP ? 'Off the rim' : on ? 'Miss' : 'Off the table', 1.2); else if (Math.random() < 0.35) host.line?.(pick(['“Rim. Come on.”', '“I was robbed.”', '“Warming up.”']));
    }
  }
  function blocked() {                                      // a bounced ball gets swatted away
    const f = P.fly; f.blocked = true;
    f.out = { t: 0, x: ball.position.x, y: ball.position.y, z: ball.position.z, vx: (Math.random() < 0.5 ? -1 : 1) * (1.4 + Math.random()), vy: 1.2, vz: (f.who === 'you' ? 1 : -1) * 0.6 };
    if (f.who === 'you') { say('Pat swats it away', 1.4); host.line?.(pick(['“Not in my house.”', '“Bounces are fair game.”', '“Get that out of here.”'])); } else { say('Swatted!', 1.4); host.line?.(pick(['“Hey!”', '“Good hands.”'])); }
  }
  function nextBall() {
    const who = P.fly.who; P.fly = null; ball.visible = shadow.visible = false;
    if (P.ballNo === 1) P.ballNo = 2;
    else if (P.made === 2) { P.ballNo = 1; P.made = 0; say(who === 'you' ? 'Both in — balls back!' : 'Pat made both — balls back', 2); if (who === 'pat') host.line?.('“Balls back. Stay there.”'); }
    else { P.turn = who === 'you' ? 'pat' : 'you'; P.ballNo = 1; P.made = 0; }
    if (P.turn === 'pat') { P.phase = 'pat'; P.wait = 1.35; } else P.phase = 'aim';
  }

  const api = {
    P, sets,
    get on() { return P.on; },
    get label() { return P.phase === 'over' ? 'REMATCH' : P.phase === 'fly' && P.fly?.who === 'pat' && P.fly.bounce ? 'SWAT' : 'THROW'; },
    get alt() { return P.on && P.turn === 'you' && P.phase === 'aim' ? (P.bounce ? 'LOB' : 'BOUNCE') : null; },     // the second button on phones
    start() { P.on = true; reset(); pat.g.visible = true; say('Beer pong — two balls a turn', 2.6); host.line?.('“Rack ’em. Loser buys.”'); },
    stop() { P.on = false; reset(); pat.g.visible = false; aim.visible = hop.visible = false; },
    key(code) { if (code === 'KeyB' && P.turn === 'you' && P.phase === 'aim') P.bounce = !P.bounce; },
    look(dx, dy = 0) { if (P.turn === 'you' && P.phase === 'aim') { P.rx = clamp(P.rx + dx * 0.0009, -0.34, 0.34); P.rz = clamp(P.rz + dy * 0.0009, -1.17, -0.55); } },
    down() {
      if (P.phase === 'over') { reset(); say('New game — you throw first', 2.2); host.line?.('“Run it back.”'); return; }
      if (P.phase === 'fly' && P.fly.who === 'pat' && P.fly.bounce && !P.fly.out && !P.swatLock) {          // your swat at Pat's bounce
        P.swat = 0.3; const f = P.fly;
        if (f.t < f.T1 - 0.08) { P.swatLock = true; say('Too early!', 0.9); } else blocked();
        return;
      }
      if (P.turn === 'you' && P.phase === 'aim') { P.phase = 'time'; P.cT = 0; P.tm = 0; }
    },
    up() {
      if (P.turn !== 'you' || P.phase !== 'time') return;
      if (P.cT < 0.06) { P.phase = 'aim'; return; }
      const e = (P.tm - 0.5) * 2, z = ZONE * 2, off = Math.abs(e) <= z ? 0 : (Math.abs(e) - z) * Math.sign(e), j = () => (Math.random() - 0.5) * 2;
      // inside the green: the ball goes where the reticle is. Outside: short or long by how far you missed it.
      launch('you', { x: P.rx + P.sx + j() * (0.011 + Math.abs(off) * 0.05), z: P.rz + P.sz + j() * 0.011 - off * 0.36 }, P.bounce);
      if (!off && Math.abs(e) < 0.05) say('Perfect release', 0.7);
    },
    // test hook: throw straight at a spot
    throwAt(x, z, bounce = false) { if (P.turn === 'you' && (P.phase === 'aim' || P.phase === 'time')) launch('you', { x, z }, bounce); },
    update(dt, s, fwd = 0) {
      P.t += dt; P.msgT -= dt; P.swat -= dt;
      const d = drinks(); P.sx = (Math.sin(P.t * 1.9) * 0.007 + Math.sin(P.t * 3.3) * 0.003) * d; P.sz = Math.cos(P.t * 1.5) * 0.006 * d;      // a few beers in, your aim wanders
      if (P.phase === 'aim' && P.turn === 'you') { P.rx = clamp(P.rx + s * dt * 0.22, -0.34, 0.34); P.rz = clamp(P.rz - fwd * dt * 0.22, -1.17, -0.55); }
      else if (P.phase === 'time') { P.cT += dt; const p = (P.cT / 0.85) % 2; P.tm = p < 1 ? p : 2 - p; }
      else if (P.phase === 'pat') {
        P.wait -= dt; P.patArm = clamp(1 - P.wait / 0.8, 0, 1);
        if (P.wait <= 0) {
          const t = pick(sets.you.filter(c => c.on)), bounce = Math.random() < 0.2, hit = Math.random() < (bounce ? 0.42 : 0.34), a = Math.random() * 6.28, off = hit ? Math.random() * SINK * 0.7 : SINK * (1.25 + Math.random() * 2.2);
          launch('pat', { x: t.x + Math.cos(a) * off, z: t.z + Math.sin(a) * off }, bounce);
        }
      }
      if (P.phase === 'fly') {
        const f = P.fly;
        if (f.out) { const b = f.out; b.t += dt; if (!b.still) { b.vy -= 9.8 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; const fl = Math.abs(b.x) < HW && Math.abs(b.z) < HL ? TOP + 0.02 : 0.02; if (b.y < fl && b.vy < 0) { b.y = fl; b.vy *= -0.5; } ball.position.set(b.x, b.y, b.z); } if (b.t > (b.still ? 0.55 : 0.85)) nextBall(); }
        else {
          f.t += dt; const second = f.bounce && f.t > f.T1, a = second ? f.mid : f.from, b = f.bounce && !second ? f.mid : f.to, k = clamp(second ? (f.t - f.T1) / f.T2 : f.t / f.T1, 0, 1), top = f.bounce ? (second ? 0.2 : 0.14) : 0.5;
          const ty = b === f.to ? TOP + CUP_H + 0.01 : b.y;
          ball.position.set(a.x + (b.x - a.x) * k, a.y + (ty - a.y) * k + Math.sin(k * Math.PI) * top, a.z + (b.z - a.z) * k);
          if (second && f.willBlock && !f.blocked && k > 0.35) blocked();          // Pat gets a hand to it
          else if (f.t >= f.T1 + f.T2) landed();
        }
        shadow.position.set(ball.position.x, TOP + 0.003, ball.position.z); shadow.visible = ball.visible && Math.abs(ball.position.x) < HW && Math.abs(ball.position.z) < HL && ball.position.y > TOP;
      }
      for (const k of ['pat', 'you']) for (const c of sets[k]) if (c.gone > 0) { c.gone += dt; c.mesh.position.y = TOP + CUP_H / 2 + c.gone * 0.5; c.mesh.scale.setScalar(Math.max(0.01, 1 - c.gone * 2.6)); if (c.gone > 0.38) { c.mesh.visible = false; c.gone = 0; } }
      if (P.splashT > 0) { P.splashT += dt; splash.scale.setScalar(1 + P.splashT * 5); splash.material.opacity = Math.max(0, 0.9 - P.splashT * 2.4); if (P.splashT > 0.4) { splash.visible = false; P.splashT = 0; } }
      // the reticle, and the first touch of a bounce shot
      const mine = P.turn === 'you' && (P.phase === 'aim' || P.phase === 'time');
      aim.visible = mine; hop.visible = mine && P.bounce;
      if (mine) { aim.position.set(P.rx + P.sx, TOP + CUP_H + 0.014, P.rz + P.sz); hop.position.set(P.rx * 0.3 + (P.rx + P.sx - P.rx * 0.3) * 0.55, TOP + 0.004, 0.75 + (P.rz + P.sz - 0.75) * 0.55); }
      // Pat: idle sway, wind up and throw, and a swat when he blocks
      pat.g.position.y = Math.sin(P.t * 1.6) * 0.005; pat.g.rotation.y = Math.sin(P.t * 0.7) * 0.05;
      const f = P.fly, throwing = P.phase === 'pat' ? P.patArm : f && f.who === 'pat' && !f.out && f.t < 0.25 ? -1 : 0, swatting = f && f.who === 'you' && f.blocked && f.out && f.out.t < 0.4;
      const armTo = swatting ? -1.5 : throwing > 0 ? -2.1 * throwing : throwing < 0 ? 0.5 : 0;
      pat.armR.rotation.x += (armTo - pat.armR.rotation.x) * Math.min(1, dt * 12); pat.armR.rotation.z = swatting ? -0.9 : 0.07;
      const cheer = P.phase === 'over' && P.winner === 'pat'; pat.armL.rotation.x = cheer ? -2.8 : 0; if (cheer) pat.armR.rotation.x = -2.8;
      pat.head.rotation.x = P.phase === 'fly' ? -0.1 : 0.12;
      hand.visible = P.swat > 0; if (hand.visible) { const k = 1 - P.swat / 0.3; hand.position.set(-0.3 + k * 0.6, TOP + 0.2, 0.72); hand.rotation.z = 0.5 - k; }
      // camera: over the table looking at Pat's cups on your turn; pulled back onto your own cups when he throws
      const o = host.origin, tall = camera.aspect < 1, fov = tall ? 74 : 50, over = P.phase === 'over';
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      P.cam += ((P.turn === 'pat' && !over ? 1 : 0) - P.cam) * Math.min(1, dt * 3.5);
      camera.up.set(0, 1, 0); camera.position.set(o.x, o.y + TOP + 0.8, o.z + 0.3 + (HL + 1.0) * P.cam); camera.lookAt(o.x, o.y + TOP + 0.05, o.z - 1.0 + 1.35 * P.cam);
      // HUD
      const lit = ' style="border-color:#f2b441;box-shadow:0 0 0 1px #f2b441"', balls = `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#fff;margin-left:5px;vertical-align:0"></i>`;
      let html = `<div class="g-top"><div class="pill"${P.turn === 'you' && !over ? lit : ''}>You: ${left('you')} cups${P.turn === 'you' && !over ? balls.repeat(3 - P.ballNo - (P.phase === 'fly' ? 1 : 0)) : ''}</div><div class="pill"${P.turn === 'pat' && !over ? lit : ''}>Pat: ${left('pat')} cups${P.turn === 'pat' && !over ? balls.repeat(Math.max(0, 3 - P.ballNo - (P.phase === 'fly' ? 1 : 0))) : ''}</div></div>`;
      if (P.msgT > 0) html += `<div class="g-msg" style="top:15%;font-size:28px">${P.msg}</div>`;
      if (over) html += `<div class="g-prompt" style="top:auto;bottom:70px">${host.touch ? 'REMATCH — play again · ✕ to walk away' : 'Click for a rematch · <kbd>E</kbd> to walk away'}</div>`;
      else if (mine) {
        const pos = host.touch ? 'top:58px' : 'bottom:54px', zl = (0.5 - ZONE) * 100, zw = ZONE * 200;
        html += `<div style="position:absolute;left:50%;${pos};transform:translateX(-50%);width:min(300px,70vw);height:16px;border-radius:999px;background:rgba(16,21,31,.85);border:1px solid rgba(255,255,255,.25);overflow:hidden"><i style="position:absolute;left:${zl}%;width:${zw}%;top:0;bottom:0;background:#2fae5c"></i>${P.phase === 'time' ? `<i style="position:absolute;left:calc(${P.tm * 100}% - 2px);width:4px;top:-2px;bottom:-2px;background:#fff"></i>` : ''}</div>`;
        html += `<div class="g-prompt" style="top:auto;bottom:${host.touch ? 'auto;top:84px' : '80px'};font-size:12.5px">${P.bounce ? 'Bounce shot: worth 2 cups, but Pat can swat it' : 'Lob shot'}${host.touch ? '' : ' · <kbd>B</kbd> switches'}</div>`;
        html += `<div class="g-tip">${host.touch ? 'Drag to aim · hold THROW, let go in the green' : P.phase === 'time' ? 'Let go while the marker is in the green' : 'Move the mouse to put the reticle on a cup · hold click, release in the green · B for a bounce shot · E walks away'}</div>`;
      } else if (P.phase === 'pat') html += `<div class="g-prompt" style="top:auto;bottom:70px">Pat is lining one up…</div>`;
      else if (P.phase === 'fly' && P.fly && P.fly.who === 'pat' && P.fly.bounce && !P.fly.out && !P.swatLock) html += `<div class="g-prompt" style="top:auto;bottom:70px">${host.touch ? 'Tap SWAT!' : 'Click to swat it!'}</div>`;
      return html;
    },
  };
  reset(); pat.g.visible = false; aim.visible = hop.visible = false;
  return api;
}
