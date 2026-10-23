import * as THREE from 'three';
import type { CharacterDef } from './characters';
import type { KartInput } from './input';
import { clamp, lerp, wrapAngle } from './rng';
import { ROAD_HALF, Track, WALL_HALF } from './track';

export type ItemId =
  | 'potion'
  | 'cabbage'
  | 'fireball'
  | 'ward'
  | 'cannonball'
  | 'wraith'
  | 'chalice'
  | 'seeker'
  | 'thunder'
  | 'heart'
  | 'feather';

export type KartEvent = 'hop' | 'tier1' | 'tier2' | 'boost' | 'bump' | 'spin' | 'blocked' | 'land' | 'lap' | 'finish' | 'fall';

const GRAVITY = 28;
export const TOTAL_LAPS = 3;

export class Kart {
  readonly model: THREE.Group;
  private readonly body: THREE.Group;
  private readonly wheels: THREE.Object3D[] = [];
  private readonly frontWheels: THREE.Object3D[] = [];
  private readonly blinkers: THREE.Mesh[] = [];
  readonly shieldMesh: THREE.Mesh;
  readonly auraMesh: THREE.Mesh;
  readonly frostMesh: THREE.Mesh;
  private readonly ghostMats: THREE.Material[] = [];
  private ghostly = false;

  // Tuned from the 1..5 stats.
  readonly topSpeed: number;
  readonly accel: number;
  readonly turnRate: number;
  readonly weight: number;

  pos = new THREE.Vector3();
  heading = 0;
  speed = 0;
  vy = 0;
  grounded = true;
  steerVisual = 0;

  trackIndex = -1;
  s = 0;
  lateral = 0;
  lap = 0;
  place = 1;
  finished = false;
  finishTime = 0;

  drifting = false;
  driftDir = 0;
  driftCharge = 0;
  driftTier = 0;
  private prevDrift = false;
  private driftYaw = 0;

  boostTime = 0;
  spinTime = 0;
  private spinAngle = 0;
  shieldTime = 0;
  /** Frozen by a Frost Nova: top speed is cut while this runs. */
  chillTime = 0;
  inMud = false;
  offroad = false;
  airTime = 0;
  groundY = 0;
  /** Last place the kart was safely on the road, where it is put back after a fall. */
  private safeS = 0;
  /** Seconds left of the post-fall pause, while the kart is lowered back onto the road. */
  respawnTime = 0;

  item: ItemId | null = null;
  rouletteTime = 0;
  /** Seconds left on a multi-use item (the Golden Chalice). */
  itemTimer = 0;
  /** Wraith Cloak: see-through and untouchable. */
  ghostTime = 0;
  /** Dragon Heart: invincible, faster, and hits whoever it touches. */
  starTime = 0;
  /** Phoenix Feather: flies itself along the road. */
  featherTime = 0;
  /** Thunder Scroll: shrunk and slowed. */
  shrinkTime = 0;
  private shrinkScale = 1;
  powerCharge = 0.35;
  powerActive = 0;
  /** The power that is currently running, if any. */
  activePower: string | null = null;

  events: KartEvent[] = [];
  lastInput: KartInput | null = null;
  /** AI rubber-banding and difficulty scale on top speed. */
  speedScale = 1;
  trackLength = 1;

