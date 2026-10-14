import { DATA } from './data.js';
import { A } from './analysis.js';

const S = A.summary, P = A.peak, L = A.levels;
const drop = Math.round((1 - P.peak_speed / P.off_speed) * 100);
const slow = [...A.sensors].sort((a, b) => a.avg - b.avg);
const routes = Object.entries(DATA.routes).sort((a, b) => a[1].time - b[1].time);
const r = id => DATA.routes[id].time.toFixed(1);
const pct = k => (L[k] / S.readings * 100).toFixed(0);
const cls = s => (s < 20 ? 'jam' : s < 35 ? 'slow' : 'flow');

const hourlyRows = A.hourly.map(h => `<tr><td>${String(h.h).padStart(2, '0')}:00</td><td class="${cls(h.speed)}">${h.speed.toFixed(1)}</td><td>${h.volume.toFixed(1)}</td>
  <td><div class="mb"><i class="${cls(h.speed)}" style="width:${(h.speed / 50 * 100).toFixed(0)}%"></i></div></td></tr>`).join('');
const sensorRows = slow.map((s, i) => `<tr><td>${i + 1}</td><td><b>${s.id}</b> ${s.road}</td><td>${s.route}</td><td class="${cls(s.avg)}">${s.avg.toFixed(1)}</td><td>${s.vol.toFixed(0)}</td>
  <td><span class="jam">${s.high}</span>/<span class="slow">${s.mod}</span>/<span class="flow">${s.low}</span></td></tr>`).join('');
const routeRows = Object.entries(DATA.routes).map(([id, v]) => `<tr><td><b class="rt ${id.toLowerCase()}">${id}</b></td><td>4</td><td>${v.dist.toFixed(1)}</td><td>${v.speed.toFixed(1)}</td><td class="${id === routes[0][0] ? 'flow' : ''}"><b>${v.time.toFixed(2)}</b></td></tr>`).join('');

