/**
 * The sound library. Every effect is synthesized at play time from oscillators and
 * filtered noise, so there are no audio files.
 *
 * To add a sound, add an entry to SOUNDS and call `audio.play('myName', { pos })`
 * (or the `sfx(name, pos)` callback that ItemSystem/Hazards receive). Positional
 * playback, distance falloff, stereo panning and spam protection are handled by
 * AudioEngine.play, so a sound only describes what it sounds like.
 */

/** A one-shot sound: schedule tones/noise on the voice relative to `v.t0`. */
export type SoundFn = (v: Voice) => void;

/** A continuous sound whose gain AudioEngine.setLoop controls. `set` receives a 0..1-ish parameter. */
export interface LoopVoice {
  set(param: number): void;
  stop(when: number): void;
}
export type LoopFn = (ctx: AudioContext, out: AudioNode, noise: AudioBuffer) => LoopVoice;

/** Building blocks shared by one-shots and ambience events. `pitch` scales every frequency. */
export class Voice {
  readonly t0: number;
  constructor(
    readonly ctx: AudioContext,
    readonly out: AudioNode,
    private noiseBuf: AudioBuffer,
    readonly pitch = 1,
  ) {
    this.t0 = ctx.currentTime;
  }

  tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, when = 0, slideTo?: number, attack = 0.01) {
    const t = this.t0 + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq * this.pitch, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo * this.pitch, t + dur);
    const g = this.envelope(t, dur, vol, attack);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  }

  /** A tone with vibrato, for wails, ghosts and sirens. */
  wobble(freq: number, dur: number, type: OscillatorType, vol: number, when: number, rate: number, depth: number, slideTo?: number, attack = 0.02) {
    const osc = this.tone(freq, dur, type, vol, when, slideTo, attack);
    const t = this.t0 + when;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = rate;
    const lg = this.ctx.createGain();
    lg.gain.value = freq * this.pitch * depth;
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }

  noise(dur: number, vol: number, filterType: BiquadFilterType, freq: number, when = 0, freqTo?: number, q = 1, attack = 0) {
    const t = this.t0 + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq * this.pitch, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo * this.pitch, t + dur);
    src.connect(f).connect(this.envelope(t, dur, vol, attack));
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  /** Notes played one after another. */
  arp(freqs: number[], step: number, dur: number, type: OscillatorType, vol: number, when = 0) {
    freqs.forEach((f, i) => this.tone(f, dur, type, vol, when + i * step));
  }

  private envelope(t: number, dur: number, vol: number, attack: number) {
    const g = this.ctx.createGain();
    if (attack > 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
    } else g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
    g.connect(this.out);
    return g;
  }
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// ---------- shared pieces ----------

const shatter = (v: Voice, vol = 1) => {
  v.noise(0.18, 0.3 * vol, 'highpass', 3500, 0, 6000);
  for (let i = 0; i < 4; i++) v.tone(rnd(1800, 3600), 0.12, 'triangle', 0.08 * vol, i * 0.02);
};

const explosion = (v: Voice, size = 1) => {
  v.noise(0.7 * size, 0.6, 'lowpass', 2500, 0, 120);
  v.tone(90, 0.5 * size, 'sawtooth', 0.25, 0, 40);
  if (size > 1) v.noise(1.4, 0.35, 'lowpass', 400, 0.1, 50);
};

const shieldBlock = (v: Voice) => {
  v.tone(1500, 0.4, 'sine', 0.3);
  v.tone(2250, 0.3, 'sine', 0.2, 0.02);
};

const boost = (v: Voice) => {
  v.noise(0.6, 0.35, 'bandpass', 600, 0, 3000);
  v.tone(220, 0.5, 'sawtooth', 0.12, 0, 660);
};

