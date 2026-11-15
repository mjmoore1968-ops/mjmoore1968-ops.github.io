// Blocky people, in the same style as Pat in the living room. They stand facing +z.
// makePerson returns { g, head, armL, armR } so whoever owns them can turn the head and swing the arms.
export function makePerson(THREE, o = {}) {
  const mat = c => (typeof c === 'number' ? new THREE.MeshLambertMaterial({ color: c }) : c);
  const bx = (p, w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); p.add(m); return m; };
  const sph = (p, r, c, x, y, z) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), mat(c)); m.position.set(x, y, z); p.add(m); return m; };
  const skin = mat(o.skin ?? 0xf0c8a6), top = mat(o.top ?? 0x2b5fa8), legs = mat(o.legs ?? 0x3d5f93), hair = mat(o.hair ?? 0x5b3f2a), sleeve = mat(o.sleeve ?? o.top ?? 0x2b5fa8);
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  for (const k of [-1, 1]) { bx(g, 0.14, 0.8, 0.16, legs, k * 0.09, 0.47, 0); bx(g, 0.14, 0.07, 0.26, o.shoes ?? 0x2a1c12, k * 0.09, 0.035, 0.04); }
  bx(g, 0.36, 0.16, 0.2, legs, 0, 0.93, 0); bx(g, 0.37, 0.04, 0.205, 0x2a1c12, 0, 1.02, 0);
  bx(g, 0.38, 0.48, 0.22, top, 0, 1.27, 0);
  if (o.shirt !== undefined) {                              // an open jacket: the shirt shows down the middle
    bx(g, 0.19, 0.46, 0.02, o.shirt, 0, 1.27, 0.112); for (const k of [-1, 1]) bx(g, 0.09, 0.07, 0.03, top, k * 0.12, 1.5, 0.1).rotation.z = k * 0.45;
  }
  if (o.vest !== undefined) { for (const k of [-1, 1]) bx(g, 0.15, 0.4, 0.02, o.vest, k * 0.115, 1.24, 0.113); bx(g, 0.39, 0.4, 0.02, o.vest, 0, 1.24, -0.113); }
  if (o.bowtie !== undefined) { for (const k of [-1, 1]) bx(g, 0.05, 0.045, 0.02, o.bowtie, k * 0.035, 1.485, 0.118); bx(g, 0.025, 0.03, 0.025, o.bowtie, 0, 1.485, 0.12); }
  bx(g, 0.44, 0.06, 0.23, top, 0, 1.5, 0);
  { const n = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.1, 10), skin); n.position.set(0, 1.56, 0); g.add(n); }
  const head = new THREE.Group(); head.position.set(0, 1.6, 0); g.add(head);
  bx(head, 0.2, 0.25, 0.21, skin, 0, 0.125, 0); bx(head, 0.17, 0.05, 0.19, skin, 0, -0.005, 0);
  for (const k of [-1, 1]) {
    bx(head, 0.034, 0.028, 0.012, 0xffffff, k * 0.05, 0.152, 0.106); bx(head, 0.017, 0.024, 0.014, o.eyes ?? 0x3a2a1c, k * 0.05, 0.152, 0.108);
    bx(head, 0.05, 0.012, 0.014, hair, k * 0.05, 0.19, 0.108);
    bx(head, 0.02, 0.05, 0.03, skin, k * 0.108, 0.13, 0);                                         // ears
  }
  bx(head, 0.026, 0.045, 0.028, o.nose ?? 0xe0b592, 0, 0.11, 0.115);
  bx(head, 0.06, 0.013, 0.012, o.mouth ?? 0x9c5a4a, 0, 0.055, 0.107);
  const style = o.hairStyle ?? 'short';
  if (style !== 'bald') { bx(head, 0.22, 0.06, 0.23, hair, 0, 0.275, 0); bx(head, 0.22, 0.2, 0.03, hair, 0, 0.19, -0.108); for (const k of [-1, 1]) bx(head, 0.02, 0.14, 0.2, hair, k * 0.108, 0.215, -0.01); }
  if (style === 'swept') { const q = bx(head, 0.2, 0.08, 0.1, hair, 0.01, 0.31, 0.06); q.rotation.x = -0.35; q.rotation.z = 0.08; }
  if (style === 'long') { bx(head, 0.24, 0.5, 0.05, hair, 0, 0.03, -0.118); for (const k of [-1, 1]) bx(head, 0.035, 0.42, 0.2, hair, k * 0.112, 0.08, -0.01); }
  if (style === 'bun') sph(head, 0.07, hair, 0, 0.3, -0.09);
  if (o.beard !== undefined) { bx(head, 0.2, 0.09, 0.03, o.beard, 0, 0.03, 0.1); for (const k of [-1, 1]) bx(head, 0.02, 0.12, 0.12, o.beard, k * 0.1, 0.06, 0.045); }
  if (o.glasses) { for (const k of [-1, 1]) bx(head, 0.05, 0.04, 0.008, 0x111111, k * 0.05, 0.152, 0.116).material.wireframe = false; bx(head, 0.03, 0.008, 0.008, 0x111111, 0, 0.158, 0.116); }
  const arm = k => { const a = new THREE.Group(); a.position.set(k * 0.245, 1.47, 0); a.rotation.z = k * 0.07; g.add(a);
    bx(a, 0.11, 0.3, 0.12, sleeve, 0, -0.13, 0); bx(a, 0.1, 0.28, 0.11, o.bareArms ? skin : sleeve, 0, -0.41, 0); sph(a, 0.05, skin, 0, -0.6, 0); return a; };
  const armL = arm(-1), armR = arm(1);
  return { g, head, armL, armR };
}
