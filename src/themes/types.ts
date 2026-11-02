import type { StringKey } from '../i18n';
import type { Terrain } from '../game';

/** 卡牌刻線圖案的種類 */
export type Glyph =
  | 'tree'
  | 'grass'
  | 'wave'
  | 'house'
  | 'mountain'
  | 'rice'
  | 'tea'
  | 'kelp'
  | 'shell'
  | 'coral'
  | 'anchor'
  | 'swirl'
  | 'rock'
  | 'stars'
  | 'station'
  | 'planet';

export type Vehicle = 'balloons' | 'propPlane' | 'jet' | 'submarine' | 'spaceship';

/** 穩定亂數（0..1） */
export type Rand = () => number;

/**
 * 3D 裝飾的基本形狀，主題用這些組合出樹、房子、山…
 * 座標以「扇形錨點」為原點（地形表面上），單位 = 地塊半徑
 *  cone：底在 y=0 的六角錐；pyramid：四角錐（屋頂）；box：底在 y=0；
 *  ball：低面數球，中心在 y=sy；cylinder：底在 y=0 的六角柱；
 *  torus：平放的圓環（行星環），中心在 y=0
 */
export interface DecorPiece {
  shape: 'cone' | 'pyramid' | 'box' | 'ball' | 'cylinder' | 'torus';
  x: number;
  y: number;
  z: number;
  /** 半徑／寬（x）、高（y）、深（z） */
  sx: number;
  sy: number;
  sz: number;
  rotY?: number;
  /** 傾斜（沉船、斜插的東西） */
  rotX?: number;
  rotZ?: number;
  color: string;
  /** 錐形的面數（預設 6） */
  segments?: number;
}

export interface Theme {
  id: string;
  nameKey: StringKey;
  /** 選單卡片上的代表色 */
  accent: string;
  /** 背景漸層（上 → 下），CSS 色碼 */
  sky: [string, string];
  /** 五種地形的漆色（3D 地塊與木雕卡片共用） */
  terrain: [string, string, string, string, string];
  /** 五種地形高出底座的高度 */
  heights: [number, number, number, number, number];
  /** 底座木頭顏色 */
  base: string;
  /** 卡牌上五種地形的刻線圖案 */
  glyphs: [Glyph, Glyph, Glyph, Glyph, Glyph];
  /** 場景裡會動的點綴：雲、鳥、魚群、衛星、飛碟，以及隨世界發展依序出現的交通工具 */
  ambient?: {
    clouds?: boolean;
    birds?: boolean;
    fish?: boolean;
    satellites?: boolean;
    ufo?: boolean;
    /** 第 1、2、3 個時代各出現什麼 */
    eras: Vehicle[];
  };
  /** 每個扇形的 3D 裝飾 */
  decor(terrain: Terrain, rand: Rand): DecorPiece[];
}

export function seededRand(seed: number): Rand {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
