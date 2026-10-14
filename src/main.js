import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import './style.css';

import { DATA } from './data.js';
import { ease, setVisible, rng, glowTexture, hourLabel } from './common.js';
import { loadCar } from './car.js';
import { buildHub } from './hub.js';
import { buildSpark } from './stations/spark.js';
import { buildAnalysis } from './stations/analysis.js';
import { buildPulse } from './stations/pulse.js';
import { buildHeat } from './stations/heat.js';
import { buildRace } from './stations/race.js';
import { buildInsights } from './stations/insights.js';
import { INFO } from './info.js';

const qs = new URLSearchParams(location.search);
const LITE = qs.has('lite');
const $ = id => document.getElementById(id);
const byAvg = [...DATA.sensors].sort((a, b) => a.avg - b.avg);

/* ---------- renderer ---------- */
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: !LITE });
} catch (e) {
  $('loader').innerHTML = '<p>This page needs WebGL. Please open it in a recent Chrome, Edge or Firefox.</p>';
  throw e;
}
renderer.setPixelRatio(LITE ? 1 : Math.min(devicePixelRatio, 1.75));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05040f);
scene.fog = new THREE.FogExp2(0x070418, .011);
const camera = new THREE.PerspectiveCamera(50, 1, .1, 1800);

scene.add(new THREE.AmbientLight(0x8a8ac0, .9));
const dl1 = new THREE.DirectionalLight(0x00f0ff, 1.6); dl1.position.set(-6, 8, 7); scene.add(dl1);
const dl2 = new THREE.DirectionalLight(0xff2bd6, 1.3); dl2.position.set(7, 4, -7); scene.add(dl2);
const dl3 = new THREE.DirectionalLight(0xffffff, .5); dl3.position.set(0, 12, 0); scene.add(dl3);

/* far-away stars so flights feel fast */
{
  const r = rng(99), n = 3200, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = (r() - .5) * 2400; a[i * 3 + 1] = (r() - .5) * 1400; a[i * 3 + 2] = (r() - .5) * 2400; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 4, map: glowTexture(), color: 0xa9b6ff, transparent: true, opacity: .8, fog: false, depthWrite: false, blending: THREE.AdditiveBlending })));
}

const labels = new CSS2DRenderer();
labels.domElement.className = 'labels';
$('app').appendChild(labels.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const BLOOM = LITE ? .6 : .95;
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM, .55, .42);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ---------- shared UI state ---------- */
const hudEl = { hour: $('sHour'), speed: $('sSpeed'), bar: $('sBar'), cHour: $('cHour'), scrub: $('scrub'), play: $('play') };
let lastHud = '', scrubbing = false;
const ctx = {
  paused: false,
  input: { fwd: 0 },
  pause(v) {
    if (ctx.paused === v) return;
    ctx.paused = v;
    hudEl.play.textContent = v ? '▶' : '❚❚';
    hudEl.play.classList.toggle('paused', v);
  },
  hud(h, s) {
    const key = h + ':' + s.toFixed(0);
    if (key === lastHud) return;
    lastHud = key;
    hudEl.hour.textContent = hudEl.cHour.textContent = hourLabel(h);
    hudEl.speed.textContent = s.toFixed(0);
    hudEl.bar.style.width = Math.min(100, s / 50 * 100) + '%';
    hudEl.bar.style.background = s < 25 ? 'var(--red)' : s < 35 ? 'var(--mag)' : 'var(--cyan)';
    if (!scrubbing) hudEl.scrub.value = h;
  },
  flash() { const f = $('fade'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 260); },
  board(rows) {
    const b = $('board');
    if (!b) return;
    b.innerHTML = rows.map(r => `<div class="row ${r.id.toLowerCase()} ${r.rank ? 'done' : ''} ${r.hidden ? 'off' : ''}"><b>${r.id}</b><span>${r.min.toFixed(1)} min</span><i>${r.hidden ? 'hidden' : r.rank ? ['', '1ST', '2ND', '3RD'][r.rank] : '…'}</i></div>`).join('');
  },
  card(s, hour) {
    const peak = h => (h >= 7 && h <= 9) || (h >= 17 && h <= 20);
    const W = 280, H = 84, x = i => 6 + i * (W - 12) / 23, y = v => H - 8 - (v / 60) * (H - 16);
    const pts = s.speed.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const bands = [[7, 9], [17, 20]].map(([a, b]) => `<rect x="${x(a) - 3}" y="2" width="${x(b) - x(a) + 6}" height="${H - 4}" fill="rgba(255,43,214,.13)"/>`).join('');
    const cls = v => (v < 20 ? 'jam' : v < 35 ? 'slow' : 'flow');
    const rank = byAvg.findIndex(q => q.id === s.id) + 1;
    $('card').innerHTML = `
      <button class="x" data-close>×</button>
      <div class="kicker">SENSOR INSPECTOR</div>
      <h3>${s.id} · ${s.road}</h3>
      <div class="meta">Route ${s.route} · ${s.dist} km segment · <b>#${rank}</b> of 12 slowest</div>
      <div class="cstats">
        <div><b class="${cls(s.speed[hour])}">${s.speed[hour].toFixed(1)}</b><span>km/h at ${hourLabel(hour)}</span></div>
        <div><b>${s.avg.toFixed(1)}</b><span>daily avg</span></div>
        <div><b>${s.volume[hour].toFixed(0)}</b><span>vehicles now</span></div>
      </div>
      <svg viewBox="0 0 ${W} ${H}" class="spark">${bands}
        <polyline points="${pts}" fill="none" stroke="#00f0ff" stroke-width="2"/>
        <line x1="${x(hour)}" x2="${x(hour)}" y1="2" y2="${H - 2}" stroke="#fff" stroke-opacity=".6"/>
        <circle cx="${x(hour)}" cy="${y(s.speed[hour])}" r="4" fill="#fff"/></svg>
      <div class="meta">24-hour speed · pink bands = rush hours${peak(hour) ? ' · <b class="jam">this hour is a rush hour</b>' : ''}</div>`;
    $('card').classList.add('on');
  },
};

