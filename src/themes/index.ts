import { floating } from './floating';
import type { Theme } from './types';

// 台灣街景、海底、太空在第 4 階段加入；先用佔位設定讓選單能顯示
function placeholder(id: string, nameKey: Theme['nameKey'], accent: string): Theme {
  return { ...floating, id, nameKey, accent, enabled: false };
}

export const THEMES: Theme[] = [
  floating,
  placeholder('taiwan', 'theme.taiwan', '#d39b62'),
  placeholder('ocean', 'theme.ocean', '#5f8fae'),
  placeholder('space', 'theme.space', '#7a6f9e'),
];

export function getTheme(id: string): Theme {
  return THEMES.find((th) => th.id === id && th.enabled) ?? floating;
}

export type { Theme };
