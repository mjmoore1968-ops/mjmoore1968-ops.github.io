import * as THREE from '../vendor/three.module.min.js';
import { createLacrosse, createRocket, createParkour, makeLacrosseStick, VEHICLES } from './games.js';
import * as LB from './leaderboard.js';
import { createGolf } from './golf.js';

const LINKS = {
  email: 'mmoore@college.harvard.edu',
  linkedin: 'https://www.linkedin.com/in/matthew-moore-b4b3ba327',
  instagram: 'https://www.instagram.com/matthew.moore04/',
};

const $ = id => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const TOUCH = Q.has('touch') || (matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches);
const FREE = TOUCH || TEST;           // no pointer lock in these modes
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ renderer */
const canvas = $('c');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('hud').classList.add('hidden'); $('lite').classList.remove('hidden');
  $('liteNote').textContent = 'Your browser could not start the 3D view, so here are the links.';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, TOUCH ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d14);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
scene.add(new THREE.HemisphereLight(0xfff3df, 0x4a4038, 1.2));
scene.add(new THREE.AmbientLight(0xffffff, 0.34));
// One soft "daylight" that casts shadows across both rooms. Walls and ceilings receive shadows but do not cast
// them, so the light reads as coming through the windows and furniture gets grounded contact shadows.
// (Phones skip the shadow pass to stay smooth.)
renderer.shadowMap.enabled = !TOUCH; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
{ const sunIn = new THREE.DirectionalLight(0xfff1dc, 1.15); sunIn.position.set(4.5, 11, 3.2); sunIn.target.position.set(7, 0, 0);
  sunIn.castShadow = !TOUCH; const sc = sunIn.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 30;
  sunIn.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048); sunIn.shadow.bias = -0.0004; sunIn.shadow.normalBias = 0.03; sunIn.shadow.radius = 3;
  scene.add(sunIn, sunIn.target); }

/* ------------------------------------------------------------------ builders */
let MX = x => x, MZ = z => z;                 // position mapping for anything added straight to the scene
const mx = (p, x) => (p === scene ? MX(x) : x), mz = (p, z) => (p === scene ? MZ(z) : z);
const mats = new Map();
const mat = (color, o = {}) => {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, ...o }));
  return mats.get(k);
};
const colliders = [];
const col = (cx, cz, w, d) => { cx = MX(cx); cz = MZ(cz); const c = { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }; colliders.push(c); return c; };

function box(parent, w, h, d, color, x, y, z, o) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'object' ? color : mat(color, o));
  m.position.set(mx(parent, x), y, mz(parent, z)); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function cyl(parent, rt, rb, h, color, x, y, z, seg = 16, o) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'object' ? color : mat(color, o));
  m.position.set(mx(parent, x), y, mz(parent, z)); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function sph(parent, r, color, x, y, z, o) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(color, o));
  m.position.set(mx(parent, x), y, mz(parent, z)); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function plane(parent, w, h, texture, x, y, z, ry = 0, basic = true) {
  const M = basic ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new M({ map: texture, transparent: true }));
  m.position.set(mx(parent, x), y, mz(parent, z)); m.rotation.y = ry; parent.add(m); return m;
}
function group(x, y, z, parent = scene) { const g = new THREE.Group(); g.position.set(mx(parent, x), y, mz(parent, z)); parent.add(g); return g; }

const interactables = [];
function interact(g, label, fn) { g.userData.interact = { label, fn }; interactables.push(g); }

// skip: 'px' or 'nx' leaves that wall out (the shared wall with the doorway is built by hand)
// wood plank floor, drawn once per room and tiled
function woodFloor(w, d, base) {
  const t = tex(512, 512, (c, W, H) => {
    const r = (() => { let a = 99; return () => (a = (a * 16807) % 2147483647) / 2147483647; })();
    c.fillStyle = base; c.fillRect(0, 0, W, H);
    for (let row = 0; row < 8; row++) {
      const y = row * 64; let x = -r() * 200;
      while (x < W) { const len = 150 + r() * 190, v = Math.round((r() - 0.5) * 34); c.fillStyle = v > 0 ? `rgba(255,236,200,${v / 220})` : `rgba(40,20,5,${-v / 170})`; c.fillRect(x, y, len, 64);
        c.strokeStyle = 'rgba(60,35,15,.16)'; c.lineWidth = 1; for (let g = 0; g < 4; g++) { const gy = y + 8 + r() * 48; c.beginPath(); c.moveTo(x + 4, gy); c.bezierCurveTo(x + len * 0.3, gy + r() * 5 - 2.5, x + len * 0.7, gy + r() * 5 - 2.5, x + len - 4, gy); c.stroke(); }
        c.fillStyle = 'rgba(30,16,6,.55)'; c.fillRect(x + len - 1.5, y, 2, 64); x += len; }
      c.fillStyle = 'rgba(30,16,6,.5)'; c.fillRect(0, y, W, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(w / 1.5, d / 1.5); t.anisotropy = 8;
  return new THREE.MeshLambertMaterial({ map: t });
}
const noCast = m => { m.castShadow = false; return m; };
// skip: 'px' or 'nx' leaves that wall out (the shared wall with the doorway is built by hand)
function room(cx, cz, w, d, h, floorC, wallC, ceilC, skip) {
  noCast(box(scene, w, 0.2, d, floorC, cx, -0.1, cz));
  noCast(box(scene, w, 0.2, d, ceilC, cx, h + 0.1, cz));
  noCast(box(scene, w, h, 0.2, wallC, cx, h / 2, cz - d / 2 - 0.1)); col(cx, cz - d / 2 - 0.1, w + 1, 0.2);
  noCast(box(scene, w, h, 0.2, wallC, cx, h / 2, cz + d / 2 + 0.1)); col(cx, cz + d / 2 + 0.1, w + 1, 0.2);
  for (const [s, key] of [[-1, 'nx'], [1, 'px']]) {
    if (skip === key) continue;
    noCast(box(scene, 0.2, h, d, wallC, cx + s * (w / 2 + 0.1), h / 2, cz)); col(cx + s * (w / 2 + 0.1), cz, 0.2, d + 1);
    noCast(box(scene, 0.03, 0.1, d, 0xf5f1e8, cx + s * (w / 2 - 0.015), 0.05, cz));
  }
  for (const s of [-1, 1]) noCast(box(scene, w, 0.1, 0.03, 0xf5f1e8, cx, 0.05, cz + s * (d / 2 - 0.015)));
  // crown molding
  for (const s of [-1, 1]) { noCast(box(scene, w, 0.09, 0.07, 0xf8f5ee, cx, h - 0.045, cz + s * (d / 2 - 0.035))); noCast(box(scene, 0.07, 0.09, d, 0xf8f5ee, cx + s * (w / 2 - 0.035), h - 0.045, cz)); }
}
// small decor helpers
function frameArt(parent, x, y, z, ry, w, h, seed, frameC = 0x1f1f22) {
  const g = group(x, y, z, parent); g.rotation.y = ry;
  noCast(box(g, w + 0.07, h + 0.07, 0.03, frameC, 0, 0, 0)); noCast(box(g, w + 0.01, h + 0.01, 0.012, 0xfaf7f0, 0, 0, 0.012));
  const pal = [['#e76f51', '#264653', '#e9c46a'], ['#2a9d8f', '#f4a261', '#1d3557'], ['#9b1c2c', '#f1e3c6', '#22333b'], ['#3d5a80', '#ee6c4d', '#e0fbfc'], ['#606c38', '#dda15e', '#283618']][seed % 5];
  const t = tex(200, Math.round(200 * h / w), (c, W, H) => {
    c.fillStyle = '#f6f1e6'; c.fillRect(0, 0, W, H);
    if (seed % 3 === 0) { c.fillStyle = pal[0]; c.beginPath(); c.arc(W * 0.42, H * 0.42, W * 0.26, 0, 7); c.fill(); c.fillStyle = pal[1]; c.fillRect(W * 0.5, H * 0.5, W * 0.34, H * 0.34); c.fillStyle = pal[2]; c.fillRect(W * 0.14, H * 0.78, W * 0.6, H * 0.06); }
    else if (seed % 3 === 1) { for (let i = 0; i < 5; i++) { c.fillStyle = pal[i % 3]; c.beginPath(); c.moveTo(0, H * (0.35 + i * 0.13)); c.bezierCurveTo(W * 0.3, H * (0.2 + i * 0.13), W * 0.7, H * (0.5 + i * 0.13), W, H * (0.3 + i * 0.13)); c.lineTo(W, H); c.lineTo(0, H); c.fill(); } c.fillStyle = pal[2]; c.beginPath(); c.arc(W * 0.72, H * 0.2, W * 0.1, 0, 7); c.fill(); }
    else { c.strokeStyle = pal[1]; c.lineWidth = 5; for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(W / 2, H * 0.95, W * (0.12 + i * 0.11), Math.PI, 0); c.stroke(); } c.fillStyle = pal[0]; c.fillRect(W * 0.12, H * 0.1, W * 0.2, H * 0.2); }
  });
  plane(g, w * 0.86, h * 0.86, t, 0, 0, 0.02, 0, false);
  return g;
}
function rugTex(a, b, c3) {
  const t = tex(512, 512, (c, W, H) => {
    c.fillStyle = a; c.fillRect(0, 0, W, H); c.strokeStyle = b; c.lineWidth = 14; c.strokeRect(26, 26, W - 52, H - 52); c.lineWidth = 4; c.strokeRect(54, 54, W - 108, H - 108);
    c.fillStyle = c3; for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { const x = 112 + i * 72, y = 112 + j * 72; c.beginPath(); c.moveTo(x, y - 22); c.lineTo(x + 22, y); c.lineTo(x, y + 22); c.lineTo(x - 22, y); c.fill(); }
    c.fillStyle = b; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(148 + i * 72, 148 + j * 72, 5, 0, 7); c.fill(); }
    for (let i = 0; i < 2600; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; c.fillRect((i * 7919) % W, (i * 104729) % H, 2, 2); }
  });
  return new THREE.MeshLambertMaterial({ map: t });
}
function curtains(x, y, z, ry, w, h) {            // rod and two fabric panels for a window centred at x,y,z
  const g = group(x, y, z); g.rotation.y = ry;
  cyl(g, 0.018, 0.018, w + 1.0, 0x2a2a2a, 0, h / 2 + 0.22, 0.1, 8).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) { sph(g, 0.035, 0x2a2a2a, s * (w / 2 + 0.5), h / 2 + 0.22, 0.1);
    for (let i = 0; i < 4; i++) noCast(box(g, 0.1, h + 0.75, 0.05, i % 2 ? 0xe9dfcd : 0xdccfb8, s * (w / 2 + 0.1 + i * 0.09), -0.16, 0.1 + (i % 2) * 0.02)); }
}
function lamp(x, y, z, intensity = 14, color = 0xffd9a0) {
  const l = new THREE.PointLight(color, intensity, 16, 1.6); l.position.set(MX(x), y, MZ(z)); scene.add(l); return l;
}
function plant(x, z) {
  cyl(scene, 0.2, 0.15, 0.36, 0xb5653a, x, 0.18, z);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05, m = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.85, 6), mat(i % 2 ? 0x2f7d4f : 0x3c9460));
    m.position.set(MX(x) + Math.cos(a) * 0.12, 0.75, MZ(z) + Math.sin(a) * 0.12);
    m.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); scene.add(m);
  }
  col(x, z, 0.45, 0.45);
}
// The view outside: a Cambridge-style riverfront. Brick houses, a white cupola tower, an arched footbridge.
const cambridge = tex(768, 512, (c, W, H) => {
  const sky = c.createLinearGradient(0, 0, 0, H * 0.7); sky.addColorStop(0, '#7fb6ea'); sky.addColorStop(1, '#f6e3c4');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(255,255,255,.85)'; [[120, 70, 60], [170, 82, 44], [520, 54, 54], [575, 66, 40]].forEach(([x, y, r]) => { c.beginPath(); c.ellipse(x, y, r, r * 0.38, 0, 0, 7); c.fill(); });
  const horizon = 330;
  // autumn tree line
  const leaf = ['#c8642c', '#d9952e', '#8f3b22', '#5f7d3a', '#e0b23c'];
  for (let i = 0; i < 40; i++) { c.fillStyle = leaf[i % leaf.length]; c.beginPath(); c.arc(i * 20 + (i % 3) * 5, horizon - 30 - (i * 13 % 26), 24 + (i * 7 % 14), 0, 7); c.fill(); }
  const brick = (x, w, h, roof = 26) => {
    c.fillStyle = '#9a4634'; c.fillRect(x, horizon - h, w, h);
    c.fillStyle = '#4a4f58'; c.beginPath(); c.moveTo(x - 6, horizon - h); c.lineTo(x + 14, horizon - h - roof); c.lineTo(x + w - 14, horizon - h - roof); c.lineTo(x + w + 6, horizon - h); c.fill();
    c.fillStyle = '#7d3729'; for (let k = 0; k < Math.floor(w / 70); k++) c.fillRect(x + 28 + k * 70, horizon - h - roof - 16, 12, 20);     // chimneys
    c.fillStyle = '#f6f1e6'; const cols = Math.floor(w / 26), rows = Math.floor(h / 30);
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) c.fillRect(x + 10 + k * 26, horizon - h + 10 + r * 30, 11, 17);
    c.fillStyle = '#f6f1e6'; c.fillRect(x, horizon - h - 3, w, 4);
  };
  brick(20, 230, 120); brick(520, 240, 105); brick(270, 100, 90, 18);
  // tower with white cupola and a blue dome
  const tx = 400;
  c.fillStyle = '#9a4634'; c.fillRect(tx - 34, horizon - 190, 68, 190);
  c.fillStyle = '#f6f1e6'; c.fillRect(tx - 38, horizon - 196, 76, 8);
  for (let r = 0; r < 4; r++) c.fillRect(tx - 8, horizon - 170 + r * 40, 16, 24);
  c.fillRect(tx - 26, horizon - 250, 52, 56); c.fillStyle = '#3a4b63'; c.fillRect(tx - 14, horizon - 240, 10, 36); c.fillRect(tx + 4, horizon - 240, 10, 36);
  c.fillStyle = '#f6f1e6'; c.fillRect(tx - 30, horizon - 256, 60, 7); c.fillRect(tx - 17, horizon - 288, 34, 34);
  c.fillStyle = '#2f5f9a'; c.beginPath(); c.arc(tx, horizon - 288, 19, Math.PI, 0); c.fill();
  c.fillStyle = '#d9b34a'; c.fillRect(tx - 2, horizon - 330, 4, 26); c.beginPath(); c.arc(tx, horizon - 332, 5, 0, 7); c.fill();
  // river bank, river, bridge
  c.fillStyle = '#5c8a48'; c.fillRect(0, horizon, W, 26);
  const river = c.createLinearGradient(0, horizon + 26, 0, H); river.addColorStop(0, '#6f9fc4'); river.addColorStop(1, '#3f6f99');
  c.fillStyle = river; c.fillRect(0, horizon + 26, W, H - horizon - 26);
  c.fillStyle = 'rgba(255,255,255,.22)'; for (let i = 0; i < 26; i++) c.fillRect((i * 97) % W, horizon + 44 + (i * 31) % 120, 40 + (i * 7) % 40, 2);
  c.fillStyle = '#a5503a'; c.fillRect(0, horizon + 2, W, 22);
  c.fillStyle = '#f6f1e6'; c.fillRect(0, horizon - 2, W, 5);
  c.fillStyle = '#a5503a'; c.fillRect(0, horizon + 24, W, 50);
  c.fillStyle = '#6f9fc4'; for (const ax of [130, 384, 638]) { c.beginPath(); c.ellipse(ax, horizon + 76, 105, 46, 0, Math.PI, 0); c.fill(); }
  // a rowing shell
  c.strokeStyle = '#f6f1e6'; c.lineWidth = 3; c.beginPath(); c.moveTo(430, horizon + 132); c.lineTo(600, horizon + 132); c.stroke();
  c.fillStyle = '#22252b'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(462 + i * 36, horizon + 126, 5, 0, 7); c.fill(); }
});
function windowPane(x, y, z, ry, w = 1.6, h = 1.2) {
  const g = group(x, y, z); g.rotation.y = ry;
  plane(g, w, h, cambridge, 0, 0, 0.02);
  box(g, w + 0.14, 0.07, 0.06, 0xf5f1e8, 0, h / 2, 0.03); box(g, w + 0.14, 0.07, 0.06, 0xf5f1e8, 0, -h / 2, 0.03);
  box(g, 0.07, h, 0.06, 0xf5f1e8, -w / 2, 0, 0.03); box(g, 0.07, h, 0.06, 0xf5f1e8, w / 2, 0, 0.03);
  box(g, 0.04, h, 0.05, 0xf5f1e8, 0, 0, 0.03); box(g, w, 0.04, 0.05, 0xf5f1e8, 0, 0, 0.03);
  box(g, w + 0.3, 0.05, 0.16, 0xf5f1e8, 0, -h / 2 - 0.04, 0.08);
}
// text that always fits its sign
function fitText(c, text, maxW, size, font) {
  do { c.font = `bold ${size}px ${font}`; size -= 4; } while (c.measureText(text).width > maxW && size > 12);
}
function sign(text, w, h, bg, fg, font = 'Georgia, serif', border = true) {
  return tex(1024, Math.round(1024 * h / w), (c, W, H) => {
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    if (border) { c.strokeStyle = fg; c.lineWidth = 10; c.strokeRect(14, 14, W - 28, H - 28); }
    c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
    fitText(c, text, W * 0.84, Math.round(H * 0.62), font); c.fillText(text, W / 2, H / 2 + 4);
  });
}

