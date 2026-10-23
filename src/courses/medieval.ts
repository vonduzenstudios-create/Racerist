import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pick } from '../rng';
import { cobbleTexture, facadeTexture, roadTexture, roofTexture, stoneWallTexture } from '../textures';
import { ROAD_HALF, type Track, WALL_HALF } from '../track';
import type { CourseDef, WalkerModel } from './course';

// Castle Town: the original course. A half-timbered market town under a hilltop castle.

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function makePeasant(rand: () => number): WalkerModel {
  const root = new THREE.Group();
  const tunic = lambert(pick(rand, [0x8a5a3a, 0x5d7a3a, 0x7a3a3a, 0x4a5a7a, 0x9a8a5a]));
  const skin = lambert(pick(rand, [0xf0c8a0, 0xd9a07a, 0xb07850, 0x8a5a3a]));
  const legMat = lambert(0x4a3a2a);
  const legs: THREE.Object3D[] = [];
  for (const x of [-0.18, 0.18]) {
    const leg = new THREE.Group();
    leg.add(part(new THREE.BoxGeometry(0.22, 0.8, 0.22), legMat, 0, -0.4, 0));
    leg.position.set(x, 0.85, 0);
    root.add(leg);
    legs.push(leg);
  }
  root.add(part(new THREE.CylinderGeometry(0.35, 0.5, 1.0, 6), tunic, 0, 1.3, 0));
  root.add(part(new THREE.BoxGeometry(0.45, 0.45, 0.45), skin, 0, 2.05, 0));
  // Straw hat or a hood.
  if (rand() < 0.5) root.add(part(new THREE.ConeGeometry(0.55, 0.35, 8), lambert(0xd8b860), 0, 2.4, 0));
  else root.add(part(new THREE.ConeGeometry(0.32, 0.5, 6), tunic, 0, 2.45, -0.05));
  // Carrying something to market above their head.
  const load = rand();
  if (load < 0.4) {
    root.add(part(new THREE.CylinderGeometry(0.5, 0.35, 0.4, 8), lambert(0xa07840), 0, 2.85, 0));
    for (let i = 0; i < 3; i++) root.add(part(new THREE.SphereGeometry(0.18, 5, 4), lambert(0xd89a50), -0.2 + i * 0.2, 3.1, 0));
  } else if (load < 0.75) {
    root.add(part(new THREE.BoxGeometry(0.9, 0.5, 0.6), lambert(0xd8c060), 0, 2.85, 0)); // hay bale
  } else {
    root.add(part(new THREE.CylinderGeometry(0.35, 0.35, 0.7, 8).rotateZ(Math.PI / 2), lambert(0x7a5230), 0, 2.85, 0)); // keg
  }
  for (const x of [-0.42, 0.42]) {
    const arm = part(new THREE.BoxGeometry(0.16, 0.8, 0.16), tunic, x, 2.3, 0);
    arm.rotation.z = x > 0 ? -0.25 : 0.25;
    root.add(arm);
  }
  return { root, legs, speed: 1.8 + rand() * 1.4, sound: 'bump', color: 0xd8c060 };
}

function makePig(): WalkerModel {
  const root = new THREE.Group();
  const pink = lambert(0xf0a0a8);
  const dark = lambert(0xc07078);
  root.add(part(new THREE.BoxGeometry(0.9, 0.8, 1.5), pink, 0, 0.8, 0));
  root.add(part(new THREE.BoxGeometry(0.7, 0.65, 0.55), pink, 0, 0.95, 0.95));
  root.add(part(new THREE.BoxGeometry(0.4, 0.3, 0.15), dark, 0, 0.85, 1.28));
  for (const x of [-0.22, 0.22]) root.add(part(new THREE.ConeGeometry(0.12, 0.25, 4), pink, x, 1.35, 0.85));
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.3, 0.5], [0.3, 0.5], [-0.3, -0.5], [0.3, -0.5]]) {
    const leg = new THREE.Group();
    leg.add(part(new THREE.BoxGeometry(0.22, 0.45, 0.22), dark, 0, -0.22, 0));
    leg.position.set(x, 0.45, z);
    root.add(leg);
    legs.push(leg);
  }
  return { root, legs, speed: 3.2, sound: 'oink', color: 0xf0a0a8 };
}

