import * as THREE from '../vendor/three.module.min.js';
import { createLacrosse, createRocket, createParkour } from './games.js';
import * as LB from './leaderboard.js';

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
  showLite('Your browser could not start the 3D view, so here are the links.');
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, TOUCH ? 1.75 : 2));
renderer.setSize(innerWidth, innerHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0d14);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';

scene.add(new THREE.HemisphereLight(0xfff3df, 0x4a4038, 1.5));
scene.add(new THREE.AmbientLight(0xffffff, 0.45));

/* ------------------------------------------------------------------ builders */
const mats = new Map();
const mat = (color, o = {}) => {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshLambertMaterial({ color, ...o }));
  return mats.get(k);
};
const colliders = [];
const col = (cx, cz, w, d) => colliders.push({ x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 });

function box(parent, w, h, d, color, x, y, z, o) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof color === 'object' ? color : mat(color, o));
  m.position.set(x, y, z); parent.add(m); return m;
}
function cyl(parent, rt, rb, h, color, x, y, z, seg = 16, o) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), typeof color === 'object' ? color : mat(color, o));
  m.position.set(x, y, z); parent.add(m); return m;
}
function sph(parent, r, color, x, y, z, o) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), mat(color, o));
  m.position.set(x, y, z); parent.add(m); return m;
}
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function plane(parent, w, h, texture, x, y, z, ry = 0, basic = true) {
  const M = basic ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new M({ map: texture, transparent: true }));
  m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m;
}
function group(x, y, z, parent = scene) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

const interactables = [];
function interact(g, label, fn) { g.userData.interact = { label, fn }; interactables.push(g); }

function room(cx, cz, w, d, h, floorC, wallC, ceilC) {
  box(scene, w, 0.2, d, floorC, cx, -0.1, cz);
  box(scene, w, 0.2, d, ceilC, cx, h + 0.1, cz);
  box(scene, w, h, 0.2, wallC, cx, h / 2, cz - d / 2 - 0.1); col(cx, cz - d / 2 - 0.1, w + 1, 0.2);
  box(scene, w, h, 0.2, wallC, cx, h / 2, cz + d / 2 + 0.1); col(cx, cz + d / 2 + 0.1, w + 1, 0.2);
  box(scene, 0.2, h, d, wallC, cx - w / 2 - 0.1, h / 2, cz); col(cx - w / 2 - 0.1, cz, 0.2, d + 1);
  box(scene, 0.2, h, d, wallC, cx + w / 2 + 0.1, h / 2, cz); col(cx + w / 2 + 0.1, cz, 0.2, d + 1);
  // baseboards
  for (const s of [-1, 1]) {
    box(scene, w, 0.1, 0.03, 0xf5f1e8, cx, 0.05, cz + s * (d / 2 - 0.015));
    box(scene, 0.03, 0.1, d, 0xf5f1e8, cx + s * (w / 2 - 0.015), 0.05, cz);
  }
}
function lamp(x, y, z, intensity = 14, color = 0xffd9a0) {
  const l = new THREE.PointLight(color, intensity, 16, 1.6); l.position.set(x, y, z); scene.add(l); return l;
}
function plant(x, z) {
  cyl(scene, 0.2, 0.15, 0.36, 0xb5653a, x, 0.18, z);
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05, m = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.85, 6), mat(i % 2 ? 0x2f7d4f : 0x3c9460));
    m.position.set(x + Math.cos(a) * 0.12, 0.75, z + Math.sin(a) * 0.12);
    m.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); scene.add(m);
  }
  col(x, z, 0.45, 0.45);
}
function windowPane(x, y, z, ry, w = 1.6, h = 1.2) {
  const g = group(x, y, z); g.rotation.y = ry;
  const sky = tex(256, 192, (c, W, H) => {
    const gr = c.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#8ec5ff'); gr.addColorStop(1, '#ffe2b8');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    c.fillStyle = 'rgba(40,52,74,.9)';
    [[10, 70, 40], [55, 100, 36], [95, 60, 44], [145, 90, 40], [190, 50, 50]].forEach(([bx, bh, bw]) => c.fillRect(bx, H - bh, bw, bh));
    c.fillStyle = 'rgba(255,236,170,.9)';
    for (let i = 0; i < 26; i++) c.fillRect(14 + (i * 37) % 220, H - 12 - (i * 23) % 84, 5, 7);
  });
  plane(g, w, h, sky, 0, 0, 0.02);
  box(g, w + 0.14, 0.07, 0.06, 0xf5f1e8, 0, h / 2, 0.03); box(g, w + 0.14, 0.07, 0.06, 0xf5f1e8, 0, -h / 2, 0.03);
  box(g, 0.07, h, 0.06, 0xf5f1e8, -w / 2, 0, 0.03); box(g, 0.07, h, 0.06, 0xf5f1e8, w / 2, 0, 0.03);
  box(g, 0.04, h, 0.05, 0xf5f1e8, 0, 0, 0.03); box(g, w, 0.04, 0.05, 0xf5f1e8, 0, 0, 0.03);
}
function sign(text, w, h, bg, fg, font = 'bold 84px Georgia, serif', border = true) {
  return tex(1024, Math.round(1024 * h / w), (c, W, H) => {
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    if (border) { c.strokeStyle = fg; c.lineWidth = 10; c.strokeRect(14, 14, W - 28, H - 28); }
    c.fillStyle = fg; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, W / 2, H / 2 + 4);
  });
}

