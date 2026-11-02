import './style.css';
import {
  GameState,
  bestRotation,
  canPlace,
  evaluate,
  newGame,
  placeTile,
  placeableCells,
  rotateEdges,
  stationOf,
  tilesLeft,
} from './game';
import { Hex, key } from './hex';
import { LANGS, Lang, StringKey, detectLang, setLang, t } from './i18n';
import { attachInput } from './input';
import { Board3D } from './three/board3d';
import { CardText, drawCardBack, drawCarvedHex, drawPlayingCard, drawWoodPanel } from './carved';
import * as save from './save';
import { THEMES, Theme } from './themes';
import { confirmDialog, h, toast } from './dom';

const app = document.getElementById('app')!;
let settings = save.loadSettings();
setLang(settings.lang ?? detectLang());

function vibrate(ms: number) {
  if (settings.haptics) navigator.vibrate?.(ms);
}

let cleanupScreen: (() => void) | null = null;
function mount(el: HTMLElement, cleanup?: () => void) {
  cleanupScreen?.();
  cleanupScreen = cleanup ?? null;
  app.replaceChildren(el);
}

// ───────────────────────── 卡牌 ─────────────────────────

const CARD_W = 330;
const CARD_H = 462; // 撲克牌比例 5:7

/** 卡名與說明：依地形邊數由多到少 */
function cardText(theme: Theme, edges: readonly number[]): CardText {
  const counts = [0, 0, 0, 0, 0];
  for (const e of edges) counts[e]++;
  const order = [0, 1, 2, 3, 4].filter((i) => counts[i] > 0).sort((a, b) => counts[b] - counts[a]);
  const name = (i: number) => t(`terrain.${theme.id}.${i}` as StringKey);
  return {
    type: t('card.tile'),
    name: order.slice(0, 2).map(name).join('・'),
    rows: order.map((i) => ({ color: theme.terrain[i], label: name(i), value: t('card.edges', { n: counts[i] }) })),
  };
}

const DEAL_DURATION = 1100;
const DEAL_STAGGER = 150;

let backImage: HTMLCanvasElement | null = null;
function cardBackImage(): HTMLCanvasElement {
  if (!backImage) {
    backImage = document.createElement('canvas');
    backImage.width = CARD_W;
    backImage.height = CARD_H;
    drawCardBack(backImage);
  }
  return backImage;
}

// ───────────────────────── 主選單 ─────────────────────────

function showMenu() {
  const cards = THEMES.map((th) => {
    const best = save.getBest(th.id);
    const existing = save.loadGame(th.id);
    return h(
      'button',
      {
        class: 'theme-card',
        style: `--accent:${th.accent}`,
        // 有存檔就直接繼續；開新局從遊戲內選單
        onclick: () => startGame(th, existing),
      },
      themeThumb(th),
      h('span', { class: 'theme-name' }, t(th.nameKey)),
      h(
        'span',
        { class: 'theme-meta' },
        existing ? `▶ ${t('menu.continue')}` : best > 0 ? t('menu.best', { score: best }) : '',
      ),
    );
  });

  mount(
    h(
      'div',
      { class: 'screen menu' },
      h('h1', { class: 'logo' }, t('title')),
      h('p', { class: 'subtitle' }, t('subtitle')),
      h('h2', { class: 'section-title' }, t('menu.chooseTheme')),
      h('div', { class: 'theme-grid' }, ...cards),
      h('button', { class: 'btn ghost', onclick: showSettings }, `⚙ ${t('menu.settings')}`),
    ),
  );
}

function themeThumb(th: Theme): HTMLCanvasElement {
  const c = h('canvas', { class: 'theme-thumb', width: 320, height: 240 });
  const ctx = c.getContext('2d')!;
  drawWoodPanel(ctx, 320, 240, th.id.length * 97, 20);
  drawCarvedHex(ctx, th, [0, 0, 3, 3, 2, 0], 112, 96, 50, 7);
  drawCarvedHex(ctx, th, [4, 4, 0, 0, 1, 1], 199, 96, 50, 11);
  drawCarvedHex(ctx, th, [1, 2, 2, 1, 3, 3], 155, 171, 50, 3);
  return c;
}

// ───────────────────────── 設定 ─────────────────────────

