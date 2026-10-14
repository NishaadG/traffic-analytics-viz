import * as THREE from 'three';
import { DATA } from '../data.js';
import { label, speedColor, glowSprite, hourLabel, clamp } from '../common.js';
import { makeCar } from '../car.js';

const R = 8.2, HL = 2.4, FLOOR = -3.1;            // tunnel radius, metres per hour, road height
const A0 = -.42, A1 = Math.PI + .42;             // arch sweep (rad)
const LEN = HL * 24;

export function buildHeat() {
  const group = new THREE.Group();
  // sensors ordered slowest -> fastest so the wall reads as a gradient from jam to flow
  const sensors = [...DATA.sensors].sort((a, b) => a.avg - b.avg);
  const S = sensors.length;

  /* heatmap wall: 24 hours x 12 sensors */
  const geo = new THREE.PlaneGeometry(2.55, HL - .14);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: true });
  const mesh = new THREE.InstancedMesh(geo, mat, 24 * S);
  const dummy = new THREE.Object3D();
  dummy.up.set(0, 0, 1);
  const c = new THREE.Color();
  for (let h = 0; h < 24; h++) {
    for (let j = 0; j < S; j++) {
      const a = A0 + (A1 - A0) * (j / (S - 1));
      const z = (h + .5) * HL;
      dummy.position.set(Math.cos(a) * R, Math.sin(a) * R, z);
      dummy.lookAt(0, 0, z);
      dummy.updateMatrix();
      const i = h * S + j;
      mesh.setMatrixAt(i, dummy.matrix);
      const s = sensors[j].speed[h];
      speedColor(s, c);
      c.multiplyScalar(.32 + .5 * clamp((46 - s) / 30, 0, 1));   // jams burn brighter
      mesh.setColorAt(i, c);
    }
  }
  mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  group.add(mesh);

  /* ribs between hours */
  const arcPts = n => Array.from({ length: n + 1 }, (_, k) => {
    const a = A0 + (A1 - A0) * (k / n);
    return new THREE.Vector3(Math.cos(a) * (R + .06), Math.sin(a) * (R + .06), 0);
  });
  const ribMat = new THREE.LineBasicMaterial({ color: 0x4fdcff, transparent: true, opacity: .35 });
  for (let h = 0; h <= 24; h++) {
    const g = new THREE.BufferGeometry().setFromPoints(arcPts(48));
    const l = new THREE.Line(g, ribMat);
    l.position.z = h * HL;
    group.add(l);
  }

  /* road */
  const road = new THREE.Mesh(new THREE.PlaneGeometry(11, LEN + 30), new THREE.MeshBasicMaterial({ color: 0x07061a }));
  road.rotation.x = -Math.PI / 2; road.position.set(0, FLOOR, LEN / 2 + 5);
  group.add(road);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  for (let z = -8; z < LEN + 14; z += 4) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(.18, .02, 1.6), dashMat);
    d.position.set(0, FLOOR + .02, z);
    group.add(d);
  }
  [-4.9, 4.9].forEach(x => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(.14, .06, LEN + 30), new THREE.MeshBasicMaterial({ color: 0xff2bd6 }));
    e.position.set(x, FLOOR + .03, LEN / 2 + 5);
    group.add(e);
  });

  /* labels: hours on the left wall, sensors at the entrance */
  for (let h = 0; h < 24; h += 3) {
    const l = label(hourLabel(h), 'lbl axis');
    l.position.set(-6.6, FLOOR + .5, (h + .5) * HL);
    group.add(l);
  }
  const first = sensors[0], last = sensors[S - 1];
  const lw = label(`<b>SLOWEST</b>${first.id} · ${first.road}<br>${first.avg.toFixed(1)} km/h`, 'lbl sens red');
  const aEnd = A0, aStart = A1;
  lw.position.set(Math.cos(aStart) * (R - .6), Math.sin(aStart) * (R - .6) + 1, -1.5);
  const lf = label(`<b>FASTEST</b>${last.id} · ${last.road}<br>${last.avg.toFixed(1)} km/h`, 'lbl sens cyan');
  lf.position.set(Math.cos(aEnd) * (R - .6), Math.sin(aEnd) * (R - .6) + 1, -1.5);
  // slowest sits at j=0 which is angle A0 (right side); fix label sides to match the wall
  lw.position.x = Math.cos(A0) * (R - .6); lw.position.y = Math.sin(A0) * (R - .6) + 1;
  lf.position.x = Math.cos(A1) * (R - .6); lf.position.y = Math.sin(A1) * (R - .6) + 1;
  group.add(lw, lf);
  const rushA = label('MORNING RUSH', 'lbl rush'), rushB = label('EVENING RUSH', 'lbl rush');
  rushA.position.set(0, R + 1.6, 8.5 * HL); rushB.position.set(0, R + 1.6, 18.5 * HL);
  group.add(rushA, rushB);

  /* car */
  const car = makeCar({ color: 0xff2bd6, length: 4.2 });
  car.group.position.set(0, FLOOR, 0);
  group.add(car.group);

  let z = 1;
  let ctxRef = null;
  const camZ = { v: z };

  return {
    group, fog: .016, bloom: .5,
    update(t, dt, ctx) {
      ctxRef = ctx;
      const h = clamp(Math.floor(z / HL), 0, 23);
      const sp = clamp(sensors.reduce((a, s) => a + s.speed[h], 0) / S, 5, 60);
      const v = sp * .14;
      z += v * dt;
      if (z > LEN + 2) { z = 1; camZ.v = z; ctx.flash?.(); }
      car.group.position.z = z;
      car.spin(v * dt);
      camZ.v += (z - camZ.v) * Math.min(1, dt * 5);
      ctx.hud?.(h, sp);
    },
    cam(t, p, l) {
      p.set(Math.sin(t * .5) * .8, FLOOR + 2.7, camZ.v - 8.2);
      l.set(0, FLOOR + 1.3, camZ.v + 7);
    },
  };
}