/* ------------------------------------------------------------------ bedroom  (x -3.5..3.5, z -3..3) */
const BED = { lie: new THREE.Vector3(-2.5, 0.78, -2.25), stand: new THREE.Vector3(-1.15, 1.62, -1.1) };
const DOOR = { z0: 0.75, z1: 1.85, x: 3.6, open: false, t: 0, group: null, col: null };
(function bedroom() {
  room(0, 0, 7, 6, 2.8, woodFloor(7, 6, '#b0845a'), 0xdcd8cd, 0xf5f2ec, 'px');
  noCast(box(scene, 7, 2.71, 0.02, 0x2f4a5a, 0, 1.355, -2.99));                          // deep teal accent wall behind the bed
  // pendant light
  lamp(0, 1.9, 0, 8);
  cyl(scene, 0.008, 0.008, 0.45, 0x222222, 0, 2.57, 0, 6); noCast(cyl(scene, 0.3, 0.36, 0.26, 0xf2e8d5, 0, 2.24, 0, 24, { emissive: 0xffe6b0, emissiveIntensity: 0.75 }));
  // bed (head against the -z wall)
  box(scene, 1.74, 0.26, 2.24, 0x4a3626, -2.5, 0.17, -1.85);
  for (const [dx, dz] of [[-.8, -1.05], [.8, -1.05], [-.8, 1.05], [.8, 1.05]]) box(scene, 0.07, 0.08, 0.07, 0x2c2018, -2.5 + dx, 0.04, -1.85 + dz);
  box(scene, 1.62, 0.22, 2.12, 0xf4f1ea, -2.5, 0.41, -1.85);                            // mattress
  box(scene, 1.7, 0.13, 1.56, 0xe6e0d2, -2.5, 0.565, -1.5);                             // duvet
  box(scene, 1.7, 0.15, 0.26, 0xfbfaf6, -2.5, 0.58, -2.2);                              // folded-back sheet
  box(scene, 1.74, 0.05, 0.52, 0xd9a441, -2.5, 0.655, -1.02);                           // throw blanket
  for (const sx of [-1, 1]) box(scene, 0.03, 0.3, 0.52, 0xd9a441, -2.5 + sx * 0.87, 0.5, -1.02);
  box(scene, 1.8, 1.2, 0.12, 0x8c7b6b, -2.5, 0.75, -2.92);                              // upholstered headboard
  for (const dx of [-0.45, 0, 0.45]) noCast(box(scene, 0.012, 0.9, 0.01, 0x75665a, -2.5 + dx, 0.85, -2.856));
  for (const dx of [-0.4, 0.4]) { const p = box(scene, 0.66, 0.16, 0.42, 0xffffff, -2.5 + dx, 0.66, -2.56); p.rotation.x = -0.25; }
  { const a = box(scene, 0.42, 0.34, 0.12, 0x2f4a5a, -2.72, 0.76, -2.34); a.rotation.x = -0.4; const b = box(scene, 0.4, 0.3, 0.12, 0xb8573a, -2.26, 0.74, -2.3); b.rotation.x = -0.45; b.rotation.y = 0.2; }
  col(-2.5, -1.85, 1.7, 2.2);
  for (let i = 0; i < 3; i++) frameArt(scene, -3.08 + i * 0.58, 2.02, -2.975, 0, 0.42, 0.56, i + 1, 0xd9b34a);
  // nightstand, lamp, books, clock
  box(scene, 0.5, 0.5, 0.45, 0x6b4a2f, -1.35, 0.25, -2.72); col(-1.35, -2.72, 0.5, 0.45);
  noCast(box(scene, 0.42, 0.16, 0.01, 0x7d5a3c, -1.35, 0.33, -2.492)); sph(scene, 0.018, 0xd9b34a, -1.35, 0.33, -2.48);
  cyl(scene, 0.05, 0.08, 0.22, 0x333333, -1.4, 0.61, -2.76);
  noCast(cyl(scene, 0.1, 0.16, 0.2, 0xfff0cc, -1.4, 0.8, -2.76, 16, { emissive: 0xffd68a, emissiveIntensity: 0.9 }));
  lamp(-1.35, 1.0, -2.5, 4);
  [0x264653, 0xe76f51, 0xe9c46a].forEach((c, i) => box(scene, 0.2 - i * 0.015, 0.03, 0.14, c, -1.2, 0.515 + i * 0.03, -2.6));
  box(scene, 0.13, 0.07, 0.05, 0x15171c, -1.5, 0.535, -2.56); noCast(box(scene, 0.09, 0.03, 0.005, 0x7cf0a8, -1.5, 0.537, -2.533, { emissive: 0x39d98a }));
  // dresser, with a round mirror and a few things on top
  box(scene, 1.7, 0.95, 0.5, 0x6b4a2f, 1.4, 0.475, -2.7); col(1.4, -2.7, 1.7, 0.5);
  for (let i = 0; i < 3; i++) for (const s of [-0.42, 0.42]) { noCast(box(scene, 0.72, 0.24, 0.02, 0x7d5a3c, 1.4 + s, 0.2 + i * 0.29, -2.44)); sph(scene, 0.02, 0xd9b34a, 1.4 + s, 0.2 + i * 0.29, -2.425); }
  noCast(cyl(scene, 0.44, 0.44, 0.03, 0xd9b34a, 1.4, 1.78, -2.975, 40)).rotation.x = Math.PI / 2;
  noCast(cyl(scene, 0.4, 0.4, 0.032, 0xcfe1ea, 1.4, 1.78, -2.972, 40, { emissive: 0x4a6170 })).rotation.x = Math.PI / 2;
  box(scene, 0.34, 0.02, 0.22, 0xd9b34a, 1.0, 0.96, -2.68); cyl(scene, 0.03, 0.03, 0.1, 0x3d5a80, 0.93, 1.02, -2.68, 10); cyl(scene, 0.025, 0.025, 0.07, 0xb8573a, 1.05, 1.005, -2.7, 10);
  cyl(scene, 0.07, 0.055, 0.1, 0xf4f1ea, 1.95, 1.0, -2.72, 12); sph(scene, 0.1, 0x3c9460, 1.95, 1.13, -2.72);
  { const f = box(scene, 0.16, 0.2, 0.02, 0x1f1f22, 1.5, 1.05, -2.78); f.rotation.x = -0.18; }
  // rug
  box(scene, 2.7, 0.02, 1.9, rugTex('#d8cdb8', '#2f4a5a', '#b8573a'), 0.2, 0.012, 0.4);
  // window with curtains
  windowPane(-0.8, 1.55, 2.98, Math.PI); curtains(-0.8, 1.55, 2.98, Math.PI, 1.6, 1.2);
  // wall art and a pennant on the -x wall
  noCast(box(scene, 0.03, 0.9, 0.7, 0x24344d, -3.48, 1.6, 0.8)); noCast(box(scene, 0.035, 0.74, 0.54, 0xe9c46a, -3.47, 1.6, 0.8));
  plane(scene, 0.95, 0.42, tex(380, 168, (c, W, H) => { c.fillStyle = '#9b1c2c'; c.beginPath(); c.moveTo(0, 0); c.lineTo(W, H / 2); c.lineTo(0, H); c.fill(); c.fillStyle = '#f6efe0'; c.fillRect(0, 0, 16, H); c.font = 'bold 74px Georgia, serif'; c.textBaseline = 'middle'; c.fillText('LAX', 34, H / 2 + 4); }), -3.485, 2.15, -0.75, Math.PI / 2, false);
  plant(-3.0, 2.5);
  // desk along the +x wall: laptop, lamp, mug, chair, and a shelf above
  box(scene, 0.6, 0.04, 1.3, 0x6b4a2f, 3.18, 0.74, -1.3); col(3.18, -1.3, 0.62, 1.32);
  for (const [dx, dz] of [[-.26, -.6], [.26, -.6], [-.26, .6], [.26, .6]]) box(scene, 0.045, 0.72, 0.045, 0x2c2018, 3.18 + dx, 0.36, -1.3 + dz);
  box(scene, 0.5, 0.36, 0.36, 0x7d5a3c, 3.2, 0.54, -1.74); sph(scene, 0.018, 0xd9b34a, 2.945, 0.54, -1.74);
  box(scene, 0.23, 0.014, 0.33, 0xb9bcc4, 3.12, 0.767, -1.2); { const sc = box(scene, 0.012, 0.22, 0.33, 0xb9bcc4, 3.25, 0.87, -1.2); sc.rotation.z = -0.2; const gl = noCast(box(scene, 0.004, 0.19, 0.3, 0x9fc4ff, 3.241, 0.872, -1.2, { emissive: 0x6f9be8 })); gl.rotation.z = -0.2; }
  cyl(scene, 0.07, 0.08, 0.02, 0x222222, 3.3, 0.77, -1.82, 14); { const arm = cyl(scene, 0.01, 0.01, 0.42, 0x222222, 3.25, 0.96, -1.8, 6); arm.rotation.z = 0.3; } noCast(cyl(scene, 0.05, 0.1, 0.12, 0x222222, 3.16, 1.15, -1.76, 14, { emissive: 0x554422 }));
  cyl(scene, 0.04, 0.035, 0.09, 0xf4f1ea, 3.05, 0.805, -0.82, 12); [0x2a9d8f, 0xe9c46a].forEach((c, i) => box(scene, 0.2, 0.03, 0.15, c, 3.28, 0.775 + i * 0.03, -0.85));
  box(scene, 0.44, 0.05, 0.44, 0x2f4a5a, 2.55, 0.46, -1.25); box(scene, 0.05, 0.5, 0.44, 0x2f4a5a, 2.35, 0.74, -1.25);
  for (const [dx, dz] of [[-.18, -.18], [.18, -.18], [-.18, .18], [.18, .18]]) box(scene, 0.035, 0.44, 0.035, 0x222222, 2.55 + dx, 0.22, -1.25 + dz);
  col(2.5, -1.25, 0.5, 0.5);
  box(scene, 0.22, 0.03, 1.15, 0x6b4a2f, 3.385, 1.6, -1.3);
  [0xd64545, 0x264653, 0xe9c46a, 0x2a9d8f, 0x6d597a].forEach((c, i) => box(scene, 0.15, 0.2 + (i % 3) * 0.025, 0.045, c, 3.39, 1.72 + (i % 3) * 0.012, -1.78 + i * 0.055));
  cyl(scene, 0.035, 0.05, 0.03, 0xd9b34a, 3.39, 1.63, -1.05, 12); cyl(scene, 0.012, 0.012, 0.06, 0xd9b34a, 3.39, 1.67, -1.05, 8); cyl(scene, 0.05, 0.025, 0.1, 0xd9b34a, 3.39, 1.75, -1.05, 14);   // a small trophy
  sph(scene, 0.032, 0xfffb8a, 3.39, 1.647, -0.86);                                       // lacrosse ball
  // hamper and sneakers by the door
  cyl(scene, 0.22, 0.19, 0.5, 0xc9a877, 3.1, 0.25, 2.55, 16); col(3.1, 2.55, 0.46, 0.46);
  for (const dz of [0.34, 0.5]) { box(scene, 0.26, 0.08, 0.1, 0xf4f1ea, 3.22, 0.04, dz); noCast(box(scene, 0.12, 0.02, 0.102, 0x9b1c2c, 3.2, 0.06, dz)); }
})();

