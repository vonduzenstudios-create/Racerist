import * as THREE from 'three';
import { pick } from '../rng';
import { type Track, WALL_HALF } from '../track';
import type { CourseDef, WalkerModel } from './course';
import { bannerTexture, buildTerrain, dirtRoadTexture, groundTexture, place, PropBatch, waves, woodTexture } from './terrain';

// Whispering Woods: a dirt road over rolling hills through pines and oaks, past a
// stream, a mushroom glade and an ancient tree, with deer and boar on the road.

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function makeDeer(rand: () => number): WalkerModel {
  const root = new THREE.Group();
  const coat = lambert(pick(rand, [0xa8693a, 0x9a5f34, 0xb27848]));
  const pale = lambert(0xf2e6d0);
  const dark = lambert(0x3a2618);
  // Body faces +x so it walks sideways across the road like the other walkers.
  const body = new THREE.Group();
  body.add(part(new THREE.BoxGeometry(0.6, 0.7, 1.5), coat, 0, 1.25, 0));
  body.add(part(new THREE.BoxGeometry(0.3, 0.8, 0.35), coat, 0, 1.75, 0.65));
  body.add(part(new THREE.BoxGeometry(0.38, 0.38, 0.6), coat, 0, 2.15, 0.85));
  body.add(part(new THREE.BoxGeometry(0.2, 0.18, 0.2), dark, 0, 2.1, 1.18));
  body.add(part(new THREE.BoxGeometry(0.22, 0.25, 0.1), pale, 0, 1.45, -0.78));
  for (const x of [-0.2, 0.2]) {
    const ear = part(new THREE.ConeGeometry(0.1, 0.32, 4), coat, x * 1.3, 2.4, 0.7);
    ear.rotation.z = x > 0 ? -0.7 : 0.7;
    body.add(ear);
  }
  if (rand() < 0.6) {
    // Antlers: a main beam and two tines each side.
    for (const x of [-0.12, 0.12]) {
      const beam = part(new THREE.CylinderGeometry(0.035, 0.05, 0.7, 4), pale, x * 2, 2.65, 0.75);
      beam.rotation.z = x > 0 ? -0.5 : 0.5;
      body.add(beam);
      for (const [y, z] of [[2.7, 0.62], [2.85, 0.85]]) {
        const tine = part(new THREE.CylinderGeometry(0.025, 0.035, 0.35, 4), pale, x * 3, y, z);
        tine.rotation.x = 0.5;
        body.add(tine);
      }
    }
  }
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) {
    const leg = new THREE.Group();
    leg.add(part(new THREE.BoxGeometry(0.14, 0.95, 0.14), coat, 0, -0.47, 0));
    leg.position.set(x, 0.95, z);
    body.add(leg);
    legs.push(leg);
  }
  root.add(body);
  return { root, legs, speed: 3.6, sound: 'bump', color: 0xb27848 };
}

function makeBoar(): WalkerModel {
  const root = new THREE.Group();
  const hide = lambert(0x4a3528);
  const snout = lambert(0x6a4a3a);
  const tusk = lambert(0xf3ead8);
  const body = new THREE.Group();
  body.add(part(new THREE.BoxGeometry(0.9, 0.85, 1.5), hide, 0, 0.8, 0));
  // Bristly ridge along the back.
  body.add(part(new THREE.BoxGeometry(0.2, 0.25, 1.3), lambert(0x2e2018), 0, 1.3, 0));
  body.add(part(new THREE.BoxGeometry(0.7, 0.65, 0.55), hide, 0, 0.85, 0.95));
  body.add(part(new THREE.BoxGeometry(0.42, 0.32, 0.22), snout, 0, 0.72, 1.3));
  for (const x of [-0.2, 0.2]) {
    const t = part(new THREE.ConeGeometry(0.05, 0.3, 4), tusk, x, 0.82, 1.32);
    t.rotation.x = -0.6;
    body.add(t);
    body.add(part(new THREE.ConeGeometry(0.12, 0.25, 4), hide, x, 1.25, 0.85));
  }
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.5], [0.3, -0.5]]) {
    const leg = new THREE.Group();
    leg.add(part(new THREE.BoxGeometry(0.22, 0.45, 0.22), snout, 0, -0.22, 0));
    leg.position.set(x, 0.45, z);
    body.add(leg);
    legs.push(leg);
  }
  root.add(body);
  return { root, legs, speed: 4.2, sound: 'oink', color: 0x6a4a3a };
}