/* ------------------------------------------------------------------ bedroom  (x -3.5..3.5, z -3..3) */
const BED = { lie: new THREE.Vector3(-2.5, 0.78, -2.25), stand: new THREE.Vector3(-1.15, 1.62, -1.1) };
(function bedroom() {
  room(0, 0, 7, 6, 2.8, 0x8a6a4a, 0xcbd3cf, 0xf3f0ea);
  lamp(0, 1.9, 0, 9);
  cyl(scene, 0.22, 0.3, 0.12, 0xf5f1e8, 0, 2.74, 0, 16, { emissive: 0xffe6b0, emissiveIntensity: 0.9 });
  // bed (head against the -z wall)
  box(scene, 1.7, 0.3, 2.2, 0x5d4632, -2.5, 0.15, -1.85);
  box(scene, 1.6, 0.22, 2.1, 0xf2efe8, -2.5, 0.41, -1.85);
  box(scene, 1.64, 0.12, 1.35, 0x3d5a80, -2.5, 0.5, -1.45);
  box(scene, 1.7, 0.95, 0.1, 0x5d4632, -2.5, 0.6, -2.93);
  box(scene, 0.62, 0.13, 0.4, 0xffffff, -2.88, 0.58, -2.6); box(scene, 0.62, 0.13, 0.4, 0xffffff, -2.12, 0.58, -2.6);
  col(-2.5, -1.85, 1.7, 2.2);
  // nightstand + lamp
  box(scene, 0.5, 0.5, 0.45, 0x6b4a2f, -1.35, 0.25, -2.72); col(-1.35, -2.72, 0.5, 0.45);
  cyl(scene, 0.05, 0.08, 0.22, 0x333333, -1.35, 0.61, -2.72);
  cyl(scene, 0.1, 0.16, 0.2, 0xfff0cc, -1.35, 0.8, -2.72, 16, { emissive: 0xffd68a, emissiveIntensity: 0.9 });
  lamp(-1.35, 1.0, -2.5, 4);
  // dresser
  box(scene, 1.7, 0.95, 0.5, 0x6b4a2f, 1.4, 0.475, -2.7); col(1.4, -2.7, 1.7, 0.5);
  for (let i = 0; i < 3; i++) for (const s of [-0.42, 0.42]) box(scene, 0.72, 0.24, 0.02, 0x7d5a3c, 1.4 + s, 0.2 + i * 0.29, -2.44);
  box(scene, 0.5, 0.36, 0.04, 0x222831, 1.0, 1.15, -2.8); // little mirror/frame
  cyl(scene, 0.07, 0.07, 0.2, 0x9aa8b5, 1.9, 1.05, -2.7);
  // rug, chair, window, art
  cyl(scene, 1.25, 1.25, 0.02, 0xb9a48a, 0.4, 0.011, 0.5, 32);
  cyl(scene, 1.0, 1.0, 0.022, 0xd9c9ae, 0.4, 0.012, 0.5, 32);
  windowPane(-0.8, 1.55, 2.98, Math.PI);
  box(scene, 0.03, 0.9, 0.7, 0x24344d, -3.48, 1.6, 0.8); box(scene, 0.035, 0.74, 0.54, 0xe9c46a, -3.47, 1.6, 0.8);
  plant(-3.0, 2.5);
  box(scene, 0.9, 0.04, 0.5, 0x6b4a2f, 2.9, 0.72, -0.9); box(scene, 0.05, 0.72, 0.05, 0x333333, 2.55, 0.36, -1.1);
  box(scene, 0.05, 0.72, 0.05, 0x333333, 2.55, 0.36, -0.7); col(2.9, -0.9, 0.9, 0.5);
  // the door (only interactive thing in here)
  const d = group(3.45, 0, 1.3);
  box(d, 0.08, 2.05, 0.92, 0x6b4a2f, 0, 1.025, 0);
  box(d, 0.03, 0.75, 0.6, 0x7d5a3c, -0.045, 1.45, 0); box(d, 0.03, 0.75, 0.6, 0x7d5a3c, -0.045, 0.55, 0);
  sph(d, 0.05, 0xd9b34a, -0.08, 1.0, 0.33);
  box(d, 0.1, 2.15, 0.07, 0xf5f1e8, 0.0, 1.075, -0.5); box(d, 0.1, 2.15, 0.07, 0xf5f1e8, 0.0, 1.075, 0.5);
  box(d, 0.1, 0.08, 1.07, 0xf5f1e8, 0.0, 2.12, 0);
  plane(d, 0.9, 0.2, sign('LIVING ROOM  →', 0.9, 0.2, '#f5f1e8', '#3a3024', 'bold 120px Georgia, serif', false), -0.06, 2.35, 0, -Math.PI / 2);
  interact(d, 'Open the door', enterLiving);
})();

