import * as THREE from 'three';
import { mulberry32, pick } from '../rng';
import { ROAD_HALF, WALL_HALF, type Track } from '../track';
import type { CourseDef, WalkerModel } from './course';
import {
  animate,
  canvas,
  curtain,
  merged,
  placed,
  ribbon,
  signTexture,
  speckle,
  toTexture,
} from './glowkit';

// Gloomhollow Manor: a moonlit graveyard lap that runs in the front door of a haunted manor,
// up the grand staircase, along the gallery, down the back stairs and out the back door.

/** Footprint of the manor. The track inside this rectangle is the interior section. */
const MANOR = { x0: -64, x1: 64, z0: 148, z1: 272 };
const MANOR_HEIGHT = 26;
/** Interior walls stand just outside the knee-high course walls. */
const HALL_HALF = WALL_HALF + 2;
const HALL_HEIGHT = 11;

export const HAUNTED_POINTS: [number, number, number][] = [
  [20, -10, 0], // start, on the south lawn heading east
  [90, 4, 0],
  [120, 55, 0],
  [96, 108, 0],
  [56, 122, 0],
  [32, 140, 0], // front porch
  [30, 166, 0], // entrance hall
  [26, 188, 1],
  [8, 203, 3.6], // grand staircase
  [-16, 213, 6.2],
  [-30, 231, 6.6], // upper gallery
  [-30, 246, 5.6],
  [-30, 263, 1.2], // back stairs
  [-30, 290, 0], // out the back door
  [-52, 322, 0],
  [-100, 332, 0],
  [-146, 292, 0],
  [-152, 220, 0],
  [-140, 140, 0],
  [-120, 62, 0], // graveyard
  [-72, 12, 0],
  [-26, -12, 0],
];

export const insideManor = (x: number, z: number) => x > MANOR.x0 && x < MANOR.x1 && z > MANOR.z0 && z < MANOR.z1;

// ---------- textures ----------

/** Mossy flagstone path with bone and plum kerbs. */
export function gravePathTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rand = mulberry32(31);
  ctx.fillStyle = '#26232a';
  ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) {
    let x = 14;
    while (x < 242) {
      const w = Math.min(20 + rand() * 30, 242 - x);
      const s = 0.75 + rand() * 0.3;
      ctx.fillStyle = `rgb(${88 * s | 0},${86 * s | 0},${92 * s | 0})`;
      ctx.beginPath();
      ctx.roundRect(x + 2, y * 32 + 2, w - 4, 28, 6);
      ctx.fill();
      if (rand() < 0.4) {
        ctx.fillStyle = 'rgba(70,110,60,0.55)';
        ctx.beginPath();
        ctx.arc(x + rand() * w, y * 32 + rand() * 32, 4 + rand() * 7, 0, Math.PI * 2);
        ctx.fill();
      }
      x += w;
    }
  }
  speckle(ctx, 256, 256, rand, 4000, 0.12);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#d9d2c0' : '#4a2457';
    ctx.fillRect(0, i * 32, 12, 32);
    ctx.fillRect(244, i * 32, 12, 32);
  }
  return toTexture(c);
}

/** Dark, mossy graveyard stone for the knee walls. */
export function mossStoneTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rand = mulberry32(32);
  ctx.fillStyle = '#1f1d22';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) {
    let x = y % 2 ? -10 : 0;
    while (x < 128) {
      const w = 18 + rand() * 16;
      const s = 0.7 + rand() * 0.35;
      ctx.fillStyle = `rgb(${90 * s | 0},${92 * s | 0},${88 * s | 0})`;
      ctx.fillRect(x + 1, y * 16 + 1, w - 2, 14);
      x += w;
    }
  }
  ctx.fillStyle = 'rgba(80,130,60,0.5)';
  for (let i = 0; i < 30; i++) ctx.fillRect(rand() * 128, rand() * 128, 3 + rand() * 10, 2 + rand() * 4);
  speckle(ctx, 128, 128, rand, 900, 0.15);
  return toTexture(c);
}

/** Parquet floor with a crimson carpet runner down the middle. U runs across the road. */
function hallFloorTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rand = mulberry32(33);
  for (let x = 0; x < 256; x += 16) {
    let y = -rand() * 60;
    while (y < 256) {
      const len = 40 + rand() * 50;
      const s = 0.7 + rand() * 0.35;
      ctx.fillStyle = `rgb(${110 * s | 0},${68 * s | 0},${38 * s | 0})`;
      ctx.fillRect(x + 1, y + 1, 14, len - 2);
      y += len;
    }
  }
  // Carpet runner.
  ctx.fillStyle = '#6e1020';
  ctx.fillRect(56, 0, 144, 256);
  ctx.fillStyle = '#c9a23c';
  ctx.fillRect(56, 0, 8, 256);
  ctx.fillRect(192, 0, 8, 256);
  ctx.fillStyle = '#4c0814';
  for (let y = 0; y < 256; y += 64) {
    ctx.beginPath();
    ctx.moveTo(128, y + 8);
    ctx.lineTo(170, y + 32);
    ctx.lineTo(128, y + 56);
    ctx.lineTo(86, y + 32);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = '#a07a2a';
  ctx.lineWidth = 2;
  for (let y = 0; y < 256; y += 64) {
    ctx.beginPath();
    ctx.arc(128, y + 32, 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  speckle(ctx, 256, 256, rand, 2500, 0.08);
  // Dark skirting at the edges, where the kerbs would be outside.
  ctx.fillStyle = '#2a1a12';
  ctx.fillRect(0, 0, 10, 256);
  ctx.fillRect(246, 0, 10, 256);
  return toTexture(c);
}

/** Striped damask wallpaper. One tile is 4 m square. */
function wallpaperTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rand = mulberry32(34);
  ctx.fillStyle = '#3a2440';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#2e1b34';
  for (let x = 0; x < 128; x += 32) ctx.fillRect(x, 0, 12, 128);
  ctx.fillStyle = '#5a3f62';
  for (const [cx, cy] of [[32, 32], [96, 96], [96, 32], [32, 96]]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 14);
    ctx.quadraticCurveTo(cx + 12, cy, cx, cy + 14);
    ctx.quadraticCurveTo(cx - 12, cy, cx, cy - 14);
    ctx.fill();
    ctx.fillRect(cx - 1, cy - 20, 2, 40);
  }
  speckle(ctx, 128, 128, rand, 600, 0.08);
  // A few damp stains.
  for (let i = 0; i < 3; i++) {
    const g = ctx.createRadialGradient(rand() * 128, rand() * 128, 0, 64, 64, 60);
    g.addColorStop(0, 'rgba(20,30,10,0.25)');
    g.addColorStop(1, 'rgba(20,30,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  return toTexture(c);
}

/** Dark oak panelling for the lower walls. */
function wainscotTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 64);
  ctx.fillStyle = '#2b1a10';
  ctx.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 32) {
    ctx.fillStyle = '#3f2616';
    ctx.fillRect(x + 4, 8, 24, 48);
    ctx.fillStyle = '#4e301c';
    ctx.fillRect(x + 8, 12, 16, 40);
  }
  ctx.fillStyle = '#6a4a26';
  ctx.fillRect(0, 0, 128, 4);
  return toTexture(c);
}

function ceilingTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rand = mulberry32(35);
  for (let x = 0; x < 128; x += 16) {
    const s = 0.7 + rand() * 0.3;
    ctx.fillStyle = `rgb(${52 * s | 0},${34 * s | 0},${24 * s | 0})`;
    ctx.fillRect(x, 0, 15, 128);
  }
  ctx.strokeStyle = 'rgba(200,200,210,0.18)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 6; i++) {
    // Cobwebs in the corners.
    const cx = rand() < 0.5 ? 0 : 128;
    const cy = rand() * 128;
    for (let r = 6; r < 30; r += 6) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  return toTexture(c);
}

/** Weatherboard siding with tall windows, a few of them lit. One tile is a 10 m bay. */
function manorSidingTexture(seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rand = mulberry32(seed);
  ctx.fillStyle = '#2d3330';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 6) {
    ctx.fillStyle = `rgba(0,0,0,${0.25 + rand() * 0.15})`;
    ctx.fillRect(0, y + 5, 128, 1);
  }
  for (const f of [0, 1]) {
    const wx = 44;
    const wy = 14 + f * 64;
    ctx.fillStyle = '#16191a';
    ctx.fillRect(wx - 5, wy - 8, 50, 50);
    const lit = rand();
    ctx.fillStyle = lit < 0.3 ? '#f2b84a' : lit < 0.42 ? '#8af0a0' : '#1c2430';
    ctx.beginPath();
    ctx.moveTo(wx, wy + 40);
    ctx.lineTo(wx, wy + 6);
    ctx.quadraticCurveTo(wx + 20, wy - 8, wx + 40, wy + 6);
    ctx.lineTo(wx + 40, wy + 40);
    ctx.fill();
    ctx.fillStyle = '#16191a';
    ctx.fillRect(wx + 19, wy - 2, 2, 42);
    ctx.fillRect(wx, wy + 20, 40, 2);
    // Shutters, one hanging crooked.
    ctx.fillStyle = '#3a2030';
    ctx.fillRect(wx - 14, wy, 10, 40);
    ctx.save();
    ctx.translate(wx + 44, wy);
    ctx.rotate(rand() < 0.5 ? 0.15 : 0);
    ctx.fillRect(0, 0, 10, 40);
    ctx.restore();
  }
  speckle(ctx, 128, 128, rand, 700, 0.1);
  return toTexture(c);
}

function slateTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const rand = mulberry32(36);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const s = 0.7 + rand() * 0.35;
      ctx.fillStyle = `rgb(${46 * s | 0},${42 * s | 0},${58 * s | 0})`;
      ctx.fillRect(x * 8 + (y % 2) * 4, y * 8, 8, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x * 8, y * 8 + 7, 8, 1);
    }
  }
  return toTexture(c);
}

