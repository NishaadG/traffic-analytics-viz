import * as THREE from 'three';
import { DATA } from '../data.js';
import { label, speedColor, makeGrid, glowSprite, rng, mean, hourLabel, clamp, speedCls } from '../common.js';
import { makeCar } from '../car.js';

/* the dataset has no coordinates: tracks and area positions are an illustrative layout, not a real map */
const TRACKS = {
  Highway: [[-44, -8], [-32, -28], [0, -38], [32, -28], [44, -8]],
  Arterial: [[-44, 2], [-20, 2], [0, -1], [20, 2], [44, 2]],
  Collector: [[-44, 12], [-24, 15], [-6, 9], [10, 17], [26, 11], [44, 12]],
  Local: [[-44, 22], [-32, 27], [-14, 22], [0, 32], [16, 22], [32, 30], [44, 22]],
};
const SPOT = { CTR: [-8, -13], BIZ: [12, -16], SHP: [-22, -11], TRN: [24, -9], RES: [-30, 42], UNI: [-8, 44], IND: [14, 42], SUB: [34, 44] };
const COL = { Highway: 0x00f0ff, Arterial: 0x7b5cff, Collector: 0xff2bd6, Local: 0xffb020 };
export const CODE = { Highway: 'HWY', Arterial: 'ART', Collector: 'COL', Local: 'LOC' };
const SEC_PER_MIN = .5;                        // race seconds per average trip minute

