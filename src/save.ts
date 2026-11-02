// 存檔：所有 localStorage 存取都包 try/catch，私密模式下也能玩（只是不會存）
import type { GameState } from './game';
import type { Lang } from './i18n';

const PREFIX = 'pinpin.';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  lang: Lang | null; // null = 依手機語言
  haptics: boolean;
  quality: Quality;
  music: boolean;
  sfx: boolean;
}

function read<T>(k: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + k);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(k: string, v: unknown): void {
  try {
    localStorage.setItem(PREFIX + k, JSON.stringify(v));
  } catch {
    /* 存不了就算了 */
  }
}

function remove(k: string): void {
  try {
    localStorage.removeItem(PREFIX + k);
  } catch {
    /* 忽略 */
  }
}

export function loadSettings(): Settings {
  return { lang: null, haptics: true, quality: 'high', music: true, sfx: true, ...(read<Partial<Settings>>('settings') ?? {}) };
}

export function saveSettings(s: Settings): void {
  write('settings', s);
}

export function loadGame(theme: string): GameState | null {
  const g = read<GameState>(`save.${theme}`);
  return g && g.version === 1 && !g.over ? g : null;
}

export function saveGame(state: GameState): void {
  write(`save.${state.theme}`, state);
}

export function clearGame(theme: string): void {
  remove(`save.${theme}`);
}

export function getBest(theme: string): number {
  return read<number>(`best.${theme}`) ?? 0;
}

/** 回傳是否刷新紀錄 */
export function submitScore(theme: string, score: number): boolean {
  if (score > getBest(theme)) {
    write(`best.${theme}`, score);
    return true;
  }
  return false;
}

export function clearAll(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIX) && k !== PREFIX + 'settings') keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* 忽略 */
  }
}
