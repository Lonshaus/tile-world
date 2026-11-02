// 天空的點綴：慢慢飄過的雲、成群盤旋的鳥
import * as THREE from 'three';
import { seededRand } from '../themes/types';

const AREA = 14; // 以鏡頭目標為中心，雲在這個範圍內循環

export class Ambient {
  readonly group = new THREE.Group();
  private clouds: THREE.Group[] = [];
  private flocks: { group: THREE.Group; radius: number; speed: number; phase: number; height: number; wings: THREE.Mesh[][] }[] = [];

  constructor(opts: { clouds: boolean; birds: boolean }, castShadow: boolean) {
    const rand = seededRand(2024);
    if (opts.clouds) {
      const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.92 });
      const puff = new THREE.IcosahedronGeometry(1, 1);
      for (let i = 0; i < 12; i++) {
        const cloud = new THREE.Group();
        const n = 3 + Math.floor(rand() * 3);
        for (let j = 0; j < n; j++) {
          const m = new THREE.Mesh(puff, mat);
          const s = 0.16 + rand() * 0.14;
          m.scale.set(s * 1.3, s * 0.75, s);
          m.position.set((j - n / 2) * 0.2 + rand() * 0.1, rand() * 0.07, rand() * 0.18 - 0.09);
          m.castShadow = castShadow;
          cloud.add(m);
        }
        cloud.position.set((rand() - 0.5) * AREA * 2, 1.7 + rand() * 0.6, (rand() - 0.5) * AREA * 2);
        cloud.userData.speed = 0.12 + rand() * 0.1;
        this.clouds.push(cloud);
        this.group.add(cloud);
      }
    }
    if (opts.birds) {
      const bodyMat = new THREE.MeshStandardMaterial({ color: '#f4f1ea', roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
      // 一邊翅膀：三角形，根部在原點
      const wing = new THREE.BufferGeometry();
      wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.04, 0, 0, 0.05, 0.16, 0, 0.0], 3));
      wing.computeVertexNormals();
      const body = new THREE.ConeGeometry(0.025, 0.14, 4).rotateX(Math.PI / 2);
      for (let f = 0; f < 2; f++) {
        const group = new THREE.Group();
        const wings: THREE.Mesh[][] = [];
        const count = 3 + Math.floor(rand() * 3);
        for (let b = 0; b < count; b++) {
          const bird = new THREE.Group();
          bird.add(new THREE.Mesh(body, bodyMat));
          const l = new THREE.Mesh(wing, bodyMat);
          const r = new THREE.Mesh(wing, bodyMat);
          r.scale.x = -1;
          bird.add(l, r);
          bird.scale.setScalar(0.7);
          bird.position.set(-b * 0.14 + rand() * 0.04, rand() * 0.08, (b % 2 ? 1 : -1) * b * 0.09);
          bird.userData.flap = rand() * Math.PI * 2;
          wings.push([l, r]);
          group.add(bird);
        }
        this.flocks.push({ group, radius: 3 + rand() * 3, speed: 0.25 + rand() * 0.15, phase: rand() * Math.PI * 2, height: 1.4 + rand() * 0.8, wings });
        this.group.add(group);
      }
    }
  }

  get active(): boolean {
    return this.clouds.length > 0 || this.flocks.length > 0;
  }

  update(time: number, dt: number, center: THREE.Vector3) {
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      // 飄出範圍就從另一邊回來
      if (c.position.x - center.x > AREA) c.position.x -= AREA * 2;
      if (c.position.x - center.x < -AREA) c.position.x += AREA * 2;
      if (c.position.z - center.z > AREA) c.position.z -= AREA * 2;
      if (c.position.z - center.z < -AREA) c.position.z += AREA * 2;
    }
    for (const f of this.flocks) {
      const a = f.phase + time * f.speed;
      f.group.position.set(center.x + Math.cos(a) * f.radius, f.height + Math.sin(time * 0.7 + f.phase) * 0.15, center.z + Math.sin(a) * f.radius);
      f.group.rotation.y = -a; // 朝飛行方向
      f.group.children.forEach((bird, i) => {
        const flap = Math.sin(time * 9 + bird.userData.flap) * 0.6;
        f.wings[i][0].rotation.z = flap;
        f.wings[i][1].rotation.z = -flap;
      });
    }
  }
}

// ── 隨著世界發展出現的交通工具 ──

/** 聚落邊數達到門檻就進入下一個時代 */
export const ERA_THRESHOLDS = [10, 25, 45];

function mat(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true });
}

function balloon(color: string): THREE.Group {
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), mat(color));
  env.scale.y = 1.15;
  env.position.y = 0.32;
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.07), mat('#8a5a2b'));
  g.add(env, basket);
  return g;
}

function propPlane(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.07), mat('#d9534f'));
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.5), mat('#f1e6d0'));
  wing.position.x = 0.04;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.015), mat('#d9534f'));
  tail.position.set(-0.19, 0.06, 0);
  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.18), mat('#f1e6d0'));
  tailWing.position.set(-0.19, 0.02, 0);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.14, 0.02), mat('#3a3a3a'));
  prop.position.x = 0.22;
  prop.name = 'prop';
  g.add(body, wing, tail, tailWing, prop);
  return g;
}

