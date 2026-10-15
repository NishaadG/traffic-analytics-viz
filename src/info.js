import { DATA } from './data.js';
import { A } from './analysis.js';
import { speedCls as cls } from './common.js';
import { CODE } from './stations/race.js';

const S = A.summary, P = A.peak, L = A.levels, PR = A.periods;
const drop = Math.round((1 - P.peak_speed / P.off_speed) * 100);
const slow = A.areas;                                   // already ranked by speed loss, worst first
const busy = slow.filter(a => a.busy), calm = slow.filter(a => !a.busy);
const roads = [...A.roads].sort((a, b) => b.loss - a.loss);
const road = id => A.roads.find(r => r.id === id);
const fmt = n => n.toLocaleString('en-US');
const pct = k => (L[k] / S.readings * 100).toFixed(0);
const avgOf = (xs, k) => xs.reduce((s, x) => s + x[k], 0) / xs.length;

const hourlyRows = A.hourly.map(h => `<tr><td>${String(h.h).padStart(2, '0')}:00</td><td class="${cls(h.speed)}">${h.speed.toFixed(1)}</td><td>${h.tt.toFixed(1)}</td><td>${h.volume.toFixed(0)}</td>
  <td><div class="mb"><i class="${cls(h.speed)}" style="width:${(h.speed / 40 * 100).toFixed(0)}%"></i></div></td></tr>`).join('');
const areaRows = slow.map((s, i) => `<tr><td>${i + 1}</td><td><b>${s.id}</b> ${s.name}</td><td class="${cls(s.avg)}">${s.avg.toFixed(1)}</td><td>${s.tt.toFixed(1)}</td><td><b>${s.loss.toFixed(1)}</b></td><td>${s.vol.toFixed(0)}</td></tr>`).join('');
const roadRows = roads.map(r => `<tr><td><b class="rt ${r.id.toLowerCase()}">${r.id}</b><br><small>${r.desc}</small></td><td>${fmt(r.n)}</td><td class="${cls(r.speed)}">${r.speed.toFixed(1)}</td><td><b>${r.loss.toFixed(1)}</b></td><td>${r.tt.toFixed(1)}</td></tr>`).join('');
const raceOrder = [...A.roads].sort((a, b) => a.tt - b.tt);

