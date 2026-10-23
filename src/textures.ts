import * as THREE from 'three';
import { mulberry32 } from './rng';

// Every texture in the game is painted onto a canvas here at startup.

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function toTexture(c: HTMLCanvasElement, repeat = true): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = 8;
  return tex;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, rand: () => number, count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(rand() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1 + rand() * 2);
  }
}

/** Worn flagstone road with stone kerbs. U runs across the road, V along it. */
export function roadTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rand = mulberry32(11);
  ctx.fillStyle = '#5d554b';
  ctx.fillRect(0, 0, 256, 256);
  const rows = 8;
  for (let y = 0; y < rows; y++) {
    let x = 14;
    while (x < 242) {
      const w = Math.min(18 + rand() * 26, 242 - x);
      const s = 0.8 + rand() * 0.3;
      ctx.fillStyle = `rgb(${142 * s | 0},${132 * s | 0},${118 * s | 0})`;
      ctx.beginPath();
      ctx.roundRect(x + 1.5, y * 32 + 1.5, w - 3, 29, 5);
      ctx.fill();
      x += w;
    }
  }
  speckle(ctx, 256, 256, rand, 5000, 0.14);
  // Kerb stones, alternating light and dark like a race kerb.
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? '#d8d0bf' : '#8a2f22';
    ctx.fillRect(0, i * 32, 12, 32);
    ctx.fillRect(244, i * 32, 12, 32);
  }
  return toTexture(c);
}

/** Irregular cobblestones, used for sidewalks and the piazza floor. */
export function cobbleTexture(base = [176, 160, 140], seed = 5): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 256);
  const rand = mulberry32(seed);
  ctx.fillStyle = '#5c5246';
  ctx.fillRect(0, 0, 256, 256);
  const cell = 32;
  for (let y = 0; y < 256 / cell; y++) {
    for (let x = 0; x < 256 / cell; x++) {
      const off = y % 2 ? cell / 2 : 0;
      const cx = x * cell + off;
      const cy = y * cell;
      const shade = 0.75 + rand() * 0.35;
      ctx.fillStyle = `rgb(${base[0] * shade | 0},${base[1] * shade | 0},${base[2] * shade | 0})`;
      for (const dx of [0, -256]) {
        ctx.beginPath();
        ctx.roundRect(cx + dx + 2, cy + 2, cell - 4 + rand() * 2, cell - 4, 7);
        ctx.fill();
      }
    }
  }
  speckle(ctx, 256, 256, rand, 2500, 0.12);
  return toTexture(c);
}

/** A half-timbered plaster facade. Each texture tile is two floors by two bays. */
export function facadeTexture(plaster: string, timber: string, seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rand = mulberry32(seed);
  ctx.fillStyle = plaster;
  ctx.fillRect(0, 0, 128, 128);
  speckle(ctx, 128, 128, rand, 900, 0.08);
  ctx.fillStyle = timber;
  for (let f = 0; f < 2; f++) {
    const y = f * 64;
    ctx.fillRect(0, y, 128, 6);
    ctx.fillRect(0, y + 58, 128, 6);
    for (let b = 0; b < 2; b++) {
      const x = b * 64;
      ctx.fillRect(x, y, 6, 64);
      ctx.fillRect(x + 58, y, 6, 64);
      // Diagonal braces on one side of each bay.
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, 64, 64);
      ctx.clip();
      ctx.lineWidth = 5;
      ctx.strokeStyle = timber;
      ctx.beginPath();
      if ((b + f) % 2) {
        ctx.moveTo(x + 3, y + 61);
        ctx.lineTo(x + 18, y + 40);
      } else {
        ctx.moveTo(x + 61, y + 61);
        ctx.lineTo(x + 46, y + 40);
      }
      ctx.stroke();
      ctx.restore();
      // Small leaded window.
      const wx = x + 22;
      const wy = y + 16;
      ctx.fillStyle = timber;
      ctx.fillRect(wx - 3, wy - 3, 26, 30);
      ctx.fillStyle = rand() < 0.35 ? '#f6c66a' : '#2c3440';
      ctx.fillRect(wx, wy, 20, 24);
      ctx.fillStyle = 'rgba(20,16,12,0.8)';
      ctx.fillRect(wx + 9, wy, 2, 24);
      ctx.fillRect(wx, wy + 11, 20, 2);
      ctx.fillStyle = timber;
    }
  }
  return toTexture(c);
}

/** Rough castle stonework. */
export function stoneWallTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rand = mulberry32(21);
  ctx.fillStyle = '#4b4741';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 8; y++) {
    let x = y % 2 ? -10 : 0;
    while (x < 128) {
      const w = 20 + rand() * 14;
      const s = 0.8 + rand() * 0.3;
      ctx.fillStyle = `rgb(${150 * s | 0},${144 * s | 0},${132 * s | 0})`;
      ctx.fillRect(x + 1, y * 16 + 1, w - 2, 14);
      x += w;
    }
  }
  speckle(ctx, 128, 128, rand, 1200, 0.15);
  return toTexture(c);
}

export function roofTexture(r: number, g: number, b: number, seed: number): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const rand = mulberry32(seed);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const s = 0.8 + rand() * 0.3;
      ctx.fillStyle = `rgb(${r * s | 0},${g * s | 0},${b * s | 0})`;
      ctx.fillRect(x * 8, y * 8, 8, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(x * 8, y * 8 + 7, 8, 1);
    }
  }
  return toTexture(c);
}

export function checkerTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 32);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 8; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fafafa';
      ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  }
  const tex = toTexture(c);
  tex.magFilter = THREE.NearestFilter;
  return tex;
}

export function itemBoxTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  g.addColorStop(0, '#ff5f6d');
  g.addColorStop(0.35, '#ffc371');
  g.addColorStop(0.65, '#47e891');
  g.addColorStop(1, '#4facfe');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 120, 120);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 6;
  ctx.fillText('?', 64, 70);
  return toTexture(c, false);
}

/** Vertical sky gradient from the zenith (first stop) down to the horizon (last stop). */
export function skyTexture(stops: string[]): THREE.CanvasTexture {
  const [c, ctx] = canvas(4, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  // Stops bunch toward the horizon, which is where most of the visible sky is.
  const at = [0, 0.55, 0.8, 1];
  stops.forEach((col, i) => g.addColorStop(stops.length === 4 ? at[i] : i / (stops.length - 1), col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  return toTexture(c, false);
}

/** Soft round sprite used by every particle effect. */
export function glowTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return toTexture(c, false);
}

export function mudTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 128);
  const rand = mulberry32(77);
  for (let i = 0; i < 40; i++) {
    const r = 10 + rand() * 22;
    const a = rand() * Math.PI * 2;
    const d = rand() * 34;
    ctx.fillStyle = `rgba(${70 + rand() * 30 | 0},${45 + rand() * 15 | 0},${25},0.9)`;
    ctx.beginPath();
    ctx.arc(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(c, false);
}
