import * as THREE from 'three';
import type { ItemId, Kart } from './kart';
import type { Particles } from './particles';
import { itemBoxTexture, mudTexture } from './textures';
import type { Track } from './track';

export type SfxFn = (name: string, pos: THREE.Vector3) => void;

export const ITEM_INFO: Record<ItemId, { name: string; icon: string }> = {
  potion: { name: 'Haste Potion', icon: '🧪' },
  cabbage: { name: 'Rotten Cabbage', icon: '🥬' },
  fireball: { name: 'Fireball', icon: '🔥' },
  ward: { name: 'Magic Ward', icon: '🛡️' },
};

/** Weights per finishing place (index 0 is 1st). Leaders get defence, the back gets speed. */
const ODDS: Record<ItemId, number>[] = [
  { potion: 10, cabbage: 50, fireball: 15, ward: 25 },
  { potion: 25, cabbage: 30, fireball: 30, ward: 15 },
  { potion: 35, cabbage: 15, fireball: 40, ward: 10 },
  { potion: 50, cabbage: 5, fireball: 40, ward: 5 },
];

export function rollItem(place: number, rand = Math.random): ItemId {
  const table = ODDS[Math.min(ODDS.length - 1, Math.max(0, place - 1))];
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [id, w] of Object.entries(table) as [ItemId, number][]) {
    r -= w;
    if (r <= 0) return id;
  }
  return 'potion';
}

interface Box {
  mesh: THREE.Mesh;
  respawn: number;
}

interface Trap {
  mesh: THREE.Object3D;
  life: number;
}

interface Fireball {
  mesh: THREE.Object3D;
  s: number;
  lateral: number;
  owner: Kart;
  target: Kart | null;
  life: number;
  homing: boolean;
}

interface MudBomb {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  owner: Kart;
}

interface Puddle {
  mesh: THREE.Mesh;
  owner: Kart;
  life: number;
  radius: number;
}

