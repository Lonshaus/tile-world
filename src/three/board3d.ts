// three.js 地圖：地塊、可放置格、預覽、鏡頭（平移／縮放／旋轉）
import * as THREE from 'three';
import { GameState, Terrain } from '../game';
import { Hex, corner, hexToPixel, key, neighbor, opposite, parseKey, pixelToHex } from '../hex';
import type { Theme } from '../themes/types';
import { BASE_TOP, buildTileGeometry } from './geom';
import { makeGrainTexture } from './wood';
import { ERA_THRESHOLDS, Traffic } from './ambient';
import { Ambient, Ufo } from './wildlife';
import { WaterLife, makeRippleNormalMap } from './water';
import type { Quality } from '../save';

const QUALITY: Record<Quality, { ratio: number; shadow: number; aa: boolean }> = {
  low: { ratio: 1, shadow: 0, aa: false },
  medium: { ratio: 1.75, shadow: 1024, aa: true },
  high: { ratio: 2.5, shadow: 2048, aa: true },
};

export interface BoardInput {
  state: GameState;
  highlights: Hex[];
  preview: { hex: Hex; edges: Terrain[]; id: string } | null;
  pop: { hex: Hex; t: number } | null;
}

// 鏡頭：拉近、從約 40 度斜上方往前看，遠處淡進霧裡，像在看一片風景
const ELEVATION = THREE.MathUtils.degToRad(40);
const FOV = 42;
const START_DISTANCE = 8.5;
const GHOST_LIFT = 0.3;

