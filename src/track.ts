import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CourseDef } from './courses/course';
import { mulberry32 } from './rng';
import { checkerTexture } from './textures';

/** Half the drivable road width. Past this the kart is on the slow verge. */
export const ROAD_HALF = 10;
/** Karts are pushed back by the low wall at this lateral offset. */
export const WALL_HALF = 15;
/** Off the road on an open edge, the "ground" is this far below the road: far enough to never land. */
export const VOID_DEPTH = 60;
/** Dash panels span this much road either side of the centreline, and this far along it. */
const PAD_HALF = 3.5;
const PAD_LENGTH = 6;

const SAMPLE_COUNT = 1200;

export interface TrackSample {
  /** Centreline position; y is the road's base elevation. */
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

interface Ramp {
  start: number;
  length: number;
  height: number;
}

/**
 * The spline course every kart drives on: centreline samples, queries, and the road,
 * verges, walls, ramps and start line. Everything else is built by the course's
 * `decorate` hook.
 */
export class Track {
  readonly samples: TrackSample[] = [];
  readonly length: number;
  readonly spacing: number;
  readonly group = new THREE.Group();

  // Distances along the track where features sit.
  readonly ramps: Ramp[];
  readonly crossings: number[];
  readonly itemRows: number[];
  readonly boostPads: number[];
  /** Per sample: true where the course has no wall and you can drive off the edge. */
  private readonly open: boolean[];

  constructor(readonly course: CourseDef) {
    const curve = new THREE.CatmullRomCurve3(
      course.controlPoints.map(([x, z, y = 0]) => new THREE.Vector3(x, y, z)),
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
    this.ramps = course.ramps.map((r) => ({ start: r.at * this.length, length: r.length, height: r.height }));
    this.crossings = course.crossings.map((f) => f * this.length);
    this.itemRows = course.itemRows.map((f) => f * this.length);
    this.boostPads = (course.boostPads ?? []).map((f) => f * this.length);
    this.open = this.samples.map((smp) => {
      const f = smp.s / this.length;
      return (course.openEdges ?? []).some(([a, b]) => (a <= b ? f >= a && f < b : f >= a || f < b));
    });

    this.buildRoad();
    this.buildWalls();
    this.buildRamps();
    this.buildStartLine();
    this.buildBoostPads();
    course.decorate(this, this.group, mulberry32(2024));
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

  /** Elevation of the road bed from the spline, ignoring ramps. */
  baseHeightAt(s: number): number {
    const f = this.wrapS(s) / this.spacing;
    const i0 = Math.floor(f) % SAMPLE_COUNT;
    const t = f - Math.floor(f);
    return this.samples[i0].pos.y * (1 - t) + this.samples[(i0 + 1) % SAMPLE_COUNT].pos.y * t;
  }

  /** Height a ramp adds at s. Each ramp rises linearly and ends in a sheer drop. */
  rampAt(s: number): number {
    const ws = this.wrapS(s);
    for (const r of this.ramps) {
      const d = ws - r.start;
      if (d >= 0 && d < r.length) return (d / r.length) * r.height;
    }
    return 0;
  }

  /** Road surface height on the centreline, ramps included. */
  heightAt(s: number): number {
    return this.baseHeightAt(s) + this.rampAt(s);
  }

  /**
   * Ground height at a lateral offset: ramps only span the road, the verges stay at the base,
   * and past the road on an open edge there is nothing until far below.
   */
  groundAt(s: number, lateral: number): number {
    if (Math.abs(lateral) < ROAD_HALF + 0.5) return this.heightAt(s);
    return this.isOpen(s) ? this.baseHeightAt(s) - VOID_DEPTH : this.baseHeightAt(s);
  }

  /** True where there is no wall at s, so karts can leave the road and fall. */
  isOpen(s: number): boolean {
    return this.open[Math.round(this.wrapS(s) / this.spacing) % SAMPLE_COUNT];
  }

  /** True on a dash panel. */
  onBoostPad(s: number, lateral: number): boolean {
    if (Math.abs(lateral) > PAD_HALF) return false;
    const ws = this.wrapS(s);
    return this.boostPads.some((p) => ws >= p && ws < p + PAD_LENGTH);
  }

  /** How sharply the track turns over the next `dist` metres, in radians (signed, + is right). */
  turnAhead(s: number, dist: number): number {
    const a = this.sampleAt(s).tan;
    const b = this.sampleAt(s + dist).tan;
    // Heading is atan2(x, z) and decreases when turning right (see Kart).
    return Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
  }

  /** Minimum distance from a point to the centreline, scanning coarsely. */
  distanceToCentre(x: number, z: number): number {
    let best = Infinity;
    for (let i = 0; i < SAMPLE_COUNT; i += 3) {
      const p = this.samples[i].pos;
      const d = (x - p.x) ** 2 + (z - p.z) ** 2;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  /** Visits every `step`th sample, for scattering scenery along the course. */
  everySample(step: number, fn: (smp: TrackSample, i: number) => void) {
    for (let i = 0; i < SAMPLE_COUNT; i += step) fn(this.samples[i], i);
  }

  /** A strip following the course between two lateral offsets, `y` above the road bed. */
  ribbon(inner: number, outer: number, y: number, vScale: number, withRamps = false, skip?: (i: number) => boolean): THREE.BufferGeometry {
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= SAMPLE_COUNT; i++) {
      const smp = this.samples[i % SAMPLE_COUNT];
      const h = smp.pos.y + (withRamps ? this.rampAt(smp.s) : 0);
      const v = (i * this.spacing) / vScale;
      for (const [lat, u] of [[inner, 0], [outer, 1]] as const) {
        positions.push(smp.pos.x + smp.right.x * lat, y + h, smp.pos.z + smp.right.z * lat);
        uvs.push(u, v);
      }
      if (i < SAMPLE_COUNT && !skip?.(i)) {
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

  private buildRoad() {
    const { surfaces } = this.course;
    const roadTex = surfaces.road();
    const road = new THREE.Mesh(
      this.ribbon(-ROAD_HALF, ROAD_HALF, 0.02, 20, true),
      new THREE.MeshLambertMaterial({
        map: roadTex,
        ...(surfaces.roadGlow ? { emissive: 0xffffff, emissiveMap: roadTex, emissiveIntensity: surfaces.roadGlow } : {}),
      }),
    );
    road.receiveShadow = true;
    this.group.add(road);
    const vergeMat = new THREE.MeshLambertMaterial({ map: surfaces.verge() });
    for (const [a, b] of [[ROAD_HALF, WALL_HALF + 1], [-WALL_HALF - 1, -ROAD_HALF]]) {
      const m = new THREE.Mesh(this.ribbon(a, b, 0.01, 6, false, (i) => this.open[i] || this.open[(i + 1) % SAMPLE_COUNT]), vergeMat);
      m.receiveShadow = true;
      this.group.add(m);
    }
  }

  /** Knee-high barrier that lines both sides of the course. */
  private buildWalls() {
    const geos: THREE.BufferGeometry[] = [];
    const step = 6;
    const h = this.course.surfaces.wallHeight;
    for (let i = 0; i < SAMPLE_COUNT; i += step) {
      const a = this.samples[i];
      const b = this.samples[(i + step) % SAMPLE_COUNT];
      if (this.open[i] || this.open[(i + step) % SAMPLE_COUNT]) continue;
      for (const side of [-1, 1]) {
        const lat = (WALL_HALF + 1.4) * side;
        const p0 = a.pos.clone().addScaledVector(a.right, lat);
        const p1 = b.pos.clone().addScaledVector(b.right, lat);
        const len = Math.hypot(p1.x - p0.x, p1.z - p0.z) + 0.4;
        const box = new THREE.BoxGeometry(0.8, h, len);
        const mid = p0.add(p1).multiplyScalar(0.5);
        box.rotateY(Math.atan2(p1.x - mid.x, p1.z - mid.z));
        box.translate(mid.x, mid.y + h / 2, mid.z);
        geos.push(box);
      }
    }
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos), this.course.surfaces.wall());
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
  }

  private buildRamps() {
    // Wooden ramps built from planks; the road surface itself rises underneath them.
    const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a32, flatShading: true });
    const plank = new THREE.MeshLambertMaterial({ color: 0xb07a45, flatShading: true });
    const steps = 8;
    for (const r of this.ramps) {
      for (let k = 0; k < steps; k++) {
        const s = r.start + (k + 0.5) * (r.length / steps);
        const smp = this.sampleAt(s);
        const base = this.baseHeightAt(s);
        const h = this.rampAt(s);
        const board = new THREE.Mesh(new THREE.BoxGeometry(ROAD_HALF * 2, 0.25, r.length / steps - 0.15), k % 2 ? wood : plank);
        board.position.copy(smp.pos).setY(base + h);
        board.rotation.order = 'YXZ';
        board.rotation.y = Math.atan2(smp.tan.x, smp.tan.z);
        board.rotation.x = -Math.atan2(r.height, r.length);
        board.castShadow = true;
        board.receiveShadow = true;
        this.group.add(board);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, Math.max(h, 0.1), 0.5), wood);
          post.position.copy(smp.pos).addScaledVector(smp.right, side * (ROAD_HALF - 0.3)).setY(base + h / 2);
          this.group.add(post);
        }
      }
    }
  }

