import * as THREE from 'three';
import type { Kart } from './kart';
import type { Particles } from './particles';
import { mulberry32, pick } from './rng';
import type { SfxFn } from './items';
import { Track, WALL_HALF } from './track';

interface Walker {
  root: THREE.Group;
  legs: THREE.Object3D[];
  s: number;
  lateral: number;
  dir: number;
  speed: number;
  pause: number;
  knocked: number;
  isPig: boolean;
}

const lambert = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });

function part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function makePeasant(rand: () => number): { root: THREE.Group; legs: THREE.Object3D[] } {
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
  return { root, legs };
}

function makePig(): { root: THREE.Group; legs: THREE.Object3D[] } {
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
  return { root, legs };
}

/** Townsfolk and livestock wandering over the market crossings. */
export class Hazards {
  private walkers: Walker[] = [];
  private tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private track: Track,
    private particles: Particles,
    private sfx: SfxFn,
  ) {
    const rand = mulberry32(99);
    track.crossings.forEach((s, ci) => {
      const count = 3 + (ci % 2);
      for (let i = 0; i < count; i++) {
        const isPig = i === count - 1 && ci !== 1;
        const { root, legs } = isPig ? makePig() : makePeasant(rand);
        scene.add(root);
        this.walkers.push({
          root,
          legs,
          s: s + (i - count / 2) * 2.4,
          lateral: -WALL_HALF + 2 + rand() * (WALL_HALF * 2 - 4),
          dir: rand() < 0.5 ? 1 : -1,
          speed: isPig ? 3.2 : 1.8 + rand() * 1.4,
          pause: rand() * 2,
          knocked: 0,
          isPig,
        });
      }
    });
  }

  update(dt: number, time: number, karts: Kart[]) {
    for (const w of this.walkers) {
      if (w.knocked > 0) {
        w.knocked -= dt;
        w.root.rotation.z = Math.min(Math.PI / 2, w.root.rotation.z + dt * 8);
        if (w.knocked <= 0) w.root.rotation.z = 0;
      } else if (w.pause > 0) {
        w.pause -= dt;
      } else {
        w.lateral += w.dir * w.speed * dt;
        const edge = WALL_HALF - 1;
        if (Math.abs(w.lateral) > edge) {
          w.lateral = Math.sign(w.lateral) * edge;
          w.dir = -w.dir;
          w.pause = 1 + Math.random() * 3;
        }
      }
      const walking = w.knocked <= 0 && w.pause <= 0;
      this.track.pointAt(w.s, w.lateral, w.root.position);
      w.root.position.y = Math.abs(Math.sin(time * 8 + w.s)) * (walking ? 0.08 : 0);
      const smp = this.track.sampleAt(w.s);
      w.root.rotation.y = Math.atan2(smp.right.x, smp.right.z) + (w.dir > 0 ? 0 : Math.PI);
      w.legs.forEach((leg, i) => (leg.rotation.x = walking ? Math.sin(time * 9 + i * Math.PI) * 0.6 : 0));

      if (w.knocked > 0) continue;
      for (const k of karts) {
        if (k.activePower === 'phantom') continue;
        const d = this.tmp.copy(k.pos).sub(w.root.position);
        d.y = 0;
        if (d.lengthSq() < 2.0 * 2.0 && k.pos.y < 1.5) {
          const fell = k.hit();
          w.knocked = 2.5;
          this.particles.burst(w.root.position.clone().setY(2.5), w.isPig ? 0xf0a0a8 : 0xd8c060, 16, 6, { life: 0.7, size: 0.5, gravity: 10, additive: false });
          if (fell || k.activePower === 'rampage') {
            this.sfx(w.isPig ? 'oink' : 'bump', k.pos);
            if (!w.isPig) this.sfx('ouch', w.root.position);
          }
          break;
        }
      }
    }
  }

  /** Walker positions near a given distance, for AI avoidance. */
  near(s: number, range: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const w of this.walkers) {
      let gap = w.s - s;
      if (gap < -this.track.length / 2) gap += this.track.length;
      if (gap > 0 && gap < range && w.knocked <= 0) out.push(w.root.position);
    }
    return out;
  }
}
