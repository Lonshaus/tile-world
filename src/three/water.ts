// 水面：會流動的波光，以及河裡的帆船、舢舨、鴨子，和偶爾跳出水面的各種魚
import * as THREE from 'three';
import { Terrain } from '../game';
import { corner } from '../hex';
import { seededRand } from '../themes/types';
import { BASE_TOP } from './geom';

/** 程式產生的波紋法線貼圖（可無縫重複） */
export function makeRippleNormalMap(size = 256): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rand = seededRand(7);
  const waves = Array.from({ length: 6 }, () => ({
    kx: (1 + Math.floor(rand() * 4)) * (rand() < 0.5 ? -1 : 1),
    ky: 1 + Math.floor(rand() * 4),
    a: 0.5 + rand(),
    p: rand() * Math.PI * 2,
  }));
  const height = (x: number, y: number) => {
    let h = 0;
    for (const w of waves) h += w.a * Math.sin(((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.p);
    return h;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y);
      const dy = height(x, y + 1) - height(x, y - 1);
      const n = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
      const i = (y * size + x) * 4;
      img.data[i] = (n.x * 0.5 + 0.5) * 255;
      img.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      img.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(0.8, 0.8);
  return tex;
}

const mat = (color: string, side: THREE.Side = THREE.FrontSide) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, side });

/** 船身（朝 +z） */
function hull(color: string, len: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, len, 6, 1).rotateX(Math.PI / 2), mat(color));
  m.scale.set(0.8, 0.55, 1);
  m.position.y = 0.012;
  return m;
}

/** 帆船 */
function sailboat(): THREE.Group {
  const g = new THREE.Group();
  g.add(hull('#7a5233', 0.18));
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), mat('#6a4528'));
  mast.position.y = 0.08;
  const sailGeo = new THREE.BufferGeometry();
  sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.02, 0, 0, 0.14, 0, 0, 0.02, -0.08], 3));
  sailGeo.computeVertexNormals();
  const sail = new THREE.Mesh(sailGeo, mat('#f3ead8', THREE.DoubleSide));
  sail.position.y = 0.01;
  g.add(mast, sail);
  return g;
}

/** 舢舨：窄長的小船，中間有竹篷，船尾有人搖櫓 */
function sampan(): THREE.Group {
  const g = new THREE.Group();
  g.add(hull('#5f4630', 0.22));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 8, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), mat('#a8875a', THREE.DoubleSide));
  roof.rotation.x = 0;
  roof.position.set(0, 0.03, 0);
  const person = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.014, 0.05, 6), mat('#3f4f6a'));
  person.position.set(0, 0.045, -0.085);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.015, 8), mat('#d8c08a'));
  hat.position.set(0, 0.078, -0.085);
  const oar = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.12, 4), mat('#6a4528'));
  oar.position.set(0.02, 0.03, -0.12);
  oar.rotation.x = 0.9;
  oar.name = 'oar';
  g.add(roof, person, hat, oar);
  return g;
}

/** 鴨子（朝 +z） */
function duck(size: number): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 0), mat('#f2eee2'));
  body.scale.set(0.8, 0.6, 1.2);
  body.position.y = 0.012;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.016, 0), mat('#3f7a4a'));
  head.position.set(0, 0.04, 0.025);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.006, 0.016, 4).rotateX(Math.PI / 2), mat('#e8a23a'));
  beak.position.set(0, 0.038, 0.045);
  g.add(body, head, beak);
  g.scale.setScalar(size);
  return g;
}

/** 在水面一小塊範圍內慢慢漂、會轉向的船或鴨子 */
interface Floater {
  objs: THREE.Group[];
  cx: number;
  cz: number;
  fx: number[];
  px: number[];
  range: number;
}

export class WaterLife {
  readonly group = new THREE.Group();
  private floaters: Floater[] = [];
  private spots: THREE.Vector3[] = [];
  private fish: THREE.Mesh;
  private splash: THREE.Mesh;
  private jump: { from: THREE.Vector3; start: number; height: number } | null = null;
  private nextJump = 3;
  private rand = seededRand(99);