/* ------------------------------------------------------------------ shared wall with the doorway (x = 3.5..3.7) */
(function sharedWall() {
  const { z0, z1, x } = DOOR, DH = 2.1;
  const seg = (xc, zA, zB, yA, yB, color) => noCast(box(scene, 0.1, yB - yA, zB - zA, color, xc, (yA + yB) / 2, (zA + zB) / 2));
  // bedroom face
  seg(x - 0.05, -3, z0, 0, 2.8, 0xcbd3cf); seg(x - 0.05, z1, 3, 0, 2.8, 0xcbd3cf); seg(x - 0.05, z0, z1, DH, 2.8, 0xcbd3cf);
  // living-room face
  seg(x + 0.05, -5, z0, 0, 3.2, 0xe7e0d3); seg(x + 0.05, z1, 5, 0, 3.2, 0xe7e0d3); seg(x + 0.05, z0, z1, DH, 3.2, 0xe7e0d3);
  col(x, (-6.5 + z0) / 2, 0.2, z0 + 6.5); col(x, (z1 + 6.5) / 2, 0.2, 6.5 - z1);
  box(scene, 0.22, 0.03, z1 - z0, 0x5d4632, x, 0.0, (z0 + z1) / 2);                       // threshold
  // trim on both faces
  for (const s of [-1, 1]) {
    box(scene, 0.03, DH + 0.08, 0.09, 0xf5f1e8, x + s * 0.11, (DH + 0.08) / 2, z0 - 0.045); box(scene, 0.03, DH + 0.08, 0.09, 0xf5f1e8, x + s * 0.11, (DH + 0.08) / 2, z1 + 0.045);
    box(scene, 0.03, 0.09, z1 - z0 + 0.18, 0xf5f1e8, x + s * 0.11, DH + 0.045, (z0 + z1) / 2);
  }
  box(scene, 0.03, 0.1, 6, 0xf5f1e8, 3.485, 0.05, -3 + (z0 + 3) / 2 - 0).scale.z = (z0 + 3) / 6;
  plane(scene, 0.9, 0.2, sign('LIVING ROOM  →', 0.9, 0.2, '#f5f1e8', '#3a3024', 'Georgia, serif', false), x - 0.105, 2.36, (z0 + z1) / 2, -Math.PI / 2);
  plane(scene, 0.7, 0.2, sign('BEDROOM', 0.7, 0.2, '#f5f1e8', '#3a3024', 'Georgia, serif', false), x + 0.105, 2.36, (z0 + z1) / 2, Math.PI / 2);
  // the door, hinged at z0; closed it fills the opening, open it swings into the living room
  const d = group(x, 0, z0); const W = z1 - z0;
  box(d, 0.06, DH - 0.02, W - 0.02, 0x6b4a2f, 0, DH / 2, W / 2);
  for (const s of [-1, 1]) { box(d, 0.02, 0.75, W - 0.4, 0x7d5a3c, s * 0.035, 1.45, W / 2); box(d, 0.02, 0.75, W - 0.4, 0x7d5a3c, s * 0.035, 0.55, W / 2); sph(d, 0.05, 0xd9b34a, s * 0.07, 1.0, W - 0.12); }
  DOOR.group = d; DOOR.col = col(x, (z0 + z1) / 2, 0.2, W);
  interact(d, 'Open the door', openDoor);
})();
function openDoor() {
  if (DOOR.open) return;
  DOOR.open = true; DOOR.t = 0;
  const i = colliders.indexOf(DOOR.col); if (i >= 0) colliders.splice(i, 1);
  const k = interactables.indexOf(DOOR.group); if (k >= 0) interactables.splice(k, 1);
}

