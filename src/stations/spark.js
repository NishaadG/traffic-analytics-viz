import * as THREE from 'three';
import { label, glowSprite, makeGrid, rng } from '../common.js';

const STAGES = [
  { name: 'READ', code: 'spark.read.csv()', n: '576 rows', color: 0xffb020, geo: new THREE.CylinderGeometry(2.2, 2.2, 4, 28) },
  { name: 'CLEAN', code: 'dropDuplicates · filter', n: '576 valid', color: 0xff7a3d, geo: new THREE.BoxGeometry(3.8, 3.8, 3.8) },
  { name: 'ENRICH', code: 'withColumn · when', n: '+ hour, congestion', color: 0xff2bd6, geo: new THREE.OctahedronGeometry(3) },
  { name: 'AGGREGATE', code: 'groupBy · agg', n: '24 h · 12 sensors · 3 routes', color: 0x7b5cff, geo: new THREE.IcosahedronGeometry(2.8, 0) },
  { name: 'VISUALISE', code: 'toPandas() → 3D views', n: '4 scenes', color: 0x00f0ff, geo: new THREE.ConeGeometry(2.9, 4.6, 4) },
];
const SP = 11;

export function buildSpark() {
  const group = new THREE.Group();
  const grid = makeGrid(160, 80, 0x4a3a00, 0x241a40, .5);
  grid.position.y = -3;
  group.add(grid);

  const blocks = STAGES.map((s, i) => {
    const x = (i - 2) * SP;
    const g = new THREE.Group();
    g.position.set(x, 0, 0);
    const body = new THREE.Mesh(s.geo, new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: .13, depthWrite: false }));
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(s.geo), new THREE.LineBasicMaterial({ color: s.color }));
    const core = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 16), new THREE.MeshBasicMaterial({ color: s.color }));
    const glow = glowSprite(s.color, 9);
    g.add(body, edge, core, glow);
    group.add(g);

    // ring + labels stay put (don't spin with the block)
    const ring = new THREE.Mesh(new THREE.RingGeometry(3.4, 3.6, 48), new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: .6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, -2.95, 0);
    group.add(ring);
    const hex = '#' + s.color.toString(16).padStart(6, '0');
    const top = label(`<b>${String(i + 1).padStart(2, '0')} · ${s.name}</b>`, 'lbl stage');
    top.element.style.setProperty('--c', hex);
    top.position.set(x, 5, 0);
    const bot = label(`<code>${s.code}</code><span>${s.n}</span>`, 'lbl code');
    bot.position.set(x, -4.8, 0);
    group.add(top, bot);
    return { g, core, glow, s, i };
  });

  /* data stream through the stages */
  const rnd = rng(3), N = 220, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const parts = Array.from({ length: N }, () => ({
    u: rnd(), v: .05 + rnd() * .05,
    off: new THREE.Vector3((rnd() - .5) * 1.4, (rnd() - .5) * 1.4, (rnd() - .5) * 1.4),
  }));
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  pg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(pg, new THREE.PointsMaterial({
    size: .5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, map: blocks[0].glow.material.map,
  }));
  pts.frustumCulled = false;
  group.add(pts);
  const cA = new THREE.Color(), cB = new THREE.Color();
  const x0 = -2 * SP - 3, x1 = 2 * SP + 3;

  /* pipes between stages */
  for (let i = 0; i < 4; i++) {
    const a = (i - 2) * SP + 3.4, b = (i - 1) * SP - 3.4;
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a, 0, 0), new THREE.Vector3(b, 0, 0)]),
      new THREE.LineBasicMaterial({ color: STAGES[i + 1].color, transparent: true, opacity: .6 }),
    ));
  }

  return {
    group, fog: .011,
    update(t, dt) {
      parts.forEach((p, i) => {
        p.u = (p.u + p.v * dt) % 1;
        const x = x0 + (x1 - x0) * p.u;
        pos[i * 3] = x + p.off.x; pos[i * 3 + 1] = p.off.y; pos[i * 3 + 2] = p.off.z;
        const k = Math.max(0, Math.min(4, (x + 2 * SP) / SP));
        const lo = Math.min(3, Math.floor(k));
        cA.set(STAGES[lo].color);
        cB.set(STAGES[lo + 1].color);
        cA.lerp(cB, k - lo).multiplyScalar(1.6);
        col[i * 3] = cA.r; col[i * 3 + 1] = cA.g; col[i * 3 + 2] = cA.b;
      });
      pg.attributes.position.needsUpdate = true;
      pg.attributes.color.needsUpdate = true;
      blocks.forEach(b => {
        b.g.rotation.y = t * .35 + b.i;
        b.g.position.y = Math.sin(t * 1.1 + b.i * 1.3) * .35;
        const wob = Math.sin(t * 3 - b.i * 1.1);
        b.core.scale.setScalar(1 + wob * .25);
        b.glow.scale.setScalar(9 + wob * 1.4);
      });
    },
    cam(t, p, l) {
      p.set(-8 + Math.sin(t * .13) * 12, 8 + Math.sin(t * .2) * 1.5, 32 + Math.cos(t * .13) * 3);
      l.set(-8, 0, 0);
    },
  };
}
