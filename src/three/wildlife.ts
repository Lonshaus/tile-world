// 場景裡會動的自然與超自然現象：各種鳥、雲、海底生物、衛星、彗星、流星、各式飛碟。
// 每種都有自己的動作，不再只是繞固定圓圈。
import * as THREE from 'three';
import type { Theme } from '../themes/types';
import { seededRand } from '../themes/types';

export const AREA = 14; // 以鏡頭目標為中心，東西在這個範圍內活動、飛出去就從另一邊回來

type R = () => number;

function mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
}
function glow(color: string, opacity = 1) {
  return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
}

/** 平滑、會變化的漫遊路徑：幾個不同頻率的正弦相加 */
function wanderer(rand: R, radius: number, speed: number) {
  const f = [0.21, 0.13, 0.34, 0.09].map((x) => x * (0.7 + rand() * 0.6) * speed);
  const p = [rand(), rand(), rand(), rand()].map((x) => x * Math.PI * 2);
  const a = [radius, radius * 0.45, radius, radius * 0.45];
  return (t: number) => ({
    x: a[0] * Math.sin(f[0] * t + p[0]) + a[1] * Math.sin(f[2] * t + p[2]),
    z: a[2] * Math.cos(f[1] * t + p[1]) + a[3] * Math.cos(f[3] * t + p[3]),
  });
}

/** 讓物件（模型朝 +z）面向移動方向，並依轉彎傾斜 */
function faceMotion(obj: THREE.Object3D, prev: THREE.Vector3, bankScale = 0) {
  const v = obj.position.clone().sub(prev);
  if (v.lengthSq() < 1e-8) return;
  const yaw = Math.atan2(v.x, v.z);
  const dyaw = Math.atan2(Math.sin(yaw - obj.rotation.y), Math.cos(yaw - obj.rotation.y));
  obj.rotation.set(-Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.7, yaw, THREE.MathUtils.clamp(-dyaw * bankScale * 30, -0.6, 0.6), 'YXZ');
}

function wrap(o: THREE.Object3D, center: THREE.Vector3) {
  for (const axis of ['x', 'z'] as const) {
    const d = o.position[axis] - center[axis];
    if (d > AREA) o.position[axis] -= AREA * 2;
    if (d < -AREA) o.position[axis] += AREA * 2;
  }
}

interface Agent {
  update(time: number, dt: number, center: THREE.Vector3): void;
}

// ───────────── 鳥 ─────────────

/** 鳥：身體 + 兩片翅膀（根部在原點，可以拍動），朝 +z */
function birdModel(color: string, size: number, wingShape: 'pointed' | 'broad' = 'pointed') {
  const m = mat(color, { side: THREE.DoubleSide });
  const span = wingShape === 'broad' ? 0.2 : 0.16;
  const chord = wingShape === 'broad' ? 0.07 : 0.045;
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -chord, 0, 0, chord, span, 0, -chord * 0.4], 3));
  wing.computeVertexNormals();
  const obj = new THREE.Group();
  obj.add(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.14, 4).rotateX(Math.PI / 2), m));
  const l = new THREE.Mesh(wing, m);
  const r = new THREE.Mesh(wing, m);
  r.scale.x = -1;
  obj.add(l, r);
  obj.scale.setScalar(size);
  return { obj, l, r };
}

function flap(b: { l: THREE.Mesh; r: THREE.Mesh }, angle: number) {
  b.l.rotation.z = angle;
  b.r.rotation.z = -angle;
}

/** 雁群：排成 V 字直直飛越地圖，飛出去換個方向再來 */
class GeeseV implements Agent {
  group = new THREE.Group();
  private birds: ReturnType<typeof birdModel>[] = [];
  private heading = 0;
  constructor(private rand: R, parent: THREE.Group) {
    const n = 5 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const b = birdModel('#e9e4d8', 1.1);
      const side = i % 2 ? 1 : -1;
      const rank = Math.ceil(i / 2);
      b.obj.position.set(side * rank * 0.16, 0, -rank * 0.16);
      this.birds.push(b);
      this.group.add(b.obj);
    }
    this.respawn(new THREE.Vector3());
    parent.add(this.group);
  }
  private respawn(center: THREE.Vector3) {
    this.heading = this.rand() * Math.PI * 2;
    this.group.position.set(center.x - Math.sin(this.heading) * AREA, 2 + this.rand() * 0.6, center.z - Math.cos(this.heading) * AREA);
    this.group.rotation.y = this.heading;
  }
  update(time: number, dt: number, center: THREE.Vector3) {
    const sp = 0.9;
    this.group.position.x += Math.sin(this.heading) * sp * dt;
    this.group.position.z += Math.cos(this.heading) * sp * dt;
    if (this.group.position.distanceTo(new THREE.Vector3(center.x, this.group.position.y, center.z)) > AREA * 1.05) this.respawn(center);
    this.birds.forEach((b, i) => flap(b, Math.sin(time * 5 + i * 0.6) * 0.5));
  }
}

