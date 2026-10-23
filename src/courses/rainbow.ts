import * as THREE from 'three';
import { mulberry32, pick } from '../rng';
import { ROAD_HALF, WALL_HALF, type Track } from '../track';
import type { CourseDef } from './course';
import { animate, canvas, merged, placed, ribbon, signTexture, speckle, toTexture } from './glowkit';

// Prism Skyway: a glowing rainbow road strung across the night sky. Most straights have no
// rails, so a sloppy line or a well-aimed fireball sends you over the edge.

const BANDS = ['#ff4d6d', '#ff9f43', '#ffe14a', '#5ef08a', '#3ad7ff', '#5a7bff', '#b06bff'];

function rainbowRoadTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rand = mulberry32(51);
  const inner = 232;
  const band = inner / BANDS.length;
  BANDS.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(12 + i * band, 0, band + 1, 256);
  });
  // Soft seams between bands and a faint sheen across.
  for (let i = 1; i < BANDS.length; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(12 + i * band - 1, 0, 2, 256);
  }
  const sheen = ctx.createLinearGradient(0, 0, 0, 256);
  sheen.addColorStop(0, 'rgba(255,255,255,0.18)');
  sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.18)');
  ctx.fillStyle = sheen;
  ctx.fillRect(12, 0, inner, 256);
  // Sparkles.
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`;
    const x = 12 + rand() * inner;
    const y = rand() * 256;
    ctx.fillRect(x, y, 2, 2);
  }
  // Bright white edges.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 12, 256);
  ctx.fillRect(244, 0, 12, 256);
  return toTexture(c);
}

function starGlassTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rand = mulberry32(52);
  ctx.fillStyle = '#1a1240';
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rand, 300, 0.25);
  for (let i = 0; i < 25; i++) {
    ctx.fillStyle = `rgba(200,220,255,${0.5 + rand() * 0.5})`;
    ctx.fillRect(rand() * 128, rand() * 128, 2, 2);
  }
  return toTexture(c);
}

function cloudTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rand = mulberry32(53);
  ctx.fillStyle = '#2a2060';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 15 + rand() * 40;
    const tint = pick(rand, ['120,100,200', '180,120,210', '90,110,210', '200,150,220']);
    for (const dx of [-256, 0, 256]) {
      for (const dy of [-256, 0, 256]) {
        const g = ctx.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
        g.addColorStop(0, `rgba(${tint},0.55)`);
        g.addColorStop(1, `rgba(${tint},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
      }
    }
  }
  return toTexture(c);
}

function planetTexture(seed: number, colors: string[]): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 64);
  const rand = mulberry32(seed);
  let y = 0;
  while (y < 64) {
    const h = 3 + rand() * 8;
    ctx.fillStyle = pick(rand, colors);
    ctx.fillRect(0, y, 128, h + 1);
    y += h;
  }
  speckle(ctx, 128, 64, rand, 300, 0.1);
  return toTexture(c, false);
}

function glowSprite(color: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

function decorateRainbow(track: Track, group: THREE.Group, rand: () => number) {
  const n = track.samples.length;
  const all = [...Array(n + 1).keys()].map((i) => i % n);

  // The road's underside and its glowing edges.
  const under = new THREE.Mesh(
    ribbon(track, ROAD_HALF + 0.3, -ROAD_HALF - 0.3, -0.5, 10, all),
    new THREE.MeshBasicMaterial({ color: 0x3a2a7a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  group.add(under);
  for (const side of [-1, 1]) {
    const edge = new THREE.Mesh(
      ribbon(track, side * (ROAD_HALF - 0.1), side * (ROAD_HALF + 0.35), 0.05, 10, all),
      new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }),
    );
    group.add(edge);
  }
  // Thin glowing curtain hanging under each edge, so the road reads as a solid band from the side.
  for (const side of [-1, 1]) {
    const geo = new THREE.BufferGeometry();
    const pos: number[] = [];
    const idx: number[] = [];
    all.forEach((i, k) => {
      const smp = track.samples[i];
      const h = track.heightAt(smp.s);
      const x = smp.pos.x + smp.right.x * side * (ROAD_HALF + 0.3);
      const z = smp.pos.z + smp.right.z * side * (ROAD_HALF + 0.3);
      pos.push(x, h + 0.05, z, x, h - 0.5, z);
      if (k < all.length - 1) idx.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2);
    });
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    group.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xc8a8ff, side: THREE.DoubleSide })));
  }

  // A sea of cloud far below.
  const clouds = cloudTexture();
  clouds.repeat.set(10, 10);
  const sea = new THREE.Mesh(
    new THREE.CircleGeometry(1500, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: clouds, color: 0xb0a0e0 }),
  );
  sea.position.set(0, -40, 120);
  animate(sea, (t) => clouds.offset.set(t * 0.004, t * 0.002));
  group.add(sea);

  buildStars(group, rand);
  buildPlanets(group);
  buildArches(track, group);
  buildIslands(track, group, rand);
  buildStartArch(track, group);
  buildShootingStars(group, rand);
}

