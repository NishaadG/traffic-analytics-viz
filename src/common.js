import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

export const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const ease = t => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const hourLabel = h => String(h).padStart(2, '0') + ':00';

const stops = [[15, '#ff2a55'], [25, '#ff2bd6'], [33, '#7b5cff'], [42, '#1fb6ff'], [50, '#00f0ff']]
  .map(([s, c]) => [s, new THREE.Color(c)]);
export function speedColor(s, out = new THREE.Color()) {
  if (s <= stops[0][0]) return out.copy(stops[0][1]);
  for (let i = 1; i < stops.length; i++) {
    if (s <= stops[i][0]) {
      const [a, ca] = stops[i - 1], [b, cb] = stops[i];
      return out.copy(ca).lerp(cb, (s - a) / (b - a));
    }
  }
  return out.copy(stops[stops.length - 1][1]);
}

export function label(html, cls = 'lbl') {
  const d = document.createElement('div');
  d.className = cls;
  d.innerHTML = html;
  return new CSS2DObject(d);
}

let glowTex;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(.25, 'rgba(255,255,255,.5)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}
export function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  s.scale.setScalar(size);
  return s;
}

export function rng(seed) {
  let s = seed;
  return () => ((s = Math.imul(s ^ s >>> 15, 2246822507) ^ Math.imul(s ^ s >>> 13, 3266489909)) >>> 0) / 4294967296;
}

export function makeGrid(size, div, c1, c2, opacity = .5) {
  const g = new THREE.GridHelper(size, div, c1, c2);
  g.material.transparent = true;
  g.material.opacity = opacity;
  return g;
}

/* set a station (or any group) and all its CSS2D labels visible/hidden together */
export function setVisible(group, v) {
  group.visible = v;
  group.traverse(o => { if (o.isCSS2DObject) o.visible = v; });
}
