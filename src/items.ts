import * as THREE from 'three';
import type { ItemId, Kart } from './kart';
import type { Particles } from './particles';
import { itemBoxTexture, mudTexture } from './textures';
import { ROAD_HALF, WALL_HALF, type Track } from './track';

export type SfxFn = (name: string, pos: THREE.Vector3) => void;

/** Lets the item system talk to the HUD without depending on it. */
export interface ItemHooks {
  toast(kart: Kart, text: string): void;
  flash(): void;
}

export const ITEM_INFO: Record<ItemId, { name: string; icon: string }> = {
  potion: { name: 'Haste Potion', icon: '🧪' },
  cabbage: { name: 'Rotten Cabbage', icon: '🥬' },
  fireball: { name: 'Fireball', icon: '🔥' },
  ward: { name: 'Magic Ward', icon: '🛡️' },
  cannonball: { name: 'Iron Cannonball', icon: '💣' },
  wraith: { name: 'Wraith Cloak', icon: '👻' },
  chalice: { name: 'Golden Chalice', icon: '🏆' },
  seeker: { name: 'Crown Seeker', icon: '💠' },
  thunder: { name: 'Thunder Scroll', icon: '⚡' },
  heart: { name: 'Dragon Heart', icon: '🐉' },
  feather: { name: 'Phoenix Feather', icon: '🪶' },
};

/**
 * Weights per band of the field, from the leader (index 0) to the back (index 3).
 * Leaders get defence and traps, the back gets speed and the big equalisers.
 */
const ODDS: Partial<Record<ItemId, number>>[] = [
  { potion: 10, cabbage: 35, fireball: 15, ward: 20, cannonball: 15, wraith: 5 },
  { potion: 20, cabbage: 20, fireball: 22, ward: 10, cannonball: 14, wraith: 6, chalice: 4, seeker: 3, heart: 1 },
  { potion: 18, cabbage: 6, fireball: 18, ward: 5, cannonball: 8, wraith: 8, chalice: 12, seeker: 9, heart: 8, thunder: 3, feather: 5 },
  { potion: 12, fireball: 10, cannonball: 4, wraith: 5, chalice: 15, seeker: 10, heart: 15, thunder: 8, feather: 15 },
];

/** `?item=thunder` makes every box hand out that item, for testing. */
const FORCED = new URLSearchParams(location.search).get('item') as ItemId | null;