/* ---------- build world ---------- */
const hub = buildHub();
scene.add(hub.group);

const OFFSET = {
  spark: new THREE.Vector3(0, 0, -800),
  analysis: new THREE.Vector3(700, 0, -700),
  pulse: new THREE.Vector3(800, 0, 0),
  heat: new THREE.Vector3(0, 0, 800),
  race: new THREE.Vector3(-800, 0, 0),
  insights: new THREE.Vector3(0, 500, 0),
};
const stations = {};
function addStation(id, st) {
  st.group.position.copy(OFFSET[id]);
  setVisible(st.group, false);
  scene.add(st.group);
  stations[id] = st;
}
function buildAll() {
  addStation('spark', buildSpark());
  addStation('analysis', buildAnalysis());
  addStation('pulse', buildPulse());
  addStation('heat', buildHeat());
  addStation('race', buildRace());
  addStation('insights', buildInsights());
}

/* ---------- navigation ---------- */
const ORDER = ['hub', 'spark', 'analysis', 'pulse', 'heat', 'race', 'insights'];
const NAME = { hub: 'MAP', spark: 'SPARK', analysis: 'ANALYSIS', pulse: 'PULSE', heat: 'HEAT', race: 'RACE', insights: 'INSIGHTS' };
const HINT = {
  hub: 'DRAG TO ORBIT · CLICK A NODE TO FLY · ← → KEYS · ESC FOR MAP',
  analysis: 'HOVER THE DONUT AND BARS · PANEL TABS HOLD THE SPARK TABLES',
  pulse: 'HOVER THE RIBBON · CLICK TO JUMP · W/S OR SCROLL TO DRIVE · SPACE PAUSES',
  heat: 'HOVER A PANEL · CLICK TO INSPECT · W/S OR SCROLL TO DRIVE · SPACE PAUSES',
  race: 'DRAG THE HOUR SLIDER · HOVER OR CLICK A SENSOR · SPACE PAUSES',
};
$('nav').innerHTML = ORDER.map(id => `<button data-id="${id}">${NAME[id]}</button>`).join('');
$('nav').addEventListener('click', e => { const b = e.target.closest('button'); if (b) flyTo(b.dataset.id); });
$('back').addEventListener('click', () => flyTo('hub'));

let current = 'intro', flight = null, t = 0, dragAz = 0, my = 0;
const pT = new THREE.Vector3(), lT = new THREE.Vector3(), look = new THREE.Vector3(0, 0, 0);

function targetPose(id, p, l) {
  if (id === 'hub' || id === 'intro') {
    const az = t * .045 + dragAz;
    p.set(Math.cos(az) * 46, 13 + my * -5, Math.sin(az) * 46);
    l.set(0, 0, 0);
  } else {
    stations[id].cam(t, p, l);
    p.add(OFFSET[id]); l.add(OFFSET[id]);
  }
}

function showPanel(id) {
  const panel = $('panel');
  panel.classList.remove('on');
  if (id === 'hub') { $('back').classList.remove('on'); return; }
  const info = INFO[id];
  panel.className = 'glass' + (info.wide ? ' wide' : '') + (info.cls ? ' ' + info.cls : '');
  panel.innerHTML = info.html;
  requestAnimationFrame(() => panel.classList.add('on'));
  $('back').classList.add('on');
}