/** 麻雀群：一小群在低空跳來跳去，各自亂動、快速拍翅 */
class Sparrows implements Agent {
  private birds: { b: ReturnType<typeof birdModel>; ox: number; oz: number; f: number; prev: THREE.Vector3 }[] = [];
  private path: (t: number) => { x: number; z: number };
  constructor(rand: R, parent: THREE.Group) {
    this.path = wanderer(rand, 5, 1.6);
    const n = 6 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i++) {
      const b = birdModel(rand() < 0.5 ? '#8a6a4a' : '#a07d58', 0.55, 'broad');
      this.birds.push({ b, ox: rand() * 6, oz: rand() * 6, f: 1.5 + rand(), prev: new THREE.Vector3() });
      parent.add(b.obj);
    }
  }
  update(time: number, _dt: number, center: THREE.Vector3) {
    const c = this.path(time);
    for (const s of this.birds) {
      s.prev.copy(s.b.obj.position);
      s.b.obj.position.set(
        center.x + c.x + Math.sin(time * s.f + s.ox) * 0.35,
        1.0 + Math.abs(Math.sin(time * s.f * 1.7 + s.oz)) * 0.25,
        center.z + c.z + Math.cos(time * s.f * 0.8 + s.oz) * 0.35,
      );
      faceMotion(s.b.obj, s.prev, 0.5);
      // 拍幾下、收翅一下，一跳一跳的
      const burst = Math.sin(time * 3 + s.ox) > -0.2;
      flap(s.b, burst ? Math.sin(time * 22 + s.ox) * 0.7 : -0.1);
    }
  }
}

/** 老鷹：張開翅膀在高空慢慢盤旋，偶爾拍幾下 */
class Eagle implements Agent {
  private b = birdModel('#5a4632', 1.9, 'broad');
  private path: (t: number) => { x: number; z: number };
  private prev = new THREE.Vector3();
  constructor(rand: R, parent: THREE.Group) {
    this.path = wanderer(rand, 6, 0.5);
    parent.add(this.b.obj);
  }
  update(time: number, _dt: number, center: THREE.Vector3) {
    const c = this.path(time);
    this.prev.copy(this.b.obj.position);
    this.b.obj.position.set(center.x + c.x, 3 + Math.sin(time * 0.3) * 0.3, center.z + c.z);
    faceMotion(this.b.obj, this.prev, 1.5);
    const flapping = Math.sin(time * 0.4) > 0.85;
    flap(this.b, flapping ? Math.sin(time * 7) * 0.45 : 0.08);
  }
}

/** 燕子：貼著地面快速俯衝、拉高，拍翅和滑翔交替 */
class Swallow implements Agent {
  private b = birdModel('#2f3f5f', 0.75);
  private path: (t: number) => { x: number; z: number };
  private prev = new THREE.Vector3();
  constructor(private rand: R, parent: THREE.Group) {
    this.path = wanderer(rand, 5, 3);
    parent.add(this.b.obj);
  }
  private phase = this.rand() * 10;
  update(time: number, _dt: number, center: THREE.Vector3) {
    const c = this.path(time);
    this.prev.copy(this.b.obj.position);
    this.b.obj.position.set(center.x + c.x, 0.55 + Math.abs(Math.sin(time * 0.9 + this.phase)) * 0.9, center.z + c.z);
    faceMotion(this.b.obj, this.prev, 2);
    flap(this.b, Math.sin(time * 1.3 + this.phase) > 0 ? Math.sin(time * 18) * 0.6 : -0.25);
  }
}

// ───────────── 雲 ─────────────

