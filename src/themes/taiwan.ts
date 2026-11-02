// 台灣街景主題：公園綠地、稻田、河濱、街區（各種台灣街景）、山城茶園
import { Terrain } from '../game';
import type { DecorPiece, Rand, Theme } from './types';
import { ball, box, jitter, pick, place } from './util';

// ── 街區：每個扇形隨機挑一種台灣街景 ──

/** 騎樓老街：兩層樓的長排店面，一樓退縮成騎樓 */
function arcadeStreet(rand: Rand): DecorPiece[] {
  const wall = pick(rand, ['#e6d6bd', '#d9c3a3', '#efe3cf']);
  return [
    box(0, 0, 0.02, 0.24, 0.05, 0.08, '#8a7f73'),
    box(0, 0.05, 0, 0.24, 0.07, 0.11, wall),
    box(0, 0.12, 0, 0.25, 0.012, 0.115, '#9b5a45'),
    { shape: 'cylinder', x: -0.1, y: 0, z: -0.05, sx: 0.008, sy: 0.05, sz: 0.008, color: wall },
    { shape: 'cylinder', x: 0, y: 0, z: -0.05, sx: 0.008, sy: 0.05, sz: 0.008, color: wall },
    { shape: 'cylinder', x: 0.1, y: 0, z: -0.05, sx: 0.008, sy: 0.05, sz: 0.008, color: wall },
  ];
}

/** 夜市攤販：一排小攤、紅黃遮雨棚、紅燈籠 */
function nightMarket(rand: Rand): DecorPiece[] {
  const out: DecorPiece[] = [];
  for (let i = 0; i < 3; i++) {
    const x = -0.1 + i * 0.1;
    out.push(box(x, 0, 0, 0.07, 0.04, 0.06, '#d8cbb6'));
    out.push(box(x, 0.055, 0, 0.085, 0.01, 0.075, pick(rand, ['#c4473a', '#e0a83a', '#d06b3a', '#3f7fa8'])));
  }
  out.push(ball(-0.05, 0.07, -0.04, 0.012, '#d9402f'), ball(0.05, 0.07, -0.04, 0.012, '#d9402f'));
  return out;
}

/** 廟口：紅牆、橘色重簷屋頂、門口香爐 */
function temple(): DecorPiece[] {
  return [
    box(0, 0, 0, 0.16, 0.06, 0.1, '#b8443a'),
    { shape: 'pyramid', x: 0, y: 0.06, z: 0, sx: 0.13, sy: 0.04, sz: 0.09, color: '#d98a3a', segments: 4, rotY: Math.PI / 4 },
    { shape: 'pyramid', x: 0, y: 0.085, z: 0, sx: 0.08, sy: 0.04, sz: 0.06, color: '#c9672f', segments: 4, rotY: Math.PI / 4 },
    { shape: 'cylinder', x: 0, y: 0, z: -0.09, sx: 0.018, sy: 0.025, sz: 0.018, color: '#6b5a3a' },
  ];
}

/** 便利商店：白色店面、綠橘紅條紋招牌 */
function convenienceStore(rand: Rand): DecorPiece[] {
  const stripe = pick(rand, [['#2f8f5b', '#e88a2f'], ['#2f6fb0', '#e0e0e0'], ['#d9402f', '#2f8f5b']]);
  return [
    box(0, 0, 0, 0.16, 0.07, 0.1, '#f1efe9'),
    box(0, 0.045, -0.051, 0.16, 0.012, 0.004, stripe[0]),
    box(0, 0.033, -0.051, 0.16, 0.008, 0.004, stripe[1]),
    box(0, 0, -0.052, 0.07, 0.03, 0.004, '#9fc3d6'),
  ];
}

/** 傳統市場：寬矮的建築、鐵皮屋頂 */
function market(): DecorPiece[] {
  return [
    box(0, 0, 0, 0.2, 0.045, 0.14, '#cbbfa8'),
    { shape: 'pyramid', x: 0, y: 0.045, z: 0, sx: 0.15, sy: 0.035, sz: 0.11, color: '#7e93a3', segments: 4, rotY: Math.PI / 4 },
  ];
}

/** 公寓頂樓加蓋：灰色公寓、藍色鐵皮加蓋、不鏽鋼水塔 */
function apartment(rand: Rand): DecorPiece[] {
  return [
    box(0, 0, 0, 0.13, 0.17, 0.11, pick(rand, ['#b9b3a8', '#c7bba7', '#a9a8a2'])),
    box(0.02, 0.17, 0.01, 0.08, 0.03, 0.07, '#4f7fa8'),
    { shape: 'cylinder', x: -0.04, y: 0.17, z: -0.03, sx: 0.016, sy: 0.035, sz: 0.016, color: '#d8dadc' },
  ];
}

/** 捷運站：高架車站、兩根柱子、月台屋頂 */
function mrtStation(): DecorPiece[] {
  return [
    { shape: 'cylinder', x: -0.08, y: 0, z: 0, sx: 0.015, sy: 0.08, sz: 0.015, color: '#bdbab2' },
    { shape: 'cylinder', x: 0.08, y: 0, z: 0, sx: 0.015, sy: 0.08, sz: 0.015, color: '#bdbab2' },
    box(0, 0.08, 0, 0.28, 0.025, 0.07, '#d4d1c9'),
    box(0, 0.105, 0, 0.18, 0.035, 0.07, '#9fb8c8'),
    box(0, 0.14, 0, 0.2, 0.01, 0.08, '#e0ddd6'),
  ];
}

