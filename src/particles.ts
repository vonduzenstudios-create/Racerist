import * as THREE from 'three';
import { glowTexture } from './textures';

interface Particle {
  sprite: THREE.Sprite;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  grow: number;
  gravity: number;
}

/** A fixed pool of additive sprites shared by sparks, smoke, dust and explosions. */
export class Particles {
  private pool: Particle[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, count = 600) {
    const tex = glowTexture();
    for (let i = 0; i < count; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      scene.add(sprite);
      this.pool.push({ sprite, vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 1, grow: 0, gravity: 0 });
    }
  }

  emit(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    color: number,
    opts: { life?: number; size?: number; grow?: number; gravity?: number; additive?: boolean } = {},
  ) {
    const p = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    p.sprite.position.copy(pos);
    p.vel.copy(vel);
    p.life = p.maxLife = opts.life ?? 0.5;
    p.size = opts.size ?? 0.5;
    p.grow = opts.grow ?? 0;
    p.gravity = opts.gravity ?? 0;
    const mat = p.sprite.material;
    mat.color.setHex(color);
    mat.blending = opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending;
    p.sprite.visible = true;
  }

  burst(pos: THREE.Vector3, color: number, count: number, speed: number, opts: { life?: number; size?: number; gravity?: number; additive?: boolean } = {}) {
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.6));
      this.emit(pos, v, color, opts);
    }
  }

  update(dt: number) {
    for (const p of this.pool) {
      if (!p.sprite.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.sprite.visible = false;
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const k = p.life / p.maxLife;
      const s = p.size + p.grow * (1 - k);
      p.sprite.scale.set(s, s, s);
      p.sprite.material.opacity = Math.min(1, k * 1.5);
    }
  }
}