/* ------------------------------------------------------------------ living room (x 32..48, z -6..6) */
const LIVING_SPAWN = new THREE.Vector3(33.3, 1.62, 0);
(function living() {
  room(40, 0, 16, 12, 3.2, 0x9b7b58, 0xe7e0d3, 0xf5f2ec);
  box(scene, 0.02, 3.2, 12, 0x24344d, 47.98, 1.6, 0);            // accent wall behind the TV
  for (const [x, z] of [[36, -2.5], [36, 2.5], [44, -2.5], [44, 2.5]]) {
    lamp(x, 2.1, z, 9);
    cyl(scene, 0.2, 0.28, 0.1, 0xf5f1e8, x, 3.14, z, 16, { emissive: 0xffe6b0, emissiveIntensity: 0.9 });
  }
  // door we came through (decor)
  box(scene, 0.06, 2.05, 0.92, 0x6b4a2f, 32.03, 1.025, 0); sph(scene, 0.05, 0xd9b34a, 32.1, 1.0, -0.33);
  windowPane(41.5, 1.75, -5.98, 0, 2.2, 1.3);

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
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '500 34px system-ui, sans-serif'; c.fillText('Press E to play', W / 2, 500);
  });
  plane(tv, 2.56, 1.38, screen, 0.255, 1.75, 0, -Math.PI / 2);
  box(tv, 0.34, 0.09, 0.3, 0x15171c, -0.02, 0.545, 0.7); box(tv, 0.02, 0.02, 0.04, 0xffffff, -0.19, 0.55, 0.78, { emissive: 0xffffff });
  box(tv, 0.1, 0.5, 0.14, 0x15171c, 0.05, 0.75, -1.05);            // speaker
  interact(tv, 'Play games', openGames);
  // couch faces the TV
  const c1 = 0x4f6d7a;
  box(scene, 0.95, 0.42, 2.6, c1, 44.2, 0.21, 0); box(scene, 0.28, 0.95, 2.6, c1, 43.72, 0.475, 0);
  box(scene, 0.95, 0.62, 0.26, c1, 44.2, 0.31, -1.37); box(scene, 0.95, 0.62, 0.26, c1, 44.2, 0.31, 1.37);
  box(scene, 0.8, 0.14, 1.12, 0x5c7d8b, 44.28, 0.49, -0.6); box(scene, 0.8, 0.14, 1.12, 0x5c7d8b, 44.28, 0.49, 0.6);
  box(scene, 0.16, 0.36, 0.4, 0xe9c46a, 43.95, 0.72, -0.8);
  col(44.1, 0, 1.1, 2.9);
  // rug + coffee table + controllers
  box(scene, 3.6, 0.02, 3.8, 0x8d5b4c, 45.6, 0.011, 0); box(scene, 3.2, 0.022, 3.4, 0xb9836f, 45.6, 0.012, 0);
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

  /* --- Story St. sign --- */
  const st = tex(1024, 220, (c, W, H) => {
    c.fillStyle = '#1f6b3a'; c.fillRect(0, 0, W, H);
    c.strokeStyle = '#fff'; c.lineWidth = 12; c.strokeRect(12, 12, W - 24, H - 24);
    c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'center';
    c.font = 'bold 150px "Arial Narrow", Arial, sans-serif'; c.fillText('STORY', W / 2 - 110, H / 2 + 8);
    c.font = 'bold 84px "Arial Narrow", Arial, sans-serif'; c.fillText('ST', W / 2 + 280, H / 2 - 16);
  });
  box(scene, 1.72, 0.39, 0.03, 0xdfe5e0, 36.4, 2.2, -5.975);
  plane(scene, 1.68, 0.36, st, 36.4, 2.2, -5.955, 0);

  /* --- tombstones --- */
  box(scene, 4.0, 0.06, 0.8, 0x4d7a45, 37.8, 0.03, 5.45);
  ['Jake', 'Leo', 'Nathaniel'].forEach((name, i) => {
    const x = 39.05 - i * 1.25, g = group(x, 0, 5.5);
    box(g, 0.9, 0.12, 0.36, 0x777a80, 0, 0.12, 0);
    box(g, 0.7, 0.75, 0.18, 0x8d9096, 0, 0.555, 0);
    cyl(g, 0.35, 0.35, 0.18, 0x8d9096, 0, 0.93, 0, 24).rotation.x = Math.PI / 2;
    const t = tex(512, 640, (c, W, H) => {
      c.clearRect(0, 0, W, H); c.fillStyle = '#2c2e33'; c.textAlign = 'center';
      c.font = 'bold 110px Georgia, serif'; c.fillText('R.I.P.', W / 2, 250);
      c.fillRect(W / 2 - 120, 300, 240, 6);
      c.font = `bold ${name.length > 6 ? 78 : 100}px Georgia, serif`; c.fillText(name, W / 2, 430);
    });
    plane(g, 0.68, 0.85, t, 0, 0.72, -0.092, Math.PI, false);
    col(x, 5.5, 0.9, 0.4);
  });

  /* --- mailbox --- */
  const mb = group(33.4, 0, 4.9); mb.rotation.y = Math.PI * 0.75;
  box(mb, 0.1, 1.05, 0.1, 0x6b4a2f, 0, 0.525, 0);
  box(mb, 0.3, 0.2, 0.56, 0x2a4b8d, 0, 1.15, 0);
  cyl(mb, 0.15, 0.15, 0.56, 0x2a4b8d, 0, 1.25, 0, 20).rotation.x = Math.PI / 2;
  box(mb, 0.02, 0.22, 0.04, 0xd64545, 0.165, 1.33, -0.1); box(mb, 0.02, 0.1, 0.14, 0xd64545, 0.165, 1.42, -0.05);
  plane(mb, 0.26, 0.12, sign('MAIL', 0.26, 0.12, '#2a4b8d', '#ffffff', 'bold 300px Georgia, serif', false), 0, 1.16, 0.285, 0, false);
  col(33.4, 4.9, 0.5, 0.5);
  interact(mb, 'Send me a message', openEmail);

  /* --- career door --- */
  const cd = group(44.6, 0, 5.94);
  box(cd, 1.0, 2.1, 0.08, 0x1f4e5f, 0, 1.05, 0);
  box(cd, 0.66, 0.7, 0.03, 0x2b6477, 0, 1.5, -0.045); box(cd, 0.66, 0.7, 0.03, 0x2b6477, 0, 0.6, -0.045);
  sph(cd, 0.05, 0xd9b34a, -0.38, 1.02, -0.08);
  box(cd, 0.08, 2.2, 0.1, 0xf5f1e8, -0.54, 1.1, 0); box(cd, 0.08, 2.2, 0.1, 0xf5f1e8, 0.54, 1.1, 0); box(cd, 1.16, 0.08, 0.1, 0xf5f1e8, 0, 2.18, 0);
  plane(cd, 1.0, 0.3, sign('CAREER', 1.0, 0.3, '#f2b441', '#1a1303', 'bold 190px Georgia, serif'), 0, 2.48, -0.06, Math.PI);
  interact(cd, 'Career', openCareer);

  /* --- camera on a tripod --- */
  const cam = group(34.3, 0, -4.7); cam.rotation.y = -Math.PI * 0.72;
  for (let i = 0; i < 3; i++) {
    const a = i * 2.094, leg = cyl(cam, 0.016, 0.016, 1.3, 0x222222, Math.cos(a) * 0.2, 0.62, Math.sin(a) * 0.2, 8);
    leg.rotation.z = Math.cos(a) * 0.32; leg.rotation.x = -Math.sin(a) * 0.32;
  }
  box(cam, 0.34, 0.22, 0.18, 0x1b1d22, 0, 1.36, 0); box(cam, 0.12, 0.05, 0.12, 0x1b1d22, -0.06, 1.49, 0);
  cyl(cam, 0.085, 0.095, 0.16, 0x2c2f36, 0.02, 1.36, 0.16, 20).rotation.x = Math.PI / 2;
  cyl(cam, 0.065, 0.065, 0.01, 0x5d7fa8, 0.02, 1.36, 0.245, 20, { emissive: 0x223a5e }).rotation.x = Math.PI / 2;
  sph(cam, 0.018, 0xd64545, 0.13, 1.44, 0.092, { emissive: 0xd64545 });
  col(34.3, -4.7, 0.55, 0.55);
  interact(cam, 'Instagram', openInstagram);

  /* --- decor --- */
  plant(47.3, -5.3); plant(32.7, -5.3); plant(47.3, 5.3);
  // bookshelf
  box(scene, 1.5, 2.0, 0.34, 0x6b4a2f, 45.2, 1.0, -5.8); col(45.2, -5.8, 1.5, 0.4);
  const bk = [0xd64545, 0xe9c46a, 0x2a9d8f, 0x264653, 0xf4a261, 0x8ecae6, 0x6d597a];
  for (let r = 0; r < 4; r++) {
    box(scene, 1.4, 0.03, 0.3, 0x7d5a3c, 45.2, 0.25 + r * 0.48, -5.76);
    for (let i = 0; i < 9; i++) box(scene, 0.09, 0.26 + ((i * 7 + r * 3) % 5) * 0.025, 0.2, bk[(i + r * 2) % bk.length], 44.62 + i * 0.135, 0.41 + r * 0.48, -5.72);
  }
  // framed art on the +z wall and a floor lamp
  box(scene, 1.3, 0.9, 0.03, 0x222831, 41.2, 1.9, 5.98);
  plane(scene, 1.18, 0.78, tex(256, 170, (c, W, H) => {
    c.fillStyle = '#f5efe2'; c.fillRect(0, 0, W, H); c.fillStyle = '#e76f51'; c.beginPath(); c.arc(90, 80, 46, 0, 7); c.fill();
    c.fillStyle = '#264653'; c.fillRect(130, 40, 86, 96); c.fillStyle = '#e9c46a'; c.fillRect(40, 118, 150, 16);
  }), 41.2, 1.9, 5.96, Math.PI, false);
  cyl(scene, 0.16, 0.18, 0.03, 0x222222, 42.9, 0.015, 1.9); cyl(scene, 0.015, 0.015, 1.6, 0x222222, 42.9, 0.8, 1.9, 8);
  cyl(scene, 0.13, 0.2, 0.26, 0xfff0cc, 42.9, 1.68, 1.9, 16, { emissive: 0xffd68a, emissiveIntensity: 0.8 });
  col(42.9, 1.9, 0.3, 0.3);
})();

