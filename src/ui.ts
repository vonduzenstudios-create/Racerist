import type { CharacterDef } from './characters';
import type { CourseDef } from './courses/course';
import { ITEM_INFO } from './items';
import type { Kart } from './kart';
import { TOTAL_LAPS } from './kart';
import type { Track } from './track';

export const DIFFICULTIES = [
  { name: 'Squire', skill: 0.3, speed: 0.9 },
  { name: 'Knight', skill: 0.65, speed: 0.97 },
  { name: 'King', skill: 1, speed: 1.02 },
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

/** Small outline of a course's centreline for its select button. */
function courseThumb(course: CourseDef): HTMLCanvasElement {
  const c = el('canvas', 'thumb');
  c.width = c.height = 64;
  const pts = course.controlPoints;
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
  const scale = 52 / Math.max(maxX - minX, maxZ - minZ);
  const ctx = c.getContext('2d')!;
  ctx.lineWidth = 5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#f1e3c2';
  ctx.beginPath();
  pts.forEach(([x, z], i) => {
    const px = 32 + (x - (minX + maxX) / 2) * scale;
    const py = 32 + (z - (minZ + maxZ) / 2) * scale;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  });
  ctx.closePath();
  ctx.stroke();
  return c;
}

const ordinal = (n: number) => `${n}<sup>${['th', 'st', 'nd', 'rd'][n] ?? 'th'}</sup>`;

export class UI {
  readonly title = el('div', 'layer title');
  readonly select = el('div', 'layer select hidden');
  readonly hud = el('div', 'layer hud hidden');
  readonly panel = el('div', 'layer panel hidden');
  private cards: HTMLButtonElement[] = [];
  private pills: HTMLButtonElement[] = [];
  private courseBtns: HTMLButtonElement[] = [];
  private lapEl = el('div', 'lap');
  private timeEl = el('div', 'time');
  private placeEl = el('div', 'place');
  private itemSlot = el('div', 'slot');
  private powerBar = el('div', 'powerbar', '<span></span>');
  private powerName = el('div', 'powername');
  private centerEl = el('div', 'center');
  private wrongEl = el('div', 'wrongway hidden', 'WRONG WAY!');
  private toastEl = el('div', 'toast');
  private flashEl = el('div', 'flash');
  private minimap = el('canvas', 'minimap');
  private mapBase: HTMLCanvasElement | null = null;
  private mapXform = { x: 0, z: 0, scale: 1 };
  private centerTimer = 0;
  private toastTimer = 0;
  private panelButtons: { el: HTMLButtonElement; action: () => void }[] = [];
  private panelFocus = 0;
  readonly muteEl = el('div', 'mute', 'M: mute');

  constructor(root: HTMLElement) {
    this.title.innerHTML = `
      <div class="logo">RACERIST</div>
      <div class="subtitle">A kart race across the fantasy realms</div>
      <div class="subtitle blink">Click or press Enter to start</div>`;

    const tl = el('div', 'tl');
    tl.append(this.lapEl, this.timeEl);
    const slots = el('div', 'slots');
    const itemWrap = el('div');
    itemWrap.append(this.itemSlot, el('div', 'slot-label', 'ITEM · J'));
    const powerWrap = el('div', 'powerbox');
    powerWrap.append(this.powerName, this.powerBar, el('div', 'slot-label', 'POWER · K'));
    slots.append(itemWrap, powerWrap);
    this.minimap.width = 360;
    this.minimap.height = 360;
    this.hud.append(tl, slots, this.placeEl, this.minimap, this.centerEl, this.wrongEl, this.toastEl, this.flashEl);

    root.append(this.title, this.select, this.hud, this.panel, this.muteEl);
  }

  // ---------- character select ----------

  buildSelect(
    chars: CharacterDef[],
    courses: CourseDef[],
    onPick: (i: number) => void,
    onCourse: (i: number) => void,
    onDifficulty: (i: number) => void,
    onGo: () => void,
  ) {
    this.select.innerHTML = '';
    this.select.append(el('h2', '', 'Choose your racer'));
    const cards = el('div', 'cards interactive');
    const statRow = (label: string, v: number, color: string) =>
      `<div class="stat"><span>${label}</span><div class="bar"><span style="width:${v * 20}%;background:${color}"></span></div></div>`;
    chars.forEach((c, i) => {
      const card = el('button', 'card');
      card.innerHTML = `
        <h3 style="color:${c.color}">${c.name}</h3>
        <div class="tag">${c.tagline}</div>
        ${statRow('Speed', c.stats.speed, c.color)}
        ${statRow('Accel', c.stats.accel, c.color)}
        ${statRow('Handling', c.stats.handling, c.color)}
        ${statRow('Weight', c.stats.weight, c.color)}
        <div class="power"><b>${c.power.name}:</b> ${c.power.description}</div>`;
      card.addEventListener('click', () => onPick(i));
      card.addEventListener('dblclick', onGo);
      this.cards.push(card);
      cards.append(card);
    });
    const courseRow = el('div', 'courses interactive');
    courseRow.append(el('div', 'row-label', 'Course · ↑ ↓'));
    this.courseBtns = courses.map((c, i) => {
      const b = el('button', 'course', `<b>${c.name}</b><span>${c.tagline}</span>`);
      b.append(courseThumb(c));
      b.addEventListener('click', () => onCourse(i));
      b.addEventListener('dblclick', onGo);
      courseRow.append(b);
      return b;
    });
    const diff = el('div', 'difficulty interactive');
    DIFFICULTIES.forEach((d, i) => {
      const p = el('button', 'pill', d.name);
      p.addEventListener('click', () => onDifficulty(i));
      this.pills.push(p);
      diff.append(p);
    });
    const go = el('button', 'go interactive', 'RACE!');
    go.addEventListener('click', onGo);
    const help = el(
      'div',
      'help',
      'Arrows/WASD drive · Space/Shift hop &amp; drift (hold, steer) · J/X/Ctrl item · K power · R look back · Esc pause<br>Gamepad: A gas · B or X item · bumpers/triggers hop &amp; drift · Y power · stick back brake · stick click look back · Press gas as the "2" fades for a start boost',
    );
    this.select.append(cards, courseRow, diff, go, help);
  }

  setSelected(i: number, difficulty: number, course: number) {
    this.cards.forEach((c, k) => c.classList.toggle('active', k === i));
    this.courseBtns.forEach((b, k) => b.classList.toggle('active', k === course));
    this.pills.forEach((p, k) => p.classList.toggle('active', k === difficulty));
  }

  show(which: 'title' | 'select' | 'hud' | 'none') {
    this.title.classList.toggle('hidden', which !== 'title');
    this.select.classList.toggle('hidden', which !== 'select');
    this.hud.classList.toggle('hidden', which !== 'hud');
  }

  // ---------- HUD ----------

  buildMinimap(track: Track) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of track.samples) {
      minX = Math.min(minX, s.pos.x);
      maxX = Math.max(maxX, s.pos.x);
      minZ = Math.min(minZ, s.pos.z);
      maxZ = Math.max(maxZ, s.pos.z);
    }
    const size = 360;
    const pad = 30;
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    this.mapXform = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, scale };
    const base = document.createElement('canvas');
    base.width = base.height = size;
    const ctx = base.getContext('2d')!;
    const pt = (x: number, z: number): [number, number] => this.mapPoint(x, z);
    ctx.lineJoin = 'round';
    for (const [w, c] of [[26, 'rgba(0,0,0,0.55)'], [16, '#e8dcc0']] as const) {
      ctx.lineWidth = w;
      ctx.strokeStyle = c;
      ctx.beginPath();
      track.samples.forEach((s, i) => (i ? ctx.lineTo(...pt(s.pos.x, s.pos.z)) : ctx.moveTo(...pt(s.pos.x, s.pos.z))));
      ctx.closePath();
      ctx.stroke();
    }
    const start = track.samples[0];
    const [sx, sy] = pt(start.pos.x, start.pos.z);
    ctx.fillStyle = '#111';
    ctx.fillRect(sx - 9, sy - 4, 18, 8);
    this.mapBase = base;
  }

  private mapPoint(x: number, z: number): [number, number] {
    const m = this.mapXform;
    return [180 + (x - m.x) * m.scale, 180 + (z - m.z) * m.scale];
  }

  updateHud(player: Kart, karts: Kart[], raceTime: number, time: number) {
    const lap = Math.min(TOTAL_LAPS, Math.max(1, player.lap));
    this.lapEl.textContent = `LAP ${lap}/${TOTAL_LAPS}`;
    this.timeEl.textContent = formatTime(raceTime);
    this.placeEl.innerHTML = ordinal(player.place);
    if (player.item && player.rouletteTime > 0) {
      const ids = Object.keys(ITEM_INFO) as (keyof typeof ITEM_INFO)[];
      this.itemSlot.textContent = ITEM_INFO[ids[Math.floor(time * 14) % ids.length]].icon;
    } else {
      this.itemSlot.textContent = player.item ? ITEM_INFO[player.item].icon : '';
    }
    const charge = player.activePower ? Math.max(0, player.powerActive) / 5 : player.powerCharge;
    (this.powerBar.firstChild as HTMLElement).style.width = `${charge * 100}%`;
    this.powerBar.classList.toggle('full', player.powerCharge >= 1 && !player.activePower);
    this.powerName.textContent = player.def.power.name;

    const ctx = this.minimap.getContext('2d')!;
    ctx.clearRect(0, 0, 360, 360);
    if (this.mapBase) ctx.drawImage(this.mapBase, 0, 0);
    for (const k of [...karts].sort((a) => (a === player ? 1 : -1))) {
      const [x, y] = this.mapPoint(k.pos.x, k.pos.z);
      ctx.beginPath();
      ctx.arc(x, y, k === player ? 13 : 10, 0, Math.PI * 2);
      ctx.fillStyle = k.def.color;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = k === player ? '#fff' : '#000';
      ctx.stroke();
    }
  }

  setWrongWay(on: boolean) {
    this.wrongEl.classList.toggle('hidden', !on);
  }

  center(text: string, seconds: number) {
    this.centerEl.textContent = text;
    this.centerEl.classList.remove('pop');
    void this.centerEl.offsetWidth;
    this.centerEl.classList.add('pop');
    this.centerTimer = seconds;
  }

  /** Brief white-out, for the Thunder Scroll. */
  flash() {
    this.flashEl.classList.remove('on');
    void this.flashEl.offsetWidth;
    this.flashEl.classList.add('on');
  }

  toast(text: string, seconds = 2) {
    this.toastEl.textContent = text;
    this.toastTimer = seconds;
  }

  tick(dt: number) {
    if (this.centerTimer > 0) {
      this.centerTimer -= dt;
      if (this.centerTimer <= 0) this.centerEl.textContent = '';
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.toastEl.textContent = '';
    }
  }

  // ---------- panels ----------

  showPanel(html: string, buttons: { label: string; action: () => void }[]) {
    this.panel.innerHTML = '';
    const sheet = el('div', 'sheet', html);
    const row = el('div', 'buttons');
    this.panelButtons = buttons.map((b) => {
      const btn = el('button', '', b.label);
      btn.addEventListener('click', b.action);
      row.append(btn);
      return { el: btn, action: b.action };
    });
    sheet.append(row);
    this.panel.append(sheet);
    this.panel.classList.remove('hidden');
    this.focusPanel(0);
  }

  hidePanel() {
    this.panel.classList.add('hidden');
    this.panelButtons = [];
  }

  get panelOpen(): boolean {
    return this.panelButtons.length > 0;
  }

  focusPanel(i: number) {
    if (!this.panelButtons.length) return;
    this.panelFocus = (i + this.panelButtons.length) % this.panelButtons.length;
    this.panelButtons.forEach((b, k) => b.el.classList.toggle('focus', k === this.panelFocus));
  }

  movePanel(dir: number) {
    this.focusPanel(this.panelFocus + dir);
  }

  confirmPanel() {
    this.panelButtons[this.panelFocus]?.action();
  }

  showResults(rows: { name: string; color: string; time: string; me: boolean }[], onAgain: () => void, onMenu: () => void) {
    const table = rows
      .map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td>${i + 1}.</td><td style="color:${r.color}">■</td><td>${r.name}</td><td>${r.time}</td></tr>`)
      .join('');
    this.showPanel(`<h2>Race Results</h2><table>${table}</table>`, [
      { label: 'Race again', action: onAgain },
      { label: 'Change racer', action: onMenu },
    ]);
  }
}