  private buildStartLine() {
    const smp = this.samples[0];
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, 2.5).rotateX(-Math.PI / 2),
      new THREE.MeshLambertMaterial({ map: checkerTexture() }),
    );
    line.position.copy(smp.pos).setY(smp.pos.y + 0.04);
    line.rotation.y = Math.atan2(smp.tan.x, smp.tan.z);
    this.group.add(line);
  }

  /** Glowing chevrons on each dash panel. */
  private buildBoostPads() {
    if (!this.boostPads.length) return;
    const geos: THREE.BufferGeometry[] = [];
    const chevron = new THREE.Shape();
    chevron.moveTo(-PAD_HALF, 0);
    chevron.lineTo(0, 1.4);
    chevron.lineTo(PAD_HALF, 0);
    chevron.lineTo(PAD_HALF, 0.9);
    chevron.lineTo(0, 2.3);
    chevron.lineTo(-PAD_HALF, 0.9);
    chevron.closePath();
    const base = new THREE.ShapeGeometry(chevron).rotateX(-Math.PI / 2);
    // ShapeGeometry's Y became -Z; flip so the point faces forward along +Z.
    base.scale(1, 1, -1);
    for (const p of this.boostPads) {
      for (let k = 0; k < 3; k++) {
        const s = p + k * (PAD_LENGTH / 3);
        const smp = this.sampleAt(s);
        const g = base.clone();
        g.rotateY(Math.atan2(smp.tan.x, smp.tan.z));
        g.translate(smp.pos.x, this.heightAt(s) + 0.06, smp.pos.z);
        geos.push(g);
      }
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe14a, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.onBeforeRender = () => mat.color.setHSL(0.13 - 0.05 * Math.abs(Math.sin(performance.now() / 150)), 1, 0.6);
    this.group.add(mesh);
  }
}