/** A gloomy oil portrait whose eyes glow. */
function portraitTexture(seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(96, 128);
  const rand = mulberry32(seed);
  const bg = ctx.createRadialGradient(48, 50, 4, 48, 64, 80);
  bg.addColorStop(0, pick(rand, ['#4a3a2a', '#2f3a3a', '#3a2a3a']));
  bg.addColorStop(1, '#0c0a0a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 96, 128);
  const coat = pick(rand, ['#1a1a24', '#2a1018', '#10241a']);
  ctx.fillStyle = coat;
  ctx.beginPath();
  ctx.moveTo(8, 128);
  ctx.quadraticCurveTo(48, 70, 88, 128);
  ctx.fill();
  ctx.fillStyle = pick(rand, ['#c8b8a0', '#a8b0a0', '#b8a8b8']);
  ctx.beginPath();
  ctx.ellipse(48, 58, 17, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hair or a tall hat.
  ctx.fillStyle = '#141010';
  if (rand() < 0.5) ctx.fillRect(30, 18, 36, 26);
  else {
    ctx.beginPath();
    ctx.ellipse(48, 42, 21, 12, 0, Math.PI, 0);
    ctx.fill();
  }
  ctx.fillStyle = '#ff3a2a';
  ctx.shadowColor = '#ff3a2a';
  ctx.shadowBlur = 8;
  ctx.fillRect(38, 56, 6, 3);
  ctx.fillRect(52, 56, 6, 3);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#301010';
  ctx.fillRect(41, 70, 14, 2);
  speckle(ctx, 96, 128, rand, 500, 0.08);
  return toTexture(c, false);
}

function pumpkinTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 64);
  ctx.fillStyle = '#e0731a';
  ctx.fillRect(0, 0, 128, 64);
  for (let x = 0; x < 128; x += 16) {
    ctx.fillStyle = 'rgba(120,40,0,0.35)';
    ctx.fillRect(x, 0, 3, 64);
  }
  // Carved face on one side of the wrap.
  ctx.fillStyle = '#ffe36a';
  ctx.shadowColor = '#ffe36a';
  ctx.shadowBlur = 6;
  for (const ex of [52, 76]) {
    ctx.beginPath();
    ctx.moveTo(ex - 6, 30);
    ctx.lineTo(ex, 20);
    ctx.lineTo(ex + 6, 30);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(48, 38);
  for (let i = 0; i <= 8; i++) ctx.lineTo(48 + i * 4, i % 2 ? 46 : 40);
  ctx.lineTo(80, 50);
  ctx.lineTo(48, 50);
  ctx.fill();
  return toTexture(c, false);
}

// ---------- hazard ----------

/** A sheet ghost that drifts back and forth across the road. Its arms swing like legs. */
export function makeGhost(rand: () => number): WalkerModel {
  const root = new THREE.Group();
  const tint = pick(rand, [0xf4f0ff, 0xe6fff2, 0xfff0f6]);
  const sheet = new THREE.MeshLambertMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.45, transparent: true, opacity: 0.82, flatShading: true });
  // Lathe profile: round head flaring into a wavy hem.
  const prof: THREE.Vector2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * (Math.PI / 2);
    prof.push(new THREE.Vector2(Math.sin(a) * 0.75, 2.6 + Math.cos(a) * 0.75));
  }
  prof.push(new THREE.Vector2(0.8, 1.6), new THREE.Vector2(1.05, 0.7), new THREE.Vector2(1.15, 0.45));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof.reverse(), 10), sheet);
  body.castShadow = true;
  // Ragged hem.
  const pos = body.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0.5) pos.setY(i, pos.getY(i) - 0.2 * Math.abs(Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 3)));
  }
  body.geometry.computeVertexNormals();
  body.position.y = 0.5;
  root.add(body);
  const eye = new THREE.MeshBasicMaterial({ color: 0x120818 });
  for (const x of [-0.27, 0.27]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 4), eye);
    e.scale.set(1, 1.5, 0.5);
    e.position.set(x, 3.3, 0.68);
    root.add(e);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 4), eye);
  mouth.scale.set(1, 1.3, 0.4);
  mouth.position.set(0, 2.85, 0.74);
  root.add(mouth);
  const legs: THREE.Object3D[] = [];
  for (const x of [-0.85, 0.85]) {
    const arm = new THREE.Group();
    const a = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.1, 5), sheet);
    a.rotation.z = x > 0 ? -2.2 : 2.2;
    a.position.set(x * 0.4, -0.2, 0.2);
    arm.add(a);
    arm.position.set(x, 2.5, 0);
    root.add(arm);
    legs.push(arm);
  }
  // Floating: everything sits above the road and sways.
  animate(body, (t) => {
    body.position.y = 0.5 + Math.sin(t * 2.5 + root.id) * 0.25;
    body.rotation.y = Math.sin(t * 2 + root.id) * 0.15;
  });
  return { root, legs, speed: 2.2 + rand() * 1.6, sound: 'ghost', color: 0xe8f0ff };
}

// ---------- scenery ----------

export function decorateHaunted(track: Track, group: THREE.Group, rand: () => number) {
  const n = track.samples.length;
  const interior: number[] = [];
  for (let i = 0; i < n; i++) if (insideManor(track.samples[i].pos.x, track.samples[i].pos.z)) interior.push(i);

  // Ground: dead grass with a pale fog-hugging tint.
  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(900, 48).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x2b3527 }),
  );
  grass.position.set(-10, -0.25, 150);
  grass.receiveShadow = true;
  group.add(grass);

  buildInterior(track, group, interior, rand);
  buildManorShell(track, group);
  buildGraveyard(track, group, rand);
  buildStartArch(track, group);
  buildSky(group);
}

