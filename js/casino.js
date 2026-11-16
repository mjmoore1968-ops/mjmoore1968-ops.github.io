// The Story St. Casino: shared chips, cards and hand ranking, and the two slot machines.
// The table games (blackjack, roulette, hold'em) are played at the 3D tables; see tables.js.
// Chips are play money, kept on this device. They cannot be bought or cashed out.
const KEY = 'mmjr.chips', START = 1000;
export function chips() { try { const v = parseInt(localStorage.getItem(KEY), 10); return Number.isFinite(v) ? v : START; } catch { return START; } }
export function setChips(v) { try { localStorage.setItem(KEY, String(Math.max(0, Math.round(v)))); } catch { /* play on without saving */ } }
export const money = v => Math.round(v).toLocaleString('en-US');

export const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export const freshDeck = () => { const d = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ r, s }); for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; } return d; };

/* ------------------------------------------------------------------ poker hands */
// Best five of up to seven cards, as a number you can compare. Also names the hand.
export const HAND = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
export function evalHand(cards) {
  const cnt = new Array(13).fill(0), suit = [[], [], [], []];
  for (const c of cards) { cnt[c.r]++; suit[c.s].push(c.r); }
  const straight = has => { for (let hi = 12; hi >= 4; hi--) { let ok = true; for (let k = 0; k < 5; k++) if (!has(hi - k)) { ok = false; break; } if (ok) return hi; } return has(12) && has(0) && has(1) && has(2) && has(3) ? 3 : -1; };
  const pack = (cat, ks) => { let v = cat; for (let i = 0; i < 5; i++) v = v * 15 + (ks[i] ?? 0) + 1; return v; };
  const fl = suit.find(s => s.length >= 5);
  if (fl) { const set = new Set(fl), sf = straight(r => set.has(r)); if (sf >= 0) return { v: pack(8, [sf]), cat: 8 }; }
  const by = n => { const out = []; for (let r = 12; r >= 0; r--) if (cnt[r] === n) out.push(r); return out; };
  const four = by(4), three = by(3), two = by(2), kick = ex => { const out = []; for (let r = 12; r >= 0; r--) if (cnt[r] && !ex.includes(r)) out.push(r); return out; };
  if (four.length) return { v: pack(7, [four[0], kick([four[0]])[0]]), cat: 7 };
  if (three.length && (three.length > 1 || two.length)) return { v: pack(6, [three[0], Math.max(three[1] ?? -1, two[0] ?? -1)]), cat: 6 };
  if (fl) return { v: pack(5, fl.slice().sort((a, b) => b - a).slice(0, 5)), cat: 5 };
  const st = straight(r => cnt[r] > 0); if (st >= 0) return { v: pack(4, [st]), cat: 4 };
  if (three.length) return { v: pack(3, [three[0], ...kick([three[0]]).slice(0, 2)]), cat: 3 };
  if (two.length >= 2) return { v: pack(2, [two[0], two[1], kick([two[0], two[1]])[0]]), cat: 2 };
  if (two.length) return { v: pack(1, [two[0], ...kick([two[0]]).slice(0, 3)]), cat: 1 };
  return { v: pack(0, kick([]).slice(0, 5)), cat: 0 };
}
// chance that these hole cards win against `opp` random hands, by dealing the rest out many times
export function equity(hole, board, opp = 1, n = 140) {
  const used = new Set([...hole, ...board].map(c => c.r * 4 + c.s)), rest = []; for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) if (!used.has(r * 4 + s)) rest.push({ r, s });
  const need = opp * 2 + 5 - board.length; let w = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < need; k++) { const j = k + ((Math.random() * (rest.length - k)) | 0); [rest[k], rest[j]] = [rest[j], rest[k]]; }
    const b = board.concat(rest.slice(opp * 2, need)), mine = evalHand(hole.concat(b)).v; let best = 0, ties = 0;
    for (let o = 0; o < opp; o++) { const v = evalHand([rest[o * 2], rest[o * 2 + 1]].concat(b)).v; if (v > best) { best = v; ties = 0; } if (v === best) ties++; }
    w += mine > best ? 1 : mine === best ? 1 / (ties + 1) : 0;
  }
  return w / n;
}

