import { DATA } from './data.js';
import { mean } from './common.js';

const peakH = h => (h >= 7 && h <= 9) || (h >= 17 && h <= 20);
const peak = mean(DATA.hourly.filter((_, h) => peakH(h)));
const off = mean(DATA.hourly.filter((_, h) => !peakH(h)));
const drop = Math.round((1 - peak / off) * 100);
const slow = [...DATA.sensors].sort((a, b) => a.avg - b.avg);
const routes = Object.entries(DATA.routes).sort((a, b) => a[1].time - b[1].time);
const r = id => DATA.routes[id].time.toFixed(1);

export const INFO = {
  spark: {
    html: `
      <div class="kicker">01 // SPARK PIPELINE</div>
      <h2>576 readings, <em>four steps</em></h2>
      <p>Everything on this site comes out of one PySpark job on a local[*] session. Transformations build the plan lazily; actions like <code>count()</code>, <code>show()</code> and <code>toPandas()</code> trigger it.</p>
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
      <div class="chips"><span>Spark 4.0.4</span><span>DataFrame API</span><span>lazy evaluation</span></div>`,
  },
  pulse: {
    html: `
      <div class="kicker">02 // TIME SERIES</div>
      <h2>The city has a <em>pulse</em></h2>
      <p>Average speed collapses twice a day: from about <b>${off.toFixed(0)} km/h</b> to <b>${peak.toFixed(0)} km/h</b> in the 07–09 and 17–20 windows, a <b>${drop}%</b> loss. The car is riding the real hourly averages from the <code>groupBy("hour")</code> result, so it slows inside the magenta rush-hour slabs.</p>
      <div class="chips"><span>groupBy · hour</span><span>avg(speed_kmh)</span><span>3D time series</span></div>`,
  },
  heat: {
    html: `
      <div class="kicker">03 // HEATMAP · ADVANCED</div>
      <h2>Drive through the <em>heatmap</em></h2>
      <p>Each wall panel is one sensor's average speed in one hour: 24 hours down the tunnel, 12 sensors around the arch, slowest on the right. The red-pink bands are jams, and they hit every corridor at the same time. <b>${slow[0].id} ${slow[0].road}</b> stays the darkest wall all day.</p>
      <div class="chips"><span>12 × 24 = 288 cells</span><span>red = jam · cyan = free flow</span></div>`,
  },
  race: {
    html: `
      <div class="kicker">04 // GEOSPATIAL · ROUTES</div>
      <h2>Which route <em>wins?</em></h2>
      <p>Three routes, drawn from the sensors' real coordinates. Each car races at its route's estimated travel time (distance ÷ observed speed, summed over segments). <b>${routes[0][0]}</b> is not the shortest, but its roads keep moving.</p>
      <div id="board"></div>
      <div class="chips"><span>distance ÷ speed × 60</span><span>R3 ${r('R3')} · R1 ${r('R1')} · R2 ${r('R2')} min</span></div>`,
  },
  insights: {
    wide: true,
    html: `
      <div class="kicker">05 // INSIGHTS &amp; RECOMMENDATIONS</div>
      <div class="cards">
        <div><i>01</i><h3>Rush hours halve the speed</h3><p>Speed drops <b>${drop}%</b> (${off.toFixed(0)} → ${peak.toFixed(0)} km/h) while volume more than doubles. <b>Do:</b> stagger work hours and time signals for the 07–09 and 17–20 peaks.</p></div>
        <div><i>02</i><h3>${slow[0].road} is the chokepoint</h3><p><b>${slow[0].id}</b> averages ${slow[0].avg.toFixed(1)} km/h, then ${slow[1].road} and ${slow[2].road}. <b>Do:</b> prioritise signal timing and lane capacity there first.</p></div>
        <div><i>03</i><h3>Route 3 beats the map</h3><p>It's the longest route but the fastest: <b>${r('R3')} min</b> vs ${r('R1')} and ${r('R2')}. <b>Do:</b> a congestion-aware router should divert traffic to R3 at peak hours.</p></div>
      </div>
      <p class="fine">Dataset is synthetic: 12 fictional sensors with illustrative coordinates, 576 readings over one day, generated for teaching. It is not live Google Maps data, and one day can't show weekly patterns.</p>`,
  },
};