function setActiveUI(id) {
  document.body.dataset.st = id;
  $('hint').textContent = HINT[id] || '';
  [...$('nav').children].forEach(b => b.classList.toggle('active', b.dataset.id === id));
}

function hideOverlays() {
  $('tip').classList.remove('on');
  $('card').classList.remove('on');
  document.body.style.cursor = '';
}

function flyTo(id) {
  if (id === 'intro' || (!flight && id === current)) return;
  if (flight && flight.to === id) return;
  const from = { p: camera.position.clone(), l: look.clone(), fov: camera.fov };
  if (id !== 'hub') setVisible(stations[id].group, true);
  else setVisible(hub.group, true);
  stations[current]?.leave?.();
  stations[id]?.onEnter?.(ctx);
  hideOverlays();
  ctx.pause(false);
  $('panel').classList.remove('on');
  setActiveUI(id);
  flight = { to: id, from, t0: t, dur: id === 'hub' || current === 'hub' ? 2.6 : 3.2, shown: false };
}

function finishFlight() {
  const id = flight.to;
  current = id;
  Object.entries(stations).forEach(([k, st]) => { if (k !== id) setVisible(st.group, false); });
  setVisible(hub.group, id === 'hub');
  flight = null;
}

/* ---------- input ---------- */
const KEYS = {};
const setFwd = () => { ctx.input.fwd = (KEYS.w || KEYS.d ? 1 : 0) - (KEYS.s || KEYS.a ? 1 : 0); };
addEventListener('keydown', e => {
  if (e.target.matches?.('input[type=range]') && e.code !== 'Space') return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); ctx.pause(!ctx.paused); return; }
  if (['w', 's', 'a', 'd'].includes(k)) { KEYS[k] = true; setFwd(); return; }
  if (e.key === 'Escape') flyTo('hub');
  const i = ORDER.indexOf(flight ? flight.to : current);
  if (e.key === 'ArrowRight') flyTo(ORDER[(i + 1) % ORDER.length]);
  if (e.key === 'ArrowLeft') flyTo(ORDER[(i - 1 + ORDER.length) % ORDER.length]);
});
addEventListener('keyup', e => {
  const k = e.key.toLowerCase();
  if (['w', 's', 'a', 'd'].includes(k)) { KEYS[k] = false; setFwd(); }
});
addEventListener('blur', () => { Object.keys(KEYS).forEach(k => (KEYS[k] = false)); setFwd(); });

hudEl.play.addEventListener('click', () => { ctx.pause(!ctx.paused); hudEl.play.blur(); });
hudEl.scrub.addEventListener('pointerdown', () => { scrubbing = true; });
addEventListener('pointerup', () => { scrubbing = false; });
hudEl.scrub.addEventListener('input', () => {
  ctx.pause(true);
  hudEl.cHour.textContent = hourLabel(+hudEl.scrub.value);
  stations[current]?.setHour?.(+hudEl.scrub.value);
});

/* panel + card delegation: tabs, route toggles, restart, close */
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tab) {
    const p = $('panel');
    p.querySelectorAll('[data-tab]').forEach(x => x.classList.toggle('on', x === b));
    p.querySelectorAll('[data-pane]').forEach(x => x.classList.toggle('on', x.dataset.pane === b.dataset.tab));
  } else if (b.dataset.route) {
    b.classList.toggle('on', stations.race.toggleRoute(b.dataset.route));
  } else if (b.hasAttribute('data-restart')) {
    stations.race.restart(ctx); ctx.pause(false);
  } else if (b.hasAttribute('data-close')) {
    $('card').classList.remove('on');
  }
});

const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
const UI = '#nav,#panel,#ctl,#card,#top,button,input';
let down = null, moved = 0;
const inHub = () => current === 'hub' && !flight;
const activeSt = () => (!flight && current !== 'hub' && current !== 'intro' ? stations[current] : null);
const tip = $('tip');