/* ------------------------------------------------------------------ state */
const S = {
  mode: 'start',            // start | waking | world | panel | game | blackout | lite
  pos: new THREE.Vector3().copy(BED.lie), yaw: 0, pitch: 0, roll: 0,
  drinks: 0, t: 0, wakeT: 0, paused: false, target: null, bob: 0,
};
const keys = {};
const stick = { f: 0, s: 0 };       // touch joystick
let active = null, activeName = null;
const R = 0.3;
const blocked = (x, z) => colliders.some(c => x > c.x0 - R && x < c.x1 + R && z > c.z0 - R && z < c.z1 + R);
const axes = () => ({
  f: clamp((keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + stick.f, -1, 1),
  s: clamp((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + stick.s, -1, 1),
});

/* ------------------------------------------------------------------ pointer lock / pause */
const locked = () => document.pointerLockElement === canvas;
function lock() {
  if (FREE) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { if (S.mode === 'world' || S.mode === 'game') setPaused(true); });
  } catch { setPaused(true); }
}
function unlock() { if (locked()) document.exitPointerLock(); }
function setPaused(v) { S.paused = v; $('pause').classList.toggle('hidden', !v); }
document.addEventListener('pointerlockchange', () => {
  if (locked()) { setPaused(false); return; }
  if (S.mode === 'game') exitGame(true);
  else if (S.mode === 'world' || S.mode === 'waking') setPaused(true);
});
$('pause').addEventListener('click', lock);