function cloud(rand: R, kind: 'wisp' | 'puffy' | 'stratus', m: THREE.Material, castShadow: boolean): THREE.Group {
  const g = new THREE.Group();
  const puff = new THREE.IcosahedronGeometry(1, 1);
  const n = kind === 'stratus' ? 6 : kind === 'puffy' ? 4 : 4;
  for (let j = 0; j < n; j++) {
    const mesh = new THREE.Mesh(puff, m);
    const s = 0.14 + rand() * 0.12;
    if (kind === 'wisp') {
      mesh.scale.set(s * 1.8, s * 0.18, s * 1.1);
      mesh.position.set((j - n / 2) * 0.28, rand() * 0.02, rand() * 0.2 - 0.1);
    } else if (kind === 'puffy') {
      mesh.scale.set(s * 1.1, s * 0.75, s);
      mesh.position.set((j - n / 2) * 0.17, j % 2 ? s * 0.4 : 0, rand() * 0.1 - 0.05);
    } else {
      mesh.scale.set(s * 2.4, s * 0.12, s * 0.7);
      mesh.position.set((j - n / 2) * 0.42, 0, rand() * 0.12 - 0.06);
    }
    mesh.castShadow = castShadow;
    g.add(mesh);
  }
  return g;
}

// ───────────── 海底生物 ─────────────

function fishModel(color: string, size: number) {
  const m = mat(color, { side: THREE.DoubleSide, roughness: 0.7 });
  const obj = new THREE.Group();
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), m);
  body.scale.set(0.7, 1, 1.8);
  const tailGeo = new THREE.BufferGeometry();
  tailGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0.045, -0.07, 0, -0.045, -0.07], 3));
  tailGeo.computeVertexNormals();
  const tail = new THREE.Mesh(tailGeo, m);
  tail.position.z = -0.08;
  obj.add(body, tail);
  obj.scale.setScalar(size);
  return { obj, tail };
}

/** 魚群：成群漫遊，每條魚在群裡各自擺動 */
class FishSchool implements Agent {
  private fish: { f: ReturnType<typeof fishModel>; ox: number; oy: number; oz: number; prev: THREE.Vector3 }[] = [];
  private path: (t: number) => { x: number; z: number };
  constructor(rand: R, parent: THREE.Group, color: string, size: number, private height: number) {
    this.path = wanderer(rand, 4.5, 0.9);
    const n = 5 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const f = fishModel(color, size);
      this.fish.push({ f, ox: (rand() - 0.5) * 0.5, oy: (rand() - 0.5) * 0.2, oz: (rand() - 0.5) * 0.5, prev: new THREE.Vector3() });
      parent.add(f.obj);
    }
  }
  update(time: number, _dt: number, center: THREE.Vector3) {
    const c = this.path(time);
    for (const s of this.fish) {
      s.prev.copy(s.f.obj.position);
      s.f.obj.position.set(
        center.x + c.x + s.ox + Math.sin(time * 1.3 + s.oz * 9) * 0.06,
        this.height + s.oy + Math.sin(time * 0.9 + s.ox * 7) * 0.05,
        center.z + c.z + s.oz,
      );
      faceMotion(s.f.obj, s.prev);
      s.f.tail.rotation.y = Math.sin(time * 10 + s.ox * 20) * 0.5;
    }
  }
}

/** 魟魚：扁平的身體，兩邊翅膀慢慢上下拍，滑過海底 */
class Manta implements Agent {
  private obj = new THREE.Group();
  private l: THREE.Mesh;
  private r: THREE.Mesh;
  private path: (t: number) => { x: number; z: number };
  private prev = new THREE.Vector3();
  constructor(rand: R, parent: THREE.Group) {
    const m = mat('#3f4f63', { side: THREE.DoubleSide });
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, 0, 0, -0.12, 0.32, 0, -0.04], 3));
    wing.computeVertexNormals();
    this.l = new THREE.Mesh(wing, m);
    this.r = new THREE.Mesh(wing, m);
    this.r.scale.x = -1;
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), m);
    body.scale.set(0.8, 0.35, 1.6);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.008, 0.35, 4).rotateX(Math.PI / 2), m);
    tail.position.z = -0.28;
    this.obj.add(body, this.l, this.r, tail);
    this.path = wanderer(rand, 6, 0.45);
    parent.add(this.obj);
  }
  update(time: number, _dt: number, center: THREE.Vector3) {
    const c = this.path(time);
    this.prev.copy(this.obj.position);
    this.obj.position.set(center.x + c.x, 1.1 + Math.sin(time * 0.5) * 0.2, center.z + c.z);
    faceMotion(this.obj, this.prev, 1);
    const a = Math.sin(time * 2.2) * 0.45;
    this.l.rotation.z = a;
    this.r.rotation.z = -a;
  }
}

