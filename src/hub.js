import * as THREE from 'three';
import { DATA } from './data.js';
import { mean, label, glowSprite, rng } from './common.js';

const peakH = h => (h >= 7 && h <= 9) || (h >= 17 && h <= 20);
const drop = Math.round((1 - mean(DATA.hourly.filter((_, h) => peakH(h))) / mean(DATA.hourly.filter((_, h) => !peakH(h)))) * 100);
const best = Object.entries(DATA.routes).sort((a, b) => a[1].time - b[1].time);
const worst = [...DATA.sensors].sort((a, b) => a.avg - b.avg)[0];

export const NODES = [
  { id: 'spark', name: 'SPARK PIPELINE', sub: 'raw readings → clean groups', color: 0xffb020, leaves: ['read.csv()', 'clean + enrich', 'groupBy · agg'] },
  { id: 'pulse', name: 'CITY PULSE', sub: 'speed across 24 hours', color: 0x00f0ff, leaves: [`−${drop}% at rush hour`, '07–09 · 17–20', 'time series'] },
  { id: 'heat', name: 'HEAT TUNNEL', sub: '12 sensors × 24 hours', color: 0xff2bd6, leaves: ['heatmap', `${worst.id} slowest`, 'jam bands'] },
  { id: 'race', name: 'ROUTE RACE', sub: 'which route wins?', color: 0x7b5cff, leaves: best.map(([r, v]) => `${r} · ${v.time.toFixed(1)} min`) },
  { id: 'insights', name: 'INSIGHTS', sub: 'what to do about it', color: 0x39ffb0, leaves: ['3 findings', 'recommendations', 'limitations'] },
];

export function buildHub() {
  const group = new THREE.Group();
  const rnd = rng(11);
  const pickables = [];
  const edges = [];       // {a,b}
  const nodeMeshes = {};

  /* centre */
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), new THREE.MeshBasicMaterial({ color: 0x0b0a24 }));
  const coreWire = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(2.45, 1)), new THREE.LineBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: .9 }));
  const shell = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(3.6, 2)), new THREE.LineBasicMaterial({ color: 0xff2bd6, transparent: true, opacity: .28 }));
  const coreGlow = glowSprite(0x00c8ff, 10);
  group.add(core, coreWire, shell, coreGlow);
  const cl = label('<b>TRAFFIC<br>PROBLEM</b><span>Google Maps–inspired congestion study</span>', 'lbl center');
  cl.position.set(0, -5.4, 0);
  group.add(cl);

  /* primary nodes + leaves */
  const R = 15;
  NODES.forEach((n, i) => {
    const th = (i / NODES.length) * Math.PI * 2 + .3;
    const dir = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const pos = dir.clone().multiplyScalar(R).setY(i % 2 ? 3.2 : -2.4);
    const g = new THREE.Group(); g.position.copy(pos);

    const solid = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), new THREE.MeshBasicMaterial({ color: n.color }));
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(2.1, 0)), new THREE.LineBasicMaterial({ color: n.color, transparent: true, opacity: .8 }));
    const glow = glowSprite(n.color, 5.5);
    const pick = new THREE.Mesh(new THREE.SphereGeometry(3.2, 8, 8), new THREE.MeshBasicMaterial({ visible: false }));
    pick.userData.id = n.id;
    g.add(solid, wire, glow, pick);
    const l = label(`<b>${n.name}</b><span>${n.sub}</span>`, 'lbl node');
    l.element.style.setProperty('--c', '#' + n.color.toString(16).padStart(6, '0'));
    l.position.set(0, 3.1, 0);
    g.add(l);
    group.add(g);
    pickables.push(pick);
    nodeMeshes[n.id] = { g, solid, wire, glow, base: 1 };
    edges.push({ a: new THREE.Vector3(), b: pos.clone(), color: n.color });

    n.leaves.forEach((txt, k) => {
      const ang = th + (k - 1) * .5;
      const lp = pos.clone().add(new THREE.Vector3(Math.cos(ang) * 6.5, (k - 1) * 2.1 + (rnd() - .5), Math.sin(ang) * 6.5));
      const dot = new THREE.Mesh(new THREE.SphereGeometry(.28, 12, 12), new THREE.MeshBasicMaterial({ color: n.color }));
      dot.position.copy(lp);
      const lg = glowSprite(n.color, 1.8); lg.position.copy(lp);
      const ll = label(txt, 'lbl leaf'); ll.position.copy(lp).add(new THREE.Vector3(0, .8, 0));
      group.add(dot, lg, ll);
      edges.push({ a: pos.clone(), b: lp, color: n.color, thin: true });
    });
  });

  /* edge lines */
  edges.forEach(e => {
    const geo = new THREE.BufferGeometry().setFromPoints([e.a, e.b]);
    group.add(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: e.color, transparent: true, opacity: e.thin ? .35 : .7 })));
  });

  /* pulses running along edges */
  const pulses = edges.map(e => ({ e, u: rnd(), v: .12 + rnd() * .25 }));
  const pp = new Float32Array(pulses.length * 3), pc = new Float32Array(pulses.length * 3);
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(pc, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({ size: .7, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: coreGlow.material.map }));
  pts.frustumCulled = false;
  group.add(pts);
  const tmp = new THREE.Color();

  let hoverId = null;
  return {
    group, pickables,
    setHover(id) { hoverId = id; },
    update(t, dt) {
      core.rotation.y += dt * .2; coreWire.rotation.y -= dt * .15; coreWire.rotation.x += dt * .08;
      shell.rotation.y += dt * .1; shell.rotation.z += dt * .05;
      coreGlow.scale.setScalar(10 + Math.sin(t * 1.6) * .8);
      Object.entries(nodeMeshes).forEach(([id, m], i) => {
        const target = hoverId === id ? 1.35 : 1;
        m.base += (target - m.base) * Math.min(1, dt * 8);
        m.g.scale.setScalar(m.base);
        m.g.position.y += Math.sin(t * .9 + i) * .002;
        m.wire.rotation.y += dt * .5; m.wire.rotation.x += dt * .25;
        m.solid.rotation.y -= dt * .6;
      });
      pulses.forEach((p, i) => {
        p.u = (p.u + p.v * dt) % 1;
        pp[i * 3] = p.e.a.x + (p.e.b.x - p.e.a.x) * p.u;
        pp[i * 3 + 1] = p.e.a.y + (p.e.b.y - p.e.a.y) * p.u;
        pp[i * 3 + 2] = p.e.a.z + (p.e.b.z - p.e.a.z) * p.u;
        tmp.set(p.e.color).multiplyScalar(1.5);
        pc[i * 3] = tmp.r; pc[i * 3 + 1] = tmp.g; pc[i * 3 + 2] = tmp.b;
      });
      pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true;
    },
  };
}