  constructor(private waterHeight: number, private boatsEnabled: boolean) {
    this.fish = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.035, 0).scale(1, 0.8, 2),
      new THREE.MeshStandardMaterial({ color: '#d9a04a', roughness: 0.6, flatShading: true }),
    );
    this.fish.visible = false;
    this.splash = new THREE.Mesh(
      new THREE.RingGeometry(0.03, 0.05, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.splash.visible = false;
    this.group.add(this.fish, this.splash);
  }

  /** 新放下的地塊：記下水面位置，有機會放一艘小船 */
  addTile(cx: number, cz: number, edges: readonly Terrain[], seed: number) {
    const rand = seededRand(seed ^ 0x5bd1);
    const y = BASE_TOP + this.waterHeight;
    for (let d = 0; d < 6; d++) {
      if (edges[d] !== Terrain.Water) continue;
      const a = corner(d, 1);
      const b = corner(d + 1, 1);
      const x = cx + (a.x + b.x) * 0.3;
      const z = cz + (a.y + b.y) * 0.3;
      this.spots.push(new THREE.Vector3(x, y, z));
      if (this.boatsEnabled && rand() < 0.22) {
        // 帆船、舢舨，或一隻母鴨帶兩隻小鴨
        const roll = rand();
        const objs = roll < 0.35 ? [sailboat()] : roll < 0.65 ? [sampan()] : [duck(1), duck(0.6), duck(0.6)];
        for (const o of objs) {
          o.position.set(x, y, z);
          this.group.add(o);
        }
        this.floaters.push({
          objs,
          cx: x,
          cz: z,
          fx: [0.15 + rand() * 0.15, 0.11 + rand() * 0.1, 0.4 + rand() * 0.3],
          px: [rand() * 6, rand() * 6, rand() * 6],
          range: objs.length > 1 ? 0.13 : 0.1,
        });
      }
    }
  }

  update(time: number) {
    for (const f of this.floaters) {
      // 每個東西沿著不規則的路線漂；小鴨跟在母鴨後面（用稍早的位置）
      const at = (t: number) => ({
        x: f.cx + Math.sin(t * f.fx[0] + f.px[0]) * f.range + Math.sin(t * f.fx[2] + f.px[2]) * f.range * 0.3,
        z: f.cz + Math.cos(t * f.fx[1] + f.px[1]) * f.range,
      });
      f.objs.forEach((o, i) => {
        const t = time - i * 0.9;
        const p = at(t);
        const q = at(t + 0.05);
        o.position.x = p.x;
        o.position.z = p.z;
        o.rotation.set(Math.sin(time * 1.3 + i) * 0.05, Math.atan2(q.x - p.x, q.z - p.z), Math.sin(time * 1.7 + i) * 0.07, 'YXZ');
        const oar = o.getObjectByName('oar');
        if (oar) oar.rotation.z = Math.sin(time * 2.5) * 0.4;
      });
    }

    // 偶爾有魚跳出水面
    if (!this.jump && this.spots.length && time > this.nextJump) {
      const spot = this.spots[Math.floor(this.rand() * this.spots.length)];
      // 每次跳的魚不一樣：小橘魚、銀色小魚、大鯉魚
      const kinds: [string, number, number][] = [['#d9a04a', 1, 0.18], ['#c8d0d8', 0.7, 0.14], ['#e86f3a', 1.6, 0.24]];
      const [color, size, height] = kinds[Math.floor(this.rand() * kinds.length)];
      (this.fish.material as THREE.MeshStandardMaterial).color.set(color);
      this.fish.scale.setScalar(size);
      this.jump = { from: spot.clone(), start: time, height };
    }
    if (this.jump) {
      const t = (time - this.jump.start) / 0.9;
      if (t >= 1.6) {
        this.jump = null;
        this.fish.visible = this.splash.visible = false;
        this.nextJump = time + 4 + this.rand() * 8;
      } else {
        const p = this.jump.from;
        if (t < 1) {
          this.fish.visible = true;
          this.fish.position.set(p.x + (t - 0.5) * 0.2, p.y + Math.sin(t * Math.PI) * this.jump.height, p.z);
          this.fish.rotation.set(0, Math.PI / 2, (0.5 - t) * 2.2);
        } else {
          this.fish.visible = false;
        }
        // 入水的水花圈慢慢擴散
        const st = Math.max(0, t - 0.95) / 0.65;
        this.splash.visible = t > 0.95;
        this.splash.position.set(p.x + 0.1, p.y + 0.003, p.z);
        this.splash.scale.setScalar(1 + st * 3);
        (this.splash.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - st);
      }
    }
  }
}
