// 木雕風的 2D 卡牌：木板 + 雕刻凹槽 + 上漆的地形 + 刻線圖案
import { Terrain } from './game';
import { corner } from './hex';
import type { Glyph, Theme } from './themes/types';
import { seededRand } from './themes/types';

type Ctx = CanvasRenderingContext2D;

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hexPath(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const c = corner(i, r);
    if (i === 0) ctx.moveTo(cx + c.x, cy + c.y);
    else ctx.lineTo(cx + c.x, cy + c.y);
  }
  ctx.closePath();
}

/** 在目前的剪裁範圍內畫木紋 */
function grain(ctx: Ctx, x: number, y: number, w: number, h: number, seed: number, strength = 1) {
  const rand = seededRand(seed);
  const lines = Math.round(h / 4);
  for (let i = 0; i < lines; i++) {
    const y0 = y + rand() * h;
    const amp = 1 + rand() * 4;
    const freq = 0.5 + rand() * 1.5;
    const ph = rand() * 6;
    ctx.strokeStyle = `rgba(80,50,25,${(0.05 + rand() * 0.1) * strength})`;
    ctx.lineWidth = 0.6 + rand() * 1.4;
    ctx.beginPath();
    for (let xx = 0; xx <= w; xx += 6) {
      const yy = y0 + Math.sin((xx / w) * Math.PI * 2 * freq + ph) * amp;
      if (xx === 0) ctx.moveTo(x + xx, yy);
      else ctx.lineTo(x + xx, yy);
    }
    ctx.stroke();
  }
}

/** 刻線：亮邊在右下、暗線在本體，看起來像刻進去的 */
function engrave(ctx: Ctx, s: number, draw: () => void) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(1.2, s * 0.012);
  ctx.translate(s * 0.006, s * 0.006);
  ctx.strokeStyle = 'rgba(255,240,215,0.45)';
  draw();
  ctx.stroke();
  ctx.translate(-s * 0.006, -s * 0.006);
  ctx.strokeStyle = 'rgba(55,32,15,0.6)';
  draw();
  ctx.stroke();
  ctx.restore();
}