/** 海龜：殼、頭、四隻鰭，慢慢划水 */
class Turtle implements Agent {
  private obj = new THREE.Group();
  private flippers: THREE.Mesh[] = [];
  private path: (t: number) => { x: number; z: number };
  private prev = new THREE.Vector3();
  constructor(rand: R, parent: THREE.Group) {
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), mat('#6f7a45'));
    shell.scale.set(0.9, 0.4, 1.1);
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.035, 0), mat('#a3a476'));
    head.position.set(0, 0.01, 0.13);
    this.obj.add(shell, head);
    for (const [x, z] of [[0.09, 0.05], [-0.09, 0.05], [0.07, -0.08], [-0.07, -0.08]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.01, 0.035), mat('#a3a476'));
      f.position.set(x, 0, z);
      this.flippers.push(f);
      this.obj.add(f);
    }
    this.path = wanderer(rand, 5, 0.3);
    parent.add(this.obj);
  }
  update(time: number, _dt: number, center: THREE.Vector3) {
    const c = this.path(time);
    this.prev.copy(this.obj.position);
    this.obj.position.set(center.x + c.x, 0.45 + Math.sin(time * 0.4) * 0.1, center.z + c.z);
    faceMotion(this.obj, this.prev);
    this.flippers.forEach((f, i) => (f.rotation.y = Math.sin(time * 2 + (i < 2 ? 0 : Math.PI)) * 0.5 * (i % 2 ? -1 : 1)));
  }
}

/** 水母：一縮一放往上漂，漂到頂再從底下出現 */
class Jellyfish implements Agent {
  private obj = new THREE.Group();
  private bell: THREE.Mesh;
  private y: number;
  constructor(private rand: R, parent: THREE.Group, private ox: number, private oz: number) {
    const color = ['#f0b8d8', '#c8b8f0', '#b8e0f0'][Math.floor(rand() * 3)];
    this.bell = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.75, roughness: 0.3, side: THREE.DoubleSide }),
    );
    this.obj.add(this.bell);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 3), glow(color, 0.6));
      t.position.set(Math.cos(a) * 0.035, -0.07, Math.sin(a) * 0.035);
      this.obj.add(t);
    }
    this.y = 0.3 + rand() * 2;
    parent.add(this.obj);
  }
  update(time: number, dt: number, center: THREE.Vector3) {
    const pulse = Math.max(0, Math.sin(time * 2.5 + this.ox));
    this.y += dt * (0.05 + pulse * 0.12);
    if (this.y > 2.6) {
      this.y = 0.2;
      this.ox = (this.rand() - 0.5) * 8;
      this.oz = (this.rand() - 0.5) * 8;
    }
    this.obj.position.set(center.x + this.ox + Math.sin(time * 0.3 + this.oz) * 0.3, this.y, center.z + this.oz);
    this.bell.scale.set(1 - pulse * 0.25, 1 + pulse * 0.2, 1 - pulse * 0.25);
  }
}

// ───────────── 太空 ─────────────

function panelSatellite(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.14), mat('#d8b04a', { roughness: 0.5, metalness: 0.4 })));
  const panelMat = mat('#3f5f9a', { roughness: 0.4, metalness: 0.3 });
  for (const x of [-0.2, 0.2]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.008, 0.1), panelMat);
    p.position.x = x;
    g.add(p);
  }
  const dish = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.04, 10, 1, true), mat('#eeeeee', { side: THREE.DoubleSide }));
  dish.position.y = 0.08;
  g.add(dish);
  return g;
}

function cubeSat(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), mat('#c8ccd2', { metalness: 0.5, roughness: 0.4 })));
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.14, 4), mat('#eeeeee'));
  ant.position.y = 0.09;
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.01, 6, 4), glow('#ff5040'));
  blink.position.y = 0.16;
  blink.name = 'blink';
  g.add(ant, blink);
  return g;
}

