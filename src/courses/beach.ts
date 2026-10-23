import * as THREE from 'three';
import { pick } from '../rng';
import { type Track, WALL_HALF } from '../track';
import type { CourseDef, WalkerModel } from './course';
import { bannerTexture, buildTerrain, dirtRoadTexture, groundTexture, place, PropBatch, waves, woodTexture } from './terrain';

// Sunset Shore: a sandy loop round a palm-covered island, past beach huts and a
// lighthouse, along the surf, with crabs and turtles crossing the road.

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
const SEA_LEVEL = -0.6;
const CENTRE: [number, number] = [20, 115];

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function makeCrab(rand: () => number): WalkerModel {
  const root = new THREE.Group();
  const shell = lambert(pick(rand, [0xd8402a, 0xe0602a, 0xc83a3a]));
  const eye = lambert(0x111111);
  // Crabs scuttle sideways, so the long axis of the shell faces the direction of travel.
  root.add(part(new THREE.SphereGeometry(0.6, 8, 5).scale(1.3, 0.55, 1), shell, 0, 0.55, 0));
  for (const x of [-0.22, 0.22]) {
    root.add(part(new THREE.CylinderGeometry(0.04, 0.04, 0.35, 4), shell, x, 0.95, 0.35));
    root.add(part(new THREE.SphereGeometry(0.09, 5, 4), eye, x, 1.15, 0.35));
  }
  // Big claws held up and forward.
  for (const x of [-0.85, 0.85]) {
    root.add(part(new THREE.BoxGeometry(0.15, 0.15, 0.5), shell, x * 0.8, 0.6, 0.45));
    const claw = part(new THREE.SphereGeometry(0.28, 6, 4).scale(1, 0.7, 1.3), shell, x, 0.75, 0.8);
    root.add(claw);
  }
  const legs: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    for (const z of [-0.3, 0, 0.3]) {
      const leg = new THREE.Group();
      const seg = part(new THREE.BoxGeometry(0.6, 0.08, 0.08), shell, side * 0.3, 0, 0);
      seg.rotation.z = side * -0.6;
      leg.add(seg);
      leg.position.set(side * 0.7, 0.45, z);
      root.add(leg);
      legs.push(leg);
    }
  }
  root.scale.setScalar(1.15);
  return { root, legs, speed: 3 + rand(), sound: 'bump', color: 0xd8402a };
}

function makeTurtle(): WalkerModel {
  const root = new THREE.Group();
  const shell = lambert(0x3f7a4a);
  const plate = lambert(0x5f9a5a);
  const skin = lambert(0x9ab86a);
  root.add(part(new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1.2), shell, 0, 0.35, 0));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    root.add(part(new THREE.CylinderGeometry(0.28, 0.3, 0.08, 6), plate, Math.cos(a) * 0.45, 0.85, Math.sin(a) * 0.55));
  }
  root.add(part(new THREE.SphereGeometry(0.32, 6, 5), skin, 0, 0.5, 1.35));
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.7, 0.6], [0.7, 0.6], [-0.7, -0.6], [0.7, -0.6]]) {
    const leg = new THREE.Group();
    leg.add(part(new THREE.BoxGeometry(0.5, 0.14, 0.3), skin, x > 0 ? 0.2 : -0.2, 0, 0));
    leg.position.set(x, 0.3, z);
    root.add(leg);
    legs.push(leg);
  }
  return { root, legs, speed: 1.2, sound: 'bump', color: 0x5f9a5a };
}

/** Island shape: high in the middle, sand at the road, under the sea beyond it. */
function islandHeight(dunes: (x: number, z: number) => number) {
  return (x: number, z: number) => {
    // Normalised distance from the island centre; the road runs at roughly r = 1.
    const r = Math.hypot((x - CENTRE[0]) / 200, (z - CENTRE[1]) / 175);
    const land = (1 - r) * 30;
    return Math.max(-6, Math.min(9, land)) + dunes(x, z) * 2.2;
  };
}

function buildSea(g: THREE.Group) {
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(1400, 64).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x1f8fc8, transparent: true, opacity: 0.9 }),
  );
  sea.position.set(CENTRE[0], SEA_LEVEL, CENTRE[1]);
  g.add(sea);
  // A pale ring of shallows where the sand dips under the water.
  const shallows = new THREE.Mesh(
    new THREE.RingGeometry(250, 320, 64).rotateX(-Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x6fd8e0, transparent: true, opacity: 0.45, depthWrite: false }),
  );
  shallows.scale.set(1, 1, 175 / 200);
  shallows.position.set(CENTRE[0], SEA_LEVEL + 0.02, CENTRE[1]);
  g.add(shallows);
}

