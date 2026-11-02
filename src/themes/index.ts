import { floating } from './floating';
import { ocean } from './ocean';
import { space } from './space';
import { taiwan } from './taiwan';
import type { Theme } from './types';

export const THEMES: Theme[] = [floating, taiwan, ocean, space];

export function getTheme(id: string): Theme {
  return THEMES.find((th) => th.id === id) ?? floating;
}

export type { Theme };