export const INFO = {
  spark: {
    cls: 'tall',
    html: `
      <div class="kicker">01 // SPARK PIPELINE</div>
      <h2>100,000 records, <em>four steps</em></h2>
      <p>One PySpark job (Spark 4.0.4, <code>local[*]</code>). Transformations build the plan lazily; actions like <code>count()</code>, <code>show()</code> and <code>toPandas()</code> trigger it.</p>
      <pre><span class="c"># clean + enrich</span>
clean = (raw.dropDuplicates()
  .filter(F.col(<span class="s">"observed_speed_kmh"</span>) &gt; 0) ...
  .withColumn(<span class="s">"peak_period"</span>, F.when(hour.between(7,9), ...))
  .withColumn(<span class="s">"speed_loss_pct"</span>, (1 - obs/free_flow)*100)
  .withColumn(<span class="s">"congestion_level"</span>, F.when(ratio &gt;= .8, <span class="s">"Low"</span>)...))
<span class="c"># aggregate + join</span>
clean.groupBy(<span class="s">"area"</span>).agg(F.avg(<span class="s">"speed_loss_pct"</span>), ...)
clean.groupBy(<span class="s">"hour"</span>).agg(F.avg(<span class="s">"observed_speed_kmh"</span>))
clean.join(road_meta_df, on=<span class="s">"road_type"</span>, how=<span class="s">"left"</span>)</pre>
      <div class="mini"><b>Schema (${A.schema.length} columns)</b>${A.schema.map(([n, t]) => `<span><code>${n}</code> ${t}</span>`).join('')}</div>
      <div class="chips"><span>rows ${fmt(A.clean.before)} → ${fmt(A.clean.after)} after cleaning</span><span>${A.clean.dups} duplicates · ${A.clean.invalid} invalid · ${A.clean.nulls} nulls</span></div>`,
  },
  analysis: {
    cls: 'tall',
    html: `
      <div class="kicker">02 // ANALYSIS · SPARK OUTPUT</div>
      <h2>What the data <em>says</em></h2>
      <div class="tabs"><button data-tab="sum" class="on">SUMMARY</button><button data-tab="hr">HOURLY</button><button data-tab="sn">AREAS</button><button data-tab="rt">ROADS</button></div>
      <div class="pane on" data-pane="sum">
        <div class="stats">
          <div><b>${S.avg_speed}</b><span>avg speed km/h</span></div>
          <div><b>${S.avg_ff}</b><span>avg free-flow km/h</span></div>
          <div><b>${S.avg_tt}</b><span>avg trip min</span></div>
          <div><b>${S.avg_loss}%</b><span>avg speed loss</span></div>
        </div>
        <table><tr><th></th><th>Morning</th><th>Evening</th><th>Off-peak</th></tr>
          <tr><td>Avg speed</td><td class="jam">${PR['Morning peak'].speed}</td><td class="jam">${PR['Evening peak'].speed}</td><td class="flow">${PR['Off-peak'].speed}</td></tr>
          <tr><td>Avg trip min</td><td>${PR['Morning peak'].tt}</td><td>${PR['Evening peak'].tt}</td><td>${PR['Off-peak'].tt}</td></tr>
          <tr><td>Records</td><td>${fmt(PR['Morning peak'].n)}</td><td>${fmt(PR['Evening peak'].n)}</td><td>${fmt(PR['Off-peak'].n)}</td></tr></table>
        <ul>
          <li>Peak hours (07–09, 16–19) cut speed by <b>${drop}%</b> and stretch trips <b>${(P.peak_tt / P.off_tt).toFixed(1)}×</b>, while volume rises ${(P.peak_volume / P.off_volume).toFixed(1)}×.</li>
          <li>Volume and speed are only weakly correlated (<b>r = ${A.corr}</b>): road type and area explain far more of the slowdown.</li>
          <li>Congestion split: <span class="jam">High ${fmt(L.High)} (${pct('High')}%)</span> · <span class="slow">Moderate ${fmt(L.Moderate)} (${pct('Moderate')}%)</span> · <span class="flow">Low ${fmt(L.Low)} (${pct('Low')}%)</span>.</li>
        </ul>
      </div>
      <div class="pane" data-pane="hr"><table><tr><th>Hour</th><th>km/h</th><th>Trip min</th><th>Volume</th><th></th></tr>${hourlyRows}</table></div>
      <div class="pane" data-pane="sn"><table><tr><th>#</th><th>Area</th><th>km/h</th><th>Trip min</th><th>Loss %</th><th>Vol</th></tr>${areaRows}</table><p class="fine">Ranked by average speed loss vs free-flow, worst first (<code>groupBy("area")</code>).</p></div>
      <div class="pane" data-pane="rt"><table><tr><th>Road type</th><th>Records</th><th>km/h</th><th>Loss %</th><th>Trip min</th></tr>${roadRows}</table><p class="fine">Enriched with a road-metadata join on <code>road_type</code>. Trip min = avg(travel_time_min).</p></div>
      <p class="try">Hover the donut and bars · orbit comes free</p>`,
  },
  pulse: {
    html: `
      <div class="kicker">03 // TIME SERIES</div>
      <h2>The city has a <em>pulse</em></h2>
      <p>Average speed collapses twice a day: from <b>${P.off_speed.toFixed(0)} km/h</b> off-peak to <b>${P.peak_speed.toFixed(0)} km/h</b> in the 07–09 and 16–19 windows, a <b>${drop}%</b> loss. The car rides the real hourly averages from <code>groupBy("hour")</code>.</p>
      <p class="try"><b>Try:</b> hover the ribbon for any hour's numbers · click to send the car there · W/S or scroll to drive · Space pauses</p>
      <div class="chips"><span>groupBy · hour</span><span>avg(observed_speed_kmh)</span><span>24 points · ${fmt(S.readings)} records</span></div>`,
  },
  heat: {
    html: `
      <div class="kicker">04 // HEATMAP · ADVANCED</div>
      <h2>Drive through the <em>heatmap</em></h2>
      <p>Each wall panel is one area's average speed in one hour across 2025: 24 hours down the tunnel, 8 areas around the arch, slowest on the right. Red-pink = jam, cyan = free flow. The peak bands hit every area at once, and the four busy districts (${busy.map(a => a.name).join(', ')}) stay the darkest walls all day.</p>
      <p class="try"><b>Try:</b> hover any panel (its area and hour light up) · click to inspect an area · W/S, scroll or drag to drive · drag the hour slider · Space pauses</p>
      <div class="chips"><span>8 × 24 = 192 cells</span><span>groupBy(area, hour)</span></div>`,
  },
  race: {
    html: `
      <div class="kicker">05 // ROAD TYPES · JOIN</div>
      <h2>Which road type <em>wins?</em></h2>
      <p>Each car finishes in its road type's average trip time. Area beacons are placed on an illustrative map (the data has no coordinates): height is traffic volume and colour is speed <b>at the hour on the slider</b>. <b>Highways</b> win easily; <b>local roads</b> take ${(road('Local').tt / road('Highway').tt).toFixed(0)}× longer.</p>
      <div id="board"></div>
      <div class="toggles">${['Highway', 'Arterial', 'Collector', 'Local'].map(id => `<button data-route="${id}" class="on ${id.toLowerCase()}">${CODE[id]}</button>`).join('')}<button data-restart>↻ RESTART</button></div>
      <p class="try"><b>Try:</b> scrub the hour to watch every area slow down at peak hours · hover / click an area · toggle road types</p>
      <div class="chips"><span>avg(travel_time_min)</span><span>${raceOrder.map(r => `${CODE[r.id]} ${r.tt.toFixed(1)}`).join(' · ')} min</span></div>`,
  },
  insights: {
    wide: true,
    html: `
      <div class="kicker">06 // INSIGHTS &amp; RECOMMENDATIONS</div>
      <div class="cards">
        <div><i>01</i><h3>Peak hours cost ${drop}% of speed</h3><p>Speed drops from ${P.off_speed.toFixed(0)} to ${P.peak_speed.toFixed(0)} km/h and the average trip goes from ${P.off_tt.toFixed(0)} to ${P.peak_tt.toFixed(0)} min; ${fmt(L.High)} records (${pct('High')}%) are High congestion. <b>Do:</b> stagger work hours, time signals for the 07–09 and 16–19 peaks.</p></div>
        <div><i>02</i><h3>${slow[0].name} is the hotspot</h3><p>The four busy districts lose about <b>${avgOf(busy, 'loss').toFixed(0)}%</b> of free-flow speed against ${avgOf(calm, 'loss').toFixed(0)}% elsewhere, with ${slow[0].name} worst at ${slow[0].loss.toFixed(1)}%. <b>Do:</b> prioritise signal timing, transit lanes and parking control in the central districts.</p></div>
        <div><i>03</i><h3>Local roads lose the most</h3><p>${roads[0].id} roads lose <b>${roads[0].loss.toFixed(1)}%</b> of free-flow speed (${roads[0].speed} km/h) against ${road('Highway').loss.toFixed(1)}% on highways. <b>Do:</b> a congestion-aware router should keep through-traffic on highways and arterials at peak hours.</p></div>
      </div>
      <p class="fine">Dataset is synthetic: ${fmt(S.readings)} records across 8 areas and 4 road types over 2025, generated in the notebook with a fixed seed for teaching. It is not live Google Maps data, and the Zenodo link is a reference only.</p>`,
  },
};