/* ------------------------------------------------------------------ styles for the casino panels and the table dock */
const CSS = `
.cz h2{margin-bottom:2px}.cz .bank{font-variant-numeric:tabular-nums;color:var(--amber);font-weight:700}
.cz .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px}
.cz button.chip{width:42px;height:42px;border-radius:50%;border:4px dashed rgba(255,255,255,.75);color:#fff;font-weight:800;font-size:12px;flex:none}
.cz button.chip.c5{background:#b8262d}.cz button.chip.c10{background:#2456b8}.cz button.chip.c25{background:#1f8a4c}.cz button.chip.c50{background:#c0262d}.cz button.chip.c100{background:#15171c}
.cz button.chip.sel{outline:3px solid var(--amber);outline-offset:2px}
.cz .msg{min-height:20px;font-weight:600;margin-top:4px}.cz .msg.win{color:#7dff9a}.cz .msg.lose{color:#ff9a9a}
.cz details{margin-top:8px;font-size:13px;color:var(--dim)}.cz details summary{cursor:pointer;color:var(--ink);font-weight:600}.cz details li{margin:3px 0}
.cz .btn[disabled]{opacity:.4;pointer-events:none}
.cz .stat{display:flex;gap:14px;flex-wrap:wrap;font-size:14px;color:var(--dim)}.cz .stat b{color:var(--ink);font-variant-numeric:tabular-nums}
.cz .rgrid{display:grid;grid-template-columns:30px repeat(12,1fr);gap:2px;font-size:12px;font-weight:700;margin-top:6px}
.cz .rc{position:relative;display:flex;align-items:center;justify-content:center;height:26px;border-radius:4px;color:#fff;cursor:pointer;border:1px solid rgba(255,255,255,.22);user-select:none}
.cz .rc.r{background:#b8262d}.cz .rc.k{background:#17191d}.cz .rc.g{background:#1f8a4c}.cz .rc.o{background:rgba(255,255,255,.08)}
.cz .rc.hit{outline:3px solid var(--amber);outline-offset:1px}
.cz .rc em{position:absolute;right:-4px;top:-6px;background:var(--amber);color:#1a1303;font-style:normal;font-size:10px;border-radius:999px;padding:1px 5px;z-index:1}
.cz .hist{display:flex;gap:3px;flex-wrap:wrap}.cz .hist span{width:20px;height:20px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;color:#fff;font-weight:700}
.cz .hist .r{background:#b8262d}.cz .hist .k{background:#17191d;border:1px solid #555}.cz .hist .g{background:#1f8a4c}
/* slot machines */
.slot .cab{border-radius:22px;padding:14px 14px 12px;margin-top:40px;box-shadow:inset 0 0 0 4px #d9b34a,inset 0 0 30px rgba(0,0,0,.5)}
.slot.s7 .cab{background:linear-gradient(#8a1f2b,#4a0f17)} .slot.moon .cab{background:linear-gradient(#1d1747,#0b0a22)}
.slot .marquee{text-align:center;font:800 28px Georgia,serif;letter-spacing:.06em;color:#ffe9a8;text-shadow:0 0 12px #ffcc4d,0 0 2px #fff;margin-bottom:10px}
.slot.moon .marquee{color:#c9e6ff;text-shadow:0 0 14px #59b4ff,0 0 2px #fff}
.slot .glass{position:relative;display:flex;gap:6px;justify-content:center;background:#0d0e12;border-radius:12px;padding:8px;border:3px solid #d9b34a}
.slot .reel{position:relative;overflow:hidden;background:linear-gradient(#cfcfcf,#fff 18%,#fff 82%,#cfcfcf);border-radius:6px;flex:1;max-width:112px}
.slot.moon .reel{background:linear-gradient(#1e2448,#2c3566 18%,#2c3566 82%,#1e2448);max-width:82px}
.slot .strip{position:absolute;left:0;right:0;top:0;will-change:transform}
.slot .cell{display:flex;align-items:center;justify-content:center;font-size:40px;line-height:1}
.slot.moon .cell{font-size:32px}
.slot .cell.bar{font:900 20px Arial,sans-serif;color:#fff;background:#15171c;border-radius:6px;margin:12px 10px;letter-spacing:.06em}
.slot .cell.seven{font:900 46px Georgia,serif;color:#c0262d;text-shadow:0 2px 0 #7a1018}
.slot .line{position:absolute;left:4px;right:4px;height:3px;background:rgba(255,64,64,.85);box-shadow:0 0 8px #ff4040;pointer-events:none;top:50%;transform:translateY(-50%)}
.slot .lcd{display:flex;justify-content:space-between;margin-top:10px;font:700 15px ui-monospace,Menlo,monospace;color:#ffd76a;background:#100c04;border-radius:8px;padding:7px 12px;border:1px solid #5b4a1a}
.slot.moon .lcd{color:#8fd3ff;background:#050b18;border-color:#1f3b66}
.slot .lit{animation:slotblink .35s ease-in-out 5 alternate}
@keyframes slotblink{from{filter:brightness(1)}to{filter:brightness(1.8) drop-shadow(0 0 8px #ffd76a)}}
.slot .reel .cell.win{background:rgba(255,215,106,.45);border-radius:6px}
.slot .spin{min-width:110px;font-size:16px}
.slot table.pay{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}.slot table.pay td{padding:3px 6px;border-bottom:1px solid var(--line)}.slot table.pay td:last-child{text-align:right;color:var(--ink)}
@media (max-width:560px){.cz .rc{height:22px;font-size:10.5px}.cz .rgrid{grid-template-columns:22px repeat(12,1fr);gap:2px}.slot .cell{font-size:30px}.slot.moon .cell{font-size:24px}.slot .marquee{font-size:22px}}
/* the table dock: a slim bar over the 3D table */
#panel.dock{background:none;backdrop-filter:none;-webkit-backdrop-filter:none;align-items:flex-end;pointer-events:none;padding:10px}
#panel.dock .box{pointer-events:auto;max-width:760px;width:100%;padding:12px 16px 10px;background:rgba(12,14,20,.86);max-height:52vh;overflow:auto}
#panel.dock .box > .hint{display:none}
#panel.dock h2{font-size:18px;margin:0}
#panel.dock #back{position:static;float:right;margin:0 0 6px 10px}
`;
export function css() { if (document.getElementById('czcss')) return; const s = document.createElement('style'); s.id = 'czcss'; s.textContent = CSS; document.head.appendChild(s); }