function buildStars(group: THREE.Group, rand: () => number) {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < 2500; i++) {
    // Upper hemisphere mostly, a few below the horizon line peeking under the clouds.
    const u = rand() * Math.PI * 2;
    const v = Math.acos(1 - rand() * 1.15);
    const r = 1400;
    pos.push(Math.cos(u) * Math.sin(v) * r, Math.cos(v) * r, Math.sin(u) * Math.sin(v) * r + 120);
    c.setHSL(rand() < 0.7 ? 0.62 : rand(), 0.6, 0.75 + rand() * 0.25);
    col.push(c.r, c.g, c.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false }));
  stars.frustumCulled = false;
  group.add(stars);
}

function buildPlanets(group: THREE.Group) {
  const ringed = new THREE.Mesh(
    new THREE.SphereGeometry(110, 32, 20),
    new THREE.MeshBasicMaterial({ map: planetTexture(54, ['#f0b070', '#e09060', '#f8d0a0', '#c87850']), fog: false }),
  );
  ringed.position.set(700, 380, 1100);
  ringed.rotation.z = 0.3;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(150, 230, 64).rotateX(-Math.PI / 2 + 0.35),
    new THREE.MeshBasicMaterial({ color: 0xffd8a8, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false }),
  );
  ring.position.copy(ringed.position);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(70, 24, 16),
    new THREE.MeshBasicMaterial({ map: planetTexture(55, ['#8ad8ff', '#5ab0f0', '#c0f0ff', '#4a90d8']), fog: false }),
  );
  moon.position.set(-900, 260, -500);
  const small = new THREE.Mesh(
    new THREE.SphereGeometry(35, 20, 14),
    new THREE.MeshBasicMaterial({ map: planetTexture(56, ['#ff8ac8', '#d860a8', '#ffb0e0']), fog: false }),
  );
  small.position.set(-300, 420, 1200);
  group.add(ringed, ring, moon, small);
  for (const [p, r, col] of [[ringed.position, 420, 'rgba(255,190,120,0.35)'], [moon.position, 260, 'rgba(120,200,255,0.35)']] as const) {
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowSprite(col), fog: false, depthWrite: false, transparent: true }));
    halo.position.copy(p);
    halo.scale.setScalar(r);
    group.add(halo);
  }
  ring.onBeforeRender = () => (ring.rotation.y = performance.now() / 40000);
}

/** Rainbow hoops over the road at intervals, slowly cycling colour. */
function buildArches(track: Track, group: THREE.Group) {
  const hoops: THREE.BufferGeometry[] = [];
  const posts: THREE.BufferGeometry[] = [];
  const every = Math.round(70 / track.spacing);
  const hoop = new THREE.TorusGeometry(WALL_HALF + 1, 0.5, 6, 28, Math.PI);
  const post = new THREE.OctahedronGeometry(1.1, 0);
  for (let i = every; i < track.samples.length - every / 2; i += every) {
    const smp = track.samples[i];
    const h = track.heightAt(smp.s);
    const yaw = Math.atan2(smp.tan.x, smp.tan.z);
    // The torus lies in XY; turning it by the road's yaw stands it across the road.
    hoops.push(hoop.clone().rotateY(yaw).translate(smp.pos.x, h, smp.pos.z));
    for (const side of [-1, 1]) {
      const p = smp.pos.clone().addScaledVector(smp.right, side * (WALL_HALF + 1));
      posts.push(placed(post, p.x, h, p.z));
    }
  }
  const mat = new THREE.MeshBasicMaterial({ color: 0xff7ad8 });
  const m = merged(hoops, mat, false);
  if (m) {
    group.add(m);
    animate(m, (t) => mat.color.setHSL((t * 0.08) % 1, 0.9, 0.65));
  }
  const pm = merged(posts, new THREE.MeshBasicMaterial({ color: 0xffffff }), false);
  if (pm) group.add(pm);
}

