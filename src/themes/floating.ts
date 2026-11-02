// 浮島主題：雲海上的木製小島
import { Terrain } from '../game';
import type { DecorPiece, Rand, Theme } from './types';
import { jitter, pick } from './util';

function tree(rand: Rand, x: number, z: number, scale: number): DecorPiece[] {
  const green = pick(rand, ['#4f7a3f', '#5b8746', '#476f39']);
  const h = 0.24 * scale;
  return [
    { shape: 'cylinder', x, y: 0, z, sx: 0.022 * scale, sy: 0.06 * scale, sz: 0.022 * scale, color: '#6a4b2e' },
    { shape: 'cone', x, y: 0.045 * scale, z, sx: 0.085 * scale, sy: h * 0.7, sz: 0.085 * scale, color: green, rotY: rand() * 6 },
    { shape: 'cone', x, y: 0.045 * scale + h * 0.38, z, sx: 0.062 * scale, sy: h * 0.6, sz: 0.062 * scale, color: green, rotY: rand() * 6 },
  ];
}

function house(rand: Rand, x: number, z: number): DecorPiece[] {
  const rot = rand() * Math.PI;
  const roof = pick(rand, ['#a8503f', '#b86a3c', '#8f4a3c', '#5d6f8a']);
  return [
    { shape: 'box', x, y: 0, z, sx: 0.11, sy: 0.075, sz: 0.09, rotY: rot, color: '#efe2c8' },
    { shape: 'pyramid', x, y: 0.075, z, sx: 0.1, sy: 0.075, sz: 0.1, rotY: rot + Math.PI / 4, color: roof, segments: 4 },
  ];
}

function mountain(rand: Rand, x: number, z: number, scale: number): DecorPiece[] {
  const h = 0.3 * scale;
  const r = 0.2 * scale;
  const rot = rand() * 6;
  return [
    { shape: 'cone', x, y: 0, z, sx: r, sy: h, sz: r, rotY: rot, color: pick(rand, ['#857a6e', '#7b7268', '#8d8173']), segments: 5 },
    { shape: 'cone', x, y: h * 0.62, z, sx: r * 0.38, sy: h * 0.38 + 0.004, sz: r * 0.38, rotY: rot, color: '#f3efe6', segments: 5 },
  ];
}

export const floating: Theme = {
  id: 'floating',
  nameKey: 'theme.floating',
  accent: '#8fb9cf',
  sky: ['#b9d9e8', '#efe4d6'],
  // 偏霧、偏暖的漆色，避免塑膠感
  terrain: ['#6f9455', '#c3c27a', '#6f9fb8', '#d8bf94', '#a2968a'],
  heights: [0.06, 0.045, 0.02, 0.055, 0.08],
  base: '#a77b4f',
  glyphs: ['tree', 'grass', 'wave', 'house', 'mountain'],
  decor(terrain, rand) {
    switch (terrain) {
      case Terrain.Green: {
        const out: DecorPiece[] = [];
        const n = 2 + Math.floor(rand() * 2);
        for (let i = 0; i < n; i++) out.push(...tree(rand, jitter(rand, 0.12), jitter(rand, 0.12), 0.8 + rand() * 0.45));
        return out;
      }
      case Terrain.Open: {
        const out: DecorPiece[] = [];
        if (rand() < 0.6) {
          out.push({ shape: 'ball', x: jitter(rand, 0.12), y: 0, z: jitter(rand, 0.12), sx: 0.04, sy: 0.03, sz: 0.04, color: '#88a456' });
        }
        const flowers = Math.floor(rand() * 3);
        for (let i = 0; i < flowers; i++) {
          out.push({
            shape: 'ball', x: jitter(rand, 0.15), y: 0, z: jitter(rand, 0.15),
            sx: 0.014, sy: 0.014, sz: 0.014, color: pick(rand, ['#f1e3a0', '#f4f0e6', '#e7b3b3']),
          });
        }
        return out;
      }
      case Terrain.Water:
        return [];
      case Terrain.Settlement: {
        const out = house(rand, jitter(rand, 0.08), jitter(rand, 0.08));
        if (rand() < 0.4) out.push(...tree(rand, jitter(rand, 0.16), jitter(rand, 0.16), 0.55));
        return out;
      }
      case Terrain.Highland:
        return mountain(rand, jitter(rand, 0.05), jitter(rand, 0.05), 0.85 + rand() * 0.35);
    }
  },
};