/* ------------------------------------------------------------------ slot machines */
const delay = ms => new Promise(r => setTimeout(r, ms));
function pickW(syms) { let t = 0; for (const s of syms) t += s.w; let r = Math.random() * t; for (const s of syms) { r -= s.w; if (r < 0) return s; } return syms[syms.length - 1]; }
const cellHtml = (s, h) => `<div class="cell${s.cls ? ' ' + s.cls : ''}" style="height:${h - (s.cls === 'bar' ? 24 : 0)}px">${s.g}</div>`;

// Lucky 7s: three reels, one line across the middle. Classic fruit machine.
const S7 = [
  { id: 'ch', g: '🍒', w: 6 }, { id: 'le', g: '🍋', w: 8 }, { id: 'be', g: '🔔', w: 6 }, { id: 'bar', g: 'BAR', w: 4, cls: 'bar' }, { id: 'st', g: '⭐', w: 3 }, { id: 'sv', g: '7', w: 2, cls: 'seven' },
];
const S7PAY = { sv: 100, st: 50, bar: 25, be: 15, le: 10, ch: 8 };
export function payS7(line) {
  const [a, b, c] = line.map(s => s.id);
  if (a === b && b === c) return S7PAY[a];
  const ch = [a, b, c].filter(x => x === 'ch').length;
  if (ch === 2) return 2;
  if (a === 'ch') return 1;
  if ([a, b, c].every(x => x === 'sv' || x === 'st')) return 10;                     // any mix of 7s and stars
  return 0;
}
// Moonshot: five reels, three rows, five lines. 🚀 is wild, 🪐 is a scatter that starts free spins.
const MS = [
  { id: 'co', g: '☄️', w: 10 }, { id: 'st', g: '⭐', w: 8 }, { id: 'mo', g: '🌙', w: 6 }, { id: 'al', g: '👽', w: 4 }, { id: 'di', g: '💎', w: 3 }, { id: 'wi', g: '🚀', w: 2 }, { id: 'pl', g: '🪐', w: 2 },
];
const MSPAY = { co: [2, 5, 15], st: [3, 8, 25], mo: [4, 12, 40], al: [6, 20, 80], di: [10, 40, 150], wi: [25, 100, 500] };
const LINES = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2]];
export function payMoon(grid) {                           // grid[reel][row]; pays in multiples of the line bet, plus the scatter in multiples of the total bet
  let lines = 0; const hits = [];
  LINES.forEach((ln, li) => {
    const seq = ln.map((row, r) => grid[r][row].id);
    let n = 0; while (n < 5 && seq[n] === 'wi') n++;
    const wildPay = n >= 3 ? MSPAY.wi[n - 3] : 0;
    const sym = seq.find(x => x !== 'wi');
    let m = 0; if (sym && sym !== 'pl') { while (m < 5 && (seq[m] === sym || seq[m] === 'wi')) m++; }
    const symPay = m >= 3 ? MSPAY[sym][m - 3] : 0;
    const p = Math.max(wildPay, symPay); if (p) { lines += p; hits.push({ li, n: symPay >= wildPay ? m : n }); }
  });
  let sc = 0; for (const r of grid) for (const s of r) if (s.id === 'pl') sc++;
  return { lines, hits, scat: sc >= 5 ? 20 : sc >= 4 ? 5 : sc >= 3 ? 2 : 0, free: sc >= 5 ? 12 : sc >= 4 ? 8 : sc >= 3 ? 6 : 0 };
}
export const SLOT_SYMS = { S7, MS }, pickSym = pickW;

