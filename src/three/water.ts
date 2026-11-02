// 水面：會流動的波光，以及河裡的小船、偶爾跳出水面的魚
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

function boatModel(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: '#7a5233', roughness: 0.9, flatShading: true });
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.035, 0.18, 6, 1).rotateZ(Math.PI / 2), wood);
  hull.scale.set(1, 0.55, 0.8);
  hull.position.y = 0.012;
  g.add(hull);
  if (rand() < 0.6) {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.14, 4), wood);
    mast.position.y = 0.08;
    const sailGeo = new THREE.BufferGeometry();
    sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0.02, 0, 0, 0.14, 0, -0.08, 0.02, 0], 3));
    sailGeo.computeVertexNormals();
    const sail = new THREE.Mesh(sailGeo, new THREE.MeshStandardMaterial({ color: '#f3ead8', roughness: 0.9, side: THREE.DoubleSide }));
    sail.position.y = 0.01;
    g.add(mast, sail);
  }
  return g;
}

interface Boat {
  obj: THREE.Group;
  cx: number;
  cz: number;
  radius: number;
  speed: number;
  phase: number;
}

export class WaterLife {
  readonly group = new THREE.Group();
  private boats: Boat[] = [];
  private spots: THREE.Vector3[] = [];
  private fish: THREE.Mesh;
  private splash: THREE.Mesh;
  private jump: { from: THREE.Vector3; start: number } | null = null;
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
      if (this.boatsEnabled && rand() < 0.18) {
        const obj = boatModel(rand);
        obj.position.set(x, y, z);
        this.boats.push({ obj, cx: x, cz: z, radius: 0.08 + rand() * 0.06, speed: (0.2 + rand() * 0.2) * (rand() < 0.5 ? -1 : 1), phase: rand() * 6 });
        this.group.add(obj);
      }
    }
  }

  update(time: number) {
    for (const b of this.boats) {
      const a = b.phase + time * b.speed;
      b.obj.position.x = b.cx + Math.cos(a) * b.radius;
      b.obj.position.z = b.cz + Math.sin(a) * b.radius;
      b.obj.rotation.y = -a + (b.speed > 0 ? -Math.PI / 2 : Math.PI / 2);
      // 隨水輕輕晃
      b.obj.rotation.z = Math.sin(time * 1.7 + b.phase) * 0.08;
      b.obj.rotation.x = Math.sin(time * 1.3 + b.phase) * 0.05;
    }

    // 偶爾有魚跳出水面
    if (!this.jump && this.spots.length && time > this.nextJump) {
      const spot = this.spots[Math.floor(this.rand() * this.spots.length)];
      this.jump = { from: spot.clone(), start: time };
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
          this.fish.position.set(p.x + (t - 0.5) * 0.2, p.y + Math.sin(t * Math.PI) * 0.18, p.z);
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
