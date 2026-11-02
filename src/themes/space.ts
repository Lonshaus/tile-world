// 太空主題：星雲、隕石帶、星河、太空站、行星
import { Terrain } from '../game';
import type { DecorPiece, Rand, Theme } from './types';
import { ball, box, jitter, pick, place } from './util';

function nebulaPuff(rand: Rand, x: number, z: number): DecorPiece[] {
  const color = pick(rand, ['#b59ad8', '#d8a0c8', '#9ab0e0']);
  return [
    ball(x, 0.01, z, 0.045, color, 0.6),
    ball(x + 0.03, 0.03, z + 0.01, 0.03, color, 0.6),
    ball(x - 0.025, 0.035, z - 0.02, 0.025, '#f0e0f8', 0.6),
  ];
}

function asteroid(rand: Rand, x: number, z: number): DecorPiece {
  const r = 0.02 + rand() * 0.035;
  return { ...ball(x, 0.01 + rand() * 0.04, z, r, pick(rand, ['#7d766c', '#8c8478', '#6f685f']), 0.8), rotY: rand() * 6, rotX: rand() };
}

function station(rand: Rand): DecorPiece[] {
  return [
    { shape: 'cylinder', x: 0, y: 0, z: 0, sx: 0.05, sy: 0.07, sz: 0.05, color: '#d8dce0' },
    box(0, 0.025, 0, 0.2, 0.025, 0.035, '#c8ccd2'),
    box(-0.13, 0.025, 0, 0.06, 0.004, 0.1, '#3f5f9a'),
    box(0.13, 0.025, 0, 0.06, 0.004, 0.1, '#3f5f9a'),
    { shape: 'cone', x: 0, y: 0.07, z: 0, sx: 0.012, sy: 0.06, sz: 0.012, color: '#e0e2e6' },
    ball(0, 0.13, 0, 0.008, rand() < 0.5 ? '#e05a4a' : '#5ae0a0'),
  ];
}

function planet(rand: Rand): DecorPiece[] {
  const color = pick(rand, ['#c98a5a', '#d8b06a', '#a8785a', '#c86f5a']);
  const r = 0.09 + rand() * 0.03;
  const out: DecorPiece[] = [ball(0, 0.02, 0, r, color)];
  if (rand() < 0.6) {
    out.push({ shape: 'torus', x: 0, y: 0.02 + r, z: 0, sx: r * 1.6, sy: r * 1.6, sz: r * 1.6, color: '#e8d8b0', rotX: 0.35, rotZ: 0.2 });
  }
  return out;
}

export const space: Theme = {
  id: 'space',
  nameKey: 'theme.space',
  accent: '#7a6f9e',
  sky: ['#1f2140', '#4a3f6b'],
  terrain: ['#7b6aa8', '#8c8478', '#3f5f9a', '#b9c0c8', '#c98a5a'],
  heights: [0.05, 0.04, 0.015, 0.05, 0.07],
  base: '#a77b4f',
  glyphs: ['swirl', 'rock', 'stars', 'station', 'planet'],
  decor(terrain, rand) {
    switch (terrain) {
      case Terrain.Green:
        return nebulaPuff(rand, jitter(rand, 0.08), jitter(rand, 0.08));
      case Terrain.Open: {
        const out: DecorPiece[] = [];
        const n = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) out.push(asteroid(rand, jitter(rand, 0.14), jitter(rand, 0.14)));
        return out;
      }
      case Terrain.Water: {
        const out: DecorPiece[] = [];
        const n = 2 + Math.floor(rand() * 3);
        for (let i = 0; i < n; i++) out.push(ball(jitter(rand, 0.15), 0.005, jitter(rand, 0.15), 0.008 + rand() * 0.006, pick(rand, ['#ffffff', '#fff3c0', '#c8e0ff'])));
        return out;
      }
      case Terrain.Settlement:
        return place(station(rand), jitter(rand, 0.03), jitter(rand, 0.03), rand() * Math.PI);
      case Terrain.Highland:
        return planet(rand).map((p) => ({ ...p, x: p.x + jitter(rand, 0.03), z: p.z + jitter(rand, 0.03) }));
    }
  },
};