export function openSlot(kind, el, live) {
  css();
  const moon = kind === 'moonshot', REELS = moon ? 5 : 3, ROWS = 3, H = moon ? 58 : 70, syms = moon ? MS : S7, bets = moon ? [5, 10, 25, 50] : [5, 10, 25, 50];
  let bank = chips(), bet = 10, busy = false, free = 0, last = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => pickW(syms))), win = 0, msg = moon ? 'Five lines. 🚀 is wild. Three 🪐 anywhere start free spins.' : 'Line them up across the red line.';
  el.innerHTML = `<div class="cz slot ${moon ? 'moon' : 's7'}"><div class="cab"><div class="marquee">${moon ? 'MOONSHOT' : 'LUCKY 7s'}</div>
    <div class="glass">${Array.from({ length: REELS }, (_, i) => `<div class="reel" style="height:${H * ROWS}px"><div class="strip" id="st${i}"></div></div>`).join('')}<div class="line"></div></div>
    <div class="lcd"><span id="slWin">WIN 0</span><span id="slFree"></span><span id="slBank">CHIPS ${money(bank)}</span></div></div>
    <div class="msg" id="slMsg">${msg}</div>
    <div class="row">${bets.map(v => `<button class="chip c${v}${v === bet ? ' sel' : ''}" data-b="${v}">${v}</button>`).join('')}<button class="btn spin" id="slSpin">SPIN</button></div>
    <details><summary>Pay table</summary>${moon
      ? `<p style="margin:6px 0">Each spin plays five lines (the three rows and two V shapes). Pays are per line, as a multiple of a fifth of your bet. 🚀 stands in for anything except 🪐.</p><table class="pay">${['wi', 'di', 'al', 'mo', 'st', 'co'].map(k => `<tr><td>${MS.find(s => s.id === k).g} ×3 / ×4 / ×5</td><td>${MSPAY[k].join(' / ')}</td></tr>`).join('')}<tr><td>🪐 ×3 / ×4 / ×5 anywhere</td><td>2× / 5× / 20× bet + 6 / 8 / 12 free spins</td></tr></table>`
      : `<table class="pay"><tr><td>7 7 7</td><td>100×</td></tr><tr><td>⭐ ⭐ ⭐</td><td>50×</td></tr><tr><td>BAR BAR BAR</td><td>25×</td></tr><tr><td>🔔 🔔 🔔</td><td>15×</td></tr><tr><td>🍋 🍋 🍋</td><td>10×</td></tr><tr><td>🍒 🍒 🍒</td><td>8×</td></tr><tr><td>Any mix of 7s and ⭐</td><td>10×</td></tr><tr><td>Two 🍒</td><td>2×</td></tr><tr><td>🍒 on the first reel</td><td>1×</td></tr></table>`}</details></div>`;
  const $ = id => el.querySelector('#' + id);
  const fill = (i, col) => { const s = $('st' + i); s.style.transition = 'none'; s.style.transform = 'translateY(0)'; s.innerHTML = col.map(x => cellHtml(x, H)).join(''); };
  last.forEach((c, i) => fill(i, c));
  const show = () => { $('slBank').textContent = `CHIPS ${money(bank)}`; $('slWin').textContent = `WIN ${money(win)}`; $('slFree').textContent = free ? `FREE SPINS ${free}` : ''; $('slSpin').textContent = free ? `FREE (${free})` : 'SPIN'; $('slMsg').textContent = msg; };
  async function spin() {
    if (busy) return;
    const isFree = free > 0;
    if (!isFree) { if (bank < bet) { if (bank <= 0) { bank = 500; setChips(bank); msg = 'Out of chips: the house spots you 500.'; } else msg = 'Not enough chips for that bet.'; show(); return; } bank -= bet; setChips(bank); }
    else free--;
    busy = true; win = 0; msg = isFree ? 'Free spin…' : 'Good luck…'; show(); el.querySelectorAll('.cell.win').forEach(c => c.classList.remove('win'));
    const grid = Array.from({ length: REELS }, () => Array.from({ length: ROWS }, () => pickW(syms)));
    for (let i = 0; i < REELS; i++) {                       // the old symbols on top, a blur of random ones, the result at the bottom
      const n = 14 + i * (moon ? 4 : 6), col = [...last[i], ...Array.from({ length: n }, () => pickW(syms)), ...grid[i]]; fill(i, col);
      const s = $('st' + i); void s.offsetHeight; const T = (moon ? 0.9 : 1.0) + i * (moon ? 0.28 : 0.45);
      s.style.transition = `transform ${T}s cubic-bezier(.15,.65,.25,1.04)`; s.style.transform = `translateY(-${(col.length - ROWS) * H}px)`;
    }
    await delay(((moon ? 0.9 : 1.0) + (REELS - 1) * (moon ? 0.28 : 0.45)) * 1000 + 120);
    if (!live()) return;
    last = grid;
    grid.forEach((c, i) => fill(i, c));
    let won = 0;
    if (moon) {
      const r = payMoon(grid); won = Math.round(r.lines * bet / 5 + r.scat * bet);
      for (const h of r.hits) for (let k = 0; k < h.n; k++) $('st' + k).children[LINES[h.li][k]].classList.add('win');
      if (r.free) { free += r.free; msg = `${r.free} free spins!`; for (let i = 0; i < REELS; i++) grid[i].forEach((s, j) => { if (s.id === 'pl') $('st' + i).children[j].classList.add('win'); }); }
      else msg = won ? `${r.hits.length} line${r.hits.length === 1 ? '' : 's'} — you win ${money(won)}` : 'No win. Spin again.';
    } else {
      const line = grid.map(c => c[1]), m = payS7(line); won = m * bet;
      if (m) for (let i = 0; i < 3; i++) $('st' + i).children[1].classList.add('win');
      msg = won ? (m >= 50 ? `JACKPOT! ${money(won)}` : `You win ${money(won)}`) : 'No win. Spin again.';
    }
    win = won; bank += won; setChips(bank);
    if (won) el.querySelector('.lcd').classList.add('lit'), setTimeout(() => el.querySelector('.lcd')?.classList.remove('lit'), 1800);
    busy = false; show();
    if (free > 0) { await delay(900); if (live()) spin(); }
  }
  el.onclick = e => {
    const b = e.target.closest('[data-b]'); if (b && !busy && !free) { bet = +b.dataset.b; el.querySelectorAll('[data-b]').forEach(x => x.classList.toggle('sel', x === b)); return; }
    if (e.target.closest('#slSpin')) spin();
  };
  el.onkeydown = null;
  show();
  return { spin };
}
