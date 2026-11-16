// The casino's three tables, played in 3D: you take a seat, the camera sits you down, and the controls live in a
// slim dock at the bottom of the screen. Cards fly from the shoe and flip over, the roulette ball really lands in
// the winning pocket, and four regulars sit with you at the poker table.
import { chips, setChips, money, freshDeck, evalHand, equity, HAND, RANKS, SUITS, css } from './casino.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = k => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const CW = 0.09, CH = 0.126;                               // cards, a little over real size so they read from the seat
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
const colorOf = n => (n === 0 ? 'g' : REDS.has(n) ? 'r' : 'k');

export function createTables(THREE, host) {
  const { casG, camera, touch, makePerson, dealers } = host;
  const L = (c, o) => new THREE.MeshLambertMaterial({ color: c, ...o });
  const add = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, typeof m === 'number' ? L(m) : m); o.position.set(x, y, z); parent.add(o); return o; };
  const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const lit = t => new THREE.MeshLambertMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.45 });
  let gen = 0;                                              // bumped whenever you leave a table: stale animations and timers stop
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* ------------------------------------------------ cards */
  const faceMats = {};
  const faceMat = c => {
    const k = c.r * 4 + c.s; if (faceMats[k]) return faceMats[k];
    const red = c.s === 1 || c.s === 2, col = red ? '#c0262d' : '#15171c';
    return (faceMats[k] = lit(tex(128, 180, (g, W, H) => {
      g.fillStyle = '#fbf8f0'; g.beginPath(); g.roundRect(0, 0, W, H, 12); g.fill(); g.strokeStyle = '#d8d2c2'; g.lineWidth = 3; g.stroke();
      g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = 'bold 38px Georgia, serif'; g.fillText(RANKS[c.r], 26, 30); g.font = '30px Georgia, serif'; g.fillText(SUITS[c.s], 26, 64);
      g.save(); g.translate(W - 26, H - 30); g.rotate(Math.PI); g.font = 'bold 38px Georgia, serif'; g.fillText(RANKS[c.r], 0, 0); g.font = '30px Georgia, serif'; g.fillText(SUITS[c.s], 0, -34); g.restore();
      g.font = c.r >= 9 && c.r <= 11 ? 'bold 64px Georgia, serif' : '80px Georgia, serif'; g.fillText(c.r >= 9 && c.r <= 11 ? RANKS[c.r] + SUITS[c.s] : SUITS[c.s], W / 2 + 4, H / 2 + 6);
    })));
  };
  const backMat = lit(tex(128, 180, (g, W, H) => {
    g.fillStyle = '#fbf8f0'; g.beginPath(); g.roundRect(0, 0, W, H, 12); g.fill(); g.fillStyle = '#8a1f2b'; g.beginPath(); g.roundRect(9, 9, W - 18, H - 18, 8); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let i = -H; i < W + H; i += 14) { g.beginPath(); g.moveTo(i, 9); g.lineTo(i + H, H - 9); g.stroke(); g.beginPath(); g.moveTo(i + H, 9); g.lineTo(i, H - 9); g.stroke(); }
    g.fillStyle = '#d9b34a'; g.beginPath(); g.arc(W / 2, H / 2, 14, 0, 6.3); g.fill();
  }));
  const cardGeo = new THREE.PlaneGeometry(CW, CH);
  // a card is a group with its face on top and its back underneath; turning it over is a half turn about its long axis
  function makeCard(c, parent, at) {
    const g = new THREE.Group(); const f = new THREE.Mesh(cardGeo, faceMat(c)); f.rotation.x = -Math.PI / 2; f.position.y = 0.0006; g.add(f);
    const b = new THREE.Mesh(cardGeo, backMat); b.rotation.x = Math.PI / 2; b.position.y = -0.0006; g.add(b);
    g.rotation.order = 'YXZ'; g.position.set(at.x, at.y, at.z); g.rotation.set(0, at.ry || 0, Math.PI); parent.add(g); return { c, g };
  }
  const tweens = [];
  function move(card, to, T = 0.38, { up = null, arc = 0.06 } = {}) {
    return new Promise(res => tweens.push({ o: card.g, p0: card.g.position.clone(), p1: new THREE.Vector3(to.x, to.y, to.z), ry0: card.g.rotation.y, ry1: to.ry ?? card.g.rotation.y, rz0: card.g.rotation.z, rz1: up === null ? card.g.rotation.z : up ? 0 : Math.PI, t: 0, T, arc, res }));
  }
  const flip = (card, T = 0.32) => move(card, card.g.position, T, { up: true, arc: 0.05 });
  function stepTweens(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i]; w.t += dt; const k = ease(Math.min(1, w.t / w.T));
      w.o.position.lerpVectors(w.p0, w.p1, k); w.o.position.y += Math.sin(k * Math.PI) * w.arc; w.o.rotation.y = w.ry0 + (w.ry1 - w.ry0) * k; w.o.rotation.z = w.rz0 + (w.rz1 - w.rz0) * k;
      if (w.t >= w.T) { tweens.splice(i, 1); w.res(); }
    }
  }
  function clearTweens() { for (const w of tweens.splice(0)) w.res(); }
  /* ------------------------------------------------ chips */
  const chipGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.0075, 16), chipMats = [0xf4f1ea, 0xc0262d, 0x2456b8, 0x1f8a4c, 0x17191d, 0x6a2f9a].map(c => L(c));
  function stackTo(grp, amount) {                          // a small tower of chips, colour by denomination
    while (grp.children.length) grp.remove(grp.children[0]);
    let v = Math.round(amount), y = 0.004, n = 0; const den = [[500, 5], [100, 4], [25, 3], [10, 2], [5, 1], [1, 0]];
    for (const [d, m] of den) while (v >= d && n < 26) { const c = new THREE.Mesh(chipGeo, chipMats[m]); c.position.set((Math.random() - 0.5) * 0.002, y, (Math.random() - 0.5) * 0.002); grp.add(c); y += 0.0078; v -= d; n++; }
    grp.visible = amount > 0;
  }
  const chipStack = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); g.visible = false; return g; };

  /* ------------------------------------------------ the dock (controls at the bottom of the screen) */
  let dockEl = null, dockFn = null;
  function dock(html) { if (!dockEl) return; dockEl.innerHTML = `<div class="cz">${html}</div>`; }
  function bindDock(el, fn) { dockEl = el; dockFn = fn; el.onclick = e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled && dockFn) dockFn(b.dataset.a); }; }
  // name tags and totals, pinned to points on the table
  const v3 = new THREE.Vector3(), cam = { p: new THREE.Vector3(), l: new THREE.Vector3(), lNow: new THREE.Vector3(), snap: true, off: 0 };
  function tag(parent, x, y, z, html, cls = '') {
    v3.set(x, y, z); parent.localToWorld(v3); v3.project(camera); if (v3.z > 1) return '';
    return `<div class="tbltag ${cls}" style="left:${clamp((v3.x + 1) / 2 * 100, 7, 93).toFixed(2)}%;top:${clamp((1 - v3.y) / 2 * 100, 10, 90).toFixed(2)}%">${html}</div>`;
  }
  function aimCamera(parent, px, py, pz, lx, ly, lz, dt, fov) {
    cam.p.set(px, py, pz); parent.localToWorld(cam.p); cam.l.set(lx, ly, lz); parent.localToWorld(cam.l);
    const f = camera.aspect < 1 ? Math.min(90, fov * 1.45) : fov; if (Math.abs(camera.fov - f) > 0.01) { camera.fov = f; camera.updateProjectionMatrix(); }
    if (cam.snap) { camera.position.copy(cam.p); cam.lNow.copy(cam.l); cam.snap = false; } else { camera.position.lerp(cam.p, Math.min(1, dt * 3)); cam.lNow.lerp(cam.l, Math.min(1, dt * 3.5)); }
    camera.up.set(0, 1, 0); camera.lookAt(cam.lNow); camera.updateMatrixWorld();
    const box = dockEl?.closest('.box'), want = box ? (box.offsetHeight + 20) / 2 : 0;          // centre the table in the space above the control dock
    cam.off += (want - cam.off) * Math.min(1, dt * 6); camera.setViewOffset(innerWidth, innerHeight, 0, cam.off, innerWidth, innerHeight);
  }

  /* ================================================ BLACKJACK */
  const bjG = new THREE.Group(); bjG.position.set(-5.2, 0, -1.7); casG.add(bjG);
  const BY = 0.99, SHOE = { x: 0.95, y: 1.08, z: -0.3, ry: 0.4 }, MUCK = { x: -1.0, y: 1.0, z: -0.32 };
  const bjBet = chipStack(bjG, 0, BY, 0.66);
  const BJ = { phase: 'bet', bet: 0, lastBet: 25, me: [], dl: [], cards: [], deck: freshDeck(), msg: '', cls: '', doubled: false, bank: 0 };
  const bjVal = h => { let t = 0, a = 0; for (const c of h) { if (c.r === 12) { a++; t += 11; } else t += c.r >= 8 ? 10 : c.r + 2; } while (t > 21 && a) { t -= 10; a--; } return { t, soft: a > 0 }; };
  const bjDraw = () => { if (BJ.deck.length < 15) BJ.deck = freshDeck(); return BJ.deck.pop(); };
  const bjSpot = (who, i) => (who === 'me' ? { x: -0.07 + i * 0.05, y: BY + 0.0013 * i, z: 0.44 - i * 0.025, ry: 0 } : { x: -0.12 + i * 0.105, y: BY, z: -0.1, ry: 0 });
  let bjArm = 0;
  async function bjGive(who, up) {
    const g = gen, c = bjDraw(), hand = who === 'me' ? BJ.me : BJ.dl, i = hand.length, card = makeCard(c, bjG, SHOE);
    hand.push(c); BJ.cards.push(card); card.who = who; bjArm = 0.35;
    await move(card, bjSpot(who, i), 0.4, { up, arc: 0.05 }); return g === gen ? card : null;
  }
  function bjRender() {
    const B = BJ, mv = B.me.length ? bjVal(B.me) : null, dv = B.dl.length ? bjVal(B.phase === 'play' || B.phase === 'dealing' ? [B.dl[0]] : B.dl) : null;
    const stat = `<div class="stat"><span>Chips <b>${money(B.bank)}</b></span><span>Bet <b>${money(B.bet)}</b></span>${mv ? `<span>You <b>${mv.soft && mv.t < 21 ? 'soft ' : ''}${mv.t}</b></span>` : ''}${dv ? `<span>Dealer <b>${dv.t}${B.phase === 'play' ? ' + ?' : ''}</b></span>` : ''}</div>`;
    let ctl = '';
    if (B.phase === 'bet') ctl = `${[5, 10, 25, 50, 100].map(v => `<button class="chip c${v}" data-a="c${v}">${v}</button>`).join('')}<button class="btn ghost small" data-a="clear">Clear</button><button class="btn small" data-a="deal"${B.bet ? '' : ' disabled'}>Deal</button>`;
    else if (B.phase === 'play') ctl = `<button class="btn small" data-a="hit">Hit</button><button class="btn small" data-a="stand">Stand</button><button class="btn ghost small" data-a="double"${B.me.length === 2 && B.bank >= B.bet ? '' : ' disabled'}>Double</button>`;
    else if (B.phase === 'done') ctl = '<button class="btn small" data-a="next">Next hand</button>';
    else ctl = '<span style="color:var(--dim)">Dealing…</span>';
    dock(`<h2>Blackjack</h2>${stat}<div class="msg ${B.cls}">${B.msg}</div><div class="row">${ctl}</div>
      <details><summary>How to play</summary><ul><li>Beat the dealer without going over 21. Face cards count 10, aces 1 or 11.</li><li><b>Hit</b> takes a card, <b>Stand</b> keeps your total, <b>Double</b> doubles your bet for exactly one more card.</li><li>The dealer draws to 17. A two-card 21 is blackjack and pays 3 to 2.</li></ul></details>`);
  }
  function bjEnd(m, cls, pay) {
    const B = BJ; B.bank += pay; setChips(B.bank); B.msg = m; B.cls = cls; B.phase = 'done'; B.lastBet = B.doubled ? B.bet / 2 : B.bet;
    if (B.bank <= 0) { B.bank = 500; setChips(500); B.msg += ' You are out of chips, so the house spots you 500.'; }
    stackTo(bjBet, pay); bjRender();
    for (const c of B.cards) if (c.who === 'dl' && c.g.rotation.z > 1) flip(c);      // the dealer always shows the hole card at the end
  }
  function bjSettle() {
    const B = BJ, m = bjVal(B.me).t, d = bjVal(B.dl).t;
    if (m > 21) bjEnd(`Bust with ${m}. You lose ${money(B.bet)}.`, 'lose', 0);
    else if (d > 21) bjEnd(`Dealer busts with ${d}. You win ${money(B.bet)}.`, 'win', B.bet * 2);
    else if (m > d) bjEnd(`${m} beats ${d}. You win ${money(B.bet)}.`, 'win', B.bet * 2);
    else if (m < d) bjEnd(`Dealer’s ${d} beats your ${m}. You lose ${money(B.bet)}.`, 'lose', 0);
    else bjEnd(`Push at ${m}. Your bet comes back.`, '', B.bet);
  }
  async function bjDealer() {
    const g = gen, B = BJ; B.phase = 'dealer'; bjRender();
    const hole = B.cards.find(c => c.who === 'dl' && c.g.rotation.z > 1); if (hole) await flip(hole); if (g !== gen) return;
    if (bjVal(B.me).t <= 21) while (bjVal(B.dl).t < 17) { await sleep(350); if (g !== gen) return; await bjGive('dl', true); if (g !== gen) return; bjRender(); }
    await sleep(250); if (g !== gen) return; bjSettle();
  }
  async function bjAct(a) {
    const B = BJ, g = gen;
    if (B.phase === 'bet') {
      if (a[0] === 'c') { const v = +a.slice(1); if (B.bet + v <= B.bank) B.bet += v; else B.msg = 'Not enough chips for that.'; stackTo(bjBet, B.bet); }
      else if (a === 'clear') { B.bet = 0; stackTo(bjBet, 0); }
      else if (a === 'deal' && B.bet > 0) {
        B.bank -= B.bet; setChips(B.bank); B.doubled = false; B.phase = 'dealing'; B.msg = ''; B.cls = ''; bjRender();
        for (const [w, up] of [['me', true], ['dl', true], ['me', true], ['dl', false]]) { await bjGive(w, up); if (g !== gen) return; await sleep(90); }
        bjRender(); const mb = bjVal(B.me).t === 21, peek = B.dl[0].r >= 8, db = bjVal(B.dl).t === 21;
        if (mb || (peek && db)) { const hole = B.cards.find(c => c.who === 'dl' && c.g.rotation.z > 1); if (hole) await flip(hole); if (g !== gen) return;
          if (mb && db) return bjEnd('Both have blackjack. Push.', '', B.bet); if (mb) return bjEnd(`Blackjack! You win ${money(B.bet * 1.5)}.`, 'win', B.bet * 2.5); return bjEnd('Dealer has blackjack. You lose.', 'lose', 0); }
        B.phase = 'play';
      }
    } else if (B.phase === 'play') {
      if (a === 'hit') { B.phase = 'dealing'; bjRender(); await bjGive('me', true); if (g !== gen) return; B.phase = 'play'; const t = bjVal(B.me).t; if (t > 21) return bjSettle(); if (t === 21) return bjDealer(); }
      else if (a === 'stand') return bjDealer();
      else if (a === 'double' && B.me.length === 2 && B.bank >= B.bet) { B.bank -= B.bet; setChips(B.bank); B.bet *= 2; B.doubled = true; stackTo(bjBet, B.bet); B.phase = 'dealing'; bjRender(); await bjGive('me', true); if (g !== gen) return; if (bjVal(B.me).t > 21) return bjSettle(); return bjDealer(); }
    } else if (B.phase === 'done' && a === 'next') {
      B.phase = 'clearing'; bjRender(); await Promise.all(B.cards.map((c, i) => sleep(i * 40).then(() => move(c, { x: MUCK.x, y: MUCK.y + i * 0.001, z: MUCK.z, ry: 0.3 }, 0.35, { up: false })))); if (g !== gen) return;
      bjClear(); B.bet = Math.min(B.lastBet, B.bank); stackTo(bjBet, B.bet); B.phase = 'bet'; B.msg = 'Place your bet.';
    }
    bjRender();
  }
  function bjClear() { for (const c of BJ.cards) bjG.remove(c.g); BJ.cards = []; BJ.me = []; BJ.dl = []; }

  /* ================================================ ROULETTE */
  const rlG = new THREE.Group(); rlG.position.set(0, 0, -1.8); casG.add(rlG);
  const WC = { x: -1.1, y: 1.0, z: 0 };                    // centre of the wheel's bowl
  const wheelG = new THREE.Group(); wheelG.position.set(WC.x, WC.y + 0.112, WC.z); rlG.add(wheelG);
  const RIN = 0.2, ROUT = 0.44, RPOCK = 0.322, RTRACK = 0.468, STEP = Math.PI * 2 / 37;
  {
    add(new THREE.CylinderGeometry(0.6, 0.54, 0.16, 40), 0x3b2414, WC.x, WC.y + 0.03, WC.z, rlG);
    const track = add(new THREE.RingGeometry(ROUT, 0.56, 48), L(0x5b3a22, { side: THREE.DoubleSide }), WC.x, WC.y + 0.124, WC.z, rlG); track.rotation.x = -Math.PI / 2;
    const rim = add(new THREE.TorusGeometry(0.565, 0.018, 8, 48), 0xd9b34a, WC.x, WC.y + 0.13, WC.z, rlG); rim.rotation.x = Math.PI / 2;
    const pockets = tex(512, 512, (g, W) => {
      const c = W / 2, rp = s => s / ROUT * c;
      g.fillStyle = '#4a2d18'; g.beginPath(); g.arc(c, c, c, 0, 6.3); g.fill();
      for (let i = 0; i < 37; i++) { const n = WHEEL[i]; g.fillStyle = n === 0 ? '#1f8a4c' : REDS.has(n) ? '#b8262d' : '#17191d'; g.beginPath(); g.arc(c, c, rp(ROUT), i * STEP, (i + 1) * STEP); g.arc(c, c, rp(0.27), (i + 1) * STEP, i * STEP, true); g.closePath(); g.fill(); }
      g.strokeStyle = '#d9b34a'; g.lineWidth = 3; for (let i = 0; i < 37; i++) { const a = i * STEP; g.beginPath(); g.moveTo(c + Math.cos(a) * rp(0.27), c + Math.sin(a) * rp(0.27)); g.lineTo(c + Math.cos(a) * rp(ROUT), c + Math.sin(a) * rp(ROUT)); g.stroke(); }
      g.beginPath(); g.arc(c, c, rp(0.36), 0, 6.3); g.stroke(); g.beginPath(); g.arc(c, c, rp(0.27), 0, 6.3); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 21px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (let i = 0; i < 37; i++) { const a = (i + 0.5) * STEP; g.save(); g.translate(c + Math.cos(a) * rp(0.4), c + Math.sin(a) * rp(0.4)); g.rotate(a + Math.PI / 2); g.fillText(String(WHEEL[i]), 0, 0); g.restore(); }
    });
    const ring = add(new THREE.RingGeometry(RIN, ROUT, 74, 1), new THREE.MeshLambertMaterial({ map: pockets, emissive: 0xffffff, emissiveMap: pockets, emissiveIntensity: 0.3 }), 0, 0, 0, wheelG); ring.rotation.x = -Math.PI / 2;
    add(new THREE.CylinderGeometry(RIN, RIN + 0.02, 0.05, 32), 0x7a4a26, 0, 0.02, 0, wheelG);
    add(new THREE.ConeGeometry(0.09, 0.1, 24), 0xd9b34a, 0, 0.09, 0, wheelG);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, s = add(new THREE.BoxGeometry(0.16, 0.012, 0.012), 0xd9b34a, Math.cos(a) * 0.08, 0.13, Math.sin(a) * 0.08, wheelG); s.rotation.y = -a; add(new THREE.SphereGeometry(0.014, 10, 8), 0xd9b34a, Math.cos(a) * 0.16, 0.13, Math.sin(a) * 0.16, wheelG); }
  }
  const ball = add(new THREE.SphereGeometry(0.0135, 14, 10), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x777777 }), 0, 0, 0, rlG);
  // the betting layout's cells, in table space, matching the layout printed on the felt
  const LAY = { x: 0.6, y: 0.986, z: 0, w: 2.1, h: 1.05 }, at = (px, py) => ({ x: LAY.x - LAY.w / 2 + px / 512 * LAY.w, z: LAY.z - LAY.h / 2 + py / 256 * LAY.h });
  const CELL = { n0: at(27, 98) }; for (let col = 0; col < 12; col++) for (let row = 0; row < 3; row++) CELL['n' + (col * 3 + 3 - row)] = at(48 + col * 37 + 17, 20 + row * 52 + 26);
  ['d1', 'd2', 'd3'].forEach((k, i) => (CELL[k] = at(122 + i * 148, 196))); ['lo', 'ev', 'rd', 'bk', 'od', 'hi'].forEach((k, i) => (CELL[k] = at(85 + i * 74, 228)));
  const OUT = { d1: ['1st 12', n => n >= 1 && n <= 12, 2], d2: ['2nd 12', n => n >= 13 && n <= 24, 2], d3: ['3rd 12', n => n >= 25, 2], lo: ['1–18', n => n >= 1 && n <= 18, 1], ev: ['Even', n => n > 0 && n % 2 === 0, 1], rd: ['Red', n => colorOf(n) === 'r', 1], bk: ['Black', n => colorOf(n) === 'k', 1], od: ['Odd', n => n % 2 === 1, 1], hi: ['19–36', n => n >= 19, 1] };
  const RL = { size: 10, bets: {}, last: null, stacks: {}, spin: null, result: null, hist: [], msg: 'Pick a chip, tap the board, then spin.', cls: '', bank: 0, w: 0, wv: 0.5, ba: 0, br: RTRACK, by: 0.026 };
  const rlTotal = () => Object.values(RL.bets).reduce((a, v) => a + v, 0);
  function rlStacks() {
    for (const k of Object.keys(RL.stacks)) if (!RL.bets[k]) { rlG.remove(RL.stacks[k]); delete RL.stacks[k]; }
    for (const [k, v] of Object.entries(RL.bets)) { if (!RL.stacks[k]) RL.stacks[k] = chipStack(rlG, CELL[k].x, LAY.y, CELL[k].z); stackTo(RL.stacks[k], v); }
  }
  function rlRender() {
    const R = RL, res = R.result, hit = k => res !== null && !R.spin && (k[0] === 'n' ? +k.slice(1) === res : OUT[k][1](res));
    const cell = (k, label, c) => `<div class="rc ${c}${hit(k) ? ' hit' : ''}" data-a="b:${k}">${label}${R.bets[k] ? `<em>${R.bets[k]}</em>` : ''}</div>`;
    let grid = `<div class="rgrid"><div class="rc g${hit('n0') ? ' hit' : ''}" style="grid-row:1/4;height:auto" data-a="b:n0">0${R.bets.n0 ? `<em>${R.bets.n0}</em>` : ''}</div>`;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) { const n = col * 3 + (3 - row); grid += cell('n' + n, n, colorOf(n)); }
    grid += `<div></div>${['d1', 'd2', 'd3'].map(k => `<div style="grid-column:span 4">${cell(k, OUT[k][0], 'o')}</div>`).join('')}<div></div>${['lo', 'ev', 'rd', 'bk', 'od', 'hi'].map(k => `<div style="grid-column:span 2">${cell(k, OUT[k][0], k === 'rd' ? 'r' : k === 'bk' ? 'k' : 'o')}</div>`).join('')}</div>`;
    dock(`<h2>Roulette</h2><div class="stat"><span>Chips <b>${money(R.bank)}</b></span><span>On the table <b>${money(rlTotal())}</b></span><span class="hist">${R.hist.map(n => `<span class="${colorOf(n)}">${n}</span>`).join('')}</span></div>
      <div class="msg ${R.cls}">${R.msg}</div>${R.spin ? '' : grid}
      <div class="row">${R.spin ? '<span style="color:var(--dim)">No more bets…</span>' : `${[5, 10, 25, 50, 100].map(v => `<button class="chip c${v}${R.size === v ? ' sel' : ''}" data-a="s${v}">${v}</button>`).join('')}<button class="btn ghost small" data-a="clear">Clear</button><button class="btn ghost small" data-a="again"${R.last ? '' : ' disabled'}>Same again</button><button class="btn small" data-a="spin"${rlTotal() ? '' : ' disabled'}>Spin</button>`}</div>
      ${R.spin ? '' : '<details><summary>How to play</summary><ul><li>Pick a chip size, then tap numbers or the outside boxes to bet. Tap again to stack more.</li><li>A single number pays 35 to 1. A dozen pays 2 to 1. Red, black, odd, even, 1–18 and 19–36 pay even money.</li><li>One green zero: it beats every outside bet.</li></ul></details>'}`);
  }
  function rlAct(a) {
    const R = RL; if (R.spin) return;
    if (a === 'spin' && rlTotal()) {
      const win = (Math.random() * 37) | 0, idx = WHEEL.indexOf(win), phi = (idx + 0.5) * STEP, T = 6.2;
      // the ball's angle is phi - w + rel(t), and rel(t) runs down to zero: it ends exactly in the winning pocket
      const D = (((phi - R.w - R.ba) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) + Math.PI * 2 * 5;
      R.spin = { win, phi, T, D, t: 0 }; R.last = { ...R.bets }; R.result = null; R.msg = 'No more bets…'; R.cls = ''; cam.snap = false; rlRender(); return;
    }
    if (a[0] === 's') R.size = +a.slice(1);
    else if (a === 'clear') { R.bank += rlTotal(); R.bets = {}; }
    else if (a === 'again' && R.last) { const cur = rlTotal(), need = Object.values(R.last).reduce((x, v) => x + v, 0); if (need <= R.bank + cur) { R.bank += cur; R.bets = { ...R.last }; R.bank -= need; R.result = null; } else R.msg = 'Not enough chips to repeat that.'; }
    else if (a.startsWith('b:')) { const k = a.slice(2); if (R.size <= R.bank) { R.bets[k] = (R.bets[k] || 0) + R.size; R.bank -= R.size; R.result = null; } else R.msg = 'Not enough chips for that.'; }
    setChips(R.bank + rlTotal()); rlStacks(); rlRender();                     // chips on the felt are still yours until the ball lands
  }
  function rlStep(dt) {
    const R = RL, sp = R.spin;
    R.wv = sp ? 0.55 + 2.1 * Math.max(0, 1 - sp.t / sp.T) : 0.55; R.w += R.wv * dt; wheelG.rotation.y = R.w;
    if (sp) {
      sp.t += dt; const k = Math.min(1, sp.t / sp.T), rel = -sp.D * Math.pow(1 - k, 3);
      R.ba = sp.phi - R.w + rel;
      const drop = clamp((k - 0.62) / 0.3, 0, 1); R.br = RTRACK - (RTRACK - RPOCK) * ease(drop);
      R.by = 0.026 - 0.012 * ease(drop) + (drop > 0 && drop < 1 ? Math.abs(Math.sin(drop * 26)) * 0.02 * (1 - drop) : 0);
      if (k >= 1) {
        const n = sp.win; let pay = 0;
        for (const [key, v] of Object.entries(R.bets)) { if (key[0] === 'n') { if (+key.slice(1) === n) pay += v * 36; } else if (OUT[key][1](n)) pay += v * (OUT[key][2] + 1); }
        const stake = rlTotal(), net = pay - stake; R.bank += pay; setChips(R.bank); R.result = n; R.hist.unshift(n); R.hist = R.hist.slice(0, 10); R.bets = {}; rlStacks(); R.spin = null;
        R.msg = `${n} ${n === 0 ? 'green' : colorOf(n) === 'r' ? 'red' : 'black'}. ${net > 0 ? `You win ${money(net)}.` : net === 0 ? 'You break even.' : `You lose ${money(-net)}.`}`; R.cls = net > 0 ? 'win' : net < 0 ? 'lose' : '';
        if (R.bank <= 0) { R.bank = 500; setChips(500); R.msg += ' You are out of chips, so the house spots you 500.'; }
        rlRender();
      }
    } else if (R.result !== null) { R.ba = (WHEEL.indexOf(R.result) + 0.5) * STEP - R.w; R.br = RPOCK; R.by = 0.014; }   // resting in its pocket, riding round with the wheel
    else { R.br = RTRACK; R.by = 0.026; }
    ball.position.set(WC.x + Math.cos(R.ba) * R.br, WC.y + 0.112 + R.by, WC.z + Math.sin(R.ba) * R.br);
  }

  /* ================================================ POKER: you and four regulars, no-limit hold'em */
  const pkG = new THREE.Group(); pkG.position.set(5.3, 0, -1.7); casG.add(pkG);
  const PY = 0.98, SB = 10, BB = 20;
  const SEATS = [ { x: 0, z: 1.25 }, { x: -2.0, z: 0.05 }, { x: -0.9, z: -1.15 }, { x: 0.9, z: -1.15 }, { x: 2.0, z: 0.05 } ];   // clockwise from your seat
  const BOTS = [
    { name: 'Vinnie', tight: -0.06, aggr: 0.25, bluff: 0.08, look: { top: 0x2f6b3a, legs: 0x3a3226, hair: 0x3a2a1c, hairStyle: 'short', beard: 0x3a2a1c } },
    { name: 'The Shark', tight: 0.04, aggr: 0.6, bluff: 0.14, look: { top: 0x23262d, legs: 0x17191d, hair: 0x17191d, hairStyle: 'short', glasses: true, skin: 0xd9a57e } },
    { name: 'Rosa', tight: 0.1, aggr: 0.35, bluff: 0.04, look: { top: 0x8a1f5b, legs: 0x17191d, hair: 0x2a1c12, hairStyle: 'long', skin: 0xc68d68 } },
    { name: 'Duke', tight: -0.1, aggr: 0.75, bluff: 0.25, look: { top: 0xe8e2d0, legs: 0x5b3a22, hair: 0xd8d2c4, hairStyle: 'short', beard: 0xd8d2c4 } },
  ];
  const PK = { P: [], button: 0, deck: [], board: [], pot: 0, curBet: 0, minRaise: BB, raises: 0, street: 0, phase: 'idle', turn: -1, msg: 'Five-handed no-limit hold’em. Blinds 10 and 20.', cls: '', wait: null, cards: [], boardCards: [], showdown: false, hands: 0 };
  const btnDisc = add(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 18), 0xfbf8f0, 0, PY + 0.006, 0, pkG);
  const potStack = chipStack(pkG, -0.5, PY, -0.1);
  SEATS.forEach((s, i) => {
    const p = { i, you: i === 0, name: i === 0 ? 'You' : BOTS[i - 1].name, bot: BOTS[i - 1], stack: i === 0 ? 0 : 1000, hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, last: '', cards: [], seat: s,
      betStack: chipStack(pkG, s.x * 0.47, PY, s.z * 0.42 + (i === 0 ? -0.08 : 0)), hx: i === 0 ? 0 : s.x * 0.66, hz: i === 0 ? 0.62 : s.z * 0.62, ry: Math.atan2(-s.x, -s.z) };
    if (!p.you) {
      const per = makePerson(THREE, p.bot.look); per.g.position.set(s.x, -0.34, s.z); per.g.rotation.y = p.ry; pkG.add(per.g); per.armL.rotation.x = per.armR.rotation.x = -1.05; p.person = per;
      const back = new THREE.Group(); back.position.set(s.x, 0, s.z); back.rotation.y = p.ry; pkG.add(back);
      add(new THREE.BoxGeometry(0.5, 0.08, 0.48), 0x5a1a22, 0, 0.46, -0.06, back); add(new THREE.BoxGeometry(0.5, 0.62, 0.08), 0x5a1a22, 0, 0.78, -0.3, back); for (const k of [-1, 1]) for (const j of [-1, 1]) add(new THREE.BoxGeometry(0.04, 0.42, 0.04), 0xd9b34a, k * 0.21, 0.21, -0.06 + j * 0.19, back);
    }
    PK.P.push(p);
  });
  const live = () => PK.P.filter(p => !p.folded);
  const nextSeat = (i, ok = p => true) => { for (let k = 1; k <= 5; k++) { const j = (i + k) % 5; if (ok(PK.P[j])) return j; } return -1; };
  function pkPut(p, a) { a = Math.min(a, p.stack); p.stack -= a; p.bet += a; p.total += a; if (p.stack === 0) p.allIn = true; stackTo(p.betStack, p.bet); if (p.you) setChips(p.stack); return a; }
  function pkCollect() { for (const p of PK.P) { PK.pot += p.bet; p.bet = 0; p.acted = false; stackTo(p.betStack, 0); } stackTo(potStack, PK.pot); PK.curBet = 0; PK.minRaise = BB; PK.raises = 0; }
  const potTotal = () => PK.pot + PK.P.reduce((a, p) => a + p.bet, 0);
  function pkApply(p, a, to = 0) {
    const call = PK.curBet - p.bet;
    if (a === 'fold') { p.folded = true; p.last = 'Fold'; for (const c of p.cards) move(c, { x: 0, y: PY + 0.002, z: -0.35, ry: 0 }, 0.35, { up: false }).then(() => (c.g.visible = false)); }
    else if (a === 'call') { const paid = pkPut(p, call); p.last = call <= 0 ? 'Check' : p.allIn ? `All in ${money(paid)}` : `Call ${money(paid)}`; }
    else { to = Math.min(Math.max(to, PK.curBet + PK.minRaise), p.bet + p.stack); const was = PK.curBet; pkPut(p, to - p.bet); if (p.bet > was) { PK.minRaise = Math.max(PK.minRaise, p.bet - was); PK.curBet = p.bet; PK.raises++; for (const q of PK.P) if (q !== p && !q.folded && !q.allIn) q.acted = false; }
      p.last = p.allIn ? `All in ${money(p.bet)}` : was ? `Raise to ${money(p.bet)}` : `Bet ${money(p.bet)}`; }
    p.acted = true; PK.msg = `${p.you ? 'You' : p.name}: ${p.last}`;
  }
  function botDecide(p) {
    const opp = live().length - 1, eq = equity(p.hole, PK.board, Math.max(1, opp), 110), call = PK.curBet - p.bet, pot = potTotal(), b = p.bot, r = Math.random();
    const room = p.stack > call && PK.raises < 4 && live().some(q => q !== p && !q.allIn), bigBet = f => PK.curBet + Math.max(PK.minRaise, Math.round((pot + call) * f / 5) * 5);
    const strong = 1 / (opp + 1) + 0.22 + b.tight, ok = 1 / (opp + 1) + 0.04 + b.tight;
    if (call <= 0) {
      if (room && eq > strong && r < 0.45 + b.aggr * 0.5) return ['raise', bigBet(0.55 + b.aggr * 0.3)];
      if (room && r < b.bluff) return ['raise', bigBet(0.5)];
      return ['call'];
    }
    const odds = call / (pot + call);
    if (room && eq > strong + 0.08 && r < b.aggr) return ['raise', bigBet(0.75)];
    if (eq > Math.max(odds, ok - 0.06) || (call <= BB && eq > ok - 0.12)) return ['call'];
    if (room && r < b.bluff * 0.35) return ['raise', bigBet(0.7)];
    return ['fold'];
  }
  async function pkDeal(to, c, up, ry) { const card = makeCard(c, pkG, { x: 0.15, y: PY + 0.05, z: -0.75, ry: 0 }); PK.cards.push(card); await move(card, { ...to, ry }, 0.32, { up, arc: 0.04 }); return card; }
  async function pkRound() {
    const g = gen; let i = PK.street === 0 ? nextSeat(nextSeat(nextSeat(PK.button))) : nextSeat(PK.button);
    for (let guard = 0; guard < 80; guard++) {
      if (live().length <= 1) return;
      const can = live().filter(p => !p.allIn);
      if (!can.length || can.every(p => p.acted && p.bet === PK.curBet)) return;
      if (can.length === 1 && can[0].bet >= PK.curBet) return;
      const p = PK.P[i];
      if (!p.folded && !p.allIn && (!p.acted || p.bet < PK.curBet)) {
        PK.turn = i;
        if (p.you) { PK.phase = 'you'; pkRender(); const [a, to] = await new Promise(r => (PK.wait = r)); PK.wait = null; if (g !== gen) return; pkApply(p, a, to); }
        else { PK.phase = 'bots'; pkRender(); await sleep(650 + Math.random() * 650); if (g !== gen) return; const [a, to] = botDecide(p); pkApply(p, a, to); }
        pkRender(); await sleep(220); if (g !== gen) return;
      }
      i = (i + 1) % 5;
    }
  }
  async function pkHand() {
    const g = gen, P = PK.P;
    for (const c of PK.cards) pkG.remove(c.g); PK.cards = []; PK.board = []; PK.pot = 0; PK.street = 0; PK.showdown = false; PK.cls = ''; stackTo(potStack, 0);
    const me = P[0]; me.stack = chips(); if (me.stack <= 0) { me.stack = 500; setChips(500); PK.msg = 'You are out of chips, so the house spots you 500.'; }
    for (const p of P) { if (!p.you && p.stack <= 0) { p.stack = 1000; PK.msg = `${p.name} buys back in for 1,000.`; } Object.assign(p, { hole: [], bet: 0, total: 0, folded: false, allIn: false, acted: false, last: '', cards: [] }); stackTo(p.betStack, 0); }
    PK.button = (PK.button + 1) % 5; const s = PK.P[PK.button].seat; btnDisc.position.set(s.x * 0.5 + 0.12, PY + 0.006, s.z * 0.5);
    PK.deck = freshDeck(); PK.curBet = 0; PK.minRaise = BB; PK.raises = 0; PK.phase = 'dealing'; PK.turn = -1; pkRender();
    const sb = nextSeat(PK.button), bb = nextSeat(sb); pkPut(P[sb], SB); P[sb].last = 'Small blind'; pkPut(P[bb], BB); P[bb].last = 'Big blind'; PK.curBet = BB;
    for (let r = 0; r < 2; r++) for (let k = 1; k <= 5; k++) {
      const p = P[(PK.button + k) % 5], c = PK.deck.pop(); p.hole.push(c);
      const off = (r - 0.5) * 0.06, perp = { x: Math.cos(p.ry), z: -Math.sin(p.ry) };
      const card = await pkDeal({ x: p.hx + perp.x * off, y: PY + 0.001 * r, z: p.hz + perp.z * off }, c, p.you, p.you ? 0 : p.ry); if (g !== gen) return; card.who = p.i; p.cards.push(card);
    }
    for (PK.street = 0; PK.street < 4; PK.street++) {
      if (PK.street > 0) {
        const n = PK.street === 1 ? 3 : 1;
        for (let k = 0; k < n; k++) { const c = PK.deck.pop(), j = PK.board.length; PK.board.push(c); await pkDeal({ x: -0.28 + j * 0.14, y: PY, z: -0.1 }, c, true, 0); if (g !== gen) return; }
        for (const p of P) p.last = p.folded ? 'Fold' : p.allIn ? 'All in' : '';
      }
      if (live().length > 1 && live().some(p => !p.allIn)) { await pkRound(); if (g !== gen) return; }
      pkCollect(); pkRender();
      if (live().length <= 1) break;
    }
    PK.turn = -1;
    if (live().length === 1) { const w = live()[0]; w.stack += PK.pot; PK.msg = `${w.you ? 'You take' : w.name + ' takes'} the pot of ${money(PK.pot)}.`; PK.cls = w.you ? 'win' : ''; }
    else {
      while (PK.board.length < 5) { const c = PK.deck.pop(), j = PK.board.length; PK.board.push(c); await pkDeal({ x: -0.28 + j * 0.14, y: PY, z: -0.1 }, c, true, 0); if (g !== gen) return; }
      PK.showdown = true; for (const p of live()) if (!p.you) for (const c of p.cards) flip(c); await sleep(450); if (g !== gen) return;
      // side pots: each layer of contributions is won by the best hand among those who paid into it
      const score = {}; for (const p of live()) score[p.i] = evalHand(p.hole.concat(PK.board));
      const levels = [...new Set(P.filter(p => p.total > 0).map(p => p.total))].sort((a, b) => a - b); let prev = 0; const said = [];
      for (const lv of levels) {
        const amt = P.reduce((a, p) => a + Math.max(0, Math.min(p.total, lv) - prev), 0), elig = live().filter(p => p.total >= lv); prev = lv; if (!amt || !elig.length) continue;
        const best = Math.max(...elig.map(p => score[p.i].v)), win = elig.filter(p => score[p.i].v === best);
        win.forEach((p, k) => { p.stack += Math.floor(amt / win.length) + (k === 0 ? amt % win.length : 0); });
        const ws = win.map(p => (p.you ? 'You' : p.name)).join(' and '); if (!said.includes(ws)) said.push(ws), PK.msg = `${ws} win${win.length === 1 && !win[0].you ? 's' : ''} with ${HAND[score[win[0].i].cat].toLowerCase()}.`;
        if (win.some(p => p.you)) PK.cls = 'win';
      }
      if (!PK.cls && !P[0].folded) PK.cls = 'lose';
    }
    PK.pot = 0; stackTo(potStack, 0); setChips(P[0].stack); PK.phase = 'done'; PK.hands++; pkRender();
  }
  function pkRender() {
    const me = PK.P[0], call = Math.max(0, PK.curBet - me.bet), mine = PK.phase === 'you', hn = me.hole.length && PK.board.length >= 3 ? HAND[evalHand(me.hole.concat(PK.board)).cat] : '';
    const room = mine && me.stack > call, raiseTo = f => Math.min(me.bet + me.stack, PK.curBet + Math.max(PK.minRaise, Math.round((potTotal() + call) * f / 5) * 5));
    let ctl = '';
    if (PK.phase === 'idle' || PK.phase === 'done') ctl = `<button class="btn small" data-a="deal">${PK.phase === 'idle' ? 'Deal me in' : 'Next hand'}</button>`;
    else if (mine) ctl = `<button class="btn ghost small" data-a="fold"${call ? '' : ' disabled'}>Fold</button><button class="btn small" data-a="call">${call ? `Call ${money(Math.min(call, me.stack))}` : 'Check'}</button>${room ? `<button class="btn ghost small" data-a="r:${PK.curBet + PK.minRaise}">${PK.curBet ? 'Min raise' : 'Bet'} ${money(Math.min(me.bet + me.stack, PK.curBet + PK.minRaise))}</button><button class="btn ghost small" data-a="r:${raiseTo(0.5)}">½ pot</button><button class="btn ghost small" data-a="r:${raiseTo(1)}">Pot</button><button class="btn ghost small" data-a="r:${me.bet + me.stack}">All in</button>` : ''}`;
    else ctl = `<span style="color:var(--dim)">${PK.phase === 'dealing' ? 'Dealing…' : `${PK.P[PK.turn]?.name ?? ''} is thinking…`}</span>`;
    const mini = c => `<span class="mc${c.s === 1 || c.s === 2 ? ' red' : ''}">${RANKS[c.r]}${SUITS[c.s]}</span>`;
    const cardsRow = me.hole.length ? `<div class="mrow"><span>Your hand</span>${me.hole.map(mini).join('')}${PK.board.length ? `<span style="margin-left:12px">Board</span>${PK.board.map(mini).join('')}` : ''}</div>` : '';
    dock(`<h2>Texas Hold’em</h2>${cardsRow}<div class="stat"><span>Your chips <b>${money(me.stack)}</b></span><span>Pot <b>${money(potTotal())}</b></span>${call && mine ? `<span>To call <b>${money(call)}</b></span>` : ''}${hn ? `<span>You have <b>${hn.toLowerCase()}</b></span>` : ''}</div>
      <div class="msg ${PK.cls}">${PK.msg}</div><div class="row">${ctl}</div>
      <details><summary>How to play</summary><ul><li>Everyone gets two cards. Five shared cards come out: the flop (three), the turn and the river.</li><li>The best five-card hand from your two plus the board wins. From weakest to strongest: high card, pair, two pair, three of a kind, straight, flush, full house, four of a kind, straight flush.</li><li>On your turn: fold, check or call, or bet and raise. The blinds are 10 and 20, and the button (the white disc) moves round every hand.</li></ul></details>`);
  }
  function pkAct(a) {
    if ((a === 'deal') && (PK.phase === 'idle' || PK.phase === 'done')) { pkHand(); return; }
    if (PK.phase !== 'you' || !PK.wait) return;
    if (a === 'fold') PK.wait(['fold']); else if (a === 'call') PK.wait(['call']); else if (a.startsWith('r:')) PK.wait(['raise', +a.slice(2)]);
  }
  function pkLeave() {                                       // leaving mid-hand is a fold; your chips stay where they are
    for (const c of PK.cards) pkG.remove(c.g); PK.cards = []; PK.board = [];
    for (const p of PK.P) { stackTo(p.betStack, 0); p.hole = []; p.cards = []; p.last = ''; } stackTo(potStack, 0);
    PK.phase = 'idle'; PK.turn = -1; PK.wait = null; PK.msg = 'Five-handed no-limit hold’em. Blinds 10 and 20.'; PK.cls = '';
  }

  /* ================================================ seating */
  let seat = null, tagCss = false;
  const api = {
    get seat() { return seat; },
    BJ, RL, PK,
    enter(kind, el) {
      css(); if (!tagCss) { tagCss = true; const s = document.createElement('style'); s.textContent = '.mrow{display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin:4px 0 2px;font-size:13px;color:var(--dim)}.mrow .mc{display:inline-block;min-width:34px;padding:4px 5px;border-radius:6px;background:#fbf8f0;color:#15171c;font:700 16px Georgia,serif;text-align:center}.mrow .mc.red{color:#c0262d}.tbltag{position:absolute;transform:translate(-50%,-100%);background:rgba(12,14,20,.82);color:#fff;border:1px solid rgba(255,255,255,.2);border-radius:10px;padding:4px 9px;font-size:12.5px;line-height:1.3;text-align:center;white-space:nowrap;pointer-events:none}.tbltag b{color:#ffd76a}.tbltag.turn{border-color:#f2b441;box-shadow:0 0 0 1px #f2b441}.tbltag.out{opacity:.45}.tbltag.total{font-size:15px;font-weight:700;transform:translate(-50%,-50%)}'; document.head.appendChild(s); }
      seat = kind; gen++; clearTweens(); cam.snap = true;
      if (kind === 'blackjack') { bindDock(el, bjAct); bjClear(); Object.assign(BJ, { bank: chips(), phase: 'bet', bet: 0, msg: 'Place your bet.', cls: '' }); stackTo(bjBet, 0); bjRender(); }
      else if (kind === 'roulette') { bindDock(el, rlAct); Object.assign(RL, { bank: chips(), bets: {}, spin: null, result: null, msg: 'Pick a chip, tap the board, then spin.', cls: '' }); rlStacks(); rlRender(); }
      else { bindDock(el, pkAct); PK.P[0].stack = chips(); pkLeave(); pkRender(); }
    },
    leave() {
      if (!seat) return; gen++; clearTweens();
      if (seat === 'blackjack') { bjClear(); stackTo(bjBet, 0); if (BJ.phase !== 'bet' && BJ.phase !== 'done') { BJ.phase = 'bet'; } }
      else if (seat === 'roulette') { if (RL.spin) { RL.spin = null; } RL.bank += rlTotal(); RL.bets = {}; setChips(RL.bank); rlStacks(); }
      else pkLeave();
      seat = null; dockEl = dockFn = null; cam.off = 0; camera.clearViewOffset();
      if (camera.fov !== 68) { camera.fov = 68; camera.updateProjectionMatrix(); }
    },
    // runs every frame while you are in the casino, seated or not
    idle(dt, t) {
      stepTweens(dt); rlStep(dt);
      for (const p of PK.P) if (p.person) { p.person.head.rotation.y = Math.sin(t * 0.5 + p.i * 1.7) * 0.25 + (PK.turn === p.i ? Math.sin(t * 3) * 0.08 : 0); p.person.g.position.y = -0.34 + Math.sin(t * 1.3 + p.i) * 0.003; }
      bjArm = Math.max(0, bjArm - dt); if (dealers?.bj) dealers.bj.armR.rotation.x += ((bjArm > 0 ? -1.0 : 0) - dealers.bj.armR.rotation.x) * Math.min(1, dt * 10);
      if (dealers?.rl) dealers.rl.armR.rotation.x += ((RL.spin && RL.spin.t < 0.6 ? -1.3 : 0) - dealers.rl.armR.rotation.x) * Math.min(1, dt * 8);
    },
    // while seated: the camera, and the labels pinned to the table
    update(dt) {
      let html = '';
      if (seat === 'blackjack') {
        aimCamera(bjG, 0, 1.44, 1.16, 0, 1.02, -0.08, dt, 54);
        const B = BJ; if (B.me.length) { const v = bjVal(B.me); html += tag(bjG, 0.03, BY + 0.02, 0.56, `${v.t}`, 'total'); }
        if (B.dl.length) { const v = bjVal(B.phase === 'play' || (B.phase === 'dealing' && B.dl.length === 2 && B.cards.some(c => c.who === 'dl' && c.g.rotation.z > 1)) ? [B.dl[0]] : B.dl); html += tag(bjG, -0.12 + B.dl.length * 0.105, BY + 0.02, -0.1, `${v.t}`, 'total'); }
        html += `<div class="g-top"><div class="pill">Blackjack</div><div class="pill">Chips: ${money(B.bank)}</div></div>`;
      } else if (seat === 'roulette') {
        if (RL.spin) aimCamera(rlG, WC.x + 0.05, 1.72, 0.66, WC.x, 1.1, -0.04, dt, 50);
        else aimCamera(rlG, -0.2, 2.3, 1.45, -0.2, 0.96, -0.1, dt, 54);
        html += `<div class="g-top"><div class="pill">Roulette</div><div class="pill">Chips: ${money(RL.bank)}</div></div>`;
        if (RL.result !== null && !RL.spin) html += tag(rlG, WC.x, 1.4, WC.z, `<b>${RL.result}</b> ${RL.result === 0 ? 'green' : colorOf(RL.result) === 'r' ? 'red' : 'black'}`, 'total');
      } else if (seat === 'holdem') {
        aimCamera(pkG, 0, 1.78, 1.9, 0, 0.86, -0.25, dt, 58);
        for (const p of PK.P) {
          if (p.you) continue;
          const lab = `<b>${p.name}</b>${PK.button === p.i ? ' · D' : ''}<br>${money(p.stack)}${p.last ? ` · ${p.last}` : ''}${PK.showdown && !p.folded && p.hole.length ? `<br>${HAND[evalHand(p.hole.concat(PK.board)).cat]}` : ''}`;
          html += tag(pkG, p.seat.x, 1.72, p.seat.z, lab, `${PK.turn === p.i ? 'turn' : ''}${p.folded ? ' out' : ''}`);
        }
        if (PK.P[0].last && PK.phase !== 'idle') html += tag(pkG, 0, PY + 0.06, 0.4, `You · ${PK.P[0].last}${PK.button === 0 ? ' · D' : ''}`, PK.turn === 0 ? 'turn' : '');
        if (potTotal() > 0) html += tag(pkG, -0.5, PY + 0.12, -0.1, `Pot <b>${money(potTotal())}</b>`);
        html += `<div class="g-top"><div class="pill">Texas Hold’em</div><div class="pill">Chips: ${money(PK.P[0].stack)}</div></div>`;
      }
      return html;
    },
  };
  return api;
}