function buildStartGate(track: Track, g: THREE.Group) {
  const smp = track.samples[0];
  const yaw = Math.atan2(smp.tan.x, smp.tan.z);
  // Castle gatehouse arching over the start line.
  const stone = new THREE.MeshLambertMaterial({ map: stoneWallTexture(), flatShading: true });
  const gate = new THREE.Group();
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(6, 16, 7), stone);
    tower.position.set(side * (WALL_HALF + 3.5), 8, 0);
    gate.add(tower);
    for (let k = -1; k <= 1; k++) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.6, 1.5), stone);
      merlon.position.set(side * (WALL_HALF + 3.5) + k * 2.2, 16.8, 2.6);
      gate.add(merlon);
    }
    const cap = new THREE.Mesh(
      new THREE.ConeGeometry(4.6, 6, 4).rotateY(Math.PI / 4),
      new THREE.MeshLambertMaterial({ color: 0x3c4a6b, flatShading: true }),
    );
    cap.position.set(side * (WALL_HALF + 3.5), 19.6, 0);
    gate.add(cap);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(WALL_HALF * 2 + 7, 4, 6), stone);
  bridge.position.set(0, 13, 0);
  gate.add(bridge);
  // Hanging banners.
  const banner = document.createElement('canvas');
  banner.width = 512;
  banner.height = 96;
  const bctx = banner.getContext('2d')!;
  bctx.fillStyle = '#7a1f2b';
  bctx.fillRect(0, 0, 512, 96);
  bctx.strokeStyle = '#e8c15a';
  bctx.lineWidth = 6;
  bctx.strokeRect(6, 6, 500, 84);
  bctx.fillStyle = '#f3dc8a';
  bctx.font = 'bold 64px Georgia, serif';
  bctx.textAlign = 'center';
  bctx.textBaseline = 'middle';
  bctx.fillText('RACERIST', 256, 52);
  const btex = new THREE.CanvasTexture(banner);
  btex.colorSpace = THREE.SRGBColorSpace;
  for (const z of [-3.05, 3.05]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: btex }));
    sign.position.set(0, 12.6, z);
    if (z < 0) sign.rotation.y = Math.PI;
    gate.add(sign);
  }
  gate.position.copy(smp.pos);
  gate.rotation.y = yaw;
  gate.traverse((o) => {
    o.castShadow = true;
  });
  g.add(gate);
}

function buildCrossings(track: Track, g: THREE.Group) {
  // Straw-strewn market crossings where peasants and pigs wander over the road.
  const mat = new THREE.MeshLambertMaterial({ color: 0xd8c27a, transparent: true, opacity: 0.55 });
  for (const s of track.crossings) {
    for (let k = -2; k <= 2; k++) {
      const smp = track.sampleAt(s + k * 1.6);
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 - 3, 0.8).rotateX(-Math.PI / 2), mat);
      stripe.position.copy(smp.pos).setY(0.05);
      stripe.rotation.y = Math.atan2(smp.tan.x, smp.tan.z);
      g.add(stripe);
    }
  }
}