function buildInterior(track: Track, group: THREE.Group, idx: number[], rand: () => number) {
  if (idx.length < 2) return;
  // Floor overlay, so the hall has parquet and a runner while the grounds keep the flagstone path.
  const floor = new THREE.Mesh(
    ribbon(track, -HALL_HALF, HALL_HALF, 0.03, 26, idx),
    new THREE.MeshLambertMaterial({ map: hallFloorTexture(), polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  floor.receiveShadow = true;
  group.add(floor);

  const paper = wallpaperTexture();
  const wains = wainscotTexture();
  wains.repeat.set(1, 1);
  for (const side of [-1, 1]) {
    const lat = HALL_HALF * side;
    const wall = new THREE.Mesh(curtain(track, lat, 2.4, HALL_HEIGHT, 4, idx), new THREE.MeshLambertMaterial({ map: paper }));
    wall.receiveShadow = true;
    const lower = new THREE.Mesh(curtain(track, lat, -0.5, 2.4, 2.9, idx), new THREE.MeshLambertMaterial({ map: wains }));
    group.add(wall, lower);
  }
  const ceil = new THREE.Mesh(
    ribbon(track, -HALL_HALF - 0.2, HALL_HALF + 0.2, HALL_HEIGHT, 8, idx),
    new THREE.MeshLambertMaterial({ map: ceilingTexture(), side: THREE.DoubleSide }),
  );
  ceil.castShadow = true;
  group.add(ceil);

  // Beams, portraits, sconces, chandeliers and suits of armour along the hall.
  const beamGeos: THREE.BufferGeometry[] = [];
  const frameGeos: THREE.BufferGeometry[] = [];
  const brassGeos: THREE.BufferGeometry[] = [];
  const flameGeos: THREE.BufferGeometry[] = [];
  const armourGeos: THREE.BufferGeometry[] = [];
  const balusterGeos: THREE.BufferGeometry[] = [];
  const portraits = [0, 1, 2, 3, 4].map((k) => new THREE.MeshBasicMaterial({ map: portraitTexture(400 + k), color: 0xb0a090 }));
  const beam = new THREE.BoxGeometry(HALL_HALF * 2, 0.8, 0.7);
  const sconce = new THREE.CylinderGeometry(0.18, 0.1, 0.5, 6);
  const flame = new THREE.ConeGeometry(0.16, 0.45, 5);
  let lightCount = 0;
  const steps = Math.max(1, Math.round(4 / track.spacing));
  for (let k = 0; k < idx.length; k += steps) {
    const i = idx[k];
    const smp = track.samples[i];
    const h = track.heightAt(smp.s);
    const yaw = Math.atan2(smp.tan.x, smp.tan.z);
    const at = (lat: number, y: number) => smp.pos.clone().addScaledVector(smp.right, lat).setY(h + y);
    const step = k / steps;
    if (step % 3 === 0) {
      // The beam box spans X, so yawing it with the road lays it across the hall.
      const p = at(0, HALL_HEIGHT - 0.4);
      beamGeos.push(placed(beam, p.x, p.y, p.z, yaw));
    }
    if (step % 4 === 1) {
      const side = (step / 4) % 2 < 1 ? 1 : -1;
      const p = at(side * (HALL_HALF - 0.15), 5.6);
      const frame = new THREE.BoxGeometry(0.25, 3.6, 2.8);
      frameGeos.push(frame.rotateY(yaw).translate(p.x, p.y, p.z));
      const pic = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 3.1), pick(rand, portraits));
      pic.position.copy(at(side * (HALL_HALF - 0.3), 5.6));
      pic.rotation.y = yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      group.add(pic);
    }
    if (step % 2 === 0) {
      for (const side of [-1, 1]) {
        const p = at(side * (HALL_HALF - 0.4), 3.8);
        brassGeos.push(placed(sconce, p.x, p.y, p.z));
        flameGeos.push(placed(flame, p.x, p.y + 0.45, p.z));
      }
    }
    if (step % 10 === 5) {
      // Chandelier.
      const p = at(0, HALL_HEIGHT - 3.2);
      const ring = new THREE.TorusGeometry(1.6, 0.12, 5, 14).rotateX(Math.PI / 2);
      brassGeos.push(ring.translate(p.x, p.y, p.z));
      brassGeos.push(new THREE.CylinderGeometry(0.06, 0.06, 2.8, 4).translate(p.x, p.y + 1.6, p.z));
      for (let c = 0; c < 8; c++) {
        const a = (c / 8) * Math.PI * 2;
        const cx = p.x + Math.cos(a) * 1.6;
        const cz = p.z + Math.sin(a) * 1.6;
        brassGeos.push(placed(sconce, cx, p.y + 0.3, cz, 0, 0.7, 0.7, 0.7));
        flameGeos.push(placed(flame, cx, p.y + 0.7, cz));
      }
      if (lightCount < 5) {
        const light = new THREE.PointLight(0xffb060, 30, 48, 1);
        light.position.copy(p);
        group.add(light);
        lightCount++;
      }
    }
    if (step % 6 === 3) {
      for (const side of [-1, 1]) {
        if (rand() < 0.5) continue;
        const p = at(side * (HALL_HALF - 0.9), 0);
        armourGeos.push(...suitOfArmour(p, yaw + (side > 0 ? -Math.PI / 2 : Math.PI / 2)));
      }
    }
  }
  // Banisters where the floor climbs or falls, so the slopes read as staircases.
  for (let k = 0; k < idx.length; k += 2) {
    const i = idx[k];
    const s = track.samples[i].s;
    const slope = Math.abs(track.heightAt(s + 2) - track.heightAt(s - 2));
    if (slope < 0.5) continue;
    const smp = track.samples[i];
    const h = track.heightAt(s);
    for (const side of [-1, 1]) {
      const p = smp.pos.clone().addScaledVector(smp.right, side * (ROAD_HALF + 1.2));
      balusterGeos.push(new THREE.CylinderGeometry(0.1, 0.14, 1.4, 5).translate(p.x, h + 0.7, p.z));
    }
  }
  const stairIdx = idx.filter((i) => {
    const s = track.samples[i].s;
    return Math.abs(track.heightAt(s + 2) - track.heightAt(s - 2)) >= 0.5;
  });
  const runs = splitRuns(stairIdx, track.samples.length);
  const rail = new THREE.MeshLambertMaterial({ color: 0x4a2a18 });
  for (const run of runs) {
    for (const side of [-1, 1]) {
      const top = new THREE.Mesh(ribbon(track, side * (ROAD_HALF + 0.9), side * (ROAD_HALF + 1.5), 1.45, 4, run), rail);
      top.material.side = THREE.DoubleSide;
      group.add(top);
    }
    // Step nosings across the runner, one every metre, so the slope reads as stairs.
    const nose = new THREE.MeshLambertMaterial({ color: 0xc9a23c });
    const noseGeos: THREE.BufferGeometry[] = [];
    const every = Math.max(1, Math.round(1.2 / track.spacing));
    for (let k = 0; k < run.length; k += every) {
      const smp = track.samples[run[k]];
      const h = track.heightAt(smp.s);
      const g = new THREE.BoxGeometry(ROAD_HALF * 2 - 0.4, 0.06, 0.12).rotateY(Math.atan2(smp.tan.x, smp.tan.z));
      noseGeos.push(g.translate(smp.pos.x, h + 0.06, smp.pos.z));
    }
    const m = merged(noseGeos, nose, false);
    if (m) group.add(m);
  }

  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadows = true) => {
    const m = merged(geos, mat, shadows);
    if (m) group.add(m);
  };
  add(beamGeos, new THREE.MeshLambertMaterial({ color: 0x2a1810, flatShading: true }));
  add(frameGeos, new THREE.MeshLambertMaterial({ color: 0x8a6a2a, flatShading: true }));
  add(brassGeos, new THREE.MeshLambertMaterial({ color: 0x9a7a3a, flatShading: true }), false);
  add(armourGeos, new THREE.MeshLambertMaterial({ color: 0x9aa0a8, flatShading: true }));
  add(balusterGeos, rail);
  const flames = merged(flameGeos, new THREE.MeshBasicMaterial({ color: 0xffc860 }), false);
  if (flames) {
    group.add(flames);
    animate(flames, (t) => (flames.material as THREE.MeshBasicMaterial).color.setHSL(0.1 + Math.sin(t * 13) * 0.012, 1, 0.66 + Math.sin(t * 23) * 0.05));
  }

  // A great fireplace on the outside wall of the entrance hall, and a stopped grandfather clock.
  const hearthAt = idx[Math.floor(idx.length * 0.12)];
  const hs = track.samples[hearthAt];
  const hyaw = Math.atan2(hs.tan.x, hs.tan.z);
  const fireplace = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ map: mossStoneTexture(), flatShading: true });
  const surround = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 7), stone);
  surround.position.set(0, 2.5, 0);
  const mouth = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), new THREE.MeshBasicMaterial({ color: 0xff6a1a }));
  mouth.position.set(-0.45, 1.5, 0);
  mouth.rotation.y = -Math.PI / 2;
  const glow = new THREE.PointLight(0xff6a1a, 25, 30, 1);
  glow.position.set(-3, 2, 0);
  animate(mouth, (t) => {
    glow.intensity = 22 + Math.sin(t * 9) * 4 + Math.sin(t * 23) * 3;
  });
  fireplace.add(surround, mouth, glow);
  fireplace.position.copy(hs.pos).addScaledVector(hs.right, HALL_HALF - 0.2);
  fireplace.rotation.y = hyaw;
  group.add(fireplace);
}

