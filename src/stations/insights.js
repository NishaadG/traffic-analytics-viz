import * as THREE from 'three';
import { glowSprite, makeGrid, rng } from '../common.js';
import { makeCar } from '../car.js';

export function buildInsights() {
  const group = new THREE.Group();
  group.add(makeGrid(200, 100, 0x2a1a6a, 0x120e3a, .45));

  /* turntable */
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.8, .35, 64), new THREE.MeshStandardMaterial({ color: 0x090818, metalness: .9, roughness: .25 }));
  deck.position.y = -.18;
  group.add(deck);
  [[7.7, .12, 0x00f0ff], [6.2, .08, 0xff2bd6], [4.6, .06, 0x7b5cff]].forEach(([r, w, c]) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + w, 96), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .01;
    group.add(ring);
  });
  const halo = glowSprite(0x7b5cff, 30); halo.position.y = .5; halo.material.opacity = .45; group.add(halo);

  const carHolder = new THREE.Group();
  const car = makeCar({ color: 0xff1f4d, length: 5.6, lights: false });
  carHolder.add(car.group);
  group.add(carHolder);

  /* light pylons */
  [0, 1, 2, 3, 4, 5].forEach(i => {
    const a = (i / 6) * Math.PI * 2, col = i % 2 ? 0xff2bd6 : 0x00f0ff;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 16, 8), new THREE.MeshBasicMaterial({ color: col }));
    m.position.set(Math.cos(a) * 14, 8, Math.sin(a) * 14);
    const g = glowSprite(col, 6); g.position.set(m.position.x, 15.5, m.position.z);
    group.add(m, g);
  });

  /* drifting motes */
  const rnd = rng(5), N = 300, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (rnd() - .5) * 50; pos[i * 3 + 1] = rnd() * 18; pos[i * 3 + 2] = (rnd() - .5) * 50; }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(mg, new THREE.PointsMaterial({ size: .22, color: 0x9aa8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: halo.material.map }));
  motes.frustumCulled = false;
  group.add(motes);

  const k1 = new THREE.PointLight(0x00f0ff, 180, 40); k1.position.set(-9, 6, 6);
  const k2 = new THREE.PointLight(0xff2bd6, 180, 40); k2.position.set(9, 5, -6);
  group.add(k1, k2);

  return {
    group, fog: .012,
    update(t, dt) {
      carHolder.rotation.y += dt * .35;
      car.spin(dt * 2);
      motes.rotation.y += dt * .02;
    },
    cam(t, p, l) {
      p.set(Math.sin(t * .09) * 3, 3.2 + Math.sin(t * .2) * .4, 15.5);
      l.set(0, -1.9, 0);
    },
  };
}
