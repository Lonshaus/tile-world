// 六角網格工具（尖頂 pointy-top、軸座標 axial q/r）
// 邊的編號以螢幕座標順時針：0 東、1 東南、2 西南、3 西、4 西北、5 東北

export interface Hex {
  q: number;
  r: number;
}

export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
  { q: 1, r: -1 },
];

export const SQRT3 = Math.sqrt(3);

export function key(h: Hex): string {
  return `${h.q},${h.r}`;
}

export function parseKey(k: string): Hex {
  const [q, r] = k.split(',').map(Number);
  return { q, r };
}

export function neighbor(h: Hex, dir: number): Hex {
  const d = DIRS[dir];
  return { q: h.q + d.q, r: h.r + d.r };
}

export function opposite(dir: number): number {
  return (dir + 3) % 6;
}

/** 格子中心的世界座標（size = 中心到頂點距離） */
export function hexToPixel(h: Hex, size: number): { x: number; y: number } {
  return {
    x: size * SQRT3 * (h.q + h.r / 2),
    y: size * 1.5 * h.r,
  };
}

export function pixelToHex(x: number, y: number, size: number): Hex {
  const q = ((SQRT3 / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
}

function hexRound(fq: number, fr: number): Hex {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}

/** 頂點 i（0..5）的相對座標；邊 i 夾在頂點 i 與 i+1 之間 */
export function corner(i: number, size: number): { x: number; y: number } {
  const a = (Math.PI / 180) * (-30 + 60 * i);
  return { x: size * Math.cos(a), y: size * Math.sin(a) };
}

/** 邊 dir 的兩個端點（相對中心） */
export function edgeCorners(dir: number, size: number): [{ x: number; y: number }, { x: number; y: number }] {
  return [corner(dir, size), corner((dir + 1) % 6, size)];
}
