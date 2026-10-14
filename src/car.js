import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { glowTexture } from './common.js';

let template = null, envTex = null, beamTex = null;
const base = import.meta.env.BASE_URL;

export async function loadCar(renderer, onProgress) {
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  try {
    const draco = new DRACOLoader();
    draco.setDecoderPath(base + 'draco/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    const gltf = await loader.loadAsync(base + 'models/ferrari.glb', e => e.total && onProgress?.(e.loaded / e.total));
    template = gltf.scene.children[0];
    template.updateMatrixWorld(true);
  } catch (err) {
    console.warn('Car model failed, using fallback', err);
    template = null;
  }
}

function beam() {
  if (beamTex) return beamTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 128, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(24, 128); g.lineTo(40, 128); g.lineTo(62, 0); g.lineTo(2, 0); g.closePath(); g.fill();
  beamTex = new THREE.CanvasTexture(c);
  return beamTex;
}

/* Returns {group, wheels, spin(distance)} - car faces +Z, sits on y=0, centred on x/z. */
export function makeCar({ color = 0xff2a55, length = 4.4, lights = true } = {}) {
  const pivot = new THREE.Group();
  const wheels = [];
  let halfLen = length / 2, halfW = length * .22;

  if (template) {
    const car = template.clone(true);
    const body = car.getObjectByName('body');
    if (body) {
      body.material = new THREE.MeshPhysicalMaterial({ color, metalness: 1, roughness: .45, clearcoat: 1, clearcoatRoughness: .03 });
    }
    car.traverse(o => {
      if (o.isMesh && o.material) {
        const m = o.material;
        if (m.envMap !== undefined) { m.envMap = envTex; m.envMapIntensity = 1.1; }
      }
    });
    ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].forEach(n => { const w = car.getObjectByName(n); if (w) wheels.push(w); });

    // work out which way the nose points, then rotate so it faces +Z
    car.updateMatrixWorld(true);
    const fl = car.getObjectByName('wheel_fl'), rl = car.getObjectByName('wheel_rl');
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    if (fl && rl) {
      fl.getWorldPosition(a); rl.getWorldPosition(b);
      car.rotation.y = -Math.atan2(a.x - b.x, a.z - b.z);
    }
    const holder = new THREE.Group();
    holder.add(car);
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder), size = box.getSize(new THREE.Vector3()), ctr = box.getCenter(new THREE.Vector3());
    const s = length / Math.max(size.z, .001);
    holder.scale.setScalar(s);
    holder.position.set(-ctr.x * s, -box.min.y * s, -ctr.z * s);
    pivot.add(holder);
    halfW = size.x * s / 2;
  } else {
    // fallback: simple wedge car
    const mat = new THREE.MeshStandardMaterial({ color, metalness: .8, roughness: .3 });
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(length * .45, length * .13, length), mat);
    bodyM.position.y = length * .13;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(length * .36, length * .12, length * .5), new THREE.MeshStandardMaterial({ color: 0x0a0a18, metalness: 1, roughness: .1 }));
    cab.position.set(0, length * .25, -length * .05);
    pivot.add(bodyM, cab);
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([x, z]) => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(length * .1, length * .1, length * .08, 20), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      w.rotation.z = Math.PI / 2; w.position.set(x * length * .24, length * .1, z * length * .3);
      pivot.add(w); wheels.push(w);
    });
  }

  if (lights) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2.6, length * 1.7), new THREE.MeshBasicMaterial({
      map: beam(), transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfeaff, fog: false,
    }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(0, .04, halfLen + length * .8);
    pivot.add(pool);
    [-1, 1].forEach(x => {
      const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff1a44, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      t.scale.setScalar(length * .13); t.position.set(x * halfW * .62, length * .17, -halfLen);
      pivot.add(t);
    });
  }

  return {
    group: pivot, wheels,
    spin(dist) { wheels.forEach(w => { w.rotation.x += dist * 1.3; }); },
  };
}