export const INFO = {
  spark: {
    cls: 'tall',
    html: `
      <div class="kicker">01 // SPARK PIPELINE</div>
      <h2>576 readings, <em>four steps</em></h2>
      <p>One PySpark job (Spark 4.0.4, <code>local[*]</code>). Transformations build the plan lazily; actions like <code>count()</code>, <code>show()</code> and <code>toPandas()</code> trigger it.</p>
      <pre><span class="c"># clean + enrich</span>
traffic = (raw.dropDuplicates()
  .filter(speed.between(0,160) &amp; ...)
  .withColumn(<span class="s">"hour"</span>, F.hour(<span class="s">"timestamp"</span>))
  .withColumn(<span class="s">"congestion_level"</span>,
     F.when(speed &lt; 20, <span class="s">"High"</span>)...))
<span class="c"># aggregate</span>
hourly  = traffic.groupBy(<span class="s">"hour"</span>).agg(F.avg(<span class="s">"speed_kmh"</span>))
sensors = traffic.groupBy(<span class="s">"sensor_id"</span>).agg(...)
routes  = traffic.groupBy(<span class="s">"route_id"</span>).agg(F.sum(...))</pre>
      <div class="mini"><b>Schema Spark inferred (9 columns)</b>${A.schema.map(([n, t]) => `<span><code>${n}</code> ${t}</span>`).join('')}</div>
      <div class="chips"><span>rows 576 → 576 after cleaning</span><span>0 duplicates · 0 invalid · 0 nulls</span></div>`,
  },
  analysis: {
    cls: 'tall',
    html: `
      <div class="kicker">02 // ANALYSIS · SPARK OUTPUT</div>
      <h2>What the data <em>says</em></h2>
      <div class="tabs"><button data-tab="sum" class="on">SUMMARY</button><button data-tab="hr">HOURLY</button><button data-tab="sn">SENSORS</button><button data-tab="rt">ROUTES</button></div>
      <div class="pane on" data-pane="sum">
        <div class="stats">
          <div><b>${S.avg_speed}</b><span>avg speed km/h</span></div>
          <div><b>${S.avg_volume}</b><span>avg volume</span></div>
          <div><b>${S.min_speed}–${S.max_speed}</b><span>speed range</span></div>
          <div><b>±${S.std_speed}</b><span>speed std-dev</span></div>
        </div>
        <table><tr><th></th><th>Rush hour</th><th>Off-peak</th></tr>
          <tr><td>Avg speed</td><td class="jam">${P.peak_speed} km/h</td><td class="flow">${P.off_speed} km/h</td></tr>
          <tr><td>Avg volume</td><td>${P.peak_volume}</td><td>${P.off_volume}</td></tr>
          <tr><td>Readings</td><td>${P.peak_readings}</td><td>${P.off_readings}</td></tr></table>
        <ul>
          <li>Rush hour (07–09, 17–20) cuts speed by <b>${drop}%</b> while volume rises <b>${(P.peak_volume / P.off_volume).toFixed(1)}×</b>.</li>
          <li>Speed and volume are strongly negatively correlated: <b>r = ${A.corr}</b>.</li>
          <li>Congestion split: <span class="jam">High ${L.High} (${pct('High')}%)</span> · <span class="slow">Moderate ${L.Moderate} (${pct('Moderate')}%)</span> · <span class="flow">Low ${L.Low} (${pct('Low')}%)</span>.</li>
        </ul>
      </div>
      <div class="pane" data-pane="hr"><table><tr><th>Hour</th><th>km/h</th><th>Vehicles</th><th></th></tr>${hourlyRows}</table></div>
      <div class="pane" data-pane="sn"><table><tr><th>#</th><th>Sensor</th><th>Rt</th><th>km/h</th><th>Veh</th><th>H/M/L</th></tr>${sensorRows}</table><p class="fine">Ranked slowest first. H/M/L = readings in High / Moderate / Low congestion.</p></div>
      <div class="pane" data-pane="rt"><table><tr><th>Route</th><th>Segs</th><th>km</th><th>Mean km/h</th><th>Est. min</th></tr>${routeRows}</table><p class="fine">Estimated time = Σ (segment distance ÷ avg speed) × 60, computed in Spark.</p></div>
      <p class="try">Hover the donut and bars · orbit comes free</p>`,
  },
  pulse: {
    html: `
      <div class="kicker">03 // TIME SERIES</div>
      <h2>The city has a <em>pulse</em></h2>
      <p>Average speed collapses twice a day: from <b>${P.off_speed.toFixed(0)} km/h</b> off-peak to <b>${P.peak_speed.toFixed(0)} km/h</b> in the 07–09 and 17–20 windows, a <b>${drop}%</b> loss. The car rides the real hourly averages from <code>groupBy("hour")</code>.</p>
      <p class="try"><b>Try:</b> hover the ribbon for any hour's numbers · click to send the car there · W/S or scroll to drive · Space pauses</p>
      <div class="chips"><span>groupBy · hour</span><span>avg(speed_kmh)</span><span>24 points</span></div>`,
  },
  heat: {
    html: `
      <div class="kicker">04 // HEATMAP · ADVANCED</div>
      <h2>Drive through the <em>heatmap</em></h2>
      <p>Each wall panel is one sensor's average speed in one hour: 24 hours down the tunnel, 12 sensors around the arch, slowest on the right. Red-pink = jam, cyan = free flow. The jam bands hit every sensor at once; <b>${slow[0].id} ${slow[0].road}</b> stays the darkest wall all day.</p>
      <p class="try"><b>Try:</b> hover any panel (its sensor and hour light up) · click to inspect a sensor · W/S, scroll or drag to drive · drag the hour slider · Space pauses</p>
      <div class="chips"><span>12 × 24 = 288 cells</span><span>groupBy(sensor, hour)</span></div>`,
  },
  race: {
    html: `
      <div class="kicker">05 // GEOSPATIAL · ROUTES</div>
      <h2>Which route <em>wins?</em></h2>
      <p>Sensors sit at their real coordinates; tower height is traffic volume and colour is speed <b>at the hour on the slider</b>. Each car races at its route's estimated travel time. <b>${routes[0][0]}</b> is the longest route but wins.</p>
      <div id="board"></div>
      <div class="toggles"><button data-route="R1" class="on r1">R1</button><button data-route="R2" class="on r2">R2</button><button data-route="R3" class="on r3">R3</button><button data-restart>↻ RESTART</button></div>
      <p class="try"><b>Try:</b> scrub the hour to watch every sensor turn red at rush hour · hover / click a sensor · toggle routes</p>
      <div class="chips"><span>Σ distance ÷ speed × 60</span><span>R3 ${r('R3')} · R1 ${r('R1')} · R2 ${r('R2')} min</span></div>`,
  },
  insights: {
    wide: true,
    html: `
      <div class="kicker">06 // INSIGHTS &amp; RECOMMENDATIONS</div>
      <div class="cards">
        <div><i>01</i><h3>Rush hours halve the speed</h3><p>Speed drops <b>${drop}%</b> (${P.off_speed.toFixed(0)} → ${P.peak_speed.toFixed(0)} km/h) as volume rises ${(P.peak_volume / P.off_volume).toFixed(1)}× (r = ${A.corr}); ${L.High} readings (${pct('High')}%) hit High congestion. <b>Do:</b> stagger work hours, time signals for the 07–09 and 17–20 peaks.</p></div>
        <div><i>02</i><h3>${slow[0].road} is the chokepoint</h3><p><b>${slow[0].id}</b> averages ${slow[0].avg.toFixed(1)} km/h with ${slow[0].high} High-congestion readings, then ${slow[1].road} and ${slow[2].road}. <b>Do:</b> prioritise signal timing and lane capacity there first.</p></div>
        <div><i>03</i><h3>Route 3 beats the map</h3><p>Longest route, fastest trip: <b>${r('R3')} min</b> vs ${r('R1')} and ${r('R2')}. <b>Do:</b> a congestion-aware router should divert traffic to R3 at peak hours.</p></div>
      </div>
      <p class="fine">Dataset is synthetic: 12 fictional sensors with illustrative coordinates, 576 readings over one day, generated for teaching. It is not live Google Maps data, and one day can't show weekly patterns.</p>`,
  },
};
