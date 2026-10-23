import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, pick } from './rng';
import {
  checkerTexture,
  cobbleTexture,
  facadeTexture,
  roadTexture,
  roofTexture,
  stoneWallTexture,
} from './textures';

/** Half the drivable road width. Past this the kart is on the slow cobbled verge. */
export const ROAD_HALF = 10;
/** Karts are pushed back by the low wall at this lateral offset. */
export const WALL_HALF = 15;

const CONTROL_POINTS: [number, number][] = [
  [0, 0], [80, 0], [150, 10], [190, 50], [195, 110], [160, 150],
  [110, 150], [80, 120], [40, 120], [10, 160], [20, 220], [-30, 250],
  [-100, 240], [-140, 190], [-130, 120], [-150, 60], [-120, 10], [-60, -5],
];

const SAMPLE_COUNT = 1200;

export interface TrackSample {
  pos: THREE.Vector3;
  tan: THREE.Vector3;
  right: THREE.Vector3;
  s: number;
}

export interface Projection {
  index: number;
  s: number;
  lateral: number;
}

export class Track {
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly spacing: number;
  readonly group = new THREE.Group();
  /** Background sound bed, an id from AMBIENCES in sfx.ts. */
  readonly ambience: string = 'city';

  // Distances along the track where features sit.
  readonly rampStart: number;
  readonly rampLength = 16;
  readonly rampHeight = 2.6;
  readonly crossings: number[];
  readonly itemRows: number[];

  constructor() {
    const curve = new THREE.CatmullRomCurve3(
      CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    this.length = curve.getLength();
    this.spacing = this.length / SAMPLE_COUNT;
    const pts = curve.getSpacedPoints(SAMPLE_COUNT);
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const pos = pts[i];
      const next = pts[(i + 1) % SAMPLE_COUNT];
      const prev = pts[(i - 1 + SAMPLE_COUNT) % SAMPLE_COUNT];
      const tan = next.clone().sub(prev).setY(0).normalize();
      const right = new THREE.Vector3(-tan.z, 0, tan.x);
      this.samples.push({ pos, tan, right, s: i * this.spacing });
    }
    this.rampStart = this.length * 0.105;
    this.crossings = [0.3, 0.52, 0.8].map((f) => f * this.length);
    this.itemRows = [0.17, 0.43, 0.66, 0.9].map((f) => f * this.length);
    this.buildScenery();
  }

  sampleAt(s: number): TrackSample {
    const i = Math.round(this.wrapS(s) / this.spacing) % SAMPLE_COUNT;
    return this.samples[i];
  }

  wrapS(s: number): number {
    return ((s % this.length) + this.length) % this.length;
  }

  /** World position at distance s and lateral offset, interpolated between samples. */
  pointAt(s: number, lateral: number, out = new THREE.Vector3()): THREE.Vector3 {
    const ws = this.wrapS(s);
    const f = ws / this.spacing;
    const i0 = Math.floor(f) % SAMPLE_COUNT;
    const i1 = (i0 + 1) % SAMPLE_COUNT;
    const t = f - Math.floor(f);
    const a = this.samples[i0];
    const b = this.samples[i1];
    out.copy(a.pos).lerp(b.pos, t);
    out.x += (a.right.x + (b.right.x - a.right.x) * t) * lateral;
    out.z += (a.right.z + (b.right.z - a.right.z) * t) * lateral;
    out.y = this.heightAt(ws);
    return out;
  }

  /**
   * Finds the closest centreline sample. With a hint it only searches nearby samples,
   * which is what every kart uses each frame; without one it scans the whole track.
   */
  project(pos: THREE.Vector3, hint = -1): Projection {
    let best = 0;
    let bestD = Infinity;
    const scan = (i: number) => {
      const p = this.samples[i].pos;
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    };
    if (hint < 0) {
      for (let i = 0; i < SAMPLE_COUNT; i++) scan(i);
    } else {
      for (let k = -30; k <= 30; k++) scan((hint + k + SAMPLE_COUNT) % SAMPLE_COUNT);
    }
    const smp = this.samples[best];
    const dx = pos.x - smp.pos.x;
    const dz = pos.z - smp.pos.z;
    const along = dx * smp.tan.x + dz * smp.tan.z;
    const lateral = dx * smp.right.x + dz * smp.right.z;
    return { index: best, s: this.wrapS(smp.s + along), lateral };
  }

