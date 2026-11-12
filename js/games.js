// Three mini-games. Each returns { scene, camera, update(dt), look(dx,dy), down(), up(), label }.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const exitHint = '<div class="g-exit"><kbd>E</kbd> / <kbd>Esc</kbd> exit</div>';

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/* ================================================================== LACROSSE RANGE */
export function createLacrosse(THREE, ctx) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x8fc3ee); scene.fog = new THREE.Fog(0x8fc3ee, 40, 110);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 200); camera.rotation.order = 'YXZ'; camera.position.set(0, 1.65, 0);
  scene.add(camera, new THREE.HemisphereLight(0xffffff, 0x4c6b3c, 1.9));
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.4); sun.position.set(6, 12, 5); scene.add(sun);
  const L = (c, o) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); scene.add(o); return o; };

  // turf with mowing stripes and lines
  const turf = canvasTex(THREE, 256, 256, (c, W, H) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#2f8040' : '#2a7439'; c.fillRect(0, i * 32, W, 32); } });
  turf.wrapS = turf.wrapT = THREE.RepeatWrapping; turf.repeat.set(6, 6);
  const g = add(new THREE.PlaneGeometry(160, 160), new THREE.MeshLambertMaterial({ map: turf }), 0, 0, -30); g.rotation.x = -Math.PI / 2;
  const GZ = -10.5, GW = 2.7, GH = 2.0;
  const crease = add(new THREE.RingGeometry(2.7, 2.8, 48), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0.01, GZ); crease.rotation.x = -Math.PI / 2;
  add(new THREE.PlaneGeometry(60, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0.01, -6).rotation.x = -Math.PI / 2;
  // goal
  const pipe = L(0xff6a00);
  add(new THREE.CylinderGeometry(0.045, 0.045, GH, 10), pipe, -GW / 2, GH / 2, GZ);
  add(new THREE.CylinderGeometry(0.045, 0.045, GH, 10), pipe, GW / 2, GH / 2, GZ);
  add(new THREE.CylinderGeometry(0.045, 0.045, GW + 0.09, 10), pipe, 0, GH, GZ).rotation.z = Math.PI / 2;
  const netTex = canvasTex(THREE, 128, 128, (c, W, H) => { c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; for (let i = 0; i <= W; i += 16) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, H); c.moveTo(0, i); c.lineTo(W, i); c.stroke(); } });
  netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping; netTex.repeat.set(5, 4);
  const netM = new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide });
  add(new THREE.PlaneGeometry(GW, GH), netM, 0, GH / 2, GZ - 1.6);
  for (const s of [-1, 1]) add(new THREE.PlaneGeometry(1.6, GH), netM, s * GW / 2, GH / 2, GZ - 0.8).rotation.y = Math.PI / 2;
  add(new THREE.PlaneGeometry(GW, 1.6), netM, 0, GH, GZ - 0.8).rotation.x = Math.PI / 2;
  // goalie
  const goalie = new THREE.Group(); scene.add(goalie); goalie.position.set(0, 0, GZ + 0.25);
  const gb = (geo, c, x, y, z) => { const o = new THREE.Mesh(geo, L(c)); o.position.set(x, y, z); goalie.add(o); return o; };
  gb(new THREE.BoxGeometry(0.62, 0.75, 0.3), 0x9b1c2c, 0, 1.12, 0); gb(new THREE.BoxGeometry(0.24, 0.75, 0.24), 0x1d1d22, -0.16, 0.38, 0);
  gb(new THREE.BoxGeometry(0.24, 0.75, 0.24), 0x1d1d22, 0.16, 0.38, 0); gb(new THREE.SphereGeometry(0.17, 14, 10), 0xf1f1f1, 0, 1.68, 0);
  gb(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 8), 0xdddddd, 0.36, 1.25, 0.1).rotation.z = 0.3;
  gb(new THREE.TorusGeometry(0.17, 0.02, 8, 16), 0xffffff, 0.56, 1.92, 0.1);
  // bleachers for depth
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(34, 0.5, 1.2), L(i % 2 ? 0x9aa3ad : 0x868f99), 0, 0.25 + i * 0.5, -30 - i * 1.2);
  // stick in hand
  const stickG = new THREE.Group(); camera.add(stickG); stickG.position.set(0.42, -0.5, -0.85); stickG.rotation.set(-0.5, 0.1, -0.45);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 8), L(0xd9d9de)); stickG.add(shaft);
  const head = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.012, 8, 14), L(0xffffff)); head.position.y = 0.52; head.scale.set(1, 1.35, 1); stickG.add(head);

  const ballGeo = new THREE.SphereGeometry(0.075, 12, 10), ballM = L(0xfffb8a, { emissive: 0x4a4600 });
  const st = { yaw: 0, pitch: 0.02, charging: false, charge: 0, cool: 0, balls: [], score: 0, goals: 0, shots: 0, time: 60, ph: 0, gx: 0, msg: '', msgT: 0, done: false, started: false };
  const dir = new THREE.Vector3();
  function say(m) { st.msg = m; st.msgT = 1.1; }
  function shoot() {
    camera.getWorldDirection(dir);
    const b = new THREE.Mesh(ballGeo, ballM); b.position.copy(camera.position).addScaledVector(dir, 0.6); b.position.y -= 0.05;
    scene.add(b); const sp = 14 + 24 * st.charge;
    st.balls.push({ m: b, v: dir.clone().multiplyScalar(sp).add(new THREE.Vector3(0, 1.1, 0)), life: 3.5, live: true });
    st.shots++; st.cool = 0.28; st.charge = 0; st.charging = false; st.started = true;
  }
  return {
    scene, camera, label: 'SHOOT',
    look(dx, dy) { st.yaw = clamp(st.yaw - dx * 0.0016, -0.75, 0.75); st.pitch = clamp(st.pitch - dy * 0.0016, -0.25, 0.55); },
    down() { if (!st.done && st.cool <= 0) { st.charging = true; st.charge = 0; } },
    up() { if (st.charging && !st.done) shoot(); },
    update(dt) {
      if (st.done) return;
      if (st.started) st.time -= dt;
      st.cool -= dt; st.msgT -= dt;
      if (st.charging) st.charge = Math.min(1, st.charge + dt / 0.9);
      camera.rotation.set(st.pitch, st.yaw, 0);
      stickG.rotation.x = -0.5 + st.charge * 0.7;
      st.ph += dt * (1.3 + st.goals * 0.11); st.gx = Math.sin(st.ph) * (GW / 2 - 0.42);
      goalie.position.x = st.gx;
      for (const b of st.balls) {
        b.life -= dt; const p = b.m.position, pz = p.z, px = p.x, py = p.y;
        b.v.y -= 9.8 * dt; p.addScaledVector(b.v, dt);
        if (p.y < 0.075) { p.y = 0.075; b.v.y *= -0.45; b.v.x *= 0.8; b.v.z *= 0.8; }
        if (b.live && pz > GZ && p.z <= GZ) {
          const k = (pz - GZ) / (pz - p.z), x = px + (p.x - px) * k, y = py + (p.y - py) * k;
          b.live = false;
          if (Math.abs(x) < GW / 2 - 0.04 && y < GH - 0.04 && y > 0) {
            if (Math.abs(x - st.gx) < 0.42 && y < 1.9) { say('Saved!'); b.v.set((x - st.gx) * 6, 2, 5); p.z = GZ + 0.05; }
            else {
              const corner = Math.abs(x) > GW / 2 - 0.5 && y > GH - 0.55;
              st.goals++; st.score += corner ? 3 : 1; say(corner ? 'TOP CORNER! +3' : 'GOAL! +1'); b.v.multiplyScalar(0.12); b.life = 0.6;
            }
          } else if (Math.abs(Math.abs(x) - GW / 2) < 0.1 && y < GH + 0.1 || (Math.abs(y - GH) < 0.1 && Math.abs(x) < GW / 2)) {
            say('Pipe!'); b.v.z *= -0.5; p.z = GZ + 0.05;
          } else say('Wide');
        }
      }
      st.balls = st.balls.filter(b => b.life > 0 || (scene.remove(b.m), false));
      const t = Math.max(0, st.time);
      ctx.hud(`${exitHint}<div class="g-top"><div class="pill">⏱ ${Math.ceil(t)}s</div><div class="pill">${st.score} pts</div><div class="pill">${st.goals}/${st.shots} shots</div></div>
        ${st.msgT > 0 ? `<div class="g-msg">${st.msg}</div>` : (!st.started ? `<div class="g-msg">${ctx.touch ? 'Hold SHOOT to charge' : 'Hold click to charge, release to shoot'}</div>` : '')}
        <div class="g-bar"><i style="width:${Math.round(st.charge * 100)}%"></i></div>`);
      if (st.time <= 0) {
        st.done = true;
        ctx.finish({ score: st.score, headline: `${st.score} pts`, text: `${st.goals} goals on ${st.shots} shots in 60 seconds. Top corners are worth 3.` });
      }
    },
  };
}