function splitRuns(sorted: number[], n: number): number[][] {
  const runs: number[][] = [];
  let cur: number[] = [];
  for (const i of sorted) {
    if (cur.length && (i - cur[cur.length - 1] + n) % n > 2) {
      runs.push(cur);
      cur = [];
    }
    cur.push(i);
  }
  if (cur.length > 1) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}

function suitOfArmour(p: THREE.Vector3, yaw: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [
    new THREE.BoxGeometry(0.9, 0.4, 0.6).translate(0, 0.2, 0), // plinth
    new THREE.CylinderGeometry(0.16, 0.14, 1.3, 6).translate(-0.2, 1.05, 0),
    new THREE.CylinderGeometry(0.16, 0.14, 1.3, 6).translate(0.2, 1.05, 0),
    new THREE.CylinderGeometry(0.42, 0.32, 1.2, 8).translate(0, 2.3, 0),
    new THREE.CylinderGeometry(0.28, 0.3, 0.55, 8).translate(0, 3.2, 0), // helm
    new THREE.ConeGeometry(0.09, 0.5, 4).translate(0, 3.7, 0),
    new THREE.CylinderGeometry(0.03, 0.03, 3.2, 4).translate(0.62, 1.8, 0.15), // halberd
    new THREE.ConeGeometry(0.18, 0.6, 4).translate(0.62, 3.6, 0.15),
  ];
  return parts.map((g) => g.rotateY(yaw).translate(p.x, p.y, p.z));
}