/* ------------------------------------------------------------------ HUD helpers */
let toastTimer;
function toast(msg, ms = 1800) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
function setDrinks() {
  const d = $('drinks'); d.classList.toggle('hidden', S.drinks === 0);
  d.textContent = `🍺 ${S.drinks} / 10`;
  canvas.style.filter = S.drinks > 2 && S.mode !== 'game' ? `blur(${((S.drinks - 2) * 0.3).toFixed(2)}px)` : '';
}
function showWorldHud(v) {
  $('hud').classList.remove('hidden');
  for (const id of ['cross', 'tips']) $(id).classList.toggle('hidden', !v || (id === 'tips' && TOUCH));
  if (!v) $('prompt').classList.add('hidden');
  $('ghud').classList.toggle('hidden', v);
  touchUI();
}

/* ------------------------------------------------------------------ flow: start, wake, rooms */
function showLite(note) {
  S.mode = 'lite';
  for (const id of ['start', 'hud', 'pause', 'panel']) $(id).classList.add('hidden');
  $('lite').classList.remove('hidden'); $('liteNote').textContent = note || '';
  touchUI();
}
$('skipBtn').addEventListener('click', () => showLite(''));
$('enterBtn').addEventListener('click', () => { $('lite').classList.add('hidden'); begin(); });
$('wakeBtn').addEventListener('click', begin);
function begin() {
  $('start').classList.add('hidden'); showWorldHud(true); lock(); wake();
}
function lids(v) { $('lidT').style.height = $('lidB').style.height = `${v * 50.5}%`; }
function wake() {
  S.mode = 'waking'; S.wakeT = 0; S.drinks = 0; setDrinks();
  S.pos.copy(BED.lie); S.yaw = 0.2; S.pitch = 1.35; S.roll = 0.5;
  lids(1); $('black').style.transition = 'none'; $('black').style.opacity = 0;
  $('prompt').classList.add('hidden'); touchUI();
}
function updateWake(dt) {
  S.wakeT += dt; const p = S.wakeT / 4.2;
  // blink twice, then open
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
  if (p >= 1) {
    lids(0); S.mode = 'world';
    toast(TOUCH ? 'Good morning. Head for the door.' : 'Good morning. Head for the door and press E.', 3200);
    if (!FREE && !locked()) setPaused(true);
  }
}
function enterLiving() {
  const b = $('black'); b.style.transition = 'opacity .35s ease'; b.style.opacity = 1;
  setTimeout(() => {
    S.pos.copy(LIVING_SPAWN); S.yaw = -Math.PI / 2; S.pitch = 0;
    b.style.opacity = 0; toast('Welcome to the living room. Look around.', 2600);
  }, 380);
}
function drink() {
  if (S.mode !== 'world') return;
  S.drinks++; setDrinks();
  const lines = ['Cheers.', 'One more.', 'Feeling good.', 'Okay, okay.', 'Is the room moving?', 'Who tilted the floor?', 'This is fine.', 'Bad idea.', 'Last one. Really.', 'Goodnight.'];
  toast(`🍺 ${S.drinks} / 10 — ${lines[S.drinks - 1] || ''}`, 2000);
  if (S.drinks >= 10) blackout();
}
function blackout() {
  S.mode = 'blackout'; $('prompt').classList.add('hidden');
  const b = $('black'); b.style.transition = 'opacity 1.8s ease'; b.style.opacity = 1;
  setTimeout(() => { canvas.style.filter = ''; wake(); }, 2700);
}