/* ================================================================== BOOSTER LANDING */
export function createRocket(THREE, ctx) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070b18);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 600); camera.position.set(0, 38, 98);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x10203a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-30, 40, 60); scene.add(sun);
  const L = (c, o) => new THREE.MeshLambertMaterial({ color: c, ...o });
  // stars
  const sp = new Float32Array(900); for (let i = 0; i < 300; i++) { sp[i * 3] = (Math.random() - 0.5) * 420; sp[i * 3 + 1] = Math.random() * 190 - 10; sp[i * 3 + 2] = -90 - Math.random() * 60; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9 })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf2e9d0 })); moon.position.set(-70, 78, -100); scene.add(moon);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(700, 300), L(0x0c2c49)); sea.rotation.x = -Math.PI / 2; scene.add(sea);
  // drone ship
  const padX = (Math.random() - 0.5) * 36, DECK = 1.2, PADW = 6;
  const ship = new THREE.Group(); ship.position.set(padX, 0, 0); scene.add(ship);
  const sb = (w, h, d, c, x, y, z, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), L(c, o)); m.position.set(x, y, z); ship.add(m); return m; };
  sb(PADW * 2 + 2, DECK, 9, 0x2a2f38, 0, DECK / 2, 0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.1, 40), new THREE.MeshBasicMaterial({ color: 0xf2b441 })); ring.rotation.x = -Math.PI / 2; ring.position.y = DECK + 0.02; ship.add(ring);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.7, 24), new THREE.MeshBasicMaterial({ color: 0xf2b441 })); dot.rotation.x = -Math.PI / 2; dot.position.y = DECK + 0.02; ship.add(dot);
  for (const s of [-1, 1]) sb(0.4, 0.5, 0.4, 0xff4d3d, s * (PADW + 0.6), DECK + 0.25, 4.2, { emissive: 0xff2a1a });
  // booster
  const rk = new THREE.Group(); scene.add(rk);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 9, 20), L(0xf3f3f0)); body.position.y = 5.3; rk.add(body);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.92, 0.92, 1.2, 20), L(0x1b1d22)); band.position.y = 9.4; rk.add(band);
  const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.8, 0.8, 16), L(0x33363d)); eng.position.y = 0.6; rk.add(eng);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.0, 0.16), L(0x1b1d22)); leg.position.set(Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5); leg.rotation.z = -Math.cos(a) * 0.6; leg.rotation.x = Math.sin(a) * 0.6; rk.add(leg); }
  for (const s of [-1, 1]) { const fin = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.9), L(0x1b1d22)); fin.position.set(s * 1.3, 8.6, 0); rk.add(fin); }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.75, 5, 14), new THREE.MeshBasicMaterial({ color: 0xffa52e, transparent: true, opacity: 0.92 })); flame.rotation.x = Math.PI; flame.position.y = -2.2; rk.add(flame);
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.4, 3, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c4 })); flame2.rotation.x = Math.PI; flame2.position.y = -1.3; rk.add(flame2);
  const glow = new THREE.PointLight(0xffa040, 0, 60, 1.5); glow.position.y = -1; rk.add(glow);
  const boom = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true })); boom.visible = false; scene.add(boom);

  const G = 9.8, AT = 21, BURN = 12;
  const st = { x: padX + (Math.random() < 0.5 ? -1 : 1) * (14 + Math.random() * 14), y: 76, vx: 0, vy: -9, th: 0, om: 0, fuel: 100, hold: false, state: 'fly', endT: 0, result: null, t: 0 };
  st.vx = (padX - st.x) * 0.09 + (Math.random() - 0.5) * 3; st.th = (Math.random() - 0.5) * 0.3;

  function end(ok, text, score) {
    st.state = ok ? 'landed' : 'crashed'; st.endT = 1.5;
    st.result = { score, headline: ok ? `${score} pts` : 'Boom.', text, submit: ok };
    if (!ok) { rk.visible = false; boom.visible = true; boom.position.set(st.x, Math.max(st.y, 1) + 3, 0); }
  }
  return {
    scene, camera, label: 'THRUST',
    look() {},
    down() { st.hold = true; }, up() { st.hold = false; },
    update(dt) {
      st.t += dt;
      const { f, s } = ctx.axes();
      let thrust = false;
      if (st.state === 'fly') {
        thrust = (st.hold || f > 0.3 || ctx.keys.Space) && st.fuel > 0;
        st.om += -s * 2.1 * dt; st.om *= 1 - 1.5 * dt; st.th += st.om * dt;
        const a = thrust ? AT : 0;
        st.vx += -Math.sin(st.th) * a * dt; st.vy += (Math.cos(st.th) * a - G) * dt;
        st.x += st.vx * dt; st.y += st.vy * dt;
        if (thrust) st.fuel = Math.max(0, st.fuel - BURN * dt);
        const onShip = Math.abs(st.x - padX) < PADW + 1;
        if (onShip && st.y <= DECK) {
          st.y = DECK; const dx = Math.abs(st.x - padX), tilt = Math.abs(st.th) * 57.3;
          if (st.vy < -6.5) end(false, `Too fast: ${(-st.vy).toFixed(1)} m/s at touchdown. Keep it under 6.5.`, 0);
          else if (Math.abs(st.vx) > 3.5) end(false, `Sliding sideways at ${Math.abs(st.vx).toFixed(1)} m/s. Kill the drift first.`, 0);
          else if (tilt > 14) end(false, `Tipped over: ${tilt.toFixed(0)}° of tilt. Land upright.`, 0);
          else if (dx > PADW) end(false, 'Caught the edge of the deck.', 0);
          else {
            const score = Math.round(300 + st.fuel * 6 + (PADW - dx) * 40 + (6.5 + st.vy) * 30 + (14 - tilt) * 6);
            st.th = 0; end(true, `Touchdown at ${(-st.vy).toFixed(1)} m/s, ${dx.toFixed(1)} m off center, ${st.fuel.toFixed(0)}% fuel left.`, score);
          }
        } else if (st.y <= 0) { st.y = 0; end(false, 'Missed the ship. Splashdown.', 0); }
        else if (Math.abs(st.x) > 120 || st.y > 220) end(false, 'Lost the booster. Stay near the ship.', 0);
      } else {
        st.endT -= dt;
        if (st.state === 'crashed') { const k = 1.5 - st.endT; boom.scale.setScalar(1 + k * 16); boom.material.opacity = Math.max(0, 1 - k / 1.3); }
        if (st.endT <= 0 && st.result) { const r = st.result; st.result = null; ctx.finish(r); }
      }
      rk.position.set(st.x, st.y, 0); rk.rotation.z = st.th;
      flame.visible = flame2.visible = thrust; glow.intensity = thrust ? 60 : 0;
      if (thrust) { const k = 0.85 + Math.random() * 0.35; flame.scale.set(1, k, 1); flame.position.y = -2.2 * k + 0.3; }
      camera.position.x += (clamp((st.x + padX) / 2, -40, 40) - camera.position.x) * Math.min(1, dt * 2);
      camera.lookAt(camera.position.x, 36, 0);
      const alt = Math.max(0, st.y - DECK), tilt = st.th * 57.3;
      const stop = st.vy < 0 ? (st.vy * st.vy) / (2 * (AT - G)) : 0;
      ctx.hud(`${exitHint}
        <div class="g-side">
          ALT &nbsp;&nbsp;${alt.toFixed(1).padStart(6)} m<br>
          V-SPD ${st.vy.toFixed(1).padStart(6)} m/s<br>
          H-SPD ${st.vx.toFixed(1).padStart(6)} m/s<br>
          TILT &nbsp;${tilt.toFixed(0).padStart(6)}°<br>
          BURN@ ${stop.toFixed(1).padStart(6)} m<br>
          FUEL &nbsp;${st.fuel.toFixed(0).padStart(6)}%
        </div>
        <div class="g-plaque"><b>Flight plaque</b><br>
          a = (T/m)·n̂ − g·ŷ &nbsp; T/m = ${AT}, g = ${G}<br>
          stop height h = v² / (2·(T/m − g))<br>
          light the engine when ALT ≈ BURN@<br>
          land: |v<sub>y</sub>| &lt; 6.5, |v<sub>x</sub>| &lt; 3.5, tilt &lt; 14°</div>
        ${st.state === 'landed' ? '<div class="g-msg">The booster has landed.</div>' : st.state === 'crashed' ? '<div class="g-msg">Rapid unscheduled disassembly</div>'
          : st.t < 3 ? `<div class="g-msg" style="font-size:22px">${ctx.touch ? 'Stick up or THRUST to burn · left/right to tilt' : 'W to burn · A/D to tilt'}</div>` : ''}
        <div class="g-bar" style="top:56px;bottom:auto"><i style="width:${st.fuel}%;background:${st.fuel < 25 ? '#e5544b' : '#f2b441'}"></i></div>`);
    },
  };
}

