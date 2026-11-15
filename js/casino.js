// The Story St. Casino's three tables: blackjack, heads-up Texas hold'em and roulette.
// They are played in a panel over the 3D room. Chips are play money, kept on this device.
const KEY = 'mmjr.chips', START = 1000;
export function chips() { try { const v = parseInt(localStorage.getItem(KEY), 10); return Number.isFinite(v) ? v : START; } catch { return START; } }
function setChips(v) { try { localStorage.setItem(KEY, String(Math.max(0, Math.round(v)))); } catch { /* play on without saving */ } }

const SUITS = ['♠', '♥', '♦', '♣'], RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const freshDeck = () => { const d = []; for (let s = 0; s < 4; s++) for (let r = 0; r < 13; r++) d.push({ r, s }); for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; } return d; };
const cardHtml = (c, hidden) => (hidden || !c ? '<span class="cd back"></span>' : `<span class="cd${c.s === 1 || c.s === 2 ? ' red' : ''}"><b>${RANKS[c.r]}</b><i>${SUITS[c.s]}</i></span>`);
const money = v => v.toLocaleString('en-US');

const CSS = `
.cz h2{margin-bottom:2px}.cz .bank{font-variant-numeric:tabular-nums;color:var(--amber);font-weight:700}
.cz .felt{background:radial-gradient(ellipse at 50% 30%,#1f7a4a,#0f4a2c);border:6px solid #5b3a22;border-radius:18px;padding:14px 12px;margin:10px 0}
.cz .lbl{font-size:11.5px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.72);margin:2px 0 6px}
.cz .hand{display:flex;gap:6px;flex-wrap:wrap;min-height:66px;align-items:center}
.cz .cd{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;width:44px;height:62px;border-radius:7px;background:#fbf8f0;color:#15171c;box-shadow:0 2px 5px rgba(0,0,0,.4);font-family:Georgia,serif;line-height:1}
.cz .cd b{font-size:19px}.cz .cd i{font-style:normal;font-size:19px;margin-top:2px}.cz .cd.red{color:#c0262d}
.cz .cd.back{background:repeating-linear-gradient(45deg,#8a1f2b,#8a1f2b 5px,#a8323e 5px,#a8323e 10px);border:3px solid #fbf8f0;box-sizing:border-box}
.cz .cd.dim{opacity:.45}
.cz .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}
.cz button.chip{width:46px;height:46px;border-radius:50%;border:4px dashed rgba(255,255,255,.75);color:#fff;font-weight:800;font-size:13px}
.cz button.chip.c10{background:#2456b8}.cz button.chip.c25{background:#1f8a4c}.cz button.chip.c50{background:#c0262d}.cz button.chip.c100{background:#15171c}
.cz button.chip.sel{outline:3px solid var(--amber);outline-offset:2px}
.cz .msg{min-height:22px;font-weight:600;margin-top:8px}.cz .msg.win{color:#7dff9a}.cz .msg.lose{color:#ff9a9a}
.cz .tot{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:rgba(0,0,0,.35);font-size:12.5px;font-weight:700}
.cz details{margin-top:12px;font-size:13.5px;color:var(--dim)}.cz details summary{cursor:pointer;color:var(--ink);font-weight:600}.cz details li{margin:4px 0}
.cz .btn[disabled]{opacity:.4;pointer-events:none}
.cz .rgrid{display:grid;grid-template-columns:34px repeat(12,1fr) ;gap:3px;font-size:12.5px;font-weight:700}
.cz .rc{position:relative;display:flex;align-items:center;justify-content:center;height:32px;border-radius:5px;color:#fff;cursor:pointer;border:1px solid rgba(255,255,255,.25);user-select:none}
.cz .rc.r{background:#b8262d}.cz .rc.k{background:#17191d}.cz .rc.g{background:#1f8a4c}.cz .rc.o{background:rgba(0,0,0,.28)}
.cz .rc.hit{outline:3px solid var(--amber);outline-offset:1px}
.cz .rc em{position:absolute;right:-4px;top:-6px;background:var(--amber);color:#1a1303;font-style:normal;font-size:10px;border-radius:999px;padding:1px 5px;z-index:1}
.cz .wheel{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.cz .num{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff;border:4px solid #d9b34a;background:#17191d}
.cz .num.r{background:#b8262d}.cz .num.g{background:#1f8a4c}
.cz .hist{display:flex;gap:4px;flex-wrap:wrap}.cz .hist span{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;font-weight:700}
.cz .pot{font-weight:800;color:#ffe9a8}.cz .who{display:flex;justify-content:space-between;align-items:baseline}
@media (max-width:560px){.cz .cd{width:38px;height:54px}.cz .cd b,.cz .cd i{font-size:16px}.cz .rc{height:28px;font-size:11px}.cz .rgrid{grid-template-columns:26px repeat(12,1fr);gap:2px}}
`;
function css() { if (document.getElementById('czcss')) return; const s = document.createElement('style'); s.id = 'czcss'; s.textContent = CSS; document.head.appendChild(s); }

