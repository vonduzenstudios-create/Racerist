import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Track } from '../track';

// Small helpers shared by the night courses (Gloomhollow Manor and Prism Skyway).

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = 8;
  return tex;
}

export function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number, count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rand() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

/** Indices of track samples whose distance along the lap lies in [from, to) (fractions, may wrap). */
export function sampleRange(track: Track, from: number, to: number): number[] {
  const n = track.samples.length;
  const a = Math.round(from * n);
  const b = Math.round(to * n);
  const out: number[] = [];
  const count = ((b - a) % n + n) % n;
  for (let k = 0; k <= count; k++) out.push((a + k) % n);
  return out;
}

/**
 * A strip that follows the road between two lateral offsets, `y` above the road surface.
 * `indices` limits it to part of the lap (consecutive sample indices).
 */
export function ribbon(
  track: Track,
  inner: number,
  outer: number,
  y: number,
  vScale: number,
  indices?: number[],
): THREE.BufferGeometry {
  const n = track.samples.length;
  const idx = indices ?? [...Array(n + 1).keys()].map((i) => i % n);
  const positions: number[] = [];
  const uvs: number[] = [];
  const indexArr: number[] = [];
  let dist = 0;
  idx.forEach((i, k) => {
    const smp = track.samples[i];
    const h = track.heightAt(smp.s);
    if (k > 0) dist += track.spacing;
    for (const [lat, u] of [[inner, 0], [outer, 1]] as const) {
      positions.push(smp.pos.x + smp.right.x * lat, h + y, smp.pos.z + smp.right.z * lat);
      uvs.push(u, dist / vScale);
    }
    if (k < idx.length - 1) {
      const a = k * 2;
      indexArr.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indexArr);
  g.computeVertexNormals();
  return g;
}

/** A vertical wall strip at a lateral offset, from `bottom` to `top` above the road surface. */
export function curtain(
  track: Track,
  lateral: number,
  bottom: number,
  top: number,
  uScale: number,
  indices: number[],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indexArr: number[] = [];
  let dist = 0;
  indices.forEach((i, k) => {
    const smp = track.samples[i];
    const h = track.heightAt(smp.s);
    if (k > 0) dist += track.spacing;
    const x = smp.pos.x + smp.right.x * lateral;
    const z = smp.pos.z + smp.right.z * lateral;
    positions.push(x, h + bottom, z, x, h + top, z);
    uvs.push(dist / uScale, 0, dist / uScale, (top - bottom) / uScale);
    if (k < indices.length - 1) {
      const a = k * 2;
      // Wind so the face points at the road.
      if (lateral > 0) indexArr.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else indexArr.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(indexArr);
  g.computeVertexNormals();
  return g;
}

/** Merges a list of geometries into one mesh, or returns null when the list is empty. */
export function merged(geos: THREE.BufferGeometry[], mat: THREE.Material, shadows = true): THREE.Mesh | null {
  if (!geos.length) return null;
  const mesh = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g))), mat);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
}

/** Bakes an object's position, rotation and scale into a copy of a geometry. */
export function placed(geo: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = geo.clone();
  g.scale(sx, sy, sz);
  g.rotateY(yaw);
  g.translate(x, y, z);
  return g;
}

/** Big painted sign, used on the start arches. */
export function signTexture(text: string, bg: string, fg: string, border: string, font: string): THREE.CanvasTexture {
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
  ctx.shadowColor = fg;
  ctx.shadowBlur = 12;
  ctx.fillText(text, 256, 52);
  return toTexture(c, false);
}

/** Calls `fn` with the time in seconds each frame the object is drawn. Lets static scenery animate. */
export function animate(mesh: THREE.Mesh, fn: (t: number) => void) {
  mesh.onBeforeRender = () => fn(performance.now() / 1000);
}