const palmFrond = new THREE.ConeGeometry(0.6, 5, 3).rotateX(Math.PI / 2).scale(1, 0.25, 1).translate(0, 0, 2.5);
const trunkSeg = new THREE.CylinderGeometry(0.3, 0.38, 1.6, 6).translate(0, 0.8, 0);
const coconut = new THREE.SphereGeometry(0.3, 5, 4);

/** Adds a leaning palm tree to a batch. */
function addPalm(batch: PropBatch, mats: { trunk: THREE.Material; frond: THREE.Material; nut: THREE.Material }, x: number, y: number, z: number, rand: () => number) {
  const lean = 0.15 + rand() * 0.25;
  const dir = rand() * Math.PI * 2;
  const segs = 6 + Math.floor(rand() * 3);
  const p = new THREE.Vector3(x, y, z);
  const q = new THREE.Quaternion();
  const axis = new THREE.Vector3(Math.cos(dir), 0, Math.sin(dir));
  for (let k = 0; k < segs; k++) {
    q.setFromAxisAngle(axis, lean * (k / segs) * 1.6);
    batch.add(mats.trunk, trunkSeg, new THREE.Matrix4().compose(p.clone(), q, new THREE.Vector3(1 - k * 0.04, 1, 1 - k * 0.04)));
    p.add(new THREE.Vector3(0, 1.5, 0).applyQuaternion(q));
  }
  for (let f = 0; f < 7; f++) {
    const yaw = (f / 7) * Math.PI * 2 + rand() * 0.3;
    const fq = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.35 + rand() * 0.25, yaw, 0, 'YXZ'));
    batch.add(mats.frond, palmFrond, new THREE.Matrix4().compose(p.clone(), fq, new THREE.Vector3(1, 1, 1)));
  }
  for (let c = 0; c < 3; c++) {
    const a = (c / 3) * Math.PI * 2;
    batch.add(mats.nut, coconut, place(p.x + Math.cos(a) * 0.35, p.y - 0.35, p.z + Math.sin(a) * 0.35));
  }
}

function buildShore(track: Track, g: THREE.Group, rand: () => number, ground: (x: number, z: number) => number) {
  const batch = new PropBatch();
  const palm = { trunk: lambert(0x9a7a50), frond: lambert(0x3f9a3a), nut: lambert(0x5a3a1e) };
  const pole = lambert(0xf4f0e8);
  const stripes = [0xe84a4a, 0x2f8ad8, 0xf2c13a, 0x3fb88a].map(lambert);
  const white = lambert(0xfaf7f0);
  const towels = [0xe84a8a, 0x3a9ad8, 0xf2a03a, 0x7a5ad8].map(lambert);
  const hutWall = [0xf4d8a8, 0xa8d8e8, 0xf4b8a8].map(lambert);
  const thatch = lambert(0xc8a060);
  const boards = [0xf2e85a, 0xe85a8a, 0x4ac0e8, 0xfafafa].map(lambert);
  const castle = lambert(0xe8cc8a);
  const rock = lambert(0x8a847a);

  const canopy = new THREE.ConeGeometry(2.4, 1, 8, 1, true).translate(0, 3.2, 0);
  const canopyStripe = new THREE.ConeGeometry(2.42, 1, 8, 1, true, 0, Math.PI / 4).translate(0, 3.2, 0);
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 4).translate(0, 1.6, 0);
  const towelGeo = new THREE.BoxGeometry(1.2, 0.05, 2.2).translate(0, 0.03, 0);
  const hutGeo = new THREE.BoxGeometry(4, 3, 4).translate(0, 1.5, 0);
  const roofGeo = new THREE.ConeGeometry(3.6, 2.4, 4).rotateY(Math.PI / 4).translate(0, 4.2, 0);
  const boardGeo = new THREE.CapsuleGeometry(0.4, 2.2, 2, 6).scale(1, 1, 0.25).translate(0, 1.3, 0);
  const towerGeo = new THREE.CylinderGeometry(0.5, 0.6, 1.2, 6).translate(0, 0.6, 0);
  const keepGeo = new THREE.BoxGeometry(1.4, 0.8, 1.4).translate(0, 0.4, 0);
  const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);

  track.everySample(6, (smp, i) => {
    for (const side of [-1, 1]) {
      const off = WALL_HALF + 4 + rand() * 10;
      const x = smp.pos.x + smp.right.x * off * side;
      const z = smp.pos.z + smp.right.z * off * side;
      const y = ground(x, z);
      if (y < SEA_LEVEL + 0.3) {
        // In the water: the odd rock poking out of the surf.
        if (rand() < 0.15) batch.add(rock, rockGeo, place(x, SEA_LEVEL - 0.3, z, rand() * 6, 0.8 + rand()));
        continue;
      }
      const yaw = Math.atan2(smp.tan.x, smp.tan.z) + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      const r = rand();
      if (r < 0.32) addPalm(batch, palm, x, y - 0.1, z, rand);
      else if (r < 0.52) {
        // Parasol with a towel in its shade.
        batch.add(pole, poleGeo, place(x, y, z));
        batch.add(white, canopy, place(x, y, z, rand() * 6));
        const stripe = pick(rand, stripes);
        for (let k = 0; k < 4; k++) batch.add(stripe, canopyStripe, place(x, y + 0.005, z, (k / 4) * Math.PI * 2));
        batch.add(pick(rand, towels), towelGeo, place(x + 1.2, y, z + 0.4, yaw));
      } else if (r < 0.6 && i % 4 === 0) {
        batch.add(pick(rand, hutWall), hutGeo, place(x, y, z, yaw));
        batch.add(thatch, roofGeo, place(x, y, z, yaw));
      } else if (r < 0.68) {
        for (let k = 0; k < 3; k++) {
          const m = new THREE.Matrix4().compose(
            new THREE.Vector3(x + k * 0.9, y - 0.3, z),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, yaw, (k - 1) * 0.15)),
            new THREE.Vector3(1, 1, 1),
          );
          batch.add(pick(rand, boards), boardGeo, m);
        }
      } else if (r < 0.74) {
        batch.add(castle, keepGeo, place(x, y, z, yaw));
        for (const [dx, dz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) batch.add(castle, towerGeo, place(x + dx, y, z + dz));
      }
    }
  });
  // Palm groves inland.
  for (let k = 0; k < 260; k++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.75;
    const x = CENTRE[0] + Math.cos(a) * r * 200;
    const z = CENTRE[1] + Math.sin(a) * r * 175;
    if (track.distanceToCentre(x, z) < WALL_HALF + 5) continue;
    addPalm(batch, palm, x, ground(x, z) - 0.1, z, rand);
  }
  batch.build(g);
}

