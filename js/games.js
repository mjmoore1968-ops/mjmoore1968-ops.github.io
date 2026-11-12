// Three mini-games. Each returns { scene, camera, update(dt), look(dx,dy), down(), up(), label }.
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const exitHint = '<div class="g-exit"><kbd>E</kbd> / <kbd>Esc</kbd> exit</div>';

function canvasTex(THREE, w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function netTexture(THREE, rep) {
  const t = canvasTex(THREE, 64, 64, (c, W, H) => { c.clearRect(0, 0, W, H); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 5; c.strokeRect(0, 0, W, H); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); return t;
}

/* A lacrosse stick: shaft along +y, head on top. Exported so the apartment can lean one in a corner. */
export function makeLacrosseStick(THREE, { head = 1, shaft = 0.8, headColor = 0xffffff, shaftColor = 0xc9ccd2 } = {}) {
  const g = new THREE.Group();
  const L = c => new THREE.MeshLambertMaterial({ color: c });
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, shaft, 10), L(shaftColor)); sh.position.y = -shaft / 2; g.add(sh);
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.16, 10), L(0x1b1d22)); tape.position.y = -shaft + 0.08; g.add(tape);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.025, 10), L(0x1b1d22)); cap.position.y = -shaft; g.add(cap);
  const pts = [[-0.022, 0], [-0.03, 0.05], [-0.06, 0.15], [-0.082, 0.23], [-0.07, 0.29], [-0.035, 0.318], [0, 0.325], [0.035, 0.318], [0.07, 0.29], [0.082, 0.23], [0.06, 0.15], [0.03, 0.05], [0.022, 0]];
  const hg = new THREE.Group(); hg.scale.setScalar(head); g.add(hg);
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'catmullrom', 0.4);
  hg.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 48, 0.0085, 6, false), L(headColor)));
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.016, 0.05, 10), L(headColor)); throat.position.y = -0.01; hg.add(throat);
  const shape = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  const pocket = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ map: netTexture(THREE, 55), transparent: true, side: THREE.DoubleSide }));
  pocket.position.z = -0.012; hg.add(pocket);
  g.userData.head = hg;
  return g;
}