function showTip(html, e) {
  if (!html) { tip.classList.remove('on'); return; }
  tip.innerHTML = html;
  tip.classList.add('on');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.min(e.clientX + 18, innerWidth - w - 12) + 'px';
  tip.style.top = Math.min(e.clientY + 18, innerHeight - h - 12) + 'px';
}
function hover(e) {
  mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  my = e.clientY / innerHeight - .5;
  if (e.target.closest?.(UI)) { stations[current]?.leave?.(); hub.setHover(null); tip.classList.remove('on'); document.body.style.cursor = ''; return null; }
  if (inHub()) {
    tip.classList.remove('on');
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(hub.pickables, false)[0];
    const id = hit ? hit.object.userData.id : null;
    hub.setHover(id);
    document.body.style.cursor = id ? 'pointer' : (down ? 'grabbing' : '');
    return id;
  }
  const st = activeSt();
  if (st?.hover) {
    ray.setFromCamera(mouse, camera);
    const html = st.hover(ray);
    showTip(html, e);
    document.body.style.cursor = html ? 'pointer' : '';
  } else { tip.classList.remove('on'); document.body.style.cursor = ''; }
  return null;
}
addEventListener('pointerdown', e => {
  if (e.target.closest(UI)) return;
  down = { x: e.clientX, y: e.clientY }; moved = 0;
});
addEventListener('pointermove', e => {
  if (down) {
    const dx = e.clientX - down.x, dy = e.clientY - down.y;
    moved += Math.abs(dx) + Math.abs(dy);
    down.x = e.clientX; down.y = e.clientY;
    if (inHub()) dragAz -= dx * .006;
    else if (moved > 6) activeSt()?.drive?.(dx, dy, 0, ctx);
  }
  hover(e);
});
addEventListener('pointerup', e => {
  if (down && moved < 6) {
    if (inHub()) { const id = hover(e); if (id) flyTo(id); }
    else {
      const st = activeSt();
      if (st?.click) {
        mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
        ray.setFromCamera(mouse, camera);
        st.click(ray, ctx);
        tip.classList.remove('on');
      }
    }
  }
  down = null;
});
addEventListener('wheel', e => {
  if (e.target.closest?.('#panel,#card')) return;
  activeSt()?.drive?.(0, 0, e.deltaY, ctx);
}, { passive: true });

/* ---------- loop ---------- */
const clock = new THREE.Clock();
function step(dt) {
  t += dt;
  hub.update(t, dt);
  Object.values(stations).forEach(st => { if (st.group.visible) st.update(t, dt, ctx); });

  const target = flight ? flight.to : current;
  targetPose(target, pT, lT);

  if (flight) {
    const k = Math.min(1, (t - flight.t0) / flight.dur), e = ease(k);
    camera.position.lerpVectors(flight.from.p, pT, e);
    camera.position.y += Math.sin(Math.PI * e) * 26;
    look.lerpVectors(flight.from.l, lT, e);
    camera.fov = 50 + Math.sin(Math.PI * e) * 20;
    camera.updateProjectionMatrix();
    if (!flight.shown && k > .72) { flight.shown = true; showPanel(flight.to); }
    if (k >= 1) finishFlight();
  } else {
    camera.position.lerp(pT, Math.min(1, dt * 9));
    look.lerp(lT, Math.min(1, dt * 9));
    if (camera.fov !== 50) { camera.fov = 50; camera.updateProjectionMatrix(); }
  }
  camera.lookAt(look);

  const fogT = target === 'hub' || target === 'intro' ? .011 : stations[target].fog;
  scene.fog.density += (fogT - scene.fog.density) * Math.min(1, dt * 3);
  const bT = target === 'hub' || target === 'intro' ? BLOOM : (stations[target].bloom ?? BLOOM);
  bloom.strength += (bT - bloom.strength) * Math.min(1, dt * 3);
}
function frame() {
  step(Math.min(clock.getDelta(), .05));
  composer.render();
  labels.render(scene, camera);
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
(async function boot() {
  try {
    const bar = $('loadBar');
    await loadCar(renderer, p => { bar.style.width = (p * 100).toFixed(0) + '%'; });
    bar.style.width = '100%';
    buildAll();
    camera.position.set(0, 90, 170);
    setActiveUI('hub');

    const jump = qs.get('s');
    if (jump && (jump === 'hub' || stations[jump])) {
      // debug / deep link: skip the flight and fast-forward the simulation
      current = jump;
      setVisible(hub.group, jump === 'hub');
      if (jump !== 'hub') setVisible(stations[jump].group, true);
      stations[jump]?.onEnter?.(ctx);
      setActiveUI(jump);
      const adv = +(qs.get('adv') || 0);
      for (let i = 0; i < adv * 30; i++) step(1 / 30);
      camera.position.copy(pT); look.copy(lT);
      showPanel(jump);
    } else {
      current = 'intro';
      flight = { to: 'hub', from: { p: camera.position.clone(), l: look.clone(), fov: 50 }, t0: 0, dur: 3.4, shown: true };
    }
    $('loader').classList.add('gone');
    frame();
  } catch (err) {
    console.error(err);
    document.querySelector('#loader .ls').textContent = 'ERROR: ' + (err && err.message);
  }
})();