/** Floating rocks with glowing crystals, scattered around and below the course. */
function buildIslands(track: Track, group: THREE.Group, rand: () => number) {
  const rock: THREE.BufferGeometry[] = [];
  const grass: THREE.BufferGeometry[] = [];
  const crystals: THREE.BufferGeometry[][] = [[], [], []];
  for (let k = 0; k < 70; k++) {
    const x = -450 + rand() * 900;
    const z = -300 + rand() * 850;
    const r = 6 + rand() * 18;
    if (track.distanceToCentre(x, z) < WALL_HALF + r + 15) continue;
    const y = -10 + rand() * 90;
    rock.push(new THREE.ConeGeometry(r, r * 1.6, 7).rotateX(Math.PI).translate(x, y - r * 0.8, z));
    grass.push(new THREE.CylinderGeometry(r, r * 0.95, 1.2, 7).translate(x, y + 0.4, z));
    const count = 2 + Math.floor(rand() * 4);
    for (let c = 0; c < count; c++) {
      const h = 3 + rand() * r * 0.6;
      const g = new THREE.OctahedronGeometry(1, 0).scale(h * 0.22, h, h * 0.22);
      g.rotateZ((rand() - 0.5) * 0.6).rotateX((rand() - 0.5) * 0.6);
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.6;
      crystals[c % 3].push(g.translate(x + Math.cos(a) * d, y + h * 0.7, z + Math.sin(a) * d));
    }
  }
  const add = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
    const m = merged(geos, mat, false);
    if (m) group.add(m);
    return m;
  };
  add(rock, new THREE.MeshLambertMaterial({ color: 0x5a4a8a, flatShading: true }));
  add(grass, new THREE.MeshLambertMaterial({ color: 0x7ae0c0, flatShading: true }));
  [0x7af0ff, 0xff8ae0, 0xffe07a].forEach((col, i) => {
    const mat = new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.7, flatShading: true });
    const m = add(crystals[i], mat);
    if (m) animate(m, (t) => (mat.emissiveIntensity = 0.55 + 0.25 * Math.sin(t * 1.5 + i * 2)));
  });
}

function buildStartArch(track: Track, group: THREE.Group) {
  const smp = track.samples[0];
  const yaw = Math.atan2(smp.tan.x, smp.tan.z);
  const arch = new THREE.Group();
  BANDS.forEach((col, i) => {
    const band = new THREE.Mesh(
      new THREE.TorusGeometry(WALL_HALF + 3 + i * 0.9, 0.45, 6, 32, Math.PI),
      new THREE.MeshBasicMaterial({ color: col }),
    );
    arch.add(band);
  });
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 3),
    new THREE.MeshBasicMaterial({ map: signTexture('PRISM SKYWAY', '#140a3a', '#ffffff', '#9ff3ff', 'bold 56px "Trebuchet MS", sans-serif'), side: THREE.DoubleSide }),
  );
  sign.position.y = WALL_HALF + 2;
  sign.rotation.y = Math.PI;
  arch.add(sign);
  arch.position.copy(smp.pos).setY(track.heightAt(0));
  arch.rotation.y = yaw;
  group.add(arch);
}

function buildShootingStars(group: THREE.Group, rand: () => number) {
  for (let k = 0; k < 6; k++) {
    const streak = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 1.2, 60, 5).rotateZ(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, fog: false }),
    );
    const period = 6 + rand() * 8;
    const phase = rand() * period;
    const start = new THREE.Vector3(-600 + rand() * 1200, 250 + rand() * 250, -400 + rand() * 1200);
    const dir = new THREE.Vector3(rand() - 0.5, -0.25, rand() - 0.5).normalize();
    streak.quaternion.setFromUnitVectors(new THREE.Vector3(-1, 0, 0), dir);
    streak.frustumCulled = false;
    animate(streak, (t) => {
      const f = ((t + phase) % period) / 1.4;
      streak.visible = f < 1;
      streak.position.copy(start).addScaledVector(dir, f * 700);
    });
    group.add(streak);
  }
}

export const RAINBOW: CourseDef = {
  id: 'prism-skyway',
  name: 'Prism Skyway',
  tagline: 'A rainbow road across the night sky. Few rails: fall off and you lose time.',
  controlPoints: [
    [0, 0, 24], [90, 0, 24], [160, 20, 27], [200, 70, 32], [190, 130, 38], [140, 160, 44],
    [80, 150, 42], [40, 110, 32], [0, 80, 24], [-40, 100, 26], [-60, 160, 32], [-30, 220, 38],
    [-100, 245, 44], [-170, 205, 46], [-195, 130, 38], [-170, 60, 30], [-120, 10, 25], [-60, -5, 24],
  ],
  openEdges: [
    [0.03, 0.11],
    [0.28, 0.39],
    [0.62, 0.7],
    [0.8, 0.93],
  ],
  boostPads: [0.055, 0.3, 0.645, 0.85],
  ramps: [{ at: 0.37, length: 12, height: 2.6 }],
  itemRows: [0.14, 0.45, 0.6, 0.75, 0.96],
  crossings: [],
  env: {
    sky: ['#04021a', '#1a0f4a', '#4a2a8a', '#b070c8'],
    fog: 0x3a2a70,
    fogNear: 220,
    fogFar: 1000,
    hemiSky: 0xd0c0ff,
    hemiGround: 0x403070,
    hemiIntensity: 1.7,
    sun: 0xffffff,
    sunIntensity: 1.6,
    dust: 0xe8e0ff,
  },
  surfaces: {
    road: rainbowRoadTexture,
    verge: starGlassTexture,
    wall: () => new THREE.MeshBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.6 }),
    wallHeight: 0.9,
    roadGlow: 0.45,
  },
  music: { seed: 2077, tempo: 0.14 },
  ambience: 'rainbow',
  decorate: decorateRainbow,
};
