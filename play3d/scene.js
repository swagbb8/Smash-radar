// The world: field with painted end zones, stadium bowl + crowd, goal posts, lights, the football, and the
// effects layer (ball trail, turf / impact particles, confetti, carrier ring, first-down lines).
import * as THREE from 'three';
import { toon, createPlayer, loadPlayerAssets } from './player.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

function fieldTexture(left, right) {
  const W = 3072, H = 1365, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'), sx = W / 120;
  const px = (yd) => (yd + 60) * sx;
  for (let i = 0; i < 20; i++) { x.fillStyle = i % 2 ? '#3d9a3a' : '#46a842'; x.fillRect(px(-50 + i * 5), 0, px(-45) - px(-50) + 1, H); }
  x.globalAlpha = 0.06; for (let i = 0; i < 9000; i++) { x.fillStyle = i % 2 ? '#000' : '#fff'; x.fillRect((i * 7919) % W, (i * 104729) % H, 3, 9); } x.globalAlpha = 1;
  for (const [t, a, b] of [[left, -60, -50], [right, 50, 60]]) {
    x.fillStyle = t.color; x.fillRect(px(a), 0, px(b) - px(a), H);
    x.save(); x.translate(px((a + b) / 2), H / 2); x.rotate(a < 0 ? -Math.PI / 2 : Math.PI / 2); x.font = '900 190px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 16; x.lineJoin = 'round'; x.strokeStyle = '#0b0d12'; x.strokeText(t.name.toUpperCase(), 0, 8); x.fillStyle = t.alt && lum(t.alt) > 0.35 && t.alt.toLowerCase() !== t.color.toLowerCase() ? t.alt : '#ffffff'; x.fillText(t.name.toUpperCase(), 0, 8); x.restore();
  }
  x.strokeStyle = '#ffffff'; x.lineWidth = 7; for (let yd = -50; yd <= 50; yd += 5) { x.beginPath(); x.moveTo(px(yd), 14); x.lineTo(px(yd), H - 14); x.stroke(); }
  x.lineWidth = 4; for (let yd = -49; yd < 50; yd++) { if (yd % 5 === 0) continue; for (const yy of [0.025, 0.34, 0.66, 0.975]) { x.beginPath(); x.moveTo(px(yd), yy * H - 12); x.lineTo(px(yd), yy * H + 12); x.stroke(); } }
  x.lineWidth = 14; x.strokeRect(7, 7, W - 14, H - 14);
  x.fillStyle = '#fff'; x.font = '700 104px Oswald, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let yd = -40; yd <= 40; yd += 10) { const n = 50 - Math.abs(yd); for (const [yy, r] of [[H * 0.83, 0], [H * 0.17, Math.PI]]) { x.save(); x.translate(px(yd), yy); x.rotate(r); x.fillText(String(n), 0, 0); x.restore(); } }
  x.save(); x.translate(px(0), H / 2); x.fillStyle = left.color; x.beginPath(); x.arc(0, 0, 165, 0, Math.PI * 2); x.fill(); x.lineWidth = 12; x.strokeStyle = '#fff'; x.stroke(); x.fillStyle = '#fff'; x.font = '900 130px Anton, Impact'; x.fillText(left.abbr, 0, 8); x.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function crowdTexture(cols) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const x = c.getContext('2d'); x.fillStyle = '#1a1e27'; x.fillRect(0, 0, 1024, 512);
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; const pal = [...cols, ...cols, '#e6e6e6', '#30364a', '#ffffff', '#ffcf5a'];
  for (let row = 0; row < 40; row++) { x.fillStyle = '#0d0f14'; x.fillRect(0, row * 12.8 + 10, 1024, 3);
    for (let i = 0; i < 128; i++) { if (rnd() < 0.1) continue; const X = i * 8 + (row % 2) * 4 + rnd() * 2, Y = row * 12.8; x.fillStyle = pal[Math.floor(rnd() * pal.length)]; x.fillRect(X, Y + 4, 6, 7); x.fillStyle = ['#e0ac69', '#8d5524', '#c68642', '#f1c27d'][Math.floor(rnd() * 4)]; x.fillRect(X + 1.5, Y + 0.5, 3, 3.5); } }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
let _glow; const glowTex = () => { if (_glow) return _glow; const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,245,210,.5)'); g.addColorStop(1, 'rgba(255,245,210,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); return (_glow = new THREE.CanvasTexture(c)); };

