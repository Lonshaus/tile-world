// 遊戲規則與狀態（不含畫面）
import { Hex, key, neighbor, opposite, parseKey } from './hex';
import { Rng } from './rng';

/** 底層地形：主題只換外觀 */
export enum Terrain {
  Green = 0, // 綠：森林／公園／海藻林／星雲
  Open = 1, // 開闊：草原／稻田／白沙地／隕石帶
  Water = 2, // 水：湖泊／河濱／洋流／星河
  Settlement = 3, // 聚落：村落／街區／珊瑚礁／太空站
  Highland = 4, // 高地：山／山城茶園／沉船區／行星
}
export const TERRAIN_COUNT = 5;
const TERRAIN_WEIGHTS = [26, 26, 16, 18, 14];

export const HAND_SIZE = 3;
export const START_DECK = 30;
export const STATION_LENGTH = 10;
export const PERFECT_BONUS = 5;

export interface TileCard {
  id: number;
  /** 六個邊的地形，依邊編號 0..5 */
  edges: Terrain[];
}

export interface PlacedTile {
  edges: Terrain[];
  /** 用來決定裝飾圖案的固定種子（跟卡牌插圖、預覽相同） */
  seed: number;
  /** 放下時轉了幾格（整塊連建築一起轉；舊存檔沒有這欄就當 0） */
  rot?: number;
}

export interface GameState {
  version: 1;
  theme: string;
  rng: number;
  board: Record<string, PlacedTile>;
  deck: TileCard[];
  hand: TileCard[];
  score: number;
  placed: number;
  perfects: number;
  nextId: number;
  over: boolean;
}

export interface Evaluation {
  neighbors: number;
  matches: number;
  perfect: boolean;
  points: number;
}

/** 卡牌對應的裝飾種子：卡牌插圖、預覽、放下後都用同一個，看起來才會一樣 */
export function tileSeed(card: TileCard): number {
  return card.id * 7919;
}

export function rotateEdges(edges: readonly Terrain[], rot: number): Terrain[] {
  const out = new Array<Terrain>(6);
  for (let i = 0; i < 6; i++) out[(i + rot) % 6] = edges[i];
  return out;
}

function generateTile(rng: Rng, id: number): TileCard {
  const edges = new Array<Terrain>(6);
  const roll = rng.next();
  if (roll < 0.22) {
    edges.fill(rng.pickWeighted(TERRAIN_WEIGHTS));
    return { id, edges };
  }
  const segCount = roll < 0.7 ? 2 : 3;
  // 選出互不相同的地形
  const terrains: Terrain[] = [];
  while (terrains.length < segCount) {
    const t = rng.pickWeighted(TERRAIN_WEIGHTS);
    if (!terrains.includes(t)) terrains.push(t);
  }
  // 把六個邊切成連續的段落，每段至少 1 邊
  const lengths = new Array(segCount).fill(1);
  for (let i = segCount; i < 6; i++) lengths[rng.int(segCount)]++;
  const start = rng.int(6);
  let pos = start;
  for (let s = 0; s < segCount; s++) {
    for (let j = 0; j < lengths[s]; j++) {
      edges[pos % 6] = terrains[s];
      pos++;
    }
  }
  return { id, edges };
}

export function newGame(theme: string): GameState {
  const rng = Rng.fromTime();
  const state: GameState = {
    version: 1,
    theme,
    rng: 0,
    board: {},
    deck: [],
    hand: [],
    score: 0,
    placed: 0,
    perfects: 0,
    nextId: 1,
    over: false,
  };
  const starter = generateTile(rng, 0);
  state.board[key({ q: 0, r: 0 })] = { edges: starter.edges, seed: rng.int(1e9) };
  for (let i = 0; i < START_DECK; i++) state.deck.push(generateTile(rng, state.nextId++));
  state.rng = rng.state;
  refillHand(state);
  return state;
}

function refillHand(state: GameState): void {
  while (state.hand.length < HAND_SIZE && state.deck.length > 0) {
    state.hand.push(state.deck.shift()!);
  }
}

export function canPlace(state: GameState, h: Hex): boolean {
  if (state.board[key(h)]) return false;
  for (let d = 0; d < 6; d++) if (state.board[key(neighbor(h, d))]) return true;
  return false;
}

/** 所有可以放置的空格 */
export function placeableCells(state: GameState): Hex[] {
  const seen = new Set<string>();
  const out: Hex[] = [];
  for (const k of Object.keys(state.board)) {
    const h = parseKey(k);
    for (let d = 0; d < 6; d++) {
      const n = neighbor(h, d);
      const nk = key(n);
      if (seen.has(nk) || state.board[nk]) continue;
      seen.add(nk);
      out.push(n);
    }
  }
  return out;
}

export function evaluate(state: GameState, h: Hex, edges: readonly Terrain[]): Evaluation {
  let neighbors = 0;
  let matches = 0;
  for (let d = 0; d < 6; d++) {
    const n = state.board[key(neighbor(h, d))];
    if (!n) continue;
    neighbors++;
    if (n.edges[opposite(d)] === edges[d]) matches++;
  }
  const perfect = neighbors === 6 && matches === 6;
  return { neighbors, matches, perfect, points: matches + (perfect ? PERFECT_BONUS : 0) };
}

export interface PlaceResult extends Evaluation {
  newStation: boolean;
}

export function placeTile(state: GameState, handIndex: number, h: Hex, rot: number): PlaceResult {
  const card = state.hand[handIndex];
  if (!card || !canPlace(state, h)) throw new Error('invalid placement');
  const edges = rotateEdges(card.edges, rot);
  const ev = evaluate(state, h, edges);
  state.board[key(h)] = { edges, seed: tileSeed(card), rot };
  state.hand.splice(handIndex, 1);
  state.score += ev.points;
  state.placed++;
  if (ev.perfect) state.perfects++;
  refillHand(state);
  if (state.hand.length === 0) state.over = true;
  return { ...ev, newStation: state.placed % STATION_LENGTH === 0 };
}

export function stationOf(state: GameState): { station: number; progress: number } {
  return {
    station: Math.floor(state.placed / STATION_LENGTH) + 1,
    progress: state.placed % STATION_LENGTH,
  };
}

export function tilesLeft(state: GameState): number {
  return state.deck.length + state.hand.length;
}
