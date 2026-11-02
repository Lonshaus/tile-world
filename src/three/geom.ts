// 地塊 3D 幾何：木頭底座 + 地形板 + 低面數裝飾，全部合併成少數幾個網格
import * as THREE from 'three';
import { Terrain } from '../game';
import { corner } from '../hex';
import type { DecorPiece, Theme } from '../themes/types';
import { seededRand } from '../themes/types';

/** 底座頂面高度 */
export const BASE_TOP = 0.2;
const BASE_BOTTOM = BASE_TOP - 0.04; // 薄薄一層，地圖上不特別看出厚度
const BASE_R = 1.0; // 地塊之間無縫相接
const INLAY_R = 1.0; // 地形一路鋪到邊緣，沒有木框
const GROOVE = 0.0; // 不同地形之間不留刻痕，靠高低差區分

type V2 = [number, number];

/** 非索引幾何的累積器（位置、顏色、UV） */
class Builder {
  pos: number[] = [];
  col: number[] = [];
  uv: number[] = [];
  private c = new THREE.Color();

  constructor(private uvOffset: V2) {}

  tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    for (const p of [a, b, c]) {
      this.pos.push(p.x, p.y, p.z);
      this.col.push(color.r, color.g, color.b);
      // 簡單的平面投影，讓木紋在頂面和側面都有變化
      this.uv.push(p.x + 0.37 * p.z + this.uvOffset[0], p.z + p.y * 1.3 + this.uvOffset[1]);
    }
  }

  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  color(hex: string, shade = 1): THREE.Color {
    return this.c.set(hex).multiplyScalar(shade).clone();
  }

  /** 加入另一個 three 幾何（會轉成非索引） */
  addGeometry(g: THREE.BufferGeometry, color: THREE.Color) {
    const ng = g.index ? g.toNonIndexed() : g;
    const p = ng.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.col.push(color.r, color.g, color.b);
      this.uv.push(p.getX(i) * 3 + this.uvOffset[0], p.getY(i) * 3 + p.getZ(i) + this.uvOffset[1]);
    }
    if (ng !== g) ng.dispose();
  }

  build(): THREE.BufferGeometry | null {
    if (this.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
}

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * 以扇形展開中心 m 建立「頂面 + 往下到 yBottom 的側牆」的柱體。
 * poly 依角度遞增（螢幕順時針）排列；從上往下看時三角形需逆時針才朝上。
 */
function prism(b: Builder, poly: V2[], m: V2, yBottom: number, yTop: number, top: THREE.Color, side: THREE.Color) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % n];
    b.tri(v(m[0], yTop, m[1]), v(q[0], yTop, q[1]), v(p[0], yTop, p[1]), top);
    b.quad(v(p[0], yTop, p[1]), v(q[0], yTop, q[1]), v(q[0], yBottom, q[1]), v(p[0], yBottom, p[1]), side);
  }
}

/** 底座：六角柱（頂面會被地形完全蓋住，只看得到側面） */
function addBase(b: Builder, theme: Theme) {
  const side = b.color(theme.base, 0.82);
  for (let i = 0; i < 6; i++) {
    const p = corner(i, BASE_R);
    const q = corner(i + 1, BASE_R);
    b.quad(v(p.x, BASE_TOP, p.y), v(q.x, BASE_TOP, q.y), v(q.x, BASE_BOTTOM, q.y), v(p.x, BASE_BOTTOM, p.y), side);
  }
}

/** 兩條直線交點：p0 + s*u0 與 p1 + t*u1 */
function intersect(p0: V2, u0: V2, p1: V2, u1: V2): V2 | null {
  const det = u0[0] * -u1[1] - u0[1] * -u1[0];
  if (Math.abs(det) < 1e-6) return null;
  const dx = p1[0] - p0[0];
  const dy = p1[1] - p0[1];
  const s = (dx * -u1[1] - dy * -u1[0]) / det;
  return [p0[0] + s * u0[0], p0[1] + s * u0[1]];
}

const angleOf = (i: number) => (Math.PI / 180) * (-30 + 60 * i);

/** 把六個邊分成相同地形的連續段落：[起始邊, 長度, 地形] */
function segments(edges: readonly Terrain[]): [number, number, Terrain][] {
  if (edges.every((e) => e === edges[0])) return [[0, 6, edges[0]]];
  let start = 0;
  while (edges[start] === edges[(start + 5) % 6]) start++;
  const out: [number, number, Terrain][] = [];
  let i = 0;
  while (i < 6) {
    const d = (start + i) % 6;
    let len = 1;
    while (i + len < 6 && edges[(start + i + len) % 6] === edges[d]) len++;
    out.push([d, len, edges[d]]);
    i += len;
  }
  return out;
}