  /** Road height. Flat everywhere except the ramp, which ends in a sheer drop. */
  heightAt(s: number): number {
    const d = this.wrapS(s) - this.rampStart;
    if (d >= 0 && d < this.rampLength) return (d / this.rampLength) * this.rampHeight;
    return 0;
  }

  /** How sharply the track turns over the next `dist` metres, in radians (signed, + is right). */
  turnAhead(s: number, dist: number): number {
    const a = this.sampleAt(s).tan;
    const b = this.sampleAt(s + dist).tan;
    // Heading is atan2(x, z) and decreases when turning right (see Kart).
    return Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
  }

  /** Minimum distance from a point to the centreline, scanning coarsely. */
  private distanceToCentre(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < SAMPLE_COUNT; i += 3) {
      const p = this.samples[i].pos;
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  private ribbon(inner: number, outer: number, y: number, vScale: number, followHeight = false): THREE.BufferGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const smp = this.samples[i % SAMPLE_COUNT];
      const h = followHeight ? this.heightAt(smp.s) : 0;
      const v = (i * this.spacing) / vScale;
      for (const [lat, u] of [[inner, 0], [outer, 1]] as const) {
        positions.push(smp.pos.x + smp.right.x * lat, y + h, smp.pos.z + smp.right.z * lat);
        uvs.push(u, v);
      }
      if (i < SAMPLE_COUNT) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    return g;
  }

  private buildScenery() {
    const rand = mulberry32(2024);
    const g = this.group;

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

    // Road and verges.
    const road = new THREE.Mesh(
      this.ribbon(-ROAD_HALF, ROAD_HALF, 0.02, 20, true),
      new THREE.MeshLambertMaterial({ map: roadTexture() }),
    );
    road.receiveShadow = true;
    g.add(road);
    const vergeTex = cobbleTexture([170, 150, 120], 4);
    vergeTex.repeat.set(1, 1);
    const vergeMat = new THREE.MeshLambertMaterial({ map: vergeTex });
    for (const [a, b] of [[ROAD_HALF, WALL_HALF + 1], [-WALL_HALF - 1, -ROAD_HALF]]) {
      const m = new THREE.Mesh(this.ribbon(a, b, 0.01, 6), vergeMat);
      m.receiveShadow = true;
      g.add(m);
    }

    this.buildWalls();
    this.buildRamp();
    this.buildStartGate();
    this.buildCrossings();
    this.buildHouses(rand);
    this.buildProps(rand);
    this.buildLandmarks();
  }