/** 眷村：低矮平房、黑瓦、門口一棵樹 */
function veteranVillage(rand: Rand): DecorPiece[] {
  return [
    box(0, 0, 0, 0.14, 0.045, 0.08, '#d8d0c0'),
    { shape: 'pyramid', x: 0, y: 0.045, z: 0, sx: 0.11, sy: 0.04, sz: 0.07, color: '#4a4a4a', segments: 4, rotY: Math.PI / 4 },
    box(0.1, 0, 0.04, 0.005, 0.03, 0.08, '#c9c0ae'),
    ball(-0.1, 0.02, -0.05, 0.03 + rand() * 0.01, '#5f8a48'),
    { shape: 'cylinder', x: -0.1, y: 0, z: -0.05, sx: 0.006, sy: 0.03, sz: 0.006, color: '#6a4b2e' },
  ];
}

/** 早餐店：小店面、黃色遮陽棚、門口的桌子 */
function breakfastShop(): DecorPiece[] {
  return [
    box(0, 0, 0.01, 0.13, 0.065, 0.09, '#efe6d3'),
    box(0, 0.05, -0.05, 0.14, 0.008, 0.04, '#e8b83a'),
    box(-0.03, 0, -0.1, 0.035, 0.02, 0.025, '#e9e4da'),
    box(0.04, 0, -0.1, 0.035, 0.02, 0.025, '#e9e4da'),
  ];
}

/** 機車停滿的巷口：窄巷兩側矮房，中間一排機車 */
function scooterAlley(rand: Rand): DecorPiece[] {
  const out: DecorPiece[] = [
    box(-0.09, 0, 0, 0.07, 0.08, 0.2, '#cdbfa6'),
    box(0.09, 0, 0, 0.07, 0.07, 0.2, '#bfb39d'),
  ];
  for (let i = 0; i < 4; i++) {
    out.push(box(-0.03 + (i % 2) * 0.05, 0, -0.07 + Math.floor(i / 2) * 0.045 + i * 0.012, 0.012, 0.018, 0.035,
      pick(rand, ['#d9402f', '#2f6fb0', '#f0f0f0', '#3a3a3a', '#e0a83a'])));
  }
  return out;
}

const STREET_SCENES: ((rand: Rand) => DecorPiece[])[] = [
  arcadeStreet, nightMarket, temple, convenienceStore, market,
  apartment, mrtStation, veteranVillage, breakfastShop, scooterAlley,
];

// ── 其他地形 ──

function parkTree(rand: Rand, x: number, z: number, s: number): DecorPiece[] {
  return [
    { shape: 'cylinder', x, y: 0, z, sx: 0.01 * s, sy: 0.05 * s, sz: 0.01 * s, color: '#6a4b2e' },
    ball(x, 0.035 * s, z, 0.05 * s, pick(rand, ['#4f8a45', '#5a9550', '#6a9a4a'])),
  ];
}

function riceRows(rand: Rand): DecorPiece[] {
  const out: DecorPiece[] = [];
  const green = pick(rand, ['#9fb84a', '#a9c25a', '#c7b850']);
  for (let i = 0; i < 4; i++) out.push(box(0, 0, -0.09 + i * 0.06, 0.26, 0.012, 0.02, green));
  return out;
}

function teaHill(rand: Rand): DecorPiece[] {
  const out: DecorPiece[] = [ball(0, -0.06, 0, 0.17, '#8f8a5e', 0.55)];
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 3; i++) {
      out.push(ball(-0.08 + i * 0.08, 0.005 + (1 - Math.abs(r - 1)) * 0.025, -0.07 + r * 0.07, 0.022, pick(rand, ['#4f7a3a', '#5a8442'])));
    }
  }
  return out;
}

export const taiwan: Theme = {
  id: 'taiwan',
  nameKey: 'theme.taiwan',
  accent: '#d39b62',
  sky: ['#f3d9b5', '#eef0e6'],
  terrain: ['#6f9a55', '#c9c46a', '#6f9fb6', '#c7b49c', '#8f8a5e'],
  heights: [0.05, 0.035, 0.015, 0.05, 0.08],
  base: '#a77b4f',
  glyphs: ['tree', 'rice', 'wave', 'house', 'tea'],
  decor(terrain, rand) {
    switch (terrain) {
      case Terrain.Green: {
        const out: DecorPiece[] = [];
        const n = 2 + Math.floor(rand() * 2);
        for (let i = 0; i < n; i++) out.push(...parkTree(rand, jitter(rand, 0.12), jitter(rand, 0.12), 0.9 + rand() * 0.4));
        if (rand() < 0.4) out.push(box(jitter(rand, 0.08), 0, jitter(rand, 0.08), 0.06, 0.015, 0.02, '#8a6a4a'));
        return out;
      }
      case Terrain.Open:
        return place(riceRows(rand), 0, 0, rand() * Math.PI);
      case Terrain.Water:
        return rand() < 0.3 ? [ball(jitter(rand, 0.1), -0.005, jitter(rand, 0.1), 0.02, '#8a8a80', 0.5)] : [];
      case Terrain.Settlement:
        return place(pick(rand, STREET_SCENES)(rand), jitter(rand, 0.04), jitter(rand, 0.04), rand() * Math.PI * 2);
      case Terrain.Highland:
        return place(teaHill(rand), jitter(rand, 0.03), jitter(rand, 0.03), rand() * Math.PI);
    }
  },
};