function jet(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.7, 8).rotateZ(Math.PI / 2), mat('#f4f4f2'));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 8).rotateZ(-Math.PI / 2), mat('#f4f4f2'));
  nose.position.x = 0.4;
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.012, 0.75), mat('#dfe3e8'));
  wing.position.x = 0.02;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.012), mat('#4a7fb5'));
  fin.position.set(-0.3, 0.08, 0);
  // 飛機雲：兩條往後拖的白線
  const trailMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55, depthWrite: false });
  for (const z of [-0.16, 0.16]) {
    const trail = new THREE.Mesh(new THREE.BoxGeometry(4, 0.02, 0.02), trailMat);
    trail.position.set(-2.3, 0, z);
    g.add(trail);
  }
  g.add(body, nose, wing, fin);
  return g;
}

interface Craft {
  obj: THREE.Object3D;
  /** 直線飛行：方向角、速度、高度；熱氣球則是慢慢飄 */
  heading: number;
  speed: number;
  height: number;
  bob: number;
}

export class Traffic {
  readonly group = new THREE.Group();
  private crafts: Craft[] = [];
  era = 0;

  setEra(era: number, center: THREE.Vector3) {
    const rand = seededRand(1000 + era);
    while (this.era < era) {
      this.era++;
      const add = (obj: THREE.Object3D, speed: number, height: number) => {
        const heading = rand() * Math.PI * 2;
        obj.position.set(center.x + (rand() - 0.5) * AREA, height, center.z + (rand() - 0.5) * AREA);
        this.crafts.push({ obj, heading, speed, height, bob: rand() * 6 });
        this.group.add(obj);
      };
      if (this.era === 1) {
        add(balloon('#e07a5f'), 0.15, 2.2);
        add(balloon('#f2cc8f'), 0.12, 2.6);
      } else if (this.era === 2) {
        add(propPlane(), 1.2, 2.4);
      } else if (this.era === 3) {
        add(jet(), 2.2, 3.6);
      }
    }
  }

  update(time: number, dt: number, center: THREE.Vector3) {
    for (const c of this.crafts) {
      const o = c.obj;
      o.position.x += Math.cos(c.heading) * c.speed * dt;
      o.position.z -= Math.sin(c.heading) * c.speed * dt;
      o.position.y = c.height + Math.sin(time * 0.8 + c.bob) * 0.06;
      o.rotation.y = c.heading;
      // 飛出範圍就從對面回來
      for (const axis of ['x', 'z'] as const) {
        const d = o.position[axis] - center[axis];
        if (d > AREA) o.position[axis] -= AREA * 2;
        if (d < -AREA) o.position[axis] += AREA * 2;
      }
      const prop = o.getObjectByName('prop');
      if (prop) prop.rotation.x = time * 40;
    }
  }
}

// ── 偶爾飛來的飛碟 ──

function ufoModel(): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.07, 16), new THREE.MeshStandardMaterial({ color: '#b9c0c8', roughness: 0.35, metalness: 0.6, flatShading: true }));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#8fe0d0', roughness: 0.2, transparent: true, opacity: 0.85 }));
  dome.position.y = 0.035;
  g.add(disc, dome);
  // 一圈小燈
  const lightMat = new THREE.MeshBasicMaterial({ color: '#ffe680' });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), lightMat);
    l.position.set(Math.cos(a) * 0.36, -0.02, Math.sin(a) * 0.36);
    g.add(l);
  }
  // 光束（停留時才出現）
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.45, 2.2, 16, 1, true),
    new THREE.MeshBasicMaterial({ color: '#c8fff0', transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
  );
  beam.position.y = -1.13;
  beam.name = 'beam';
  beam.visible = false;
  g.add(beam);
  return g;
}

export class Ufo {
  readonly group = ufoModel();
  private phase: 'idle' | 'in' | 'hover' | 'out' = 'idle';
  private timer: number;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private rand = seededRand(Date.now() & 0xffff);

  constructor() {
    this.group.visible = false;
    this.timer = this.nextWait();
  }

  /** 下一次出現前的等待秒數：大約 1.5～4 分鐘 */
  private nextWait() {
    return 90 + this.rand() * 150;
  }

  update(time: number, dt: number, center: THREE.Vector3) {
    this.timer -= dt;
    const g = this.group;
    const beam = g.getObjectByName('beam')!;
    g.rotation.y = time * 3;
    if (this.phase === 'idle') {
      if (this.timer > 0) return;
      const a = this.rand() * Math.PI * 2;
      this.from.set(center.x + Math.cos(a) * AREA, 4, center.z + Math.sin(a) * AREA);
      this.to.set(center.x + (this.rand() - 0.5) * 4, 2.2, center.z + (this.rand() - 0.5) * 4);
      g.position.copy(this.from);
      g.visible = true;
      this.phase = 'in';
      this.timer = 3;
    } else if (this.phase === 'in') {
      const t = 1 - Math.max(0, this.timer) / 3;
      g.position.lerpVectors(this.from, this.to, 1 - Math.pow(1 - t, 3));
      if (this.timer <= 0) {
        this.phase = 'hover';
        this.timer = 4;
        beam.visible = true;
      }
    } else if (this.phase === 'hover') {
      g.position.y = this.to.y + Math.sin(time * 3) * 0.05;
      if (this.timer <= 0) {
        beam.visible = false;
        this.phase = 'out';
        this.timer = 1.5;
      }
    } else {
      // 往上加速飛走
      g.position.y += dt * (4 + (1.5 - this.timer) * 10);
      g.position.x += dt * 3;
      if (this.timer <= 0) {
        g.visible = false;
        this.phase = 'idle';
        this.timer = this.nextWait();
      }
    }
  }
}
