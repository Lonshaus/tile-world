import { zhTW } from './zh-TW';
import { ja } from './ja';
import { en } from './en';

export type Lang = 'zh-TW' | 'ja' | 'en';
export type Dict = typeof zhTW;
export type StringKey = keyof Dict;

const DICTS: Record<Lang, Dict> = { 'zh-TW': zhTW, ja, en };
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'zh-TW', label: '繁體中文' },
  { id: 'ja', label: '日本語' },
  { id: 'en', label: 'English' },
];

let current: Lang = 'zh-TW';

export function detectLang(): Lang {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const l of langs) {
    const s = l.toLowerCase();
    if (s.startsWith('zh')) return 'zh-TW';
    if (s.startsWith('ja')) return 'ja';
    if (s.startsWith('en')) return 'en';
  }
  return 'zh-TW';
}

export function setLang(l: Lang): void {
  current = l;
  document.documentElement.lang = l;
}

export function getLang(): Lang {
  return current;
}

/** 取字串；{name} 形式的參數會被替換 */
export function t(k: StringKey, params?: Record<string, string | number>): string {
  let s: string = DICTS[current][k] ?? zhTW[k];
  if (params) for (const [p, v] of Object.entries(params)) s = s.split(`{${p}}`).join(String(v));
  return s;
}