// Reusable tree pieces, built once and stamped into batches.
const pineTrunk = new THREE.CylinderGeometry(0.35, 0.55, 4, 6).translate(0, 2, 0);
const pineTiers = [0, 1, 2].map((k) => new THREE.ConeGeometry(3.4 - k * 0.9, 4.2, 7).translate(0, 4.2 + k * 2.6, 0));
const oakTrunk = new THREE.CylinderGeometry(0.45, 0.7, 4.5, 6).translate(0, 2.25, 0);
const oakCrown = new THREE.IcosahedronGeometry(3.4, 0);
const birchTrunk = new THREE.CylinderGeometry(0.22, 0.3, 7, 5).translate(0, 3.5, 0);
const birchCrown = new THREE.IcosahedronGeometry(2, 0);

function buildTrees(track: Track, g: THREE.Group, rand: () => number, ground: (x: number, z: number) => number) {
  const batch = new PropBatch();
  const bark = lambert(0x5a3c24);
  const birchBark = lambert(0xe8e4da);
  const pines = [0x2f5d34, 0x3a6b3a, 0x27502e].map(lambert);
  const leaves = [0x4f8a3c, 0x5f9a40, 0x6f9f3a, 0xc8902e].map(lambert);
  const birchLeaves = lambert(0x9cc25a);

  const tryTree = (x: number, z: number) => {
    if (track.distanceToCentre(x, z) < WALL_HALF + 4) return;
    const y = ground(x, z) - 0.2;
    const yaw = rand() * Math.PI * 2;
    const s = 0.8 + rand() * 0.6;
    const kind = rand();
    if (kind < 0.55) {
      const m = place(x, y, z, yaw, s);
      batch.add(bark, pineTrunk, m);
      const mat = pick(rand, pines);
      for (const tier of pineTiers) batch.add(mat, tier, m);
    } else if (kind < 0.85) {
      const m = place(x, y, z, yaw, s);
      batch.add(bark, oakTrunk, m);
      const crown = place(x, y + 6 * s, z, yaw, s * (0.9 + rand() * 0.3));
      batch.add(pick(rand, leaves), oakCrown, crown);
    } else {
      const m = place(x, y, z, yaw, s);
      batch.add(birchBark, birchTrunk, m);
      batch.add(birchLeaves, birchCrown, place(x, y + 7.2 * s, z, yaw, s));
    }
  };

  // A dense wall of trees just past the fences, thinning out with distance.
  track.everySample(5, (smp) => {
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        if (rand() < 0.25 + row * 0.15) continue;
        const off = WALL_HALF + 6 + row * 9 + rand() * 6;
        const along = (rand() - 0.5) * 6;
        tryTree(
          smp.pos.x + smp.right.x * off * side + smp.tan.x * along,
          smp.pos.z + smp.right.z * off * side + smp.tan.z * along,
        );
      }
    }
  });
  // Scattered forest everywhere else.
  for (let i = 0; i < 900; i++) tryTree(-280 + rand() * 640, -180 + rand() * 600);
  batch.build(g);
}