export class Board3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 200);
  private sun: THREE.DirectionalLight;
  private solidMat: THREE.MeshStandardMaterial;
  private waterMat: THREE.MeshStandardMaterial;
  private ghostSolid: THREE.MeshStandardMaterial;
  private ghostWater: THREE.MeshStandardMaterial;
  private tiles = new Map<string, THREE.Group>();
  private highlightMesh: THREE.InstancedMesh;
  private ghost: THREE.Group | null = null;
  private ghostId = '';
  private markers = new THREE.Group();
  private raycaster = new THREE.Raycaster();
  private pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BASE_TOP);

  target = new THREE.Vector3(0, BASE_TOP, 0);
  distance = START_DISTANCE;
  azimuth = 0;
  topInset = 0;
  bottomInset = 0;
  private w = 1;
  private h = 1;

  private quality: Quality;
  private ambient: Ambient | null = null;
  private traffic: Traffic | null = null;
  private ufo: Ufo | null = null;
  private animateWater = false;
  private waterLife: WaterLife | null = null;

  /** 依聚落邊數算出目前的時代（0 起算） */
  static eraOf(state: GameState): number {
    let edges = 0;
    for (const tile of Object.values(state.board)) for (const e of tile.edges) if (e === Terrain.Settlement) edges++;
    return ERA_THRESHOLDS.filter((n) => edges >= n).length;
  }

  /** 這個主題在某個時代會出現的交通工具 */
  vehicleOfEra(era: number): string | undefined {
    return this.theme.ambient?.eras[era - 1];
  }

  /** 有雲或鳥在動，需要每個畫面都重畫 */
  get animated(): boolean {
    return this.animateWater || !!this.ambient?.active;
  }

  /** 推進雲和鳥的動畫（秒） */
  tick(time: number, dt: number) {
    this.ambient?.update(time, dt, this.target);
    this.traffic?.update(time, dt, this.target);
    this.ufo?.update(time, dt, this.target);
    if (this.waterMat.normalMap) this.waterMat.normalMap.offset.set(time * 0.03, time * 0.018);
    this.waterLife?.update(time);
  }

  constructor(readonly canvas: HTMLCanvasElement, private theme: Theme, quality: Quality) {
    this.quality = quality;
    const q = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.ratio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (q.shadow) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }

    // 光線：溫暖的天空光 + 斜射的陽光
    this.scene.add(new THREE.HemisphereLight('#fff4e0', '#8a7560', 1.6));
    this.sun = new THREE.DirectionalLight('#ffe9cc', 2.2);
    this.sun.castShadow = q.shadow > 0;
    if (q.shadow) {
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      this.sun.shadow.bias = -0.0005;
      this.sun.shadow.normalBias = 0.02;
      this.sun.shadow.radius = 3;
    }
    this.scene.add(this.sun, this.sun.target);

    const grain = makeGrainTexture();
    this.solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain, roughness: 0.88, metalness: 0, flatShading: true });
    this.waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0, flatShading: true });
    // 會流動的波光（省電模式不動）
    this.animateWater = quality !== 'low';
    if (this.animateWater) {
      this.waterMat.flatShading = false;
      this.waterMat.normalMap = makeRippleNormalMap();
      this.waterMat.normalScale.set(0.45, 0.45);
      this.waterLife = new WaterLife(theme.heights[Terrain.Water], !!theme.ambient?.birds);
      this.scene.add(this.waterLife.group);
    }
    this.ghostSolid = this.solidMat.clone();
    this.ghostSolid.transparent = true;
    this.ghostSolid.opacity = 0.9;
    this.ghostWater = this.waterMat.clone();
    this.ghostWater.transparent = true;
    this.ghostWater.opacity = 0.9;

    // 可放置格：六角形外框
    const ring = new THREE.RingGeometry(0.72, 0.86, 6, 1, Math.PI / 6);
    ring.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.75, depthWrite: false });
    this.highlightMesh = new THREE.InstancedMesh(ring, ringMat, 256);
    this.highlightMesh.count = 0;
    this.highlightMesh.frustumCulled = false;
    this.scene.add(this.highlightMesh, this.markers);
    this.scene.fog = new THREE.Fog(theme.sky[1], 10, 30);

    // 雲和鳥（省電模式不放）
    if (theme.ambient && quality !== 'low') {
      this.ambient = new Ambient(theme.ambient, q.shadow > 0);
      this.scene.add(this.ambient.group);
      this.traffic = new Traffic(theme.ambient.eras);
      this.scene.add(this.traffic.group);
      if (theme.ambient.ufo) {
        this.ufo = new Ufo();
        this.scene.add(this.ufo.group);
      }
    }

    this.resize();
  }

  setInsets(top: number, bottom: number) {
    this.topInset = top;
    this.bottomInset = bottom;
    this.updateCamera();
  }

  dispose() {
    this.renderer.dispose();
    this.art?.renderer.dispose();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.renderer.setSize(this.w, this.h, false);
    this.updateCamera();
  }

  // ── 鏡頭 ──

  private updateCamera() {
    const cam = this.camera;
    cam.aspect = this.w / this.h;
    // 讓地圖中心落在上下 UI 之間
    const shift = (this.bottomInset - this.topInset) / 2;
    cam.setViewOffset(this.w, this.h, 0, shift, this.w, this.h);
    const ce = Math.cos(ELEVATION);
    cam.position.set(
      this.target.x + Math.sin(this.azimuth) * ce * this.distance,
      this.target.y + Math.sin(ELEVATION) * this.distance,
      this.target.z + Math.cos(this.azimuth) * ce * this.distance,
    );
    cam.lookAt(this.target);
    cam.updateProjectionMatrix();
    const fog = this.scene.fog as THREE.Fog;
    fog.near = this.distance * 1.1;
    fog.far = this.distance * 2.6;

    // 陽光跟著鏡頭目標移動，陰影範圍隨縮放調整
    const span = this.distance * 0.9;
    this.sun.position.set(this.target.x - 4, this.target.y + 9, this.target.z + 3);
    this.sun.target.position.copy(this.target);
    const sc = this.sun.shadow.camera;
    sc.left = -span;
    sc.right = span;
    sc.top = span;
    sc.bottom = -span;
    sc.near = 0.5;
    sc.far = 30;
    sc.updateProjectionMatrix();
  }

  /** 每像素對應的世界距離（約略） */
  private worldPerPixel() {
    return (2 * this.distance * Math.tan(THREE.MathUtils.degToRad(FOV / 2))) / this.h;
  }

  pan(dx: number, dy: number) {
    const s = this.worldPerPixel();
    const right = new THREE.Vector3(Math.cos(this.azimuth), 0, -Math.sin(this.azimuth));
    const fwd = new THREE.Vector3(-Math.sin(this.azimuth), 0, -Math.cos(this.azimuth));
    this.target.addScaledVector(right, -dx * s);
    this.target.addScaledVector(fwd, (dy * s) / Math.sin(ELEVATION));
    this.updateCamera();
  }

  zoom(factor: number) {
    this.distance = THREE.MathUtils.clamp(this.distance / factor, 4, 30);
    this.updateCamera();
  }

  rotate(delta: number) {
    this.azimuth += delta;
    this.updateCamera();
  }

  fitBoard(state: GameState) {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const k of Object.keys(state.board)) {
      const p = hexToPixel(parseKey(k), 1);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
    }
    this.target.set((minX + maxX) / 2, BASE_TOP, (minZ + maxZ) / 2);
    // 不把整張地圖塞進畫面，只稍微拉遠，保持近看風景的感覺
    const radius = Math.max(maxX - minX, maxZ - minZ) / 2;
    this.distance = THREE.MathUtils.clamp(START_DISTANCE + radius * 0.6, START_DISTANCE, 16);
    this.updateCamera();
  }

  // ── 卡牌插圖：用同一套模型、同樣的鏡頭角度拍單一地塊 ──

  private art: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; holder: THREE.Group } | null = null;
  private artCache = new Map<string, HTMLCanvasElement>();

  tileArt(edges: readonly Terrain[], seed: number, w: number, h: number): HTMLCanvasElement {
    const az = Math.round(this.azimuth * 20) / 20;
    const cacheKey = `${edges.join('')}|${seed}|${az}|${w}x${h}`;
    const hit = this.artCache.get(cacheKey);
    if (hit) return hit;

    if (!this.art) {
      const renderer = new THREE.WebGLRenderer({ antialias: this.quality !== 'low', alpha: true, preserveDrawingBuffer: true });
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight('#fff4e0', '#8a7560', 1.6));
      const sun = new THREE.DirectionalLight('#ffe9cc', 2.2);
      sun.position.set(-4, 9, 3);
      scene.add(sun);
      const holder = new THREE.Group();
      scene.add(holder);
      this.art = { renderer, scene, camera: new THREE.PerspectiveCamera(30, 1, 0.1, 50), holder };
    }
    const { renderer, scene, camera, holder } = this.art;
    renderer.setSize(w, h, false);
    for (const c of [...holder.children]) {
      holder.remove(c);
      this.disposeGroup(c as THREE.Group);
    }
    holder.add(this.makeTile(edges, seed, false));

    camera.aspect = w / h;
    const d = 3.7;
    const ce = Math.cos(ELEVATION);
    const target = new THREE.Vector3(0, BASE_TOP, 0);
    camera.position.set(Math.sin(az) * ce * d, BASE_TOP + Math.sin(ELEVATION) * d, Math.cos(az) * ce * d);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);

    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    out.getContext('2d')!.drawImage(renderer.domElement, 0, 0);
    if (this.artCache.size > 60) this.artCache.clear();
    this.artCache.set(cacheKey, out);
    return out;
  }

  /** 格子中心的螢幕座標（測試用） */
  hexToScreen(h: Hex): { x: number; y: number } {
    const p = hexToPixel(h, 1);
    const v = new THREE.Vector3(p.x, BASE_TOP, p.y).project(this.camera);
    return { x: ((v.x + 1) / 2) * this.w, y: ((1 - v.y) / 2) * this.h };
  }

  screenToHex(sx: number, sy: number): Hex | null {
    const ndc = new THREE.Vector2((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.pickPlane, hit)) return null;
    return pixelToHex(hit.x, hit.z, 1);
  }

  // ── 場景同步 ──

  private makeTile(edges: readonly Terrain[], seed: number, ghost: boolean): THREE.Group {
    const g = new THREE.Group();
    const geo = buildTileGeometry(this.theme, edges, seed);
    const solid = new THREE.Mesh(geo.solid, ghost ? this.ghostSolid : this.solidMat);
    solid.castShadow = solid.receiveShadow = !ghost;
    g.add(solid);
    if (geo.water) {
      const water = new THREE.Mesh(geo.water, ghost ? this.ghostWater : this.waterMat);
      water.receiveShadow = !ghost;
      g.add(water);
    }
    return g;
  }

  private disposeGroup(g: THREE.Group) {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== this.ghostRingGeo) o.geometry.dispose();
    });
  }

  render(input: BoardInput) {
    const { state } = input;

    // 地塊：新增缺的、移除多的（重新開局時）
    for (const [k, tile] of Object.entries(state.board)) {
      if (this.tiles.has(k)) continue;
      const g = this.makeTile(tile.edges, tile.seed, false);
      const p = hexToPixel(parseKey(k), 1);
      g.position.set(p.x, 0, p.y);
      this.waterLife?.addTile(p.x, p.y, tile.edges, tile.seed);
      this.scene.add(g);
      this.tiles.set(k, g);
    }
    for (const [k, g] of this.tiles) {
      if (state.board[k]) continue;
      this.scene.remove(g);
      this.disposeGroup(g);
      this.tiles.delete(k);
    }

    // 世界發展到新時代，天空多出交通工具
    if (this.traffic) {
      const era = Board3D.eraOf(state);
      if (era > this.traffic.era) this.traffic.setEra(era, this.target);
    }

    // 落下動畫
    for (const g of this.tiles.values()) {
      g.scale.setScalar(1);
      g.position.y = 0;
    }
    if (input.pop) {
      const g = this.tiles.get(key(input.pop.hex));
      if (g) {
        const t = input.pop.t;
        const ease = 1 - Math.pow(1 - t, 3);
        g.position.y = (1 - ease) * 0.6;
        g.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.06);
      }
    }

    // 可放置格
    const m = new THREE.Matrix4();
    const n = Math.min(input.highlights.length, 256);
    for (let i = 0; i < n; i++) {
      const p = hexToPixel(input.highlights[i], 1);
      m.makeTranslation(p.x, 0.02, p.y);
      this.highlightMesh.setMatrixAt(i, m);
    }
    this.highlightMesh.count = n;
    this.highlightMesh.instanceMatrix.needsUpdate = true;

    // 預覽
    const pv = input.preview;
    if (!pv || pv.id !== this.ghostId) {
      if (this.ghost) {
        this.scene.remove(this.ghost);
        this.disposeGroup(this.ghost);
        this.ghost = null;
      }
      this.markers.clear();
      this.ghostId = '';
      if (pv) {
        this.ghost = this.makeTile(pv.edges, 777, true);
        const p = hexToPixel(pv.hex, 1);
        this.ghost.position.set(p.x, GHOST_LIFT, p.y);
        // 落點的白色外框，讓預覽位置一眼就看得出來
        const ring = new THREE.Mesh(this.ghostRingGeo, this.ghostRingMat);
        ring.position.y = 0.03 - GHOST_LIFT;
        this.ghost.add(ring);
        this.scene.add(this.ghost);
        this.ghostId = pv.id;
        this.buildMarkers(state, pv.hex, pv.edges);
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private ghostRingGeo = new THREE.RingGeometry(0.86, 1.02, 6, 1, Math.PI / 6).rotateX(-Math.PI / 2);
  private ghostRingMat = new THREE.MeshBasicMaterial({ color: '#fff8e8', transparent: true, opacity: 0.95, depthWrite: false });
  private markerGeo = new THREE.SphereGeometry(0.085, 12, 8);
  private okMat = new THREE.MeshBasicMaterial({ color: '#4caf7a' });
  private badMat = new THREE.MeshBasicMaterial({ color: '#d9604c' });

  private buildMarkers(state: GameState, hex: Hex, edges: Terrain[]) {
    const c = hexToPixel(hex, 1);
    for (let d = 0; d < 6; d++) {
      const nb = state.board[key(neighbor(hex, d))];
      if (!nb) continue;
      const ok = nb.edges[opposite(d)] === edges[d];
      const a = corner(d, 1);
      const b = corner(d + 1, 1);
      const mk = new THREE.Mesh(this.markerGeo, ok ? this.okMat : this.badMat);
      mk.position.set(c.x + (a.x + b.x) / 2 * 0.95, BASE_TOP + GHOST_LIFT + 0.12, c.y + (a.y + b.y) / 2 * 0.95);
      this.markers.add(mk);
    }
  }
}