function showSettings() {
  const langButtons = LANGS.map((l) =>
    h(
      'button',
      {
        class: `chip${(settings.lang ?? detectLang()) === l.id ? ' on' : ''}`,
        onclick: () => {
          settings = { ...settings, lang: l.id as Lang };
          save.saveSettings(settings);
          setLang(l.id);
          showSettings();
        },
      },
      l.label,
    ),
  );
  mount(
    h(
      'div',
      { class: 'screen settings' },
      h('h1', { class: 'page-title' }, t('settings.title')),
      h('div', { class: 'setting' }, h('span', {}, t('settings.language')), h('div', { class: 'chips' }, ...langButtons)),
      h(
        'div',
        { class: 'setting' },
        h('span', {}, t('settings.haptics')),
        h(
          'div',
          { class: 'chips' },
          ...[true, false].map((v) =>
            h(
              'button',
              {
                class: `chip${settings.haptics === v ? ' on' : ''}`,
                onclick: () => {
                  settings = { ...settings, haptics: v };
                  save.saveSettings(settings);
                  if (v) vibrate(20);
                  showSettings();
                },
              },
              v ? t('settings.on') : t('settings.off'),
            ),
          ),
        ),
      ),
      h(
        'div',
        { class: 'setting' },
        h('span', {}, t('settings.quality')),
        h(
          'div',
          { class: 'chips' },
          ...(['low', 'medium', 'high'] as const).map((v) =>
            h(
              'button',
              {
                class: `chip${settings.quality === v ? ' on' : ''}`,
                onclick: () => {
                  settings = { ...settings, quality: v };
                  save.saveSettings(settings);
                  showSettings();
                },
              },
              t(`settings.quality.${v}`),
            ),
          ),
        ),
      ),
      h(
        'button',
        {
          class: 'btn danger',
          onclick: async () => {
            if (await confirmDialog(t('settings.confirmClear'), t('common.yes'), t('common.no'))) {
              save.clearAll();
              toast(t('settings.cleared'));
            }
          },
        },
        t('settings.clear'),
      ),
      h('button', { class: 'btn', onclick: showMenu }, `← ${t('settings.back')}`),
    ),
  );
}

// ───────────────────────── 遊戲 ─────────────────────────

