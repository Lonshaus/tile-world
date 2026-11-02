// 隨世界發展依序出現的交通工具（熱氣球、飛機、潛水艇、太空船）
import * as THREE from 'three';
import { seededRand } from '../themes/types';
import type { Vehicle } from '../themes/types';
import { AREA } from './wildlife';

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

function submarine(): THREE.Group {
  const g = new THREE.Group();
  const yellow = mat('#e8b83a');
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.32, 4, 10).rotateZ(Math.PI / 2), yellow);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.06), yellow);
  tower.position.set(0.03, 0.1, 0);
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.08, 6), mat('#6a6a6a'));
  scope.position.set(0.05, 0.17, 0);
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.03), mat('#6a6a6a'));
  prop.position.x = -0.26;
  prop.name = 'prop';
  for (const z of [-0.06, 0.06]) {
    const win = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), new THREE.MeshStandardMaterial({ color: '#9fd8e8', roughness: 0.2 }));
    win.position.set(0.08, 0.02, z * 1.4);
    g.add(win);
  }
  g.add(hull, tower, scope, prop);
  return g;
}

function spaceship(): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.36, 10).rotateZ(Math.PI / 2), mat('#e8eaee'));
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 10).rotateZ(-Math.PI / 2), mat('#c8504a'));
  nose.position.x = 0.26;
  const finMat = mat('#c8504a');
  for (const [y, z] of [[0.07, 0], [-0.04, 0.06], [-0.04, -0.06]]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.01), finMat);
    fin.position.set(-0.14, y, z);
    if (z) fin.rotation.x = z > 0 ? -1 : 1;
    g.add(fin);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 8).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffb040', transparent: true, opacity: 0.85 }));
  flame.position.x = -0.27;
  g.add(body, nose, flame);
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

  constructor(private eras: Vehicle[]) {}

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
      switch (this.eras[this.era - 1]) {
        case 'balloons':
          add(balloon('#e07a5f'), 0.15, 2.2);
          add(balloon('#f2cc8f'), 0.12, 2.6);
          break;
        case 'propPlane':
          add(propPlane(), 1.2, 2.4);
          break;
        case 'jet':
          add(jet(), 2.2, 3.6);
          break;
        case 'submarine':
          add(submarine(), 0.5, 0.9);
          break;
        case 'spaceship':
          add(spaceship(), 1.8, 2.8);
          break;
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