/* ================================================================== LACROSSE RANGE */
export function createLacrosse(THREE, ctx) {
  const SKY = 0x9cc9ee;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(SKY); scene.fog = new THREE.Fog(SKY, 45, 120);
  const camera = new THREE.PerspectiveCamera(56, 1, 0.05, 200); camera.rotation.order = 'YXZ';
  scene.add(camera, new THREE.HemisphereLight(0xffffff, 0x4c6b3c, 1.9));
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.4); sun.position.set(6, 12, 8); scene.add(sun);
  const L = (c, o) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const add = (geo, m, x, y, z, parent = scene) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // field: goal sits on the origin, mouth facing +z
  const turf = canvasTex(THREE, 256, 256, (c, W) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#2f8040' : '#2a7439'; c.fillRect(0, i * 32, W, 32); } });
  turf.wrapS = turf.wrapT = THREE.RepeatWrapping; turf.repeat.set(7, 7);
  add(new THREE.PlaneGeometry(180, 180), new THREE.MeshLambertMaterial({ map: turf }), 0, 0, 0).rotation.x = -Math.PI / 2;
  const flat = (geo, x, z) => { const m = add(geo, white, x, 0.012, z); m.rotation.x = -Math.PI / 2; return m; };
  flat(new THREE.RingGeometry(2.69, 2.79, 64), 0, 0);              // crease
  flat(new THREE.PlaneGeometry(60, 0.1), 0, 0);                    // goal line extended
  flat(new THREE.PlaneGeometry(60, 0.1), 0, 18.3);                 // restraining line
  flat(new THREE.PlaneGeometry(0.1, 36), -18, 3); flat(new THREE.PlaneGeometry(0.1, 36), 18, 3);
  flat(new THREE.PlaneGeometry(36, 0.1), 0, -13.7);                // end line

  // regulation-style goal: 6ft x 6ft orange pipes, net running back to a point on the ground
  const G = 1.83, HW = G / 2, BACK = -2.1;
  const pipeM = L(0xff6a00), pr = 0.03;
  const pipe = (a, b) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    const m = add(new THREE.CylinderGeometry(pr, pr, d.length(), 10), pipeM, 0, 0, 0);
    m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  };
  pipe([-HW, 0, 0], [-HW, G, 0]); pipe([HW, 0, 0], [HW, G, 0]); pipe([-HW - pr, G, 0], [HW + pr, G, 0]);
  pipe([-HW, 0.03, 0], [0, 0.03, BACK]); pipe([HW, 0.03, 0], [0, 0.03, BACK]);
  const netG = new THREE.BufferGeometry();
  const V = [[-HW, 0, 0], [-HW, G, 0], [0, 0, BACK], [HW, 0, 0], [HW, G, 0], [0, 0, BACK], [-HW, G, 0], [HW, G, 0], [0, 0, BACK]];
  netG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(V.flat()), 3));
  netG.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 0, 0, 1, 1, 1, 0.5, 0]), 2));
  scene.add(new THREE.Mesh(netG, new THREE.MeshBasicMaterial({ map: netTexture(THREE, 16), transparent: true, side: THREE.DoubleSide })));

  // goalie with a big-headed goalie stick
  const goalie = new THREE.Group(); scene.add(goalie); goalie.position.set(0, 0, 0.35);
  const gb = (geo, c, x, y, z) => add(geo, L(c), x, y, z, goalie);
  gb(new THREE.BoxGeometry(0.5, 0.62, 0.26), 0x9b1c2c, 0, 1.12, 0);                      // jersey
  gb(new THREE.BoxGeometry(0.56, 0.2, 0.3), 0xf1f1f1, 0, 1.37, 0);                       // shoulder pads
  gb(new THREE.BoxGeometry(0.2, 0.42, 0.22), 0x1d1d22, -0.13, 0.6, 0); gb(new THREE.BoxGeometry(0.2, 0.42, 0.22), 0x1d1d22, 0.13, 0.6, 0);
  gb(new THREE.BoxGeometry(0.16, 0.4, 0.16), 0xe8c9a8, -0.13, 0.2, 0); gb(new THREE.BoxGeometry(0.16, 0.4, 0.16), 0xe8c9a8, 0.13, 0.2, 0);
  gb(new THREE.SphereGeometry(0.16, 16, 12), 0x9b1c2c, 0, 1.63, 0);                      // helmet
  gb(new THREE.BoxGeometry(0.2, 0.12, 0.06), 0x22252b, 0, 1.6, 0.15);                    // facemask
  gb(new THREE.BoxGeometry(0.34, 0.03, 0.2), 0x9b1c2c, 0, 1.69, 0.1);                    // visor
  const gStick = makeLacrosseStick(THREE, { head: 1.75, shaft: 0.75, headColor: 0xffffff, shaftColor: 0x22252b });
  goalie.add(gStick);
  // backdrop: bleachers, trees, scoreboard
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(60, 0.5, 1.2), L(i % 2 ? 0x9aa3ad : 0x868f99), 0, 0.25 + i * 0.5, -17 - i * 1.2);
  for (let i = 0; i < 26; i++) { const x = -60 + i * 5 + (i % 3), h = 5 + (i * 7 % 4); add(new THREE.ConeGeometry(2.2, h, 7), L(i % 2 ? 0x24613a : 0x2d7446), x, h / 2 + 1, -27 - (i % 2) * 3); }
  add(new THREE.BoxGeometry(6, 2.6, 0.3), L(0x15181f), 0, 6.2, -22.5);
  add(new THREE.PlaneGeometry(5.6, 2.2), new THREE.MeshBasicMaterial({ map: canvasTex(THREE, 512, 200, (c, W, H) => { c.fillStyle = '#0b0d12'; c.fillRect(0, 0, W, H); c.fillStyle = '#f2b441'; c.font = 'bold 54px Georgia, serif'; c.textAlign = 'center'; c.fillText('SHOOTING RANGE', W / 2, 78); c.fillStyle = '#fff'; c.font = 'bold 40px ui-monospace, monospace'; c.fillText('30 SECONDS · STORY ST', W / 2, 150); }) }), 0, 6.2, -22.3); add(new THREE.BoxGeometry(0.3, 5, 0.3), L(0x555b66), -2.4, 2.5, -22.5); add(new THREE.BoxGeometry(0.3, 5, 0.3), L(0x555b66), 2.4, 2.5, -22.5);
  // corner targets
  const tgtM = new THREE.MeshBasicMaterial({ color: 0xfff27a, transparent: true, opacity: 0.55 });
  for (const sx of [-1, 1]) for (const y of [0.28, G - 0.28]) add(new THREE.RingGeometry(0.17, 0.22, 20), tgtM, sx * (HW - 0.28), y, -0.05);

  // your stick
  const stick = makeLacrosseStick(THREE, { head: 0.85, shaft: 0.85 }); camera.add(stick);
  const pocketBall = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 10), L(0xfffb8a, { emissive: 0x4a4600 })); pocketBall.position.set(0, 0.2, 0.015); stick.userData.head.add(pocketBall);
  const ballGeo = new THREE.SphereGeometry(0.06, 12, 10), ballM = L(0xfffb8a, { emissive: 0x4a4600 });

  const st = { th: 0, d: 9.5, aimY: 0, pitch: 0.03, charging: false, cT: 0, charge: 0, cool: 0, swing: 0, balls: [], score: 0, goals: 0, shots: 0, streak: 0,
    time: 30, gx: 0, gy: 1.2, side: 1, shadow: 0, msg: '', msgT: 0, sub: '', done: false, started: false, moveT: 0, grace: 0, t: 0 };
  const dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  function place(first) {
    if (!first) { st.th = rand(-0.8, 0.8); st.d = rand(8, 12.8); }
    camera.position.set(st.d * Math.sin(st.th), 1.65, st.d * Math.cos(st.th)); st.aimY = 0; st.pitch = 0.03;
  }
  place(true);
  function say(m, sub = '') { st.msg = m; st.sub = sub; st.msgT = 1.25; }
  function shoot() {
    camera.getWorldDirection(dir);
    const b = new THREE.Mesh(ballGeo, ballM); b.position.copy(camera.position).addScaledVector(dir, 0.7); b.position.y += 0.05;
    scene.add(b); const sp = 13 + 22 * st.charge;
    st.balls.push({ m: b, v: dir.clone().multiplyScalar(sp).add(tmp.set(0, 4.9 * st.d / sp, 0)), life: 3, live: true, bounced: false, born: st.t, long: st.d > 11 });
    st.shots++; st.cool = 0.45; st.swing = 0.22; st.charging = false; st.started = true;
  }
  return {
    scene, camera, label: 'SHOOT',
    look(dx, dy) { st.aimY = clamp(st.aimY - dx * 0.0014, -0.5, 0.5); st.pitch = clamp(st.pitch - dy * 0.0014, -0.3, 0.45); },
    down() { if (!st.done && st.cool <= 0 && st.time > 0) { st.charging = true; st.cT = 0; st.charge = 0; st.started = true; } },
    up() { if (st.charging && !st.done) shoot(); },
    update(dt) {
      if (st.done) return;
      st.t += dt; if (st.started) st.time -= dt;
      st.cool -= dt; st.msgT -= dt; st.swing -= dt;
      // power meter sweeps up and back down: release near the top
      if (st.charging) { st.cT += dt; const p = (st.cT / 0.75) % 2; st.charge = p < 1 ? p : 2 - p; }
      if (st.moveT > 0) { st.moveT -= dt; if (st.moveT <= 0) place(false); }
      camera.rotation.set(st.pitch, st.th + st.aimY, 0);
      // stick pose: cradle, wind up with charge, snap through on release
      const wind = st.charging ? st.charge * 0.75 : 0, sw = st.swing > 0 ? (1 - st.swing / 0.22) : 0;
      stick.position.set(0.5, -0.42 + wind * 0.05, -1.0);
      stick.rotation.set(-0.3 + wind - (st.swing > 0 ? 1.5 * Math.sin(sw * Math.PI) : 0), 0.15, -0.3 + Math.sin(st.t * 5) * (st.charging ? 0 : 0.04));
      pocketBall.visible = st.cool <= 0 && st.time > 0;
      // goalie: shadows where you are aiming (with lag), then chases the shot
      camera.getWorldDirection(dir);
      const aimX = dir.z < -0.01 ? camera.position.x + dir.x * (-camera.position.z / dir.z) : 0;
      st.shadow = lerp(st.shadow, clamp(aimX, -HW, HW) * 0.3, Math.min(1, dt * 2.6));
      let tx = st.shadow + Math.sin(st.t * 1.7) * 0.06, ty = 1.15;
      const lead = st.balls.find(b => b.live && b.v.z < 0 && st.t - b.born > 0.11);
      if (lead) { const p = lead.m.position, k = -p.z / lead.v.z; tx = clamp(p.x + lead.v.x * k, -HW + 0.25, HW - 0.25); ty = clamp(p.y + lead.v.y * k - 4.9 * k * k, 0.35, 1.7); }
      const gs = (1.1 + st.goals * 0.07) * dt;
      st.gx += clamp(tx - st.gx, -gs, gs); st.gy += clamp(ty - st.gy, -2.4 * dt, 2.4 * dt);
      if (lead) st.side = tx > st.gx ? 1 : -1;
      goalie.position.x = st.gx; goalie.rotation.y = st.th * 0.6;
      const hx = st.side * 0.34, hy = st.gy;
      gStick.position.set(hx, hy - 0.28, 0.16); gStick.rotation.set(0, 0, -st.side * 0.25);
      // balls
      for (const b of st.balls) {
        b.life -= dt; const p = b.m.position, pz = p.z, px = p.x, py = p.y;
        b.v.y -= 9.8 * dt; p.addScaledVector(b.v, dt);
        if (p.y < 0.06) { p.y = 0.06; b.v.y *= -0.62; b.v.x *= 0.86; b.v.z *= 0.86; if (b.live) b.bounced = true; }
        if (b.live && pz > 0 && p.z <= 0) {
          const k = pz / (pz - p.z), x = px + (p.x - px) * k, y = py + (p.y - py) * k;
          b.live = false;
          const inside = Math.abs(x) < HW - 0.05 && y < G - 0.05 && y > 0;
          const onPipe = (Math.abs(Math.abs(x) - HW) < 0.11 && y < G + 0.1) || (Math.abs(y - G) < 0.11 && Math.abs(x) < HW + 0.1);
          if (inside) {
            const gwx = st.gx + hx + st.side * 0.07, body = Math.abs(x - st.gx) < 0.27 && y < 1.78;
            const stickSave = Math.hypot(x - gwx, y - hy) < 0.23;
            if (body || stickSave) { say(stickSave ? 'Stick save!' : 'Saved!', st.streak > 1 ? 'Streak over' : ''); st.streak = 0; b.v.set((x - st.gx) * 5 + rand(-1, 1), 2.5, 5); p.z = 0.08; }
            else {
              const corner = Math.abs(x) > HW - 0.5 && (y > G - 0.5 || y < 0.5);
              st.goals++; st.streak++;
              const bonus = []; let pts = 1;
              if (corner) { pts += 1; bonus.push('corner'); }
              if (b.bounced) { pts += 1; bonus.push('bounce shot'); }
              if (b.long) { pts += 1; bonus.push('from range'); }
              if (st.streak > 1) { const s = Math.min(st.streak - 1, 2); pts += s; bonus.push(`streak x${st.streak}`); }
              st.score += pts; say(`GOAL! +${pts}`, bonus.join(' · ')); b.v.multiplyScalar(0.1); b.life = 0.5;
              if (st.time > 1.2) st.moveT = 0.7;
            }
          } else if (onPipe) { say('Pipe!'); st.streak = 0; b.v.z *= -0.5; p.z = 0.08; }
          else { say(y > G ? 'High' : 'Wide'); st.streak = 0; }
        }
      }
      st.balls = st.balls.filter(b => b.life > 0 || (scene.remove(b.m), false));
      const t = Math.max(0, st.time), pc = Math.round(st.charge * 100);
      ctx.hud(`${exitHint}<div class="g-top"><div class="pill">⏱ ${t.toFixed(1)}s</div><div class="pill">${st.score} pts</div><div class="pill">${st.goals}/${st.shots}</div>${st.streak > 1 ? `<div class="pill up">🔥 x${st.streak}</div>` : ''}</div>
        ${st.msgT > 0 ? `<div class="g-msg">${st.msg}${st.sub ? `<small>${st.sub}</small>` : ''}</div>` : (!st.started ? `<div class="g-msg" style="font-size:22px">${ctx.touch ? 'Hold SHOOT, release at full power' : 'Hold click, release at full power'}<small>Corners, bounce shots and streaks score extra. Fake the goalie.</small></div>` : '')}
        <div class="g-bar${pc > 85 ? ' hot' : ''}"><i style="width:${st.charging ? pc : 0}%"></i><b></b></div>`);
      if (st.time <= 0) {
        st.charging = false; st.grace += dt;
        if (st.grace > 0.9 || !st.balls.some(b => b.live)) {
          st.done = true;
          ctx.finish({ score: st.score, headline: `${st.score} pts`, text: `${st.goals} goals on ${st.shots} shots in 30 seconds.` });
        }
      }
    },
  };
}

