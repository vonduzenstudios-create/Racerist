import { mulberry32 } from './rng';

/**
 * All sound is synthesized with the Web Audio API: one-shot effects, a looping
 * engine voice for the player, and a sequenced medieval dance tune.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engine: { osc1: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private music: MusicSequencer | null = null;
  muted = false;

  /** Must be called from a user gesture so the browser lets audio start. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.7;
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // ---------- building blocks ----------

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number, bus?: AudioNode) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(bus ?? this.sfxBus);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, filterType: BiquadFilterType, freq: number, when = 0, freqTo?: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, t);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- sound effects ----------

  countdown(final: boolean) {
    this.tone(final ? 880 : 440, final ? 0.6 : 0.25, 'square', 0.25);
  }
  pickup() {
    [660, 830, 990, 1320].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.25, i * 0.05));
  }
  boost() {
    this.noise(0.6, 0.35, 'bandpass', 600, 0, 3000);
    this.tone(220, 0.5, 'sawtooth', 0.12, 0, 660);
  }
  throwItem() {
    this.noise(0.25, 0.3, 'highpass', 2000, 0, 600);
  }
  dropItem() {
    this.tone(300, 0.15, 'triangle', 0.25, 0, 150);
  }
  spinOut() {
    for (let i = 0; i < 6; i++) this.tone(600 - i * 70, 0.1, 'square', 0.12, i * 0.07);
    this.noise(0.3, 0.3, 'lowpass', 1200);
  }
  bump() {
    this.tone(110, 0.15, 'sine', 0.5, 0, 50);
    this.noise(0.08, 0.2, 'lowpass', 500);
  }
  hop() {
    this.tone(500, 0.08, 'square', 0.12, 0, 800);
  }
  driftTier(tier: number) {
    this.tone(tier === 1 ? 1200 : 1600, 0.15, 'triangle', 0.18);
    this.tone(tier === 1 ? 1800 : 2400, 0.15, 'triangle', 0.12, 0.06);
  }
  explosion() {
    this.noise(0.7, 0.6, 'lowpass', 2500, 0, 120);
    this.tone(90, 0.5, 'sawtooth', 0.25, 0, 40);
  }
  shieldBlock() {
    this.tone(1500, 0.4, 'sine', 0.3);
    this.tone(2250, 0.3, 'sine', 0.2, 0.02);
  }
  lap() {
    [523, 659, 784].forEach((f, i) => this.tone(f, 0.2, 'square', 0.18, i * 0.1));
  }
  finalLap() {
    [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'square', 0.18, i * 0.09));
  }
  finish(won: boolean) {
    const notes = won ? [523, 659, 784, 1047, 784, 1047] : [392, 349, 330, 262];
    notes.forEach((f, i) => this.tone(f, 0.3, 'square', 0.2, i * 0.16));
  }
  powerReady() {
    this.tone(988, 0.12, 'triangle', 0.2);
    this.tone(1319, 0.25, 'triangle', 0.2, 0.1);
  }
  power(id: string) {
    switch (id) {
      case 'rampage':
        this.tone(70, 0.9, 'sawtooth', 0.4, 0, 140);
        this.tone(73, 0.9, 'sawtooth', 0.3, 0, 120);
        this.noise(0.8, 0.25, 'lowpass', 400);
        break;
      case 'blink':
        for (let i = 0; i < 8; i++) this.tone(800 + i * 220, 0.12, 'sine', 0.15, i * 0.025);
        this.noise(0.35, 0.15, 'highpass', 4000);
        break;
      case 'overclock':
        for (let i = 0; i < 6; i++) this.tone(220 * Math.pow(1.26, i), 0.1, 'square', 0.14, i * 0.05);
        break;
      case 'mudBomb':
        this.throwItem();
        break;
    }
  }
  splat() {
    this.noise(0.35, 0.5, 'lowpass', 900, 0, 200);
    this.tone(160, 0.2, 'sine', 0.3, 0, 60);
  }
  oink() {
    this.tone(520, 0.12, 'sawtooth', 0.15, 0, 300);
    this.tone(480, 0.14, 'sawtooth', 0.15, 0.14, 260);
  }
  menuMove() {
    this.tone(700, 0.06, 'square', 0.1);
  }
  menuSelect() {
    this.tone(523, 0.1, 'square', 0.15);
    this.tone(784, 0.15, 'square', 0.15, 0.08);
  }

  // ---------- engine ----------

  startEngine() {
    const ctx = this.ctx;
    if (!ctx || this.engine) return;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(this.sfxBus);
    osc1.start();
    osc2.start();
    this.engine = { osc1, osc2, filter, gain };
  }

  /** speedRatio is 0..~1.4 relative to top speed. */
  updateEngine(speedRatio: number, throttle: number) {
    if (!this.ctx || !this.engine) return;
    const t = this.ctx.currentTime;
    const f = 45 + speedRatio * 95 + throttle * 12;
    this.engine.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(f * 0.501, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(400 + speedRatio * 1400, t, 0.05);
    this.engine.gain.gain.setTargetAtTime(0.045 + throttle * 0.035, t, 0.08);
  }

  stopEngine() {
    if (!this.engine || !this.ctx) return;
    const e = this.engine;
    e.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
    e.osc1.stop(this.ctx.currentTime + 0.5);
    e.osc2.stop(this.ctx.currentTime + 0.5);
    this.engine = null;
  }

  // ---------- music ----------

  playMusic(seed: number, tempo: number) {
    if (!this.ctx) return;
    this.stopMusic();
    this.music = new MusicSequencer(this.ctx, this.musicBus, this.noiseBuf, seed, tempo);
  }

  setMusicTempo(scale: number) {
    if (this.music) this.music.tempoScale = scale;
  }

  stopMusic() {
    this.music?.stop();
    this.music = null;
  }
}