/* ------------------------------------------------------------------ blackjack */
const bjVal = h => { let t = 0, a = 0; for (const c of h) { if (c.r === 12) { a++; t += 11; } else t += c.r >= 8 ? 10 : c.r + 2; } while (t > 21 && a) { t -= 10; a--; } return { t, soft: a > 0 }; };
function blackjack(el, live) {
  let bank = chips(), bet = 0, lastBet = 25, deck = freshDeck(), me = [], dl = [], phase = 'bet', msg = 'Place your bet.', cls = '', doubled = false;
  const draw = () => { if (deck.length < 15) deck = freshDeck(); return deck.pop(); };
  const end = (m, c, pay) => { bank += pay; setChips(bank); msg = m; cls = c; phase = 'done'; lastBet = doubled ? bet / 2 : bet; if (bank <= 0) { bank = 500; setChips(bank); msg += ' You are out of chips, so the house spots you 500.'; } render(); };
  const settle = () => {
    const m = bjVal(me).t, d = bjVal(dl).t;
    if (m > 21) end(`Bust with ${m}. You lose ${money(bet)}.`, 'lose', 0);
    else if (d > 21) end(`Dealer busts with ${d}. You win ${money(bet)}.`, 'win', bet * 2);
    else if (m > d) end(`${m} beats ${d}. You win ${money(bet)}.`, 'win', bet * 2);
    else if (m < d) end(`Dealer's ${d} beats your ${m}. You lose ${money(bet)}.`, 'lose', 0);
    else end(`Push at ${m}. Your bet comes back.`, '', bet);
  };
  const dealerPlay = () => { phase = 'dealer'; render(); const stepD = () => { if (!live()) return; if (bjVal(dl).t < 17) { dl.push(draw()); render(); setTimeout(stepD, 550); } else settle(); }; setTimeout(stepD, 550); };
  function act(a) {
    if (phase === 'bet') {
      if (a.startsWith('c')) { const v = +a.slice(1); if (bet + v <= bank) bet += v; else msg = 'Not enough chips for that.'; }
      else if (a === 'clear') bet = 0;
      else if (a === 'deal' && bet > 0) {
        bank -= bet; setChips(bank); doubled = false; me = [draw(), draw()]; dl = [draw(), draw()]; phase = 'play'; msg = ''; cls = '';
        const mb = bjVal(me).t === 21, db = bjVal(dl).t === 21;
        if (mb || db) { if (mb && db) return end('Both have blackjack. Push.', '', bet); if (mb) return end(`Blackjack! You win ${money(bet * 1.5)}.`, 'win', bet * 2.5); return end('Dealer has blackjack. You lose.', 'lose', 0); }
      }
    } else if (phase === 'play') {
      if (a === 'hit') { me.push(draw()); if (bjVal(me).t > 21) return settle(); if (bjVal(me).t === 21) return dealerPlay(); }
      else if (a === 'stand') return dealerPlay();
      else if (a === 'double' && me.length === 2 && bank >= bet) { bank -= bet; setChips(bank); bet *= 2; doubled = true; me.push(draw()); if (bjVal(me).t > 21) return settle(); return dealerPlay(); }
    } else if (phase === 'done' && a === 'next') { bet = Math.min(lastBet, bank); me = []; dl = []; phase = 'bet'; msg = 'Place your bet.'; cls = ''; }
    render();
  }
  function render() {
    const hide = phase === 'play', mv = me.length ? bjVal(me) : null, dv = dl.length ? bjVal(hide ? [dl[0]] : dl) : null;
    el.innerHTML = `<div class="cz"><h2>Blackjack</h2><p>Chips: <span class="bank">${money(bank)}</span>${bet ? ` · Bet: <b>${money(bet)}</b>` : ''}</p>
      <div class="felt"><div class="lbl">Dealer${dv ? `<span class="tot">${dv.t}${hide ? ' +' : ''}</span>` : ''}</div><div class="hand">${dl.map((c, i) => cardHtml(c, hide && i === 1)).join('')}</div>
      <div class="lbl" style="margin-top:12px">You${mv ? `<span class="tot">${mv.soft && mv.t < 21 ? 'soft ' : ''}${mv.t}</span>` : ''}</div><div class="hand">${me.map(c => cardHtml(c)).join('')}</div></div>
      <div class="msg ${cls}">${msg}</div>
      <div class="row">${phase === 'bet' ? `${[10, 25, 50, 100].map(v => `<button class="chip c${v}" data-a="c${v}">${v}</button>`).join('')}<button class="btn ghost small" data-a="clear">Clear</button><button class="btn small" data-a="deal"${bet ? '' : ' disabled'}>Deal</button>`
        : phase === 'play' ? `<button class="btn small" data-a="hit">Hit</button><button class="btn small" data-a="stand">Stand</button><button class="btn ghost small" data-a="double"${me.length === 2 && bank >= bet ? '' : ' disabled'}>Double</button>`
        : phase === 'done' ? '<button class="btn small" data-a="next">Next hand</button>' : '<span style="color:var(--dim)">Dealer draws…</span>'}</div>
      <details><summary>How to play</summary><ul><li>Get closer to 21 than the dealer without going over. Face cards count 10, aces 1 or 11.</li><li><b>Hit</b> takes a card, <b>Stand</b> keeps your total, <b>Double</b> doubles your bet for exactly one more card.</li><li>The dealer draws to 17. A two-card 21 is blackjack and pays 3 to 2.</li></ul></details></div>`;
  }
  el.onclick = e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); };
  render();
}

