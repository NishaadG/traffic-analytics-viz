import * as THREE from 'three';
import { A } from '../analysis.js';
import { label, speedColor, makeGrid, glowTexture, hourLabel, speedCls } from '../common.js';

const LV = [
  { k: 'High', color: 0xff2a55, css: 'jam', note: 'speed below 55% of free-flow' },
  { k: 'Moderate', color: 0xffb020, css: 'slow', note: '55 – 80% of free-flow speed' },
  { k: 'Low', color: 0x00f0ff, css: 'flow', note: '≥ 80% of free-flow speed' },
];

export function buildAnalysis() {
  const group = new THREE.Group();
  const grid = makeGrid(240, 120, 0x2a1a6a, 0x120e3a, .4);
  grid.position.y = -.01;
  group.add(grid);
  const total = A.summary.readings;

  /* ---------- 1. congestion donut (left) ---------- */
  const donut = new THREE.Group();
  donut.position.set(-30, 9, 0);
  group.add(donut);
  const arcs = [];
  let start = Math.PI / 2;
  LV.forEach(l => {
    const frac = A.levels[l.k] / total, ang = frac * Math.PI * 2;
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(6.2, 1.15, 16, 96, Math.max(.01, ang - .06)),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(l.color).multiplyScalar(1.1) }),
    );
    m.rotation.z = start + .03;
    m.userData.lv = l;
    donut.add(m);
    arcs.push(m);
    const mid = start + ang / 2;
    const t = label(`<b class="${l.css}">${l.k.toUpperCase()}</b>${(frac * 100).toFixed(0)}% · ${A.levels[l.k].toLocaleString()}`, 'lbl pct');
    t.position.set(Math.cos(mid) * 11.4, Math.sin(mid) * 11.4, 0);
    donut.add(t);
    start += ang;
  });
  const dc = label(`<b>${(total / 1000).toFixed(0)}k</b>records`, 'lbl donutc');
  donut.add(dc);
  const dTitle = label('CONGESTION LEVELS', 'lbl cap');
  dTitle.position.set(0, -11.5, 0);
  donut.add(dTitle);

  /* ---------- 2. scatter: volume x speed x hour (centre) ---------- */
  const sc = new THREE.Group();
  sc.position.set(0, 0, 0);
  group.add(sc);
  const VX = 26, SY = 19, HZ = 22;
  const px = v => (v / 700) * VX - VX / 2, py = s => (s / 100) * SY, pz = h => (h / 23) * HZ - HZ / 2;
  const n = A.pts.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), tc = new THREE.Color();
  A.pts.forEach(([v, s, h], i) => {
    pos[i * 3] = px(v); pos[i * 3 + 1] = py(s); pos[i * 3 + 2] = pz(h);
    speedColor(s, tc).multiplyScalar(1.3);
    col[i * 3] = tc.r; col[i * 3 + 1] = tc.g; col[i * 3 + 2] = tc.b;
  });
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  sc.add(new THREE.Points(pg, new THREE.PointsMaterial({ size: 1.0, vertexColors: true, map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  // frame + axes
  const box = new THREE.BoxGeometry(VX, SY, HZ);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: 0x4fdcff, transparent: true, opacity: .35 }));
  frame.position.set(0, SY / 2, 0);
  sc.add(frame);
  const floorG = makeGrid(VX, 8, 0x2a6a9a, 0x1a2a5a, .35);
  floorG.scale.set(1, 1, HZ / VX); floorG.position.y = .01;
  sc.add(floorG);
  const ax = (txt, x, y, z, cls = 'lbl axis') => { const l = label(txt, cls); l.position.set(x, y, z); sc.add(l); };
  ax('VOLUME → traffic volume index', 0, -1.2, HZ / 2 + 2.2, 'lbl cap');
  ax('SPEED → km/h', -VX / 2 - 5, SY / 2, HZ / 2, 'lbl cap');
  ax('HOUR →', VX / 2 + 2.6, -1.2, HZ / 2 + 3, 'lbl cap');
  [0, 25, 50, 75, 100].forEach(s => ax(String(s), -VX / 2 - .8, py(s), HZ / 2));
  [0, 200, 400, 600].forEach(v => ax(String(v), px(v), -.2, HZ / 2 + .8));
  [0, 6, 12, 18, 23].forEach(h => ax(hourLabel(h), VX / 2 + .9, -.2, pz(h)));
  // regression line speed ~ volume (all readings)
  const mv = A.pts.reduce((a, p) => a + p[0], 0) / n, ms = A.pts.reduce((a, p) => a + p[1], 0) / n;
  const slope = A.pts.reduce((a, p) => a + (p[0] - mv) * (p[1] - ms), 0) / A.pts.reduce((a, p) => a + (p[0] - mv) ** 2, 0), icpt = ms - slope * mv;
  const v0 = 10, v1 = 690;
  const trend = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(px(v0), py(icpt + slope * v0), -HZ / 2), new THREE.Vector3(px(v1), py(icpt + slope * v1), -HZ / 2)]),
  new THREE.LineBasicMaterial({ color: 0xffffff }));
  const trend2 = trend.clone(); trend2.position.z = HZ;
  sc.add(trend, trend2);
  ax(`r = ${A.corr}`, px(v1) + 3.2, py(icpt + slope * v1) + 2, -HZ / 2, 'lbl corr');
  const lr = label('<b>PEAK-HOUR CLUSTER</b>high volume · slower', 'lbl clus red'); lr.position.set(px(560), SY + 1.6, 0); sc.add(lr);
  const lf = label('<b>FREE-FLOW CLUSTER</b>low volume · fast', 'lbl clus cyan'); lf.position.set(px(60), SY + 1.6, 0); sc.add(lf);
  const sTitle = label(`SPEED vs VOLUME vs HOUR · ${n.toLocaleString()}-record sample`, 'lbl cap');
  sTitle.position.set(0, SY + 5, 0);
  sc.add(sTitle);

  /* ---------- 3. sensor bars (right) ---------- */
  const bars = new THREE.Group();
  bars.position.set(31, 0, 0);
  bars.scale.setScalar(.82);
  group.add(bars);
  const sorted = [...A.areas].sort((a, b) => a.avg - b.avg), NB = sorted.length;
  const barMeshes = [];
  const bx = i => (i - (NB - 1) / 2) * 3, BH = .45;
  sorted.forEach((s, i) => {
    const h = s.avg * BH, c = speedColor(s.avg).multiplyScalar(1.15);
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 1.6), new THREE.MeshBasicMaterial({ color: c }));
    m.position.set(bx(i), h / 2, 0);
    m.userData.s = s;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.8, .12, 1.8), new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.6) }));
    cap.position.set(bx(i), h + .06, 0);
    bars.add(m, cap);
    barMeshes.push(m);
    if (i === 0 || i === NB - 1) {
      const id = label(`${s.id}<br>${s.avg.toFixed(1)}`, 'lbl barv'); id.position.set(bx(i), h + 2, 0); bars.add(id);
    }
  });
  [[22, 'SLOW <22', 0xff2a55], [30, 'FLOW ≥30', 0xffb020]].forEach(([v, txt, c]) => {
    const y = v * BH, w = NB * 3 + 1;
    const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w / 2, y, 0), new THREE.Vector3(w / 2, y, 0)]), new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .8 }));
    bars.add(ln);
    const l = label(txt, 'lbl thr'); l.element.style.color = '#' + c.toString(16).padStart(6, '0'); l.position.set(w / 2 + 4.5, y, 0); bars.add(l);
  });
  const bTitle = label('AVG SPEED PER AREA', 'lbl cap');
  bTitle.position.set(0, 22, 0);
  bars.add(bTitle);

  /* hover picking: donut arcs + area bars */
  const pickable = [...arcs, ...barMeshes];
  let hot = null;
  return {
    group, fog: .008, bloom: .85,
    update(t, dt) {
      arcs.forEach(a => { a.scale.setScalar(a === hot ? 1.08 : 1); });
      barMeshes.forEach(b => { b.scale.x = b.scale.z = b === hot ? 1.3 : 1; });
    },
    cam(t, p, l) {
      const a = Math.sin(t * .1) * .2;
      p.set(-20 + Math.sin(a) * 96, 24 + Math.sin(t * .17) * 2.5, Math.cos(a) * 96);
      l.set(-20, 8, 0);
    },
    hover(ray) {
      const hit = ray.intersectObjects(pickable, false)[0];
      hot = hit ? hit.object : null;
      if (!hot) return null;
      if (hot.userData.lv) {
        const l = hot.userData.lv, c = A.levels[l.k];
        return `<b>${l.k} congestion</b><span>${l.note}</span><big class="${l.css}">${c.toLocaleString()}<small>records</small></big><span>${(c / total * 100).toFixed(1)}% of all ${total.toLocaleString()} records</span>`;
      }
      const s = hot.userData.s, cls = speedCls(s.avg);
      return `<b>${s.id} · ${s.name}</b><span>${s.n.toLocaleString()} records · ${s.tt.toFixed(1)} min avg trip</span><big class="${cls}">${s.avg.toFixed(1)}<small>km/h avg</small></big>
        <span>${s.loss.toFixed(1)}% speed loss vs free-flow · volume ${s.vol.toFixed(0)}</span>
        <span><i class="jam">${s.high.toLocaleString()}</i> high · <i class="slow">${s.mod.toLocaleString()}</i> moderate · <i class="flow">${s.low.toLocaleString()}</i> low</span>`;
    },
    leave() { hot = null; },
  };
}