function buildManorShell(track: Track, group: THREE.Group) {
  const { x0, x1, z0, z1 } = MANOR;
  const siding = manorSidingTexture(37);
  const wallGeos: THREE.BufferGeometry[] = [];
  const lintelGeos: THREE.BufferGeometry[] = [];
  const piece = 4;
  const edges: [number, number, number, number][] = [
    [x0, z0, x1, z0],
    [x1, z0, x1, z1],
    [x1, z1, x0, z1],
    [x0, z1, x0, z0],
  ];
  for (const [ax, az, bx, bz] of edges) {
    const len = Math.hypot(bx - ax, bz - az);
    const yaw = Math.atan2(bx - ax, bz - az);
    for (let d = 0; d < len; d += piece) {
      const t = (d + piece / 2) / len;
      const x = ax + (bx - ax) * t;
      const z = az + (bz - az) * t;
      const box = (bottom: number, top: number) => {
        const g = new THREE.BoxGeometry(1.6, top - bottom, piece + 0.05);
        const uv = g.getAttribute('uv') as THREE.BufferAttribute;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (piece / 10) + d / 10, uv.getY(k) * ((top - bottom) / 10) + bottom / 10);
        return g.rotateY(yaw).translate(x, (bottom + top) / 2, z);
      };
      if (track.distanceToCentre(x, z) < HALL_HALF + 0.6) {
        // Doorway: leave the gap and bridge it above the hall ceiling.
        const proj = track.project(new THREE.Vector3(x, 0, z));
        const h = track.heightAt(proj.s);
        lintelGeos.push(box(h + HALL_HEIGHT, MANOR_HEIGHT));
      } else wallGeos.push(box(0, MANOR_HEIGHT));
    }
  }
  const sidingMat = new THREE.MeshLambertMaterial({ map: siding });
  const walls = merged([...wallGeos, ...lintelGeos], sidingMat);
  if (walls) group.add(walls);

  const slate = slateTexture();
  slate.repeat.set(10, 10);
  const slateMat = new THREE.MeshLambertMaterial({ map: slate, flatShading: true });
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.SQRT1_2, 30, 4, 1).rotateY(Math.PI / 4), slateMat);
  roof.scale.set(x1 - x0 + 6, 1, z1 - z0 + 6);
  roof.position.set(cx, MANOR_HEIGHT + 15, cz);
  roof.castShadow = true;
  group.add(roof);
  const eave = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 6, 1, z1 - z0 + 6), new THREE.MeshLambertMaterial({ color: 0x1a1618 }));
  eave.position.set(cx, MANOR_HEIGHT, cz);
  group.add(eave);

  // Corner towers with witch-hat spires, plus chimneys and a cupola.
  const towerMat = new THREE.MeshLambertMaterial({ map: manorSidingTexture(38) });
  for (const [tx, tz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(9, 9.5, MANOR_HEIGHT + 14, 10), towerMat);
    tower.position.set(tx, (MANOR_HEIGHT + 14) / 2, tz);
    tower.castShadow = true;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(11, 26, 10), slateMat);
    spire.position.set(tx, MANOR_HEIGHT + 27, tz);
    spire.rotation.z = (tx > 0 ? -1 : 1) * 0.06;
    spire.castShadow = true;
    group.add(tower, spire);
  }
  const brick = new THREE.MeshLambertMaterial({ color: 0x4a2a24, flatShading: true });
  for (const [x, z] of [[-30, 190], [34, 236], [0, 160]]) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(5, 22, 5), brick);
    ch.position.set(x, MANOR_HEIGHT + 18, z);
    group.add(ch);
  }
  const cupola = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 8, 8), towerMat);
  cupola.position.set(cx, MANOR_HEIGHT + 32, cz);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(5.5, 10, 8), slateMat);
  cap.position.set(cx, MANOR_HEIGHT + 41, cz);
  const vane = new THREE.Mesh(new THREE.ConeGeometry(0.3, 4, 4), new THREE.MeshLambertMaterial({ color: 0x111111 }));
  vane.position.set(cx, MANOR_HEIGHT + 48, cz);
  group.add(cupola, cap, vane);

  // Porticoes over both doors: columns and a pediment, plus a glowing lamp each side.
  const column = new THREE.MeshLambertMaterial({ color: 0x8a8a84, flatShading: true });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0x9effa8 });
  for (const zEdge of [z0, z1]) {
    let best = 0;
    let bestD = Infinity;
    track.samples.forEach((smp, i) => {
      const d = Math.abs(smp.pos.z - zEdge) + (insideManor(smp.pos.x, (z0 + z1) / 2) ? 0 : 50);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    const smp = track.samples[best];
    const out = zEdge === z0 ? -1 : 1;
    const portico = new THREE.Group();
    for (const side of [-1, 1]) {
      for (const dz of [0, 5]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 13, 8), column);
        col.position.set(side * (HALL_HALF + 1.5), 6.5, dz * out);
        portico.add(col);
      }
      const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), lampMat);
      lamp.position.set(side * (HALL_HALF + 1.5), 8, out * 8);
      portico.add(lamp);
    }
    const pediment = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 3).rotateZ(0), column);
    pediment.scale.set(HALL_HALF * 1.5, 6, 1);
    pediment.rotation.x = 0;
    pediment.position.set(0, 16, out * 4);
    portico.add(pediment);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(HALL_HALF * 2 + 6, 1.2, 8), column);
    slab.position.set(0, 13.2, out * 3);
    portico.add(slab);
    portico.position.set(smp.pos.x, track.heightAt(smp.s), zEdge);
    portico.traverse((o) => (o.castShadow = true));
    group.add(portico);
  }
}

