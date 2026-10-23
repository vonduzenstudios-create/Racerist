import { mulberry32 } from './rng';
import { AMBIENCES, Ambience, LOOPS, SOUNDS, Voice, type LoopVoice } from './sfx';

export interface PlayOptions {
  /** World position; omit for UI/player sounds that should play at full volume, centred. */
  pos?: { x: number; z: number };
  volume?: number;
  /** Frequency multiplier, e.g. per-character voice pitch. */
  pitch?: number;
}

/** Positional sounds beyond this distance (world units) are not played. */
const HEARING_RANGE = 70;

/**
 * All sound is synthesized with the Web Audio API: one-shot effects, a looping
 * engine voice for the player, looping drift/offroad/boost layers, per-course
 * ambience, and a sequenced medieval dance tune. The sounds themselves live in sfx.ts.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engine: { osc1: OscillatorNode; osc2: OscillatorNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private music: MusicSequencer | null = null;
  private ambienceBus!: GainNode;
  private ambience: Ambience | null = null;
  private ambienceId: string | null = null;
  private loops = new Map<string, { gain: GainNode; voice: LoopVoice }>();
  private listener: { x: number; z: number; rx: number; rz: number } | null = null;
  private lastPlayed = new Map<string, number>();
  private warned = new Set<string>();
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
    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.6;
    this.ambienceBus.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    return this.muted;
  }

  // ---------- sound effects ----------

  /**
   * Plays a sound from the SOUNDS library in sfx.ts. With `pos`, the sound is
   * attenuated and panned relative to the listener (see setListener) and skipped
   * entirely when it is too far away to hear.
   */
  play(name: string, opts: PlayOptions = {}) {
    const ctx = this.ctx;
    if (!ctx) return;
    const fn = SOUNDS[name];
    if (!fn) {
      if (!this.warned.has(name)) console.warn(`[audio] unknown sound "${name}"`);
      this.warned.add(name);
      return;
    }
    // The same sound fired several times in one frame (e.g. a pile-up) is played once.
    const now = ctx.currentTime;
    if (now - (this.lastPlayed.get(name) ?? -1) < 0.03) return;
    this.lastPlayed.set(name, now);

    let vol = opts.volume ?? 1;
    let pan = 0;
    if (opts.pos && this.listener) {
      const dx = opts.pos.x - this.listener.x;
      const dz = opts.pos.z - this.listener.z;
      const d = Math.hypot(dx, dz);
      if (d > HEARING_RANGE) return;
      vol *= Math.pow(1 - d / HEARING_RANGE, 1.6);
      if (d > 1) pan = Math.max(-0.85, Math.min(0.85, (dx * this.listener.rx + dz * this.listener.rz) / d));
    }
    const g = ctx.createGain();
    g.gain.value = vol;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p).connect(this.sfxBus);
    fn(new Voice(ctx, g, this.noiseBuf, opts.pitch ?? 1));
  }

  /** Where positional sounds are heard from. `heading` uses the kart convention (forward = sin, cos). */
  setListener(pos: { x: number; z: number }, heading: number) {
    // Right vector for the kart heading convention.
    this.listener = { x: pos.x, z: pos.z, rx: -Math.cos(heading), rz: Math.sin(heading) };
  }

  /** Fades a looping sound (see LOOPS in sfx.ts) to `level` (0 = silent). `param` is passed to the loop. */
  setLoop(name: string, level: number, param = 0) {
    const ctx = this.ctx;
    if (!ctx) return;
    let l = this.loops.get(name);
    if (!l) {
      if (level <= 0 || !LOOPS[name]) return;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(this.sfxBus);
      l = { gain, voice: LOOPS[name](ctx, gain, this.noiseBuf) };
      this.loops.set(name, l);
    }
    l.gain.gain.setTargetAtTime(Math.max(0, level), ctx.currentTime, 0.06);
    l.voice.set(param);
  }

  stopLoops() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const l of this.loops.values()) {
      l.gain.gain.setTargetAtTime(0, t, 0.05);
      l.voice.stop(t + 0.4);
    }
    this.loops.clear();
  }

  /** Starts the background bed for an environment from AMBIENCES in sfx.ts, or silences it with null. */
  setAmbience(id: string | null) {
    if (!this.ctx || id === this.ambienceId) return;
    this.ambience?.stop();
    this.ambience = null;
    this.ambienceId = id;
    const build = id ? AMBIENCES[id] : undefined;
    if (!build) return;
    this.ambience = new Ambience(this.ctx, this.ambienceBus, this.noiseBuf);
    build(this.ambience);
  }

  // Named shortcuts for the most common non-positional sounds.
  countdown(final: boolean) {
    this.play(final ? 'go' : 'countdown');
  }
  hop() {
    this.play('hop');
  }
  driftTier(tier: number) {
    this.play(tier === 1 ? 'tier1' : 'tier2');
  }
  boost() {
    this.play('boost');
  }
  bump() {
    this.play('bump');
  }
  spinOut() {
    this.play('spin');
  }
  shieldBlock() {
    this.play('ward');
  }
  lap() {
    this.play('lap');
  }
  finalLap() {
    this.play('finalLap');
  }
  finish(won: boolean) {
    this.play(won ? 'win' : 'lose');
    this.play('cheer', { volume: won ? 1 : 0.5 });
  }
  powerReady() {
    this.play('powerReady');
  }
  menuMove() {
    this.play('menuMove');
  }
  menuSelect() {
    this.play('menuSelect');
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