/* ================================================================== BOOSTER LANDING */
export const VEHICLES = {
  f9: { name: 'Falcon 9', AT: 21, burnT: 12, rot: 2.1, k: 0.006, launchX: -24, padX: 24, padW: 6, vyMax: 6.5, tiltMax: 14, mult: 1, r: 0.9, h: 9, color: 0xf3f3f0,
    blurb: 'The workhorse. Lift off from the coast, drop stage 2, and fly the booster out to the drone ship.' },
  heavy: { name: 'Falcon Heavy', AT: 25, burnT: 10.5, rot: 1.45, k: 0.006, launchX: -24, padX: 26, padW: 6, vyMax: 6, tiltMax: 12, mult: 1.15, r: 0.9, h: 9, color: 0xf3f3f0, sides: true,
    blurb: 'Three cores. Much more thrust, burns fuel faster, and turns like a truck. Scores x1.15.' },
  starship: { name: 'Starship', AT: 23, burnT: 13, rot: 1.05, k: 0.009, launchX: 0, padX: 0, padW: 2.6, vyMax: 4.5, tiltMax: 9, mult: 1.3, r: 1.5, h: 11, color: 0xc9ced6, tower: true,
    blurb: 'Huge and slow to turn. It has to come back to the launch tower, gently and dead center. Scores x1.3.' },
};
const G0 = 9.8;
// "energy height" of stage 2 at separation after a straight-up burn of t seconds (with drag)
function energyAfter(V, t) {
  let v = 0, h = 0; const dt = 1 / 120;
  for (let s = 0; s < t; s += dt) { v += (V.AT - G0 - V.k * v * Math.abs(v)) * dt; h += v * dt; }
  return h + v * v / (2 * G0);
}
export function createRocket(THREE, ctx, opt = {}) {
  const key = VEHICLES[opt.vehicle] ? opt.vehicle : 'f9', V = VEHICLES[key];
  const E_MIN = energyAfter(V, V.burnT * 0.5), E_MAX = energyAfter(V, V.burnT * 0.6);
  const km = e => Math.round(60 + e * 0.38);
  const scene = new THREE.Scene(); const bgLow = new THREE.Color(0x27466b), bgHigh = new THREE.Color(0x04060c); scene.background = bgLow.clone();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 900); camera.position.set(0, 38, 98);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x10203a, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(-30, 40, 60); scene.add(sun);
  const L = (c, o) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const add = (geo, m, x, y, z, parent = scene) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); parent.add(o); return o; };
  // stars + altitude markers
  const sp = new Float32Array(2400); for (let i = 0; i < 800; i++) { sp[i * 3] = (Math.random() - 0.5) * 520; sp[i * 3 + 1] = Math.random() * 1500 - 10; sp[i * 3 + 2] = -90 - Math.random() * 60; }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.9 })));
  add(new THREE.SphereGeometry(9, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf2e9d0 }), -70, 78, -100);
  for (let a = 100; a <= 1400; a += 100) {
    const t = canvasTex(THREE, 256, 64, (c, W, H) => { c.fillStyle = 'rgba(255,255,255,.55)'; c.font = 'bold 40px ui-monospace, Menlo, monospace'; c.textBaseline = 'middle'; c.fillText(`${a} m`, 6, H / 2); });
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true })); s.scale.set(12, 3, 1); s.position.set(-46, a, -5); scene.add(s);
    add(new THREE.PlaneGeometry(240, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12 }), 0, a, -6);
  }
  for (let i = 0; i < 14; i++) add(new THREE.SphereGeometry(rand(6, 12), 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1 }), rand(-120, 120), rand(110, 420), rand(-60, -20)).scale.set(2.4, 0.5, 1);
  // ground
  const DECK = 1.2, sea = add(new THREE.PlaneGeometry(900, 300), L(0x0c2c49), 0, 0, 0); sea.rotation.x = -Math.PI / 2;
  const isLand = x => V.tower ? Math.abs(x) < 60 : x < -9;
  if (V.tower) add(new THREE.BoxGeometry(120, DECK, 40), L(0x3a3f38), 0, DECK / 2, -6);
  else add(new THREE.BoxGeometry(110, DECK, 40), L(0x3a3f38), -64, DECK / 2, -6);
  // launch mount
  add(new THREE.BoxGeometry(V.r * 5, 0.3, V.r * 5), L(0x55595f), V.launchX, DECK + 0.15, 0);
  // landing target
  const pad = new THREE.Group(); pad.position.set(V.padX, 0, 0); scene.add(pad);
  if (!V.tower) {
    add(new THREE.BoxGeometry(V.padW * 2 + 2, DECK, 9), L(0x2a2f38), 0, DECK / 2, 0, pad);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.4, 0.5, 0.4), L(0xff4d3d, { emissive: 0xff2a1a }), s * (V.padW + 0.6), DECK + 0.25, 4.2, pad);
    const ring = add(new THREE.RingGeometry(2.6, 3.1, 40), new THREE.MeshBasicMaterial({ color: 0xf2b441 }), 0, DECK + 0.02, 0, pad); ring.rotation.x = -Math.PI / 2;
  } else {
    // launch-and-catch tower with two arms
    const tw = L(0x2b2f36);
    add(new THREE.BoxGeometry(2.2, 34, 2.2), tw, 5.2, DECK + 17, -1, pad);
    for (let y = 4; y < 34; y += 4) add(new THREE.BoxGeometry(2.5, 0.25, 2.5), L(0x3d424b), 5.2, DECK + y, -1, pad);
    for (const z of [-2.2, 2.2]) add(new THREE.BoxGeometry(6.5, 0.5, 0.5), L(0xd9b34a), 2.2, DECK + 13, z, pad);
    const ring = add(new THREE.RingGeometry(V.padW - 0.35, V.padW, 40), new THREE.MeshBasicMaterial({ color: 0xf2b441 }), 0, DECK + 0.33, 0, pad); ring.rotation.x = -Math.PI / 2;
  }
  // vehicle
  const rk = new THREE.Group(); scene.add(rk);
  const hullM = L(V.color), dark = L(0x1b1d22);
  add(new THREE.CylinderGeometry(V.r, V.r, V.h, 24), hullM, 0, V.h / 2 + 0.8, 0, rk);
  add(new THREE.CylinderGeometry(V.r * 0.62, V.r * 0.9, 0.8, 16), L(0x33363d), 0, 0.5, 0, rk);
  add(new THREE.CylinderGeometry(V.r * 1.02, V.r * 1.02, 1.1, 24), dark, 0, V.h + 0.3, 0, rk);
  if (V.tower) { for (const s of [-1, 1]) add(new THREE.BoxGeometry(1.6, 0.14, 1.2), dark, s * (V.r + 0.7), V.h - 0.2, 0, rk); }
  else {
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, leg = add(new THREE.BoxGeometry(0.16, 3.0, 0.16), dark, Math.cos(a) * 1.5, 1.2, Math.sin(a) * 1.5, rk); leg.rotation.z = -Math.cos(a) * 0.6; leg.rotation.x = Math.sin(a) * 0.6; }
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(1.1, 0.12, 0.9), dark, s * 1.3, V.h - 0.3, 0, rk);
  }
  const upper = new THREE.Group(); upper.position.y = V.h + 0.85; rk.add(upper);
  if (V.tower) {
    add(new THREE.CylinderGeometry(V.r, V.r, 6.5, 24), hullM, 0, 3.25, 0, upper);
    add(new THREE.ConeGeometry(V.r, 3.4, 24), hullM, 0, 8.2, 0, upper);
    for (const s of [-1, 1]) { add(new THREE.BoxGeometry(1.5, 2.4, 0.16), dark, s * (V.r + 0.6), 1.4, 0, upper); add(new THREE.BoxGeometry(1.0, 1.5, 0.16), dark, s * (V.r + 0.25), 7.1, 0, upper); }
  } else {
    add(new THREE.CylinderGeometry(V.r, V.r, 2.6, 20), hullM, 0, 1.3, 0, upper);
    add(new THREE.CylinderGeometry(V.r * 1.22, V.r, 0.7, 20), hullM, 0, 2.95, 0, upper);
    add(new THREE.CylinderGeometry(V.r * 1.22, V.r * 1.22, 2.0, 20), hullM, 0, 4.3, 0, upper);
    add(new THREE.ConeGeometry(V.r * 1.22, 2.2, 20), hullM, 0, 6.4, 0, upper);
  }
  const sides = [];
  if (V.sides) for (const s of [-1, 1]) {
    const c = new THREE.Group(); c.position.set(s * (V.r * 2 + 0.06), 0, 0); rk.add(c); sides.push({ g: c, s, v: null });
    add(new THREE.CylinderGeometry(V.r, V.r, V.h - 0.6, 20), hullM, 0, (V.h - 0.6) / 2 + 0.8, 0, c);
    add(new THREE.ConeGeometry(V.r, 2.2, 20), hullM, 0, V.h + 1.3, 0, c);
    add(new THREE.CylinderGeometry(V.r * 0.62, V.r * 0.9, 0.8, 16), L(0x33363d), 0, 0.5, 0, c);
  }
  const mkFlame = (parent, x = 0, s = 1) => {
    const f = add(new THREE.ConeGeometry(0.8 * V.r * s, 5.5 * s, 14), new THREE.MeshBasicMaterial({ color: 0xffa52e, transparent: true, opacity: 0.92 }), x, -2.4 * s, 0, parent); f.rotation.x = Math.PI;
    const c = add(new THREE.ConeGeometry(0.42 * V.r * s, 3.2 * s, 12), new THREE.MeshBasicMaterial({ color: 0xfff3c4 }), x, -1.4 * s, 0, parent); c.rotation.x = Math.PI;
    return [f, c];
  };
  const flames = [mkFlame(rk, 0, V.tower ? 1.25 : 1), ...sides.map(sd => mkFlame(sd.g))];
  const s2flame = mkFlame(upper, 0, 0.6); s2flame.forEach(f => (f.visible = false));
  const glow = new THREE.PointLight(0xffa040, 0, 80, 1.5); glow.position.y = -1; rk.add(glow);
  const boom = add(new THREE.SphereGeometry(1, 18, 14), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true }), 0, 0, 0); boom.visible = false;

  const BURN = 100 / V.burnT;
  const st = { x: V.launchX, y: DECK + 0.3, vx: 0, vy: 0, th: 0, om: 0, fuel: 100, hold: false, phase: 'pad', endT: 0, result: null, t: 0, sepE: 0, sepT: 0, s2: null, msg: '', msgT: 0, maxAlt: 0 };
  const GROUND = DECK + 0.3;
  function end(ok, text, score) {
    st.phase = ok ? 'landed' : 'crashed'; st.endT = 1.6;
    st.result = { score, headline: ok ? `${score} pts` : 'Boom.', text, submit: ok && score > 0 };
    if (!ok) { rk.visible = false; boom.visible = true; boom.position.set(st.x, Math.max(st.y, 1) + 3, 0); }
  }
  function separate() {
    if (st.phase !== 'ascent') return;
    if (st.y < 40) { st.msg = 'Too low to separate'; st.msgT = 1; return; }
    st.sepE = (st.y - GROUND) + st.vy * Math.abs(st.vy) / (2 * G0); st.phase = 'descent'; st.sepT = st.t;
    scene.attach(upper); st.s2 = { vx: st.vx, vy: st.vy + 4, th: st.th, t: 0 }; s2flame.forEach(f => (f.visible = true));
    for (const sd of sides) { scene.attach(sd.g); sd.v = { vx: st.vx + sd.s * 7, vy: st.vy - 2, om: -sd.s * 0.5 }; }
    flames.slice(1).forEach(fl => fl.forEach(f => (f.visible = false)));
    const o = km(st.sepE);
    st.msg = st.sepE < E_MIN ? `Stage 2 only reached ${o} km. Short of orbit.` : `Stage 2 is away: ${o} km orbit. Now bring it home.`; st.msgT = 2.6;
  }
  const api = {
    scene, camera,
    get label() { return st.phase === 'pad' || st.phase === 'ascent' ? 'SEPARATE' : 'THRUST'; },
    look() {},
    down() { if (st.phase === 'ascent') separate(); else st.hold = true; },
    up() { st.hold = false; },
    update(dt) {
      st.t += dt; st.msgT -= dt;
      const { f, s } = ctx.axes();
      let thrust = false;
      const flying = st.phase === 'pad' || st.phase === 'ascent' || st.phase === 'descent';
      if (flying) {
        const want = f > 0.3 || (st.phase === 'descent' && st.hold && st.t - st.sepT > 0.25);
        thrust = want && st.fuel > 0;
        if (st.phase === 'pad' && thrust) st.phase = 'ascent';
        if (st.phase !== 'pad') {
          st.om += -s * V.rot * dt; st.om *= 1 - 1.5 * dt; st.th += st.om * dt;
          const a = thrust ? V.AT : 0, sp = Math.hypot(st.vx, st.vy);
          st.vx += (-Math.sin(st.th) * a - V.k * st.vx * sp) * dt; st.vy += (Math.cos(st.th) * a - G0 - V.k * st.vy * sp) * dt;
          st.x += st.vx * dt; st.y += st.vy * dt; st.maxAlt = Math.max(st.maxAlt, st.y);
          if (thrust) st.fuel = Math.max(0, st.fuel - BURN * dt);
          if (st.phase === 'ascent' && st.fuel <= 0) { separate(); if (st.phase === 'ascent') end(false, 'Out of fuel before separation.', 0); }
        }
        const onPad = Math.abs(st.x - V.padX) < V.padW + 1, floor = isLand(st.x) || onPad ? GROUND : 0;
        if (st.phase === 'ascent' && st.y <= floor && st.vy < -0.5) { st.y = floor; end(false, 'Fell back onto the pad before separation.', 0); }
        else if (st.phase === 'ascent' && st.y < GROUND && st.vy <= 0) { st.y = GROUND; st.vy = 0; }
        else if (st.phase === 'descent' && st.y <= floor) {
          st.y = floor; const dx = Math.abs(st.x - V.padX), tilt = Math.abs(st.th) * 57.3, where = V.tower ? 'the tower' : 'the drone ship';
          if (!onPad || dx > V.padW) end(false, isLand(st.x) ? `Came down on land, ${dx.toFixed(0)} m from ${where}.` : `Missed ${where}. Splashdown.`, 0);
          else if (st.vy < -V.vyMax) end(false, `Too fast: ${(-st.vy).toFixed(1)} m/s at touchdown. Keep it under ${V.vyMax}.`, 0);
          else if (Math.abs(st.vx) > 3.5) end(false, `Sliding sideways at ${Math.abs(st.vx).toFixed(1)} m/s. Kill the drift first.`, 0);
          else if (tilt > V.tiltMax) end(false, `Tipped over: ${tilt.toFixed(0)}° of tilt. Land upright.`, 0);
          else {
            const orbit = st.sepE >= E_MIN, payload = orbit ? 300 + 300 * clamp((st.sepE - E_MIN) / (E_MAX - E_MIN), 0, 1) : 0;
            const landing = 200 + st.fuel * 6 + (1 - dx / V.padW) * 180 + (V.vyMax + st.vy) * 25 + (V.tiltMax - tilt) * 5;
            const score = Math.round((payload + landing) * V.mult * (orbit ? 1 : 0.4));
            st.th = 0;
            end(true, `${V.name}: stage 2 reached ${km(st.sepE)} km (target ${km(E_MIN)}–${km(E_MAX)})${orbit ? '' : ', short of orbit'}. Touchdown at ${(-st.vy).toFixed(1)} m/s, ${dx.toFixed(1)} m off center, ${st.fuel.toFixed(0)}% fuel left.`, score);
          }
        } else if (Math.abs(st.x) > 220 || st.y > 1450) end(false, 'Lost the booster. Stay near the landing zone.', 0);
      } else {
        st.endT -= dt;
        if (st.phase === 'crashed') { const k = 1.6 - st.endT; boom.scale.setScalar(1 + k * 16); boom.material.opacity = Math.max(0, 1 - k / 1.3); }
        if (st.endT <= 0 && st.result) { const r = st.result; st.result = null; ctx.finish(r); }
      }
      // separated hardware
      if (st.s2) { const o = st.s2; o.t += dt; o.vx += -Math.sin(o.th) * 26 * dt; o.vy += (Math.cos(o.th) * 26 - G0) * dt; upper.position.x += o.vx * dt; upper.position.y += o.vy * dt; if (o.t > 9) { upper.visible = false; st.s2 = null; } }
      for (const sd of sides) if (sd.v) { sd.v.vy -= G0 * dt; sd.g.position.x += sd.v.vx * dt; sd.g.position.y += sd.v.vy * dt; sd.g.rotation.z += sd.v.om * dt; if (sd.g.position.y < -8) { sd.g.visible = false; sd.v = null; } }
      rk.position.set(st.x, st.y, 0); rk.rotation.z = st.th;
      flames.forEach((fl, i) => { const on = thrust && (i === 0 || st.phase !== 'descent'); fl.forEach(f => (f.visible = on)); if (on) { const k = 0.85 + Math.random() * 0.35; fl[0].scale.set(1, k, 1); } });
      glow.intensity = thrust ? 70 : 0;
      const cy = Math.max(38, st.y + 8);
      camera.position.x += (clamp(st.x, -70, 70) * 0.8 - camera.position.x) * Math.min(1, dt * 2.5);
      camera.position.y += (cy - camera.position.y) * Math.min(1, dt * 5);
      camera.lookAt(camera.position.x, camera.position.y - 2, 0);
      scene.background.copy(bgLow).lerp(bgHigh, clamp(st.y / 520, 0, 1));
      // HUD
      const alt = Math.max(0, st.y - GROUND), tilt = st.th * 57.3;
      const stop = st.vy < 0 ? (st.vy * st.vy) / (2 * (V.AT - G0)) : 0;
      const E = alt + st.vy * Math.abs(st.vy) / (2 * G0);
      const ascent = st.phase === 'pad' || st.phase === 'ascent';
      let top = '';
      if (ascent) {
        const state = E < E_MIN ? ['KEEP BURNING', ''] : E <= E_MAX ? ['IN THE WINDOW: SEPARATE', 'up'] : ['ABOVE TARGET: SEPARATE NOW', 'down'];
        const pct = clamp(E / (E_MAX * 1.15), 0, 1) * 100, a = E_MIN / (E_MAX * 1.15) * 100, b = E_MAX / (E_MAX * 1.15) * 100;
        top = `<div class="g-top" style="flex-direction:column;align-items:center;gap:6px">
          <div class="pill">${V.name} · Stage 2 orbit <b>${km(Math.max(0, E))} km</b> · target ${km(E_MIN)}–${km(E_MAX)} km</div>
          <div class="g-band"><span style="left:${a}%;width:${b - a}%"></span><i style="left:${pct}%"></i></div>
          <div class="pill ${state[1]}">${st.phase === 'pad' ? (ctx.touch ? 'Push the stick up to launch' : 'Hold W to launch') : state[0]}</div></div>`;
      } else top = `<div class="g-top"><div class="pill">${V.name}</div><div class="pill">Stage 2: ${km(st.sepE)} km ${st.sepE >= E_MIN ? '✓' : '✗'}</div><div class="pill">Target ${(V.padX - st.x >= 0 ? '→ ' : '← ') + Math.abs(V.padX - st.x).toFixed(0)} m</div></div>`;
      ctx.hud(`${exitHint}${top}
        <div class="g-side">
          ALT &nbsp;&nbsp;${alt.toFixed(0).padStart(6)} m<br>
          V-SPD ${st.vy.toFixed(1).padStart(6)} m/s<br>
          H-SPD ${st.vx.toFixed(1).padStart(6)} m/s<br>
          TILT &nbsp;${tilt.toFixed(0).padStart(6)}°<br>
          ${ascent ? '' : `BURN@ ${stop.toFixed(0).padStart(6)} m<br>`}
          FUEL &nbsp;${st.fuel.toFixed(0).padStart(6)}%
        </div>
        <div class="g-plaque"><b>Flight plaque · ${V.name}</b><br>
          a = (T/m)·n̂ − g·ŷ − k·|v|·v &nbsp; T/m = ${V.AT}, k = ${V.k}<br>
          terminal velocity v<sub>t</sub> = √(g/k) ≈ ${Math.sqrt(G0 / V.k).toFixed(0)} m/s<br>
          stop height h = v² / (2·(T/m − g)): burn when ALT ≈ BURN@<br>
          land: |v<sub>y</sub>| &lt; ${V.vyMax}, |v<sub>x</sub>| &lt; 3.5, tilt &lt; ${V.tiltMax}°, within ${V.padW} m</div>
        ${st.phase === 'landed' ? `<div class="g-msg">${V.tower ? 'Caught by the tower.' : 'The booster has landed.'}</div>` : st.phase === 'crashed' ? '<div class="g-msg">Rapid unscheduled disassembly</div>'
          : st.msgT > 0 ? `<div class="g-msg" style="font-size:22px">${st.msg}</div>`
          : st.phase === 'ascent' && st.t < 6 ? `<div class="g-msg" style="font-size:20px">${ctx.touch ? 'Stick up to burn · left/right to tilt · SEPARATE in the window' : 'W burn · A/D tilt · Space or click to separate'}<small>Every second you burn going up is fuel you will not have coming down.</small></div>` : ''}
        <div class="g-bar" style="top:auto;bottom:22px"><i style="width:${st.fuel}%;background:${st.fuel < 30 ? '#e5544b' : '#f2b441'}"></i></div>`);
    },
  };
  return api;
}