export const SOUNDS: Record<string, SoundFn> = {
  // ----- menus & race flow -----
  menuMove: (v) => v.tone(700, 0.06, 'square', 0.1),
  menuSelect: (v) => {
    v.tone(523, 0.1, 'square', 0.15);
    v.tone(784, 0.15, 'square', 0.15, 0.08);
  },
  menuBack: (v) => {
    v.tone(659, 0.08, 'square', 0.13);
    v.tone(440, 0.12, 'square', 0.13, 0.07);
  },
  pause: (v) => v.arp([880, 660, 440], 0.05, 0.08, 'triangle', 0.15),
  unpause: (v) => v.arp([440, 660, 880], 0.05, 0.08, 'triangle', 0.15),
  countdown: (v) => v.tone(440, 0.25, 'square', 0.25),
  go: (v) => {
    v.tone(880, 0.6, 'square', 0.25);
    v.tone(1320, 0.5, 'triangle', 0.1, 0.02);
  },
  lap: (v) => v.arp([523, 659, 784], 0.1, 0.2, 'square', 0.18),
  finalLap: (v) => v.arp([392, 523, 659, 784, 1047], 0.09, 0.22, 'square', 0.18),
  win: (v) => v.arp([523, 659, 784, 1047, 784, 1047], 0.16, 0.3, 'square', 0.2),
  lose: (v) => v.arp([392, 349, 330, 262], 0.16, 0.3, 'square', 0.2),
  cheer: (v) => {
    // A crowd: lots of short vowel-ish noise bursts plus a few whistles.
    for (let i = 0; i < 40; i++) v.noise(rnd(0.15, 0.4), rnd(0.03, 0.08), 'bandpass', rnd(500, 1800), rnd(0, 2), undefined, 4, 0.05);
    v.noise(2.2, 0.12, 'bandpass', 1000, 0, 700, 0.6, 0.3);
    for (let i = 0; i < 3; i++) v.tone(rnd(1800, 2400), 0.35, 'sine', 0.08, rnd(0.1, 1.5), rnd(2600, 3200));
  },
  overtake: (v) => {
    v.tone(784, 0.08, 'triangle', 0.16);
    v.tone(1175, 0.14, 'triangle', 0.16, 0.06);
  },
  lostPlace: (v) => {
    v.tone(523, 0.08, 'triangle', 0.13);
    v.tone(392, 0.14, 'triangle', 0.13, 0.07);
  },
  wrongWay: (v) => {
    for (let i = 0; i < 3; i++) {
      v.tone(620, 0.12, 'square', 0.12, i * 0.3);
      v.tone(470, 0.12, 'square', 0.12, i * 0.3 + 0.14);
    }
  },
  powerReady: (v) => {
    v.tone(988, 0.12, 'triangle', 0.2);
    v.tone(1319, 0.25, 'triangle', 0.2, 0.1);
  },

  // ----- driving -----
  hop: (v) => {
    v.tone(500, 0.08, 'square', 0.1, 0, 800);
    v.tone(260, 0.12, 'sine', 0.15, 0, 520);
  },
  land: (v) => {
    v.tone(95, 0.18, 'sine', 0.45, 0, 45);
    v.noise(0.1, 0.22, 'lowpass', 700);
    v.tone(210, 0.15, 'sawtooth', 0.04, 0.03, 170);
  },
  tier1: (v) => {
    v.tone(1200, 0.15, 'triangle', 0.18);
    v.tone(1800, 0.15, 'triangle', 0.12, 0.06);
  },
  tier2: (v) => {
    v.tone(1600, 0.15, 'triangle', 0.18);
    v.tone(2400, 0.15, 'triangle', 0.12, 0.06);
    v.noise(0.2, 0.08, 'highpass', 5000, 0.04);
  },
  boost,
  startBoost: (v) => {
    boost(v);
    v.arp([523, 784, 1047, 1568], 0.04, 0.12, 'triangle', 0.14);
  },
  flood: (v) => {
    // Engine sputter: irregular coughs that die out.
    let t = 0;
    for (let i = 0; i < 7; i++) {
      v.noise(0.06, 0.3 - i * 0.03, 'lowpass', 600, t);
      v.tone(70, 0.07, 'square', 0.12 - i * 0.012, t, 40);
      t += rnd(0.08, 0.18);
    }
  },
  bump: (v) => {
    v.tone(110, 0.15, 'sine', 0.5, 0, 50);
    v.noise(0.08, 0.2, 'lowpass', 500);
  },
  spin: (v) => {
    for (let i = 0; i < 6; i++) v.tone(600 - i * 70, 0.1, 'square', 0.12, i * 0.07);
    v.noise(0.3, 0.3, 'lowpass', 1200);
  },
  /** A cartoon yelp. Pass `pitch` per character for a different voice. */
  ouch: (v) => {
    v.tone(520, 0.22, 'sawtooth', 0.07, 0.02, 300, 0.02);
    v.tone(780, 0.2, 'triangle', 0.06, 0.02, 450, 0.02);
  },
  /** A cheeky "hey-yah!" for hitting a rival. Pass `pitch` per character. */
  taunt: (v) => {
    v.wobble(440, 0.12, 'sawtooth', 0.06, 0, 12, 0.03, 520);
    v.wobble(660, 0.22, 'sawtooth', 0.07, 0.14, 8, 0.04, 880);
  },
  honk: (v) => {
    v.tone(392, 0.25, 'square', 0.1);
    v.tone(415, 0.25, 'square', 0.1);
  },

  // ----- item boxes & existing items -----
  pickup: (v) => {
    shatter(v);
    // Roulette ticks slowing down over ~1 s, then a ding when the item lands (Kart.rouletteTime is 1.1).
    let t = 0.08;
    let gap = 0.045;
    while (t < 1.0) {
      v.tone(rnd(900, 1400), 0.03, 'square', 0.06, t);
      t += gap;
      gap *= 1.12;
    }
    v.tone(1320, 0.18, 'triangle', 0.2, 1.1);
    v.tone(1760, 0.25, 'triangle', 0.15, 1.16);
  },
  boxBreak: (v) => shatter(v, 0.7),
  throw: (v) => {
    v.noise(0.25, 0.3, 'highpass', 2000, 0, 600);
    v.noise(0.5, 0.15, 'bandpass', 400, 0.05, 900, 2);
  },
  drop: (v) => v.tone(300, 0.15, 'triangle', 0.25, 0, 150),
  explosion: (v) => explosion(v),
  splat: (v) => {
    v.noise(0.35, 0.5, 'lowpass', 900, 0, 200);
    v.tone(160, 0.2, 'sine', 0.3, 0, 60);
  },
  ward: shieldBlock,
  wardUp: (v) => {
    v.arp([660, 880, 1100, 1320, 1760], 0.035, 0.3, 'sine', 0.1);
    v.noise(0.5, 0.08, 'highpass', 3000, 0, 8000, 1, 0.1);
  },
  potion: (v) => {
    // Gulp gulp gulp, then a fizz.
    for (let i = 0; i < 3; i++) v.tone(320, 0.07, 'sine', 0.25, i * 0.1, 170);
    v.noise(0.4, 0.1, 'highpass', 4000, 0.3, 9000);
  },
  oink: (v) => {
    v.tone(520, 0.12, 'sawtooth', 0.15, 0, 300);
    v.tone(480, 0.14, 'sawtooth', 0.15, 0.14, 260);
  },
  cluck: (v) => {
    for (let i = 0; i < 3; i++) v.tone(rnd(700, 950), 0.05, 'square', 0.07, i * 0.09, 500);
  },

  // ----- character powers -----
  'power:rampage': (v) => {
    v.tone(70, 0.9, 'sawtooth', 0.4, 0, 140);
    v.tone(73, 0.9, 'sawtooth', 0.3, 0, 120);
    v.noise(0.8, 0.25, 'lowpass', 400);
  },
  'power:blink': (v) => {
    for (let i = 0; i < 8; i++) v.tone(800 + i * 220, 0.12, 'sine', 0.15, i * 0.025);
    v.noise(0.35, 0.15, 'highpass', 4000);
  },
  'power:overclock': (v) => {
    for (let i = 0; i < 6; i++) v.tone(220 * Math.pow(1.26, i), 0.1, 'square', 0.14, i * 0.05);
  },
  'power:mudBomb': (v) => SOUNDS.throw(v),

  // ----- ready-made sounds for new items -----
  ghost: (v) => {
    v.wobble(500, 1.0, 'sine', 0.14, 0, 6, 0.06, 900, 0.3);
    v.wobble(750, 0.9, 'triangle', 0.06, 0.1, 5, 0.05, 1200, 0.3);
    v.noise(0.8, 0.12, 'bandpass', 400, 0, 1800, 3, 0.5);
  },
  steal: (v) => v.arp([1047, 880, 698, 587], 0.06, 0.08, 'triangle', 0.14),
  lightning: (v) => {
    v.noise(0.12, 0.6, 'highpass', 2500);
    v.tone(2400, 0.25, 'sawtooth', 0.18, 0, 80);
    v.noise(1.6, 0.5, 'lowpass', 300, 0.12, 40, 1, 0.05);
    v.tone(55, 1.2, 'sine', 0.3, 0.12, 30, 0.05);
  },
  thunder: (v) => {
    v.noise(2.2, 0.35, 'lowpass', 250, 0, 45, 1, 0.15);
    v.noise(0.3, 0.15, 'lowpass', 900, rnd(0.1, 0.4), 200);
  },
  shrink: (v) => {
    for (let i = 0; i < 6; i++) v.tone(1400 - i * 180, 0.08, 'square', 0.08, i * 0.06);
  },
  grow: (v) => {
    for (let i = 0; i < 6; i++) v.tone(500 + i * 180, 0.08, 'square', 0.08, i * 0.06);
  },
  squish: (v) => {
    v.tone(300, 0.15, 'sawtooth', 0.15, 0, 80);
    v.noise(0.15, 0.25, 'lowpass', 600, 0, 150);
  },
  shellLaunch: (v) => {
    v.tone(200, 0.4, 'square', 0.12, 0, 700);
    v.noise(0.4, 0.2, 'bandpass', 800, 0, 3000, 2);
  },
  /** Warning siren for a homing shell closing in on the leader. Play it repeatedly while it approaches. */
  shellAlarm: (v) => {
    for (let i = 0; i < 2; i++) {
      v.tone(1200, 0.12, 'square', 0.1, i * 0.25);
      v.tone(900, 0.12, 'square', 0.1, i * 0.25 + 0.12);
    }
  },
  bigExplosion: (v) => explosion(v, 1.8),
  fuse: (v) => v.noise(1.2, 0.12, 'highpass', 5000, 0, 3000),
  star: (v) => v.arp([784, 988, 1175, 1568, 1175, 1568, 1976, 2349], 0.07, 0.12, 'square', 0.1),
  bullet: (v) => {
    v.noise(1.2, 0.4, 'bandpass', 300, 0, 1200, 1.2, 0.05);
    v.tone(80, 1.2, 'sawtooth', 0.2, 0, 160, 0.05);
  },
  coin: (v) => {
    v.tone(988, 0.08, 'square', 0.12);
    v.tone(1319, 0.3, 'square', 0.12, 0.07);
  },
  freeze: (v) => {
    for (let i = 0; i < 6; i++) v.tone(rnd(2500, 4500), 0.3, 'sine', 0.07, i * 0.04);
    v.noise(0.4, 0.15, 'highpass', 6000);
  },
  tornado: (v) => v.noise(1.5, 0.3, 'bandpass', 300, 0, 1400, 4, 0.3),

  // ----- course features -----
  boing: (v) => v.wobble(220, 0.4, 'sine', 0.3, 0, 18, 0.15, 660),
  splash: (v) => {
    v.noise(0.5, 0.4, 'bandpass', 1500, 0, 400, 0.8);
    for (let i = 0; i < 5; i++) v.tone(rnd(900, 2000), 0.06, 'sine', 0.06, 0.05 + i * 0.05, rnd(2000, 3000));
  },
  creak: (v) => v.wobble(140, 0.8, 'sawtooth', 0.05, 0, 25, 0.2, 100, 0.1),
  sparkle: (v) => {
    for (let i = 0; i < 6; i++) v.tone([1568, 1760, 2093, 2349, 2637, 3136][i], 0.25, 'sine', 0.07, i * 0.04);
  },
  fall: (v) => {
    v.tone(1400, 1.2, 'sine', 0.12, 0, 200);
    v.noise(1.2, 0.1, 'bandpass', 1500, 0, 400, 2);
  },
  respawn: (v) => v.arp([523, 659, 784, 1047, 1319], 0.06, 0.2, 'sine', 0.13),
};

