import * as THREE from 'three';
import { DATA } from '../data.js';
import { label, speedColor, hourLabel, clamp, mean } from '../common.js';
import { makeCar } from '../car.js';

const R = 8.2, HL = 2.4, FLOOR = -3.1;            // tunnel radius, length per hour, road height
const A0 = -.42, A1 = Math.PI + .42;             // arch sweep (rad)
const LEN = HL * 24;
const state = s => (s < 20 ? ['JAM', 'jam'] : s < 35 ? ['SLOW', 'slow'] : ['FLOWING', 'flow']);

export function buildHeat() {
  const group = new THREE.Group();
  // sensors ordered slowest -> fastest so the wall reads as a gradient from jam to flow
  const sensors = [...DATA.sensors].sort((a, b) => a.avg - b.avg);
  const S = sensors.length;
  const angle = j => A0 + (A1 - A0) * (j / (S - 1));

  /* heatmap wall: 24 hours x 12 sensors */
  const geo = new THREE.PlaneGeometry(2.55, HL - .14);
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geo, mat, 24 * S);
  const dummy = new THREE.Object3D();
  dummy.up.set(0, 0, 1);
  const c = new THREE.Color();
  for (let h = 0; h < 24; h++) {
    for (let j = 0; j < S; j++) {
      const a = angle(j), z = (h + .5) * HL;
      dummy.position.set(Math.cos(a) * R, Math.sin(a) * R, z);
      dummy.lookAt(0, 0, z);
      dummy.updateMatrix();
      const i = h * S + j;
      mesh.setMatrixAt(i, dummy.matrix);
      const s = sensors[j].speed[h];
      speedColor(s, c);
      c.multiplyScalar(.32 + .5 * clamp((46 - s) / 30, 0, 1));
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
  const ribMat = new THREE.LineBasicMaterial({ color: 0x4fdcff, transparent: true, opacity: .3 });
  for (let h = 0; h <= 24; h++) {
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arcPts(48)), ribMat);
    l.position.z = h * HL;
    group.add(l);
  }

  /* highlights: hovered cell, its sensor row, its hour ring, and the hour the car is in */
  const hlCell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(2.75, HL + .05)), new THREE.LineBasicMaterial({ color: 0xffffff }));
  hlCell.matrixAutoUpdate = false; hlCell.visible = false; group.add(hlCell);
  const hlRow = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, LEN)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75 }));
  hlRow.visible = false; group.add(hlRow);
  const ringGeo = new THREE.BufferGeometry().setFromPoints(arcPts(48));
  const hlHour = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 }));
  hlHour.visible = false; group.add(hlHour);
  const nowA = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0x00f0ff }));
  const nowB = new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0x00f0ff }));
  group.add(nowA, nowB);

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

  /* labels: hours on the left wall, sensors at the entrance, rush bands */
  for (let h = 0; h < 24; h += 3) {
    const l = label(hourLabel(h), 'lbl axis');
    l.position.set(-6.6, FLOOR + .5, (h + .5) * HL);
    group.add(l);
  }
  const first = sensors[0], last = sensors[S - 1];
  const lw = label(`<b>SLOWEST</b>${first.id} · ${first.road}<br>${first.avg.toFixed(1)} km/h`, 'lbl sens red');
  lw.position.set(Math.cos(A0) * (R - .6), Math.sin(A0) * (R - .6) + 1, -1.5);
  const lf = label(`<b>FASTEST</b>${last.id} · ${last.road}<br>${last.avg.toFixed(1)} km/h`, 'lbl sens cyan');
  lf.position.set(Math.cos(A1) * (R - .6), Math.sin(A1) * (R - .6) + 1, -1.5);
  const rushA = label('MORNING RUSH', 'lbl rush'), rushB = label('EVENING RUSH', 'lbl rush');
  rushA.position.set(0, R + 1.6, 8.5 * HL); rushB.position.set(0, R + 1.6, 18.5 * HL);
  group.add(lw, lf, rushA, rushB);

  /* car */
  const car = makeCar({ color: 0xff2bd6, length: 4.2 });
  car.group.position.set(0, FLOOR, 0);
  group.add(car.group);

  let z = 1, zPrev = 1;
  const camZ = { v: z };
  const m4 = new THREE.Matrix4();
  let hoverHour = -1;

  function clearHover() { hlCell.visible = hlRow.visible = hlHour.visible = false; hoverHour = -1; }

  return {
    group, fog: .016, bloom: .5,
    update(t, dt, ctx) {
      const h = clamp(Math.floor(z / HL), 0, 23);
      const sp = clamp(mean(sensors.map(s => s.speed[h])), 5, 60);
      const fwd = ctx.input.fwd;
      if (fwd) { ctx.pause(true); z += fwd * dt * 14; }
      else if (!ctx.paused) {
        z += sp * .14 * dt;
        if (z > LEN + 2) { z = 1; camZ.v = 1; zPrev = 1; ctx.flash?.(); }
      }
      z = clamp(z, 0, LEN + 2);
      car.group.position.z = z;
      car.spin(z - zPrev);
      zPrev = z;
      camZ.v += (z - camZ.v) * Math.min(1, dt * (ctx.paused ? 8 : 5));
      nowA.position.z = h * HL; nowB.position.z = (h + 1) * HL;
      ctx.hud?.(h, sp);
    },
    cam(t, p, l) {
      p.set(Math.sin(t * .5) * .8, FLOOR + 2.7, camZ.v - 8.2);
      l.set(0, FLOOR + 1.3, camZ.v + 7);
    },

    /* ---- interaction ---- */
    hover(ray) {
      const hit = ray.intersectObject(mesh, false)[0];
      if (!hit || hit.instanceId == null) { clearHover(); return null; }
      const i = hit.instanceId, h = Math.floor(i / S), j = i % S, s = sensors[j];
      mesh.getMatrixAt(i, m4); hlCell.matrix.copy(m4); hlCell.matrixWorldNeedsUpdate = true; hlCell.visible = true;
      const a = angle(j);
      hlRow.position.set(Math.cos(a) * (R + .1), Math.sin(a) * (R + .1), 0); hlRow.visible = true;
      hlHour.position.z = (h + .5) * HL; hlHour.visible = true;
      hoverHour = h;
      const sp = s.speed[h], [txt, cls] = state(sp), vs = (sp / s.avg - 1) * 100;
      return `<b>${s.id} · ${s.road}</b><span>${hourLabel(h)} – ${hourLabel((h + 1) % 24)}</span><big class="${cls}">${sp.toFixed(1)}<small>km/h</small></big>
        <em class="${cls}">${txt}</em><span>${vs >= 0 ? '+' : ''}${vs.toFixed(0)}% vs its daily average · ${s.volume[h].toFixed(0)} vehicles</span><span class="dim">click to inspect this sensor</span>`;
    },
    leave() { clearHover(); },
    click(ray, ctx) {
      const hit = ray.intersectObject(mesh, false)[0];
      if (!hit || hit.instanceId == null) return;
      const i = hit.instanceId, h = Math.floor(i / S), j = i % S;
      ctx.pause(true);
      z = (h + .5) * HL;
      ctx.card(sensors[j], h);
    },
    setHour(h) { z = (clamp(h, 0, 23) + .5) * HL; },
    drive(dx, dy, wheel, ctx) { ctx.pause(true); z = clamp(z + -dy * .05 + wheel * .014, 0, LEN + 2); },
  };
}