function buildGraveyard(track: Track, group: THREE.Group, rand: () => number) {
  const graveGeos: THREE.BufferGeometry[] = [];
  const crossGeos: THREE.BufferGeometry[] = [];
  const treeGeos: THREE.BufferGeometry[] = [];
  const fenceGeos: THREE.BufferGeometry[] = [];
  const pumpkinGeos: THREE.BufferGeometry[] = [];
  const stemGeos: THREE.BufferGeometry[] = [];
  const lampGeos: THREE.BufferGeometry[] = [];
  const wispGeos: THREE.BufferGeometry[] = [];
  const clear = (x: number, z: number, r: number) =>
    track.distanceToCentre(x, z) > WALL_HALF + 2 + r &&
    !(x > MANOR.x0 - 12 - r && x < MANOR.x1 + 12 + r && z > MANOR.z0 - 12 - r && z < MANOR.z1 + 12 + r);

  // Rows of headstones and crosses scattered across the grounds.
  for (let k = 0; k < 900; k++) {
    const x = -260 + rand() * 480;
    const z = -120 + rand() * 520;
    if (!clear(x, z, 1.5)) continue;
    const yaw = (rand() - 0.5) * 0.5;
    const lean = (rand() - 0.5) * 0.25;
    if (rand() < 0.65) {
      const h = 1.4 + rand() * 1.2;
      const g = new THREE.BoxGeometry(1.4, h, 0.35);
      g.translate(0, h / 2, 0);
      g.rotateZ(lean);
      const top = new THREE.CylinderGeometry(0.7, 0.7, 0.35, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2);
      top.rotateX(Math.PI / 2);
      top.translate(0, h, 0);
      top.rotateZ(lean);
      graveGeos.push(g.rotateY(yaw).translate(x, 0, z), top.rotateY(yaw).translate(x, 0, z));
    } else {
      const h = 2 + rand();
      const v = new THREE.BoxGeometry(0.3, h, 0.3).translate(0, h / 2, 0);
      const bar = new THREE.BoxGeometry(1.2, 0.3, 0.3).translate(0, h * 0.7, 0);
      for (const g of [v, bar]) crossGeos.push(g.rotateZ(lean).rotateY(yaw).translate(x, 0, z));
    }
  }

  // Dead trees with crooked branches.
  for (let k = 0; k < 110; k++) {
    const x = -300 + rand() * 560;
    const z = -160 + rand() * 600;
    if (!clear(x, z, 4)) continue;
    const h = 6 + rand() * 6;
    const lean = (rand() - 0.5) * 0.3;
    treeGeos.push(new THREE.CylinderGeometry(0.35, 0.8, h, 5).translate(0, h / 2, 0).rotateZ(lean).translate(x, 0, z));
    const branches = 3 + Math.floor(rand() * 4);
    for (let b = 0; b < branches; b++) {
      const len = 2 + rand() * 4;
      const by = h * (0.45 + rand() * 0.5);
      const br = new THREE.CylinderGeometry(0.08, 0.25, len, 4).translate(0, len / 2, 0);
      br.rotateZ(0.6 + rand() * 0.7);
      br.rotateY(rand() * Math.PI * 2);
      treeGeos.push(br.translate(x, by, z));
    }
  }

  // Wrought-iron fence spikes and jack-o'-lanterns along the course walls, green lamps at intervals.
  const n = track.samples.length;
  const spike = new THREE.ConeGeometry(0.08, 0.5, 4);
  const bar = new THREE.CylinderGeometry(0.05, 0.05, 2.2, 4);
  for (let i = 0; i < n; i += 2) {
    const smp = track.samples[i];
    if (insideManor(smp.pos.x, smp.pos.z)) continue;
    const h = track.heightAt(smp.s);
    for (const side of [-1, 1]) {
      const p = smp.pos.clone().addScaledVector(smp.right, side * (WALL_HALF + 1.4));
      fenceGeos.push(placed(bar, p.x, h + 2.2, p.z), placed(spike, p.x, h + 3.5, p.z));
    }
  }
  const topRail: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i += 6) {
    const a = track.samples[i];
    const b = track.samples[(i + 6) % n];
    if (insideManor(a.pos.x, a.pos.z) || insideManor(b.pos.x, b.pos.z)) continue;
    for (const side of [-1, 1]) {
      const p0 = a.pos.clone().addScaledVector(a.right, side * (WALL_HALF + 1.4));
      const p1 = b.pos.clone().addScaledVector(b.right, side * (WALL_HALF + 1.4));
      const len = p0.distanceTo(p1) + 0.1;
      const mid = p0.add(p1).multiplyScalar(0.5);
      topRail.push(new THREE.BoxGeometry(0.1, 0.1, len).rotateY(Math.atan2(p1.x - mid.x, p1.z - mid.z)).translate(mid.x, 3.1, mid.z));
    }
  }
  fenceGeos.push(...topRail);

  const pumpkin = new THREE.SphereGeometry(0.75, 10, 6).scale(1, 0.75, 1);
  const stem = new THREE.CylinderGeometry(0.08, 0.12, 0.35, 5);
  const lampPost = new THREE.CylinderGeometry(0.12, 0.18, 4.5, 6);
  const lampHead = new THREE.OctahedronGeometry(0.5, 0);
  for (let i = 0; i < n; i += 9) {
    const smp = track.samples[i];
    if (insideManor(smp.pos.x, smp.pos.z)) continue;
    const yaw = Math.atan2(smp.tan.x, smp.tan.z);
    const side = (i / 9) % 2 ? 1 : -1;
    const p = smp.pos.clone().addScaledVector(smp.right, side * (WALL_HALF + 2.6));
    if ((i / 9) % 3 === 0) {
      lampGeos.push(placed(lampPost, p.x, 2.25, p.z));
      wispGeos.push(placed(lampHead, p.x, 4.9, p.z));
    } else {
      // Face the road: the carved face is at +Z of the sphere wrap after this yaw.
      const faceYaw = yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI / 2;
      pumpkinGeos.push(placed(pumpkin, p.x, 0.55, p.z, faceYaw));
      stemGeos.push(placed(stem, p.x, 1.2, p.z));
    }
  }

  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material, shadows = true) => {
    const m = merged(geos, mat, shadows);
    if (m) group.add(m);
    return m;
  };
  const stoneTex = mossStoneTexture();
  add(graveGeos, new THREE.MeshLambertMaterial({ map: stoneTex, flatShading: true }));
  add(crossGeos, new THREE.MeshLambertMaterial({ color: 0x6a6a70, flatShading: true }));
  add(treeGeos, new THREE.MeshLambertMaterial({ color: 0x2a2220, flatShading: true }));
  add(fenceGeos, new THREE.MeshLambertMaterial({ color: 0x141218 }), false);
  add(pumpkinGeos, new THREE.MeshBasicMaterial({ map: pumpkinTexture() }), false);
  add(stemGeos, new THREE.MeshLambertMaterial({ color: 0x3a5a20 }), false);
  add(lampGeos, new THREE.MeshLambertMaterial({ color: 0x141218 }), false);
  const wisps = add(wispGeos, new THREE.MeshBasicMaterial({ color: 0x8affa0 }), false);
  if (wisps) animate(wisps, (t) => (wisps.material as THREE.MeshBasicMaterial).color.setHSL(0.36, 1, 0.68 + Math.sin(t * 3) * 0.08));

  // Mausoleum and an open crypt near the graveyard straight.
  const crypt = new THREE.Group();
  const stoneMat = new THREE.MeshLambertMaterial({ map: stoneTex, flatShading: true });
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 12), stoneMat);
  body.position.y = 5;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(10.5, 6, 4).rotateY(Math.PI / 4), stoneMat);
  roof.scale.set(1, 1, 0.85);
  roof.position.y = 13;
  const door = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), new THREE.MeshBasicMaterial({ color: 0x40ff80 }));
  door.position.set(0, 3, 6.05);
  crypt.add(body, roof, door);
  crypt.position.set(-205, 0, 95);
  crypt.rotation.y = Math.PI / 2;
  crypt.traverse((o) => (o.castShadow = true));
  group.add(crypt);

  // Bats circling the manor roof.
  const batMat = new THREE.MeshBasicMaterial({ color: 0x0a0810, side: THREE.DoubleSide });
  for (let b = 0; b < 14; b++) {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1.6, 0.3, -0.4, -0.8, 0, 0.6, 0, 0, 0, 1.6, 0.3, -0.4, 0.8, 0, 0.6], 3));
    const bat = new THREE.Mesh(wing, batMat);
    const r = 40 + rand() * 50;
    const speed = 0.3 + rand() * 0.4;
    const phase = rand() * Math.PI * 2;
    const y = MANOR_HEIGHT + 20 + rand() * 30;
    animate(bat, (t) => {
      const a = phase + t * speed;
      bat.position.set(Math.cos(a) * r, y + Math.sin(t * 2 + phase) * 3, 210 + Math.sin(a) * r);
      bat.rotation.y = -a;
      bat.scale.y = 0.4 + Math.abs(Math.sin(t * 14 + phase)) * 1.4;
    });
    bat.frustumCulled = false;
    group.add(bat);
  }
}