/** 衛星：沿傾斜的橢圓軌道繞，小方塊衛星會翻滾、閃燈 */
class Satellite implements Agent {
  private obj: THREE.Group;
  private a: number;
  private b: number;
  private speed: number;
  private phase: number;
  private tilt: number;
  private height: number;
  constructor(rand: R, parent: THREE.Group, private tumble: boolean) {
    this.obj = tumble ? cubeSat() : panelSatellite();
    this.a = 3 + rand() * 4;
    this.b = this.a * (0.5 + rand() * 0.4);
    this.speed = (0.1 + rand() * 0.12) * (rand() < 0.5 ? -1 : 1);
    this.phase = rand() * Math.PI * 2;
    this.tilt = (rand() - 0.5) * 0.5;
    this.height = 1.8 + rand() * 1.6;
    parent.add(this.obj);
  }
  update(time: number, _dt: number, center: THREE.Vector3) {
    const t = this.phase + time * this.speed;
    this.obj.position.set(center.x + Math.cos(t) * this.a, this.height + Math.sin(t) * this.tilt * this.a, center.z + Math.sin(t) * this.b);
    if (this.tumble) {
      this.obj.rotation.set(time * 0.7, time * 0.4, time * 0.25);
      const blink = this.obj.getObjectByName('blink');
      if (blink) blink.visible = Math.sin(time * 6) > 0.6;
    } else {
      this.obj.rotation.y = -t;
    }
  }
}

/** 彗星：每隔一段時間拖著長尾巴劃過天空 */
class Comet implements Agent {
  private obj = new THREE.Group();
  private t0 = 0;
  private wait: number;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  constructor(private rand: R, parent: THREE.Group) {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), glow('#e8f4ff'));
    const tail = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 1.6, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.8),
      new THREE.MeshBasicMaterial({ color: '#9fd0ff', transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }),
    );
    this.obj.add(head, tail);
    this.obj.visible = false;
    this.wait = 8 + rand() * 15;
    parent.add(this.obj);
  }
  update(time: number, _dt: number, center: THREE.Vector3) {
    if (!this.obj.visible) {
      if (time < this.wait) return;
      const a = this.rand() * Math.PI * 2;
      this.from.set(center.x + Math.cos(a) * AREA, 3.5 + this.rand(), center.z + Math.sin(a) * AREA);
      this.to.set(center.x - Math.cos(a) * AREA, 2.5 + this.rand(), center.z - Math.sin(a) * AREA * 0.6);
      this.t0 = time;
      this.obj.visible = true;
    }
    const k = (time - this.t0) / 7;
    if (k >= 1) {
      this.obj.visible = false;
      this.wait = time + 20 + this.rand() * 30;
      return;
    }
    this.obj.position.lerpVectors(this.from, this.to, k);
    this.obj.lookAt(this.to);
  }
}

/** 流星雨：偶爾一陣，一道道細細的亮線斜斜劃下來 */
class MeteorShower implements Agent {
  private streaks: { m: THREE.Mesh; start: number; from: THREE.Vector3; dir: THREE.Vector3 }[] = [];
  private next: number;
  constructor(private rand: R, private parent: THREE.Group) {
    this.next = 15 + rand() * 20;
  }
  update(time: number, _dt: number, center: THREE.Vector3) {
    if (time > this.next) {
      this.next = time + 40 + this.rand() * 40;
      const dir = new THREE.Vector3(-1, -0.6, 0.4).normalize();
      for (let i = 0; i < 8; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.012), glow('#fff4d0', 0.9));
        m.lookAt(dir);
        m.rotateY(Math.PI / 2);
        const from = new THREE.Vector3(center.x + (this.rand() - 0.2) * 8, 3.5 + this.rand(), center.z + (this.rand() - 0.5) * 8);
        this.streaks.push({ m, start: time + i * (0.15 + this.rand() * 0.3), from, dir });
        this.parent.add(m);
      }
    }
    for (const s of [...this.streaks]) {
      const k = (time - s.start) / 0.8;
      s.m.visible = k >= 0;
      if (k >= 1) {
        this.parent.remove(s.m);
        s.m.geometry.dispose();
        this.streaks.splice(this.streaks.indexOf(s), 1);
        continue;
      }
      s.m.position.copy(s.from).addScaledVector(s.dir, Math.max(0, k) * 4);
      (s.m.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.sin(Math.PI * Math.max(0, k));
    }
  }
}