/* ================================================================== MARKET PARKOUR */
export function createParkour(THREE, ctx) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x070b14); scene.fog = new THREE.Fog(0x070b14, 30, 95);
  const camera = new THREE.PerspectiveCamera(74, 1, 0.05, 200); camera.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x1a2233, 1.7));
  const dl = new THREE.DirectionalLight(0xffffff, 1.1); dl.position.set(4, 10, 6); scene.add(dl);

  const SYM = ['LAX', 'RKT', 'BME'], LANES = 3, N = 65, D = 2.2, LW = 2.3, LS = 3.1, BASE = 6, EVERY = 13, PW = 5.0, SECTIONS = N / EVERY;
  const ph = SYM.map((_, l) => [l * 1.7 + 0.4, l * 2.9 + 1.1, 0.7 + (l * 37 % 10) / 24]);
  const laneX = l => (l - (LANES - 1) / 2) * LS;
  const isCheck = i => i % EVERY === EVERY - 1;
  const H = Array.from({ length: LANES }, () => new Float32Array(N));
  const prevH = Array.from({ length: LANES }, () => new Float32Array(N));
  const warn = Array.from({ length: LANES }, () => new Uint8Array(N));
  const events = [];           // { type:'crash'|'spike', l, i0, i1, t0 }
  const WARN = 0.85, HOLD = 3.2;
  function evOffset(e, t) {
    const a = t - e.t0; if (a < WARN) return 0;
    const amp = e.type === 'crash' ? -15 : 4.6, inT = e.type === 'crash' ? 0.35 : 0.25;
    if (a < WARN + inT) return amp * (a - WARN) / inT;
    if (a < WARN + HOLD) return amp;
    return amp * Math.max(0, 1 - (a - WARN - HOLD) / 0.7);
  }
  function hAt(l, i, t) {
    const sec = Math.floor(i / EVERY), A = 1.2 + sec * 0.3, [p1, p2, spd] = ph[l];
    let h = BASE + A * (0.6 * Math.sin(0.5 * i + p1 + t * spd) + 0.4 * Math.sin(0.23 * i - t * 0.6 * spd + p2));
    for (const e of events) if (e.l === l && i >= e.i0 && i <= e.i1) h += evOffset(e, t);
    return h;
  }
  const geo = new THREE.BoxGeometry(LW, 1, D - 0.14); geo.translate(0, -0.5, 0);
  const bars = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), LANES * N); scene.add(bars);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  const UP = new THREE.Color(0x27b36a), DOWN = new THREE.Color(0xdc4a43), FLAT = new THREE.Color(0x44506a), ALERT = new THREE.Color(0xffd23f), ALERT2 = new THREE.Color(0x6b5a14);
  const platM = new THREE.MeshLambertMaterial({ color: 0x2b3550 });
  const plat = (zc, len, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(PW * 2, 30, len), c || platM); m.position.set(0, BASE - 15, zc); scene.add(m); };
  plat(2, 4);
  for (let i = 0; i < N; i++) if (isCheck(i)) plat(-(i + 0.5) * D, D - 0.06);
  plat(-(N * D + 3), 6, new THREE.MeshLambertMaterial({ color: 0xf2b441 }));
  const tapeTex = [];
  const gate = (z, text) => {
    const t = canvasTex(THREE, 2048, 128, (c, W, Hh) => {
      c.fillStyle = '#05080f'; c.fillRect(0, 0, W, Hh); c.font = 'bold 72px ui-monospace, Menlo, monospace'; c.textBaseline = 'middle';
      let x = 20; const parts = text || SYM.flatMap((s, i) => [[s, '#fff'], [(i % 2 ? '▼ ' : '▲ ') + (1 + i * 0.7).toFixed(2) + '%', i % 2 ? '#e5544b' : '#35c27a']]);
      for (let r = 0; r < 5; r++) for (const [s, col] of parts) { c.fillStyle = col; c.fillText(s, x, Hh / 2 + 4); x += c.measureText(s).width + 44; }
    });
    t.wrapS = THREE.RepeatWrapping; tapeTex.push(t);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(PW * 2 + 1, 0.9), new THREE.MeshBasicMaterial({ map: t })); m.position.set(0, BASE + 5.4, z); scene.add(m);
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, 40, 0.25), platM); p.position.set(s * (PW + 0.4), BASE - 14, z); scene.add(p); }
  };
  gate(-0.2); for (let i = 0; i < N; i++) if (isCheck(i)) gate(-(i + 1) * D);
  gate(-(N * D + 5.8), [['CLOSING BELL', '#f2b441'], ['FINISH', '#fff']]);
  const grid = new THREE.GridHelper(400, 100, 0x1c6b47, 0x12233a); grid.position.y = -16; scene.add(grid);

  // pickups and bears
  const items = [];
  const mk = (type, l, i) => {
    let m;
    if (type === 'bull') { m = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 4), new THREE.MeshBasicMaterial({ color: 0x35e08a })); }
    else if (type === 'div') { m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.07, 20), new THREE.MeshBasicMaterial({ color: 0xf2c94c })); m.rotation.x = Math.PI / 2; }
    else if (type === 'hedge') { m = new THREE.Mesh(new THREE.OctahedronGeometry(0.46), new THREE.MeshBasicMaterial({ color: 0x5aa9ff })); }
    else { m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshLambertMaterial({ color: 0xc2332c, emissive: 0x5a0d0a })); }
    scene.add(m); items.push({ type, l, i, m, x: laneX(l), dir: Math.random() < 0.5 ? -1 : 1, alive: true });
  };
  for (let s = 0; s < SECTIONS; s++) {
    const base = s * EVERY, used = new Set();
    const pick = () => { let i; do { i = base + 2 + Math.floor(Math.random() * (EVERY - 4)); } while (used.has(i)); used.add(i); return i; };
    mk('div', Math.floor(Math.random() * LANES), pick()); mk('div', Math.floor(Math.random() * LANES), pick());
    mk(s % 2 ? 'hedge' : 'bull', Math.floor(Math.random() * LANES), pick());
    if (s === 2 || s === 4) mk('bull', Math.floor(Math.random() * LANES), pick());
    for (let b = 0; b < (s === 0 ? 1 : s < 3 ? 2 : 3); b++) mk('bear', 1, pick());
  }

  const st = { x: 0, y: BASE, z: 2, vy: 0, yaw: 0, pitch: -0.12, grounded: true, coy: 0, t: 0, time: 0, started: false, check: { z: 2, n: 0 }, done: false, falls: 0, jumpQ: 0,
    msg: '', msgT: 0, boost: 0, shield: false, stun: 0, nextEv: 1.2, bonus: 0 };
  const NEG = -Infinity;
  function ground(x, z) {
    if (z >= 0) return (z <= 4 && Math.abs(x) <= PW) ? BASE : NEG;
    const i = Math.floor(-z / D);
    if (i >= N) return (-z <= N * D + 6 && Math.abs(x) <= PW) ? BASE : NEG;
    if (isCheck(i)) return Math.abs(x) <= PW ? BASE : NEG;
    const l = Math.round(x / LS + (LANES - 1) / 2);
    if (l < 0 || l >= LANES || Math.abs(x - laneX(l)) > LW / 2) return NEG;
    return H[l][i];
  }
  const RR = 0.28, OFF = [[0, 0], [RR, 0], [-RR, 0], [0, RR], [0, -RR]];
  const wall = (x, z, feet) => OFF.some(([ox, oz]) => ground(x + ox, z + oz) > feet + 0.45);
  function support(x, z, feet) { let s = NEG; for (const [ox, oz] of OFF) { const g = ground(x + ox, z + oz); if (g <= feet + 0.45 && g > s) s = g; } return s; }
  function refresh(t) {
    for (let l = 0; l < LANES; l++) warn[l].fill(0);
    for (let k = events.length - 1; k >= 0; k--) {
      const e = events[k], a = t - e.t0;
      if (a > WARN + HOLD + 0.8) { events.splice(k, 1); continue; }
      if (a < WARN + 0.3) for (let i = e.i0; i <= e.i1; i++) warn[e.l][i] = 1;
    }
    const blink = Math.floor(t * 9) % 2;
    let k = 0;
    for (let l = 0; l < LANES; l++) for (let i = 0; i < N; i++, k++) {
      const chk = isCheck(i), h = chk ? -100 : hAt(l, i, t);
      prevH[l][i] = H[l][i]; H[l][i] = h;
      v3.set(laneX(l), h, -(i + 0.5) * D); sc.set(1, chk ? 0.001 : Math.max(0.01, h + 24), 1);
      bars.setMatrixAt(k, m4.compose(v3, q, sc));
      const d = h - prevH[l][i];
      bars.setColorAt(k, warn[l][i] ? (blink ? ALERT : ALERT2) : Math.abs(d) < 1e-4 ? FLAT : d > 0 ? UP : DOWN);
    }
    bars.instanceMatrix.needsUpdate = true; if (bars.instanceColor) bars.instanceColor.needsUpdate = true;
  }
  function spawnEvent(pi) {
    const l = Math.floor(Math.random() * LANES), i0 = pi + 3 + Math.floor(Math.random() * 5), len = 2 + Math.floor(Math.random() * 3), i1 = i0 + len - 1;
    if (i0 < 1 || i1 >= N) return;
    for (let i = i0 - 1; i <= i1 + 1; i++) if (isCheck(i)) return;
    const hit = e => !(e.i1 < i0 - 1 || e.i0 > i1 + 1);
    if (events.some(e => e.l === l && hit(e))) return;
    if (new Set(events.filter(hit).map(e => e.l)).size >= LANES - 1) return;       // always leave one lane open
    events.push({ type: Math.random() < 0.55 ? 'crash' : 'spike', l, i0, i1, t0: st.t });
  }
  function say(m, t = 1.3) { st.msg = m; st.msgT = t; }
  function respawn(text) { st.falls++; st.x = 0; st.y = BASE + 0.5; st.z = st.check.z; st.vy = 0; st.yaw = 0; say(text, 1.5); }
  refresh(0); refresh(0.016);
  return {
    scene, camera, label: 'JUMP',
    look(dx, dy) { st.yaw -= dx * 0.0022; st.pitch = clamp(st.pitch - dy * 0.0022, -1.3, 1.2); },
    down() { st.jumpQ = 0.14; }, up() {},
    update(dt) {
      if (st.done) return;
      st.t += dt; st.msgT -= dt; st.boost -= dt; st.stun -= dt;
      const i = Math.floor(-st.z / D);
      if (st.started && i < N - 2) { st.nextEv -= dt; if (st.nextEv <= 0) { spawnEvent(Math.max(0, i)); st.nextEv = rand(0.7, 1.5) - Math.min(0.35, i / N * 0.45); } }
      refresh(st.t);
      for (const t of tapeTex) t.offset.x = st.t * 0.035;
      const { f, s } = ctx.axes();
      if (!st.started && (f || s)) st.started = true;
      if (st.started) st.time += dt;
      const n = Math.hypot(f, s) || 1, sp = 7.4 * Math.min(1, Math.hypot(f, s)) * (st.boost > 0 ? 1.45 : 1) * (st.stun > 0 ? 0.35 : 1);
      const sin = Math.sin(st.yaw), cos = Math.cos(st.yaw);
      const dx = (-sin * f + cos * s) / n * sp * dt, dz = (-cos * f - sin * s) / n * sp * dt;
      if (!wall(st.x + dx, st.z, st.y)) st.x += dx;
      if (!wall(st.x, st.z + dz, st.y)) st.z += dz;
      if (ctx.keys.Space) st.jumpQ = 0.1;
      st.jumpQ -= dt; st.coy -= dt;
      if (st.jumpQ > 0 && (st.grounded || st.coy > 0)) { st.vy = 8.8; st.grounded = false; st.coy = 0; st.jumpQ = 0; }
      st.vy -= 22 * dt; st.y += st.vy * dt;
      const sup = support(st.x, st.z, st.y);
      if (sup > NEG && st.vy <= 0 && st.y <= sup) { st.y = sup; st.vy = 0; st.grounded = true; st.coy = 0.1; }
      else st.grounded = false;
      // items
      for (const it of items) {
        if (!it.alive) continue;
        const iz = -(it.i + 0.5) * D;
        if (it.type === 'bear') { it.x += it.dir * 2.6 * dt; if (Math.abs(it.x) > LS + 0.6) it.dir *= -1; it.m.rotation.x += dt * 3; it.m.rotation.y += dt * 2; }
        else it.m.rotation.y += dt * 2.5;
        const l = clamp(Math.round(it.x / LS + (LANES - 1) / 2), 0, LANES - 1), gy = Math.max(H[l][it.i], BASE - 3);
        it.m.position.set(it.x, gy + (it.type === 'bear' ? 0.9 : 1.2 + Math.sin(st.t * 3 + it.i) * 0.12), iz);
        if (Math.abs(st.z - iz) < 0.9 && Math.abs(st.x - it.x) < 0.95 && Math.abs(st.y + 0.9 - it.m.position.y) < 1.5) {
          it.alive = false; scene.remove(it.m);
          if (it.type === 'bull') { st.boost = 4; say('Bull run! Speed boost'); }
          else if (it.type === 'div') { st.bonus += 1.5; say('Dividend: −1.5s'); }
          else if (it.type === 'hedge') { st.shield = true; say('Hedged: one free save'); }
          else if (st.shield) { st.shield = false; say('Bear blocked by your hedge'); }
          else { st.stun = 1.4; st.time += 2; st.vy = 5; say('Bear raid! +2s', 1.4); }
        }
      }
      // checkpoints, falls, finish
      if (st.grounded && i >= 0 && i < N && isCheck(i)) { const num = (i + 1) / EVERY; if (num > st.check.n) { st.check = { z: -(i + 0.5) * D, n: num }; say(`Checkpoint ${num}/${SECTIONS - 1}`); } }
      if (st.y < BASE - 9) {
        if (st.shield) { st.shield = false; st.y = BASE - 8.5; st.vy = 22; say('Hedge paid out: bounce back up!', 1.5); }
        else respawn('Margin call. Back to the checkpoint.');
      }
      if (st.grounded && -st.z > N * D + 0.6) {
        st.done = true; const total = Math.max(1, st.time - st.bonus);
        ctx.finish({ score: Math.round(total * 1000), headline: `${total.toFixed(2)}s`, text: `Closing bell. ${st.falls} ${st.falls === 1 ? 'fall' : 'falls'}${st.bonus ? `, ${st.bonus.toFixed(1)}s of dividends` : ''}.` });
        return;
      }
      camera.position.set(st.x, st.y + 1.6, st.z); camera.rotation.set(st.pitch, st.yaw, st.stun > 0 ? Math.sin(st.t * 30) * 0.03 : 0);
      const fov = st.boost > 0 ? 84 : 74; if (Math.abs(camera.fov - fov) > 0.3) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
      let tick = '';
      const l = Math.round(st.x / LS + (LANES - 1) / 2);
      if (i >= 0 && i < N && !isCheck(i) && l >= 0 && l < LANES) {
        const h = H[l][i], d = (h - prevH[l][i]) / dt, up = d >= 0;
        tick = `<div class="pill">${SYM[l]} $${Math.max(0, h * 21.5).toFixed(2)} <span class="${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${Math.min(99, Math.abs(d * 4)).toFixed(2)}%</span></div>`;
      }
      let alert = '';
      for (const e of events) if (st.t - e.t0 < WARN + 0.5 && e.i0 - i < 9 && e.i1 >= i) alert = e.type === 'crash' ? `${SYM[e.l]} is crashing` : `${SYM[e.l]} is spiking`;
      const prog = clamp(-st.z / (N * D), 0, 1), shown = Math.max(0, st.time - st.bonus);
      ctx.hud(`${exitHint}<div class="g-top"><div class="pill">⏱ ${shown.toFixed(2)}s</div>${tick}${st.boost > 0 ? '<div class="pill up">BULL RUN</div>' : ''}${st.shield ? '<div class="pill" style="color:#5aa9ff">HEDGED</div>' : ''}</div>
        ${st.msgT > 0 ? `<div class="g-msg">${st.msg}</div>` : alert ? `<div class="g-msg" style="font-size:22px;color:#ffd23f">⚠ ${alert}</div>`
          : (!st.started ? `<div class="g-msg" style="font-size:22px">${ctx.touch ? 'Run the charts · JUMP between bars' : 'WASD to run · Space to jump · reach the closing bell'}<small>Yellow bars are about to crash or spike. Change lanes. Dodge the bears.</small></div>` : '')}
        <div class="g-bar"><i style="width:${Math.round(prog * 100)}%;background:#35c27a"></i></div>`);
    },
  };
}