function buildUndergrowth(track: Track, g: THREE.Group, rand: () => number, ground: (x: number, z: number) => number) {
  const batch = new PropBatch();
  const fern = [0x3f7a34, 0x4e8a3a].map(lambert);
  const rock = lambert(0x8a8a82);
  const capRed = lambert(0xd8352a);
  const capBrown = lambert(0xb07a40);
  const stem = lambert(0xf2ecd8);
  const dot = lambert(0xffffff);
  const fernGeo = new THREE.ConeGeometry(0.9, 1.4, 5).translate(0, 0.5, 0);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const stemGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.6, 6).translate(0, 0.3, 0);
  const capGeo = new THREE.SphereGeometry(0.42, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.55, 0);
  const dotGeo = new THREE.SphereGeometry(0.06, 4, 3);

  track.everySample(4, (smp) => {
    for (const side of [-1, 1]) {
      const off = WALL_HALF + 2.5 + rand() * 5;
      const x = smp.pos.x + smp.right.x * off * side;
      const z = smp.pos.z + smp.right.z * off * side;
      const y = ground(x, z);
      const r = rand();
      if (r < 0.45) batch.add(pick(rand, fern), fernGeo, place(x, y, z, rand() * 6, 0.7 + rand() * 0.8));
      else if (r < 0.6) batch.add(rock, rockGeo, place(x, y, z, rand() * 6, 0.5 + rand() * 0.9));
      else if (r < 0.72) {
        // A little cluster of toadstools.
        for (let k = 0; k < 3; k++) {
          const mx = x + (rand() - 0.5) * 1.6;
          const mz = z + (rand() - 0.5) * 1.6;
          const s = 0.7 + rand() * 0.8;
          const red = rand() < 0.6;
          batch.add(stem, stemGeo, place(mx, y, mz, 0, s));
          batch.add(red ? capRed : capBrown, capGeo, place(mx, y, mz, 0, s));
          if (red) for (let d = 0; d < 3; d++) {
            const a = rand() * Math.PI * 2;
            batch.add(dot, dotGeo, place(mx + Math.cos(a) * 0.25 * s, y + 0.82 * s, mz + Math.sin(a) * 0.25 * s, 0, s));
          }
        }
      }
    }
  });
  batch.build(g);
}

/** The mushroom glade: giant glowing toadstools ringing one stretch of road. */
function buildGlade(track: Track, g: THREE.Group, rand: () => number, ground: (x: number, z: number) => number) {
  const batch = new PropBatch();
  const stem = lambert(0xf2ecd8);
  const caps = [0xd8352a, 0x8a4fd8, 0x2fa8d8].map((c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.25, flatShading: true }));
  const stemGeo = new THREE.CylinderGeometry(0.6, 0.9, 5, 8).translate(0, 2.5, 0);
  const capGeo = new THREE.SphereGeometry(3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(0, 4.6, 0);
  const start = track.length * 0.46;
  for (let d = 0; d < 110; d += 9) {
    const smp = track.sampleAt(start + d);
    for (const side of [-1, 1]) {
      const off = WALL_HALF + 4 + rand() * 4;
      const x = smp.pos.x + smp.right.x * off * side;
      const z = smp.pos.z + smp.right.z * off * side;
      const m = place(x, ground(x, z) - 0.2, z, rand() * 6, 0.7 + rand() * 0.7);
      batch.add(stem, stemGeo, m);
      batch.add(pick(rand, caps), capGeo, m);
    }
  }
  batch.build(g);
}

