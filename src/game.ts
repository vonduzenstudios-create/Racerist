import * as THREE from 'three';
import { AiDriver } from './ai';
import { AudioEngine } from './audio';
import { CHARACTERS } from './characters';
import { Hazards } from './hazards';
import { emptyInput, PlayerInput, type KartInput } from './input';
import { ItemSystem } from './items';
import { Kart, TOTAL_LAPS } from './kart';
import { Particles } from './particles';
import { clamp, lerp, wrapAngle } from './rng';
import { skyTexture } from './textures';
import { Track } from './track';
import { DIFFICULTIES, formatTime, UI } from './ui';

type State = 'title' | 'select' | 'countdown' | 'race' | 'finished';

const STEP = 1 / 60;
const COUNTDOWN = 3.6;
const POWER_RECHARGE = 22; // seconds to fill the power meter
/** `?autopilot` lets the AI drive the player's kart, handy for testing and attract mode. */
const AUTOPILOT = new URLSearchParams(location.search).has('autopilot');

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(72, 1, 0.3, 2000);
  private sun: THREE.DirectionalLight;
  private track: Track;
  private particles: Particles;
  private items: ItemSystem;
  private hazards: Hazards;
  private audio = new AudioEngine();
  private input = new PlayerInput();
  private ui: UI;

  private state: State = 'title';
  private paused = false;
  private karts: Kart[] = [];
  private drivers = new Map<Kart, AiDriver>();
  private player: Kart | null = null;
  private previewKart: Kart | null = null;
  private selected = 0;
  private difficulty = 1;

  private time = 0;
  private raceTime = 0;
  private countdown = 0;
  private lastCount = 0;
  private throttleHeldAt = -1;
  private finishTimer = 0;
  private wrongWayTime = 0;
  private finishOrder: Kart[] = [];
  private camYaw = 0;
  private camPos = new THREE.Vector3();
  private shake = 0;
  private prevSteer = 0;
  private prevPlace = 0;
  private accumulator = 0;
  private lastFrame = performance.now();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(root: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.domElement.className = 'game';
    root.append(this.renderer.domElement);

    this.scene.background = skyTexture();
    this.scene.fog = new THREE.Fog(0xf2dcc0, 180, 750);
    this.scene.add(new THREE.HemisphereLight(0xd6ecff, 0x8a7a5a, 1.5));
    this.sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -70;
    sc.right = sc.top = 70;
    sc.near = 1;
    sc.far = 300;
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target);

    this.track = new Track();
    this.scene.add(this.track.group);
    this.particles = new Particles(this.scene);
    const sfx = (name: string, pos: THREE.Vector3) => this.positionalSfx(name, pos);
    this.items = new ItemSystem(this.scene, this.track, this.particles, sfx);
    this.hazards = new Hazards(this.scene, this.track, this.particles, sfx);

    this.ui = new UI(root);
    this.ui.buildMinimap(this.track);
    this.ui.buildSelect(
      CHARACTERS,
      (i) => this.pick(i),
      (d) => {
        this.difficulty = d;
        this.audio.menuMove();
        this.ui.setSelected(this.selected, this.difficulty);
      },
      () => this.startRace(),
    );
    this.ui.title.addEventListener('click', () => this.openSelect());
    window.addEventListener('keydown', (e) => {
      // Menu navigation listens to key events directly so quick taps are never missed.
      if (this.state === 'select' && !this.ui.panelOpen && !e.repeat) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.pick(this.selected - 1);
        if (e.code === 'ArrowRight' || e.code === 'KeyD') this.pick(this.selected + 1);
      }
      if (!e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
        if (this.state === 'title') this.openSelect();
        else if (this.state === 'select' && !this.ui.panelOpen) this.startRace();
        else if (this.ui.panelOpen) this.ui.confirmPanel();
      }
      if (e.code === 'KeyM') this.ui.muteEl.textContent = this.audio.toggleMute() ? 'M: unmute' : 'M: mute';
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.showPreview();
    requestAnimationFrame(() => this.frame());
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1 ? 90 : 72;
    this.camera.updateProjectionMatrix();
  }

  // ---------- menus ----------

  private openSelect() {
    this.audio.unlock();
    this.audio.menuSelect();
    this.audio.playMusic(7, 0.2);
    this.state = 'select';
    this.ui.show('select');
    this.ui.setSelected(this.selected, this.difficulty);
  }

  private pick(i: number) {
    this.selected = (i + CHARACTERS.length) % CHARACTERS.length;
    this.audio.menuMove();
    this.ui.setSelected(this.selected, this.difficulty);
    this.showPreview();
  }

  /** Parks the highlighted racer in front of the gatehouse for the menu camera. */
  private showPreview() {
    if (this.previewKart) this.scene.remove(this.previewKart.model);
    const k = new Kart(CHARACTERS[this.selected], 99, false);
    k.placeAt(this.track, 45, 0);
    this.scene.add(k.model);
    this.previewKart = k;
  }

  // ---------- race setup ----------

  private startRace() {
    this.audio.unlock();
    this.audio.menuSelect();
    for (const k of this.karts) this.scene.remove(k.model);
    if (this.previewKart) this.scene.remove(this.previewKart.model);
    this.previewKart = null;
    this.ui.hidePanel();
    this.karts = [];
    this.drivers.clear();
    this.finishOrder = [];

    // Player starts at the back of the grid, rivals in front.
    const order = [...CHARACTERS.keys()].filter((i) => i !== this.selected);
    order.push(this.selected);
    const diff = DIFFICULTIES[this.difficulty];
    order.forEach((ci, slot) => {
      const isPlayer = ci === this.selected;
      const k = new Kart(CHARACTERS[ci], slot, isPlayer);
      k.placeAt(this.track, this.track.length - 6 - slot * 5, slot % 2 ? 4.5 : -4.5);
      this.scene.add(k.model);
      this.karts.push(k);
      const lane = [-4, 3, 0, -2][slot];
      this.drivers.set(k, new AiDriver(k, lane, isPlayer ? 1 : diff.skill));
      if (isPlayer) this.player = k;
      else k.speedScale = diff.speed;
    });

    const p = this.player!;
    this.camYaw = p.heading;
    this.camPos.copy(p.pos).addScaledVector(p.forward(), -8).setY(4);
    this.raceTime = 0;
    this.countdown = COUNTDOWN;
    this.lastCount = 4;
    this.throttleHeldAt = -1;
    this.state = 'countdown';
    this.paused = false;
    this.ui.show('hud');
    this.ui.setWrongWay(false);
    this.prevPlace = 0;
    this.audio.stopMusic();
    this.audio.stopLoops();
    this.audio.startEngine();
    this.audio.setAmbience(this.track.ambience);
  }

  private finishRace() {
    this.state = 'finished';
    this.finishTimer = 3.5;
    const p = this.player!;
    this.ui.center(p.place === 1 ? 'VICTORY!' : 'FINISH!', 3);
    this.audio.finish(p.place === 1);
    this.audio.setMusicTempo(1);
  }

  private showResults() {
    // Karts still racing get a projected time from their average pace.
    const rows = [...this.karts]
      .sort((a, b) => a.place - b.place)
      .map((k) => {
        let t = k.finishTime;
        if (!k.finished) {
          const total = TOTAL_LAPS * this.track.length;
          const pace = Math.max(5, k.progress / Math.max(1, this.raceTime));
          t = this.raceTime + (total - k.progress) / pace;
        }
        return { name: k.def.name, color: k.def.color, time: formatTime(t), me: k.isPlayer };
      });
    this.ui.showResults(rows, () => this.startRace(), () => this.backToMenu());
  }

  private backToMenu() {
    for (const k of this.karts) this.scene.remove(k.model);
    this.karts = [];
    this.player = null;
    this.ui.hidePanel();
    this.audio.stopEngine();
    this.audio.stopLoops();
    this.audio.setAmbience(null);
    this.audio.play('menuBack');
    this.audio.playMusic(7, 0.2);
    this.state = 'select';
    this.paused = false;
    this.ui.show('select');
    this.ui.setSelected(this.selected, this.difficulty);
    this.showPreview();
  }

  private togglePause() {
    if (this.state !== 'race' && this.state !== 'countdown') return;
    this.paused = !this.paused;
    this.audio.play(this.paused ? 'pause' : 'unpause');
    if (this.paused) {
      this.ui.showPanel('<h2>Paused</h2>', [
        { label: 'Resume', action: () => this.togglePause() },
        { label: 'Restart', action: () => this.startRace() },
        { label: 'Quit', action: () => this.backToMenu() },
      ]);
    } else {
      this.ui.hidePanel();
    }
  }

  // ---------- main loop ----------

  private frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;

    const input = this.input.poll();
    this.handleMenus(input);

    if (!this.paused && (this.state === 'countdown' || this.state === 'race' || this.state === 'finished')) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= STEP && steps < 5) {
        this.simulate(STEP, input);
        // Edge-triggered actions only count on the first sub-step.
        input.item = input.power = false;
        this.accumulator -= STEP;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;
    }

    this.particles.update(this.paused ? 0 : dt);
    this.ui.tick(dt);
    for (const k of this.karts) k.syncModel(this.time);
    this.updateCamera(dt, input);
    if (this.player) {
      this.ui.updateHud(this.player, this.karts, this.raceTime, this.time);
      const ratio = Math.max(0, this.player.speed) / this.player.topSpeed;
      this.audio.updateEngine(this.paused ? 0 : ratio, this.paused ? 0 : input.throttle);
      this.updateLoops(this.player, ratio);
    }
    this.renderer.render(this.scene, this.camera);
  }

  /** Listener position and the continuous drift / offroad / boost layers for the player. */
  private updateLoops(p: Kart, ratio: number) {
    this.audio.setListener(p.pos, p.heading);
    const on = !this.paused && this.state !== 'countdown';
    this.audio.setLoop('drift', on && p.drifting && p.grounded ? 0.5 + p.driftTier * 0.2 : 0, p.driftTier);
    this.audio.setLoop('offroad', on && p.offroad && p.grounded && p.speed > 4 ? 0.5 * Math.min(1, ratio + 0.3) : 0, ratio);
    this.audio.setLoop('boost', on && (p.boostTime > 0 || p.activePower === 'overclock') ? 0.45 : 0, ratio);
  }

  private handleMenus(input: KartInput) {
    const steerEdge = Math.abs(input.steer) > 0.6 && Math.abs(this.prevSteer) <= 0.6 ? Math.sign(input.steer) : 0;
    this.prevSteer = input.steer;
    if (this.ui.panelOpen) {
      if (steerEdge) this.ui.movePanel(steerEdge);
      if (this.input.confirmPressed) this.ui.confirmPanel();
      else if (this.input.pausePressed && this.paused) this.togglePause();
      return;
    }
    // Keyboard Enter is handled by the keydown listener; this covers the gamepad.
    if (this.state === 'title' && this.input.confirmPressed) this.openSelect();
    else if (this.state === 'select') {
      if (steerEdge && this.input.padSteer) this.pick(this.selected + steerEdge);
      if (this.input.confirmPressed) this.startRace();
      if (input.item) {
        this.difficulty = (this.difficulty + 1) % DIFFICULTIES.length;
        this.ui.setSelected(this.selected, this.difficulty);
      }
    } else if (this.input.pausePressed) this.togglePause();
  }

  private simulate(dt: number, playerInput: KartInput) {
    const racing = this.state !== 'countdown';
    if (this.state === 'countdown') this.updateCountdown(dt, playerInput);
    else this.raceTime += this.state === 'race' ? dt : 0;
    if (this.state === 'finished') {
      this.raceTime += dt;
      this.finishTimer -= dt;
      if (this.finishTimer <= 0 && !this.ui.panelOpen) this.showResults();
    }

    for (const k of this.karts) {
      let inp: KartInput;
      if (k.isPlayer && !k.finished && !AUTOPILOT) inp = playerInput;
      else if (racing) inp = this.drivers.get(k)!.think(this.time, dt, this.track, this.karts, this.items, this.hazards);
      else inp = emptyInput();

      if (k.finished && !k.isPlayer) inp.item = inp.power = false;
      if (inp.item) this.items.use(k, this.karts);
      if (inp.power && racing && k.powerCharge >= 1 && !k.activePower) this.activatePower(k);
      if (racing && !k.activePower && k.powerCharge < 1) {
        k.powerCharge = Math.min(1, k.powerCharge + dt / POWER_RECHARGE);
        if (k.powerCharge >= 1 && k.isPlayer) {
          this.audio.powerReady();
          this.ui.toast(`${k.def.power.name} ready! Press K`);
        }
      }
      k.step(dt, inp, this.track, racing && !(k.isPlayer && this.stallTime > 0));
      this.kartEffects(k, dt);
    }
    if (this.stallTime > 0) this.stallTime -= dt;

    this.collideKarts();
    this.items.update(dt, this.time, this.karts);
    this.hazards.update(dt, this.time, this.karts);
    this.updatePlaces();
    this.drainEvents();
    this.updateRubberBand();

    const p = this.player!;
    const smp = this.track.samples[p.trackIndex];
    const backwards = Math.sin(p.heading) * smp.tan.x + Math.cos(p.heading) * smp.tan.z < -0.3;
    this.wrongWayTime = backwards && p.speed > 2 && this.state === 'race' ? this.wrongWayTime + dt : 0;
    const wrongWay = this.wrongWayTime > 1;
    if (wrongWay && this.wrongWayTime - dt <= 1) this.audio.play('wrongWay');
    this.ui.setWrongWay(wrongWay);
  }

  private stallTime = 0;

  private updateCountdown(dt: number, input: KartInput) {
    this.countdown -= dt;
    // Start boost: press the gas when "2" disappears. Too early and the engine floods.
    if (input.throttle > 0.5) {
      if (this.throttleHeldAt < 0) this.throttleHeldAt = this.countdown;
    } else this.throttleHeldAt = -1;

    const n = Math.ceil(this.countdown - 0.6);
    if (n !== this.lastCount && n >= 1 && n <= 3) {
      this.lastCount = n;
      this.ui.center(String(n), 1);
      this.audio.countdown(false);
    }
    if (this.countdown <= 0.6 && this.lastCount !== 0) {
      this.lastCount = 0;
      this.ui.center('GO!', 1);
      this.audio.countdown(true);
      this.audio.playMusic(1234, 0.155);
      this.state = 'race';
      const held = this.throttleHeldAt;
      if (held > 0 && held <= 1.75 && held >= 0.7) {
        this.player!.boost(1.3);
        this.audio.play('startBoost');
      } else if (held > 2.2) {
        this.stallTime = 0.8;
        this.audio.play('flood');
        this.ui.toast('Flooded the engine!', 1.5);
      }
      for (const k of this.karts) {
        if (!k.isPlayer && Math.random() < DIFFICULTIES[this.difficulty].skill * 0.7) k.boost(1.1);
      }
    }
  }

  private activatePower(k: Kart) {
    k.powerCharge = 0;
    const id = k.def.power.id;
    this.positionalSfx(`power:${id}`, k.pos);
    switch (id) {
      case 'rampage':
        k.activePower = 'rampage';
        k.powerActive = 5;
        break;
      case 'overclock':
        k.activePower = 'overclock';
        k.powerActive = 4;
        break;
      case 'blink': {
        const from = k.pos.clone().setY(k.pos.y + 1);
        this.particles.burst(from, 0xfff6c8, 40, 10, { life: 0.6, size: 0.8 });
        k.teleportAlong(this.track, 35);
        k.activePower = 'blink';
        k.powerActive = 0.4;
        this.particles.burst(k.pos.clone().setY(k.pos.y + 1), 0xfff6c8, 40, 10, { life: 0.6, size: 0.8 });
        break;
      }
      case 'mudBomb':
        this.items.throwMud(k);
        break;
    }
    if (k.isPlayer) this.ui.toast(k.def.power.name.toUpperCase() + '!', 1.2);
  }

  private kartEffects(k: Kart, dt: number) {
    if (Math.random() > dt * 40) return;
    const back = k.forward(this.tmp).multiplyScalar(-1.5);
    const right = k.right(this.tmp2);
    const base = k.pos.clone().add(back);
    if (k.drifting && k.grounded) {
      const color = k.driftTier === 2 ? 0xff8a1a : k.driftTier === 1 ? 0x4fc3ff : 0xfff4d0;
      for (const side of [-1, 1]) {
        const p = base.clone().addScaledVector(right, side * 0.9).setY(k.pos.y + 0.3);
        this.particles.emit(p, new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3), color, {
          life: 0.3,
          size: k.driftTier ? 0.55 : 0.3,
          gravity: 10,
        });
      }
    }
    if (k.boostTime > 0 || k.activePower === 'overclock') {
      const color = k.activePower === 'overclock' ? 0x41f0ff : 0xff9a2a;
      const p = base.clone().setY(k.pos.y + 0.6);
      this.particles.emit(p, k.forward(this.tmp).multiplyScalar(-6), color, { life: 0.25, size: 0.9, grow: -0.7 });
    }
    if (k.activePower === 'rampage') {
      this.particles.emit(k.pos.clone().setY(k.pos.y + 1.5), new THREE.Vector3(0, 3, 0), 0xff3020, { life: 0.4, size: 0.8 });
    }
    if (k.offroad && k.speed > 8 && k.grounded) {
      this.particles.emit(base.clone().setY(0.4), new THREE.Vector3(0, 1.5, 0), 0xb89a70, { life: 0.6, size: 0.7, grow: 1, additive: false });
    }
    if (k.spinTime > 0) {
      this.particles.emit(k.pos.clone().setY(2.6), new THREE.Vector3((Math.random() - 0.5) * 2, 1, (Math.random() - 0.5) * 2), 0xffee66, { life: 0.4, size: 0.4 });
    }
  }

  private collideKarts() {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i];
        const b = ks[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const r = 2.4;
        if (d2 >= r * r || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
        const d = Math.sqrt(d2) || 0.01;
        const nx = dx / d;
        const nz = dz / d;
        const overlap = r - d;
        const total = a.weight + b.weight;
        const pushA = (overlap * b.weight) / total;
        const pushB = (overlap * a.weight) / total;
        a.pos.x -= nx * pushA * 1.2;
        a.pos.z -= nz * pushA * 1.2;
        b.pos.x += nx * pushB * 1.2;
        b.pos.z += nz * pushB * 1.2;
        if (a.activePower === 'rampage' && b.activePower !== 'rampage') b.hit();
        else if (b.activePower === 'rampage' && a.activePower !== 'rampage') a.hit();
        else {
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 3 || overlap > 0.3) {
            a.events.push('bump');
            b.events.push('bump');
          }
          // Lighter karts lose a little more speed.
          a.speed *= 1 - 0.06 * (b.weight / total);
          b.speed *= 1 - 0.06 * (a.weight / total);
        }
      }
    }
  }

  private updatePlaces() {
    for (const k of this.karts) {
      if (!k.finished && k.lap > TOTAL_LAPS) {
        k.finished = true;
        k.finishTime = this.raceTime;
        this.finishOrder.push(k);
        if (k.isPlayer) this.finishRace();
      }
    }
    const running = this.karts.filter((k) => !k.finished).sort((a, b) => b.progress - a.progress);
    [...this.finishOrder, ...running].forEach((k, i) => (k.place = i + 1));
    const p = this.player;
    if (p && this.state === 'race' && this.prevPlace && p.place !== this.prevPlace) {
      this.audio.play(p.place < this.prevPlace ? 'overtake' : 'lostPlace');
    }
    this.prevPlace = p?.place ?? 0;
  }

  private updateRubberBand() {
    const p = this.player!;
    const base = DIFFICULTIES[this.difficulty].speed;
    for (const k of this.karts) {
      if (k.isPlayer) continue;
      const gap = k.progress - p.progress;
      k.speedScale = base * (gap < -60 ? 1.08 : gap > 80 ? 0.93 : 1);
    }
  }

  private drainEvents() {
    for (const k of this.karts) {
      for (const e of k.events) {
        if (k.isPlayer) {
          switch (e) {
            case 'hop':
              this.audio.hop();
              break;
            case 'tier1':
            case 'tier2':
              this.audio.driftTier(e === 'tier1' ? 1 : 2);
              break;
            case 'boost':
              this.audio.boost();
              break;
            case 'bump':
              this.audio.bump();
              this.shake = 0.25;
              break;
            case 'spin':
              this.audio.spinOut();
              this.audio.play('ouch', { pitch: 1.5 - k.weight * 0.5 });
              this.shake = 0.4;
              break;
            case 'blocked':
              this.audio.shieldBlock();
              break;
            case 'land':
              this.audio.bump();
              this.shake = 0.15;
              break;
            case 'lap':
              if (k.lap === TOTAL_LAPS) {
                this.audio.finalLap();
                this.ui.center('FINAL LAP!', 2);
                this.audio.setMusicTempo(1.15);
              } else if (k.lap < TOTAL_LAPS) {
                this.audio.lap();
                this.ui.center(`LAP ${k.lap}`, 1.5);
              }
              break;
          }
        } else if (e === 'spin' || e === 'blocked') {
          this.positionalSfx(e === 'spin' ? 'spin' : 'ward', k.pos);
        }
      }
      k.events.length = 0;
    }
  }

  /** Plays a sound if it happened near the player, so distant AI chaos stays quiet. */
  private positionalSfx(name: string, pos: THREE.Vector3) {
    this.audio.play(name, { pos });
  }


  private updateCamera(dt: number, input: KartInput) {
    const cam = this.camera;
    if (this.state === 'title' || this.state === 'select') {
      // Slow orbit around the preview kart in front of the gatehouse.
      const k = this.previewKart;
      if (!k) return;
      const a = this.time * 0.35;
      cam.position.set(k.pos.x + Math.sin(a) * 9, 3.6, k.pos.z + Math.cos(a) * 9);
      cam.lookAt(k.pos.x, 1.6, k.pos.z);
      k.model.rotation.y = k.heading;
      this.sun.position.set(k.pos.x + 60, 120, k.pos.z + 40);
      this.sun.target.position.copy(k.pos);
      cam.fov = lerp(cam.fov, 60, 0.1);
      cam.updateProjectionMatrix();
      return;
    }
    const p = this.player;
    if (!p) return;
    // Lag the camera yaw behind the kart so drifts read as a slide.
    this.camYaw += wrapAngle(p.heading - this.camYaw) * (1 - Math.exp(-(p.drifting ? 3.5 : 6) * dt));
    const back = input.lookBack ? -1 : 1;
    const fwd = this.tmp.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const desired = this.tmp2.copy(p.pos).addScaledVector(fwd, -7.5 * back);
    desired.y = p.pos.y * 0.6 + 3.3;
    if (input.lookBack) this.camPos.copy(desired);
    else this.camPos.lerp(desired, 1 - Math.exp(-12 * dt));
    cam.position.copy(this.camPos);
    if (this.shake > 0) {
      this.shake -= dt;
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
    }
    cam.lookAt(p.pos.x + fwd.x * 4 * back, p.pos.y + 1.4, p.pos.z + fwd.z * 4 * back);
    const speedFov = (window.innerWidth / window.innerHeight < 1 ? 90 : 72) + clamp(p.speed / p.topSpeed, 0, 1.4) * 8 + (p.boostTime > 0 ? 6 : 0);
    cam.fov = lerp(cam.fov, speedFov, 1 - Math.exp(-4 * dt));
    cam.updateProjectionMatrix();
    this.sun.position.set(p.pos.x + 60, 120, p.pos.z + 40);
    this.sun.target.position.copy(p.pos);
  }
}