function buildStartArch(track: Track, group: THREE.Group) {
  const smp = track.samples[0];
  const yaw = Math.atan2(smp.tan.x, smp.tan.z);
  const arch = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ map: mossStoneTexture(), flatShading: true });
  const iron = new THREE.MeshLambertMaterial({ color: 0x141218, flatShading: true });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 3), stone);
    pillar.position.set(side * (WALL_HALF + 2.5), 6, 0);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd8d0c0 }));
    skull.position.set(side * (WALL_HALF + 2.5), 13, 0);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 2, 6), new THREE.MeshBasicMaterial({ color: 0x8affa0 }));
    flame.position.set(side * (WALL_HALF + 2.5), 14.8, 0);
    arch.add(pillar, skull, flame);
  }
  const curve = new THREE.Mesh(new THREE.TorusGeometry(WALL_HALF + 2.5, 0.35, 5, 24, Math.PI), iron);
  curve.position.y = 11;
  arch.add(curve);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 3),
    new THREE.MeshBasicMaterial({ map: signTexture('GLOOMHOLLOW', '#1a1020', '#9effa8', '#5a3a6a', 'bold 58px Georgia, serif'), side: THREE.DoubleSide }),
  );
  sign.position.y = 17.5;
  sign.rotation.y = Math.PI;
  arch.add(sign);
  arch.position.copy(smp.pos).setY(track.heightAt(0));
  arch.rotation.y = yaw;
  arch.traverse((o) => (o.castShadow = true));
  group.add(arch);
}

function buildSky(group: THREE.Group) {
  // Full moon with a soft halo, low over the manor.
  const moon = new THREE.Mesh(new THREE.SphereGeometry(40, 20, 14), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }));
  moon.position.set(-150, 260, 900);
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,250,220,0.6)');
  g.addColorStop(1, 'rgba(255,250,220,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: toTexture(c, false), fog: false, depthWrite: false, transparent: true }));
  halo.scale.setScalar(260);
  halo.position.copy(moon.position);
  group.add(moon, halo);
}

export const HAUNTED: CourseDef = {
  id: 'gloomhollow-manor',
  name: 'Gloomhollow Manor',
  tagline: 'A moonlit graveyard, then in the front door, up the grand stairs and off the gallery.',
  controlPoints: HAUNTED_POINTS,
  ramps: [
    { at: 0.393, length: 8, height: 1.4 }, // off the end of the gallery, down the back stairs
    { at: 0.84, length: 14, height: 2.4 }, // over a fallen headstone in the graveyard
  ],
  itemRows: [0.07, 0.31, 0.5, 0.7, 0.92],
  crossings: [0.16, 0.285, 0.6, 0.79],
  walker: (rand) => makeGhost(rand),
  env: {
    sky: ['#07051a', '#1d1240', '#3a2458', '#5a3a5a'],
    fog: 0x2a2040,
    fogNear: 70,
    fogFar: 480,
    hemiSky: 0x8a7ad0,
    hemiGround: 0x2a2030,
    hemiIntensity: 1.25,
    sun: 0xb8c8ff,
    sunIntensity: 1.3,
    dust: 0x5a5060,
  },
  surfaces: {
    road: gravePathTexture,
    verge: () => {
      const [c, ctx] = canvas(128, 128);
      const rand = mulberry32(39);
      ctx.fillStyle = '#2a2a24';
      ctx.fillRect(0, 0, 128, 128);
      speckle(ctx, 128, 128, rand, 2500, 0.2);
      ctx.fillStyle = 'rgba(60,90,40,0.6)';
      for (let i = 0; i < 60; i++) ctx.fillRect(rand() * 128, rand() * 128, 2, 5 + rand() * 6);
      return toTexture(c);
    },
    wall: () => new THREE.MeshLambertMaterial({ map: mossStoneTexture() }),
    wallHeight: 1.0,
  },
  music: { seed: 6661, tempo: 0.19 },
  ambience: 'haunted',
  ambienceAt: (x, z) => (insideManor(x, z) ? 'hauntedInterior' : 'haunted'),
  decorate: decorateHaunted,
};
