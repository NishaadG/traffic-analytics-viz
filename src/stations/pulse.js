import * as THREE from 'three';
import { DATA } from '../data.js';
import { A } from '../analysis.js';
import { label, speedColor, makeGrid, hourLabel, clamp, glowSprite, isPeak, speedCls } from '../common.js';
import { makeCar } from '../car.js';

const X = h => (h - 11.5) * 2.1, YS = .38;
const speedAtU = u => {
  const f = clamp(u, 0, 1) * 23, i = Math.floor(f), k = f - i;
  return DATA.hourly[i] * (1 - k) + DATA.hourly[Math.min(23, i + 1)] * k;
};

export function buildPulse() {
  const group = new THREE.Group();
  group.add(makeGrid(220, 110, 0x0a4a66, 0x1a1650, .45));

  const curve = new THREE.CatmullRomCurve3(DATA.hourly.map((s, h) => new THREE.Vector3(X(h), s * YS, 0)), false, 'catmullrom', .5);
  const N = 320, W = 3.4, c = new THREE.Color();

  /* ribbon + skirts (additive so the fade to black reads as transparent) */
  const verts = [], cols = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const p = curve.getPoint(i / N), s = p.y / YS;
    speedColor(s, c);
    const bot = c.clone().multiplyScalar(.02), mid = c.clone().multiplyScalar(.45);
    verts.push(p.x, p.y, W, p.x, p.y, -W, p.x, 0, W, p.x, 0, -W);
    cols.push(...mid.toArray(), ...mid.toArray(), ...bot.toArray(), ...bot.toArray());
    if (i < N) {
      const a = i * 4, b = (i + 1) * 4;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
      idx.push(a, a + 2, b, b, a + 2, b + 2);
      idx.push(a + 1, b + 1, a + 3, b + 1, b + 3, a + 3);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  rg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  rg.setIndex(idx);
  group.add(new THREE.Mesh(rg, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })));

  /* glowing crest lines (front + back edges) */
  const pts = curve.getPoints(N);
  [W, -W].forEach(z => {
    const cc = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p.x, p.y, z)));
    const tube = new THREE.TubeGeometry(cc, N, .14, 6, false);
    const tc = [], pa = tube.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      speedColor(pa.getY(i) / YS, c);
      tc.push(c.r * 1.5, c.g * 1.5, c.b * 1.5);
    }
    tube.setAttribute('color', new THREE.Float32BufferAttribute(tc, 3));
    group.add(new THREE.Mesh(tube, new THREE.MeshBasicMaterial({ vertexColors: true })));
  });

  /* hourly data points */
  const dots = DATA.hourly.map((s, h) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(.28, 10, 10), new THREE.MeshBasicMaterial({ color: speedColor(s).multiplyScalar(1.4) }));
    m.position.set(X(h), s * YS, 0);
    group.add(m);
    return m;
  });

  /* rush-hour slabs */
  [[6.5, 9.5, 'MORNING PEAK'], [15.5, 19.5, 'EVENING PEAK']].forEach(([a, b, txt]) => {
    const w = X(b) - X(a), g = new THREE.BoxGeometry(w, 20, W * 2 + 2.5);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: .07, depthWrite: false }));
    m.position.set((X(a) + X(b)) / 2, 10, 0);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), new THREE.LineBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: .55 }));
    e.position.copy(m.position);
    const l = label(txt, 'lbl rush');
    l.position.set(m.position.x, 21.8, 0);
    group.add(m, e, l);
  });

  /* labels */
  [0, 3, 6, 9, 12, 15, 18, 21, 23].forEach(h => {
    const l = label(hourLabel(h), 'lbl axis');
    l.position.set(X(h), -1.2, W + 1);
    group.add(l);
  });
  const lo = DATA.hourly.indexOf(Math.min(...DATA.hourly.slice(6, 11)));
  const hi = DATA.hourly.indexOf(Math.max(...DATA.hourly));
  const l1 = label(`${DATA.hourly[lo].toFixed(1)} km/h`, 'lbl val red');
  l1.position.set(X(lo), DATA.hourly[lo] * YS + 2.6, 0);
  const l2 = label(`${DATA.hourly[hi].toFixed(1)} km/h`, 'lbl val cyan');
  l2.position.set(X(hi), DATA.hourly[hi] * YS + 2.6, 0);
  group.add(l1, l2);

  /* hover marker */
  const pick = new THREE.Mesh(new THREE.PlaneGeometry(100, 34), new THREE.MeshBasicMaterial({ visible: false }));
  pick.position.set(0, 12, 0);
  group.add(pick);
  const marker = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 24, 0)]), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 }));
  marker.visible = false; group.add(marker);
  const markGlow = glowSprite(0xffffff, 3.4); markGlow.visible = false; group.add(markGlow);
  let hovered = -1;
  function unhover() { marker.visible = markGlow.visible = false; if (hovered >= 0) dots[hovered].scale.setScalar(1); hovered = -1; }
  const hourAt = ray => {
    const hit = ray.intersectObject(pick, false)[0];
    if (!hit) return -1;
    const p = group.worldToLocal(hit.point.clone());
    return clamp(Math.round(p.x / 2.1 + 11.5), 0, 23);
  };

  /* the car riding the crest */
  const car = makeCar({ color: 0x00e5ff, length: 6.5 });
  group.add(car.group);
  const ahead = new THREE.Vector3();
  let u = 0, uPrev = 0;

  return {
    group, fog: .008, bloom: .85,
    update(t, dt, ctx) {
      const sp = speedAtU(u);
      const fwd = ctx.input.fwd;
      if (fwd) { ctx.pause(true); u += fwd * dt * .07; }
      else if (!ctx.paused) { u += dt * sp * .1 / 48; if (u >= 1) u = 0; }
      u = clamp(u, 0, 1);
      const p = curve.getPoint(u);
      car.group.position.set(p.x, p.y + .15, 0);
      curve.getPoint(Math.min(1, u + .006), ahead);
      car.group.lookAt(ahead.x, ahead.y + .15, 0);
      car.spin((u - uPrev) * 48 * 1.2);
      uPrev = u;
      ctx.hud?.(Math.min(23, Math.floor(u * 23.999)), sp);
    },
    cam(t, p, l) {
      p.set(Math.sin(t * .11) * 22, 13 + Math.sin(t * .17) * 3, 50 + Math.cos(t * .11) * 4);
      l.set(0, 6, 0);
    },

    /* ---- interaction ---- */
    hover(ray) {
      const h = hourAt(ray);
      if (h < 0) { unhover(); return null; }
      if (hovered !== h) { if (hovered >= 0) dots[hovered].scale.setScalar(1); hovered = h; }
      dots[h].scale.setScalar(2.4);
      marker.position.set(X(h), 0, 0); marker.visible = true;
      markGlow.position.set(X(h), DATA.hourly[h] * YS, 0); markGlow.visible = true;
      const s = DATA.hourly[h], vol = A.hourly[h].volume, vs = (s / A.peak.off_speed - 1) * 100;
      const cls = speedCls(s);
      return `<b>${hourLabel(h)} – ${hourLabel((h + 1) % 24)}</b><big class="${cls}">${s.toFixed(1)}<small>km/h</small></big>
        <em class="${isPeak(h) ? 'jam' : 'flow'}">${isPeak(h) ? 'PEAK HOUR' : 'OFF-PEAK'}</em>
        <span>volume ${vol.toFixed(0)} · ${A.hourly[h].tt.toFixed(1)} min avg trip · ${vs >= 0 ? '+' : ''}${vs.toFixed(0)}% vs off-peak</span><span class="dim">click to send the car here</span>`;
    },
    leave() { unhover(); },
    click(ray, ctx) {
      const h = hourAt(ray);
      if (h < 0) return;
      ctx.pause(true);
      u = h / 23;
    },
    setHour(h) { u = clamp(h, 0, 23) / 23; },
    drive(dx, dy, wheel, ctx) { ctx.pause(true); u = clamp(u + dx * .0022 + wheel * .0003, 0, 1); },
  };
}
