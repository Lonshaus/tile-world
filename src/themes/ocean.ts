// 海底主題：海藻林、白沙地、洋流、珊瑚礁、沉船區
import { Terrain } from '../game';
import type { DecorPiece, Rand, Theme } from './types';
import { ball, jitter, pick, place } from './util';

function kelp(rand: Rand, x: number, z: number): DecorPiece[] {
  const out: DecorPiece[] = [];
  const n = 4 + Math.floor(rand() * 3);
  const color = pick(rand, ['#4f7f4a', '#5f8a3f', '#6f8a3a']);
  let px = x;
  let pz = z;
  for (let i = 0; i < n; i++) {
    out.push(ball(px, i * 0.045, pz, 0.022, color, 1.3));
    px += jitter(rand, 0.012);
    pz += jitter(rand, 0.012);
  }
  return out;
}

function coral(rand: Rand, x: number, z: number): DecorPiece[] {
  const color = pick(rand, ['#e07f6f', '#e8a14f', '#b46fa8', '#f0c060', '#e86f8a']);
  if (rand() < 0.4) return [ball(x, 0, z, 0.045, color, 0.75)]; // 腦珊瑚
  const out: DecorPiece[] = [];
  for (let i = 0; i < 4; i++) {
    out.push({
      shape: 'cone', x: x + jitter(rand, 0.02), y: 0, z: z + jitter(rand, 0.02),
      sx: 0.014, sy: 0.07 + rand() * 0.05, sz: 0.014, color,
      rotX: jitter(rand, 0.5), rotZ: jitter(rand, 0.5),
    });
  }
  return out;
}

function shipwreck(rand: Rand): DecorPiece[] {
  return [
    { shape: 'box', x: 0, y: -0.01, z: 0, sx: 0.24, sy: 0.07, sz: 0.09, color: '#6a4f3a', rotZ: 0.25, rotX: 0.15 },
    { shape: 'cylinder', x: 0.02, y: 0.04, z: 0, sx: 0.009, sy: 0.16, sz: 0.009, color: '#5a4230', rotZ: -0.5 },
    ball(-0.12, 0, 0.06, 0.03, '#7d7a72', 0.7),
    ball(0.12, 0, -0.06, 0.025, '#857f75', 0.7),
    ...(rand() < 0.5 ? [ball(0.06, 0.06, 0.04, 0.015, '#e0c070')] : []),
  ];
}

export const ocean: Theme = {
  id: 'ocean',
  nameKey: 'theme.ocean',
  accent: '#5f8fae',
  sky: ['#3f7fa3', '#a9d3dc'],
  terrain: ['#4f7f5f', '#d8c9a0', '#4f8fb6', '#d98f7f', '#7d7a72'],
  heights: [0.05, 0.03, 0.015, 0.06, 0.07],
  base: '#a77b4f',
  glyphs: ['kelp', 'shell', 'wave', 'coral', 'anchor'],
  ambient: { fish: true, eras: ['submarine'] },
  decor(terrain, rand) {
    switch (terrain) {
      case Terrain.Green: {
        const out: DecorPiece[] = [];
        const n = 2 + Math.floor(rand() * 2);
        for (let i = 0; i < n; i++) out.push(...kelp(rand, jitter(rand, 0.13), jitter(rand, 0.13)));
        return out;
      }
      case Terrain.Open: {
        const out: DecorPiece[] = [];
        const n = Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) {
          out.push(ball(jitter(rand, 0.14), 0, jitter(rand, 0.14), 0.016, pick(rand, ['#f4ece0', '#f0c8c0', '#e8d8b0']), 0.5));
        }
        if (rand() < 0.35) {
          out.push({ shape: 'cone', x: jitter(rand, 0.1), y: 0, z: jitter(rand, 0.1), sx: 0.035, sy: 0.008, sz: 0.035, color: '#e8803a', segments: 5 });
        }
        return out;
      }
      case Terrain.Water: {
        const out: DecorPiece[] = [];
        const n = Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) out.push(ball(jitter(rand, 0.12), 0.05 + rand() * 0.1, jitter(rand, 0.12), 0.01 + rand() * 0.008, '#e8f4f8'));
        return out;
      }
      case Terrain.Settlement: {
        const out: DecorPiece[] = [];
        const n = 2 + Math.floor(rand() * 2);
        for (let i = 0; i < n; i++) out.push(...coral(rand, jitter(rand, 0.12), jitter(rand, 0.12)));
        return out;
      }
      case Terrain.Highland:
        return place(shipwreck(rand), jitter(rand, 0.03), jitter(rand, 0.03), rand() * Math.PI * 2);
    }
  },
};