function glyph(ctx: Ctx, kind: Glyph, x: number, y: number, g: number) {
  ctx.beginPath();
  switch (kind) {
    case 'tree': // 樹
      ctx.moveTo(x, y - g);
      ctx.lineTo(x + g * 0.6, y + g * 0.4);
      ctx.lineTo(x - g * 0.6, y + g * 0.4);
      ctx.closePath();
      ctx.moveTo(x, y + g * 0.4);
      ctx.lineTo(x, y + g * 0.85);
      break;
    case 'grass': // 草
      for (const dx of [-0.45, 0, 0.45]) {
        ctx.moveTo(x + dx * g, y + g * 0.5);
        ctx.lineTo(x + dx * g * 1.5, y - g * 0.35);
      }
      break;
    case 'wave': // 波浪
      for (const dy of [-0.3, 0.35]) {
        ctx.moveTo(x - g * 0.8, y + dy * g);
        ctx.quadraticCurveTo(x - g * 0.4, y + (dy - 0.35) * g, x, y + dy * g);
        ctx.quadraticCurveTo(x + g * 0.4, y + (dy + 0.35) * g, x + g * 0.8, y + dy * g);
      }
      break;
    case 'house': // 房子
      ctx.moveTo(x - g * 0.55, y + g * 0.7);
      ctx.lineTo(x - g * 0.55, y - g * 0.05);
      ctx.lineTo(x, y - g * 0.65);
      ctx.lineTo(x + g * 0.55, y - g * 0.05);
      ctx.lineTo(x + g * 0.55, y + g * 0.7);
      ctx.closePath();
      ctx.moveTo(x - g * 0.12, y + g * 0.7);
      ctx.lineTo(x - g * 0.12, y + g * 0.3);
      ctx.lineTo(x + g * 0.12, y + g * 0.3);
      ctx.lineTo(x + g * 0.12, y + g * 0.7);
      break;
    case 'mountain': // 山
      ctx.moveTo(x - g * 0.9, y + g * 0.55);
      ctx.lineTo(x - g * 0.3, y - g * 0.55);
      ctx.lineTo(x + g * 0.05, y + g * 0.05);
      ctx.lineTo(x + g * 0.35, y - g * 0.3);
      ctx.lineTo(x + g * 0.9, y + g * 0.55);
      break;
    case 'rice': // 稻穗：彎下來的穗
      for (const dx of [-0.4, 0.4]) {
        ctx.moveTo(x + dx * g, y + g * 0.8);
        ctx.quadraticCurveTo(x + dx * g, y - g * 0.4, x + dx * g + g * 0.45, y - g * 0.2);
        ctx.moveTo(x + dx * g, y + g * 0.1);
        ctx.lineTo(x + dx * g + g * 0.25, y - g * 0.05);
      }
      break;
    case 'tea': // 茶園：山坡上一行行茶樹
      ctx.moveTo(x - g * 0.9, y + g * 0.6);
      ctx.quadraticCurveTo(x, y - g * 0.9, x + g * 0.9, y + g * 0.6);
      for (const dy of [0.05, 0.4]) {
        ctx.moveTo(x - g * 0.55, y + dy * g);
        ctx.quadraticCurveTo(x, y + (dy - 0.3) * g, x + g * 0.55, y + dy * g);
      }
      break;
    case 'kelp': // 海藻
      for (const dx of [-0.35, 0.3]) {
        ctx.moveTo(x + dx * g, y + g * 0.85);
        ctx.bezierCurveTo(x + (dx - 0.35) * g, y + g * 0.3, x + (dx + 0.35) * g, y - g * 0.2, x + dx * g, y - g * 0.9);
      }
      break;
    case 'shell': // 扇貝
      ctx.moveTo(x - g * 0.7, y + g * 0.3);
      ctx.quadraticCurveTo(x, y - g * 1.0, x + g * 0.7, y + g * 0.3);
      ctx.lineTo(x + g * 0.2, y + g * 0.6);
      ctx.lineTo(x - g * 0.2, y + g * 0.6);
      ctx.closePath();
      for (const dx of [-0.3, 0, 0.3]) {
        ctx.moveTo(x + dx * g * 0.5, y + g * 0.5);
        ctx.lineTo(x + dx * g * 1.4, y - g * 0.2);
      }
      break;
    case 'coral': // 珊瑚：分岔的枝
      ctx.moveTo(x, y + g * 0.85);
      ctx.lineTo(x, y - g * 0.1);
      ctx.lineTo(x - g * 0.45, y - g * 0.6);
      ctx.moveTo(x, y - g * 0.1);
      ctx.lineTo(x + g * 0.4, y - g * 0.7);
      ctx.moveTo(x, y + g * 0.3);
      ctx.lineTo(x + g * 0.5, y);
      break;
    case 'anchor': // 船錨
      ctx.moveTo(x, y - g * 0.8);
      ctx.lineTo(x, y + g * 0.7);
      ctx.moveTo(x - g * 0.35, y - g * 0.4);
      ctx.lineTo(x + g * 0.35, y - g * 0.4);
      ctx.moveTo(x - g * 0.65, y + g * 0.2);
      ctx.quadraticCurveTo(x - g * 0.55, y + g * 0.75, x, y + g * 0.7);
      ctx.quadraticCurveTo(x + g * 0.55, y + g * 0.75, x + g * 0.65, y + g * 0.2);
      break;
    case 'swirl': // 星雲漩渦
      ctx.moveTo(x, y);
      for (let a = 0; a < Math.PI * 3.2; a += 0.3) {
        const r = g * 0.08 + (a / (Math.PI * 3.2)) * g * 0.8;
        ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      break;
    case 'rock': // 隕石
      ctx.moveTo(x - g * 0.7, y);
      ctx.lineTo(x - g * 0.3, y - g * 0.6);
      ctx.lineTo(x + g * 0.4, y - g * 0.5);
      ctx.lineTo(x + g * 0.75, y + g * 0.1);
      ctx.lineTo(x + g * 0.2, y + g * 0.6);
      ctx.lineTo(x - g * 0.45, y + g * 0.45);
      ctx.closePath();
      ctx.moveTo(x - g * 0.05, y - g * 0.1);
      ctx.arc(x - g * 0.1, y - g * 0.1, g * 0.12, 0, Math.PI * 2);
      break;
    case 'stars': // 星星
      for (const [dx, dy, s] of [[-0.4, -0.3, 0.35], [0.4, 0.3, 0.3]]) {
        const cx = x + dx * g;
        const cy = y + dy * g;
        ctx.moveTo(cx - s * g, cy);
        ctx.lineTo(cx + s * g, cy);
        ctx.moveTo(cx, cy - s * g);
        ctx.lineTo(cx, cy + s * g);
      }
      break;
    case 'station': // 太空站：本體 + 兩片太陽能板
      ctx.rect(x - g * 0.2, y - g * 0.3, g * 0.4, g * 0.6);
      ctx.rect(x - g * 0.85, y - g * 0.2, g * 0.5, g * 0.4);
      ctx.rect(x + g * 0.35, y - g * 0.2, g * 0.5, g * 0.4);
      break;
    case 'planet': // 有環的行星
      ctx.moveTo(x + g * 0.45, y);
      ctx.arc(x, y, g * 0.45, 0, Math.PI * 2);
      ctx.moveTo(x + g * 0.95, y - g * 0.1);
      ctx.ellipse(x, y, g * 0.95, g * 0.28, -0.2, 0, Math.PI * 2);
      break;
  }
}

/** 雕刻在木板上的一塊六角地塊 */
export function drawCarvedHex(ctx: Ctx, theme: Theme, edges: readonly Terrain[], cx: number, cy: number, r: number, seed: number) {
  // 凹槽外緣的倒角：左上暗（被木板擋光）、右下亮
  ctx.save();
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = 'rgba(255,236,200,0.55)';
  hexPath(ctx, cx + r * 0.025, cy + r * 0.03, r * 1.02);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(50,25,8,0.55)';
  hexPath(ctx, cx - r * 0.02, cy - r * 0.025, r * 1.02);
  ctx.stroke();
  ctx.restore();
  // 凹槽：深色底
  hexPath(ctx, cx, cy, r);
  ctx.fillStyle = 'rgba(50,28,10,0.6)';
  ctx.fill();

  const ri = r * 0.9;
  ctx.save();
  hexPath(ctx, cx, cy, ri);
  ctx.clip();
  // 上漆的扇形
  for (let d = 0; d < 6; d++) {
    const a = corner(d, ri * 1.02);
    const b = corner(d + 1, ri * 1.02);
    ctx.fillStyle = theme.terrain[edges[d]];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + a.x, cy + a.y);
    ctx.lineTo(cx + b.x, cy + b.y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = theme.terrain[edges[d]];
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  // 漆面下透出的木紋與磨舊感
  grain(ctx, cx - ri, cy - ri, ri * 2, ri * 2, seed + 3, 0.8);
  const shade = ctx.createLinearGradient(cx - ri, cy - ri, cx + ri, cy + ri);
  shade.addColorStop(0, 'rgba(255,245,225,0.18)');
  shade.addColorStop(1, 'rgba(40,20,5,0.18)');
  ctx.fillStyle = shade;
  ctx.fillRect(cx - ri, cy - ri, ri * 2, ri * 2);
  // 內陰影（凹進去的感覺）
  ctx.shadowColor = 'rgba(25,12,0,0.75)';
  ctx.shadowBlur = r * 0.16;
  ctx.shadowOffsetX = r * 0.06;
  ctx.shadowOffsetY = r * 0.08;
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = 'rgba(25,12,0,0.7)';
  hexPath(ctx, cx, cy, ri + r * 0.05);
  ctx.stroke();
  ctx.restore();

  // 不同地形之間的刻線
  for (let d = 0; d < 6; d++) {
    if (edges[d] === edges[(d + 5) % 6]) continue;
    const c = corner(d, ri);
    engrave(ctx, r * 4, () => {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + c.x * 0.97, cy + c.y * 0.97);
    });
  }
  // 每個扇形的圖案
  for (let d = 0; d < 6; d++) {
    const a = corner(d, ri);
    const b = corner(d + 1, ri);
    const x = cx + (a.x + b.x) * 0.31;
    const y = cy + (a.y + b.y) * 0.31;
    engrave(ctx, r * 4, () => glyph(ctx, theme.glyphs[edges[d]], x, y, r * 0.15));
  }
}

/** 木板（卡牌底） */
export function drawWoodPanel(ctx: Ctx, w: number, h: number, seed: number, radius = w * 0.12) {
  ctx.save();
  roundRect(ctx, 0, 0, w, h, radius);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#c99c68');
  g.addColorStop(1, '#a87a4c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, 0, 0, w, h, seed);
  // 邊緣倒角：左上亮、右下暗
  const bw = Math.max(3, w * 0.035);
  ctx.lineWidth = bw * 2;
  ctx.strokeStyle = 'rgba(255,235,200,0.35)';
  roundRect(ctx, -bw * 0.4, -bw * 0.4, w, h, radius);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(60,30,10,0.35)';
  roundRect(ctx, bw * 0.4, bw * 0.4, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

// ── 撲克牌式的卡牌：上半部插畫窗，下半部卡名與說明 ──

export interface CardText {
  type: string;
  name: string;
  rows: { color: string; label: string; value: string }[];
}

export function drawPlayingCard(canvas: HTMLCanvasElement, art: CanvasImageSource, sky: [string, string], text: CardText, seed: number) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const u = w / 100; // 以卡寬 100 為單位排版
  const radius = 8 * u;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  roundRect(ctx, 0, 0, w, h, radius);
  ctx.clip();

  // 下半部：木紋底
  const wood = ctx.createLinearGradient(0, 0, w, h);
  wood.addColorStop(0, '#c99c68');
  wood.addColorStop(1, '#a87a4c');
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, 0, 0, w, h, seed);

  // 上半部：插圖直接貼齊卡牌上緣與左右
  const ah = h * 0.52;
  const g = ctx.createLinearGradient(0, 0, 0, ah);
  g.addColorStop(0, sky[0]);
  g.addColorStop(1, sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, ah);
  ctx.drawImage(art, 0, 0, w, ah);

  // 卡名
  let y = ah + 11 * u;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const font = (size: number, weight = 700) => `${weight} ${size * u}px system-ui, -apple-system, "PingFang TC", "Noto Sans TC", "Hiragino Sans", sans-serif`;
  const carvedText = (s: string, x: number, yy: number, size: number, weight = 700, maxW = w - 12 * u) => {
    ctx.font = font(size, weight);
    ctx.fillStyle = 'rgba(255,238,205,0.55)';
    ctx.fillText(s, x + 0.35 * u, yy + 0.45 * u, maxW);
    ctx.fillStyle = '#3a2412';
    ctx.fillText(s, x, yy, maxW);
  };
  carvedText(text.name, w / 2, y, 10);

  // 卡片種類
  y += 9 * u;
  carvedText(text.type, w / 2, y, 6, 600);

  // 說明：地形組成
  y += 12 * u;
  for (const row of text.rows) {
    ctx.fillStyle = row.color;
    ctx.beginPath();
    ctx.arc(12 * u, y, 3 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.textAlign = 'left';
    carvedText(row.label, 19 * u, y, 7.5, 600, 55 * u);
    ctx.textAlign = 'right';
    carvedText(row.value, w - 9 * u, y, 7.5, 700, 22 * u);
    y += 10.5 * u;
  }
  ctx.restore();
}

/** 卡背：木紋底，中間刻一個六角形徽記（沒有邊框） */
export function drawCardBack(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const u = w / 100;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  roundRect(ctx, 0, 0, w, h, 8 * u);
  ctx.clip();
  const wood = ctx.createLinearGradient(0, 0, w, h);
  wood.addColorStop(0, '#b4844f');
  wood.addColorStop(1, '#8f6338');
  ctx.fillStyle = wood;
  ctx.fillRect(0, 0, w, h);
  grain(ctx, 0, 0, w, h, 31337);
  // 中央徽記：大六角形裡套三個小六角形
  const cx = w / 2;
  const cy = h / 2;
  engrave(ctx, w, () => hexPath(ctx, cx, cy, 26 * u));
  engrave(ctx, w, () => hexPath(ctx, cx, cy, 20 * u));
  for (const [dx, dy] of [[0, -7], [-6.1, 3.5], [6.1, 3.5]]) {
    engrave(ctx, w, () => hexPath(ctx, cx + dx * u, cy + dy * u, 6 * u));
  }
  ctx.restore();
}