export function rollItem(place: number, racers = 4, rand = Math.random): ItemId {
  if (FORCED && FORCED in ITEM_INFO) return FORCED;
  const frac = racers > 1 ? (place - 1) / (racers - 1) : 0;
  const table = ODDS[Math.round(Math.min(1, Math.max(0, frac)) * (ODDS.length - 1))];
  const total = Object.values(table).reduce((a, b) => a + (b ?? 0), 0);
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

interface Seeker {
  mesh: THREE.Object3D;
  s: number;
  lateral: number;
  owner: Kart;
  target: Kart | null;
  life: number;
  homing: boolean;
  alarm: number;
}

interface Cannonball {
  mesh: THREE.Object3D;
  vel: THREE.Vector3;
  owner: Kart;
  life: number;
  index: number;
}

interface Bolt {
  line: THREE.Line;
  life: number;
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
  private seekers: Seeker[] = [];
  private cannonballs: Cannonball[] = [];
  private bolts: Bolt[] = [];
  /** Glow meshes riding on karts for the Dragon Heart and Phoenix Feather. */
  private auras = new Map<Kart, { heart: THREE.Mesh; wings: THREE.Group }>();
  private boltMat = new THREE.LineBasicMaterial({ color: 0xfffbd0, transparent: true });
  hooks: ItemHooks = { toast: () => {}, flash: () => {} };
  private boxGeo = new THREE.BoxGeometry(1.6, 1.6, 1.6);
  private boxMat = new THREE.MeshLambertMaterial({ map: itemBoxTexture(), transparent: true, opacity: 0.92 });
  private mudMat = new THREE.MeshLambertMaterial({ map: mudTexture(), transparent: true, depthWrite: false });
  private tmp = new THREE.Vector3();

  constructor(
    private scene: THREE.Object3D,
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
    const fwd = kart.forward();
    if (item === 'chalice') {
      // The chalice stays in hand: unlimited haste until it runs dry.
      if (kart.itemTimer <= 0) kart.itemTimer = 7.5;
      kart.boost(1.1);
      this.particles.burst(kart.pos.clone().setY(kart.pos.y + 1), 0xffd44a, 24, 7, { life: 0.5, size: 0.6 });
      this.sfx('chalice', kart.pos);
      return;
    }
    kart.item = null;
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
      case 'cannonball': {
        const mesh = makeCannonball();
        mesh.position.copy(kart.pos).addScaledVector(fwd, 3).setY(kart.pos.y + 0.8);
        const vel = fwd.clone().multiplyScalar(Math.max(kart.speed, 0) + 34);
        this.scene.add(mesh);
        this.cannonballs.push({ mesh, vel, owner: kart, life: 10, index: kart.trackIndex });
        this.particles.burst(mesh.position, 0x9a9a9a, 16, 5, { life: 0.7, size: 1.2, additive: false });
        this.sfx('cannon', kart.pos);
        break;
      }
      case 'wraith':
        this.useWraith(kart, karts);
        break;
      case 'seeker': {
        // Hunts whoever leads the race (or second place, if the thrower is leading).
        const live = karts.filter((k) => !k.finished && k !== kart).sort((a, b) => a.place - b.place);
        const target = live[0] ?? null;
        const mesh = makeSeeker();
        this.scene.add(mesh);
        this.seekers.push({ mesh, s: kart.s + 3, lateral: kart.lateral, owner: kart, target, life: 30, homing: false, alarm: 0 });
        this.sfx('shellLaunch', kart.pos);
        if (target) this.hooks.toast(target, 'A Crown Seeker hunts you!');
        break;
      }
      case 'thunder':
        this.useThunder(kart, karts);
        break;
      case 'heart':
        kart.starTime = 7;
        kart.spinTime = 0;
        this.sfx('star', kart.pos);
        break;
      case 'feather':
        kart.featherTime = 3.5;
        kart.spinTime = 0;
        kart.drifting = false;
        this.particles.burst(kart.pos.clone().setY(kart.pos.y + 1), 0xff7a1a, 40, 10, { life: 0.6, size: 0.9 });
        this.sfx('bullet', kart.pos);
        break;
    }
  }

  private useWraith(kart: Kart, karts: Kart[]) {
    kart.ghostTime = 6;
    this.sfx('ghost', kart.pos);
    this.particles.burst(kart.pos.clone().setY(kart.pos.y + 1), 0xc8d8ff, 30, 6, { life: 0.8, size: 0.9 });
    // Steal from the nearest rival ahead that holds something, or anyone if nobody ahead does.
    const holders = karts.filter((k) => k !== kart && k.item && k.rouletteTime <= 0 && !k.finished);
    const ahead = holders.filter((k) => k.place < kart.place).sort((a, b) => b.place - a.place);
    const victim = ahead[0] ?? holders.sort((a, b) => a.place - b.place)[0];
    if (!victim || !victim.item) return;
    kart.item = victim.item;
    kart.itemTimer = 0;
    kart.rouletteTime = 0.4;
    victim.item = null;
    victim.itemTimer = 0;
    this.hooks.toast(kart, `Stole the ${ITEM_INFO[kart.item].name} from ${victim.def.name}!`);
    this.hooks.toast(victim, `A wraith stole your ${ITEM_INFO[kart.item].name}!`);
    this.particles.burst(victim.pos.clone().setY(victim.pos.y + 1.5), 0xc8d8ff, 20, 5, { life: 0.7, size: 0.7 });
    this.sfx('steal', victim.pos);
  }

  private useThunder(kart: Kart, karts: Kart[]) {
    let anyone: THREE.Vector3 | null = null;
    for (const k of karts) {
      if (k === kart || k.finished) continue;
      this.spawnBolt(k.pos);
      this.sfx('lightning', k.pos);
      this.sfx('thunder', k.pos);
      anyone = k.pos;
      const safe = k.invulnerable || k.shieldTime > 0;
      k.hit();
      if (safe) continue;
      // Racers near the back shrink for less time, so lightning can't bury them.
      const frac = karts.length > 1 ? (k.place - 1) / (karts.length - 1) : 0;
      k.shrinkTime = 3 + 3 * (1 - frac);
      if (k.itemTimer <= 0) k.item = null;
      k.rouletteTime = 0;
    }
    this.hooks.flash();
    if (anyone) this.sfx('shrink', anyone);
  }

  private spawnBolt(at: THREE.Vector3) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const jitter = i === 0 || i === 8 ? 0 : 1.6;
      pts.push(new THREE.Vector3(at.x + (Math.random() - 0.5) * jitter, at.y + 1 + (8 - i) * 5, at.z + (Math.random() - 0.5) * jitter));
    }
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), this.boltMat.clone());
    this.scene.add(line);
    this.bolts.push({ line, life: 0.35 });
    this.particles.burst(at.clone().setY(at.y + 1), 0xfff36a, 26, 9, { life: 0.5, size: 0.7 });
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
            k.item = rollItem(k.place, karts.length);
            k.rouletteTime = 1.1;
            this.sfx(k.isPlayer ? 'pickup' : 'boxBreak', k.pos);
          }
          break;
        }
      }
    }
    for (const k of karts) {
      if (k.rouletteTime > 0) k.rouletteTime = Math.max(0, k.rouletteTime - dt);
      if (k.itemTimer > 0) {
        k.itemTimer -= dt;
        if (k.itemTimer <= 0) {
          k.itemTimer = 0;
          if (k.item === 'chalice') k.item = null;
        }
      }
    }
    this.updateEffects(dt, time, karts);
    this.updateSeekers(dt, karts);
    this.updateCannonballs(dt, karts);
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.life -= dt;
      (b.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, b.life / 0.35) * (Math.random() < 0.3 ? 0.3 : 1);
      if (b.life <= 0) {
        this.scene.remove(b.line);
        b.line.geometry.dispose();
        (b.line.material as THREE.Material).dispose();
        this.bolts.splice(i, 1);
      }
    }

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
      const proj = this.track.project(b.mesh.position);
      if (b.mesh.position.y <= this.track.groundAt(proj.s, proj.lateral) + 0.2) {
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
            this.particles.emit(k.pos.clone().setY(k.pos.y + 0.5), new THREE.Vector3((Math.random() - 0.5) * 4, 4, (Math.random() - 0.5) * 4), 0x5a3b22, { life: 0.5, size: 0.5, gravity: 10, additive: false });
          }
          k.inMud = true;
        }
      }
    }
  }

  /** Dragon Heart and Phoenix Feather: visuals, autopilot, and ramming. */
  private updateEffects(dt: number, time: number, karts: Kart[]) {
    for (const k of karts) {
      let aura = this.auras.get(k);
      if ((k.starTime > 0 || k.featherTime > 0) && !aura) {
        aura = { heart: makeHeartGlow(), wings: makeWings() };
        k.model.add(aura.heart, aura.wings);
        this.auras.set(k, aura);
      }
      if (aura) {
        aura.heart.visible = k.starTime > 0;
        aura.wings.visible = k.featherTime > 0;
        const hue = (time * 1.5) % 1;
        (aura.heart.material as THREE.MeshBasicMaterial).color.setHSL(hue, 1, 0.6);
        aura.heart.scale.setScalar(1 + Math.sin(time * 18) * 0.07);
        const flap = Math.sin(time * 14) * 0.5;
        aura.wings.children[0].rotation.z = 0.3 + flap;
        aura.wings.children[1].rotation.z = -0.3 - flap;
      }
      if (k.starTime > 0 && Math.random() < dt * 30) {
        const c = new THREE.Color().setHSL(Math.random(), 1, 0.6).getHex();
        this.particles.emit(k.pos.clone().setY(k.pos.y + 1), new THREE.Vector3((Math.random() - 0.5) * 4, 3, (Math.random() - 0.5) * 4), c, { life: 0.4, size: 0.6 });
      }
      if (k.featherTime > 0) {
        // Fly along the racing line: aim at a point ahead near the road centre, fast.
        const aim = this.track.pointAt(k.s + 14, k.lateral * 0.6, this.tmp);
        const want = Math.atan2(aim.x - k.pos.x, aim.z - k.pos.z);
        let d = want - k.heading;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        k.heading += d * Math.min(1, dt * 8);
        k.speed = Math.max(k.speed, k.topSpeed * 1.55);
        k.boostTime = Math.max(k.boostTime, 0.15);
        k.drifting = false;
        k.spinTime = 0;
        if (Math.random() < dt * 40) {
          this.particles.emit(k.pos.clone().setY(k.pos.y + 0.8).addScaledVector(k.forward(), -1.5), new THREE.Vector3(0, 1, 0), Math.random() < 0.5 ? 0xff5a10 : 0xffc23a, { life: 0.45, size: 1.1, grow: -0.6 });
        }
      }
      if (k.starTime > 0 || k.featherTime > 0) {
        for (const o of karts) {
          if (o === k || o.starTime > 0 || o.featherTime > 0) continue;
          if (o.pos.distanceToSquared(k.pos) < 2.8 * 2.8 && Math.abs(o.pos.y - k.pos.y) < 2) {
            if (o.hit()) {
              this.particles.burst(o.pos.clone().setY(o.pos.y + 1), 0xffe27a, 18, 8, { life: 0.4, size: 0.6 });
              this.sfx('bump', o.pos);
            }
          }
        }
      }
    }
  }

  /** Crown Seekers race down the road, then dive onto the leader and explode. */
  private updateSeekers(dt: number, karts: Kart[]) {
    for (let i = this.seekers.length - 1; i >= 0; i--) {
      const f = this.seekers[i];
      f.life -= dt;
      if (f.target?.finished) {
        f.target = karts.filter((k) => !k.finished && k !== f.owner).sort((a, b) => a.place - b.place)[0] ?? null;
      }
      const speed = 82;
      if (f.target && !f.homing) {
        let gap = f.target.s - f.s;
        if (gap < -this.track.length / 2) gap += this.track.length;
        // Sound the alarm around the leader as it closes in.
        f.alarm -= dt;
        if (gap < 120 && f.alarm <= 0) {
          this.sfx('shellAlarm', f.target.pos);
          f.alarm = 0.6;
        }
        if (gap < 14 && gap > -4) f.homing = true;
      }
      if (f.homing && f.target) {
        const to = this.tmp.copy(f.target.pos).setY(f.target.pos.y + 0.9).sub(f.mesh.position);
        const d = to.length();
        f.mesh.position.addScaledVector(to.normalize(), Math.min(d, speed * dt));
        if (d < 1.5) f.life = 0;
      } else {
        // Glide along the centre line above the traffic, so it can't be blocked by walls.
        f.lateral *= 1 - Math.min(1, dt * 2);
        f.s = (f.s + speed * dt) % this.track.length;
        this.track.pointAt(f.s, f.lateral, f.mesh.position);
        f.mesh.position.y += 3.5;
      }
      f.mesh.rotation.y += dt * 10;
      f.mesh.rotation.x += dt * 4;
      this.particles.emit(f.mesh.position, new THREE.Vector3(0, 0.5, 0), Math.random() < 0.5 ? 0x5ab8ff : 0xd9f2ff, { life: 0.4, size: 0.9, grow: -0.6 });
      if (f.life > 0) continue;
      const at = f.mesh.position.clone();
      for (const k of karts) {
        if (k === f.owner) continue;
        if (k.pos.distanceToSquared(at) < 8 * 8) k.hit();
      }
      this.particles.burst(at, 0x4fa8ff, 50, 16, { life: 0.8, size: 1.5 });
      this.particles.burst(at, 0xffffff, 20, 10, { life: 0.5, size: 1.0 });
      this.sfx('bigExplosion', at);
      this.scene.remove(f.mesh);
      this.seekers.splice(i, 1);
    }
  }

  /** Iron Cannonballs roll straight and ricochet off the walls until they hit someone. */
  private updateCannonballs(dt: number, karts: Kart[]) {
    for (let i = this.cannonballs.length - 1; i >= 0; i--) {
      const c = this.cannonballs[i];
      c.life -= dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      const proj = this.track.project(c.mesh.position, c.index);
      c.index = proj.index;
      const limit = WALL_HALF - 1.4;
      if (Math.abs(proj.lateral) > limit) {
        const n = this.track.samples[proj.index].right;
        const side = Math.sign(proj.lateral);
        c.mesh.position.addScaledVector(n, -(proj.lateral - side * limit));
        const vn = c.vel.dot(n);
        if (vn * side > 0) c.vel.addScaledVector(n, -2 * vn);
        this.particles.burst(c.mesh.position, 0xffd27a, 8, 6, { life: 0.25, size: 0.4 });
        this.sfx('ricochet', c.mesh.position);
      }
      const ground = Math.abs(proj.lateral) < ROAD_HALF + 0.5 ? this.track.heightAt(proj.s) : 0;
      c.mesh.position.y = ground + 0.8;
      const speed = c.vel.length();
      c.mesh.rotateOnAxis(this.tmp.set(c.vel.z, 0, -c.vel.x).normalize(), (speed / 0.8) * dt);

      let gone = c.life <= 0;
      for (const k of karts) {
        if (gone || (k === c.owner && c.life > 9.4)) continue;
        if (k.pos.distanceToSquared(c.mesh.position) < 2.2 * 2.2 + 1) {
          k.hit();
          gone = true;
        }
      }
      for (let j = this.traps.length - 1; j >= 0 && !gone; j--) {
        if (this.traps[j].mesh.position.distanceToSquared(c.mesh.position) < 4) {
          this.scene.remove(this.traps[j].mesh);
          this.traps.splice(j, 1);
          gone = true;
        }
      }
      if (gone) {
        this.particles.burst(c.mesh.position, 0x777777, 20, 8, { life: 0.8, size: 1.2, additive: false });
        this.particles.burst(c.mesh.position, 0xffa040, 14, 10, { life: 0.4, size: 0.8 });
        this.sfx('explosion', c.mesh.position);
        this.scene.remove(c.mesh);
        this.cannonballs.splice(i, 1);
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
    for (const c of this.cannonballs) consider(c.mesh.position);
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

function makeCannonball(): THREE.Group {
  const g = new THREE.Group();
  const iron = new THREE.MeshLambertMaterial({ color: 0x2c2f36, flatShading: true });
  const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 1), iron);
  ball.castShadow = true;
  g.add(ball);
  // A rivet band so the roll is visible.
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.09, 4, 14), new THREE.MeshLambertMaterial({ color: 0x8a7a55, flatShading: true }));
  g.add(band);
  return g;
}

function makeSeeker(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), new THREE.MeshBasicMaterial({ color: 0x9ad8ff })));
  g.add(new THREE.Mesh(new THREE.OctahedronGeometry(1.4, 0), new THREE.MeshBasicMaterial({ color: 0x2a7bff, transparent: true, opacity: 0.4 })));
  // A little crown of spikes.
  const gold = new THREE.MeshBasicMaterial({ color: 0xffd44a });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 4), gold);
    spike.position.set(Math.cos(a) * 0.9, 0.7, Math.sin(a) * 0.9);
    g.add(spike);
  }
  return g;
}

function makeHeartGlow(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.3, 1),
    new THREE.MeshBasicMaterial({ color: 0xff4040, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  m.position.y = 1.1;
  return m;
}

function makeWings(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xff8a20, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3, 3).rotateZ((side * Math.PI) / 2), mat);
    wing.scale.set(1, 1, 0.25);
    wing.position.x = side * 1.6;
    pivot.add(wing);
    pivot.position.set(side * 0.8, 1.2, -0.3);
    g.add(pivot);
  }
  return g;
}