// ───────────── 組合 ─────────────

export class Ambient {
  readonly group = new THREE.Group();
  private agents: Agent[] = [];
  private clouds: THREE.Group[] = [];

  constructor(opts: NonNullable<Theme['ambient']>, castShadow: boolean) {
    const rand = seededRand(2024);
    if (opts.clouds) {
      const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, transparent: true, opacity: 0.7, depthWrite: false });
      const kinds = ['wisp', 'wisp', 'puffy', 'stratus'] as const;
      for (let i = 0; i < 12; i++) {
        const c = cloud(rand, kinds[i % kinds.length], m, castShadow);
        c.position.set((rand() - 0.5) * AREA * 2, 1.7 + rand() * 0.8, (rand() - 0.5) * AREA * 2);
        c.userData.speed = 0.1 + rand() * 0.12;
        this.clouds.push(c);
        this.group.add(c);
      }
    }
    if (opts.birds) {
      this.agents.push(new GeeseV(rand, this.group));
      this.agents.push(new Sparrows(rand, this.group), new Sparrows(rand, this.group));
      this.agents.push(new Eagle(rand, this.group));
      for (let i = 0; i < 3; i++) this.agents.push(new Swallow(rand, this.group));
    }
    if (opts.fish) {
      this.agents.push(new FishSchool(rand, this.group, '#f0a040', 1, 0.6));
      this.agents.push(new FishSchool(rand, this.group, '#5fb0d8', 0.7, 0.9));
      this.agents.push(new FishSchool(rand, this.group, '#e8c040', 1.3, 0.45));
      this.agents.push(new Manta(rand, this.group), new Turtle(rand, this.group));
      for (let i = 0; i < 5; i++) this.agents.push(new Jellyfish(rand, this.group, (rand() - 0.5) * 8, (rand() - 0.5) * 8));
    }
    if (opts.satellites) {
      for (let i = 0; i < 4; i++) this.agents.push(new Satellite(rand, this.group, i % 2 === 1));
      this.agents.push(new Comet(rand, this.group), new MeteorShower(rand, this.group));
    }
  }

  get active(): boolean {
    return this.clouds.length > 0 || this.agents.length > 0;
  }

  update(time: number, dt: number, center: THREE.Vector3) {
    for (const c of this.clouds) {
      c.position.x += c.userData.speed * dt;
      wrap(c, center);
    }
    for (const a of this.agents) a.update(time, dt, center);
  }
}

// ───────────── 飛碟：每次出現隨機一種 ─────────────

type UfoKind = 'saucer' | 'cigar' | 'triangle' | 'orbs';

function saucerModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.07, 16), mat('#b9c0c8', { roughness: 0.35, metalness: 0.6 })));
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#8fe0d0', roughness: 0.2, transparent: true, opacity: 0.85 }),
  );
  dome.position.y = 0.035;
  g.add(dome);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), glow('#ffe680'));
    l.position.set(Math.cos(a) * 0.36, -0.02, Math.sin(a) * 0.36);
    g.add(l);
  }
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

function cigarModel(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 1.1, 6, 12).rotateX(Math.PI / 2), mat('#9aa0a8', { roughness: 0.3, metalness: 0.7 })));
  for (let i = 0; i < 7; i++) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), glow('#ffd070'));
    w.position.set(0.13, 0.02, -0.45 + i * 0.15);
    const w2 = w.clone();
    w2.position.x = -0.13;
    g.add(w, w2);
  }
  return g;
}

function triangleModel(): THREE.Group {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.45);
  shape.lineTo(0.4, -0.3);
  shape.lineTo(-0.4, -0.3);
  shape.closePath();
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false }).rotateX(Math.PI / 2), mat('#2f3238', { roughness: 0.4, metalness: 0.5 }));
  g.add(body);
  for (const [x, z] of [[0, 0.4], [0.35, -0.26], [-0.35, -0.26]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), glow('#ffffff'));
    l.position.set(x, -0.06, -z);
    g.add(l);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), glow('#ff4030'));
  core.position.y = -0.06;
  g.add(core);
  return g;
}

function orbsModel(): THREE.Group {
  const g = new THREE.Group();
  for (const color of ['#ffe0a0', '#a0ffe0', '#ffa0e0']) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), glow(color));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), glow(color, 0.3));
    o.add(halo);
    g.add(o);
  }
  return g;
}