/* ------------------------------------------------------------------ living room (built at x 32..48, shifted next to the bedroom) */
const LIV = 3.7 - 32;                         // living-room x offset: its west wall sits on the shared wall
let igScreen = null;
const buddy = { head: null, root: null, yaw: 0 };
function tombstone(parent, name, x, y, z, s) {
  const g = group(x, y, z, parent); g.scale.setScalar(s); g.rotation.y = Math.PI;       // faces +z
  box(g, 0.9, 0.12, 0.36, 0x777a80, 0, 0.06, 0);
  box(g, 0.7, 0.75, 0.18, 0x8d9096, 0, 0.495, 0);
  cyl(g, 0.35, 0.35, 0.18, 0x8d9096, 0, 0.87, 0, 24).rotation.x = Math.PI / 2;
  const t = tex(512, 640, (c, W) => {
    c.fillStyle = '#2c2e33'; c.textAlign = 'center';
    c.font = 'bold 110px Georgia, serif'; c.fillText('R.I.P.', W / 2, 250);
    c.fillRect(W / 2 - 120, 300, 240, 6);
    fitText(c, name, 420, 104, 'Georgia, serif'); c.fillText(name, W / 2, 430);
  });
  plane(g, 0.68, 0.85, t, 0, 0.66, -0.092, Math.PI, false);
}
(function living() {
  // shell first (13 x 10), then furniture positions are squeezed from the original 16 x 12 layout
  MX = x => x + LIV; MZ = z => z;
  room(38.5, 0, 13, 10, 3.2, woodFloor(13, 10, '#94704c'), 0xe9e2d5, 0xf5f2ec, 'nx');
  box(scene, 0.03, 0.1, 5.75, 0xf5f1e8, 32.015, 0.05, -2.125); box(scene, 0.03, 0.1, 3.15, 0xf5f1e8, 32.015, 0.05, 3.425);
  noCast(box(scene, 0.02, 3.01, 10, 0x24344d, 44.98, 1.605, 0));            // accent wall behind the TV
  MX = x => (x >= 44 ? x - 3 : 32 + (x - 32) * 0.75) + LIV; MZ = z => (Math.abs(z) > 4 ? z - Math.sign(z) : z * 0.75);
  for (const [x, z] of [[36, -2.5], [36, 2.5], [44, -2.5], [44, 2.5]]) {
    lamp(x, 2.1, z, 9);
    cyl(scene, 0.2, 0.28, 0.1, 0xf5f1e8, x, 3.14, z, 16, { emissive: 0xffe6b0, emissiveIntensity: 0.9 });
  }
  windowPane(41.5, 1.75, -5.98, 0, 2.6, 1.5);

  /* --- gaming corner: TV, console, couch --- */
  const tv = group(47.55, 0, 0);
  box(tv, 0.5, 0.5, 2.8, 0x3b3f4a, 0, 0.25, 0); col(47.55, 0, 0.5, 2.8);
  box(tv, 0.08, 1.5, 2.7, 0x0b0b0e, 0.3, 1.75, 0);
  const screen = tex(1024, 560, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, W, H); gr.addColorStop(0, '#0e2a47'); gr.addColorStop(1, '#3b1a4a');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = '#f2b441'; c.font = 'bold 76px Georgia, serif'; c.textAlign = 'center'; c.fillText('GAME NIGHT', W / 2, 120);
    c.fillStyle = '#fff'; c.font = '600 44px system-ui, sans-serif';
    ['Lacrosse Range', 'Booster Landing', 'Market Parkour'].forEach((t, i) => c.fillText(t, W / 2, 230 + i * 78));
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '500 34px system-ui, sans-serif'; c.fillText(TOUCH ? 'Tap to play' : 'Press E to play', W / 2, 500);
  });
  plane(tv, 2.56, 1.38, screen, 0.255, 1.75, 0, -Math.PI / 2);
  box(tv, 0.34, 0.09, 0.3, 0x15171c, -0.02, 0.545, 0.7); box(tv, 0.02, 0.02, 0.04, 0xffffff, -0.19, 0.55, 0.78, { emissive: 0xffffff });
  box(tv, 0.1, 0.5, 0.14, 0x15171c, 0.05, 0.75, -1.05);
  interact(tv, 'Play games', openGames);
  box(scene, 3.7, 0.02, 4.0, rugTex('#c9b79a', '#24344d', '#a5503a'), 45.6, 0.012, 0);
  box(scene, 0.6, 0.06, 1.3, 0x6b4a2f, 45.75, 0.4, 0); col(45.75, 0, 0.6, 1.3);
  for (const [dx, dz] of [[-.25, -.58], [.25, -.58], [-.25, .58], [.25, .58]]) box(scene, 0.05, 0.38, 0.05, 0x333333, 45.75 + dx, 0.19, dz);
  for (const dz of [-0.3, 0.25]) { box(scene, 0.11, 0.035, 0.17, 0x1a1c22, 45.75, 0.448, dz); sph(scene, 0.015, 0xdddddd, 45.72, 0.47, dz + 0.04); }

  /* --- bar cart --- */
  const bar = group(40.2, 0, -5.25);
  for (const y of [0.3, 0.85]) box(bar, 1.2, 0.04, 0.5, 0xb08d57, 0, y, 0);
  for (const [dx, dz] of [[-.57, -.22], [.57, -.22], [-.57, .22], [.57, .22]]) {
    cyl(bar, 0.018, 0.018, 0.95, 0xd9b34a, dx, 0.5, dz, 8); cyl(bar, 0.05, 0.05, 0.03, 0x222222, dx, 0.05, dz, 12).rotation.x = Math.PI / 2;
  }
  box(bar, 0.03, 0.03, 0.5, 0xd9b34a, -0.6, 0.98, 0);
  const bottle = (x, y, z) => {
    cyl(bar, 0.034, 0.034, 0.15, 0x5a3212, x, y + 0.075, z, 12); cyl(bar, 0.013, 0.03, 0.07, 0x5a3212, x, y + 0.185, z, 12);
    cyl(bar, 0.0135, 0.0135, 0.012, 0xd9b34a, x, y + 0.226, z, 10); cyl(bar, 0.0348, 0.0348, 0.06, 0xf0e3c0, x, y + 0.07, z, 12);
  };
  for (let i = 0; i < 6; i++) bottle(-0.38 + i * 0.15, 0.87, (i % 2) * 0.14 - 0.07);
  for (let i = 0; i < 4; i++) bottle(-0.3 + i * 0.2, 0.32, 0);
  col(40.2, -5.25, 1.25, 0.55);
  interact(bar, 'Grab a drink', drink);

  /* --- Story St. sign (text is measured so it can never run off the blade) --- */
  const st = tex(1024, 240, (c, W, H) => {
    c.fillStyle = '#1f6b3a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#fff'; c.lineWidth = 12; c.strokeRect(14, 14, W - 28, H - 28);
    c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'left';
    const font = 'Arial, Helvetica, sans-serif', gap = 34, max = W - 150;
    let big = 150, small, wa, wb;
    do { c.font = `bold ${big}px ${font}`; wa = c.measureText('STORY').width; small = Math.round(big * 0.56); c.font = `bold ${small}px ${font}`; wb = c.measureText('ST').width; big -= 4; } while (wa + gap + wb > max && big > 40);
    big += 4; const x0 = (W - (wa + gap + wb)) / 2;
    c.font = `bold ${big}px ${font}`; c.fillText('STORY', x0, H / 2 + 6);
    c.font = `bold ${small}px ${font}`; c.fillText('ST', x0 + wa + gap, H / 2 - big * 0.14);
  });
  box(scene, 1.84, 0.45, 0.03, 0xdfe5e0, 36.4, 2.2, -5.975);
  plane(scene, 1.8, 0.42, st, 36.4, 2.2, -5.955, 0);

  /* --- mailbox --- */
  const mb = group(37.2, 0, 5.62); mb.rotation.y = Math.PI;
  box(mb, 0.1, 1.05, 0.1, 0x6b4a2f, 0, 0.525, 0);
  box(mb, 0.3, 0.2, 0.56, 0x2a4b8d, 0, 1.15, 0);
  cyl(mb, 0.15, 0.15, 0.56, 0x2a4b8d, 0, 1.25, 0, 20).rotation.x = Math.PI / 2;
  box(mb, 0.02, 0.22, 0.04, 0xd64545, 0.165, 1.33, -0.1); box(mb, 0.02, 0.1, 0.14, 0xd64545, 0.165, 1.42, -0.05);
  plane(mb, 0.26, 0.12, sign('MAIL', 0.26, 0.12, '#2a4b8d', '#ffffff', 'Georgia, serif', false), 0, 1.16, 0.285, 0, false);
  col(37.2, 5.62, 0.5, 0.6);
  interact(mb, 'Send me a message', openEmail);

  /* --- front door to outside --- */
  const fd = group(44.6, 0, 5.94);
  box(fd, 1.0, 2.1, 0.08, 0x7a2e2a, 0, 1.05, 0);
  for (const [px, py] of [[-0.22, 1.55], [0.22, 1.55], [-0.22, 0.95], [0.22, 0.95], [-0.22, 0.38], [0.22, 0.38]]) box(fd, 0.34, py > 0.5 ? 0.46 : 0.5, 0.03, 0x8c3a35, px, py, -0.045);
  sph(fd, 0.05, 0xd9b34a, -0.38, 1.02, -0.08); cyl(fd, 0.04, 0.04, 0.03, 0xd9b34a, -0.38, 1.2, -0.055, 14).rotation.x = Math.PI / 2;   // knob + deadbolt
  box(fd, 0.012, 0.035, 0.01, 0x222222, -0.38, 1.2, -0.073);                                                                    // keyhole
  box(fd, 0.08, 2.2, 0.1, 0xf5f1e8, -0.54, 1.1, 0); box(fd, 0.08, 2.2, 0.1, 0xf5f1e8, 0.54, 1.1, 0); box(fd, 1.16, 0.08, 0.1, 0xf5f1e8, 0, 2.18, 0);
  box(fd, 0.9, 0.02, 0.5, 0x4a5a3a, 0, 0.01, -0.33);                                                                           // doormat
  plane(fd, 0.62, 0.2, sign('OUTSIDE', 0.62, 0.2, '#f5f1e8', '#3a3024', 'Georgia, serif', false), 0, 2.36, -0.06, Math.PI);
  interact(fd, 'Go outside', tryFrontDoor);

  /* --- career: a suit on a hanger; takes you straight to LinkedIn --- */
  const suit = group(43.0, 0, 5.9);
  const navy = 0x1e2a44, navy2 = 0x263556;
  box(suit, 0.1, 0.04, 0.1, 0xd9b34a, 0, 2.0, -0.05); cyl(suit, 0.008, 0.008, 0.14, 0xb9bcc4, 0, 1.93, -0.09, 8);              // wall hook + hanger neck
  for (const sx of [-1, 1]) { const arm = box(suit, 0.3, 0.025, 0.03, 0x8a6a4a, sx * 0.14, 1.83, -0.09); arm.rotation.z = -sx * 0.22; }
  box(suit, 0.56, 0.1, 0.16, navy, 0, 1.76, -0.09);                                                                             // shoulders
  box(suit, 0.5, 0.62, 0.14, navy, 0, 1.42, -0.09);                                                                             // jacket body
  for (const sx of [-1, 1]) { const sl = box(suit, 0.12, 0.62, 0.12, navy2, sx * 0.315, 1.44, -0.09); sl.rotation.z = sx * 0.07; }
  box(suit, 0.13, 0.34, 0.02, 0xf4f1ea, 0, 1.6, -0.165);                                                                        // shirt
  box(suit, 0.045, 0.3, 0.02, 0x9b1c2c, 0, 1.58, -0.172); box(suit, 0.06, 0.05, 0.022, 0x9b1c2c, 0, 1.745, -0.172);            // tie
  for (const sx of [-1, 1]) { const lp = box(suit, 0.1, 0.38, 0.02, navy2, sx * 0.1, 1.6, -0.168); lp.rotation.z = sx * 0.2; }  // lapels
  for (const y of [1.3, 1.2]) cyl(suit, 0.014, 0.014, 0.01, 0x111111, 0.03, y, -0.165, 10).rotation.x = Math.PI / 2;           // buttons
  box(suit, 0.1, 0.02, 0.02, 0xf4f1ea, 0.15, 1.56, -0.166);                                                                     // pocket square
  for (const sx of [-1, 1]) box(suit, 0.2, 0.72, 0.1, navy, sx * 0.11, 0.76, -0.08);                                            // trousers
  plane(suit, 0.56, 0.17, sign('CAREER', 0.56, 0.17, '#f2b441', '#1a1303'), 0, 2.22, -0.02, Math.PI);
  interact(suit, 'Career: open my LinkedIn', openLinkedIn);

  /* --- big camera on a tripod; its rear screen shows the Instagram profile it is "shooting" --- */
  const cam = group(33.7, 0, 4.85); cam.rotation.y = Math.PI * 0.73;                    // back of the camera faces the room
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094 + 0.5, leg = cyl(cam, 0.024, 0.024, 1.3, 0x222222, Math.cos(a) * 0.25, 0.61, Math.sin(a) * 0.25, 8);
    leg.rotation.z = Math.cos(a) * 0.38; leg.rotation.x = -Math.sin(a) * 0.38;
  }
  cyl(cam, 0.06, 0.06, 0.1, 0x222222, 0, 1.24, 0);
  box(cam, 1.04, 0.68, 0.36, 0x1b1d22, 0, 1.63, 0);                                     // body
  box(cam, 0.2, 0.7, 0.4, 0x26292f, -0.46, 1.63, -0.02);                                // grip (photographer's right hand)
  box(cam, 0.3, 0.14, 0.26, 0x1b1d22, 0.1, 2.03, 0); box(cam, 0.14, 0.09, 0.06, 0x0b0b0e, 0.1, 2.03, 0.14);   // viewfinder hump + eyepiece
  cyl(cam, 0.05, 0.05, 0.04, 0xd9d9de, -0.4, 2.0, -0.02, 14); cyl(cam, 0.07, 0.07, 0.05, 0x33363d, 0.38, 2.0, 0, 16);
  cyl(cam, 0.24, 0.27, 0.34, 0x2c2f36, 0.06, 1.63, -0.34, 28).rotation.x = Math.PI / 2;  // lens points away, into the corner
  cyl(cam, 0.2, 0.2, 0.012, 0x5d7fa8, 0.06, 1.63, -0.515, 28, { emissive: 0x223a5e }).rotation.x = Math.PI / 2;
  box(cam, 0.84, 0.6, 0.02, 0x0b0b0e, 0.06, 1.63, 0.182);                               // screen bezel
  for (let i = 0; i < 3; i++) cyl(cam, 0.022, 0.022, 0.015, 0x3a3e46, -0.44, 1.78 - i * 0.12, 0.185, 12).rotation.x = Math.PI / 2;
  sph(cam, 0.016, 0xd64545, -0.44, 1.4, 0.185, { emissive: 0xd64545 });
  const igTex = tex(600, 406, (c, W, H) => {                                             // shown until img/instagram.jpg loads
    c.fillStyle = '#0d1014'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff'; c.font = 'bold 30px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText('matthew.moore04', W / 2, 190);
    c.fillStyle = '#0095f6'; c.fillRect(W / 2 - 110, 220, 220, 44); c.fillStyle = '#fff'; c.font = 'bold 22px system-ui, sans-serif'; c.fillText('Follow', W / 2, 250);
  });
  igScreen = plane(cam, 0.78, 0.528, igTex, 0.06, 1.63, 0.194, 0);
  new THREE.TextureLoader().load('img/instagram.jpg', t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; igScreen.material.map = t; igScreen.material.needsUpdate = true; });
  const g2 = new THREE.PointLight(0xdfe8ff, 2.4, 4, 1.8); g2.position.set(0.06, 1.63, 0.7); cam.add(g2);
  col(33.7, 4.85, 0.95, 0.95);
  interact(cam, 'Open my Instagram', openInstagram);

  /* --- bookshelf, with three tiny headstone ornaments on the middle shelf --- */
  plant(47.3, -5.3);
  box(scene, 1.5, 2.0, 0.34, 0x6b4a2f, 45.2, 1.0, -5.8); col(45.2, -5.8, 1.5, 0.4);
  const bk = [0xd64545, 0xe9c46a, 0x2a9d8f, 0x264653, 0xf4a261, 0x8ecae6, 0x6d597a];
  for (let r = 0; r < 4; r++) {
    box(scene, 1.4, 0.03, 0.3, 0x7d5a3c, 45.2, 0.25 + r * 0.48, -5.76);
    for (let i = 0; i < 9; i++) {
      if (r === 2 && i > 1 && i < 7) continue;                                          // the gap the headstones sit in
      box(scene, 0.09, 0.26 + ((i * 7 + r * 3) % 5) * 0.025, 0.2, bk[(i + r * 2) % bk.length], 44.62 + i * 0.135, 0.41 + r * 0.48, -5.72);
    }
  }
  ['Jake', 'Leo', 'Nathaniel'].forEach((name, i) => tombstone(scene, name, 44.96 + i * 0.2, 1.225, -5.612, 0.12));

  /* --- lacrosse stick leaning in the corner --- */
  const lx = makeLacrosseStick(THREE, { head: 1.15, shaft: 1.0, headColor: 0xffffff, shaftColor: 0x9b1c2c });
  lx.position.set(MX(47.55), 1.0, MZ(5.55)); lx.rotation.set(-0.22, 0.6, -0.2); scene.add(lx);
  sph(scene, 0.032, 0xfffb8a, 47.2, 0.032, 5.35);

  /* --- decor --- */
  box(scene, 1.3, 0.9, 0.03, 0x222831, 41.2, 1.9, 5.98);
  plane(scene, 1.18, 0.78, tex(256, 170, (c, W, H) => {
    c.fillStyle = '#f5efe2'; c.fillRect(0, 0, W, H); c.fillStyle = '#e76f51'; c.beginPath(); c.arc(90, 80, 46, 0, 7); c.fill();
    c.fillStyle = '#264653'; c.fillRect(130, 40, 86, 96); c.fillStyle = '#e9c46a'; c.fillRect(40, 118, 150, 16);
  }), 41.2, 1.9, 5.96, Math.PI, false);
  cyl(scene, 0.16, 0.18, 0.03, 0x222222, 42.9, 0.015, 3.5); cyl(scene, 0.015, 0.015, 1.6, 0x222222, 42.9, 0.8, 3.5, 8);
  cyl(scene, 0.13, 0.2, 0.26, 0xfff0cc, 42.9, 1.68, 3.5, 16, { emissive: 0xffd68a, emissiveIntensity: 0.8 });
  col(42.9, 3.5, 0.3, 0.3);

  /* --- Pat, in an armchair tucked into the corner: brown swept-up hair, open red flannel jacket over a white henley, jeans --- */
  const guy = group(33.0, 0, -5.25); guy.rotation.y = -Math.PI * 0.75;                   // chair faces out into the room
  const chairC = 0xa35d4a;
  box(guy, 0.9, 0.4, 0.9, chairC, 0, 0.2, 0); box(guy, 0.9, 0.55, 0.22, chairC, 0, 0.68, 0.4);
  for (const sx of [-1, 1]) box(guy, 0.2, 0.3, 0.9, chairC, sx * 0.36, 0.55, 0);
  cyl(guy, 0.3, 0.3, 0.04, 0x6b4a2f, -0.72, 0.5, -0.25, 20); cyl(guy, 0.03, 0.03, 0.5, 0x333333, -0.72, 0.25, -0.25, 8);   // side table
  cyl(guy, 0.04, 0.035, 0.1, 0xf4f1ea, -0.72, 0.57, -0.25, 12);                          // a mug on it
  { const gx = guy.position.x, gz = guy.position.z; colliders.push({ x0: gx - 0.7, x1: gx + 0.7, z0: gz - 0.7, z1: gz + 0.7 }, { x0: gx + 0.69 - 0.3, x1: gx + 0.69 + 0.3, z0: gz - 0.33 - 0.3, z1: gz - 0.33 + 0.3 }); }
  const skin = 0xf0c8a6, hairC = 0x5b3f2a, jeans = 0x3d5f93, henley = 0xf6f3ec;
  const plaid = tex(128, 128, (c, W, H) => {
    c.fillStyle = '#b3262a'; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(20,16,18,.55)'; for (let i = 0; i < 4; i++) { c.fillRect(i * 32 + 4, 0, 12, H); c.fillRect(0, i * 32 + 4, W, 12); }
    c.fillStyle = 'rgba(20,16,18,.5)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) c.fillRect(i * 32 + 4, j * 32 + 4, 12, 12);
    c.fillStyle = 'rgba(255,235,220,.35)'; for (let i = 0; i < 4; i++) { c.fillRect(i * 32 + 23, 0, 2, H); c.fillRect(0, i * 32 + 23, W, 2); }
  });
  const flannel = new THREE.MeshLambertMaterial({ map: plaid });
  for (const sx of [-1, 1]) {
    box(guy, 0.15, 0.14, 0.44, jeans, sx * 0.1, 0.48, -0.2);                             // thighs
    box(guy, 0.13, 0.42, 0.13, jeans, sx * 0.1, 0.23, -0.52);                            // shins
    box(guy, 0.135, 0.04, 0.135, 0x4a6ea6, sx * 0.1, 0.07, -0.52);                       // cuffed hems
    box(guy, 0.13, 0.07, 0.25, 0x6b4a2f, sx * 0.1, 0.035, -0.57);                        // boots
    box(guy, 0.11, 0.3, 0.13, flannel, sx * 0.25, 0.93, 0.07).rotation.z = sx * 0.12;    // jacket sleeves
    box(guy, 0.1, 0.09, 0.3, flannel, sx * 0.3, 0.75, -0.08);                            // forearms on the armrests
    box(guy, 0.105, 0.095, 0.03, henley, sx * 0.3, 0.75, -0.235);                        // henley cuffs showing
    sph(guy, 0.05, skin, sx * 0.3, 0.75, -0.28);                                         // hands
    box(guy, 0.11, 0.5, 0.03, flannel, sx * 0.15, 0.81, -0.04);                          // open jacket fronts
    box(guy, 0.09, 0.07, 0.03, flannel, sx * 0.12, 1.09, -0.035).rotation.z = -sx * 0.45;  // jacket collar
  }
  box(guy, 0.4, 0.52, 0.22, flannel, 0, 0.8, 0.08); box(guy, 0.46, 0.1, 0.24, flannel, 0, 1.06, 0.08);   // jacket body + shoulders
  box(guy, 0.2, 0.56, 0.02, henley, 0, 0.83, -0.036);                                    // white henley
  box(guy, 0.035, 0.15, 0.012, 0xe2ddd2, 0, 1.01, -0.048);                               // its button placket
  for (let i = 0; i < 3; i++) cyl(guy, 0.008, 0.008, 0.008, 0xbfb8aa, 0, 0.955 + i * 0.05, -0.056, 8).rotation.x = Math.PI / 2;
  box(guy, 0.13, 0.025, 0.02, 0xe2ddd2, 0, 1.1, -0.036);                                 // round collar
  box(guy, 0.41, 0.04, 0.225, 0x3a2416, 0, 0.55, 0.08);                                  // belt
  cyl(guy, 0.055, 0.06, 0.1, skin, 0, 1.14, 0.06, 12);                                   // neck
  const head = group(0, 1.19, 0.06, guy);
  box(head, 0.2, 0.25, 0.21, skin, 0, 0.125, 0);                                         // face
  box(head, 0.17, 0.05, 0.19, skin, 0, -0.005, 0);                                       // jaw
  for (const sx of [-1, 1]) {
    box(head, 0.03, 0.07, 0.04, skin, sx * 0.112, 0.13, 0.02);                           // ears
    box(head, 0.035, 0.028, 0.012, 0xffffff, sx * 0.05, 0.155, -0.106);                  // eyes
    box(head, 0.02, 0.024, 0.014, 0x2a1a10, sx * 0.05, 0.155, -0.108);
    box(head, 0.062, 0.016, 0.014, 0x3a281b, sx * 0.05, 0.19, -0.108).rotation.z = -sx * 0.1;   // thick eyebrows
    box(head, 0.03, 0.17, 0.2, hairC, sx * 0.104, 0.2, 0.012);                           // hair at the sides
  }
  box(head, 0.03, 0.05, 0.03, 0xe6b894, 0, 0.11, -0.115);                                // nose
  box(head, 0.075, 0.012, 0.012, 0xb86f62, 0, 0.055, -0.107);                            // a small closed-mouth smile
  box(head, 0.22, 0.07, 0.23, hairC, 0, 0.275, 0.005);                                   // hair on top
  box(head, 0.2, 0.2, 0.04, hairC, 0, 0.19, 0.11);                                       // back of the head
  const tuft = box(head, 0.2, 0.08, 0.1, hairC, 0.01, 0.305, -0.07); tuft.rotation.x = 0.45;       // front swept up
  box(head, 0.14, 0.05, 0.12, 0x6a4a32, -0.02, 0.325, 0.0).rotation.z = 0.12;
  buddy.head = head; buddy.root = guy;
  interact(guy, 'Say hi to Pat: visit patricksliz.com', () => openLink('https://patricksliz.com/'));


  /* --- detail pass, in real room coordinates (x 32..45, z -5..5) --- */
  MX = x => x + LIV; MZ = z => z;
  for (const x of [34.6, 38.5, 42.4]) noCast(box(scene, 0.16, 0.14, 10, 0x5d4632, x, 3.13, 0));             // ceiling beams
  // couch, facing the TV
  { const g = group(41.15, 0, 0), cc = 0x4f6d7a, cu = 0x5f8090;
    box(g, 0.95, 0.3, 2.5, cc, 0, 0.27, 0); box(g, 0.2, 0.82, 2.5, cc, -0.5, 0.53, 0);
    for (const s of [-1, 1]) { box(g, 1.15, 0.6, 0.2, cc, -0.1, 0.42, s * 1.35); box(g, 0.78, 0.16, 1.2, cu, 0.06, 0.5, s * 0.62); const bk = box(g, 0.2, 0.5, 1.18, cu, -0.33, 0.78, s * 0.62); bk.rotation.z = 0.12;
      for (const dx of [-0.42, 0.42]) box(g, 0.06, 0.12, 0.06, 0x2c2018, dx - 0.05, 0.06, s * 1.3); }
    const p1 = box(g, 0.14, 0.36, 0.38, 0xe9c46a, -0.16, 0.76, -0.95); p1.rotation.z = 0.25; const p2 = box(g, 0.14, 0.34, 0.36, 0xb8573a, -0.14, 0.75, 0.98); p2.rotation.z = 0.25; p2.rotation.y = 0.15;
    const p3 = box(g, 0.13, 0.3, 0.32, 0xf4f1ea, -0.1, 0.72, 0.62); p3.rotation.z = 0.3;
    box(g, 0.5, 0.04, 0.24, 0xd9cdb8, 0.05, 0.74, 1.35); box(g, 0.04, 0.34, 0.24, 0xd9cdb8, 0.3, 0.58, 1.46);                                  // throw over the arm
  }
  col(41.1, 0, 1.2, 2.95);
  // coffee table things
  [0x264653, 0xe9c46a].forEach((c, i) => box(scene, 0.22, 0.03, 0.3, c, 42.72, 0.445 + i * 0.03, -0.42));
  cyl(scene, 0.04, 0.035, 0.09, 0xf4f1ea, 42.9, 0.475, 0.45, 12); cyl(scene, 0.06, 0.05, 0.07, 0xb5653a, 42.62, 0.465, 0.5, 12); sph(scene, 0.07, 0x3c9460, 42.62, 0.55, 0.5);
  box(scene, 0.05, 0.02, 0.16, 0x15171c, 42.88, 0.44, -0.05);
  // TV wall: glow behind the screen, soundbar, floating shelves
  noCast(box(scene, 0.02, 1.64, 2.84, 0x8a7cff, 44.93, 1.75, 0, { emissive: 0x6a5cff, emissiveIntensity: 1.4 })); lamp(44.6, 1.75, 0, 2.2, 0x8a7cff);
  box(scene, 0.1, 0.07, 1.1, 0x15171c, 44.42, 0.535, -0.35);
  for (const s of [-1, 1]) for (const y of [1.35, 1.95]) {
    box(scene, 0.24, 0.035, 0.95, 0x8a6a4a, 44.85, y, s * 2.55);
    if (y < 1.5) { [0xd64545, 0x2a9d8f, 0xe9c46a, 0x264653].forEach((c, i) => box(scene, 0.16, 0.2 + (i % 2) * 0.03, 0.045, c, 44.86, y + 0.12 + (i % 2) * 0.015, s * 2.55 - 0.3 + i * 0.055)); cyl(scene, 0.05, 0.04, 0.08, 0xf4f1ea, 44.84, y + 0.06, s * 2.55 + 0.25, 12); sph(scene, 0.07, 0x3c9460, 44.84, y + 0.15, s * 2.55 + 0.25); }
    else { box(scene, 0.14, 0.2, 0.14, 0x15171c, 44.86, y + 0.12, s * 2.55 - 0.25); noCast(cyl(scene, 0.045, 0.045, 0.01, 0x3a3e46, 44.788, y + 0.12, s * 2.55 - 0.25, 14)).rotation.z = Math.PI / 2; const f = box(scene, 0.02, 0.2, 0.16, 0xd9b34a, 44.88, y + 0.12, s * 2.55 + 0.2); f.rotation.z = 0.12; cyl(scene, 0.03, 0.03, 0.09, 0xf1e3c6, 44.84, y + 0.063, s * 2.55 + 0.02, 10); }
  }
  // console table by the door: record player, lamp, round mirror
  box(scene, 0.36, 0.04, 1.5, 0x6b4a2f, 32.32, 0.82, -1.6); col(32.32, -1.6, 0.42, 1.55);
  for (const [dx, dz] of [[-.14, -.7], [.14, -.7], [-.14, .7], [.14, .7]]) box(scene, 0.04, 0.8, 0.04, 0x2c2018, 32.32 + dx, 0.4, -1.6 + dz);
  box(scene, 0.34, 0.03, 1.46, 0x7d5a3c, 32.32, 0.3, -1.6); box(scene, 0.3, 0.3, 0.34, 0xc9a877, 32.32, 0.465, -2.05);
  for (let i = 0; i < 7; i++) noCast(box(scene, 0.28, 0.27, 0.012, [0x1d3557, 0xe76f51, 0x2a9d8f, 0xe9c46a, 0x6d597a, 0xd64545, 0x264653][i], 32.32, 0.5, -2.17 + i * 0.04));
  box(scene, 0.32, 0.07, 0.42, 0x2c2018, 32.32, 0.875, -1.85); noCast(cyl(scene, 0.14, 0.14, 0.012, 0x111111, 32.32, 0.916, -1.89, 28)); noCast(cyl(scene, 0.045, 0.045, 0.014, 0xd64545, 32.32, 0.917, -1.89, 16));
  { const arm = box(scene, 0.012, 0.012, 0.2, 0xc9ccd2, 32.43, 0.93, -1.76); arm.rotation.y = 0.5; }
  cyl(scene, 0.07, 0.09, 0.26, 0x3d5a80, 32.3, 0.97, -1.05, 14); noCast(cyl(scene, 0.11, 0.17, 0.22, 0xfff0cc, 32.3, 1.2, -1.05, 18, { emissive: 0xffd68a, emissiveIntensity: 0.85 })); lamp(32.6, 1.25, -1.05, 3.5);
  noCast(cyl(scene, 0.46, 0.46, 0.03, 0x2c2018, 32.02, 1.78, -1.6, 40)).rotation.z = Math.PI / 2; noCast(cyl(scene, 0.42, 0.42, 0.032, 0xcfe1ea, 32.024, 1.78, -1.6, 40, { emissive: 0x4a6170 })).rotation.z = Math.PI / 2;
  // tall plant between the door and the camera
  cyl(scene, 0.2, 0.16, 0.4, 0xf4f1ea, 32.5, 0.2, 2.75, 16); cyl(scene, 0.03, 0.04, 1.1, 0x5d4632, 32.5, 0.95, 2.75, 8); col(32.5, 2.75, 0.46, 0.46);
  for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.16 + (i % 3) * 0.1, lf = sph(scene, 0.17, i % 2 ? 0x2f7d4f : 0x3c9460, 32.5 + Math.cos(a) * r, 1.25 + i * 0.075, 2.75 + Math.sin(a) * r); lf.scale.set(1, 0.45, 1.3); lf.rotation.y = a; }
  // window dressing, a wall clock, and more art
  curtains(39.125, 1.75, -4.98, 0, 2.6, 1.5);
  noCast(cyl(scene, 0.24, 0.24, 0.03, 0x2c2018, 33.95, 2.3, -4.975, 32)).rotation.x = Math.PI / 2;
  plane(scene, 0.42, 0.42, tex(128, 128, (c, W) => { c.fillStyle = '#f6f1e6'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.strokeStyle = '#22252b'; c.lineCap = 'round'; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.lineWidth = i % 3 ? 2 : 5; c.beginPath(); c.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); c.lineTo(64 + Math.sin(a) * 57, 64 - Math.cos(a) * 57); c.stroke(); } c.lineWidth = 5; c.beginPath(); c.moveTo(64, 64); c.lineTo(42, 44); c.stroke(); c.lineWidth = 3; c.beginPath(); c.moveTo(64, 64); c.lineTo(92, 34); c.stroke(); c.fillStyle = '#9b1c2c'; c.beginPath(); c.arc(64, 64, 5, 0, 7); c.fill(); }), 33.95, 2.3, -4.957, 0, false);
  frameArt(scene, 37.35, 2.15, 4.975, Math.PI, 0.5, 0.4, 4); frameArt(scene, 37.35, 1.62, 4.975, Math.PI, 0.5, 0.4, 7); frameArt(scene, 35.9, 2.1, 4.975, Math.PI, 0.62, 0.46, 5, 0xd9b34a);
  frameArt(scene, 32.025, 2.0, -3.3, Math.PI / 2, 0.5, 0.66, 8, 0xd9b34a);

  MX = x => x; MZ = z => z;
})();

