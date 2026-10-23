import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas, speckle, toTexture } from '../textures';
import { mulberry32 } from '../rng';
import { type Track, WALL_HALF } from '../track';

// Shared building blocks for outdoor courses: rolling ground that meets the road,
// a few painted surfaces, and a helper that merges scattered props into one mesh per material.

export interface TerrainOptions {
  /** Centre and side length of the square ground patch. */
  centre: [number, number];
  size: number;
  segments: number;
  /** Ground height far from the road. Near the road the ground blends to the road bed. */
  height: (x: number, z: number) => number;
  /** Vertex colour for a point at height h. */
  color: (x: number, z: number, h: number, out: THREE.Color) => void;
}

export interface Terrain {
  mesh: THREE.Mesh;
  /** Ground height at a world point, for standing props on the ground. */
  heightAt: (x: number, z: number) => number;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Low-poly ground that sits just under the verges and rolls away into `height` beyond the walls. */
export function buildTerrain(track: Track, opt: TerrainOptions): Terrain {
  const coarse = track.samples.filter((_, i) => i % 4 === 0);
  const heightAt = (x: number, z: number) => {
    let best = Infinity;
    let bed = 0;
    for (const s of coarse) {
      const d = (x - s.pos.x) ** 2 + (z - s.pos.z) ** 2;
      if (d < best) {
        best = d;
        bed = s.pos.y;
      }
    }
    const t = smoothstep(WALL_HALF + 1, WALL_HALF + 28, Math.sqrt(best));
    return (bed - 0.08) * (1 - t) + opt.height(x, z) * t;
  };
  const geo = new THREE.PlaneGeometry(opt.size, opt.size, opt.segments, opt.segments).rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + opt.centre[0];
    const z = pos.getZ(i) + opt.centre[1];
    const h = heightAt(x, z);
    pos.setXYZ(i, x, h, z);
    opt.color(x, z, h, c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  mesh.receiveShadow = true;
  return { mesh, heightAt };
}

/** A smooth pseudo-random field built from a few seeded sine waves, roughly -1..1. */
export function waves(seed: number, scale: number): (x: number, z: number) => number {
  const rand = mulberry32(seed);
  const terms = Array.from({ length: 4 }, (_, i) => ({
    fx: (rand() - 0.5) * 2 * scale * (i + 1),
    fz: (rand() - 0.5) * 2 * scale * (i + 1),
    ph: rand() * Math.PI * 2,
    amp: 1 / (i + 1.5),
  }));
  const norm = terms.reduce((a, t) => a + t.amp, 0);
  return (x, z) => terms.reduce((a, t) => a + Math.sin(x * t.fx + z * t.fz + t.ph) * t.amp, 0) / norm;
}

/**
 * Collects geometry per material and merges it into one mesh each, so hundreds of
 * trees or umbrellas cost a handful of draw calls.
 */
export class PropBatch {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(mat: THREE.Material, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    if (matrix) g.applyMatrix4(matrix);
    let list = this.parts.get(mat);
    if (!list) this.parts.set(mat, (list = []));
    list.push(g);
  }

  build(group: THREE.Group, shadows = true) {
    for (const [mat, geos] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
      mesh.castShadow = shadows;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
  }
}

/** Translate, yaw and uniform scale as a matrix, for PropBatch.add. */
export function place(x: number, y: number, z: number, yaw = 0, scale = 1): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
    new THREE.Vector3(scale, scale, scale),
  );
}

/** A banner with the game's name, for start gates. */
export function bannerTexture(bg: string, border: string, fg: string, font = 'bold 64px Georgia, serif'): THREE.CanvasTexture {
  const [c, ctx] = canvas(512, 96);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = border;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 500, 84);
  ctx.fillStyle = fg;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RACERIST', 256, 52);
  return toTexture(c, false);
}

/** Packed-earth road with tyre ruts and edge kerbs. U runs across the road, V along it. */
export function dirtRoadTexture(base: [number, number, number], kerbA: string, kerbB: string, seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rand = mulberry32(seed);
  ctx.fillStyle = `rgb(${base.join(',')})`;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 260; i++) {
    const s = 0.82 + rand() * 0.3;
    ctx.fillStyle = `rgba(${base[0] * s | 0},${base[1] * s | 0},${base[2] * s | 0},0.7)`;
    ctx.beginPath();
    ctx.ellipse(rand() * 256, rand() * 256, 3 + rand() * 9, 2 + rand() * 5, rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Two darker ruts worn by wheels.
  for (const x of [80, 176]) {
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(40,25,10,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 14, 0, 28, 256);
  }
  speckle(ctx, 256, 256, rand, 4000, 0.12);
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? kerbA : kerbB;
    ctx.fillRect(0, i * 32, 12, 32);
    ctx.fillRect(244, i * 32, 12, 32);
  }
  return toTexture(c);
}

/** Speckled ground cover (grass, leaf litter, sand) for the verges. */
export function groundTexture(base: [number, number, number], flecks: string[], seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rand = mulberry32(seed);
  ctx.fillStyle = `rgb(${base.join(',')})`;
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 700; i++) {
    ctx.fillStyle = flecks[Math.floor(rand() * flecks.length)];
    ctx.fillRect(rand() * 128, rand() * 128, 1 + rand() * 3, 1 + rand() * 3);
  }
  speckle(ctx, 128, 128, rand, 600, 0.1);
  return toTexture(c);
}

/** Vertical plank or bark grain for wooden barriers. */
export function woodTexture(base: [number, number, number], seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const rand = mulberry32(seed);
  for (let x = 0; x < 64; x += 4) {
    const s = 0.75 + rand() * 0.35;
    ctx.fillStyle = `rgb(${base[0] * s | 0},${base[1] * s | 0},${base[2] * s | 0})`;
    ctx.fillRect(0, x, 64, 4);
  }
  speckle(ctx, 64, 64, rand, 300, 0.15);
  return toTexture(c);
}