export class Ufo {
  readonly group = new THREE.Group();
  private models: Record<UfoKind, THREE.Group>;
  private kind: UfoKind | null = null;
  private t0 = 0;
  private next: number;
  private rand = seededRand(Date.now() & 0xffff);
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private waypoints: THREE.Vector3[] = [];

  constructor() {
    this.models = { saucer: saucerModel(), cigar: cigarModel(), triangle: triangleModel(), orbs: orbsModel() };
    for (const m of Object.values(this.models)) {
      m.visible = false;
      this.group.add(m);
    }
    this.next = this.wait();
  }

  /** 下一次出現前的等待秒數：大約 1.5～4 分鐘 */
  private wait() {
    return 90 + this.rand() * 150;
  }

  update(time: number, _dt: number, center: THREE.Vector3) {
    if (!this.kind) {
      if (time < this.next) return;
      const kinds: UfoKind[] = ['saucer', 'cigar', 'triangle', 'orbs'];
      this.kind = kinds[Math.floor(this.rand() * kinds.length)];
      this.t0 = time;
      const a = this.rand() * Math.PI * 2;
      this.from.set(center.x + Math.cos(a) * AREA, 3.5, center.z + Math.sin(a) * AREA);
      this.to.set(center.x + (this.rand() - 0.5) * 4, 2.2, center.z + (this.rand() - 0.5) * 4);
      this.waypoints = Array.from({ length: 5 }, () => new THREE.Vector3(center.x + (this.rand() - 0.5) * 8, 1.8 + this.rand() * 1.2, center.z + (this.rand() - 0.5) * 8));
      this.models[this.kind].visible = true;
    }
    const m = this.models[this.kind];
    const t = time - this.t0;
    let done = false;
    switch (this.kind) {
      case 'saucer': {
        // 飛進來、停住打光束、加速往上飛走
        const beam = m.getObjectByName('beam')!;
        m.rotation.y = time * 3;
        if (t < 3) m.position.lerpVectors(this.from, this.to, 1 - Math.pow(1 - t / 3, 3));
        else if (t < 7) m.position.y = this.to.y + Math.sin(time * 3) * 0.05;
        else m.position.y += 0.05 + (t - 7) * 0.3;
        beam.visible = t >= 3 && t < 7;
        done = t > 8.5;
        break;
      }
      case 'cigar': {
        // 雪茄形母艦：高高地、慢慢地直直飛過
        const k = t / 16;
        m.position.lerpVectors(this.from, new THREE.Vector3(2 * center.x - this.from.x, 3.6, 2 * center.z - this.from.z), k);
        m.position.y = 3.6;
        m.lookAt(2 * center.x - this.from.x, 3.6, 2 * center.z - this.from.z);
        done = k >= 1;
        break;
      }
      case 'triangle': {
        // 三角形：在幾個點之間瞬間移動、停一下，之字形
        const seg = Math.floor(t / 1.1);
        if (seg >= this.waypoints.length - 1) {
          m.position.y += 0.4;
          done = t > this.waypoints.length * 1.1 + 0.6;
        } else {
          const k = Math.min(1, ((t % 1.1) / 0.25));
          m.position.lerpVectors(this.waypoints[seg], this.waypoints[seg + 1], 1 - Math.pow(1 - k, 4));
        }
        m.rotation.y = time * 0.6;
        break;
      }
      case 'orbs': {
        // 三顆光球互相繞著漂移，最後縮小消失
        const c = new THREE.Vector3().lerpVectors(this.waypoints[0], this.waypoints[1], Math.min(1, t / 9));
        m.position.copy(c);
        m.children.forEach((o, i) => {
          const a = time * 2.2 + (i * Math.PI * 2) / 3;
          o.position.set(Math.cos(a) * 0.3, Math.sin(time * 3 + i) * 0.12, Math.sin(a) * 0.3);
        });
        const fade = t > 8 ? Math.max(0.01, 1 - (t - 8)) : Math.min(1, t * 2);
        m.scale.setScalar(fade);
        done = t > 9;
        break;
      }
    }
    if (done) {
      m.visible = false;
      m.scale.setScalar(1);
      this.kind = null;
      this.next = time + this.wait();
    }
  }
}
