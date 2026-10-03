// Cartoon football player: a rigged, motion-captured body (idle / walk / run) with exaggerated athletic proportions,
// cel shading + ink outline, full uniform painted by body region, big helmet with facemask, shoulder pads and numbers.
// Throw / catch / dive / fall / kick / celebrate are layered on the skeleton procedurally.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from './vendor/jsm/utils/SkeletonUtils.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, k) => a + (b - a) * k;
const smooth = (k) => k * k * (3 - 2 * k);
const SKINS = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#6b4226', '#a0673c'];
let BASE = null; const CLIPS = {};
const ramp = new THREE.DataTexture(new Uint8Array([70, 70, 70, 255, 150, 150, 150, 255, 215, 215, 215, 255, 255, 255, 255, 255]), 4, 1); ramp.needsUpdate = true; ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
export const toon = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: ramp });
const INK = new THREE.MeshBasicMaterial({ color: '#0b0d12', side: THREE.BackSide });

export async function loadPlayerAssets(url = './vendor/models/player.glb') {
  if (BASE) return; BASE = await new GLTFLoader().loadAsync(url);
  for (const c of BASE.animations) CLIPS[c.name] = c;
}

const UNI = ['uJersey', 'uPants', 'uSock', 'uSkin', 'uGlove', 'uTrim', 'uCleat'];
function uniformMat() {
  const m = new THREE.MeshToonMaterial({ gradientMap: ramp }); const u = {}; for (const k of UNI) u[k] = { value: new THREE.Color('#888') };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRest;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRest=position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vRest;\nuniform vec3 ${UNI.join(',')};`).replace('#include <color_fragment>', `#include <color_fragment>
      float h=vRest.y/1.806, ax=abs(vRest.x)/1.806; vec3 c=uJersey;
      if(ax>0.1 && h>0.68){ if(ax<0.16)c=uJersey; else if(ax<0.176)c=uTrim; else if(ax<0.37)c=uSkin; else c=uGlove; }
      else if(h>0.865) c=uSkin;
      else if(h>0.56) c=uJersey;
      else if(h>0.535) c=uTrim;
      else if(h>0.27) c=(ax>0.066 && ax<0.08 && h<0.5)?uTrim:uPants;
      else if(h>0.055) c=(h>0.2&&h<0.225)?uTrim:uSock;
      else c=uCleat;
      diffuseColor.rgb=c;`);
  };
  m.customProgramCacheKey = () => 'nfl-toon-uniform'; m.userData.u = u; return m;
}
function outlineMat(th) {
  const m = INK.clone(); m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + normalize(normal) * ${th.toFixed(4)};`); };
  m.customProgramCacheKey = () => `ink${th}`; return m;
}
const INK_BODY = outlineMat(0.011);
function inked(mesh, th = 1.07) { const o = new THREE.Mesh(mesh.geometry, INK); o.scale.setScalar(th); mesh.add(o); return mesh; }

function helmet(M) {                                         // built facing +x, turned to face +z (the head bone's forward)
  const h = new THREE.Group(), add = (geo, m, x, y, z, ink) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; h.add(o); if (ink) inked(o, ink); return o; };
  const O = 0.8;
  add(new THREE.SphereGeometry(0.62, 28, 20, Math.PI + O, Math.PI * 2 - 2 * O), M.helm, 0, 0, 0, 1.06).scale.set(1.16, 1, 0.96);
  add(new THREE.SphereGeometry(0.62, 16, 10, Math.PI - O, 2 * O, 0, Math.PI * 0.4), M.helm, 0, 0, 0).scale.set(1.16, 1, 0.96);
  add(new THREE.SphereGeometry(0.6, 20, 12, Math.PI + O, Math.PI * 2 - 2 * O, Math.PI * 0.5, Math.PI * 0.3), M.helm, 0, -0.02, 0).scale.set(1.18, 1, 0.98);
  add(new THREE.TorusGeometry(0.635, 0.08, 8, 32, Math.PI), M.trim, 0, 0, 0).scale.set(1.16, 1, 1.25);
  add(new THREE.SphereGeometry(0.47, 16, 12), M.skin, 0.12, -0.12, 0);                                  // face behind the mask
  add(new THREE.CylinderGeometry(0.64, 0.64, 0.16, 20, 1, true, Math.PI * 0.3, Math.PI * 0.4), M.visor, 0, 0.02, 0).scale.set(1.1, 1, 0.92);
  const bar = (len, x, y, z, rx, rz) => { const o = add(new THREE.CylinderGeometry(0.045, 0.045, len, 8), M.mask, x, y, z); o.rotation.set(rx, 0, rz); };
  bar(0.98, 0.72, -0.2, 0, Math.PI / 2, 0); bar(0.84, 0.75, -0.38, 0, Math.PI / 2, 0); bar(0.62, 0.7, -0.55, 0, Math.PI / 2, 0); bar(0.44, 0.75, -0.36, 0, 0, 0.15);
  for (const s of [-1, 1]) { bar(0.52, 0.62, -0.35, s * 0.44, 0, 0.25); const lg = add(new THREE.PlaneGeometry(0.52, 0.34), M.logo, 0, 0.1, s * 0.615); lg.rotation.y = s > 0 ? 0 : Math.PI; }
  const w = new THREE.Group(); h.rotation.y = -Math.PI / 2; w.add(h); return w;
}