function buildStartGate(track: Track, g: THREE.Group) {
  const smp = track.samples[0];
  const gate = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ map: woodTexture([190, 160, 120], 71), flatShading: true });
  for (const side of [-1, 1]) {
    gate.add(part(new THREE.CylinderGeometry(0.7, 0.8, 11, 8), wood, side * (WALL_HALF + 2.5), 5.5, 0));
    // Life rings hung on the posts.
    const ring = part(new THREE.TorusGeometry(0.9, 0.28, 6, 12), lambert(0xf04a3a), side * (WALL_HALF + 2.5), 4, 0.8);
    gate.add(ring);
  }
  // A giant surfboard as the crossbar.
  const board = part(new THREE.CapsuleGeometry(1.8, WALL_HALF * 2 + 4, 2, 10).scale(1, 1, 0.3), lambert(0x3ab8e8), 0, 11, 0);
  board.rotation.z = Math.PI / 2;
  gate.add(board);
  const tex = bannerTexture('#ffcf4a', '#e8503a', '#e8503a', 'bold 64px "Trebuchet MS", sans-serif');
  for (const z of [-0.6, 0.6]) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshBasicMaterial({ map: tex }));
    sign.position.set(0, 11, z);
    if (z < 0) sign.rotation.y = Math.PI;
    gate.add(sign);
  }
  // Bunting strung from the posts.
  const flags = [0xe84a4a, 0xf2c13a, 0x2f8ad8, 0x3fb88a].map(lambert);
  for (let k = 0; k < 14; k++) {
    const t = k / 13;
    const x = (t - 0.5) * (WALL_HALF * 2 + 5);
    const flag = part(new THREE.ConeGeometry(0.4, 0.8, 3), flags[k % 4], x, 8.6 - Math.sin(t * Math.PI) * 1.4, 0);
    flag.rotation.x = Math.PI;
    gate.add(flag);
  }
  gate.position.copy(smp.pos);
  gate.rotation.y = Math.atan2(smp.tan.x, smp.tan.z);
  g.add(gate);
}