/* ------------------------------------------------------------------ state */
const S = {
  mode: 'waking',           // waking | world | panel | game | blackout
  pos: new THREE.Vector3().copy(BED.lie), yaw: 0, pitch: 0, roll: 0,
  drinks: 0, limit: 10, t: 0, wakeT: 0, paused: false, target: null, bob: 0, seenLiving: false,
};
const keys = {};
const stick = { f: 0, s: 0 };       // touch joystick
let active = null, activeName = null, activeOpt = null;
const R = 0.3;
const blocked = (x, z) => colliders.some(c => x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R);
const axes = () => ({
  f: clamp((keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + stick.f, -1, 1),
  s: clamp((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.s, -1, 1),
});

/* ------------------------------------------------------------------ pointer lock / pause
   Pause only happens when you press Esc while walking around. Esc inside a game or a panel just backs out. */
const locked = () => document.pointerLockElement === canvas;
let leaving = false;                 // true while we drop the lock on purpose (panel opened, link opened)
function lock() {
  if (FREE || locked()) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* the "click to look" hint covers this */ }
}
function unlock() { if (locked()) { leaving = true; document.exitPointerLock(); } }
function setPaused(v) { S.paused = v; $('pause').classList.toggle('hidden', !v); $('homeBtn').classList.toggle('hidden', S.mode !== 'outside'); $('quitGolfBtn').classList.toggle('hidden', !(S.mode === 'outside' && golf?.S.golf)); }
document.addEventListener('pointerlockchange', () => {
  if (locked()) { setPaused(false); return; }
  if (leaving) { leaving = false; return; }
  if (S.mode === 'game') exitGame(true);
  else if (S.mode === 'world' || S.mode === 'outside') setPaused(true);
});
$('pause').addEventListener('click', () => { setPaused(false); lock(); });
$('quitGolfBtn').addEventListener('click', e => { e.stopPropagation(); setPaused(false); golf?.quit(); lock(); });   // end the round but stay outside
$('homeBtn').addEventListener('click', e => { e.stopPropagation(); setPaused(false); goInside(); });      // Esc on the golf course offers a way home

/* ------------------------------------------------------------------ HUD helpers */
let toastTimer;
function toast(msg, ms = 1800) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
// the more you drank, the blurrier everything gets (games included)
// (the golf course is never blurred, however much you drank)
function wobbleFilter() {
  const outside = S.mode === 'outside' || (S.mode === 'panel' && panelFrom === 'outside');
  canvas.style.filter = S.drinks > 0.2 && !outside ? `blur(${(S.drinks * (S.mode === 'game' ? 0.34 : 0.26)).toFixed(2)}px)` : '';
}
function showWorldHud(v) {
  $('hud').classList.remove('hidden');
  $('cross').classList.toggle('hidden', !v);
  if (!v) $('prompt').classList.add('hidden');
  $('ghud').classList.toggle('hidden', v);
  touchUI();
}
let controlsTimer;
function showControls() {
  const c = $('controls');
  c.innerHTML = TOUCH
    ? '<b>Welcome</b>Left stick to move · drag to look<br>Tap things, or press USE'
    : '<b>Welcome</b><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to move · mouse to look<br><kbd>E</kbd> or click to use · <kbd>E</kbd> / <kbd>Esc</kbd> to close<br>Click once to look around';
  c.classList.add('show'); clearTimeout(controlsTimer); controlsTimer = setTimeout(() => c.classList.remove('show'), 3000);
}

/* ------------------------------------------------------------------ flow: wake, door, drinks */
function lids(v) { $('lidT').style.height = $('lidB').style.height = `${v * 50.5}%`; }
function wake() {
  S.mode = 'waking'; S.wakeT = 0; S.drinks = 0; S.limit = 8 + Math.floor(Math.random() * 5); wobbleFilter();
  S.pos.copy(BED.lie); S.yaw = 0.2; S.pitch = 1.35; S.roll = 0.5;
  lids(1); $('black').style.transition = 'none'; $('black').style.opacity = 0;
  $('prompt').classList.add('hidden'); touchUI();
}
function updateWake(dt) {
  S.wakeT += dt; const p = S.wakeT / 4.2;
  let l = 1;
  if (p < 0.12) l = lerp(1, 0.45, ease(p / 0.12));
  else if (p < 0.24) l = lerp(0.45, 1, ease((p - 0.12) / 0.12));
  else if (p < 0.4) l = lerp(1, 0.25, ease((p - 0.24) / 0.16));
  else if (p < 0.48) l = lerp(0.25, 0.7, ease((p - 0.4) / 0.08));
  else l = lerp(0.7, 0, ease(clamp((p - 0.48) / 0.14, 0, 1)));
  lids(l);
  const k = ease(clamp((p - 0.5) / 0.5, 0, 1));
  S.pos.lerpVectors(BED.lie, BED.stand, k);
  S.pitch = lerp(1.35, -0.05, k); S.roll = lerp(0.5, 0, k); S.yaw = lerp(0.2, -Math.PI / 2 - 0.25, k);
  if (p >= 1) { lids(0); S.mode = 'world'; showControls(); }
}
const SIPS = [['Cheers.', 'One more.', 'Refreshing.'], ['Feeling good.', 'Okay, okay.', 'That one went down easy.'],
  ['Is the room moving?', 'Who tilted the floor?', 'This is fine.'], ['Bad idea.', 'Maybe sit down.', 'The walls are breathing.']];
function drink() {
  if (S.mode !== 'world' && S.mode !== 'outside') return;      // the bar cart at home, or a beer at Lucky's
  S.drinks += 1; wobbleFilter();
  if (S.drinks >= S.limit) { toast('Goodnight.', 2000); blackout(); return; }
  const tier = SIPS[Math.min(3, Math.floor(S.drinks / S.limit * 4))];
  toast('🍺 ' + tier[Math.floor(Math.random() * tier.length)], 2000);
}
let blackFrom = 'world';
function blackout() {
  blackFrom = S.mode; S.mode = 'blackout'; $('prompt').classList.add('hidden');
  const b = $('black'); b.style.transition = 'opacity 1.8s ease'; b.style.opacity = 1;
  setTimeout(() => { canvas.style.filter = ''; if (blackFrom === 'outside') { golf?.leave(); lastHud = ''; $('ghud').innerHTML = ''; showWorldHud(true); blackFrom = 'world'; } wake(); }, 2700);
}

/* ------------------------------------------------------------------ panels */
let panelClose = null;
function openPanel(html, onClose) {
  panelFrom = S.mode === 'outside' ? 'outside' : 'world'; S.mode = 'panel'; panelClose = onClose || null;
  for (const k in keys) keys[k] = false; stick.f = stick.s = 0;
  $('panelBody').innerHTML = html; $('panel').classList.remove('hidden');
  $('prompt').classList.add('hidden'); $('controls').classList.remove('show'); setPaused(false); unlock(); touchUI();
}
function closePanel() {
  if (S.mode !== 'panel') return;
  $('panel').classList.add('hidden'); S.mode = panelFrom;
  if (panelClose) panelClose(); panelClose = null;
  showWorldHud(panelFrom !== 'outside'); wobbleFilter(); lock();
}
$('back').addEventListener('click', closePanel);

function openEmail() {
  openPanel(`
    <h2>Send me a message</h2>
    <p>Write a note and hit send. It opens in your email app, addressed to me.</p>
    <form id="mailForm">
      <label for="mName">Your name</label><input id="mName" maxlength="60" autocomplete="name">
      <label for="mMsg">Message</label><textarea id="mMsg" maxlength="2000" required></textarea>
      <div class="row" style="justify-content:flex-start;margin-top:14px">
        <button class="btn" type="submit">Send</button>
        <a class="btn ghost" style="text-decoration:none" href="mailto:${LINKS.email}">${LINKS.email}</a>
      </div>
    </form>`);
  $('mailForm').addEventListener('submit', e => {
    e.preventDefault();
    const name = $('mName').value.trim(), msg = $('mMsg').value.trim();
    const plane = $('plane'); plane.classList.remove('fly'); void plane.offsetWidth; plane.classList.add('fly');
    const href = `mailto:${LINKS.email}?subject=${encodeURIComponent('Hello from ' + (name || 'your website'))}&body=${encodeURIComponent(msg + (name ? `\n\n— ${name}` : ''))}`;
    setTimeout(() => { location.href = href; toast('Opening your email app…', 2600); }, 950);
  });
  if (!TOUCH) setTimeout(() => $('mName')?.focus(), 50);
}
function openLink(url) {
  for (const k in keys) keys[k] = false;
  let w = null; try { w = window.open(url, '_blank'); if (w) w.opener = null; } catch { /* blocked */ }
  if (!w) location.href = url;                 // pop-up blocked: go there directly
  else unlock();
}
function openLinkedIn() { openLink(LINKS.linkedin); }
function tryFrontDoor() { goOutside(); }      // the front door is open to everyone

/* ------------------------------------------------------------------ the world outside */
let golf = null, panelFrom = 'world';
function fadeThrough(mid) {
  const b = $('black'); b.style.transition = 'opacity .35s ease'; b.style.opacity = 1;
  setTimeout(() => { mid(); b.style.opacity = 0; }, 380);
}
function goOutside() {
  fadeThrough(() => {
    if (!golf) golf = createGolf(THREE, { ...ctx, finish: golfFinish, goInside, toast, drink,
      fade() { const b = $('black'); b.style.transition = 'none'; b.style.opacity = 1; requestAnimationFrame(() => { b.style.transition = 'opacity .7s ease'; b.style.opacity = 0; }); } });
    golf.camera.aspect = innerWidth / innerHeight; golf.camera.updateProjectionMatrix();
    golf.enter(); S.mode = 'outside'; lastHud = ''; showWorldHud(false); wobbleFilter();
  });
}
function goInside() {
  fadeThrough(() => { golf?.leave(); S.mode = 'world'; S.pos.set(13.3, 1.62, 3.9); S.yaw = 0; S.pitch = 0; lastHud = ''; $('ghud').innerHTML = ''; showWorldHud(true); wobbleFilter(); });
}
function golfFinish(r) {
  const total = r.card.reduce((a, v) => a + v, 0), par = r.pars.reduce((a, v) => a + v, 0), d = total - par;
  const cell = (v, p) => `<td class="${v < p ? 'under' : v > p ? 'over' : ''}">${v}</td>`;
  openPanel(`
    <h2>Story St. Golf Club</h2>
    <div class="big">${total} <span style="font-size:24px">(${d === 0 ? 'even' : d > 0 ? '+' + d : d})</span></div>
    <table class="card"><tr><th>Hole</th>${r.pars.map((_, i) => `<td>${i + 1}</td>`).join('')}<td>Out</td></tr>
      <tr><th>Par</th>${r.pars.map(p => `<td>${p}</td>`).join('')}<td>${par}</td></tr>
      <tr><th>You</th>${r.card.map((v, i) => cell(v, r.pars[i])).join('')}<td>${total}</td></tr></table>
    ${scoreFormHtml()}
    <ul class="board" id="resBoard" style="margin-top:16px;font-size:14px"></ul>
    <div class="row" style="justify-content:flex-start;margin-top:16px"><button class="btn small" id="again">Play another round</button></div>`);
  fillBoard('golf', $('resBoard'), 8);
  $('again').addEventListener('click', () => { closePanel(); golf.reset(); });
  $('scoreForm').addEventListener('submit', async e => {
    e.preventDefault();
    const nm = readInitials(); if (!nm) return;
    $('scoreForm').innerHTML = '<p style="margin:0">Posting…</p>';
    const ok = await LB.submit('golf', nm, total);
    $('scoreForm').innerHTML = `<p style="margin:0">${ok ? 'Posted as ' + esc(nm) + '.' : 'Saved on this device. The global board could not be reached.'}</p>`;
    fillBoard('golf', $('resBoard'), 8);
  });
}
function openInstagram() {
  const b = $('black'); b.style.transition = 'none'; b.style.background = '#fff'; b.style.opacity = 0.9;       // camera flash
  setTimeout(() => { b.style.transition = 'opacity .5s ease'; b.style.opacity = 0; setTimeout(() => (b.style.background = '#000'), 520); }, 60);
  openLink(LINKS.instagram);
}

/* ------------------------------------------------------------------ games */
const MAKERS = { lacrosse: createLacrosse, rocket: createRocket, parkour: createParkour };
const BLURB = {
  lacrosse: TOUCH ? 'Drag to aim. Hold SHOOT and release at full power. 30 seconds.' : 'Aim with the mouse. Hold click and release at full power. 30 seconds.',
  rocket: 'Launch, drop stage 2 at the right moment, then land the booster on what fuel is left. Watch the wind.',
  parkour: TOUCH ? 'Run three live charts. Dodge crashes, spikes and bears.' : 'Run three live charts. Space to jump. Dodge crashes, spikes and bears.',
};
// Leaderboard entries are three initials. You type them once; after that every score posts under the same ones.
function savedInitials() { try { return LB.cleanInitials(localStorage.getItem('mmjr.initials')); } catch { return ''; } }
function scoreFormHtml() {
  const ini = savedInitials();
  return ini
    ? `<form id="scoreForm" class="row" style="justify-content:flex-start;align-items:center"><p style="margin:0">Posting as <b class="ini">${ini}</b></p><button class="btn" type="submit">Post score</button></form>`
    : `<form id="scoreForm" class="row" style="justify-content:flex-start;align-items:flex-end">
      <div><label for="pName">Your 3 initials (used for every score from now on)</label>
      <input id="pName" class="ini" maxlength="3" minlength="3" required pattern="[A-Za-z0-9]{3}" placeholder="AAA" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
      <button class="btn" type="submit">Post score</button></form>`;
}
function readInitials() {
  const had = savedInitials(); if (had) return had;
  const inp = $('pName'), ini = LB.cleanInitials(inp?.value);
  if (!ini) { if (inp) { inp.value = ''; inp.placeholder = 'Try 3 others'; inp.focus(); } return ''; }
  try { localStorage.setItem('mmjr.initials', ini); } catch { /* ignore */ }
  return ini;
}
async function fillBoard(game, el, n = 5) {
  if (!el) return;
  const rows = await LB.top(game, n);
  el.innerHTML = `<li class="tag">${LB.isGlobal() ? 'Global top ' + n : 'Top scores on this device'}</li>` +
    (rows.length ? rows.map((r, i) => `<li><span>${i + 1}. ${esc(r.name)}</span><b>${LB.GAMES[game].fmt(r.score)}</b></li>`).join('') : '<li>No scores yet. Be the first.</li>');
}
function openGames() {
  const play = g => g === 'rocket'
    ? Object.entries(VEHICLES).map(([k, v]) => `<button class="btn small" style="width:100%;margin-bottom:6px" data-play="rocket" data-vehicle="${k}" title="${esc(v.blurb)}">${v.name}</button>`).join('')
    : `<button class="btn small" data-play="${g}">Play</button>`;
  openPanel(`
    <h2>Game night</h2>
    <p>${TOUCH ? 'Pick a game. Tap Exit any time to come back.' : 'Pick a game. Press E or Esc any time to come back.'}</p>
    <div class="games">${Object.keys(MAKERS).map(g => `
      <div class="game"><h3>${LB.GAMES[g].title}</h3><p>${BLURB[g]}</p>
        ${play(g)}
        <ul class="board" id="board-${g}"></ul></div>`).join('')}
    </div>`);
  document.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => startGame(b.dataset.play, b.dataset.vehicle ? { vehicle: b.dataset.vehicle } : {})));
  Object.keys(MAKERS).forEach(g => fillBoard(g, $('board-' + g)));
}
function disposeGame() {
  if (!active) return;
  active.scene.traverse(o => {
    o.geometry?.dispose?.();
    const m = o.material; (Array.isArray(m) ? m : m ? [m] : []).forEach(x => { x.map?.dispose?.(); x.dispose?.(); });
  });
  active = null;
}
let lastHud = '';
const ctx = {
  keys, axes, touch: TOUCH,
  hud(html) { if (html !== lastHud) { lastHud = html; $('ghud').innerHTML = html; } },
  finish(result) { showResult(activeName, result); },
};
function startGame(name, opt = {}) {
  disposeGame();
  $('panel').classList.add('hidden'); panelClose = null;
  for (const k in keys) keys[k] = false; stick.f = stick.s = 0;
  activeName = name; activeOpt = opt; lastHud = ''; $('ghud').innerHTML = '';
  active = MAKERS[name](THREE, ctx, opt);
  active.camera.aspect = innerWidth / innerHeight; active.camera.updateProjectionMatrix();
  S.mode = 'game'; wobbleFilter(); setPaused(false); showWorldHud(false); $('controls').classList.remove('show');
  lock();
}
function exitGame(toMenu) {
  if (S.mode !== 'game') return;
  S.mode = 'world'; disposeGame(); showWorldHud(true); wobbleFilter();
  if (toMenu) openGames(); else lock();
}
function showResult(name, r) {
  if (S.mode !== 'game') return;
  S.mode = 'world'; showWorldHud(true); wobbleFilter();
  const g = LB.GAMES[name], opt = activeOpt;
  openPanel(`
    <h2>${g.title}</h2>
    <div class="big">${esc(r.headline)}</div>
    <p>${esc(r.text || '')}</p>
    ${r.submit === false ? '' : `
    ${scoreFormHtml()}`}
    <ul class="board" id="resBoard" style="margin-top:16px;font-size:14px"></ul>
    <div class="row" style="justify-content:flex-start;margin-top:16px">
      <button class="btn small" id="again">Play again</button>
      <button class="btn ghost small" id="menu">All games</button>
    </div>`, disposeGame);
  fillBoard(name, $('resBoard'), 8);
  $('again').addEventListener('click', () => startGame(name, opt));
  $('menu').addEventListener('click', () => { disposeGame(); openGames(); });
  $('scoreForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const nm = readInitials(); if (!nm) return;
    $('scoreForm').innerHTML = '<p style="margin:0">Posting…</p>';
    const ok = await LB.submit(name, nm, r.score);
    $('scoreForm').innerHTML = `<p style="margin:0">${ok ? 'Posted as ' + esc(nm) + '.' : 'Saved on this device. The global board could not be reached.'}</p>`;
    fillBoard(name, $('resBoard'), 8);
  });
}

