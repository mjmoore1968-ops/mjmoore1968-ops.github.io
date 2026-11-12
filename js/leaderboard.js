// Leaderboard. Global scores use a free Supabase project (REST API).
// Until the two values below are filled in, scores are kept on this device only.
export const CONFIG = {
  supabaseUrl: 'https://fdrsfxkzxhqftccibpbd.supabase.co',
  supabaseKey: 'sb_publishable_KDwn6qN_w1O6oF0uFImD8w_wzC9-1T5',   // public key: safe in browser code, limited by row-level security
};

// lowerIsBetter: parkour is a time trial
export const GAMES = {
  lacrosse: { title: 'Lacrosse Range', lower: false, fmt: s => `${s} pts` },
  rocket:   { title: 'Booster Landing', lower: false, fmt: s => `${s} pts` },
  parkour:  { title: 'Market Parkour', lower: true,  fmt: s => `${(s / 1000).toFixed(2)}s` },
  golf:     { title: 'Story St. Golf Club', lower: true, fmt: s => `${s} strokes` },
};

export const isGlobal = () => !!(CONFIG.supabaseUrl && CONFIG.supabaseKey);
// publishable keys go in the apikey header only; legacy JWT anon keys also need a Bearer header
const authHeaders = () => (CONFIG.supabaseKey.startsWith('sb_') ? { apikey: CONFIG.supabaseKey } : { apikey: CONFIG.supabaseKey, Authorization: `Bearer ${CONFIG.supabaseKey}` });

const BLOCK = ['fuck','shit','bitch','cunt','nigg','fag','dick','cock','pussy','whore','slut','rape','nazi','hitler','penis','vagina','asshole','bastard','retard','kike','spic','chink','twat','wank','porn','sex'];
const LEET = { '0':'o','1':'i','3':'e','4':'a','5':'s','7':'t','8':'b','@':'a','$':'s','!':'i' };

export function cleanName(raw) {
  let n = String(raw || '').replace(/[^A-Za-z0-9 _\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
  if (!n) return 'Guest';
  const flat = n.toLowerCase().replace(/[013457 8@$!_\-]/g, c => LEET[c] ?? '').replace(/(.)\1+/g, '$1');
  const flat2 = n.toLowerCase().replace(/[^a-z]/g, '');
  if (BLOCK.some(w => flat.includes(w) || flat2.includes(w))) return 'Guest';
  return n;
}

const lsKey = g => `mmjr.scores.${g}`;
function localAll(game) {
  try { return JSON.parse(localStorage.getItem(lsKey(game)) || '[]'); } catch { return []; }
}
function sortScores(game, rows) {
  const lower = GAMES[game].lower;
  return rows.sort((a, b) => lower ? a.score - b.score : b.score - a.score);
}

export async function top(game, n = 5) {
  if (isGlobal()) {
    try {
      const order = GAMES[game].lower ? 'score.asc' : 'score.desc';
      const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/scores?select=name,score&game=eq.${game}&order=${order}&limit=${n}`, {
        headers: authHeaders(),
      });
      if (r.ok) return await r.json();
    } catch { /* fall through to local */ }
  }
  return sortScores(game, localAll(game)).slice(0, n);
}

export async function submit(game, name, score) {
  const row = { game, name: cleanName(name), score: Math.round(score) };
  try {
    const all = localAll(game); all.push({ name: row.name, score: row.score });
    localStorage.setItem(lsKey(game), JSON.stringify(sortScores(game, all).slice(0, 20)));
  } catch { /* storage unavailable */ }
  if (isGlobal()) {
    try {
      const r = await fetch(`${CONFIG.supabaseUrl}/rest/v1/scores`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      });
      return r.ok;
    } catch { return false; }
  }
  return true;
}