/** A stream that crosses under the road, spanned by a plank bridge. */
function buildStream(track: Track, g: THREE.Group) {
  const s = track.length * 0.27;
  const smp = track.sampleAt(s);
  const yaw = Math.atan2(smp.tan.x, smp.tan.z);
  const y = smp.pos.y;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 9).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3f8fc0, transparent: true, opacity: 0.85 }),
  );
  water.position.set(smp.pos.x, y - 0.04, smp.pos.z);
  water.rotation.y = yaw;
  g.add(water);
  // Bridge deck laid over the road, with railings at the walls.
  const deck = new THREE.Mesh(new THREE.BoxGeometry((WALL_HALF + 1.5) * 2, 0.12, 11), lambert(0x9a6a3a));
  deck.position.set(smp.pos.x, y + 0.03, smp.pos.z);
  deck.rotation.y = yaw;
  deck.receiveShadow = true;
  g.add(deck);
  const rail = lambert(0x6a4528);
  for (const side of [-1, 1]) {
    const bar = part(new THREE.BoxGeometry(0.3, 0.3, 12), rail, 0, 1.6, 0);
    const holder = new THREE.Group();
    holder.add(bar);
    for (const z of [-5.5, 0, 5.5]) holder.add(part(new THREE.BoxGeometry(0.35, 1.8, 0.35), rail, 0, 0.9, z));
    holder.position.copy(smp.pos).addScaledVector(smp.right, side * (WALL_HALF + 1.4));
    holder.rotation.y = yaw;
    g.add(holder);
  }
  // Stepping stones along the banks.
  const stone = lambert(0x8f8f86);
  for (let k = -7; k <= 7; k++) {
    if (Math.abs(k) < 3) continue;
    for (const bank of [-1, 1]) {
      const p = smp.pos.clone().addScaledVector(smp.right, k * 9).addScaledVector(smp.tan, bank * 5.2);
      const r = part(new THREE.DodecahedronGeometry(0.9, 0), stone, p.x, y - 0.2, p.z);
      r.scale.y = 0.5;
      g.add(r);
    }
  }
}

function buildStartGate(track: Track, g: THREE.Group) {
  const smp = track.samples[0];
  const gate = new THREE.Group();
  const log = new THREE.MeshLambertMaterial({ map: woodTexture([110, 72, 40], 61), flatShading: true });
  for (const side of [-1, 1]) {
    gate.add(part(new THREE.CylinderGeometry(1.1, 1.3, 12, 8), log, side * (WALL_HALF + 2.5), 6, 0));
    gate.add(part(new THREE.ConeGeometry(2.4, 3, 8), lambert(0x3a6b3a), side * (WALL_HALF + 2.5), 13.4, 0));
  }
  const beam = part(new THREE.CylinderGeometry(0.9, 0.9, WALL_HALF * 2 + 8, 8), log, 0, 10.6, 0);
  beam.rotation.z = Math.PI / 2;
  gate.add(beam);
  const tex = bannerTexture('#2f5d34', '#e8c15a', '#f3e8c0');
  for (const z of [-1.0, 1.0]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(0, 8.6, z);
    if (z < 0) sign.rotation.y = Math.PI;
    gate.add(sign);
  }
  // Hanging lanterns.
  const glow = new THREE.MeshBasicMaterial({ color: 0xffd27a });
  for (const x of [-9, -4.5, 4.5, 9]) gate.add(part(new THREE.OctahedronGeometry(0.45, 0), glow, x, 9.4, 0));
  gate.position.copy(smp.pos);
  gate.rotation.y = Math.atan2(smp.tan.x, smp.tan.z);
  g.add(gate);
}

/** Big silhouettes for orientation: the ancient tree in the infield and a mountain range. */
function buildLandmarks(g: THREE.Group, ground: (x: number, z: number) => number) {
  const tree = new THREE.Group();
  const bark = lambert(0x4f3522);
  tree.add(part(new THREE.CylinderGeometry(5, 8, 40, 9), bark, 0, 20, 0));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const root = part(new THREE.CylinderGeometry(1.2, 2.4, 14, 6), bark, Math.cos(a) * 7, 2.5, Math.sin(a) * 7);
    root.rotation.set(Math.sin(a) * 0.9, 0, -Math.cos(a) * 0.9);
    tree.add(root);
  }
  const crown = [0x3f7a34, 0x4f8a3c, 0x356a2e];
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2;
    tree.add(part(new THREE.IcosahedronGeometry(12 + (k % 3) * 2, 0), lambert(crown[k % 3]), Math.cos(a) * 12, 46 + (k % 2) * 6, Math.sin(a) * 12));
  }
  tree.add(part(new THREE.IcosahedronGeometry(15, 0), lambert(0x4f8a3c), 0, 58, 0));
  tree.position.set(30, ground(30, 125) - 1, 125);
  g.add(tree);

  const rock = lambert(0x7a8290);
  const snow = lambert(0xf4f6fa);
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2;
    const h = 120 + ((k * 37) % 5) * 30;
    const r = 120 + ((k * 53) % 4) * 20;
    const x = 40 + Math.cos(a) * 620;
    const z = 120 + Math.sin(a) * 620;
    const peak = new THREE.Group();
    peak.add(part(new THREE.ConeGeometry(r, h, 6), rock, 0, h / 2, 0));
    peak.add(part(new THREE.ConeGeometry(r * 0.32, h * 0.32, 6), snow, 0, h * 0.84 + 0.5, 0));
    peak.position.set(x, -10, z);
    peak.rotation.y = k;
    g.add(peak);
  }
}

