import * as THREE from 'three';
import { DATA } from '../data.js';
import { label, speedColor, makeGrid, glowSprite, rng, mean, hourLabel, clamp } from '../common.js';
import { makeCar } from '../car.js';

const K = 2100;
const ROUTES = { R1: ['S01', 'S02', 'S03', 'S12'], R2: ['S11', 'S04', 'S05', 'S06'], R3: ['S10', 'S07', 'S08', 'S09'] };
const COL = { R1: 0x7b5cff, R2: 0xff2bd6, R3: 0x00f0ff };
const SEC_PER_MIN = 1.5;                       // race seconds per estimated minute

export function buildRace() {
  const group = new THREE.Group();
  group.add(makeGrid(260, 130, 0x3a2a9a, 0x1a1650, .5));

  const lat0 = mean(DATA.sensors.map(s => s.lat)), lon0 = mean(DATA.sensors.map(s => s.lon));
  const P = (lat, lon, y = .08) => new THREE.Vector3((lon - lon0) * K, y, -(lat - lat0) * K);
  const byId = Object.fromEntries(DATA.sensors.map(s => [s.id, { ...s, pos: P(s.lat, s.lon) }]));

  /* low skyline for context */
  const rnd = rng(21);
  const bm = new THREE.MeshBasicMaterial({ color: 0x0a0824 });
  const em = [0x00f0ff, 0xff2bd6, 0x7b5cff].map(c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .45 }));
  const curves = Object.fromEntries(Object.entries(ROUTES).map(([id, ids]) => [id, new THREE.CatmullRomCurve3(ids.map(i => byId[i].pos.clone()), false, 'catmullrom', .4)]));
  let placed = 0, guard = 0;
  while (placed < 170 && guard++ < 4000) {
    const x = (rnd() - .5) * 120, zz = (rnd() - .5) * 110, p = new THREE.Vector3(x, 0, zz);
    if (Object.values(byId).some(s => s.pos.distanceTo(p) < 4)) continue;
    if (Object.values(curves).some(cv => { for (let t = 0; t <= 1; t += .03) if (cv.getPoint(t).setY(0).distanceTo(p) < 3.4) return true; return false; })) continue;
    const w = 1 + rnd() * 2.2, d = 1 + rnd() * 2.2, h = .5 + Math.pow(rnd(), 2.4) * 6;
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, bm); m.position.set(x, h / 2, zz);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), em[Math.floor(rnd() * 3)]); e.position.copy(m.position);
    group.add(m, e); placed++;
  }

  /* roads (flat ribbons) + neon centre lines, grouped per route so they can be toggled */
  const routeGroups = {};
  Object.entries(curves).forEach(([id, cv]) => {
    const rg = new THREE.Group();
    const road = new THREE.Mesh(new THREE.TubeGeometry(cv, 140, 1.15, 8, false), new THREE.MeshBasicMaterial({ color: 0x14112e }));
    road.scale.y = .04;
    rg.add(road);
    rg.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 140, .1, 6, false), new THREE.MeshBasicMaterial({ color: COL[id] })));
    rg.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 140, .5, 6, false), new THREE.MeshBasicMaterial({ color: COL[id], transparent: true, opacity: .1, depthWrite: false })));
    const s = cv.getPoint(0), e = cv.getPoint(1);
    const hex = '#' + COL[id].toString(16).padStart(6, '0');
    const ls = label(`<b>${id}</b>START`, 'lbl rstart'); ls.element.style.setProperty('--c', hex); ls.position.set(s.x, 3.4, s.z);
    const lf = label('🏁', 'lbl flag'); lf.position.set(e.x, 2.8, e.z);
    [s, e].forEach(p => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 40), new THREE.MeshBasicMaterial({ color: COL[id], side: THREE.DoubleSide, transparent: true, opacity: .9 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, .12, p.z); rg.add(ring);
    });
    rg.add(ls, lf);
    group.add(rg);
    routeGroups[id] = rg;
  });

  /* sensor beacons: height = traffic volume, colour = speed, for the selected hour */
  const beacons = DATA.sensors.map(s => {
    const b = byId[s.id];
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, 1, 12), mat);
    const g = glowSprite(0x00f0ff, 4);
    const pickM = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pickM.position.set(b.pos.x, 1.2, b.pos.z); pickM.userData.id = s.id;
    m.position.set(b.pos.x, .5, b.pos.z);
    const l = label(s.id, 'lbl axis'); l.position.set(b.pos.x, -.6, b.pos.z);
    group.add(m, g, pickM, l);
    return { s, m, g, pickM, col: new THREE.Color(0x00f0ff), h: 1, scale: 1 };
  });
  const pickers = beacons.map(b => b.pickM);

  /* racers */
  const racers = Object.entries(curves).map(([id, cv]) => {
    const car = makeCar({ color: COL[id], length: 3 });
    group.add(car.group);
    return { id, cv, car, T: DATA.routes[id].time * SEC_PER_MIN, done: false, finish: 0, hidden: false };
  });
  const maxT = Math.max(...racers.map(r => r.T));
  let raceT = -1.2, ranks = 0, hRace = 6.2, hovered = null;
  const ahead = new THREE.Vector3(), tc = new THREE.Color();
  const rows = () => racers.map(r => ({ id: r.id, min: DATA.routes[r.id].time, rank: r.done ? r.finish : 0, hidden: r.hidden }));
  const restart = ctx => { raceT = -1.2; ranks = 0; racers.forEach(r => { r.done = false; }); ctx?.board?.(rows()); };
  const sensorHit = ray => { const h = ray.intersectObjects(pickers, false)[0]; return h ? beacons.find(b => b.pickM === h.object) : null; };

  return {
    group, fog: .009,
    onEnter(ctx) { restart(ctx); },
    restart,
    toggleRoute(id) {
      const r = racers.find(x => x.id === id);
      r.hidden = !r.hidden;
      routeGroups[id].visible = !r.hidden;
      r.car.group.visible = !r.hidden;
      return !r.hidden;
    },
    update(t, dt, ctx) {
      if (!ctx.paused) {
        raceT += dt;
        hRace = (hRace + dt / 1.9) % 24;
        if (raceT > maxT + 4.5) restart(ctx);
      }
      const fwd = ctx.input.fwd;
      if (fwd) { ctx.pause(true); hRace = (hRace + fwd * dt * 2 + 24) % 24; }
      const hh = Math.floor(hRace);

      beacons.forEach(b => {
        const sp = b.s.speed[hh], vo = b.s.volume[hh];
        speedColor(sp, tc).multiplyScalar(1.2);
        b.col.lerp(tc, Math.min(1, dt * 6));
        b.h += ((1 + vo / 9) - b.h) * Math.min(1, dt * 6);
        const target = hovered === b ? 1.5 : 1;
        b.scale += (target - b.scale) * Math.min(1, dt * 10);
        b.m.material.color.copy(b.col);
        b.m.scale.set(b.scale, b.h, b.scale);
        b.m.position.y = b.h / 2;
        b.g.position.set(b.m.position.x, b.h + .3, b.m.position.z);
        b.g.material.color.copy(b.col);
        b.g.scale.setScalar(3.4 * b.scale + vo / 25);
      });

      racers.forEach(r => {
        if (r.hidden) return;
        const s = Math.max(0, Math.min(1, raceT / r.T));
        const u = s < .06 ? s * s / .12 : s - .03;
        const uu = Math.max(0, Math.min(1, u / .97));
        const p = r.cv.getPointAt(uu);
        r.car.group.position.set(p.x, 0, p.z);
        r.cv.getPointAt(Math.min(1, uu + .008), ahead);
        r.car.group.lookAt(ahead.x, 0, ahead.z);
        if (!ctx.paused && raceT > 0 && s < 1) r.car.spin(dt * 14);
        if (s >= 1 && !r.done) { r.done = true; r.finish = ++ranks; }
      });
      if (ctx.board && Math.floor(t * 4) !== this._bt) { this._bt = Math.floor(t * 4); ctx.board(rows()); }
      ctx.hud?.(hh, mean(DATA.sensors.map(s => s.speed[hh])));
    },
    cam(t, p, l) {
      const a = t * .06 + .5;
      p.set(Math.sin(a) * 44, 36, Math.cos(a) * 44);
      l.set(0, 0, 0);
    },

    /* ---- interaction ---- */
    hover(ray) {
      const b = sensorHit(ray);
      hovered = b;
      if (!b) return null;
      const hh = Math.floor(hRace), s = b.s, sp = s.speed[hh];
      const cls = sp < 20 ? 'jam' : sp < 35 ? 'slow' : 'flow';
      return `<b>${s.id} · ${s.road}</b><span>Route ${s.route} · ${s.dist} km segment</span><big class="${cls}">${sp.toFixed(1)}<small>km/h</small></big>
        <span>${s.volume[hh].toFixed(0)} vehicles at ${hourLabel(hh)} · daily average ${s.avg.toFixed(1)} km/h</span><span class="dim">click to inspect this sensor</span>`;
    },
    leave() { hovered = null; },
    click(ray, ctx) {
      const b = sensorHit(ray);
      if (b) ctx.card(b.s, Math.floor(hRace));
    },
    setHour(h) { hRace = clamp(h, 0, 23) + .01; },
    drive(dx, dy, wheel, ctx) { ctx.pause(true); hRace = (hRace + (dx * .02 + wheel * .004) + 24) % 24; },
  };
}