/* ------------------------------------------------------------------ panels */
let panelClose = null;
function openPanel(html, onClose) {
  S.mode = 'panel'; panelClose = onClose || null;
  for (const k in keys) keys[k] = false; stick.f = stick.s = 0;
  $('panelBody').innerHTML = html; $('panel').classList.remove('hidden');
  $('prompt').classList.add('hidden'); setPaused(false); unlock(); touchUI();
}
function closePanel() {
  if (S.mode !== 'panel') return;
  $('panel').classList.add('hidden'); S.mode = 'world';
  if (panelClose) panelClose(); panelClose = null;
  showWorldHud(true); setDrinks(); lock();
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
function openCareer() {
  openPanel(`
    <h2>Matthew Moore Jr.</h2>
    <p>Harvard College, Class of 2027 · Biomedical Engineering</p>
    <div class="cv">
      <div>Finance Intern, SpaceX<span>Summer 2026</span></div>
      <div>Investment Banking Summer Analyst, Seale &amp; Associates<span>Summer 2025</span></div>
      <div>Harvard Men's Varsity Lacrosse<span>Walk-on</span></div>
    </div>
    <div class="row" style="justify-content:flex-start">
      <a class="btn" style="text-decoration:none" href="${LINKS.linkedin}" target="_blank" rel="noopener">View LinkedIn</a>
    </div>`);
}
function openInstagram() {
  const b = $('black'); b.style.transition = 'none'; b.style.background = '#fff'; b.style.opacity = 0.9;
  setTimeout(() => { b.style.transition = 'opacity .5s ease'; b.style.opacity = 0; setTimeout(() => (b.style.background = '#000'), 520); }, 60);
  let opened = null; try { opened = window.open(LINKS.instagram, '_blank', 'noopener'); } catch { /* popup blocked */ }
  openPanel(`
    <h2>📸 Instagram</h2>
    <p>@matthew.moore04${opened === null ? '' : ' — opened in a new tab.'}</p>
    <div class="row" style="justify-content:flex-start">
      <a class="btn" style="text-decoration:none" href="${LINKS.instagram}" target="_blank" rel="noopener">Open Instagram</a>
    </div>`);
}

/* ------------------------------------------------------------------ games */
const MAKERS = { lacrosse: createLacrosse, rocket: createRocket, parkour: createParkour };
const BLURB = {
  lacrosse: TOUCH ? 'Drag to aim. Hold SHOOT to charge, release to rip it. 60 seconds.' : 'Aim with the mouse. Hold click to charge, release to shoot. 60 seconds.',
  rocket: TOUCH ? 'Stick up to burn, left/right to tilt. Land it soft on the ship.' : 'W to burn, A/D to tilt. Land it soft and straight on the ship.',
  parkour: TOUCH ? 'Run the charts. JUMP between bars as the market moves.' : 'Run the charts. Space to jump between bars as the market moves.',
};
async function fillBoard(game, el, n = 5) {
  if (!el) return;
  const rows = await LB.top(game, n);
  el.innerHTML = `<li class="tag">${LB.isGlobal() ? 'Global top ' + n : 'Top scores on this device'}</li>` +
    (rows.length ? rows.map((r, i) => `<li><span>${i + 1}. ${esc(r.name)}</span><b>${LB.GAMES[game].fmt(r.score)}</b></li>`).join('') : '<li>No scores yet. Be the first.</li>');
}
function openGames() {
  openPanel(`
    <h2>Game night</h2>
    <p>${TOUCH ? 'Pick a game. Tap Exit any time to come back.' : 'Pick a game. Press E or Esc any time to come back.'}</p>
    <div class="games">${Object.keys(MAKERS).map(g => `
      <div class="game"><h3>${LB.GAMES[g].title}</h3><p>${BLURB[g]}</p>
        <button class="btn small" data-play="${g}">Play</button>
        <ul class="board" id="board-${g}"></ul></div>`).join('')}
    </div>`);
  document.querySelectorAll('[data-play]').forEach(b => b.addEventListener('click', () => startGame(b.dataset.play)));
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
function startGame(name) {
  disposeGame();
  $('panel').classList.add('hidden'); panelClose = null;
  for (const k in keys) keys[k] = false; stick.f = stick.s = 0;
  activeName = name; lastHud = ''; $('ghud').innerHTML = '';
  active = MAKERS[name](THREE, ctx);
  active.camera.aspect = innerWidth / innerHeight; active.camera.updateProjectionMatrix();
  S.mode = 'game'; canvas.style.filter = ''; showWorldHud(false); $('drinks').classList.add('hidden');
  lock();
}
function exitGame(toMenu) {
  if (S.mode !== 'game') return;
  S.mode = 'world'; disposeGame(); showWorldHud(true); setDrinks();
  if (toMenu) openGames(); else lock();
}
function showResult(name, r) {
  if (S.mode !== 'game') return;
  S.mode = 'world'; showWorldHud(true); setDrinks();
  const g = LB.GAMES[name];
  let saved = 'Guest'; try { saved = localStorage.getItem('mmjr.name') || ''; } catch { /* ignore */ }
  openPanel(`
    <h2>${g.title}</h2>
    <div class="big">${esc(r.headline)}</div>
    <p>${esc(r.text || '')}</p>
    ${r.submit === false ? '' : `
    <form id="scoreForm" class="row" style="justify-content:flex-start;align-items:flex-end">
      <div style="flex:1;min-width:160px"><label for="pName">Name for the leaderboard</label>
      <input id="pName" maxlength="12" value="${esc(saved)}" placeholder="Your name" autocomplete="off"></div>
      <button class="btn" type="submit">Post score</button>
    </form>`}
    <ul class="board" id="resBoard" style="margin-top:16px;font-size:14px"></ul>
    <div class="row" style="justify-content:flex-start;margin-top:16px">
      <button class="btn small" id="again">Play again</button>
      <button class="btn ghost small" id="menu">All games</button>
    </div>`, disposeGame);
  fillBoard(name, $('resBoard'), 8);
  $('again').addEventListener('click', () => startGame(name));
  $('menu').addEventListener('click', () => { disposeGame(); openGames(); });
  $('scoreForm')?.addEventListener('submit', async e => {
    e.preventDefault();
    const nm = LB.cleanName($('pName').value);
    try { localStorage.setItem('mmjr.name', nm); } catch { /* ignore */ }
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
  if (e.code === 'KeyE') {
    if (S.mode === 'panel') closePanel();
    else if (S.mode === 'game') exitGame(true);
    else if (S.mode === 'world' && !S.paused) use();
  } else if (e.code === 'Escape') {
    if (S.mode === 'panel') closePanel();
    else if (S.mode === 'game') exitGame(true);
  } else if (e.code === 'Space' && S.mode === 'game') active?.down?.('key');
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'Space' && S.mode === 'game') active?.up?.('key'); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('mousemove', e => {
  if (!locked()) return;
  look(e.movementX, e.movementY);
});
function look(dx, dy) {
  if (S.mode === 'game') { active?.look?.(dx, dy); return; }
  if (S.mode !== 'world' || S.paused) return;
  S.yaw -= dx * 0.0022; S.pitch = clamp(S.pitch - dy * 0.0022, -1.45, 1.45);
}
canvas.addEventListener('mousedown', e => {
  if (TOUCH || e.button !== 0) return;
  if (S.mode === 'game') { if (locked() || FREE) active?.down?.('mouse'); else lock(); return; }
  if (S.mode === 'world' && !S.paused) { if (locked() || FREE) use(); else lock(); }
});
addEventListener('mouseup', e => { if (e.button === 0 && S.mode === 'game') active?.up?.('mouse'); });
canvas.addEventListener('contextmenu', e => e.preventDefault());

/* ------------------------------------------------------------------ input: touch (joystick + drag look + action button) */
const tu = { joy: null, look: null };
function touchUI() {
  const el = $('touch'); if (!el) return;
  const on = TOUCH && (S.mode === 'world' || S.mode === 'game' || S.mode === 'waking');
  el.classList.toggle('hidden', !on);
  $('tAct').textContent = S.mode === 'game' ? (active?.label || 'GO') : 'USE';
  $('tExit').classList.toggle('hidden', S.mode !== 'game');
}
if (TOUCH) {
  const el = document.createElement('div'); el.id = 'touch'; el.className = 'hidden';
  el.innerHTML = `<div id="tJoy"><i id="tKnob"></i></div><button id="tAct">USE</button><button id="tExit" class="hidden">✕ Exit</button>`;
  document.body.appendChild(el);
  const css = document.createElement('style');
  css.textContent = `
    canvas#c{touch-action:none} body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
    #touch{position:fixed;inset:0;z-index:12;pointer-events:none}
    #tJoy{position:absolute;left:max(22px,env(safe-area-inset-left));bottom:max(26px,env(safe-area-inset-bottom));width:124px;height:124px;border-radius:50%;
      background:rgba(255,255,255,.1);border:2px solid rgba(255,255,255,.35)}
    #tKnob{position:absolute;left:50%;top:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(255,255,255,.75)}
    #tAct{position:absolute;right:max(26px,env(safe-area-inset-right));bottom:max(40px,env(safe-area-inset-bottom));width:92px;height:92px;border-radius:50%;pointer-events:auto;
      background:rgba(242,180,65,.9);color:#1a1303;border:0;font-weight:800;font-size:15px;letter-spacing:.04em;touch-action:none}
    #tAct:active{filter:brightness(1.15)}
    #tExit{position:absolute;left:12px;top:12px;pointer-events:auto;background:rgba(16,21,31,.85);color:#fff;border:1px solid rgba(255,255,255,.2);
      border-radius:999px;padding:9px 14px;font-weight:600;font-size:14px}
    #panel .hint{display:none} .g-exit{display:none} .g-plaque{display:none} .g-side{top:auto;bottom:150px;right:12px;font-size:11.5px;min-width:150px;padding:8px 10px}
    .g-top{top:12px} .pill{font-size:13px;padding:6px 11px} .g-bar{bottom:150px;width:200px} .g-msg{font-size:24px}`;
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
      }
    }
  };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);
  const act = $('tAct');
  act.addEventListener('touchstart', e => { e.preventDefault(); if (S.mode === 'game') active?.down?.('btn'); else if (S.mode === 'world') use(); }, { passive: false });
  act.addEventListener('touchend', e => { e.preventDefault(); if (S.mode === 'game') active?.up?.('btn'); }, { passive: false });
  $('tExit').addEventListener('click', () => exitGame(true));
}