/* ------------------------------------------------------------------ input: keyboard + mouse */
const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
addEventListener('keydown', e => {
  if (typing(e)) { if (e.code === 'Escape') { e.target.blur(); closePanel(); } return; }
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyE' || e.code === 'Escape') {
    if (S.mode === 'panel') closePanel();
    else if (S.mode === 'game') exitGame(true);
    else if (S.paused) { if (e.code === 'KeyE') { setPaused(false); lock(); } }
    else if (S.mode === 'world' && e.code === 'KeyE') use();
    else if (S.mode === 'outside' && e.code === 'KeyE') golf.use();
    else if (S.mode === 'outside' && e.code === 'Escape') setPaused(true);
  } else if (S.mode === 'outside' && !S.paused && e.code === 'KeyC') golf.summon();
  else if (S.mode === 'outside' && !S.paused && e.code === 'KeyQ') golf.quit(); else if (e.code === 'Space' && S.mode === 'game') active?.down?.('key');
  else if (e.code === 'Space' && S.mode === 'outside' && !S.paused) golf.down('key');
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space') { if (S.mode === 'game') active?.up?.('key'); else if (S.mode === 'outside') golf.up(); } });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('mousemove', e => { if (locked()) look(e.movementX, e.movementY); });
function look(dx, dy) {
  if (S.mode === 'game') { active?.look?.(dx, dy); return; }
  if (S.mode === 'outside') { if (!S.paused) golf.look(dx, dy); return; }
  if (S.mode !== 'world' || S.paused) return;
  S.yaw -= dx * 0.0022; S.pitch = clamp(S.pitch - dy * 0.0022, -1.45, 1.45);
}
canvas.addEventListener('mousedown', e => {
  if (TOUCH || e.button !== 0) return;
  if (S.mode === 'game') { if (locked() || FREE) active?.down?.('mouse'); else lock(); return; }
  if (S.mode === 'outside') { if (S.paused) return; if (locked() || FREE) golf.down('mouse'); else lock(); return; }
  if ((S.mode === 'world' || S.mode === 'waking') && !S.paused) { if (locked() || FREE) use(); else lock(); }
});
addEventListener('mouseup', e => { if (e.button !== 0) return; if (S.mode === 'game') active?.up?.('mouse'); else if (S.mode === 'outside') golf.up(); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

/* ------------------------------------------------------------------ input: touch (joystick + drag look + action button) */
const tu = { joy: null, look: null };
function touchUI() {
  const el = $('touch'); if (!el) return;
  const on = TOUCH && (S.mode === 'world' || S.mode === 'game' || S.mode === 'waking' || S.mode === 'outside');
  el.classList.toggle('hidden', !on);
}
if (TOUCH) {
  const el = document.createElement('div'); el.id = 'touch'; el.className = 'hidden';
  el.innerHTML = `<div id="tJoy"><i id="tKnob"></i></div><button id="tAct">USE</button><button id="tCall" class="tMini hidden">CART</button><button id="tQuit" class="tMini hidden">QUIT GOLF</button><button id="tTurbo" class="tCart hidden">TURBO</button><button id="tDrift" class="tCart hidden">DRIFT</button><button id="tExit" class="hidden">✕ Exit</button>`;
  document.body.appendChild(el);
  const css = document.createElement('style');
  css.textContent = `
    canvas#c{touch-action:none} body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
    #touch{position:fixed;inset:0;z-index:12;pointer-events:none}
    #tJoy{position:absolute;left:max(22px,env(safe-area-inset-left));bottom:max(26px,env(safe-area-inset-bottom));width:124px;height:124px;border-radius:50%;
      background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.35)}
    #tKnob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,255,255,.75)}
    #tAct{position:absolute;right:max(26px,env(safe-area-inset-right));bottom:max(40px,env(safe-area-inset-bottom));width:96px;height:96px;border-radius:50%;pointer-events:auto;
      background:rgba(242,180,65,.9);color:#1a1303;border:0;font-weight:800;font-size:13.5px;letter-spacing:.03em;touch-action:none}
    #tAct:active{filter:brightness(1.15)}
    .tCart{position:absolute;right:max(132px,calc(env(safe-area-inset-right) + 106px));width:72px;height:72px;border-radius:50%;pointer-events:auto;background:rgba(16,21,31,.82);color:#fff;border:2px solid rgba(255,255,255,.4);font-weight:800;font-size:11.5px;letter-spacing:.03em;touch-action:none}
    .tMini{position:absolute;left:12px;pointer-events:auto;background:rgba(16,21,31,.85);color:#fff;border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:8px 13px;font-weight:700;font-size:12px;letter-spacing:.03em}
    #tCall{top:136px} #tQuit{top:176px}
    .tCart.on{background:rgba(242,180,65,.92);color:#1a1303} #tTurbo{bottom:max(118px,calc(env(safe-area-inset-bottom) + 78px))} #tDrift{bottom:max(34px,env(safe-area-inset-bottom))}
    #tExit{position:absolute;left:12px;top:12px;pointer-events:auto;background:rgba(16,21,31,.85);color:#fff;border:1px solid rgba(255,255,255,.2);
      border-radius:999px;padding:9px 14px;font-weight:600;font-size:14px}
    .g-wind{top:60px;left:12px;font-size:12px} .g-clubs span{padding:3px 6px;font-size:11px} .g-tip{display:none} .g-bar.golf{width:240px} .g-prompt{top:64%} #panel .hint{display:none} .g-exit{display:none} .g-plaque{display:none} .g-side{top:auto;bottom:150px;right:12px;font-size:11.5px;min-width:150px;padding:8px 10px} .g-side.left{left:12px;right:auto;top:96px;bottom:auto;min-width:0}
    .g-acc{width:240px;bottom:150px} .g-bar.golf{bottom:186px} .g-clubs{bottom:216px} #gmap{top:8px;right:8px}
    .g-top{top:12px;max-width:96vw;flex-wrap:wrap;justify-content:center} .pill{font-size:12.5px;padding:6px 10px} .g-bar{bottom:150px;width:200px} .g-msg{font-size:22px;white-space:normal;width:86vw}
    .g-band{width:220px} #controls{white-space:normal;width:80vw}`;
  document.head.appendChild(css);
  const knob = () => $('tKnob'), base = () => $('tJoy');
  const setStick = (x, y) => {
    const r = base().getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 8;
    let dx = x - cx, dy = y - cy; const d = Math.hypot(dx, dy); if (d > max) { dx *= max / d; dy *= max / d; }
    knob().style.transform = `translate(${dx}px,${dy}px)`;
    const nx = dx / max, ny = dy / max, dead = 0.14;
    stick.s = Math.abs(nx) < dead ? 0 : nx; stick.f = Math.abs(ny) < dead ? 0 : -ny;
  };
  const inJoyZone = t => t.clientX < innerWidth * 0.45 && t.clientY > innerHeight * 0.4;
  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (tu.joy === null && inJoyZone(t)) { tu.joy = t.identifier; setStick(t.clientX, t.clientY); }
      else if (tu.look === null) tu.look = { id: t.identifier, x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, t0: performance.now() };
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === tu.joy) setStick(t.clientX, t.clientY);
      else if (tu.look && t.identifier === tu.look.id) {
        look((t.clientX - tu.look.x) * 2.4, (t.clientY - tu.look.y) * 2.4);
        tu.look.x = t.clientX; tu.look.y = t.clientY;
      }
    }
  }, { passive: false });
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === tu.joy) { tu.joy = null; stick.f = stick.s = 0; knob().style.transform = ''; }
      else if (tu.look && t.identifier === tu.look.id) {
        const L = tu.look; tu.look = null;
        const tap = Math.hypot(t.clientX - L.x0, t.clientY - L.y0) < 12 && performance.now() - L.t0 < 320;
        if (tap && S.mode === 'world') use(t.clientX, t.clientY);
        else if (tap && S.mode === 'outside' && (golf.S.state === 'foot' || golf.S.state === 'bar')) golf.use(true);
      }
    }
  };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  const act = $('tAct');
  act.addEventListener('touchstart', e => { e.preventDefault(); if (S.mode === 'game') active?.down?.('btn'); else if (S.mode === 'outside') golf.down('btn'); else if (S.mode === 'world') use(); }, { passive: false });
  act.addEventListener('touchend', e => { e.preventDefault(); if (S.mode === 'game') active?.up?.('btn'); else if (S.mode === 'outside') golf.up(); }, { passive: false });
  $('tExit').addEventListener('click', () => { if (S.mode === 'outside') golf.back(); else exitGame(true); });
  $('tCall').addEventListener('click', () => { if (S.mode === 'outside') golf.summon(); });
  $('tQuit').addEventListener('click', () => { if (S.mode === 'outside') golf.quit(); });
  for (const [id, code] of [['tTurbo', 'Space'], ['tDrift', 'ShiftLeft']]) {            // cart buttons: hold to boost or slide
    const b = $(id), set = v => e => { e.preventDefault(); keys[code] = v; b.classList.toggle('on', v); };
    b.addEventListener('touchstart', set(true), { passive: false }); b.addEventListener('touchend', set(false), { passive: false }); b.addEventListener('touchcancel', set(false), { passive: false });
  }
}