// D Dorian, the go-to mode for a jaunty medieval dance.
const SCALE = [0, 2, 3, 5, 7, 9, 10];
const ROOT_MIDI = 62; // D4
// Chord per bar as a scale degree: i, VII, i, v, III, VII, IV, i
const PROGRESSION = [0, 6, 0, 4, 2, 6, 3, 0];

const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const degreeToMidi = (deg: number) => {
  const oct = Math.floor(deg / 7);
  const d = ((deg % 7) + 7) % 7;
  return ROOT_MIDI + oct * 12 + SCALE[d];
};

interface Note {
  deg: number;
  len: number; // in eighth-note steps
}

/**
 * A saltarello-style tune in 6/8: drone, plucked lute chords, a recorder-like lead,
 * and tabor drum. The melody is composed from a seed so it is the same each time.
 */
class MusicSequencer {
  tempoScale = 1;
  private step = 0;
  private nextTime: number;
  private timer: number;
  private melody: (Note | null)[] = [];
  private drone: OscillatorNode[] = [];
  private droneGain: GainNode;

  constructor(
    private ctx: AudioContext,
    private out: GainNode,
    private noiseBuf: AudioBuffer,
    seed: number,
    private eighth: number,
  ) {
    this.composeMelody(mulberry32(seed));
    this.nextTime = ctx.currentTime + 0.1;

    // Bagpipe-style drone on D and A.
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    this.droneGain.gain.setTargetAtTime(0.05, ctx.currentTime, 0.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    this.droneGain.connect(f).connect(out);
    for (const m of [38, 45, 50]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiToFreq(m);
      o.detune.value = (Math.random() - 0.5) * 8;
      o.connect(this.droneGain);
      o.start();
      this.drone.push(o);
    }
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    this.droneGain.gain.setTargetAtTime(0, t, 0.1);
    for (const o of this.drone) o.stop(t + 0.5);
  }

  /** Two eight-bar phrases (A and B) built from chord tones on the strong beats. */
  private composeMelody(rand: () => number) {
    const phrase = (variant: number): (Note | null)[] => {
      const steps: (Note | null)[] = [];
      let deg = 4 + variant * 2;
      for (let bar = 0; bar < 8; bar++) {
        const chord = PROGRESSION[bar];
        const chordTones = [chord, chord + 2, chord + 4, chord + 7];
        let s = 0;
        while (s < 6) {
          const strong = s === 0 || s === 3;
          if (strong) {
            // Land on the nearest chord tone to keep it consonant.
            deg = chordTones.reduce((best, t) => {
              const cand = t + 7 * Math.round((deg - t) / 7);
              return Math.abs(cand - deg) < Math.abs(best - deg) ? cand : best;
            }, chordTones[0] + 7);
          } else {
            deg += rand() < 0.5 ? 1 : -1;
            if (rand() < 0.2) deg += rand() < 0.5 ? 2 : -2;
          }
          deg = Math.max(2, Math.min(12, deg));
          const len = strong && rand() < 0.45 ? 2 : 1;
          steps.push({ deg, len });
          for (let k = 1; k < len; k++) steps.push(null);
          s += len;
        }
        // Phrase endings resolve on the tonic.
        if (bar === 7) steps.splice(steps.length - 6, 6, { deg: 7, len: 3 }, null, null, { deg: 7, len: 3 }, null, null);
      }
      return steps;
    };
    const a = phrase(0);
    const b = phrase(1);
    this.melody = [...a, ...a, ...b, ...a];
  }

  private schedule() {
    const lookahead = 0.12;
    while (this.nextTime < this.ctx.currentTime + lookahead) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += this.eighth / this.tempoScale;
      this.step++;
    }
  }