const LOGOS = {};
function logoTex(team) {
  if (LOGOS[team.abbr + team.color]) return LOGOS[team.abbr + team.color];
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.font = '900 118px Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 14; x.lineJoin = 'round'; x.strokeStyle = '#0b0d12'; x.strokeText(team.abbr.slice(0, 3), 128, 86); x.fillStyle = '#ffffff'; x.fillText(team.abbr.slice(0, 3), 128, 86);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (LOGOS[team.abbr + team.color] = t);
}
const lum = (hex) => { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
const Q = new THREE.Quaternion(), E = new THREE.Euler();
const aim = (bone, x, y, z, w) => { if (w <= 0) return; E.set(x, y, z); Q.setFromEuler(E); bone.quaternion.slerp(Q, clamp(w)); };

export function createPlayer(opts = {}) {
  const g = new THREE.Group(), inner = new THREE.Group(); inner.rotation.x = Math.PI / 2; g.add(inner); g.rotation.order = 'ZYX';
  const model = SkeletonUtils.clone(BASE.scene); model.rotation.y = Math.PI / 2; model.scale.set(1.3, 1.26, 1.3); inner.add(model);
  const M = { helm: toon('#888'), trim: toon('#fff'), mask: toon('#e9e9e9'), visor: new THREE.MeshBasicMaterial({ color: '#10161f' }), jersey: toon('#888'), skin: toon('#c68642'),
    logo: new THREE.MeshBasicMaterial({ transparent: true, polygonOffset: true, polygonOffsetFactor: -4 }) };
  const body = uniformMat();
  const skinned = []; model.traverse((o) => { if (o.isSkinnedMesh) skinned.push(o); });
  for (const o of skinned) {
    o.material = body; o.castShadow = true; o.frustumCulled = false;
    if (opts.outline !== false) { const ink = new THREE.SkinnedMesh(o.geometry, INK_BODY); ink.bind(o.skeleton, o.bindMatrix); ink.frustumCulled = false; o.parent.add(ink); }
  }
  const bone = (n) => model.getObjectByName('mixamorig' + n);
  const B = { hips: bone('Hips'), spine: bone('Spine1'), chest: bone('Spine2'), neck: bone('Neck'), head: bone('Head'), rArm: bone('RightArm'), lArm: bone('LeftArm'), rFore: bone('RightForeArm'), lFore: bone('LeftForeArm'),
    rHand: bone('RightHand'), lHand: bone('LeftHand'), rUp: bone('RightUpLeg'), lUp: bone('LeftUpLeg'), rLeg: bone('RightLeg'), lLeg: bone('LeftLeg'), rFoot: bone('RightFoot'), lFoot: bone('LeftFoot') };
  // slightly exaggerated athletic build: big chest and shoulders, thick arms and legs, big hands, big helmet
  B.chest.scale.set(1.2, 1.06, 1.22); B.rArm.scale.set(1, 1.3, 1.3); B.lArm.scale.set(1, 1.3, 1.3); B.rUp.scale.set(1.22, 1, 1.22); B.lUp.scale.set(1.22, 1, 1.22); B.rHand.scale.setScalar(1.25); B.lHand.scale.setScalar(1.25);
  const helm = helmet(M); helm.scale.setScalar(25); helm.position.set(0, 9.5, 3.2); B.head.add(helm);
  const pads = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), M.jersey); pads.scale.set(22, 6.8, 13.5); pads.position.set(0, 12, -0.5); pads.castShadow = true; B.chest.add(pads); inked(pads, 1.05);
  const nc = document.createElement('canvas'); nc.width = 256; nc.height = 192; const nt = new THREE.CanvasTexture(nc); nt.colorSpace = THREE.SRGBColorSpace;
  const numMat = new THREE.MeshBasicMaterial({ map: nt, transparent: true, polygonOffset: true, polygonOffsetFactor: -4 });
  for (const [z, ry] of [[14.2, 0], [-13.4, Math.PI]]) { const pl = new THREE.Mesh(new THREE.PlaneGeometry(22, 16.5), numMat); pl.position.set(0, 1.5, z); pl.rotation.y = ry; B.chest.add(pl); }
  const mixer = new THREE.AnimationMixer(model);
  const A = { idle: mixer.clipAction(CLIPS.idle), walk: mixer.clipAction(CLIPS.walk), run: mixer.clipAction(CLIPS.run) };
  for (const a of Object.values(A)) { a.play(); a.setEffectiveWeight(0); }
  const st = { cycle: Math.random(), x: 0, y: 0, pitch: 0, lift: 0, has: false }; const V = new THREE.Vector3();

  function dress(team, num, k = 0) {
    const u = body.userData.u, c = team.color, alt = team.alt && team.alt.toLowerCase() !== c.toLowerCase() ? team.alt : '#ffffff', home = team.home !== false;
    const jersey = home ? c : '#f6f6f6', trim = home ? alt : c, numFg = home ? (lum(alt) > 0.5 ? alt : '#ffffff') : c;
    u.uJersey.value.set(jersey); M.jersey.color.set(jersey); M.helm.color.set(c); M.trim.color.set(trim); u.uTrim.value.set(trim); u.uSock.value.set(home ? c : '#f0f0f0');
    u.uPants.value.set(home ? (lum(alt) > 0.75 ? alt : '#f2f2f2') : (lum(c) < 0.6 ? c : '#dddddd')); u.uGlove.value.set(home ? '#f6f6f6' : c); u.uCleat.value.set(k % 3 ? '#16181d' : '#f4f4f4');
    const skin = SKINS[(k * 5 + 3) % SKINS.length]; u.uSkin.value.set(skin); M.skin.color.set(skin); M.logo.map = logoTex(team); M.logo.needsUpdate = true;
    const x = nc.getContext('2d'); x.clearRect(0, 0, 256, 192); x.font = '900 168px Oswald, Anton, Impact, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineWidth = 16; x.lineJoin = 'round';
    x.strokeStyle = lum(numFg) > 0.5 ? '#0b0d12' : '#ffffff'; x.strokeText(String(num), 128, 104); x.fillStyle = numFg; x.fillText(String(num), 128, 104); nt.needsUpdate = true;
  }

  /** p = sim player; sim gives the current acts. dt = seconds of play time since last frame (0 when frozen). */
  function update(p, sim, dt) {
    const dx = st.has ? p.x - st.x : 0, dy = st.has ? p.y - st.y : 0, moved = Math.hypot(dx, dy); st.x = p.x; st.y = p.y; st.has = true;
    const v = p.speed, back = (dx * Math.cos(p.face) + dy * Math.sin(p.face)) < -1e-4 ? -1 : 1;
    const run = clamp((v - 2.4) / 3), walk = clamp(v / 1.6) * (1 - run);
    st.cycle = (st.cycle + 1 + back * moved / (v > 4.2 ? 4.7 : 2.3)) % 1;
    A.run.setEffectiveWeight(run); A.walk.setEffectiveWeight(walk); A.idle.setEffectiveWeight(Math.max(0, 1 - run - walk));
    A.run.time = st.cycle * 0.7; A.walk.time = st.cycle * 0.97; A.idle.time = (sim.t * 0.7 + p.id * 0.37) % 2.5; mixer.update(0);
    const a = (type) => sim.actOf(p, type); const io = (x, k = 0.14) => (x ? smooth(clamp(Math.min(x.el / k, (Math.min(x.t1, 1e4) - sim.t) / k))) : 0);
    // --- body pitch / lift (dives, falls, lying on the turf)
    let pitch = run * 0.16 * (back > 0 ? 1 : -0.5), lift = 0;
    const dive = a('dive'), fall = a('fall'), down = a('down'), cel = a('celebrate'), kneel = a('kneel');
    if (dive) { pitch = lerp(pitch, 1.35, smooth(clamp(dive.ph * 1.6))); lift = Math.sin(Math.PI * clamp(dive.ph)) * 0.5 - 0.25 * dive.ph; }
    if (fall) { const k = smooth(fall.ph); pitch = lerp(pitch, fall.back ? -1.45 : 1.45, k); lift = Math.sin(Math.PI * fall.ph) * 0.25; }
    if (down) { pitch = st.downPitch ?? (st.pitch < 0 ? -1.45 : 1.45); const up = down.t1 < 90 ? smooth(clamp((sim.t - (down.t1 - 0.5)) / 0.5)) : 0; pitch = lerp(pitch, 0, up); } else st.downPitch = null;
    if (fall || dive) st.downPitch = pitch < 0 ? -1.45 : 1.45;
    st.pitch = pitch;
    // --- crouches
    let c = Math.max(io(a('stance')), io(a('ready')) * 0.28, io(a('block'), 0.2) * 0.3, io(a('scoop'), 0.12) * 1.0, kneel ? 1.25 : 0) * (1 - run * 0.8);
    if (c > 0) { B.hips.position.y -= 24 * c; B.hips.rotation.x += 0.6 * c; B.spine.rotation.x += 0.2 * c; B.chest.rotation.x += 0.1 * c;
      for (const [uu, l, f] of [[B.rUp, B.rLeg, B.rFoot], [B.lUp, B.lLeg, B.lFoot]]) { uu.rotation.x -= 1.45 * c; l.rotation.x += 1.35 * c; f.rotation.x -= 0.55 * c; } }
    // --- arms
    const armsFwd = Math.max(io(a('block'), 0.2), io(a('handoff')), dive ? 1 : 0, io(a('scoop')));
    if (armsFwd) { aim(B.rArm, 0.2, 1.2, 0.25, armsFwd); aim(B.lArm, 0.2, -1.2, -0.25, armsFwd); aim(B.rFore, 0, 0.5, 0, armsFwd); aim(B.lFore, 0, -0.5, 0, armsFwd); }
    const ct = a('catch'), c1 = a('catch1'), jmp = a('jump'), reach = a('reach');
    if (ct) { const w = io(ct, 0.12), hi = ct.high ? -1.1 : -0.75; aim(B.rArm, 0, ct.over ? 0.9 : 0.75, hi, w); aim(B.lArm, 0, ct.over ? -0.9 : -0.75, -hi, w); aim(B.rFore, 0, 0.6, 0, w); aim(B.lFore, 0, -0.6, 0, w); }
    if (c1) { const w = io(c1, 0.12); aim(B.rArm, 0, 0.35, -1.4, w); aim(B.rFore, 0, 0.2, 0, w); aim(B.chest, 0, -0.25, 0.15, w * 0.6); }
    if ((jmp && !ct && !c1) || reach) { const w = jmp ? Math.sin(Math.PI * jmp.ph) : io(reach); aim(B.rArm, 0, 0.2, -1.35, w); aim(B.lArm, 0, -0.2, 1.35, w); }
    const th = a('throw');
    if (th) { const k = smooth(clamp((th.ph - 0.45) / 0.3)), w = io(th, 0.15); aim(B.rArm, 0, lerp(-0.75, 1.15, k), -1.05, w); aim(B.rFore, 0, lerp(1.5, 0.15, k), 0, w); aim(B.chest, 0, lerp(-0.45, 0.4, k), 0, w); aim(B.lArm, 0, -0.9, 0.5, w * (1 - k)); }
    if (a('carry') && !cel && !fall && !down) { aim(B.lArm, 0.55, -0.2, 1.05, 1); aim(B.lFore, 0, -1.9, 0, 1); }
    const kick = a('kick');
    if (kick) { const k = clamp((kick.ph - 0.3) / 0.25), w = io(kick, 0.1); aim(B.rUp, lerp(0.75, -1.55, smooth(k)), 0, 0, w); aim(B.rLeg, lerp(1.2, 0.05, smooth(k)), 0, 0, w); aim(B.chest, lerp(0.1, -0.2, k), 0, 0, w * 0.5); }
    if (cel) {
      const e = cel.el, s = cel.style ?? 0, w = smooth(clamp(e / 0.25));
      if (s === 0) { aim(B.rArm, 0, 0.1, -1.4, w); aim(B.lArm, 0, -0.1, 1.4, w); lift += Math.abs(Math.sin(e * 5.2)) * 0.38; }                       // both arms up, hopping
      else if (s === 1) { aim(B.rArm, 0, 0.1, -1.4, w); aim(B.lArm, 0, -0.1, 1.4, w); lift += Math.abs(Math.sin(e * 4 + p.id)) * 0.2; }
      else if (s === 2) { const pump = Math.sin(e * 9) * 0.5; aim(B.rArm, 0, 0.9 + pump * 0.4, -0.6 - pump * 0.5, w); aim(B.rFore, 0, 1.6, 0, w); aim(B.chest, -0.15, 0, 0, w); }   // flex / fist pump
      else { aim(B.rArm, 0, 1.2, -0.5, w); aim(B.lArm, 0.3, 0, 1.2, w); }                                                                                // point
    }
    g.position.set(p.x, p.y, p.z + lift + (down ? 0.12 * (Math.abs(pitch) / 1.45) : 0)); g.rotation.z = p.face; g.rotation.y = pitch;
  }
  const hand = (which = 'r') => (which === 'l' ? B.lFore : B.rHand).getWorldPosition(V);
  return { group: g, dress, update, hand, reset: () => { st.has = false; st.downPitch = null; st.pitch = 0; } };
}