function buildHouses(track: Track, g: THREE.Group, rand: () => number) {
  const palettes: [string, string][] = [
    ['#efe6d2', '#4a2f1d'],
    ['#e9d9b4', '#5b3a22'],
    ['#f3eee4', '#3b2a1f'],
    ['#e2cfa8', '#6a4428'],
  ];
  const roofs = [
    roofTexture(150, 70, 50, 1),
    roofTexture(80, 84, 96, 2),
    roofTexture(196, 160, 90, 3),
  ];
  const wallGeos: THREE.BufferGeometry[][] = palettes.map(() => []);
  const roofGeos: THREE.BufferGeometry[][] = roofs.map(() => []);
  const tile = 7; // metres covered by one facade texture tile

  const tryPlace = (x: number, z: number, w: number, d: number, h: number, yaw: number) => {
    const r = Math.hypot(w, d) / 2;
    if (track.distanceToCentre(x, z) < WALL_HALF + 2.5 + r) return;
    const box = new THREE.BoxGeometry(w, h, d);
    // Scale UVs per face so windows stay the same size on every house.
    const uv = box.getAttribute('uv') as THREE.BufferAttribute;
    const faceSize = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const idx = f * 4 + v;
        uv.setXY(idx, uv.getX(idx) * (faceSize[f][0] / tile), uv.getY(idx) * (faceSize[f][1] / tile));
      }
    }
    box.rotateY(yaw);
    box.translate(x, h / 2, z);
    wallGeos[Math.floor(rand() * palettes.length)].push(box);
    // Steep pitched roof: a four-sided cone squashed to the footprint.
    const roofH = 4 + rand() * 4;
    const roof = new THREE.ConeGeometry(Math.SQRT1_2, roofH, 4, 1).rotateY(Math.PI / 4);
    roof.scale(w + 1.2, 1, d + 1.2);
    roof.rotateY(yaw);
    roof.translate(x, h + roofH / 2, z);
    roofGeos[Math.floor(rand() * roofs.length)].push(roof);
  };

  for (let i = 0; i < track.samples.length; i += 11) {
    const smp = track.samples[i];
    const yaw = Math.atan2(smp.tan.x, smp.tan.z);
    for (const side of [-1, 1]) {
      if (rand() < 0.12) continue;
      const w = 8 + rand() * 6;
      const d = 8 + rand() * 5;
      const h = 7 + rand() * 9;
      const off = WALL_HALF + 4 + d / 2 + rand() * 3;
      tryPlace(smp.pos.x + smp.right.x * off * side, smp.pos.z + smp.right.z * off * side, w, d, h, yaw);
      // A second row behind for depth.
      if (rand() < 0.6) {
        const off2 = off + d + 2 + rand() * 6;
        tryPlace(smp.pos.x + smp.right.x * off2 * side, smp.pos.z + smp.right.z * off2 * side, w, d, h + 3 + rand() * 6, yaw);
      }
    }
  }

  palettes.forEach(([plaster, timber], k) => {
    if (!wallGeos[k].length) return;
    const mesh = new THREE.Mesh(
      mergeGeometries(wallGeos[k]),
      new THREE.MeshLambertMaterial({ map: facadeTexture(plaster, timber, 100 + k) }),
    );
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  });
  roofs.forEach((tex, k) => {
    if (!roofGeos[k].length) return;
    tex.repeat.set(4, 4);
    const mesh = new THREE.Mesh(
      mergeGeometries(roofGeos[k]),
      new THREE.MeshLambertMaterial({ map: tex, flatShading: true }),
    );
    mesh.castShadow = true;
    g.add(mesh);
  });
}

function buildProps(track: Track, g: THREE.Group, rand: () => number) {
  const iron = new THREE.MeshLambertMaterial({ color: 0x2d2a28 });
  const flame = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const awnings = [0xb23a3a, 0x2f6aa8, 0x3d8a4a, 0xd9a43a].map(
    (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }),
  );
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5232, flatShading: true });
  const leaf = new THREE.MeshLambertMaterial({ color: 0x4f8a3c, flatShading: true });
  const goods = [0xd84a3a, 0xe8b03a, 0x7cb342, 0xa0522d].map((c) => new THREE.MeshLambertMaterial({ color: c }));

  for (let i = 0; i < track.samples.length; i += 25) {
    const smp = track.samples[i];
    const yaw = Math.atan2(smp.tan.x, smp.tan.z);
    const side = (i / 25) % 2 ? 1 : -1;
    // Torch posts along the wall.
    const post = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 4.5, 6), iron);
    pole.position.y = 2.25;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.25, 0.5, 6), iron);
    bowl.position.y = 4.6;
    const fire = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 5), flame);
    fire.position.y = 5.2;
    post.add(pole, bowl, fire);
    post.position.copy(smp.pos).addScaledVector(smp.right, side * (WALL_HALF + 2.4));
    g.add(post);

    if (rand() < 0.35) {
      // Market stall with a striped awning, tucked behind the wall.
      const stall = new THREE.Group();
      const table = new THREE.Mesh(new THREE.BoxGeometry(4, 1, 2), wood);
      table.position.y = 0.5;
      stall.add(table);
      for (const [x, z] of [[-1.9, -0.9], [1.9, -0.9], [-1.9, 0.9], [1.9, 0.9]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), wood);
        leg.position.set(x, 1.5, z);
        stall.add(leg);
      }
      const awning = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.2, 2.8), pick(rand, awnings));
      awning.position.y = 3.05;
      awning.rotation.x = 0.15;
      stall.add(awning);
      for (let k = 0; k < 5; k++) {
        const item = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), pick(rand, goods));
        item.position.set(-1.5 + k * 0.75, 1.2, (rand() - 0.5) * 0.8);
        stall.add(item);
      }
      stall.position.copy(smp.pos).addScaledVector(smp.right, -side * (WALL_HALF + 4));
      stall.rotation.y = yaw + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      stall.traverse((o) => (o.castShadow = true));
      g.add(stall);
    } else if (rand() < 0.5) {
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 3, 6), wood);
      trunk.position.y = 1.5;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 0), leaf);
      crown.position.y = 4.4;
      tree.add(trunk, crown);
      tree.position.copy(smp.pos).addScaledVector(smp.right, -side * (WALL_HALF + 4));
      tree.traverse((o) => (o.castShadow = true));
      g.add(tree);
    }
  }
}