// ---------- loops ----------

function noiseSrc(ctx: AudioContext, buf: AudioBuffer) {
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  s.start(0, Math.random());
  return s;
}

export const LOOPS: Record<string, LoopFn> = {
  /** Tyre screech while drifting. `set(tier)` raises the pitch with drift tier. */
  drift: (ctx, out, buf) => {
    const src = noiseSrc(ctx, buf);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 5;
    f.frequency.value = 1700;
    const ng = ctx.createGain();
    ng.gain.value = 0.35;
    src.connect(f).connect(ng).connect(out);
    const squeal = ctx.createOscillator();
    squeal.type = 'sawtooth';
    squeal.frequency.value = 900;
    const sf = ctx.createBiquadFilter();
    sf.type = 'bandpass';
    sf.frequency.value = 1800;
    sf.Q.value = 2;
    const sg = ctx.createGain();
    sg.gain.value = 0.05;
    squeal.connect(sf).connect(sg).connect(out);
    squeal.start();
    return {
      set(tier) {
        const t = ctx.currentTime;
        f.frequency.setTargetAtTime(1700 + tier * 450, t, 0.1);
        squeal.frequency.setTargetAtTime(880 + tier * 220 + Math.random() * 30, t, 0.05);
      },
      stop(when) {
        src.stop(when);
        squeal.stop(when);
      },
    };
  },
  /** Grass/dirt rumble. `set(speedRatio)` opens the filter as you go faster. */
  offroad: (ctx, out, buf) => {
    const src = noiseSrc(ctx, buf);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const lg = ctx.createGain();
    lg.gain.value = 0.25;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    src.connect(f).connect(g).connect(out);
    return {
      set(x) {
        f.frequency.setTargetAtTime(180 + x * 400, ctx.currentTime, 0.1);
        lfo.frequency.setTargetAtTime(5 + x * 10, ctx.currentTime, 0.1);
      },
      stop(when) {
        src.stop(when);
        lfo.stop(when);
      },
    };
  },
  /** Jet roar under a boost. */
  boost: (ctx, out, buf) => {
    const src = noiseSrc(ctx, buf);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 800;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.value = 0.3;
    src.connect(f).connect(g).connect(out);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 110;
    const of = ctx.createBiquadFilter();
    of.type = 'lowpass';
    of.frequency.value = 500;
    const og = ctx.createGain();
    og.gain.value = 0.06;
    o.connect(of).connect(og).connect(out);
    o.start();
    return {
      set(x) {
        o.frequency.setTargetAtTime(100 + x * 40, ctx.currentTime, 0.1);
      },
      stop(when) {
        src.stop(when);
        o.stop(when);
      },
    };
  },
};

