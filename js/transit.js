export const TRANSIT_ICONS = Object.freeze({
  0: 'travel-tram.svg', 1: 'travel-metro.svg', 2: 'travel-train.svg',
  3: 'travel-bus.svg', 4: 'travel-ferry.svg', 7: 'travel-cableway.svg',
  11: 'travel-trolley.svg',
});

export const METRO_LINE_COLORS = Object.freeze({ A:'#02A848', B:'#FFBD0E', C:'#FF0917', D:'#002177' });
export const METRO_LINE_ORDER = Object.freeze(['A', 'B', 'C', 'D']);
const NIGHT_CAPABLE_MODES = new Set([0, 3, 11]);

// GTFS has no standard night-service field. PID's official number ranges are
// kept here and constrained by mode and an exact numeric short name.
export function isNightRoute(route = {}) {
  for (const key of ['isNight', 'is_night', 'night_service']) {
    const value = route[key];
    if (value === true || String(value).toLowerCase() === 'true' || String(value) === '1') return NIGHT_CAPABLE_MODES.has(Number(route.route_type));
    if (value === false || String(value).toLowerCase() === 'false' || String(value) === '0') return false;
  }
  const mode = Number(route.route_type);
  if (!NIGHT_CAPABLE_MODES.has(mode)) return false;
  const name = String(route.route_short_name ?? route.route ?? '').trim();
  if (!/^\d+$/.test(name)) return false;
  const number = Number(name);
  return mode === 0 ? number >= 91 && number <= 99 :
    (number >= 901 && number <= 917) || (number >= 951 && number <= 960);
}

export function transitIconNames(modes = [], hasNightService = false) {
  const uniqueModes = [...new Set(modes.map(Number))];
  const icons = uniqueModes.map(mode => TRANSIT_ICONS[mode]).filter(Boolean);
  if (hasNightService && uniqueModes.some(mode => NIGHT_CAPABLE_MODES.has(mode))) icons.push('travel-night.svg');
  return icons;
}

export function departureHasNightIndicator(departure = {}) {
  return departure.isNight === true || isNightRoute({ route_short_name:departure.route, route_type:departure.routeType });
}