export class ItemSystem {
  private boxes: Box[] = [];
  private traps: Trap[] = [];
  private fireballs: Fireball[] = [];
  private bombs: MudBomb[] = [];
  private puddles: Puddle[] = [];
  private boxGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  private boxMat = new THREE.MeshLambertMaterial({ map: itemBoxTexture(), transparent: true, opacity: 0.92 });
  private mudMat = new THREE.MeshLambertMaterial({ map: mudTexture(), transparent: true, depthWrite: false });
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Scene,
    private track: Track,
    private particles: Particles,
    private sfx: SfxFn,
  ) {
    for (const s of track.itemRows) {
      for (const lat of [-6, -2, 2, 6]) {
        const mesh = new THREE.Mesh(this.boxGeo, this.boxMat);
        track.pointAt(s, lat, mesh.position);
        mesh.position.y += 1.3;
        mesh.castShadow = true;
        scene.add(mesh);
        this.boxes.push({ mesh, respawn: 0 });
      }
    }
  }

  use(kart: Kart, karts: Kart[]) {
    const item = kart.item;
    if (!item || kart.rouletteTime > 0) return;
    kart.item = null;
    const fwd = kart.forward();
    switch (item) {
      case 'potion':
        kart.boost(1.5);
        this.sfx('potion', kart.pos);
        this.particles.burst(kart.pos.clone().setY(kart.pos.y + 1), 0x7dff9a, 20, 6, { life: 0.5, size: 0.6 });
        break;
      case 'ward':
        kart.shieldTime = 12;
        this.sfx('wardUp', kart.pos);
        break;
      case 'cabbage': {
        const mesh = makeCabbage();
        mesh.position.copy(kart.pos).addScaledVector(fwd, -3);
        mesh.position.y = kart.groundY;
        this.scene.add(mesh);
        this.traps.push({ mesh, life: 40 });
        this.sfx('drop', kart.pos);
        break;
      }
      case 'fireball': {
        // Target the kart one place ahead; the leader's fireball just flies down the road.
        const target = karts.find((k) => k.place === kart.place - 1 && !k.finished) ?? null;
        const mesh = makeFireball();
        this.scene.add(mesh);
        this.fireballs.push({ mesh, s: kart.s + 3, lateral: kart.lateral, owner: kart, target, life: 9, homing: false });
        this.sfx('throw', kart.pos);
        break;
      }
    }
  }

  throwMud(kart: Kart) {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), new THREE.MeshLambertMaterial({ color: 0x5a3b22, flatShading: true }));
    mesh.position.copy(kart.pos).setY(kart.pos.y + 1.5);
    const vel = kart.forward().multiplyScalar(Math.max(kart.speed, 10) + 22);
    vel.y = 11;
    this.scene.add(mesh);
    this.bombs.push({ mesh, vel, owner: kart });
  }

  update(dt: number, time: number, karts: Kart[]) {
    // Item boxes: spin, bob, and hand out items.
    for (const box of this.boxes) {
      if (box.respawn > 0) {
        box.respawn -= dt;
        box.mesh.visible = box.respawn <= 0;
        continue;
      }
      box.mesh.rotation.set(time * 0.7, time * 1.1, 0);
      for (const k of karts) {
        if (k.pos.distanceToSquared(box.mesh.position) < 2.6 * 2.6 + 1) {
          box.respawn = 2.5;
          box.mesh.visible = false;
          this.particles.burst(box.mesh.position, 0xfff1a8, 14, 7, { life: 0.4, size: 0.5 });
          if (!k.item) {
            k.item = rollItem(k.place);
            k.rouletteTime = 1.1;
            this.sfx(k.isPlayer ? 'pickup' : 'boxBreak', k.pos);
          }
          break;
        }
      }
    }
    for (const k of karts) if (k.rouletteTime > 0) k.rouletteTime = Math.max(0, k.rouletteTime - dt);

    // Cabbages.
    for (let i = this.traps.length - 1; i >= 0; i--) {
      const t = this.traps[i];
      t.life -= dt;
      let gone = t.life <= 0;
      for (const k of karts) {
        if (!gone && k.pos.distanceToSquared(t.mesh.position) < 1.9 * 1.9 && k.pos.y - t.mesh.position.y < 1.5) {
          if (k.hit()) this.sfx('splat', k.pos);
          this.particles.burst(t.mesh.position.clone().setY(t.mesh.position.y + 0.6), 0x7bbf4a, 18, 6, { life: 0.6, size: 0.5, gravity: 12, additive: false });
          gone = true;
        }
      }
      if (gone) {
        this.scene.remove(t.mesh);
        this.traps.splice(i, 1);
      }
    }

    // Fireballs follow the road, then home in on their target for the final stretch.
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const f = this.fireballs[i];
      f.life -= dt;
      const speed = 58;
      if (f.target && !f.homing) {
        let gap = f.target.s - f.s;
        if (gap < -this.track.length / 2) gap += this.track.length;
        if (gap < 20 && gap > -5) f.homing = true;
        else f.lateral += (f.target.lateral - f.lateral) * Math.min(1, dt * 1.5);
      }
      if (f.homing && f.target) {
        const to = this.tmp.copy(f.target.pos).setY(f.target.pos.y + 0.9).sub(f.mesh.position);
        const d = to.length();
        f.mesh.position.addScaledVector(to.normalize(), Math.min(d, speed * dt));
      } else {
        if (!f.target) f.lateral *= 1 - Math.min(1, dt * 0.8);
        f.s += speed * dt;
        this.track.pointAt(f.s, f.lateral, f.mesh.position);
        f.mesh.position.y += 0.9;
      }
      f.mesh.rotation.y += dt * 8;
      this.particles.emit(f.mesh.position, new THREE.Vector3(0, 1.5, 0), Math.random() < 0.5 ? 0xff7a1a : 0xffd04a, { life: 0.35, size: 0.9, grow: -0.6 });

      let gone = f.life <= 0;
      for (const k of karts) {
        if (gone || k === f.owner && f.life > 8.5) continue;
        if (k.pos.distanceToSquared(f.mesh.position) < 2.4 * 2.4 + 1.2) {
          k.hit();
          gone = true;
        }
      }
      for (let j = this.traps.length - 1; j >= 0 && !gone; j--) {
        if (this.traps[j].mesh.position.distanceToSquared(f.mesh.position) < 4) {
          this.scene.remove(this.traps[j].mesh);
          this.traps.splice(j, 1);
          gone = true;
        }
      }
      if (gone) {
        this.particles.burst(f.mesh.position, 0xff6a1a, 30, 12, { life: 0.6, size: 1.2 });
        this.particles.burst(f.mesh.position, 0x555555, 12, 5, { life: 1, size: 1.5, additive: false });
        this.sfx('explosion', f.mesh.position);
        this.scene.remove(f.mesh);
        this.fireballs.splice(i, 1);
      }
    }

    // Mud bombs arc through the air and leave a puddle where they land.
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i];
      b.vel.y -= 28 * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.rotation.x += dt * 6;
      if (b.mesh.position.y <= 0.2) {
        const proj = this.track.project(b.mesh.position);
        const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), this.mudMat);
        this.track.pointAt(proj.s, Math.max(-9, Math.min(9, proj.lateral)), mesh.position);
        mesh.position.y += 0.07;
        const radius = 6;
        mesh.scale.setScalar(radius);
        this.scene.add(mesh);
        this.puddles.push({ mesh, owner: b.owner, life: 12, radius });
        this.particles.burst(mesh.position, 0x6b4a2c, 30, 9, { life: 0.8, size: 0.8, gravity: 14, additive: false });
        this.sfx('splat', mesh.position);
        this.scene.remove(b.mesh);
        this.bombs.splice(i, 1);
      }
    }

    for (const k of karts) k.inMud = false;
    for (let i = this.puddles.length - 1; i >= 0; i--) {
      const p = this.puddles[i];
      p.life -= dt;
      p.mesh.scale.setScalar(p.radius * Math.min(1, p.life));
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        this.puddles.splice(i, 1);
        continue;
      }
      for (const k of karts) {
        if (k === p.owner) continue;
        const dx = k.pos.x - p.mesh.position.x;
        const dz = k.pos.z - p.mesh.position.z;
        if (dx * dx + dz * dz < p.radius * p.radius && k.grounded) {
          if (!k.inMud && k.speed > 10 && Math.random() < 0.3) {
            this.particles.emit(k.pos.clone().setY(0.5), new THREE.Vector3((Math.random() - 0.5) * 4, 4, (Math.random() - 0.5) * 4), 0x5a3b22, { life: 0.5, size: 0.5, gravity: 10, additive: false });
          }
          k.inMud = true;
        }
      }
    }
  }

  /** Nearest hazard ahead of a kart within range, for AI avoidance. */
  obstacleAhead(kart: Kart, range: number): THREE.Vector3 | null {
    const fwd = kart.forward();
    let best: THREE.Vector3 | null = null;
    let bestD = range;
    const consider = (p: THREE.Vector3) => {
      const dx = p.x - kart.pos.x;
      const dz = p.z - kart.pos.z;
      const along = dx * fwd.x + dz * fwd.z;
      if (along > 0 && along < bestD) {
        const side = Math.abs(dx * fwd.z - dz * fwd.x);
        if (side < 3) {
          bestD = along;
          best = p;
        }
      }
    };
    for (const t of this.traps) consider(t.mesh.position);
    for (const p of this.puddles) if (p.owner !== kart) consider(p.mesh.position);
    return best;
  }

  /** Item box rows the AI can aim for. */
  boxPositions(): THREE.Vector3[] {
    return this.boxes.filter((b) => b.respawn <= 0).map((b) => b.mesh.position);
  }
}

function makeCabbage(): THREE.Group {
  const g = new THREE.Group();
  const leaf = new THREE.MeshLambertMaterial({ color: 0x6aa84f, flatShading: true });
  const rot = new THREE.MeshLambertMaterial({ color: 0x5b4a2a, flatShading: true });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), leaf);
  core.position.y = 0.7;
  core.castShadow = true;
  g.add(core);
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 5, 3), i % 2 ? leaf : rot);
    const a = (i / 5) * Math.PI * 2;
    l.position.set(Math.cos(a) * 0.55, 0.45, Math.sin(a) * 0.55);
    l.scale.set(1, 0.5, 1);
    g.add(l);
  }
  return g;
}

function makeFireball(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 1), new THREE.MeshBasicMaterial({ color: 0xffb030 })));
  const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 1), new THREE.MeshBasicMaterial({ color: 0xff4a10, transparent: true, opacity: 0.45 }));
  g.add(glow);
  return g;
}