// ---------- ambience ----------

/** Helper for building an environment bed: steady filtered noise plus randomly timed events. */
export class Ambience {
  private nodes: AudioScheduledSourceNode[] = [];
  private timers: number[] = [];
  private gain: GainNode;

  constructor(
    private ctx: AudioContext,
    out: AudioNode,
    private buf: AudioBuffer,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.gain.gain.setTargetAtTime(1, ctx.currentTime, 0.8);
    this.gain.connect(out);
  }

  /** Filtered noise. `swell` (Hz) slowly modulates its volume, like wind or waves. */
  bed(type: BiquadFilterType, freq: number, vol: number, q = 1, swell = 0, swellDepth = 0.6) {
    const src = noiseSrc(this.ctx, this.buf);
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.gain);
    this.nodes.push(src);
    if (swell) {
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = swell;
      const lg = this.ctx.createGain();
      lg.gain.value = vol * swellDepth;
      lfo.connect(lg).connect(g.gain);
      const lf = this.ctx.createGain();
      lf.gain.value = freq * 0.4;
      lfo.connect(lf).connect(f.frequency);
      lfo.start();
      this.nodes.push(lfo);
    }
  }

  /** A sustained chord of sines with slow tremolo. */
  pad(freqs: number[], vol: number) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.2;
    const lg = this.ctx.createGain();
    lg.gain.value = vol * 0.5;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    this.nodes.push(lfo);
    g.connect(this.gain);
    for (const fr of freqs) {
      const o = this.ctx.createOscillator();
      o.frequency.value = fr;
      o.detune.value = (Math.random() - 0.5) * 12;
      o.connect(g);
      o.start();
      this.nodes.push(o);
    }
  }

  /** Plays `fn` every `min`..`max` seconds, panned randomly across the stereo field. */
  every(min: number, max: number, fn: SoundFn) {
    const loop = () => {
      const pan = this.ctx.createStereoPanner();
      pan.pan.value = rnd(-0.8, 0.8);
      pan.connect(this.gain);
      fn(new Voice(this.ctx, pan, this.buf, 1));
      this.timers.push(window.setTimeout(loop, rnd(min, max) * 1000));
    };
    this.timers.push(window.setTimeout(loop, rnd(min, max) * 500));
  }

  stop() {
    for (const id of this.timers) clearTimeout(id);
    const t = this.ctx.currentTime;
    this.gain.gain.setTargetAtTime(0, t, 0.3);
    for (const n of this.nodes) n.stop(t + 1.5);
  }
}