/* ------------------------------------------------------------------ interaction */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function findTarget(px, py) {
  if (px === undefined) ndc.set(0, 0); else ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
  ray.far = px === undefined ? 3.4 : 5;
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(interactables, true)[0];
  if (!hit) return null;
  let o = hit.object; while (o && !o.userData.interact) o = o.parent;
  return o ? o.userData.interact : null;
}
function use(px, py) {
  if (S.mode !== 'world') return;
  const t = px === undefined ? (S.target || findTarget()) : (findTarget(px, py) || S.target);
  if (t) t.fn();
}

/* ------------------------------------------------------------------ world update */
let lastLabel = '';
function updateWorld(dt) {
  S.t += dt;
  if (S.mode === 'waking') updateWake(dt);
  if (DOOR.open && DOOR.t < 1) { DOOR.t = Math.min(1, DOOR.t + dt / 0.7); DOOR.group.rotation.y = ease(DOOR.t) * 1.85; }
  if (buddy.head) {                               // he watches you walk around, and breathes
    const p = buddy.root.position; let want = Math.atan2(-(S.pos.x - p.x), -(S.pos.z - p.z)) - buddy.root.rotation.y;
    want = Math.atan2(Math.sin(want), Math.cos(want));
    buddy.yaw += (clamp(want, -1.1, 1.1) - buddy.yaw) * Math.min(1, dt * 3);
    buddy.head.rotation.y = buddy.yaw; buddy.head.rotation.x = Math.sin(S.t * 0.8) * 0.03;
    buddy.head.position.y = 1.19 + Math.sin(S.t * 1.6) * 0.004;
  }
  const moving = S.mode === 'world' && !S.paused;
  const d = S.drinks;
  if (moving) {
    const { f, s } = axes();
    let vx = 0, vz = 0;
    if (f || s) {
      const sp = (keys.ShiftLeft || keys.ShiftRight ? 5.4 : 3.5) * Math.min(1, Math.hypot(f, s));
      const sin = Math.sin(S.yaw), cosv = Math.cos(S.yaw), n = Math.hypot(f, s) || 1;
      vx = (-sin * f + cosv * s) / n * sp; vz = (-cosv * f - sin * s) / n * sp;
      S.bob += dt * sp * 2.4;
    }
    if (d > 0) { vx += Math.sin(S.t * 0.9) * 0.1 * d; vz += Math.cos(S.t * 0.7 + 1) * 0.1 * d; }   // the floor gets less trustworthy
    const nx = S.pos.x + vx * dt, nz = S.pos.z + vz * dt;
    if (!blocked(nx, S.pos.z)) S.pos.x = nx;
    if (!blocked(S.pos.x, nz)) S.pos.z = nz;
    if (!S.seenLiving && S.pos.x > 4.4) { S.seenLiving = true; toast('Welcome to the living room. Look around.', 2600); }
  }
  const w = d * 0.016;
  camera.position.set(S.pos.x, S.pos.y + (S.mode === 'waking' ? 0 : Math.sin(S.bob) * 0.025), S.pos.z);
  camera.rotation.set(
    S.pitch + Math.sin(S.t * 1.1 + 2) * w * 0.7,
    S.yaw + Math.sin(S.t * 0.6) * w * 1.2,
    S.roll + Math.sin(S.t * 0.85) * w * 1.6);
  const fov = 72 + Math.sin(S.t * 0.75) * d * 0.9;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

  if (moving) {
    S.target = findTarget();
    $('cross').classList.toggle('hot', !!S.target);
    const p = $('prompt');
    if (S.target) { p.innerHTML = TOUCH ? `Tap or USE — ${S.target.label}` : `<kbd>E</kbd> or click — ${S.target.label}`; p.classList.remove('hidden'); }
    else p.classList.add('hidden');
  } else S.target = null;
}