/* ------------------------------------------------------------------ roulette */
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = n => (n === 0 ? 'g' : REDS.has(n) ? 'r' : 'k');
const OUT = { d1: ['1st 12', n => n >= 1 && n <= 12, 2], d2: ['2nd 12', n => n >= 13 && n <= 24, 2], d3: ['3rd 12', n => n >= 25, 2], lo: ['1–18', n => n >= 1 && n <= 18, 1], ev: ['Even', n => n > 0 && n % 2 === 0, 1], rd: ['Red', n => colorOf(n) === 'r', 1], bk: ['Black', n => colorOf(n) === 'k', 1], od: ['Odd', n => n % 2 === 1, 1], hi: ['19–36', n => n >= 19, 1] };
function roulette(el, live) {
  let bank = chips(), size = 10, bets = {}, last = null, spinning = false, shown = null, result = null, hist = [], msg = 'Tap the board to place chips, then spin.', cls = '';
  const total = () => Object.values(bets).reduce((a, v) => a + v, 0);
  function spin() {
    if (spinning || !total()) return;
    spinning = true; result = null; last = { ...bets }; msg = 'No more bets…'; cls = '';
    const win = (Math.random() * 37) | 0; let i = 0; const steps = 26 + ((Math.random() * 8) | 0);
    const tick = () => {
      if (!live()) return;
      i++; shown = i >= steps ? win : (Math.random() * 37) | 0; render();
      if (i < steps) setTimeout(tick, 45 + i * i * 0.45);
      else {
        let pay = 0; for (const [k, v] of Object.entries(bets)) { if (k[0] === 'n') { if (+k.slice(1) === win) pay += v * 36; } else if (OUT[k][1](win)) pay += v * (OUT[k][2] + 1); }
        const stake = total(), net = pay - stake; bank += pay; setChips(bank); result = win; hist.unshift(win); hist = hist.slice(0, 12); bets = {}; spinning = false;
        msg = `${win} ${win === 0 ? 'green' : colorOf(win) === 'r' ? 'red' : 'black'}. ${net > 0 ? `You win ${money(net)}.` : net === 0 ? 'You break even.' : `You lose ${money(-net)}.`}`; cls = net > 0 ? 'win' : net < 0 ? 'lose' : '';
        if (bank <= 0) { bank = 500; setChips(bank); msg += ' You are out of chips, so the house spots you 500.'; }
        render();
      }
    };
    tick();
  }
  function act(a) {
    if (spinning) return;
    if (a === 'spin') return spin();
    if (a.startsWith('s')) size = +a.slice(1);
    else if (a === 'clear') { bank += total(); bets = {}; }
    else if (a === 'again' && last) { const cur = total(), need = Object.values(last).reduce((x, v) => x + v, 0); if (need <= bank + cur) { bank += cur; bets = { ...last }; bank -= need; result = null; } else msg = 'Not enough chips to repeat that.'; }
    else if (a.startsWith('b:')) { const k = a.slice(2); if (size <= bank) { bets[k] = (bets[k] || 0) + size; bank -= size; result = null; } else msg = 'Not enough chips for that.'; }
    setChips(bank + total()); render();                    // chips on the table still count as yours until the ball lands
  }
  function render() {
    const cell = (k, label, c) => `<div class="rc ${c}${result !== null && (k[0] === 'n' ? +k.slice(1) === result : OUT[k][1](result)) ? ' hit' : ''}" data-a="b:${k}">${label}${bets[k] ? `<em>${bets[k]}</em>` : ''}</div>`;
    let grid = `<div class="rgrid"><div class="rc g${result === 0 ? ' hit' : ''}" style="grid-row:1/4;height:auto" data-a="b:n0">0${bets.n0 ? `<em>${bets.n0}</em>` : ''}</div>`;
    for (let row = 0; row < 3; row++) for (let col = 0; col < 12; col++) { const n = col * 3 + (3 - row); grid += cell('n' + n, n, colorOf(n)); }
    grid += `<div></div>${['d1', 'd2', 'd3'].map(k => `<div style="grid-column:span 4">${cell(k, OUT[k][0], 'o')}</div>`).join('')}<div></div>${['lo', 'ev', 'rd', 'bk', 'od', 'hi'].map(k => `<div style="grid-column:span 2">${cell(k, OUT[k][0], k === 'rd' ? 'r' : k === 'bk' ? 'k' : 'o')}</div>`).join('')}</div>`;
    el.innerHTML = `<div class="cz"><h2>Roulette</h2><p>Chips: <span class="bank">${money(bank)}</span> · On the table: <b>${money(total())}</b></p>
      <div class="felt"><div class="wheel"><div class="num ${shown === null ? '' : colorOf(shown)}">${shown === null ? '–' : shown}</div><div class="hist">${hist.map(n => `<span class="rc ${colorOf(n)}" style="height:24px;cursor:default;border:0">${n}</span>`).join('')}</div></div>${grid}</div>
      <div class="msg ${cls}">${msg}</div>
      <div class="row">${[10, 25, 50, 100].map(v => `<button class="chip c${v}${size === v ? ' sel' : ''}" data-a="s${v}">${v}</button>`).join('')}<button class="btn ghost small" data-a="clear">Clear</button><button class="btn ghost small" data-a="again"${last ? '' : ' disabled'}>Same again</button><button class="btn small" data-a="spin"${total() && !spinning ? '' : ' disabled'}>Spin</button></div>
      <details><summary>How to play</summary><ul><li>Pick a chip size, then tap numbers or the outside boxes to bet. Tap again to stack more.</li><li>A single number pays 35 to 1. A dozen pays 2 to 1. Red, black, odd, even, 1–18 and 19–36 pay even money.</li><li>One green zero: it beats every outside bet.</li></ul></details></div>`;
  }
  el.onclick = e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); };
  render();
}

