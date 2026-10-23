/**
 * Every kart is driven through this structure, whether by a person, the AI, or later
 * a network peer. Edge-triggered actions (item, power) are true for a single tick.
 */
export interface KartInput {
  throttle: number;
  brake: number;
  steer: number; // -1 left, +1 right
  drift: boolean;
  item: boolean;
  power: boolean;
  lookBack: boolean;
}

export const emptyInput = (): KartInput => ({
  throttle: 0,
  brake: 0,
  steer: 0,
  drift: false,
  item: false,
  power: false,
  lookBack: false,
});

/** Keyboard plus the first connected standard-mapping gamepad. */
export class PlayerInput {
  private keys = new Set<string>();
  private prevItem = false;
  private prevPower = false;
  private prevPause = false;
  private prevConfirm = false;
  pausePressed = false;
  confirmPressed = false;
  /** True when the current steer value came from a gamepad. */
  padSteer = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private key(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  private pad(): Gamepad | null {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Reads devices once per tick. */
  poll(): KartInput {
    const pad = this.pad();
    const btn = (i: number) => !!pad?.buttons[i]?.pressed;
    const btnValue = (i: number) => pad?.buttons[i]?.value ?? 0;

    let steer = (this.key('ArrowRight', 'KeyD') ? 1 : 0) - (this.key('ArrowLeft', 'KeyA') ? 1 : 0);
    this.padSteer = false;
    if (pad) {
      const ax = pad.axes[0] ?? 0;
      if (Math.abs(ax) > 0.15) steer = Math.sign(ax) * ((Math.abs(ax) - 0.15) / 0.85);
      if (btn(14)) steer = -1;
      if (btn(15)) steer = 1;
      this.padSteer = steer !== 0 && !this.key('ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD');
    }
    const throttle = Math.max(this.key('ArrowUp', 'KeyW') ? 1 : 0, btn(0) ? 1 : 0, btnValue(7));
    const brake = Math.max(this.key('ArrowDown', 'KeyS') ? 1 : 0, btn(2) ? 1 : 0, btnValue(6) > 0.5 ? 1 : 0);
    // Pad: A/RT accelerate, X/LT brake, RB/B drift, LB item, Y power, d-pad down looks back.
    const drift = this.key('Space', 'ShiftLeft', 'ShiftRight') || btn(5) || btn(1);
    const itemHeld = this.key('KeyJ', 'KeyX') || btn(4);
    const powerHeld = this.key('KeyK', 'KeyE') || btn(3);
    const pauseHeld = this.key('Escape', 'KeyP') || btn(9);
    // Keyboard Enter is handled with key events in Game, so confirm here is pad-only.
    const confirmHeld = btn(0);

    const input: KartInput = {
      throttle,
      brake,
      steer,
      drift,
      item: itemHeld && !this.prevItem,
      power: powerHeld && !this.prevPower,
      lookBack: this.key('KeyR', 'KeyQ') || btn(13),
    };
    this.pausePressed = pauseHeld && !this.prevPause;
    this.confirmPressed = confirmHeld && !this.prevConfirm;
    this.prevItem = itemHeld;
    this.prevPower = powerHeld;
    this.prevPause = pauseHeld;
    this.prevConfirm = confirmHeld;
    return input;
  }
}