function startGame(theme: Theme, existing: GameState | null) {
  const state = existing ?? newGame(theme.id);
  save.saveGame(state);

  let selected = 0;
  let rot = 0;
  let preview: Hex | null = null;
  let pop: { hex: Hex; start: number } | null = null;
  let viewingOnly = false; // 結束後觀看世界

  // 畫面元素
  const canvas = h('canvas', { class: 'board' });
  const scoreEl = h('span', { class: 'hud-value' });
  const stationEl = h('span', { class: 'hud-small' });
  const stationBar = h('span', { class: 'station-fill' });
  const deckEl = h('span', { class: 'hud-small' });
  const hintEl = h('div', { class: 'hint' });
  const previewInfo = h('div', { class: 'preview-info' });
  const handEl = h('div', { class: 'hand' });
  const actionsEl = h(
    'div',
    { class: 'actions' },
    h('button', { class: 'round', 'aria-label': t('action.cancel'), onclick: () => cancelPreview() }, '✕'),
    h('button', { class: 'round', 'aria-label': t('action.rotate'), onclick: () => rotate() }, '↻'),
    h('button', { class: 'round confirm', 'aria-label': t('action.confirm'), onclick: () => confirm() }, '✓'),
  );
  const top = h(
    'div',
    { class: 'hud' },
    h('button', { class: 'icon-btn', 'aria-label': t('hud.menu'), onclick: () => openPause() }, '☰'),
    h('div', { class: 'hud-score' }, h('span', { class: 'hud-label' }, t('hud.score')), scoreEl),
    h('div', { class: 'hud-station' }, stationEl, h('span', { class: 'station-bar' }, stationBar)),
    deckEl,
  );
  const recenter = h(
    'button',
    { class: 'icon-btn floating-btn', 'aria-label': t('action.recenter'), onclick: () => { board.fitBoard(state); requestRender(); } },
    '⌖',
  );
  const bottom = h('div', { class: 'bottom' }, hintEl, previewInfo, actionsEl, handEl);
  const root = h(
    'div',
    { class: 'screen game', style: `background: linear-gradient(${theme.sky[0]}, ${theme.sky[1]})` },
    canvas,
    top,
    recenter,
    bottom,
  );
  mount(root, () => {
    detach();
    window.removeEventListener('resize', onResize);
    window.removeEventListener('keydown', onKey);
    cancelAnimationFrame(raf);
    board.dispose();
  });

  const board = new Board3D(canvas, theme, settings.quality);
  const updateInsets = () => {
    board.setInsets(top.getBoundingClientRect().height, bottom.getBoundingClientRect().height);
  };

  let raf = 0;
  function requestRender() {
    if (raf) return;
    raf = requestAnimationFrame(frame);
  }
  function frame(now: number) {
    raf = 0;
    let popT: { hex: Hex; t: number } | null = null;
    if (pop) {
      const tt = Math.min(1, (now - pop.start) / 280);
      popT = { hex: pop.hex, t: tt };
      if (tt >= 1) pop = null;
    }
    const card = state.hand[selected];
    const sec = now / 1000;
    board.tick(sec, lastFrame ? Math.min(0.1, sec - lastFrame) : 0);
    lastFrame = sec;
    board.render({
      state,
      highlights: !viewingOnly && card && !preview ? placeableCells(state) : [],
      preview: preview && card ? { hex: preview, edges: rotateEdges(card.edges, rot), id: `${key(preview)}|${card.id}|${rot}` } : null,
      pop: popT,
    });
    if (pop || board.animated) requestRender();
  }
  let lastFrame = 0;

  function onResize() {
    board.resize();
    updateInsets();
    requestRender();
  }
  window.addEventListener('resize', onResize);

  // 鍵盤：Q / E 旋轉視角
  function onKey(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k !== 'q' && k !== 'e') return;
    board.rotate((k === 'q' ? -1 : 1) * (Math.PI / 12));
    requestRender();
    scheduleHandRedraw();
  }
  window.addEventListener('keydown', onKey);

  const detach = attachInput(canvas, {
    onTap(x, y) {
      if (viewingOnly || state.over) return;
      const hex = board.screenToHex(x, y);
      const card = state.hand[selected];
      if (!card) return;
      if (hex && canPlace(state, hex)) {
        if (preview && key(preview) === key(hex)) {
          rot = (rot + 1) % 6;
        } else {
          preview = hex;
          rot = bestRotation(state, hex, card.edges, rot);
        }
        vibrate(8);
      } else {
        preview = null;
      }
      refreshUI();
    },
    onPan(dx, dy) {
      board.pan(dx, dy);
      requestRender();
    },
    onZoom(f) {
      board.zoom(f);
      requestRender();
    },
    onRotate(da) {
      board.rotate(da);
      requestRender();
      scheduleHandRedraw();
    },
  });

  const dealtAt = new Map<number, number>();

  // 鏡頭轉動時，卡牌插圖跟著換角度（每個畫面最多重畫一次）
  let handRaf = 0;
  function scheduleHandRedraw() {
    if (handRaf) return;
    handRaf = requestAnimationFrame(() => {
      handRaf = 0;
      refreshUI();
    });
  }

  function selectCard(i: number) {
    if (i === selected) {
      rotate();
      return;
    }
    selected = i;
    rot = 0;
    const card = state.hand[selected];
    if (preview && card) rot = bestRotation(state, preview, card.edges, 0);
    vibrate(8);
    refreshUI();
  }

  function rotate() {
    rot = (rot + 1) % 6;
    refreshUI();
  }

  function cancelPreview() {
    preview = null;
    refreshUI();
  }

  function confirm() {
    if (!preview || state.over) return;
    const hex = preview;
    const res = placeTile(state, selected, hex, rot);
    pop = { hex, start: performance.now() };
    preview = null;
    rot = 0;
    selected = Math.min(selected, Math.max(0, state.hand.length - 1));
    vibrate(res.perfect ? 40 : 15);
    const eraBefore = Board3D.eraOf({ ...state, board: Object.fromEntries(Object.entries(state.board).filter(([k]) => k !== key(hex))) });
    const eraAfter = Board3D.eraOf(state);
    const vehicle = eraAfter > eraBefore ? board.vehicleOfEra(eraAfter) : undefined;
    if (vehicle && settings.quality !== 'low') toast(t(`toast.vehicle.${vehicle}` as StringKey));
    else if (res.perfect) toast(t('toast.perfect', { n: res.points }));
    else if (res.newStation) toast(t('toast.station', { n: stationOf(state).station }));
    if (state.over) {
      const isBest = save.submitScore(theme.id, state.score);
      save.clearGame(theme.id);
      refreshUI();
      setTimeout(() => showGameOver(isBest), 650);
    } else {
      save.saveGame(state);
      refreshUI();
    }
  }

  function refreshUI() {
    scoreEl.textContent = String(state.score);
    const st = stationOf(state);
    stationEl.textContent = t('hud.station', { n: st.station });
    stationBar.style.width = `${(st.progress / 10) * 100}%`;
    deckEl.textContent = t('hud.deck', { n: tilesLeft(state) });

    const card = state.hand[selected];
    if (viewingOnly) {
      hintEl.textContent = '';
    } else if (preview && card) {
      const ev = evaluate(state, preview, rotateEdges(card.edges, rot));
      hintEl.textContent = t('hint.adjust');
      previewInfo.textContent = `${t('preview.points', { n: ev.points })} · ${t('preview.matches', { m: ev.matches, n: ev.neighbors })}`;
    } else {
      hintEl.textContent = t('hint.pickCard');
    }
    previewInfo.hidden = !preview;
    actionsEl.hidden = !preview;

    let dealIndex = 0;
    handEl.replaceChildren(
      ...state.hand.map((c, i) => {
        const front = h('canvas', { class: 'card-face', width: CARD_W, height: CARD_H });
        const edges = rotateEdges(c.edges, i === selected ? rot : 0);
        const art = board.tileArt(edges, c.id * 7919, CARD_W, Math.round(CARD_H * 0.52));
        drawPlayingCard(front, art, theme.sky, cardText(theme, c.edges), c.id * 7919);
        const back = h('canvas', { class: 'card-face card-back', width: CARD_W, height: CARD_H });
        back.getContext('2d')!.drawImage(cardBackImage(), 0, 0);
        const inner = h('div', { class: 'card-inner' }, front, back);

        // 發牌動畫：背面朝上滑進來，再翻成正面；開局的幾張依序發出。
        // 動畫途中畫面重繪時，用負的延遲接著播，不會從頭重來
        const now = performance.now();
        if (!dealtAt.has(c.id)) dealtAt.set(c.id, now + dealIndex++ * DEAL_STAGGER);
        const start = dealtAt.get(c.id)!;
        if (now - start < DEAL_DURATION) {
          inner.classList.add('deal');
          inner.style.animationDelay = `${start - now}ms`;
        }
        return h(
          'button',
          { class: `card${i === selected ? ' selected' : ''}`, onclick: () => selectCard(i) },
          inner,
        );
      }),
    );
    handEl.hidden = viewingOnly;
    requestRender();
  }

  function openPause() {
    const overlay = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'panel' },
        h('h2', { class: 'panel-title' }, t('pause.title')),
        h('button', { class: 'btn primary', onclick: () => overlay.remove() }, t('pause.resume')),
        h(
          'button',
          {
            class: 'btn',
            onclick: async () => {
              overlay.remove();
              if (state.over || (await confirmDialog(t('menu.confirmNew'), t('common.yes'), t('common.no')))) {
                save.clearGame(theme.id);
                startGame(theme, null);
              }
            },
          },
          t('pause.restart'),
        ),
        h('button', { class: 'btn', onclick: () => { overlay.remove(); showMenu(); } }, t('pause.menu')),
      ),
    );
    root.append(overlay);
  }

  function showGameOver(isBest: boolean) {
    const st = stationOf(state);
    const overlay = h(
      'div',
      { class: 'overlay' },
      h(
        'div',
        { class: 'panel' },
        h('h2', { class: 'panel-title' }, t('over.title')),
        isBest ? h('div', { class: 'badge' }, t('over.newBest')) : null,
        h('div', { class: 'big-score' }, String(state.score)),
        h(
          'dl',
          { class: 'stats' },
          h('dt', {}, t('over.stations')), h('dd', {}, String(st.station - (st.progress === 0 ? 1 : 0))),
          h('dt', {}, t('over.tiles')), h('dd', {}, String(state.placed)),
          h('dt', {}, t('over.perfects')), h('dd', {}, String(state.perfects)),
        ),
        !isBest ? h('p', { class: 'muted' }, t('over.best', { score: save.getBest(theme.id) })) : null,
        h('button', { class: 'btn primary', onclick: () => startGame(theme, null) }, t('over.again')),
        h(
          'button',
          {
            class: 'btn',
            onclick: () => {
              overlay.remove();
              viewingOnly = true;
              board.fitBoard(state);
              refreshUI();
            },
          },
          t('over.view'),
        ),
        h('button', { class: 'btn ghost', onclick: showMenu }, t('over.menu')),
      ),
    );
    root.append(overlay);
  }

  if (location.search.includes('debug')) {
    (window as unknown as Record<string, unknown>).__debug = {
      state,
      board,
      cells: () => placeableCells(state).map((c) => board.hexToScreen(c)),
    };
  }

  refreshUI();
  // 等版面算好再對準地圖
  requestAnimationFrame(() => {
    board.resize();
    updateInsets();
    board.fitBoard(state);
    requestRender();
  });
}

// ───────────────────────── 啟動 ─────────────────────────

showMenu();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