  /** Knee-high stone wall that lines both sides of the course. */
  private buildWalls() {
    const tex = stoneWallTexture();
    const geos: THREE.BufferGeometry[] = [];
    const step = 6;
    for (let i = 0; i < SAMPLE_COUNT; i += step) {
      const a = this.samples[i];
      const b = this.samples[(i + step) % SAMPLE_COUNT];
      for (const side of [-1, 1]) {
        const lat = (WALL_HALF + 1.4) * side;
        const p0 = a.pos.clone().addScaledVector(a.right, lat);
        const p1 = b.pos.clone().addScaledVector(b.right, lat);
        const len = p0.distanceTo(p1) + 0.4;
        const box = new THREE.BoxGeometry(0.8, 1.2, len);
        const mid = p0.add(p1).multiplyScalar(0.5);
        box.rotateY(Math.atan2(p1.x - mid.x, p1.z - mid.z));
        box.translate(mid.x, 0.6, mid.z);
        geos.push(box);
      }
    }
    tex.repeat.set(1, 1);
    const mesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ map: tex }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildRamp() {
    // A wooden ramp built from planks; the road surface itself rises underneath it.
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a32, flatShading: true });
    const plank = new THREE.MeshLambertMaterial({ color: 0xb07a45, flatShading: true });
    const steps = 8;
    for (let k = 0; k < steps; k++) {
      const s = this.rampStart + (k + 0.5) * (this.rampLength / steps);
      const smp = this.sampleAt(s);
      const h = this.heightAt(s);
      const board = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2, 0.25, this.rampLength / steps - 0.15), k % 2 ? wood : plank);
      board.position.copy(smp.pos).setY(h);
      board.rotation.order = 'YXZ';
      board.rotation.y = Math.atan2(smp.tan.x, smp.tan.z);
      board.rotation.x = -Math.atan2(this.rampHeight, this.rampLength);
      board.castShadow = true;
      board.receiveShadow = true;
      this.group.add(board);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, Math.max(h, 0.1), 0.5), wood);
        post.position.copy(smp.pos).addScaledVector(smp.right, side * (ROAD_HALF - 0.3)).setY(h / 2);
        this.group.add(post);
      }
    }
  }

  private buildStartGate() {
    const smp = this.samples[0];
    const yaw = Math.atan2(smp.tan.x, smp.tan.z);
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, 2.5).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: checkerTexture() }),
    );
    line.position.copy(smp.pos).setY(0.04);
    line.rotation.y = yaw;
    this.group.add(line);

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
    this.group.add(gate);
  }

  private buildCrossings() {
    // Straw-strewn market crossings where peasants and pigs wander over the road.
    const mat = new THREE.MeshLambertMaterial({ color: 0xd8c27a, transparent: true, opacity: 0.55 });
    for (const s of this.crossings) {
      for (let k = -2; k <= 2; k++) {
        const smp = this.sampleAt(s + k * 1.6);
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2 - 3, 0.8).rotateX(-Math.PI / 2), mat);
        stripe.position.copy(smp.pos).setY(0.05);
        stripe.rotation.y = Math.atan2(smp.tan.x, smp.tan.z);
        this.group.add(stripe);
      }
    }
  }

  private buildHouses(rand: () => number) {
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
      if (this.distanceToCentre(x, z) < WALL_HALF + 2.5 + r) return;
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

    for (let i = 0; i < SAMPLE_COUNT; i += 11) {
      const smp = this.samples[i];
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
      this.group.add(mesh);
    });
    roofs.forEach((tex, k) => {
      if (!roofGeos[k].length) return;
      tex.repeat.set(4, 4);
      const mesh = new THREE.Mesh(
        mergeGeometries(roofGeos[k]),
        new THREE.MeshLambertMaterial({ map: tex, flatShading: true }),
      );
      mesh.castShadow = true;
      this.group.add(mesh);
    });
  }

  private buildProps(rand: () => number) {
    const g = this.group;
    const iron = new THREE.MeshLambertMaterial({ color: 0x2d2a28 });
    const flame = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    const awnings = [0xb23a3a, 0x2f6aa8, 0x3d8a4a, 0xd9a43a].map(
      (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }),
    );
    const wood = new THREE.MeshLambertMaterial({ color: 0x7a5232, flatShading: true });
    const leaf = new THREE.MeshLambertMaterial({ color: 0x4f8a3c, flatShading: true });
    const goods = [0xd84a3a, 0xe8b03a, 0x7cb342, 0xa0522d].map((c) => new THREE.MeshLambertMaterial({ color: c }));

    for (let i = 0; i < SAMPLE_COUNT; i += 25) {
      const smp = this.samples[i];
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
  private buildLandmarks() {
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
    this.group.add(castle);

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
      this.group.add(wall);
      if (k % 4 === 0) {
        const tower = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.5, 22, 8), stone);
        tower.position.copy(p0).setY(11);
        const cap = new THREE.Mesh(new THREE.ConeGeometry(6.2, 9, 8), slate);
        cap.position.copy(p0).setY(26.5);
        this.group.add(tower, cap);
      }
    }
  }
}