  private playStep(step: number, t: number) {
    const inBar = step % 6;
    const bar = Math.floor(step / 6) % 8;
    const chord = PROGRESSION[bar];
    const dur = this.eighth / this.tempoScale;

    // Tabor drum: BOOM . tak BOOM . tak
    if (inBar === 0 || inBar === 3) this.drum(t, 0.55, 90);
    if (inBar === 2 || inBar === 5) this.drum(t, 0.2, 180);
    this.jingle(t, inBar === 0 ? 0.08 : 0.035);

    // Lute: bass note on the beat, chord pluck on the off-beats.
    if (inBar === 0 || inBar === 3) this.pluck(midiToFreq(degreeToMidi(chord) - 24), t, dur * 2.5, 0.22);
    if (inBar === 1 || inBar === 2 || inBar === 4 || inBar === 5) {
      for (const k of [0, 2, 4]) this.pluck(midiToFreq(degreeToMidi(chord + k) - 12), t, dur * 0.9, 0.07);
    }

    const note = this.melody[step % this.melody.length];
    if (note) this.recorder(midiToFreq(degreeToMidi(note.deg)), t, dur * note.len * 0.95);
  }

  private pluck(freq: number, t: number, dur: number, vol: number) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 8, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private recorder(freq: number, t: number, dur: number) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = freq * 0.006;
    vib.connect(vibGain).connect(o.frequency);
    const breath = this.ctx.createBufferSource();
    breath.buffer = this.noiseBuf;
    const bf = this.ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = freq * 2;
    bf.Q.value = 3;
    const bg = this.ctx.createGain();
    bg.gain.value = 0.025;
    breath.connect(bf).connect(bg);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
    g.gain.setValueAtTime(0.13, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    bg.connect(g);
    g.connect(this.out);
    o.start(t);
    vib.start(t);
    breath.start(t, Math.random() * 0.5);
    o.stop(t + dur + 0.02);
    vib.stop(t + dur + 0.02);
    breath.stop(t + dur + 0.02);
  }

  private drum(t: number, vol: number, freq: number) {
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.8, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.3);
  }

  private jingle(t: number, vol: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + 0.1);
  }
}