/* ------------------------------------------------------------------ poker hands */
// Best five of up to seven cards, as a number you can compare. Also names the hand.
const HAND = ['High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush'];
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
// chance the hole cards win against one random hand, by dealing the rest out many times
function equity(hole, board, n = 220) {
  const used = new Set([...hole, ...board].map(c => c.r * 4 + c.s)), rest = []; for (let r = 0; r < 13; r++) for (let s = 0; s < 4; s++) if (!used.has(r * 4 + s)) rest.push({ r, s });
  let w = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 7 - board.length; k++) { const j = k + ((Math.random() * (rest.length - k)) | 0); [rest[k], rest[j]] = [rest[j], rest[k]]; }
    const b = board.concat(rest.slice(2, 7 - board.length)), a = evalHand(hole.concat(b)).v, o = evalHand([rest[0], rest[1]].concat(b)).v;
    w += a > o ? 1 : a === o ? 0.5 : 0;
  }
  return w / n;
}

/* ------------------------------------------------------------------ heads-up Texas hold'em */
const SB = 10, BB = 20;
function holdem(el, live) {
  let bank = chips(), opp = 1000, btn = 'opp', deck, me, th, board, pot, cm, co, turn, street, raises, acted, phase = 'idle', msg = 'Heads-up no-limit hold’em against the Shark. Blinds 10 and 20.', cls = '', show = false, lastRaise = BB, said = '';
  const save = () => setChips(bank);
  const stack = w => (w === 'me' ? bank : opp), pay = (w, v) => { if (w === 'me') bank -= v; else opp -= v; };
  function put(w, v) { v = Math.min(v, stack(w)); pay(w, v); if (w === 'me') cm += v; else co += v; pot += v; return v; }
  function deal() {
    if (bank <= 0) { bank = 500; msg = 'You are out of chips, so the house spots you 500.'; }
    if (opp <= 0) { opp = 1000; said = 'A new shark sits down with 1,000.'; } else said = '';
    btn = btn === 'me' ? 'opp' : 'me'; deck = freshDeck(); me = [deck.pop(), deck.pop()]; th = [deck.pop(), deck.pop()]; board = []; pot = 0; cm = 0; co = 0; street = 0; raises = 0; show = false; cls = ''; lastRaise = BB;
    const sb = btn, bb = btn === 'me' ? 'opp' : 'me'; put(sb, SB); put(bb, BB);
    acted = { me: false, opp: false }; turn = sb; phase = 'play'; msg = `${btn === 'me' ? 'You have' : 'The Shark has'} the button. ${said}`; save(); render(); if (turn === 'opp') later(ai);
  }
  const later = f => setTimeout(() => { if (live()) f(); }, 800);
  const toCall = w => Math.max(0, (w === 'me' ? co - cm : cm - co));
  function win(w, why) {
    if (w === 'me') bank += pot; else if (w === 'opp') opp += pot; else { bank += pot / 2; opp += pot / 2; }
    msg = why; cls = w === 'me' ? 'win' : w === 'opp' ? 'lose' : ''; pot = 0; phase = 'done'; save(); render();
  }
  function showdown() {
    show = true; while (board.length < 5) board.push(deck.pop());
    const a = evalHand(me.concat(board)), b = evalHand(th.concat(board));
    if (a.v > b.v) win('me', `You win ${money(pot)} with ${HAND[a.cat].toLowerCase()} against ${HAND[b.cat].toLowerCase()}.`);
    else if (a.v < b.v) win('opp', `The Shark wins ${money(pot)} with ${HAND[b.cat].toLowerCase()} against your ${HAND[a.cat].toLowerCase()}.`);
    else win('split', `Split pot: you both have ${HAND[a.cat].toLowerCase()}.`);
  }
  function nextStreet() {
    if (bank === 0 || opp === 0) return showdown();          // someone is all in: run the board out
    if (street === 3) return showdown();
    street++; if (street === 1) board.push(deck.pop(), deck.pop(), deck.pop()); else board.push(deck.pop());
    cm = 0; co = 0; raises = 0; lastRaise = BB; acted = { me: false, opp: false }; turn = btn === 'me' ? 'opp' : 'me';      // after the flop the button acts last
    render(); if (turn === 'opp') later(ai);
  }
  function did(w, a, amt) {
    const o = w === 'me' ? 'opp' : 'me', name = w === 'me' ? 'You' : 'The Shark';
    if (a === 'fold') return win(o, `${name} fold${w === 'me' ? '' : 's'}. ${o === 'me' ? 'You take' : 'The Shark takes'} ${money(pot)}.`);
    if (a === 'call') { const c = toCall(w); const paid = put(w, c); if (paid < c) { const back = c - paid; pay(o, -back); if (o === 'me') cm -= back; else co -= back; pot -= back; }      // short call: the extra goes back
      msg = `${name} ${c ? `call${w === 'me' ? '' : 's'} ${money(paid)}` : `check${w === 'me' ? '' : 's'}`}.`; acted[w] = true; }
    else { const c = toCall(w), before = Math.max(cm, co); put(w, c + amt); const now = w === 'me' ? cm : co; lastRaise = Math.max(BB, now - before); raises++; acted[w] = true; acted[o] = false;
      msg = `${name} ${c ? 'raise' : 'bet'}${w === 'me' ? '' : 's'} to ${money(now)}${stack(w) === 0 ? ' — all in' : ''}.`; }
    save();
    if (acted.me && acted.opp && cm === co) { render(); return later(nextStreet); }
    turn = o; render(); if (turn === 'opp') later(ai);
  }
  function ai() {
    if (phase !== 'play' || turn !== 'opp') return;
    const eq = equity(th, board), c = toCall('opp'), canRaise = raises < 3 && opp > c && bank > 0, r = Math.random();
    const max = Math.min(opp - c, bank), size = f => Math.max(Math.min(lastRaise, max), Math.min(max, Math.round((pot + c) * f / 10) * 10));
    if (c > 0) {
      const odds = c / (pot + c);
      if (canRaise && (eq > 0.74 && r < 0.65 || (eq < 0.35 && r < 0.06))) return did('opp', 'raise', size(0.8));
      if (eq > odds + 0.05 || (c <= BB && eq > 0.3)) return did('opp', 'call');
      return did('opp', 'fold');
    }
    if (canRaise && (eq > 0.62 && r < 0.8 || eq > 0.5 && r < 0.35 || r < 0.14)) return did('opp', 'raise', size(eq > 0.62 ? 0.66 : 0.5));
    did('opp', 'call');
  }
  function act(a) {
    if (a === 'deal' && phase !== 'play') return deal();
    if (phase !== 'play' || turn !== 'me') return;
    const c = toCall('me');
    if (a === 'fold') did('me', 'fold'); else if (a === 'call') did('me', 'call');
    else if (a.startsWith('r')) {                            // you can never bet more than the other player could call
      const max = Math.min(bank - c, opp); if (max <= 0) return did('me', 'call');
      const want = a === 'rall' ? max : Math.round((pot + c) * (a === 'rhalf' ? 0.5 : 1) / 10) * 10;
      did('me', 'raise', Math.max(Math.min(lastRaise, max), Math.min(want, max)));
    }
  }
  function render() {
    const c = phase === 'play' ? toCall('me') : 0, my = phase === 'play' && turn === 'me', canRaise = my && bank > c && opp > 0 && raises < 4 && Math.min(bank - c, opp) > 0;
    const hn = me && board && board.length >= 3 ? HAND[evalHand(me.concat(board)).cat] : '';
    el.innerHTML = `<div class="cz"><h2>Texas Hold’em</h2><p>Your chips: <span class="bank">${money(bank)}</span></p>
      <div class="felt"><div class="who lbl"><span>The Shark${btn === 'opp' && phase !== 'idle' ? ' · button' : ''}</span><span>${money(opp)} chips${phase === 'play' && co ? ` · in for ${money(co)}` : ''}</span></div>
      <div class="hand">${phase === 'idle' ? '' : th.map(x => cardHtml(x, !show)).join('')}</div>
      <div class="lbl" style="margin-top:10px">Board <span class="pot">${phase === 'idle' ? '' : `· Pot ${money(pot)}`}</span></div><div class="hand">${phase === 'idle' ? '' : [0, 1, 2, 3, 4].map(i => (board[i] ? cardHtml(board[i]) : '<span class="cd back dim"></span>')).join('')}</div>
      <div class="who lbl" style="margin-top:10px"><span>You${btn === 'me' && phase !== 'idle' ? ' · button' : ''}${hn ? ` · ${hn}` : ''}</span><span>${phase === 'play' && cm ? `in for ${money(cm)}` : ''}</span></div><div class="hand">${phase === 'idle' ? '' : me.map(x => cardHtml(x)).join('')}</div></div>
      <div class="msg ${cls}">${msg}</div>
      <div class="row">${phase !== 'play' ? `<button class="btn small" data-a="deal">${phase === 'idle' ? 'Deal me in' : 'Next hand'}</button>`
        : my ? `<button class="btn ghost small" data-a="fold"${c ? '' : ' disabled'}>Fold</button><button class="btn small" data-a="call">${c ? `Call ${money(Math.min(c, bank))}` : 'Check'}</button>${canRaise ? `<button class="btn ghost small" data-a="rhalf">${c ? 'Raise' : 'Bet'} ½ pot</button><button class="btn ghost small" data-a="rpot">${c ? 'Raise' : 'Bet'} pot</button><button class="btn ghost small" data-a="rall">All in</button>` : ''}`
        : '<span style="color:var(--dim)">The Shark is thinking…</span>'}</div>
      <details><summary>How to play</summary><ul><li>You and the Shark each get two cards. Five shared cards come out in three rounds: the flop, the turn and the river.</li><li>The best five-card hand from your two plus the board wins the pot. From weakest to strongest: high card, pair, two pair, three of a kind, straight, flush, full house, four of a kind, straight flush.</li><li>On your turn you can fold, check or call, or bet. The blinds are 10 and 20, and the button swaps every hand.</li></ul></details></div>`;
  }
  el.onclick = e => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) act(b.dataset.a); };
  render();
}

// Open one of the tables inside an element. Returns a function that stops any pending timers.
export function openGame(kind, el) {
  css(); let alive = true; const live = () => alive && el.isConnected;
  (kind === 'blackjack' ? blackjack : kind === 'roulette' ? roulette : holdem)(el, live);
  return () => { alive = false; el.onclick = null; };
}
