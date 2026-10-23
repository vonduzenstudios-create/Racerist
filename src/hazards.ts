import * as THREE from 'three';
import type { Kart } from './kart';
import type { Particles } from './particles';
import { mulberry32 } from './rng';
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
  sound: string;
  cry?: string;
  color: number;
}

/** Whatever the course sends wandering over its crossings: townsfolk, deer, crabs. */
export class Hazards {
  private walkers: Walker[] = [];
  private tmp = new THREE.Vector3();

  constructor(
    scene: THREE.Object3D,
    private track: Track,
    private particles: Particles,
    private sfx: SfxFn,
  ) {
    const rand = mulberry32(99);
    const make = track.course.walker;
    if (!make) return;
    track.crossings.forEach((s, ci) => {
      const count = 3 + (ci % 2);
      for (let i = 0; i < count; i++) {
        const { root, legs, speed, sound, cry, color } = make(rand, ci, i, count);
        scene.add(root);
        this.walkers.push({
          root,
          legs,
          s: s + (i - count / 2) * 2.4,
          lateral: -WALL_HALF + 2 + rand() * (WALL_HALF * 2 - 4),
          dir: rand() < 0.5 ? 1 : -1,
          speed,
          pause: rand() * 2,
          knocked: 0,
          sound,
          cry,
          color,
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
      w.root.position.y += Math.abs(Math.sin(time * 8 + w.s)) * (walking ? 0.08 : 0);
      const smp = this.track.sampleAt(w.s);
      w.root.rotation.y = Math.atan2(smp.right.x, smp.right.z) + (w.dir > 0 ? 0 : Math.PI);
      w.legs.forEach((leg, i) => (leg.rotation.x = walking ? Math.sin(time * 9 + i * Math.PI) * 0.6 : 0));

      if (w.knocked > 0) continue;
      for (const k of karts) {
        if (k.activePower === 'phantom') continue;
        const d = this.tmp.copy(k.pos).sub(w.root.position);
        d.y = 0;
        if (d.lengthSq() < 2.0 * 2.0 && k.pos.y - w.root.position.y < 1.5) {
          const fell = k.hit();
          w.knocked = 2.5;
          this.particles.burst(w.root.position.clone().setY(w.root.position.y + 2.5), w.color, 16, 6, { life: 0.7, size: 0.5, gravity: 10, additive: false });
          if (fell || k.activePower === 'rampage') {
            this.sfx(w.sound, k.pos);
            if (w.cry) this.sfx(w.cry, w.root.position);
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
