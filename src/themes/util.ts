// 主題共用的小工具
import type { DecorPiece, Rand } from './types';

export const jitter = (rand: Rand, r: number) => (rand() - 0.5) * 2 * r;
export const pick = <T>(rand: Rand, arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];

/** 把一組裝飾整體平移、旋轉（以錨點為中心） */
export function place(pieces: DecorPiece[], x: number, z: number, rot: number): DecorPiece[] {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return pieces.map((p) => ({
    ...p,
    x: x + p.x * c + p.z * s,
    z: z - p.x * s + p.z * c,
    rotY: (p.rotY ?? 0) + rot,
  }));
}

/** 簡單的盒子（底在 y） */
export function box(x: number, y: number, z: number, w: number, h: number, d: number, color: string): DecorPiece {
  return { shape: 'box', x, y, z, sx: w, sy: h, sz: d, color };
}

/** 球（中心在 y + r） */
export function ball(x: number, y: number, z: number, r: number, color: string, squash = 1): DecorPiece {
  return { shape: 'ball', x, y, z, sx: r, sy: r * squash, sz: r, color };
}
