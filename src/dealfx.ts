// 發牌特效：用 WebGL 把卡牌做成會彎的薄片，背面朝上滑進來後，
// 像用手從左下角掀起來一樣，一邊彎曲一邊翻成正面
import * as THREE from 'three';

const SLIDE = 0.32; // 滑進來（秒）
const REST = 0.12; // 停一下
const FLIP = 0.75; // 掀開翻面
export const DEAL_TOTAL = SLIDE + REST + FLIP;

interface Active {
  id: number;
  /** 第一個畫面出現時才開始計時（NaN = 還沒開始），避免開局準備工作吃掉動畫 */
  start: number;
  delay: number;
  rect: DOMRect;
  mesh: THREE.Group;
  geo: THREE.PlaneGeometry;
  base: Float32Array;
  textures: THREE.Texture[];
  onDone: () => void;
}

const ease = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));
const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

export class DealFx {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 1, 5000);
  private active: Active[] = [];
  private raf = 0;
  private canvas: HTMLCanvasElement;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'deal-fx';
    this.scene.add(new THREE.AmbientLight('#ffffff', 1.6));
    const light = new THREE.DirectionalLight('#fff6e8', 1.6);
    light.position.set(-0.4, 0.6, 1);
    this.scene.add(light);
  }

  /** 正在播放動畫的牌（畫面重繪時要繼續隱藏原本的牌） */
  isDealing(id: number): boolean {
    return this.active.some((a) => a.id === id);
  }

  play(id: number, el: HTMLElement, front: HTMLCanvasElement, back: HTMLCanvasElement, delay: number, onDone: () => void) {
    if (this.isDealing(id)) return;
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    if (!this.canvas.isConnected) document.body.append(this.canvas);

    const rect = el.getBoundingClientRect();
    const geo = new THREE.PlaneGeometry(rect.width, rect.height, 24, 32);
    const mk = (src: HTMLCanvasElement, side: THREE.Side) => {
      const tex = new THREE.CanvasTexture(src);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      return { tex, mat: new THREE.MeshLambertMaterial({ map: tex, side, transparent: true, alphaTest: 0.5 }) };
    };
    const f = mk(front, THREE.FrontSide);
    const b = mk(back, THREE.BackSide);
    const mesh = new THREE.Group();
    mesh.add(new THREE.Mesh(geo, f.mat), new THREE.Mesh(geo, b.mat));
    this.scene.add(mesh);
    this.active.push({
      id,
      start: NaN,
      delay,
      rect,
      mesh,
      geo,
      base: Float32Array.from(geo.attributes.position.array as Float32Array),
      textures: [f.tex, b.tex],
      onDone,
    });
    mesh.visible = false;
    if (!this.raf) this.raf = requestAnimationFrame(this.loop);
  }

  private loop = () => {
    this.raf = 0;
    this.update(performance.now() / 1000);
    if (this.active.length) this.raf = requestAnimationFrame(this.loop);
  };

  private update(now: number) {
    const r = this.renderer!;
    const W = window.innerWidth;
    const H = window.innerHeight;
    r.setSize(W, H, false);
    // 讓 z = 0 的平面上 1 單位 = 1 CSS 像素
    const cam = this.camera;
    cam.aspect = W / H;
    const dist = H / 2 / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.position.set(W / 2, -H / 2, dist);
    cam.lookAt(W / 2, -H / 2, 0);
    cam.far = dist * 3;
    cam.updateProjectionMatrix();

    for (const a of [...this.active]) {
      if (Number.isNaN(a.start)) a.start = now + a.delay;
      const t = now - a.start;
      if (t >= DEAL_TOTAL) {
        this.finish(a);
        continue;
      }
      this.pose(a, t);
    }
    r.render(this.scene, cam);
    if (!this.active.length) r.clear();
  }

  /** 依時間擺出卡牌的位置與彎曲 */
  private pose(a: Active, t: number) {
    const { width: w, height: h } = a.rect;
    const cx = a.rect.left + w / 2;
    const cy = -(a.rect.top + h / 2);

    // 1. 背面朝上從右邊滑進來
    const s = easeOut(t / SLIDE);
    a.mesh.position.set(cx + (1 - s) * w * 1.8, cy - (1 - s) * h * 0.25, 0);
    a.mesh.rotation.z = (1 - s) * -0.25;
    a.mesh.visible = t >= 0;

    // 2. 掀開：以直的中線為軸翻面，左下角先翹起來，其他部分依距離慢慢跟上，整張牌彎著翻過去
    //    （翻面前看到的左邊，在牌的正面座標裡是右邊 x > 0）
    const T = Math.min(1, Math.max(0, (t - SLIDE - REST) / FLIP));
    const hw = w / 2;
    const hh = h / 2;
    const LAG = 0.85; // 越大越軟：先翹起來的角領先其他部分越多
    const lift = Math.sin(Math.PI * T) * h * 0.16;
    const pos = a.geo.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      const px = a.base[i];
      const py = a.base[i + 1];
      // 0 = 左下角（最先動），1 = 右上角（最後動）
      const lead = 0.7 * ((hw - px) / w) + 0.3 * ((py + hh) / h);
      const q = ease(T * (1 + LAG) - LAG * lead);
      const phi = Math.PI * (1 - q);
      pos[i] = px * Math.cos(phi);
      pos[i + 1] = py;
      pos[i + 2] = px * Math.sin(phi) + lift;
    }
    a.geo.attributes.position.needsUpdate = true;
    a.geo.computeVertexNormals();
  }

  private finish(a: Active) {
    this.scene.remove(a.mesh);
    a.geo.dispose();
    a.textures.forEach((x) => x.dispose());
    a.mesh.children.forEach((m) => ((m as THREE.Mesh).material as THREE.Material).dispose());
    this.active.splice(this.active.indexOf(a), 1);
    a.onDone();
  }
}