/** 地形板的多邊形（GROOVE > 0 時會往內縮出刻痕）與扇形展開中心 */
function inlayPolygon(d: number, k: number): { poly: V2[]; m: V2 } {
  if (k === 6) {
    const poly: V2[] = [];
    for (let i = 0; i < 6; i++) {
      const c = corner(i, INLAY_R);
      poly.push([c.x, c.y]);
    }
    return { poly, m: [0, 0] };
  }
  const a0 = angleOf(d);
  const a1 = angleOf(d + k);
  const u0: V2 = [Math.cos(a0), Math.sin(a0)];
  const u1: V2 = [Math.cos(a1), Math.sin(a1)];
  const n0: V2 = [-u0[1] * GROOVE, u0[0] * GROOVE]; // 往角度增加方向
  const n1: V2 = [u1[1] * GROOVE, -u1[0] * GROOVE]; // 往角度減少方向
  const q = intersect(n0, u0, n1, u1) ?? n0;
  const poly: V2[] = [q];
  const c0 = corner(d, INLAY_R);
  poly.push([c0.x + n0[0], c0.y + n0[1]]);
  for (let i = 1; i < k; i++) {
    const c = corner(d + i, INLAY_R);
    poly.push([c.x, c.y]);
  }
  const c1 = corner(d + k, INLAY_R);
  poly.push([c1.x + n1[0], c1.y + n1[1]]);
  const mid = (a0 + a1) / 2;
  const md = k >= 3 ? 0.42 : 0.5;
  return { poly, m: [Math.cos(mid) * md, Math.sin(mid) * md] };
}

// 裝飾用的基本幾何（共用）
const PRIMS = {
  cone6: new THREE.ConeGeometry(1, 1, 6).translate(0, 0.5, 0),
  cone5: new THREE.ConeGeometry(1, 1, 5).translate(0, 0.5, 0),
  pyramid: new THREE.ConeGeometry(1, 1, 4).translate(0, 0.5, 0),
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  ball: new THREE.IcosahedronGeometry(1, 0).translate(0, 1, 0),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 6).translate(0, 0.5, 0),
  torus: new THREE.TorusGeometry(1, 0.12, 4, 16).rotateX(Math.PI / 2),
};

function primFor(p: DecorPiece): THREE.BufferGeometry {
  switch (p.shape) {
    case 'cone':
      return p.segments === 5 ? PRIMS.cone5 : PRIMS.cone6;
    case 'pyramid':
      return PRIMS.pyramid;
    case 'box':
      return PRIMS.box;
    case 'ball':
      return PRIMS.ball;
    case 'cylinder':
      return PRIMS.cylinder;
    case 'torus':
      return PRIMS.torus;
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

function addDecor(b: Builder, p: DecorPiece, ax: number, ay: number, az: number) {
  const g = primFor(p).clone();
  tmpQ.setFromEuler(tmpE.set(p.rotX ?? 0, p.rotY ?? 0, p.rotZ ?? 0, 'YXZ'));
  tmpM.compose(v(ax + p.x, ay + p.y, az + p.z), tmpQ, v(p.sx, p.sy, p.sz));
  g.applyMatrix4(tmpM);
  b.addGeometry(g, b.color(p.color));
  g.dispose();
}

export interface TileGeometry {
  solid: THREE.BufferGeometry;
  water: THREE.BufferGeometry | null;
}

export function buildTileGeometry(theme: Theme, edges: readonly Terrain[], seed: number): TileGeometry {
  const rand = seededRand(seed);
  const solid = new Builder([rand() * 10, rand() * 10]);
  const water = new Builder([0, 0]);
  addBase(solid, theme);

  for (const [d, k, terrain] of segments(edges)) {
    const { poly, m } = inlayPolygon(d, k);
    const h = theme.heights[terrain];
    const target = terrain === Terrain.Water ? water : solid;
    const top = target.color(theme.terrain[terrain], 0.97 + rand() * 0.06);
    const side = target.color(theme.terrain[terrain], 0.78);
    prism(target, poly, m, BASE_TOP, BASE_TOP + h, top, side);
  }

  // 每個扇形一組裝飾
  for (let d = 0; d < 6; d++) {
    const terrain = edges[d];
    const a = corner(d, INLAY_R);
    const c = corner(d + 1, INLAY_R);
    const ax = (a.x + c.x) * 0.3;
    const az = (a.y + c.y) * 0.3;
    for (const p of theme.decor(terrain, rand)) addDecor(solid, p, ax, BASE_TOP + theme.heights[terrain], az);
  }

  return { solid: solid.build()!, water: water.build() };
}