/* ------------------------------------------------------------------ loop */
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  for (const c of [camera, active?.camera, golf?.camera]) if (c) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
});
let last = performance.now(), blurStep = 0, cartBtns = false;
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  // the beers slowly wear off: about one per minute (not while you are mid-game or blacked out)
  if (S.drinks > 0 && !S.paused && (S.mode === 'world' || S.mode === 'outside' || S.mode === 'panel')) {
    S.drinks = Math.max(0, S.drinks - dt / 60);
    const q = Math.round(S.drinks * 5); if (q !== blurStep) { blurStep = q; wobbleFilter(); }
  }
  if (S.mode === 'game' && active) {
    if (!S.paused) active.update(dt);
    renderer.render(active.scene, active.camera);
  } else if (golf && (S.mode === 'outside' || (S.mode === 'panel' && panelFrom === 'outside') || (S.mode === 'blackout' && blackFrom === 'outside'))) {
    if (S.mode === 'outside' && !S.paused) golf.update(dt);
    renderer.render(golf.scene, golf.camera);
  } else { updateWorld(dt); renderer.render(scene, camera); }
  // "click to look" hint whenever the mouse is free but you are walking or playing
  const hint = !FREE && !locked() && !S.paused && (S.mode === 'world' || S.mode === 'game' || S.mode === 'outside') && !$('controls').classList.contains('show');
  $('clickhint').classList.toggle('hidden', !hint);
  if (hint) $('clickhint').textContent = S.mode === 'game' ? 'Click to play' : 'Click to look around';
  if (TOUCH) {
    const lb = S.mode === 'game' ? (active?.label || 'GO') : S.mode === 'outside' ? golf.label : 'USE'; if (lb !== lastLabel) { lastLabel = lb; $('tAct').textContent = lb; }
    $('tExit').classList.toggle('hidden', !(S.mode === 'game' || (S.mode === 'outside' && golf.canBack)));
    const out = S.mode === 'outside' && !S.paused, gs = out ? golf.S.state : '';
    $('tCall').classList.toggle('hidden', !(gs === 'foot' || gs === 'landed')); $('tQuit').classList.toggle('hidden', !(out && golf.S.golf && gs !== 'bar' && gs !== 'pool'));
    const inCart = S.mode === 'outside' && golf.S.state === 'cart' && !S.paused;
    if (inCart !== cartBtns) { cartBtns = inCart; for (const id of ['tTurbo', 'tDrift']) { $(id).classList.toggle('hidden', !inCart); $(id).classList.remove('on'); } if (!inCart) keys.Space = keys.ShiftLeft = false; }
  }
  requestAnimationFrame(frame);
}
// first visit: you are simply standing in the bedroom. The wake-up blink only plays after a blackout.
showWorldHud(true);
S.mode = 'world'; S.pos.copy(BED.stand); S.yaw = -Math.PI / 2 - 0.25; S.pitch = -0.05; S.roll = 0;
S.limit = 8 + Math.floor(Math.random() * 5); lids(0); touchUI(); showControls();
// a key you already won on this device is still yours on later visits
requestAnimationFrame(frame);

if (TEST) window.__g = { goOutside, get golf() { return golf; }, S, keys, stick, openDoor, drink, startGame, openGames, openEmail, closePanel, exitGame, get active() { return active; }, camera, DOOR, colliders };