/* ================================================================== MARKET PARKOUR */
export function createParkour(THREE, ctx) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070b14); scene.fog = new THREE.Fog(0x070b14, 30, 95);
  const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 200); camera.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1a2233, 1.7));
  const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(4, 10, 6); scene.add(dl);

  const LANES = 5, N = 52, D = 2.2, LW = 2.2, LS = 3.0, BASE = 6, EVERY = 13;
  const SYM = ['MJM', 'STRY', 'LAX', 'RKT', 'BME'];
  const ph = SYM.map((_, l) => [l * 1.7 + 0.4, l * 2.9 + 1.1, 0.75 + (l * 37 % 10) / 22]);
  const laneX = l => (l - (LANES - 1) / 2) * LS;
  const isCheck = i => i % EVERY === EVERY - 1;
  const H = Array.from({ length: LANES }, () => new Float32Array(N));
  const prevH = Array.from({ length: LANES }, () => new Float32Array(N));
  function hAt(l, i, t) {
    const sec = Math.floor(i / EVERY), A = 1.5 + sec * 0.45, [p1, p2, spd] = ph[l];
    return BASE + A * (0.6 * Math.sin(0.5 * i + p1 + t * spd) + 0.4 * Math.sin(0.23 * i - t * 0.6 * spd + p2));
  }
  // bars
  const geo = new THREE.BoxGeometry(LW, 1, D - 0.14); geo.translate(0, -0.5, 0);
  const bars = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), LANES * N);
  scene.add(bars);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  const UP = new THREE.Color(0x27b36a), DOWN = new THREE.Color(0xdc4a43), FLAT = new THREE.Color(0x44506a);
  // static platforms
  const platM = new THREE.MeshLambertMaterial({ color: 0x2b3550 });
  const plat = (zc, len, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(15.4, 30, len), c || platM); m.position.set(0, BASE - 15, zc); scene.add(m); };
  plat(2, 4);
  for (let i = 0; i < N; i++) if (isCheck(i)) plat(-(i + 0.5) * D, D - 0.06);
  plat(-(N * D + 3), 6, new THREE.MeshLambertMaterial({ color: 0xf2b441 }));
  // ticker gates
  const tapeTex = [];
  const gate = (z, text) => {
    const t = canvasTex(THREE, 2048, 128, (c, W, Hh) => {
      c.fillStyle = '#05080f'; c.fillRect(0, 0, W, Hh); c.font = 'bold 72px ui-monospace, Menlo, monospace'; c.textBaseline = 'middle';
      let x = 20; const parts = text || SYM.flatMap((s, i) => [[s, '#fff'], [(i % 2 ? '▼ ' : '▲ ') + (1 + i * 0.7).toFixed(2) + '%', i % 2 ? '#e5544b' : '#35c27a']]);
      for (let r = 0; r < 3; r++) for (const [s, col] of parts) { c.fillStyle = col; c.fillText(s, x, Hh / 2 + 4); x += c.measureText(s).width + 44; }
    });
    t.wrapS = THREE.RepeatWrapping; tapeTex.push(t);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.0), new THREE.MeshBasicMaterial({ map: t })); m.position.set(0, BASE + 4.4, z); scene.add(m);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 40, 0.25), platM); p.position.set(s * 8, BASE - 15, z); scene.add(p); }
  };
  gate(-0.2); for (let i = 0; i < N; i++) if (isCheck(i)) gate(-(i + 1) * D);
  gate(-(N * D + 5.8), [['CLOSING BELL', '#f2b441'], ['FINISH', '#fff']]);
  const grid = new THREE.GridHelper(400, 100, 0x1c6b47, 0x12233a); grid.position.y = -16; scene.add(grid);

  const st = { x: 0, y: BASE, z: 2, vy: 0, yaw: 0, pitch: -0.12, grounded: true, coy: 0, t: 0, time: 0, started: false, check: { z: 2, n: 0 }, done: false, falls: 0, jumpQ: 0, msg: '', msgT: 0 };
  const NEG = -Infinity;
  function ground(x, z) {
    if (z >= 0) return (z <= 4 && Math.abs(x) <= 7.7) ? BASE : NEG;
    const i = Math.floor(-z / D);
    if (i >= N) return (-z <= N * D + 6 && Math.abs(x) <= 7.7) ? BASE : NEG;
    if (isCheck(i)) return Math.abs(x) <= 7.7 ? BASE : NEG;
    const l = Math.round(x / LS + (LANES - 1) / 2);
    if (l < 0 || l >= LANES || Math.abs(x - laneX(l)) > LW / 2) return NEG;
    return H[l][i];
  }
  const RR = 0.28, OFF = [[0, 0], [RR, 0], [-RR, 0], [0, RR], [0, -RR]];
  const wall = (x, z, feet) => OFF.some(([ox, oz]) => ground(x + ox, z + oz) > feet + 0.45);
  function support(x, z, feet) { let s = NEG; for (const [ox, oz] of OFF) { const g = ground(x + ox, z + oz); if (g <= feet + 0.45 && g > s) s = g; } return s; }
  function refresh(t) {
    let k = 0;
    for (let l = 0; l < LANES; l++) for (let i = 0; i < N; i++, k++) {
      const chk = isCheck(i), h = chk ? -100 : hAt(l, i, t);
      prevH[l][i] = H[l][i]; H[l][i] = h;
      v3.set(laneX(l), h, -(i + 0.5) * D); sc.set(1, chk ? 0.001 : h + 24, 1);
      bars.setMatrixAt(k, m4.compose(v3, q, sc));
      const d = h - prevH[l][i]; bars.setColorAt(k, Math.abs(d) < 1e-4 ? FLAT : d > 0 ? UP : DOWN);
    }
    bars.instanceMatrix.needsUpdate = true; if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
  }
  refresh(0); refresh(0.016);
  return {
    scene, camera, label: 'JUMP',
    look(dx, dy) { st.yaw -= dx * 0.0022; st.pitch = clamp(st.pitch - dy * 0.0022, -1.3, 1.2); },
    down() { st.jumpQ = 0.14; }, up() {},
    update(dt) {
      if (st.done) return;
      st.t += dt; st.msgT -= dt; refresh(st.t);
      for (const t of tapeTex) t.offset.x = st.t * 0.035;
      const { f, s } = ctx.axes();
      if (!st.started && (f || s)) st.started = true;
      if (st.started) st.time += dt;
      const n = Math.hypot(f, s) || 1, sp = 7.4 * Math.min(1, Math.hypot(f, s));
      const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
      const dx = (-sin * f + cos * s) / n * sp * dt, dz = (-cos * f - sin * s) / n * sp * dt;
      if (!wall(st.x + dx, st.z, st.y)) st.x += dx;
      if (!wall(st.x, st.z + dz, st.y)) st.z += dz;
      if (ctx.keys.Space) st.jumpQ = 0.1;
      st.jumpQ -= dt; st.coy -= dt;
      if (st.jumpQ > 0 && (st.grounded || st.coy > 0)) { st.vy = 8.6; st.grounded = false; st.coy = 0; st.jumpQ = 0; }
      st.vy -= 22 * dt; st.y += st.vy * dt;
      const sup = support(st.x, st.z, st.y);
      if (sup > NEG && st.vy <= 0 && st.y <= sup) { st.y = sup; st.vy = 0; st.grounded = true; st.coy = 0.1; }
      else st.grounded = false;
      // checkpoints, falls, finish
      const i = Math.floor(-st.z / D);
      if (st.grounded && i >= 0 && i < N && isCheck(i)) { const num = (i + 1) / EVERY; if (num > st.check.n) { st.check = { z: -(i + 0.5) * D, n: num }; st.msg = `Checkpoint ${num}/3`; st.msgT = 1.3; } }
      if (st.y < BASE - 9) { st.falls++; st.x = 0; st.y = BASE + 0.5; st.z = st.check.z; st.vy = 0; st.yaw = 0; st.msg = 'Margin call. Back to the checkpoint.'; st.msgT = 1.4; }
      if (st.grounded && -st.z > N * D + 0.6) {
        st.done = true;
        ctx.finish({ score: Math.round(st.time * 1000), headline: `${st.time.toFixed(2)}s`, text: `Closing bell. ${st.falls} ${st.falls === 1 ? 'fall' : 'falls'} along the way.` });
        return;
      }
      camera.position.set(st.x, st.y + 1.6, st.z); camera.rotation.set(st.pitch, st.yaw, 0);
      // ticker for the bar under you
      let tick = '<div class="pill">—</div>';
      const l = Math.round(st.x / LS + (LANES - 1) / 2);
      if (i >= 0 && i < N && !isCheck(i) && l >= 0 && l < LANES) {
        const h = H[l][i], d = (h - prevH[l][i]) / dt, up = d >= 0;
        tick = `<div class="pill">${SYM[l]} $${(h * 21.5).toFixed(2)} <span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.abs(d * 4).toFixed(2)}%</span></div>`;
      }
      const prog = clamp(-st.z / (N * D), 0, 1);
      ctx.hud(`${exitHint}<div class="g-top"><div class="pill">⏱ ${st.time.toFixed(2)}s</div>${tick}</div>
        ${st.msgT > 0 ? `<div class="g-msg">${st.msg}</div>` : (!st.started ? `<div class="g-msg" style="font-size:22px">${ctx.touch ? 'Run the charts · JUMP between bars' : 'WASD to run · Space to jump · reach the closing bell'}</div>` : '')}
        <div class="g-bar"><i style="width:${Math.round(prog * 100)}%;background:#35c27a"></i></div>`);
    },
  };
}
