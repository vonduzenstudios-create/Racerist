import type { Hazards } from './hazards';
import { emptyInput, type KartInput } from './input';
import type { ItemSystem } from './items';
import type { Kart } from './kart';
import { clamp, wrapAngle } from './rng';
import { ROAD_HALF, type Track } from './track';

/** Drives a kart by chasing a point ahead on the racing line. */
export class AiDriver {
  private driftHeld = false;
  private itemHeldFor = 0;
  private powerHeldFor = 0;
  private wanderPhase: number;
  private input: KartInput = emptyInput();

  constructor(
    private kart: Kart,
    private lane: number,
    /** 0..1: how well it brakes, drifts and uses items. */
    private skill: number,
  ) {
    this.wanderPhase = kart.id * 1.7;
  }

  think(time: number, dt: number, track: Track, karts: Kart[], items: ItemSystem, hazards: Hazards): KartInput {
    const k = this.kart;
    const inp = this.input;
    inp.item = false;
    inp.power = false;
    inp.lookBack = false;

    // Pick a lateral target: own lane, cut toward the inside of bends, dodge obstacles.
    const bend = track.turnAhead(k.s, 35);
    let targetLat = this.lane + Math.sin(time * 0.4 + this.wanderPhase) * 1.5;
    targetLat += clamp(bend * 7, -6, 6);

    const avoid = (lat: number) => {
      if (Math.abs(lat - targetLat) < 3.5) targetLat = lat > 0 ? lat - 4.5 : lat + 4.5;
    };
    const obstacle = items.obstacleAhead(k, 30);
    if (obstacle) avoid(track.project(obstacle, k.trackIndex).lateral);
    if (this.skill > 0.3) {
      for (const p of hazards.near(k.s, 30)) avoid(track.project(p, k.trackIndex).lateral);
    }
    targetLat = clamp(targetLat, -ROAD_HALF + 1.5, ROAD_HALF - 1.5);

    const look = 9 + Math.max(0, k.speed) * 0.42;
    const target = track.pointAt(k.s + look, targetLat);
    const angle = wrapAngle(Math.atan2(target.x - k.pos.x, target.z - k.pos.z) - k.heading);
    // Heading decreases when turning right, so a target to the right is a negative angle.
    let steer = clamp(-angle * 2.6, -1, 1);

    // Drift through long bends when the skill allows it.
    const sharp = Math.abs(track.turnAhead(k.s + 5, 25));
    if (!this.driftHeld && k.grounded && k.speed > 16 && sharp > 0.55 && this.skill > 0.35) {
      this.driftHeld = true;
      steer = Math.sign(bend) || 1;
    } else if (this.driftHeld) {
      const still = Math.abs(track.turnAhead(k.s, 18)) > 0.18;
      const wrongWay = k.drifting && Math.sign(-angle) !== k.driftDir && Math.abs(angle) > 0.35;
      if (!still || wrongWay || k.speed < 10) this.driftHeld = false;
    }

    inp.steer = steer;
    inp.drift = this.driftHeld;
    inp.throttle = 1;
    inp.brake = Math.abs(angle) > 0.75 && k.speed > 16 ? 0.6 : 0;

    // Items.
    if (k.item && k.rouletteTime <= 0) {
      this.itemHeldFor += dt;
      const ready = this.itemHeldFor > 0.6 + (1 - this.skill) * 1.5;
      if (ready) {
        const ahead = karts.find((o) => o.place === k.place - 1);
        const behind = karts.find((o) => o.place === k.place + 1);
        const gap = (o: Kart | undefined) => (o ? Math.abs(o.progress - k.progress) : Infinity);
        let use = false;
        switch (k.item) {
          case 'potion':
            use = Math.abs(bend) < 0.35 || k.offroad;
            break;
          case 'ward':
            use = true;
            break;
          case 'cabbage':
            use = gap(behind) < 25 || this.itemHeldFor > 7;
            break;
          case 'fireball':
            use = gap(ahead) < 140 || this.itemHeldFor > 5;
            break;
        }
        if (use) {
          inp.item = true;
          this.itemHeldFor = 0;
        }
      }
    } else {
      this.itemHeldFor = 0;
    }

    // Special power.
    if (k.powerCharge >= 1 && !k.activePower) {
      this.powerHeldFor += dt;
      const ahead = karts.find((o) => o.place === k.place - 1);
      const gapAhead = ahead ? ahead.progress - k.progress : Infinity;
      const straight = Math.abs(track.turnAhead(k.s, 45)) < 0.3;
      let use = this.powerHeldFor > 8;
      switch (k.def.power.id) {
        case 'rampage':
          use ||= gapAhead < 25;
          break;
        case 'mudBomb':
          use ||= gapAhead < 45 && gapAhead > 8;
          break;
        case 'dragonBreath':
          use ||= gapAhead < 20 && gapAhead > 4;
          break;
        case 'frostNova':
          use ||= karts.filter((o) => o !== k && o.pos.distanceTo(k.pos) < 16).length >= 2 || gapAhead < 10;
          break;
        case 'hexSwap':
          use ||= gapAhead > 25 && gapAhead < 85;
          break;
        case 'phantom':
          use ||= gapAhead < 12 || !!obstacle;
          break;
        case 'blink':
        case 'overclock':
          use ||= straight && this.powerHeldFor > 1;
          break;
      }
      if (use) {
        inp.power = true;
        this.powerHeldFor = 0;
      }
    }
    return inp;
  }
}