export async function createWorld(canvas, { shadows = true } = {}) {
  await loadPlayerAssets();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.enabled = shadows; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#0a1c4a'); g.addColorStop(0.5, '#2459b8'); g.addColorStop(1, '#8fc4ff'); x.fillStyle = g; x.fillRect(0, 0, 4, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }
  scene.fog = new THREE.Fog('#5f93dd', 170, 380);
  const cam = new THREE.PerspectiveCamera(42, 9 / 16, 0.3, 700); cam.up.set(0, 0, 1);
  scene.add(new THREE.HemisphereLight('#eaf3ff', '#3f7a35', 1.25));
  const sun = new THREE.DirectionalLight('#fff7e6', 2.1); sun.position.set(-30, -45, 80); sun.castShadow = shadows; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 10, far: 220 }); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; scene.add(sun); scene.add(sun.target);

  const fieldMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(120, 53.3), fieldMat); field.receiveShadow = true; scene.add(field);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(172, 106), new THREE.MeshLambertMaterial({ color: '#2f7d2d' })); apron.position.z = -0.04; apron.receiveShadow = true; scene.add(apron);
  const wallMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: '#ffffff' });
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.4, 64, 1, true), wallMat); wall.rotation.x = Math.PI / 2; wall.scale.set(82, 1, 50); wall.position.z = 1.2; scene.add(wall);
  const bowls = [];
  for (const [r0, r1, z0, z1, rep] of [[82, 120, 2.4, 27, 6], [123, 152, 33, 56, 7]]) {
    const pts = []; for (let k = 0; k <= 8; k++) pts.push(new THREE.Vector2(lerp(r0, r1, k / 8), lerp(z0, z1, k / 8)));
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, color: '#c9c9c9' })); m.rotation.x = Math.PI / 2; m.scale.set(1, 1, 0.61); scene.add(m); bowls.push([m, rep]);
  }
  { const deck = new THREE.Mesh(new THREE.CylinderGeometry(122, 122, 3, 96, 1, true), new THREE.MeshBasicMaterial({ color: '#20242d', side: THREE.DoubleSide })); deck.rotation.x = Math.PI / 2; deck.scale.set(1, 1, 0.61); deck.position.z = 30; scene.add(deck); }
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, lb = new THREE.Mesh(new THREE.PlaneGeometry(14, 4), new THREE.MeshBasicMaterial({ color: '#fffbe8', side: THREE.DoubleSide })); lb.position.set(Math.cos(a) * 152, Math.sin(a) * 93, 63); lb.lookAt(0, 0, 0); scene.add(lb);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#fff3cc', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); gl.scale.set(42, 42, 1); gl.position.copy(lb.position); scene.add(gl); }
  // regulation goal posts
  const yel = toon('#ffd21f'), padMats = [];
  for (const X of [-60, 60]) { const g = new THREE.Group(), d = Math.sign(X), cyl = (r, len) => new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 10), yel);
    const base = cyl(0.13, 2.8); base.rotation.x = Math.PI / 2; base.position.set(d * 2, 0, 1.4); g.add(base); const neck = cyl(0.11, 2.0); neck.rotation.z = Math.PI / 2; neck.position.set(d, 0, 2.8); g.add(neck);
    const rise = cyl(0.1, 0.55); rise.rotation.x = Math.PI / 2; rise.position.set(0, 0, 3.06); g.add(rise); const cb = cyl(0.09, 6.17); cb.position.z = 3.33; g.add(cb);
    for (const s of [-1, 1]) { const up = cyl(0.07, 11.7); up.rotation.x = Math.PI / 2; up.position.set(0, s * 3.08, 3.33 + 5.85); g.add(up); }
    const pm = toon('#888'); padMats.push(pm); const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.9, 12), pm); pad.rotation.x = Math.PI / 2; pad.position.set(d * 2, 0, 0.95); g.add(pad);
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); g.position.x = X; scene.add(g); }
  // pylons
  for (const X of [-50, 50, -60, 60]) for (const Y of [-26.65, 26.65]) { const py = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.5), new THREE.MeshBasicMaterial({ color: '#ff7a1a' })); py.position.set(X, Y, 0.25); scene.add(py); }

  // ---- football
  const ball = new THREE.Group(); scene.add(ball);
  { const b = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 14), toon('#8a4313')); b.scale.set(1.7, 1, 1); b.castShadow = true; ball.add(b);
    const ink = new THREE.Mesh(b.geometry, new THREE.MeshBasicMaterial({ color: '#0b0d12', side: THREE.BackSide })); ink.scale.set(1.7 * 1.08, 1.1, 1.1); ball.add(ink);
    for (const sx of [-0.135, 0.135]) { const st = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 6, 24), new THREE.MeshBasicMaterial({ color: '#ffffff' })); st.rotation.y = Math.PI / 2; st.position.x = sx; ball.add(st); }
    const lace = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: '#fff' })); lace.position.set(0, 0, 0.115); ball.add(lace); }
  const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.3, depthWrite: false })); ballShadow.position.z = 0.03; scene.add(ballShadow);

  // ---- effects
  const trail = []; for (let i = 0; i < 16; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: '#fff2b8', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); scene.add(sp); trail.push(sp); }
  const hist = [];
  const line = (col) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 53.3), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false })); m.position.z = 0.03; scene.add(m); return m; };
  const losLine = line('#2f86ff'), fdLine = line('#ffd400');
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.12, 40), new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.85, depthWrite: false })); ring.position.z = 0.035; scene.add(ring);
  const N = 420, pgeo = new THREE.PlaneGeometry(1, 1), pm = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, transparent: true });
  const parts = new THREE.InstancedMesh(pgeo, pm, N); parts.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3); parts.frustumCulled = false; scene.add(parts);
  const P = Array.from({ length: N }, () => ({ life: 0 })); let pi = 0; const dummy = new THREE.Object3D(), col = new THREE.Color();
  function emit(pos, n, kind, color) {
    for (let k = 0; k < n; k++) { const p = P[pi = (pi + 1) % N], a = Math.random() * Math.PI * 2, s = Math.random();
      if (kind === 'turf') Object.assign(p, { v: [Math.cos(a) * (1 + s * 3), Math.sin(a) * (1 + s * 3), 2 + s * 4], size: 0.1 + s * 0.12, life: 0.7, max: 0.7, g: 11, color: s > 0.5 ? '#2c7a2a' : '#5a3a1a' });
      else if (kind === 'impact') Object.assign(p, { v: [Math.cos(a) * (3 + s * 6), Math.sin(a) * (3 + s * 6), 1 + s * 5], size: 0.16 + s * 0.2, life: 0.45, max: 0.45, g: 6, color: s > 0.4 ? '#ffffff' : '#ffe27a' });
      else Object.assign(p, { v: [Math.cos(a) * (2 + s * 7), Math.sin(a) * (2 + s * 7), 6 + s * 9], size: 0.28 + s * 0.2, life: 2.6, max: 2.6, g: 5, drag: 1.6, color: k % 3 === 0 ? '#ffffff' : k % 3 === 1 ? color : '#ffd84a', spin: Math.random() * 6 });
      p.p = [pos[0] + (Math.random() - 0.5) * 0.6, pos[1] + (Math.random() - 0.5) * 0.6, (pos[2] ?? 0.2) + Math.random() * 0.3]; }
  }
  function stepFx(dt) {
    for (let i = 0; i < N; i++) { const p = P[i];
      if (p.life > 0) { p.life -= dt; p.v[2] -= p.g * dt; if (p.drag) { p.v[0] *= 1 - p.drag * dt; p.v[1] *= 1 - p.drag * dt; if (p.v[2] < -2.2) p.v[2] = -2.2; } p.p[0] += p.v[0] * dt; p.p[1] += p.v[1] * dt; p.p[2] = Math.max(0.04, p.p[2] + p.v[2] * dt); }
      const k = p.life > 0 ? clamp(p.life / p.max * 2.5) : 0; dummy.position.set(...(p.p || [0, 0, -5])); dummy.scale.setScalar((p.size || 0) * k); dummy.rotation.set((p.spin || 0) + p.life * 6, p.life * 4, i); dummy.updateMatrix(); parts.setMatrixAt(i, dummy.matrix); parts.setColorAt(i, col.set(p.color || '#fff')); }
    parts.instanceMatrix.needsUpdate = true; parts.instanceColor.needsUpdate = true;
  }
  const clearFx = () => { for (const p of P) p.life = 0; hist.length = 0; for (const s of trail) s.material.opacity = 0; };

  // ---- players (22, reused for every play)
  const players = Array.from({ length: 22 }, () => { const p = createPlayer(); scene.add(p.group); return p; });
  let teams = null, crowdT = null;
  function setTeams(off, def) {                                // O attacks the +x end zone, which belongs to the defense
    const key = `${off.abbr}${off.color}${def.abbr}${def.color}`; if (teams === key) return; teams = key;
    fieldMat.map?.dispose(); fieldMat.map = fieldTexture(off, def); fieldMat.needsUpdate = true;
    const c = document.createElement('canvas'); c.width = 1024; c.height = 64; const x = c.getContext('2d'); x.fillStyle = off.color; x.fillRect(0, 0, 512, 64); x.fillStyle = def.color; x.fillRect(512, 0, 512, 64);
    x.fillStyle = '#fff'; x.font = '900 40px Anton, Impact'; x.textAlign = 'center'; [off, def, off, def].forEach((t, i) => x.fillText(i % 2 ? t.name.toUpperCase() : t.abbr, i * 256 + 128, 46));
    const wt = new THREE.CanvasTexture(c); wt.colorSpace = THREE.SRGBColorSpace; wt.wrapS = THREE.RepeatWrapping; wt.repeat.set(-6, 1); wallMat.map = wt; wallMat.needsUpdate = true;
    crowdT = crowdTexture([off.color, off.color, def.color, off.alt || '#fff']);
    for (const [m, rep] of bowls) { const t = crowdT.clone(); t.repeat.set(rep, 1); t.needsUpdate = true; m.material.map = t; m.material.needsUpdate = true; }
    padMats[0].color.set(off.color); padMats[1].color.set(def.color);
  }
  function dressFor(sim, off, def) {
    setTeams(off, def); clearFx();
    sim.players.forEach((p, i) => { players[i].reset(); players[i].dress(p.team === 'O' ? off : def, p.num, i); players[i].group.visible = true; });
    for (let i = sim.players.length; i < 22; i++) players[i].group.visible = false;
    ring.material.color.set('#ffffff');
  }
  const bv = new THREE.Vector3(), ux = new THREE.Vector3(1, 0, 0);
  /** Pose everything for the sim's current time. dt = play-time step (0 while frozen). */
  function sync(sim, dt, fx = 1) {
    sim.players.forEach((p, i) => players[i].update(p, sim, dt));
    scene.updateMatrixWorld(true);
    const b = sim.ball, h = b.held; let pos = b.pos;
    if (h) { const pl = players[sim.players.indexOf(h)], carry = sim.actOf(h, 'carry') && !sim.actOf(h, 'celebrate'); const w = pl.hand(carry ? 'l' : 'r'); pos = [w.x, w.y, Math.max(0.16, w.z + (carry ? -0.05 : 0.1))]; if (sim.actOf(h, 'down')) pos[2] = 0.25; }
    const prev = ball.position.clone(); ball.position.set(...pos); bv.copy(ball.position).sub(prev);
    if (b.inAir && bv.length() > 1e-4) { ball.quaternion.setFromUnitVectors(ux, bv.clone().normalize()); ball.rotateX(sim.t * 30); } else if (b.loose) { ball.rotation.set(sim.t * 9, sim.t * 7, sim.t * 5); } else if (h) { ball.rotation.set(0, 0, h.face + 0.4); } else ball.rotation.set(0, 0, 0);
    ballShadow.position.set(pos[0], pos[1], 0.03); ballShadow.material.opacity = h ? 0 : clamp(0.35 - pos[2] * 0.02, 0.08, 0.35); ballShadow.scale.setScalar(1 + pos[2] * 0.12);
    if (dt > 0) { hist.unshift(b.inAir && fx > 0 ? [...pos] : null); hist.length = Math.min(hist.length, 16); }
    trail.forEach((sp, k) => { const q = hist[k]; sp.material.opacity = q ? 0.6 * fx * (1 - k / 16) : 0; if (q) { sp.position.set(...q); sp.scale.setScalar(0.75 * (1 - k / 18)); } });
    const scr = !sim.noScrimmage; losLine.visible = scr && sim.t < sim.tEvent; fdLine.visible = scr && sim.t < sim.tEvent && sim.L + 10 < 50 && sim.play.type !== 'field_goal'; losLine.position.x = sim.L; fdLine.position.x = sim.L + 10;
    const c = sim.carrier; ring.visible = fx > 0 && !!c && sim.t > sim.S + 0.3 && !sim.actOf(c, 'down'); if (c) ring.position.set(c.x, c.y, 0.035);
    if (dt > 0) stepFx(dt);
    ball.scale.setScalar(clamp(cam.position.distanceTo(ball.position) / 13, 1, 1.7));   // stays readable on a phone when the camera is far away
    sun.position.set(cam.position.x * 0.3 + ball.position.x * 0.7 - 30, -45, 80); sun.target.position.set(cam.position.x * 0.3 + ball.position.x * 0.7, 0, 0);
  }
  let scale = 1, size = [720, 1280];
  const resize = (w, h) => { size = [w, h]; renderer.setSize(Math.round(w * scale), Math.round(h * scale), false); cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const lowPower = () => { scale = 0.72; sun.castShadow = false; renderer.shadowMap.enabled = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); resize(...size); };
  return { renderer, scene, cam, ball, players, dressFor, sync, emit, clearFx, resize, lowPower, render: () => renderer.render(scene, cam), ringColor: (c) => ring.material.color.set(c) };
}