/** Big silhouettes that orient the player: a hilltop castle and the outer city wall. */
function buildLandmarks(g: THREE.Group) {
  const stone = new THREE.MeshLambertMaterial({ map: stoneWallTexture(), flatShading: true });
  const slate = new THREE.MeshLambertMaterial({ color: 0x3c4a6b, flatShading: true });
  const castle = new THREE.Group();
  const hill = new THREE.Mesh(new THREE.ConeGeometry(70, 30, 10), new THREE.MeshLambertMaterial({ color: 0x5f8a3f, flatShading: true }));
  hill.position.y = 15;
  castle.add(hill);
  const keep = new THREE.Mesh(new THREE.BoxGeometry(26, 30, 26), stone);
  keep.position.y = 44;
  castle.add(keep);
  for (const [x, z] of [[-16, -16], [16, -16], [-16, 16], [16, 16], [0, 0]]) {
    const tall = x === 0 ? 50 : 38;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.5, tall, 10), stone);
    tower.position.set(x, 28 + tall / 2, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(6.5, 12, 10), slate);
    cap.position.set(x, 28 + tall + 6, z);
    castle.add(tower, cap);
  }
  castle.position.set(40, 0, 490);
  g.add(castle);

  // Outer curtain wall with round towers, well clear of the course.
  const centre = new THREE.Vector2(25, 125);
  const rx = 300;
  const rz = 270;
  const segs = 40;
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    const p0 = new THREE.Vector3(centre.x + Math.cos(a0) * rx, 0, centre.y + Math.sin(a0) * rz);
    const p1 = new THREE.Vector3(centre.x + Math.cos(a1) * rx, 0, centre.y + Math.sin(a1) * rz);
    const len = p0.distanceTo(p1);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3, 14, len + 1), stone);
    wall.position.copy(p0).add(p1).multiplyScalar(0.5).setY(7);
    wall.rotation.y = Math.atan2(p1.x - p0.x, p1.z - p0.z);
    g.add(wall);
    if (k % 4 === 0) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.5, 22, 8), stone);
      tower.position.copy(p0).setY(11);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(6.2, 9, 8), slate);
      cap.position.copy(p0).setY(26.5);
      g.add(tower, cap);
    }
  }
}

export const MEDIEVAL: CourseDef = {
  id: 'castle-town',
  name: 'Castle Town',
  tagline: 'Market crossings, a gatehouse and a jump in a half-timbered town.',
  controlPoints: [
    [0, 0], [80, 0], [150, 10], [190, 50], [195, 110], [160, 150],
    [110, 150], [80, 120], [40, 120], [10, 160], [20, 220], [-30, 250],
    [-100, 240], [-140, 190], [-130, 120], [-150, 60], [-120, 10], [-60, -5],
  ],
  ramps: [{ at: 0.105, length: 16, height: 2.6 }],
  itemRows: [0.17, 0.43, 0.66, 0.9],
  crossings: [0.3, 0.52, 0.8],
  walker: (rand, crossing, i, count) => (i === count - 1 && crossing !== 1 ? makePig() : makePeasant(rand)),
  env: {
    sky: ['#3a8fd9', '#9fd3f5', '#ffe2b8', '#ffd29a'],
    fog: 0xf2dcc0,
    fogNear: 180,
    fogFar: 750,
    hemiSky: 0xd6ecff,
    hemiGround: 0x8a7a5a,
    hemiIntensity: 1.5,
    sun: 0xfff0d6,
    sunIntensity: 2.2,
    dust: 0xb89a70,
  },
  surfaces: {
    road: roadTexture,
    verge: () => cobbleTexture([170, 150, 120], 4),
    wall: () => new THREE.MeshLambertMaterial({ map: stoneWallTexture() }),
    wallHeight: 1.2,
  },
  music: { seed: 1234, tempo: 0.155 },
  decorate(track, g, rand) {
    // Ground: a big cobbled square, plus grass outside the city walls.
    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(900, 48).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x6f9a4a }),
    );
    grass.position.set(20, -0.06, 120);
    g.add(grass);
    const cobbles = cobbleTexture([150, 140, 125], 9);
    cobbles.repeat.set(70, 70);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(520, 480).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: cobbles }),
    );
    ground.position.set(25, -0.04, 125);
    ground.receiveShadow = true;
    g.add(ground);

    buildStartGate(track, g);
    buildCrossings(track, g);
    buildHouses(track, g, rand);
    buildProps(track, g, rand);
    buildLandmarks(g);
  },
};