  constructor(
    readonly def: CharacterDef,
    readonly id: number,
    readonly isPlayer: boolean,
  ) {
    const st = def.stats;
    this.topSpeed = 25 + st.speed * 1.4;
    this.accel = 7 + st.accel * 2.2;
    this.turnRate = 1.5 + st.handling * 0.18;
    this.weight = 0.6 + st.weight * 0.3;

    this.model = new THREE.Group();
    this.body = def.build();
    this.model.add(this.body);
    this.body.traverse((o) => {
      if (o.userData.wheel) {
        this.wheels.push(o);
        if (o.userData.front) this.frontWheels.push(o);
      }
      if (o.userData.blink) this.blinkers.push(o as THREE.Mesh);
      const mat = (o as THREE.Mesh).material;
      if (mat && !Array.isArray(mat) && !this.ghostMats.includes(mat)) {
        mat.userData = { transparent: mat.transparent, opacity: mat.opacity };
        this.ghostMats.push(mat);
      }
    });
    // Blob shadow keeps karts grounded visually even outside the shadow camera.
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(1.5, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    blob.position.y = 0.06;
    blob.scale.z = 1.4;
    blob.name = 'blob';
    this.model.add(blob);

    this.shieldMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.3, 1),
      new THREE.MeshBasicMaterial({ color: 0x8fd8ff, transparent: true, opacity: 0.28, wireframe: true }),
    );
    this.shieldMesh.position.y = 1.1;
    this.shieldMesh.visible = false;
    this.model.add(this.shieldMesh);
    this.auraMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    this.auraMesh.position.y = 1.0;
    this.auraMesh.visible = false;
    this.model.add(this.auraMesh);
    this.frostMesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.9, 0),
      new THREE.MeshLambertMaterial({ color: 0xbfeaff, transparent: true, opacity: 0.45, flatShading: true }),
    );
    this.frostMesh.position.y = 1.0;
    this.frostMesh.scale.y = 0.8;
    this.frostMesh.visible = false;
    this.model.add(this.frostMesh);
  }

  /** Metres raced since the start, used for placings and gaps. */
  get progress(): number {
    return this.lap * this.trackLength + this.s;
  }

  forward(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  right(out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(-Math.cos(this.heading), 0, Math.sin(this.heading));
  }

  placeAt(track: Track, s: number, lateral: number) {
    this.trackLength = track.length;
    track.pointAt(s, lateral, this.pos);
    const smp = track.sampleAt(s);
    this.heading = Math.atan2(smp.tan.x, smp.tan.z);
    const proj = track.project(this.pos);
    this.trackIndex = proj.index;
    this.s = proj.s;
    this.lateral = proj.lateral;
    this.syncModel(0);
  }

  boost(seconds: number) {
    this.boostTime = Math.max(this.boostTime, seconds);
    this.events.push('boost');
  }

  /** Something hit the kart. Returns false if it was protected. */
  hit(): boolean {
    if (this.spinTime > 0) return false;
    if (this.activePower === 'rampage' || this.activePower === 'phantom') return false;
    if (this.invulnerable) return false;
    if (this.shieldTime > 0) {
      this.shieldTime = 0;
      this.events.push('blocked');
      return false;
    }
    this.spinTime = 1.3;
    this.speed *= 0.35;
    this.boostTime = 0;
    this.drifting = false;
    this.driftCharge = 0;
    this.driftTier = 0;
    this.powerCharge = Math.min(1, this.powerCharge + 0.15);
    this.events.push('spin');
    return true;
  }

  /** Item effects that make the kart immune to hits. */
  get invulnerable(): boolean {
    return this.ghostTime > 0 || this.starTime > 0 || this.featherTime > 0;
  }

  get maxSpeed(): number {
    let max = this.topSpeed * this.speedScale;
    const roughImmune = this.boostTime > 0 || this.starTime > 0 || this.featherTime > 0 || this.activePower === 'overclock' || this.activePower === 'rampage';
    if (this.offroad && !roughImmune) max *= 0.55;
    if (this.inMud && this.activePower !== 'rampage' && this.activePower !== 'phantom') max *= 0.45;
    if (this.chillTime > 0) max *= 0.5;
    if (this.activePower === 'phantom') max *= 1.08;
    if (this.activePower === 'rampage') max *= 1.1;
    if (this.activePower === 'overclock') max *= 1.22;
    if (this.boostTime > 0) max *= 1.32;
    if (this.starTime > 0) max *= 1.15;
    if (this.shrinkTime > 0) max *= 0.7;
    return max;
  }

  step(dt: number, input: KartInput, track: Track, canDrive: boolean) {
    this.lastInput = input;
    this.respawnTime = Math.max(0, this.respawnTime - dt);
    if (!canDrive || this.respawnTime > 0) input = { ...input, throttle: 0, brake: 0, steer: 0, drift: false };

    this.boostTime = Math.max(0, this.boostTime - dt);
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.chillTime = Math.max(0, this.chillTime - dt);
    this.ghostTime = Math.max(0, this.ghostTime - dt);
    this.starTime = Math.max(0, this.starTime - dt);
    this.featherTime = Math.max(0, this.featherTime - dt);
    this.shrinkTime = Math.max(0, this.shrinkTime - dt);
    if (this.powerActive > 0) {
      this.powerActive -= dt;
      if (this.powerActive <= 0) this.activePower = null;
    }

    const max = this.maxSpeed;
    let turn = 0;

    if (this.spinTime > 0) {
      this.spinTime -= dt;
      this.spinAngle += 13 * dt;
      this.speed *= Math.exp(-2.5 * dt);
      if (this.spinTime <= 0) this.spinAngle = 0;
    } else {
      // Longitudinal.
      if (this.boostTime > 0 || this.activePower === 'overclock') {
        this.speed = Math.max(this.speed, Math.min(max, this.speed + 60 * dt));
      } else if (input.throttle > 0 && this.speed < max) {
        this.speed += this.accel * input.throttle * (1.3 - 0.7 * Math.max(0, this.speed) / max) * dt;
        this.speed = Math.min(this.speed, max);
      }
      if (input.brake > 0) {
        if (this.speed > 0.5) this.speed -= 30 * input.brake * dt;
        else this.speed = Math.max(-9, this.speed - 12 * input.brake * dt);
      } else if (input.throttle === 0 && this.boostTime === 0) {
        this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 7 * dt);
      }
      if (this.speed > max) this.speed -= Math.min(this.speed - max, (this.speed - max) * 2.5 * dt + 8 * dt);

      // Drift: tap to hop, hold with a direction to drift and charge a boost.
      const driftPressed = input.drift && !this.prevDrift;
      if (driftPressed && this.grounded && this.speed > 6) {
        this.vy = 5;
        this.grounded = false;
        this.events.push('hop');
        if (Math.abs(input.steer) > 0.2 && this.speed > 12) {
          this.drifting = true;
          this.driftDir = Math.sign(input.steer);
          this.driftCharge = 0;
          this.driftTier = 0;
        }
      }
      if (input.drift && !this.drifting && !this.grounded && Math.abs(input.steer) > 0.2 && this.speed > 12 && this.airTime < 0.25) {
        // Allow picking a direction during the hop.
        this.drifting = true;
        this.driftDir = Math.sign(input.steer);
        this.driftCharge = 0;
        this.driftTier = 0;
      }
      if (this.drifting && (!input.drift || this.speed < 8)) {
        if (this.driftTier > 0 && this.speed >= 8) this.boost(this.driftTier === 2 ? 1.3 : 0.65);
        this.drifting = false;
        this.driftCharge = 0;
        this.driftTier = 0;
      }

      const speedFactor = clamp(Math.abs(this.speed) / 7, 0, 1) * (1 - 0.22 * clamp(this.speed / this.topSpeed, 0, 1));
      if (this.drifting) {
        const lean = input.steer * this.driftDir; // -1 opens the line, +1 tightens it
        turn = this.driftDir * this.turnRate * 1.05 * (0.55 + 0.5 * lean) * speedFactor;
        if (this.grounded) {
          this.driftCharge += dt * (0.8 + 0.7 * Math.max(0, lean));
          const tier = this.driftCharge > 2.1 ? 2 : this.driftCharge > 0.9 ? 1 : 0;
          if (tier > this.driftTier) {
            this.driftTier = tier;
            this.events.push(tier === 2 ? 'tier2' : 'tier1');
          }
        }
      } else {
        turn = input.steer * this.turnRate * speedFactor * Math.sign(this.speed || 1);
      }
      if (!this.grounded) turn *= 0.6;
    }
    this.prevDrift = input.drift;
    this.heading = wrapAngle(this.heading - turn * dt);
    this.steerVisual = lerp(this.steerVisual, this.spinTime > 0 ? 0 : input.steer, 1 - Math.exp(-10 * dt));

    // Move.
    const fwd = this.forward();
    this.pos.addScaledVector(fwd, this.speed * dt);
    if (this.drifting) this.pos.addScaledVector(this.right(), -this.driftDir * this.speed * 0.09 * dt);

    // Track relation and walls.
    const proj = track.project(this.pos, this.trackIndex);
    if (proj.s - this.s < -track.length / 2) this.crossLine(1);
    else if (proj.s - this.s > track.length / 2) this.crossLine(-1);
    this.trackIndex = proj.index;
    this.s = proj.s;
    this.lateral = proj.lateral;
    this.offroad = Math.abs(this.lateral) > ROAD_HALF + 0.6;
    const limit = WALL_HALF - 1;
    if (Math.abs(this.lateral) > limit && !track.isOpen(this.s)) {
      const smp = track.samples[proj.index];
      const over = this.lateral - Math.sign(this.lateral) * limit;
      this.pos.addScaledVector(smp.right, -over);
      this.lateral -= over;
      // Glance off: swing the nose toward the track direction and scrub speed.
      const trackYaw = Math.atan2(smp.tan.x, smp.tan.z);
      const facing = Math.cos(wrapAngle(this.heading - trackYaw)) >= 0 ? trackYaw : trackYaw + Math.PI;
      const diff = wrapAngle(facing - this.heading);
      const impact = Math.abs(Math.sin(diff));
      this.heading = wrapAngle(this.heading + diff * 0.5);
      if (this.speed > 6 && impact > 0.08) this.events.push('bump');
      this.speed *= 1 - clamp(impact * 1.2, 0.02, 0.6);
    }

    // Vertical: follow the road, launch off the ramp lip, fall back down.
    const ground = track.groundAt(this.s, this.lateral);
    if (this.grounded && (Math.abs(this.lateral) < ROAD_HALF || !track.isOpen(this.s))) this.safeS = this.s;
    if (this.grounded && track.onBoostPad(this.s, this.lateral) && this.boostTime < 0.5) this.boost(0.9);
    this.groundY = ground;
    if (this.grounded) {
      if (ground < this.pos.y - 0.4) {
        this.grounded = false;
      } else {
        this.vy = (ground - this.pos.y) / dt;
        this.pos.y = ground;
      }
    }
    if (!this.grounded) {
      this.airTime += dt;
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        if (this.airTime > 0.45) this.events.push('land');
        this.vy = 0;
        this.grounded = true;
        this.airTime = 0;
      }
    }
    if (this.pos.y < track.baseHeightAt(this.s) - 22) this.respawn(track);
  }

  /** Fell off an open edge: drop back onto the centreline a little before where it went over. */
  private respawn(track: Track) {
    const target = track.wrapS(this.safeS - 4);
    // Going back over the start line takes the lap back with it.
    if (target - this.s > track.length / 2) this.lap -= 1;
    else if (this.s - target > track.length / 2) this.crossLine(1);
    track.pointAt(target, 0, this.pos);
    this.pos.y += 5;
    const smp = track.sampleAt(target);
    this.heading = Math.atan2(smp.tan.x, smp.tan.z);
    const proj = track.project(this.pos);
    this.trackIndex = proj.index;
    this.s = proj.s;
    this.lateral = proj.lateral;
    this.speed = 0;
    this.vy = 0;
    this.grounded = false;
    this.airTime = 0;
    this.drifting = false;
    this.driftCharge = 0;
    this.driftTier = 0;
    this.boostTime = 0;
    this.spinTime = 0;
    this.respawnTime = 1.1;
    this.events.push('fall');
  }

  /** Jumps the kart forward along the track (the Light Elf's Blink). */
  teleportAlong(track: Track, dist: number) {
    const target = this.s + dist;
    if (target >= track.length) this.crossLine(1);
    const lat = clamp(this.lateral, -ROAD_HALF + 2, ROAD_HALF - 2);
    track.pointAt(target, lat, this.pos);
    const smp = track.sampleAt(target);
    this.heading = Math.atan2(smp.tan.x, smp.tan.z);
    const proj = track.project(this.pos);
    this.trackIndex = proj.index;
    this.s = proj.s;
    this.lateral = proj.lateral;
    this.grounded = true;
    this.vy = 0;
    this.drifting = false;
  }

  /** Trades places on the road with another kart (the Pixie's Hex Swap). */
  swapWith(o: Kart) {
    const fields = ['heading', 'speed', 'vy', 'grounded', 'airTime', 'trackIndex', 's', 'lateral', 'lap'] as const;
    for (const f of fields) {
      const t = this[f];
      (this as any)[f] = o[f];
      (o as any)[f] = t;
    }
    const p = this.pos.clone();
    this.pos.copy(o.pos);
    o.pos.copy(p);
    this.drifting = o.drifting = false;
    this.driftCharge = o.driftCharge = 0;
    this.driftTier = o.driftTier = 0;
  }

  private crossLine(dir: number) {
    this.lap += dir;
    if (dir > 0 && this.lap >= 2) this.events.push('lap');
  }

  /** Updates the visible model from the simulation state. */
  syncModel(time: number) {
    const m = this.model;
    m.position.copy(this.pos);
    const targetYaw = this.drifting ? this.driftDir * -0.45 : 0;
    this.driftYaw = lerp(this.driftYaw, targetYaw, 0.15);
    m.rotation.y = this.heading + this.driftYaw + this.spinAngle;
    // Lean into turns, nose up in the air.
    this.body.rotation.z = -this.steerVisual * 0.06 * clamp(this.speed / 20, 0, 1) - (this.drifting ? this.driftDir * 0.08 : 0);
    // Grounded, pitch with the slope (vy is the climb rate); airborne, nose up then down.
    this.body.rotation.x = this.grounded ? -Math.atan2(this.vy, Math.max(6, Math.abs(this.speed))) : clamp(-this.vy * 0.03, -0.3, 0.3);
    const bob = this.grounded ? Math.sin(time * 30 + this.id) * 0.02 * clamp(this.speed / 10, 0, 1) : 0;
    this.body.position.y = bob;
    for (const w of this.wheels) w.rotation.x += this.speed * 0.03;
    for (const w of this.frontWheels) w.rotation.y = -this.steerVisual * 0.4;
    for (const b of this.blinkers) b.visible = Math.sin(time * 6) > 0;
    const blob = m.getObjectByName('blob')!;
    blob.position.y = this.groundY - this.pos.y + 0.06;
    this.shieldMesh.visible = this.shieldTime > 0;
    this.shieldMesh.rotation.y = time * 2;
    this.auraMesh.visible = this.activePower === 'rampage';
    if (this.auraMesh.visible) this.auraMesh.scale.setScalar(1 + Math.sin(time * 20) * 0.06);
    m.visible = !(this.activePower === 'blink' && this.powerActive > 0.15) && !(this.respawnTime > 0 && Math.sin(time * 40) > 0);
    this.shrinkScale = lerp(this.shrinkScale, this.shrinkTime > 0 ? 0.55 : 1, 0.15);
    this.body.scale.setScalar(this.shrinkScale);
    this.frostMesh.visible = this.chillTime > 0;
    const ghostly = this.activePower === 'phantom' || this.ghostTime > 0;
    if (ghostly !== this.ghostly) {
      this.ghostly = ghostly;
      for (const mat of this.ghostMats) {
        const orig = mat.userData as { transparent: boolean; opacity: number };
        mat.transparent = ghostly || orig.transparent;
        mat.opacity = ghostly ? 0.35 : orig.opacity;
        mat.needsUpdate = true;
      }
    }
  }
}