export function buildRace() {
  const group = new THREE.Group();
  group.add(makeGrid(260, 130, 0x3a2a9a, 0x1a1650, .5));

  const roads = Object.fromEntries(DATA.roads.map(r => [r.id, r]));
  const areas = DATA.areas.map(a => ({ ...a, pos: new THREE.Vector3(SPOT[a.id][0], .08, SPOT[a.id][1]) }));
  const curves = Object.fromEntries(Object.entries(TRACKS).map(([id, pts]) => [id, new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, .08, z)), false, 'catmullrom', .4)]));

  /* low skyline for context */
  const rnd = rng(21);
  const bm = new THREE.MeshBasicMaterial({ color: 0x0a0824 });
  const em = [0x00f0ff, 0xff2bd6, 0x7b5cff].map(c => new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: .45 }));
  let placed = 0, guard = 0;
  while (placed < 190 && guard++ < 5000) {
    const x = (rnd() - .5) * 120, zz = (rnd() - .5) * 120, p = new THREE.Vector3(x, 0, zz);
    if (areas.some(a => a.pos.distanceTo(p) < 4.5)) continue;
    if (Object.values(curves).some(cv => { for (let t = 0; t <= 1; t += .02) if (cv.getPoint(t).setY(0).distanceTo(p) < 3.4) return true; return false; })) continue;
    const w = 1 + rnd() * 2.2, d = 1 + rnd() * 2.2, h = .5 + Math.pow(rnd(), 2.4) * 6;
    const g = new THREE.BoxGeometry(w, h, d);
    const m = new THREE.Mesh(g, bm); m.position.set(x, h / 2, zz);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(g), em[Math.floor(rnd() * 3)]); e.position.copy(m.position);
    group.add(m, e); placed++;
  }

  /* roads (flat ribbons) + neon centre lines, grouped per road type so they can be toggled */
  const routeGroups = {};
  Object.entries(curves).forEach(([id, cv], k) => {
    const rg = new THREE.Group();
    const road = new THREE.Mesh(new THREE.TubeGeometry(cv, 140, 1.15, 8, false), new THREE.MeshBasicMaterial({ color: 0x14112e }));
    road.scale.y = .04;
    rg.add(road);
    rg.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 140, .1, 6, false), new THREE.MeshBasicMaterial({ color: COL[id] })));
    rg.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 140, .5, 6, false), new THREE.MeshBasicMaterial({ color: COL[id], transparent: true, opacity: .1, depthWrite: false })));
    const s = cv.getPoint(0), e = cv.getPoint(1);
    const hex = '#' + COL[id].toString(16).padStart(6, '0');
    const ls = label(`<b>${CODE[id]}</b>${id.toUpperCase()}`, 'lbl rstart'); ls.element.style.setProperty('--c', hex); ls.position.set(s.x - 5, 2.4 + k * .8, s.z);
    const lf = label('🏁', 'lbl flag'); lf.position.set(e.x, 2.8, e.z);
    [s, e].forEach(p => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 40), new THREE.MeshBasicMaterial({ color: COL[id], side: THREE.DoubleSide, transparent: true, opacity: .9 }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, .12, p.z); rg.add(ring);
    });
    rg.add(ls, lf);
    group.add(rg);
    routeGroups[id] = rg;
  });

  /* area beacons: height = traffic volume, colour = speed, for the selected hour */
  const beacons = areas.map(a => {
    const mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 1, 14), mat);
    const g = glowSprite(0x00f0ff, 4);
    const pickM = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pickM.position.set(a.pos.x, 2, a.pos.z);
    m.position.set(a.pos.x, .5, a.pos.z);
    const l = label(a.name, 'lbl axis'); l.position.set(a.pos.x, -.6, a.pos.z);
    group.add(m, g, pickM, l);
    return { s: a, m, g, pickM, col: new THREE.Color(0x00f0ff), h: 1, scale: 1 };
  });
  const pickers = beacons.map(b => b.pickM);

  /* racers: each road type finishes in its average trip time (groupBy road_type, avg travel_time_min) */
  const racers = Object.entries(curves).map(([id, cv]) => {
    const car = makeCar({ color: COL[id], length: 3 });
    group.add(car.group);
    return { id, cv, car, T: roads[id].tt * SEC_PER_MIN, done: false, finish: 0, hidden: false };
  });
  const maxT = Math.max(...racers.map(r => r.T));
  let raceT = -1.2, ranks = 0, hRace = 6.2, hovered = null;
  const ahead = new THREE.Vector3(), tc = new THREE.Color();
  const rows = () => racers.map(r => ({ id: r.id, code: CODE[r.id], cls: r.id.toLowerCase(), min: roads[r.id].tt, rank: r.done ? r.finish : 0, hidden: r.hidden }));
  const restart = ctx => { raceT = -1.2; ranks = 0; racers.forEach(r => { r.done = false; }); ctx?.board?.(rows()); };
  const areaHit = ray => { const h = ray.intersectObjects(pickers, false)[0]; return h ? beacons.find(b => b.pickM === h.object) : null; };

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
        b.h += ((1 + vo / 40) - b.h) * Math.min(1, dt * 6);
        const target = hovered === b ? 1.5 : 1;
        b.scale += (target - b.scale) * Math.min(1, dt * 10);
        b.m.material.color.copy(b.col);
        b.m.scale.set(b.scale, b.h, b.scale);
        b.m.position.y = b.h / 2;
        b.g.position.set(b.m.position.x, b.h + .3, b.m.position.z);
        b.g.material.color.copy(b.col);
        b.g.scale.setScalar(3.4 * b.scale + vo / 120);
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
      ctx.hud?.(hh, mean(DATA.areas.map(a => a.speed[hh])));
    },
    cam(t, p, l) {
      const a = t * .06 + .5;
      p.set(Math.sin(a) * 52, 42, Math.cos(a) * 52);
      l.set(0, 0, 3);
    },

    /* ---- interaction ---- */
    hover(ray) {
      const b = areaHit(ray);
      hovered = b;
      if (!b) return null;
      const hh = Math.floor(hRace), s = b.s, sp = s.speed[hh];
      return `<b>${s.id} · ${s.name}</b><span>${s.loss.toFixed(1)}% avg speed loss</span><big class="${speedCls(sp)}">${sp.toFixed(1)}<small>km/h</small></big>
        <span>volume ${s.volume[hh].toFixed(0)} at ${hourLabel(hh)} · yearly average ${s.avg.toFixed(1)} km/h</span><span class="dim">click to inspect this area</span>`;
    },
    leave() { hovered = null; },
    click(ray, ctx) {
      const b = areaHit(ray);
      if (b) ctx.card(b.s, Math.floor(hRace));
    },
    setHour(h) { hRace = clamp(h, 0, 23) + .01; },
    drive(dx, dy, wheel, ctx) { ctx.pause(true); hRace = (hRace + (dx * .02 + wheel * .004) + 24) % 24; },
  };
}
