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
    };
  }).filter(item => item.route || item.destination);
}

async function upstream(stop, env) {
  if (!env.GOLEMIO_API_KEY) return json({ error: 'Worker nemá nastavený GOLEMIO_API_KEY.' }, 503);
  const url = new URL(GOLEMIO_URL);
  url.searchParams.set('ids', stop);
  url.searchParams.set('limit', '20');
  url.searchParams.set('minutesBefore', '0');
  url.searchParams.set('minutesAfter', '180');
  url.searchParams.set('includeMetroTrains', 'false');
  const response = await fetch(url, { headers: { 'X-Access-Token': env.GOLEMIO_API_KEY, Accept: 'application/json' } });
  if (!response.ok) return json({ error: 'Golemio request failed', upstreamStatus: response.status }, 502);
  const payload = await response.json();
  return json({ stop, departures: normalize(payload), updatedAt: new Date().toISOString() }, 200);
}

export default {
  async fetch(request, env, ctx) {
    const headers = cors(request, env);
    if (headers === null) return json({ error: 'Origin is not allowed' }, 403);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, headers);
    const url = new URL(request.url);
    if (url.pathname === '/health' && url.search === '') return json({ ok: true }, 200, headers);
    if (url.pathname !== '/departures') return json({ error: 'Not found' }, 404, headers);
    const known = new Set(['stop']);
    for (const key of url.searchParams.keys()) if (!known.has(key)) return json({ error: `Unknown parameter: ${key}` }, 400, headers);
    const stop = url.searchParams.get('stop');
    if (!stop || stop.length > 64 || !/^[A-Za-z0-9_.:-]+$/.test(stop)) return json({ error: 'Invalid stop' }, 400, headers);
    const ttl = Math.max(5, Math.min(300, Number(env.CACHE_TTL_SECONDS) || 20));
    const cacheKey = new Request(`${url.origin}/departures?stop=${encodeURIComponent(stop)}`, { method: 'GET' });
    const cached = await caches.default.match(cacheKey);
    if (cached) {
      const out = new Response(cached.body, cached);
      Object.entries(headers).forEach(([key, value]) => out.headers.set(key, value));
      out.headers.set('X-PID-AR-Cache', 'HIT');
      return out;
    }
    let promise = inFlight.get(stop);
    if (!promise) {
      promise = upstream(stop, env).finally(() => inFlight.delete(stop));
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