const birdChirp: SoundFn = (v) => {
  const base = rnd(2200, 3400);
  const n = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < n; i++) v.tone(base, 0.07, 'sine', 0.05, i * 0.1, base * rnd(1.2, 1.5));
};

/**
 * Background ambience per environment, started with `audio.setAmbience(id)`.
 * Course authors: pick one of these ids, or add your own entry.
 */
export const AMBIENCES: Record<string, (a: Ambience) => void> = {
  city: (a) => {
    a.bed('bandpass', 500, 0.05, 0.7, 0.07, 0.5); // market murmur
    a.every(10, 20, (v) => {
      // Church bell.
      for (const w of [0, 1.2]) {
        v.tone(660, 2.5, 'sine', 0.05, w);
        v.tone(1650, 1.5, 'sine', 0.02, w);
      }
    });
    a.every(5, 12, (v) => SOUNDS.cluck(v));
    a.every(4, 9, birdChirp);
  },
  forest: (a) => {
    a.bed('bandpass', 900, 0.05, 0.5, 0.09); // wind in leaves
    a.every(1.5, 4, birdChirp);
    a.every(8, 16, (v) => [0, 0.35].forEach((w) => v.tone(520, 0.25, 'sine', 0.05, w, 480, 0.05))); // cuckoo-ish
    a.every(6, 14, (v) => v.noise(0.12, 0.05, 'highpass', 2500, 0, 1200)); // twig snap
  },
  beach: (a) => {
    a.bed('lowpass', 700, 0.14, 0.7, 0.11, 0.85); // surf
    a.bed('highpass', 4000, 0.02, 0.7, 0.11, 0.85); // foam hiss
    a.every(4, 10, (v) => {
      for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) v.wobble(1300, 0.25, 'sawtooth', 0.025, i * 0.3, 14, 0.04, 850, 0.04); // gulls
    });
  },
  haunted: (a) => {
    a.bed('bandpass', 400, 0.08, 4, 0.06, 0.8); // howling wind
    a.every(8, 18, (v) => SOUNDS.creak(v));
    a.every(12, 25, (v) => SOUNDS.thunder(v));
    a.every(9, 20, (v) => [0, 0.5, 0.8].forEach((w) => v.tone(420, 0.35, 'sine', 0.05, w, 380, 0.08))); // owl
  },
  hauntedInterior: (a) => {
    a.bed('lowpass', 180, 0.08, 1, 0.05, 0.4); // room tone
    a.every(2, 6, (v) => {
      v.tone(1300, 0.06, 'sine', 0.06, 0, 2600);
      v.tone(1300, 0.06, 'sine', 0.02, 0.18, 2600); // drip + echo
    });
    a.every(6, 14, (v) => SOUNDS.creak(v));
    a.every(15, 30, (v) => v.wobble(300, 2, 'sine', 0.04, 0, 4, 0.08, 220, 0.6)); // distant moan
  },
  rainbow: (a) => {
    a.pad([261.6, 329.6, 392, 523.3], 0.012); // shimmering C major
    a.every(0.6, 2, (v) => v.tone([1047, 1175, 1319, 1568, 1760, 2093, 2349][Math.floor(Math.random() * 7)], 0.6, 'sine', 0.04));
    a.every(5, 10, (v) => SOUNDS.sparkle(v));
  },
};
