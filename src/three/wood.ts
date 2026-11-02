// 程式產生的木紋貼圖（接近白色，乘上頂點色後只留下細微紋理）
import * as THREE from 'three';
import { seededRand } from '../themes/types';

export function makeGrainTexture(size = 512): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const rand = seededRand(42);
  ctx.fillStyle = '#f4efe6';
  ctx.fillRect(0, 0, size, size);

  // 年輪般的波浪紋
  for (let i = 0; i < 70; i++) {
    const y0 = rand() * size;
    const amp = 2 + rand() * 6;
    const freq = 1 + Math.floor(rand() * 3);
    const phase = rand() * Math.PI * 2;
    const dark = rand() < 0.25;
    ctx.strokeStyle = dark ? `rgba(120,90,60,${0.1 + rand() * 0.1})` : `rgba(150,120,90,${0.05 + rand() * 0.07})`;
    ctx.lineWidth = dark ? 1 + rand() * 1.5 : 0.6 + rand();
    ctx.beginPath();
    for (let x = 0; x <= size; x += 8) {
      // 首尾的 sin 週期相同，貼圖可以無縫重複
      const y = y0 + Math.sin((x / size) * Math.PI * 2 * freq + phase) * amp;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // 細小的顆粒
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
