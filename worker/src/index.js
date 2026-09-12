const GOLEMIO_URL = 'https://api.golemio.cz/v2/pid/departureboards';
const inFlight = new Map();
const json = (value, status, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

function cors(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGIN || '').split(',').map(value => value.trim()).filter(Boolean);
  if (!origin) return {};
  if (allowed.includes(origin) || allowed.includes('*')) return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
  return null;
}

function isoTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numericDelay(delay) {
  const seconds = Number(delay?.seconds);
  if (delay?.seconds !== null && delay?.seconds !== undefined && Number.isFinite(seconds)) return seconds;
  const minutes = Number(delay?.minutes);
  if (delay?.minutes !== null && delay?.minutes !== undefined && Number.isFinite(minutes)) return minutes * 60;
  return null;
}

function optionalBoolean(value) {
  return typeof value === 'boolean' ? value : null;
}

export function normalize(payload, now = Date.now()) {
  const rows = payload.departures || payload.data?.departures || [];
  return rows.map(item => {
    const predictedTime = isoTimestamp(item.departure_timestamp?.predicted);
    const scheduledTime = isoTimestamp(item.departure_timestamp?.scheduled);
    const departureTime = predictedTime || scheduledTime;
    return {
      route: String(item.route?.short_name || ''),
      destination: item.trip?.headsign || '',
      minutes: departureTime ? Math.max(0, Math.round((new Date(departureTime).getTime() - now) / 60000)) : null,
      scheduledTime,
      predictedTime,
      realtime: Boolean(predictedTime && item.delay?.is_available),
      delaySeconds: numericDelay(item.delay),
      platform: item.stop?.platform_code || null,
      wheelchairAccessible: optionalBoolean(item.trip?.is_wheelchair_accessible),
      airConditioned: optionalBoolean(item.trip?.is_air_conditioned),
    };
  }).filter(item => item.route || item.destination);
}

export function mergeDepartures(groups) {
  const seen=new Set();return groups.flat().sort((a,b)=>(new Date(a.predictedTime||a.scheduledTime||Infinity))-(new Date(b.predictedTime||b.scheduledTime||Infinity))).filter(row=>{const key=[row.route,row.destination,row.predictedTime||row.scheduledTime,row.platform].join('|');if(seen.has(key))return false;seen.add(key);return true});
}
async function upstream(stop, env, includeMetro = false) {
  if (!env.GOLEMIO_API_KEY) return json({ error: 'Worker nemá nastavený GOLEMIO_API_KEY.' }, 503);
  const url = new URL(GOLEMIO_URL);
  url.searchParams.set('ids', stop);
  url.searchParams.set('limit', '20');
  url.searchParams.set('minutesBefore', '0');
  url.searchParams.set('minutesAfter', '180');
  url.searchParams.set('includeMetroTrains', String(includeMetro));
  url.searchParams.set('airCondition', 'true');
  const response = await fetch(url, { headers: { 'X-Access-Token': env.GOLEMIO_API_KEY, Accept: 'application/json' } });
  if (!response.ok) return json({ error: 'Golemio request failed', upstreamStatus: response.status }, 502);
  const payload = await response.json();
  return json({ stop, departures: normalize(payload), updatedAt: new Date().toISOString() }, 200);
}
async function upstreamMany(stops,env){const responses=await Promise.all(stops.map(stop=>upstream(stop,env,true)));const failed=responses.find(r=>!r.ok);if(failed)return failed;const payloads=await Promise.all(responses.map(r=>r.json()));return json({stops,departures:mergeDepartures(payloads.map(p=>p.departures)),updatedAt:new Date().toISOString()},200)}

export default {
  async fetch(request, env, ctx) {
    const headers = cors(request, env);
    if (headers === null) return json({ error: 'Origin is not allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, headers);
    const url = new URL(request.url);
    if (url.pathname === '/health' && url.search === '') return json({ ok: true }, 200, headers);
    if (url.pathname !== '/departures') return json({ error: 'Not found' }, 404, headers);
    const known = new Set(['stop','stops']);
    for (const key of url.searchParams.keys()) if (!known.has(key)) return json({ error: `Unknown parameter: ${key}` }, 400, headers);
    if(url.searchParams.has('stop')&&url.searchParams.has('stops'))return json({error:'Use stop or stops, not both'},400,headers);
    const raw=url.searchParams.get('stops')||url.searchParams.get('stop')||'';const stops=[...new Set(raw.split(',').filter(Boolean))].sort();
    if(!stops.length||stops.length>4||stops.some(stop=>stop.length>64||!/^[A-Za-z0-9_.:-]+$/.test(stop)))return json({error:'Invalid stop(s)'},400,headers);
    const stop=stops.join(',');
    const ttl = Math.max(5, Math.min(300, Number(env.CACHE_TTL_SECONDS) || 20));
    const cacheKey = new Request(`${url.origin}/departures?${stops.length>1?'stops':'stop'}=${encodeURIComponent(stop)}`, { method: 'GET' });
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      const out = new Response(cached.body, cached);
      Object.entries(headers).forEach(([key, value]) => out.headers.set(key, value));
      out.headers.set('X-PID-AR-Cache', 'HIT');
      return out;
    }
    let promise = inFlight.get(stop);
    if (!promise) {
      promise = (stops.length===1?upstream(stops[0],env):upstreamMany(stops,env)).finally(() => inFlight.delete(stop));
      inFlight.set(stop, promise);
    }
    const result = await promise;
    const out = new Response(result.body, result);
    Object.entries(headers).forEach(([key, value]) => out.headers.set(key, value));
    out.headers.set('Cache-Control', `public, max-age=${ttl}`);
    out.headers.set('X-PID-AR-Cache', 'MISS');
    if (result.ok) ctx.waitUntil(caches.default.put(cacheKey, out.clone()));
    return out;
  },
};