export const FOREST: CourseDef = {
  id: 'whispering-woods',
  name: 'Whispering Woods',
  tagline: 'Rolling dirt roads, a log jump, a mushroom glade and wild deer.',
  controlPoints: [
    [0, 0, 0], [90, 0, 0], [160, -25, 1], [220, 15, 3], [235, 90, 7], [195, 140, 9],
    [135, 125, 6], [95, 165, 2], [115, 235, 1], [60, 290, 0], [-20, 280, 0], [-75, 235, 2],
    [-65, 170, 5], [-115, 125, 8], [-170, 90, 4], [-160, 30, 1], [-95, -5, 0],
  ],
  ramps: [{ at: 0.155, length: 16, height: 2.8 }, { at: 0.72, length: 14, height: 2.2 }],
  itemRows: [0.2, 0.42, 0.62, 0.88],
  crossings: [0.35, 0.58, 0.83],
  walker: (rand, crossing, i, count) => (i === count - 1 && crossing !== 1 ? makeBoar() : makeDeer(rand)),
  env: {
    sky: ['#4f9fd0', '#a8d8e8', '#dff0d0', '#cfe6b8'],
    fog: 0xbfd6b0,
    fogNear: 110,
    fogFar: 620,
    hemiSky: 0xd8f0d0,
    hemiGround: 0x4a5a30,
    hemiIntensity: 1.45,
    sun: 0xfff0c8,
    sunIntensity: 2.0,
    dust: 0x9a7a52,
  },
  surfaces: {
    road: () => dirtRoadTexture([150, 112, 72], '#e8e0c8', '#7a4a2a', 31),
    verge: () => groundTexture([92, 128, 58], ['#6f9a3a', '#4a7a2e', '#a08040', '#c8b060'], 32),
    wall: () => new THREE.MeshLambertMaterial({ map: woodTexture([120, 82, 48], 33) }),
    wallHeight: 1.1,
  },
  music: { seed: 2718, tempo: 0.165 },
  ambience: 'forest',
  decorate(track, g, rand) {
    const hills = waves(41, 0.012);
    const { mesh, heightAt } = buildTerrain(track, {
      centre: [30, 130],
      size: 1500,
      segments: 150,
      height: (x, z) => 4 + hills(x, z) * 10 + Math.max(0, Math.hypot(x - 30, z - 130) - 380) * 0.15,
      color: (x, z, h, out) => {
        const n = hills(z * 1.7, x * 1.3);
        out.setRGB(0.3 + n * 0.04, 0.48 + n * 0.06 + h * 0.003, 0.2);
      },
    });
    g.add(mesh);
    buildStartGate(track, g);
    buildStream(track, g);
    buildGlade(track, g, rand, heightAt);
    buildTrees(track, g, rand, heightAt);
    buildUndergrowth(track, g, rand, heightAt);
    buildLandmarks(g, heightAt);
    // Fence posts between the log rails.
    const post = lambert(0x5a3c24);
    const posts = new PropBatch();
    const postGeo = new THREE.CylinderGeometry(0.28, 0.32, 1.9, 5).translate(0, 0.95, 0);
    track.everySample(12, (smp) => {
      for (const side of [-1, 1]) {
        const p = smp.pos.clone().addScaledVector(smp.right, side * (WALL_HALF + 1.4));
        posts.add(post, postGeo, place(p.x, smp.pos.y, p.z));
      }
    });
    posts.build(g);
  },
};