/** A boardwalk pier out into the sea, with the lighthouse at its end. */
function buildLandmarks(g: THREE.Group) {
  const lh = new THREE.Group();
  const white = lambert(0xf6f2ea);
  const red = lambert(0xd83a2a);
  const rock = lambert(0x7a746a);
  lh.add(part(new THREE.DodecahedronGeometry(16, 0), rock, 0, -6, 0));
  for (let k = 0; k < 6; k++) {
    lh.add(part(new THREE.CylinderGeometry(4.6 - k * 0.45, 5 - k * 0.45, 7, 12), k % 2 ? red : white, 0, 6 + k * 7, 0));
  }
  lh.add(part(new THREE.CylinderGeometry(2.6, 2.6, 3.5, 10), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }), 0, 49, 0));
  lh.add(part(new THREE.ConeGeometry(3.4, 4, 10), red, 0, 52.8, 0));
  lh.position.set(330, 0, -60);
  g.add(lh);

  // A sailing ship anchored offshore.
  const ship = new THREE.Group();
  const hull = lambert(0x6a4428);
  const sail = lambert(0xf4ecd8);
  ship.add(part(new THREE.BoxGeometry(8, 4, 28), hull, 0, 0.5, 0));
  ship.add(part(new THREE.BoxGeometry(8.2, 3, 6), hull, 0, 3.5, -11));
  for (const [z, h] of [[-4, 26], [6, 22]]) {
    ship.add(part(new THREE.CylinderGeometry(0.35, 0.45, h, 6), hull, 0, h / 2 + 2, z));
    ship.add(part(new THREE.BoxGeometry(0.4, h * 0.55, 10), sail, 0, h * 0.6 + 2, z));
  }
  ship.position.set(-290, SEA_LEVEL, 330);
  ship.rotation.y = 0.8;
  g.add(ship);

  // Distant islands on the horizon.
  const green = lambert(0x4f9a4a);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2 + 0.4;
    const isle = part(new THREE.ConeGeometry(60 + (k % 3) * 25, 40 + (k % 2) * 30, 7), green, CENTRE[0] + Math.cos(a) * 900, 0, CENTRE[1] + Math.sin(a) * 900);
    isle.scale.y = 0.6;
    g.add(isle);
  }
}

export const BEACH: CourseDef = {
  id: 'sunset-shore',
  name: 'Sunset Shore',
  tagline: 'Sand, surf and palm trees round a tropical island. Mind the crabs.',
  controlPoints: [
    [0, -50], [90, -55], [165, -25], [205, 40], [200, 115], [215, 185], [170, 255],
    [95, 280], [30, 250], [-30, 290], [-110, 270], [-165, 210], [-150, 140], [-185, 70],
    [-150, 0], [-80, -40],
  ],
  ramps: [{ at: 0.3, length: 16, height: 2.6 }, { at: 0.78, length: 18, height: 3.2 }],
  itemRows: [0.14, 0.4, 0.62, 0.88],
  crossings: [0.22, 0.52, 0.7],
  walker: (rand, crossing, i) => (crossing === 1 && i === 0 ? makeTurtle() : makeCrab(rand)),
  env: {
    sky: ['#2f6fd0', '#7fc0f0', '#ffd8a8', '#ffb07a'],
    fog: 0xf4d8c0,
    fogNear: 220,
    fogFar: 1100,
    hemiSky: 0xe8f4ff,
    hemiGround: 0xd8c090,
    hemiIntensity: 1.6,
    sun: 0xffe8c8,
    sunIntensity: 2.4,
    dust: 0xe6d3a3,
  },
  surfaces: {
    road: () => dirtRoadTexture([214, 190, 140], '#fafafa', '#2f8ad8', 51),
    verge: () => groundTexture([236, 214, 160], ['#f4e4bc', '#d8bc88', '#fff4d8', '#c8a878'], 52),
    wall: () => new THREE.MeshLambertMaterial({ map: woodTexture([180, 150, 110], 53) }),
    wallHeight: 0.9,
  },
  music: { seed: 4242, tempo: 0.15 },
  decorate(track, g, rand) {
    const dunes = waves(57, 0.02);
    const { mesh, heightAt } = buildTerrain(track, {
      centre: CENTRE,
      size: 900,
      segments: 120,
      height: islandHeight(dunes),
      color: (x, z, h, out) => {
        // Wet sand at the waterline, dry sand on the beach, grass on the hills.
        if (h < SEA_LEVEL + 0.4) out.setRGB(0.72, 0.62, 0.42);
        else if (h < 2.5) out.setRGB(0.93, 0.84, 0.62 + dunes(z, x) * 0.03);
        else out.setRGB(0.36, 0.6, 0.28);
      },
    });
    g.add(mesh);
    buildSea(g);
    buildStartGate(track, g);
    buildShore(track, g, rand, heightAt);
    buildLandmarks(g);
  },
};