/* ------------------------------------------------------------------ interaction */
const ray = new THREE.Raycaster(); ray.far = 3.4;
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
function updateWorld(dt) {
  S.t += dt;
  if (S.mode === 'waking') updateWake(dt);
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
    if (d > 0) {                                  // the floor gets less trustworthy
      vx += Math.sin(S.t * 0.9) * 0.11 * d; vz += Math.cos(S.t * 0.7 + 1) * 0.11 * d;
    }
    const nx = S.pos.x + vx * dt, nz = S.pos.z + vz * dt;
    if (!blocked(nx, S.pos.z)) S.pos.x = nx;
    if (!blocked(S.pos.x, nz)) S.pos.z = nz;
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
  for (const c of [camera, active?.camera]) if (c) { c.aspect = innerWidth / innerHeight; c.updateProjectionMatrix(); }
});
let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (S.mode === 'game' && active) {
    if (!S.paused) active.update(dt);
    renderer.render(active.scene, active.camera);
  } else if (S.mode !== 'lite' && S.mode !== 'start') {
    updateWorld(dt); renderer.render(scene, camera);
  } else if (S.mode === 'start') {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
}
camera.position.copy(BED.stand); camera.rotation.set(0, -Math.PI / 2, 0);
requestAnimationFrame(frame);

if (TEST) window.__g = { S, keys, stick, begin, enterLiving, drink, startGame, openGames, openEmail, openCareer, openInstagram, closePanel, exitGame, get active() { return active; }, camera };
